const crypto = require('crypto')
const mongoose = require('mongoose')

const SESSION_DAYS = 7

const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // MongoDB deletes the session automatically when this time passes.
  expiresAt: { type: Date, required: true, expires: 0 },
  createdAt: { type: Date, default: Date.now },
})

const hashToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex')

/** Creates a login session and returns the raw token (only its hash is stored). */
sessionSchema.statics.start = async function start(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await this.create({ tokenHash: hashToken(token), user: userId, expiresAt })
  return { token, expiresAt }
}

sessionSchema.statics.findUserByToken = async function findUserByToken(token) {
  if (!token) return null
  const session = await this.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).populate('user').lean()
  if (!session?.user || session.user.active === false) return null
  return session.user
}

sessionSchema.statics.end = async function end(token) {
  if (token) await this.deleteOne({ tokenHash: hashToken(token) })
}

sessionSchema.statics.endAllForUser = async function endAllForUser(userId) {
  await this.deleteMany({ user: userId })
}

module.exports = mongoose.model('Session', sessionSchema)
