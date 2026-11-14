const crypto = require('crypto')
const mongoose = require('mongoose')

const ROLES = ['admin', 'staff']

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, lowercase: true, unique: true },
    name: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    role: { type: String, enum: ROLES, default: 'staff' },
    active: { type: Boolean, default: true },
    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
)

const hashPassword = (password, salt) => crypto.scryptSync(String(password || ''), String(salt || ''), 64).toString('hex')

const makePassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex')
  return { passwordSalt: salt, passwordHash: hashPassword(password, salt) }
}

userSchema.statics.ROLES = ROLES
userSchema.statics.makePassword = makePassword

userSchema.statics.validatePassword = (password) => {
  const value = String(password || '')
  if (value.length < 6) return 'Password must be at least 6 characters'
  return ''
}

/** Public view of a user – never includes the password hash. */
userSchema.statics.toPublic = (user) =>
  user
    ? {
        id: String(user._id),
        username: user.username,
        name: user.name || user.username,
        email: user.email || '',
        role: user.role,
        active: user.active !== false,
        lastLoginAt: user.lastLoginAt || null,
        createdAt: user.createdAt || null,
      }
    : null

userSchema.statics.verifyLogin = async function verifyLogin(username, password) {
  const clean = String(username || '').trim().toLowerCase()
  if (!clean || !password) return null
  const user = await this.findOne({ username: clean })
  if (!user || user.active === false) return null
  const candidate = Buffer.from(hashPassword(password, user.passwordSalt), 'hex')
  const stored = Buffer.from(user.passwordHash, 'hex')
  if (candidate.length !== stored.length || !crypto.timingSafeEqual(candidate, stored)) return null
  return user
}

userSchema.statics.setPassword = async function setPassword(userId, password) {
  await this.updateOne({ _id: userId }, { $set: makePassword(password) })
}

/**
 * First run: if there are no users yet, copy the old single admin login (AdminCredential)
 * so the existing username/password keep working, now as role "admin".
 */
userSchema.statics.ensureInitialAdmin = async function ensureInitialAdmin() {
  if (await this.estimatedDocumentCount()) return
  const AdminCredential = require('./AdminCredential')
  await AdminCredential.ensureDefault()
  const legacy = await AdminCredential.find({}).lean()
  for (const cred of legacy) {
    await this.updateOne(
      { username: cred.username.toLowerCase() },
      {
        $setOnInsert: {
          username: cred.username.toLowerCase(),
          name: 'Administrator',
          email: cred.username.includes('@') ? cred.username : '',
          role: 'admin',
          active: true,
          passwordHash: cred.passwordHash,
          passwordSalt: cred.passwordSalt,
        },
      },
      { upsert: true },
    )
  }
}

module.exports = mongoose.model('User', userSchema)
