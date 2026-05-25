const mongoose = require('mongoose')

const patientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: String, default: '' },
    sex: { type: String, default: '' },
    mobile: { type: String, default: '', trim: true, index: true },
    refBy: { type: String, default: '', trim: true },
  },
  { timestamps: true },
)

patientSchema.index({ name: 'text', mobile: 'text', refBy: 'text' })

module.exports = mongoose.model('Patient', patientSchema)
