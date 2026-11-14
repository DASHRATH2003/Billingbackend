const mongoose = require('mongoose')
const Counter = require('./Counter')

const AGE_GROUPS = ['male', 'female', 'childM', 'childF', 'infant']
const FORMATS = ['Single', 'Multiple', 'Heading']

const rangeSchema = new mongoose.Schema(
  { text: { type: String, default: '' }, low: { type: String, default: '' }, high: { type: String, default: '' } },
  { _id: false },
)

const testSchema = new mongoose.Schema(
  {
    testId: { type: Number, index: true }, // shown as "Test ID"
    name: { type: String, required: true, trim: true, unique: true, index: true },
    code: { type: String, default: '', trim: true },
    shortCode: { type: String, default: '', trim: true },

    wing: { type: String, default: 'PATHOLOGY', trim: true },
    department: { type: String, default: '', trim: true },
    unit: { type: String, default: '', trim: true },
    format: { type: String, enum: FORMATS, default: 'Single' },
    underTest: { type: String, default: '', trim: true }, // parent test name (e.g. "Hb" under "CBC")

    normalRanges: { type: [String], default: () => ['', '', '', '', ''] }, // Normal Range 1–5 (text lines)
    ageBased: { type: Boolean, default: false }, // "Set Age Based Normal Range"
    ageRanges: {
      male: { type: rangeSchema, default: () => ({}) },
      female: { type: rangeSchema, default: () => ({}) },
      childM: { type: rangeSchema, default: () => ({}) },
      childF: { type: rangeSchema, default: () => ({}) },
      infant: { type: rangeSchema, default: () => ({}) },
    },
    normalLow: { type: String, default: '' },
    normalHigh: { type: String, default: '' },
    defaultResult: { type: String, default: '' },
    method: { type: String, default: '' },
    sample: { type: String, default: '' },
    vial: { type: String, default: '' },
    reportingDays: { type: String, default: '' },

    amount: { type: Number, default: 0 }, // Rate To Patient
    discountPct: { type: Number, default: 0 },
    offerRate: { type: Number, default: 0 },

    interpretation: { type: String, default: '' }, // rich text (HTML) printed with the result

    showMethod: { type: Boolean, default: false },
    showComment: { type: Boolean, default: false },
    testNameBold: { type: Boolean, default: false },
    commentAsResult: { type: Boolean, default: false },
    resultBold: { type: Boolean, default: false },
    antibiotic: { type: Boolean, default: false },
    paragraphResult: { type: Boolean, default: false },
    pageBreak: { type: Boolean, default: false },
    showShortCode: { type: Boolean, default: false },

    createdBy: { id: String, name: String },
    updatedBy: { id: String, name: String },
  },
  { timestamps: true },
)

testSchema.statics.AGE_GROUPS = AGE_GROUPS
testSchema.statics.FORMATS = FORMATS

const str = (v, max = 500) => String(v ?? '').trim().slice(0, max)
const num = (v) => Math.max(0, Number(v) || 0)
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1'

/** Whitelist + clean the fields coming from the Test Entry form. */
const cleanEntry = (input = {}) => {
  const out = {
    name: str(input.name, 200),
    code: str(input.code, 50),
    shortCode: str(input.shortCode, 50),
    wing: str(input.wing, 60) || 'PATHOLOGY',
    department: str(input.department, 80),
    unit: str(input.unit, 40),
    format: FORMATS.includes(input.format) ? input.format : 'Single',
    underTest: str(input.underTest, 200),
    normalRanges: Array.from({ length: 5 }, (_, i) => str(input.normalRanges?.[i], 300)),
    ageBased: bool(input.ageBased),
    ageRanges: Object.fromEntries(
      AGE_GROUPS.map((g) => [g, { text: str(input.ageRanges?.[g]?.text, 200), low: str(input.ageRanges?.[g]?.low, 20), high: str(input.ageRanges?.[g]?.high, 20) }]),
    ),
    normalLow: str(input.normalLow, 20),
    normalHigh: str(input.normalHigh, 20),
    defaultResult: str(input.defaultResult, 300),
    method: str(input.method, 200),
    sample: str(input.sample, 100),
    vial: str(input.vial, 60),
    reportingDays: str(input.reportingDays, 40),
    amount: num(input.amount),
    discountPct: Math.min(100, num(input.discountPct)),
    offerRate: num(input.offerRate),
    interpretation: String(input.interpretation ?? '').slice(0, 20000),
  }
  for (const flag of ['showMethod', 'showComment', 'testNameBold', 'commentAsResult', 'resultBold', 'antibiotic', 'paragraphResult', 'pageBreak', 'showShortCode']) {
    out[flag] = bool(input[flag])
  }
  if (out.underTest === out.name) out.underTest = ''
  if (!out.offerRate && out.discountPct && out.amount) out.offerRate = Math.round(out.amount * (1 - out.discountPct / 100) * 100) / 100
  return out
}

testSchema.statics.listTests = async function listTests() {
  return this.find({}).sort({ name: 1 }).lean()
}

testSchema.statics.createEntry = async function createEntry(input, by) {
  const data = cleanEntry(input)
  if (!data.name) throw Object.assign(new Error('Test name is required'), { status: 400 })
  if (await this.exists({ name: data.name })) throw Object.assign(new Error('A test with this name already exists'), { status: 400 })
  return this.create({ ...data, testId: await Counter.next('test'), createdBy: by, updatedBy: by })
}

testSchema.statics.updateEntry = async function updateEntry(id, input, by) {
  const data = cleanEntry(input)
  if (!data.name) throw Object.assign(new Error('Test name is required'), { status: 400 })
  const clash = await this.findOne({ name: data.name, _id: { $ne: id } }).lean()
  if (clash) throw Object.assign(new Error('Another test already has this name'), { status: 400 })
  const current = await this.findById(id)
  if (!current) return null
  Object.assign(current, data, { updatedBy: by })
  if (!current.testId) current.testId = await Counter.next('test')
  await current.save()
  return current
}

/** Used by the old Test Prices screen and Create Bill sync: only name + price. */
testSchema.statics.upsertTests = async function upsertTests(tests = []) {
  const clean = Array.isArray(tests)
    ? tests
        .map((t) => ({
          name: String(t?.name || '').trim(),
          amount: Math.max(0, Number(t?.amount) || 0),
        }))
        .filter((t) => t.name)
    : []

  if (!clean.length) {
    return []
  }

  const ops = clean.map((t) => ({
    updateOne: {
      filter: { name: t.name },
      update: { $set: t },
      upsert: true,
    },
  }))

  await this.bulkWrite(ops, { ordered: false })
  return this.listTests()
}

testSchema.statics.deleteTest = async function deleteTest(name) {
  const cleanName = String(name || '').trim()
  if (!cleanName) {
    return { deletedCount: 0, tests: await this.listTests() }
  }

  const result = await this.deleteOne({ name: cleanName })
  return {
    deletedCount: result.deletedCount || 0,
    tests: await this.listTests(),
  }
}

module.exports = mongoose.model('Test', testSchema)
