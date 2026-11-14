const mongoose = require('mongoose')
const Counter = require('./Counter')

/** Test profile / package, e.g. "LIPID PROFILE" or "DENGUE PANEL (NS1, IgM, IgG)". */
const profileSchema = new mongoose.Schema(
  {
    profileId: { type: Number, index: true },
    name: { type: String, required: true, trim: true, unique: true },
    shortName: { type: String, default: '', trim: true },
    wing: { type: String, default: '', trim: true },
    department: { type: String, default: '', trim: true },
    method: { type: String, default: '', trim: true },
    sample: { type: String, default: '', trim: true },
    vial: { type: String, default: '', trim: true },

    amount: { type: Number, default: 0 }, // Patient Rate
    discountPct: { type: Number, default: 0 },
    offerRate: { type: Number, default: 0 }, // Offer Price

    description: { type: String, default: '' }, // rich text (HTML)
    preTestDetail: { type: String, default: '' }, // rich text (HTML), e.g. fasting instructions

    printMethod: { type: Boolean, default: false },
    printComment: { type: Boolean, default: false },
    printProfileName: { type: Boolean, default: false },

    tests: { type: [String], default: [] }, // test names in this profile (set in Profile Setting)

    createdBy: { id: String, name: String },
    updatedBy: { id: String, name: String },
  },
  { timestamps: true },
)

const str = (v, max = 300) => String(v ?? '').trim().slice(0, max)
const num = (v) => Math.max(0, Number(v) || 0)
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1'

const clean = (input = {}) => {
  const out = {
    name: str(input.name, 200),
    shortName: str(input.shortName, 60),
    wing: str(input.wing, 60),
    department: str(input.department, 80),
    method: str(input.method, 200),
    sample: str(input.sample, 100),
    vial: str(input.vial, 60),
    amount: num(input.amount),
    discountPct: Math.min(100, num(input.discountPct)),
    offerRate: num(input.offerRate),
    description: String(input.description ?? '').slice(0, 20000),
    preTestDetail: String(input.preTestDetail ?? '').slice(0, 20000),
    printMethod: bool(input.printMethod),
    printComment: bool(input.printComment),
    printProfileName: bool(input.printProfileName),
  }
  if (Array.isArray(input.tests)) out.tests = [...new Set(input.tests.map((t) => str(t, 200)).filter(Boolean))]
  if (!out.offerRate && out.discountPct && out.amount) out.offerRate = Math.round(out.amount * (1 - out.discountPct / 100) * 100) / 100
  return out
}

const fail = (message) => Object.assign(new Error(message), { status: 400 })

profileSchema.statics.createProfile = async function createProfile(input, by) {
  const data = clean(input)
  if (!data.name) throw fail('Profile name is required')
  if (await this.exists({ name: data.name })) throw fail('A profile with this name already exists')
  return this.create({ ...data, profileId: await Counter.next('profile'), createdBy: by, updatedBy: by })
}

profileSchema.statics.updateProfile = async function updateProfile(id, input, by) {
  const data = clean(input)
  if (!data.name) throw fail('Profile name is required')
  if (await this.exists({ name: data.name, _id: { $ne: id } })) throw fail('Another profile already has this name')
  const profile = await this.findById(id)
  if (!profile) return null
  Object.assign(profile, data, { updatedBy: by })
  if (!profile.profileId) profile.profileId = await Counter.next('profile')
  await profile.save()
  return profile
}

module.exports = mongoose.model('Profile', profileSchema)
