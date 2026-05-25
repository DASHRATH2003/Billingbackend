const crypto = require('crypto')
const mongoose = require('mongoose')

const passwordResetTokenSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
)

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const hashToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex')

passwordResetTokenSchema.statics.createToken = async function createToken(username, ttlMinutes = 15) {
  const cleanUsername = String(username || '').trim()
  const token = crypto.randomBytes(24).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + Math.max(1, Number(ttlMinutes) || 15) * 60 * 1000)

  await this.deleteMany({ username: cleanUsername })
  await this.create({ username: cleanUsername, tokenHash, expiresAt })

  return { token, expiresAt }
}

passwordResetTokenSchema.statics.consumeToken = async function consumeToken(username, token) {
  const cleanUsername = String(username || '').trim()
  const tokenHash = hashToken(token)
  const doc = await this.findOne({ username: cleanUsername, tokenHash })
  if (!doc) return false
  if (doc.expiresAt.getTime() < Date.now()) {
    await this.deleteOne({ _id: doc._id })
    return false
  }
  await this.deleteOne({ _id: doc._id })
  return true
}

module.exports = mongoose.model('PasswordResetToken', passwordResetTokenSchema)

