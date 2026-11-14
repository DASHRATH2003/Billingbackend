const mongoose = require('mongoose')
const Counter = require('./Counter')

const patientSchema = new mongoose.Schema(
  {
    patientId: { type: String, required: true, unique: true, trim: true }, // e.g. P000123
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true, index: true }, // lower-case name used for matching
    age: { type: String, default: '' },
    sex: { type: String, default: '' },
    mobile: { type: String, default: '', trim: true, index: true },
    address: { type: String, default: '', trim: true },
    refBy: { type: String, default: '', trim: true }, // last referring doctor
    notes: { type: String, default: '', trim: true },
    createdBy: { id: String, name: String },
  },
  { timestamps: true },
)

patientSchema.index({ mobile: 1, nameKey: 1 })

const nameKeyOf = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
const cleanMobile = (mobile) => String(mobile || '').replace(/[^\d+]/g, '')

patientSchema.statics.nameKeyOf = nameKeyOf
patientSchema.statics.cleanMobile = cleanMobile

patientSchema.statics.nextPatientId = async function nextPatientId() {
  const n = await Counter.next('patient')
  return `P${String(n).padStart(6, '0')}`
}

const pick = (input = {}) => {
  const out = {}
  for (const key of ['name', 'age', 'sex', 'address', 'refBy', 'notes']) {
    if (input[key] !== undefined) out[key] = String(input[key] ?? '').trim()
  }
  if (input.mobile !== undefined) out.mobile = cleanMobile(input.mobile)
  if (out.name !== undefined) out.nameKey = nameKeyOf(out.name)
  return out
}

patientSchema.statics.createPatient = async function createPatient(input, by) {
  const data = pick(input)
  if (!data.name) throw new Error('Patient name is required')
  return this.create({ ...data, patientId: await this.nextPatientId(), createdBy: by })
}

patientSchema.statics.updatePatient = async function updatePatient(patientId, input) {
  const data = pick(input)
  if (data.name === '') throw new Error('Patient name is required')
  return this.findOneAndUpdate({ patientId }, { $set: data }, { new: true }).lean()
}

/**
 * Used when a bill is saved. Uses the given patientId if there is one; otherwise finds the
 * patient with the same mobile + name (families often share one mobile, so name must match too),
 * or creates a new patient. Age / sex / ref doctor are refreshed from the latest bill.
 */
patientSchema.statics.resolveForBill = async function resolveForBill(input = {}, by) {
  const data = pick(input)
  if (!data.name) throw new Error('Patient name is required')
  const refresh = { age: data.age, sex: data.sex, refBy: data.refBy }
  Object.keys(refresh).forEach((k) => refresh[k] === undefined && delete refresh[k])

  if (input.patientId) {
    const byId = await this.findOneAndUpdate({ patientId: String(input.patientId) }, { $set: { ...refresh, name: data.name, nameKey: data.nameKey, ...(data.mobile ? { mobile: data.mobile } : {}) } }, { new: true })
    if (byId) return byId
  }

  const existing = await this.findOneAndUpdate({ nameKey: data.nameKey, mobile: data.mobile || '' }, { $set: refresh }, { new: true, sort: { createdAt: 1 } })
  if (existing) return existing

  return this.create({ ...data, mobile: data.mobile || '', patientId: await this.nextPatientId(), createdBy: by })
}

patientSchema.statics.search = async function search({ q = '', limit = 50, skip = 0 } = {}) {
  const query = String(q || '').trim()
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const filter = query
    ? { $or: [{ patientId: { $regex: escaped, $options: 'i' } }, { name: { $regex: escaped, $options: 'i' } }, { mobile: { $regex: escaped } }] }
    : {}
  const cleanLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const [items, total] = await Promise.all([
    this.find(filter).sort({ updatedAt: -1 }).skip(Math.max(0, Number(skip) || 0)).limit(cleanLimit).lean(),
    this.countDocuments(filter),
  ])
  return { items, total }
}

patientSchema.statics.toPublic = (p) =>
  p
    ? {
        patientId: p.patientId,
        name: p.name,
        age: p.age || '',
        sex: p.sex || '',
        mobile: p.mobile || '',
        address: p.address || '',
        refBy: p.refBy || '',
        notes: p.notes || '',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }
    : null

module.exports = mongoose.model('Patient', patientSchema)
