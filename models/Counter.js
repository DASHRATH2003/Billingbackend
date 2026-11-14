const mongoose = require('mongoose')

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } })

counterSchema.statics.next = async function next(name) {
  const doc = await this.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true })
  return doc.seq
}

module.exports = mongoose.model('Counter', counterSchema)
