const mongoose = require('mongoose')

const testSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, index: true },
    amount: { type: Number, default: 0 },
  },
  { timestamps: true },
)

testSchema.statics.listTests = async function listTests() {
  return this.find({}).sort({ name: 1 }).lean()
}

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

module.exports = mongoose.model('Test', testSchema)

