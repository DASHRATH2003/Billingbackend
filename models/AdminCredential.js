const crypto = require('crypto')
const mongoose = require('mongoose')

const adminCredentialSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true },
  },
  { timestamps: true },
)

const hashPassword = (password, salt) => {
  const derived = crypto.scryptSync(String(password || ''), String(salt || ''), 64)
  return derived.toString('hex')
}

adminCredentialSchema.statics.ensureDefault = async function ensureDefault() {
  const username = process.env.LOGIN_USER || 'dashrathkumardbg2003@gmail.com'
  const password = process.env.LOGIN_PASSWORD || 'Billing@123'

  const existing = await this.findOne({ username }).lean()
  if (existing) return existing

  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(password, salt)
  const created = await this.create({ username, passwordHash, passwordSalt: salt })
  return created.toObject()
}

adminCredentialSchema.statics.verify = async function verify(username, password) {
  const cleanUsername = String(username || '').trim()
  if (!cleanUsername) return false

  const credential = await this.findOne({ username: cleanUsername }).lean()
  if (!credential) return false

  const candidate = hashPassword(password, credential.passwordSalt)
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(credential.passwordHash, 'hex'))
}

adminCredentialSchema.statics.updatePassword = async function updatePassword(username, newPassword) {
  const cleanUsername = String(username || '').trim()
  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(newPassword, salt)
  await this.updateOne({ username: cleanUsername }, { $set: { passwordHash, passwordSalt: salt } })
}

module.exports = mongoose.model('AdminCredential', adminCredentialSchema)

