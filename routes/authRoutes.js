const express = require('express')
const nodemailer = require('nodemailer')
const sgMail = require('@sendgrid/mail')
const User = require('../models/User')
const Session = require('../models/Session')
const PasswordResetToken = require('../models/PasswordResetToken')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

const getEnv = (key) => String(process.env[key] || '').trim()

const sendEmail = async ({ to, subject, text }) => {
  const sendgridKey = getEnv('SENDGRID_API_KEY')
  const sendgridFrom = getEnv('SENDGRID_FROM')
  if (sendgridKey) {
    if (!sendgridFrom) {
      const error = new Error('SendGrid is configured but SENDGRID_FROM is missing')
      error.code = 'ECONFIG'
      throw error
    }
    sgMail.setApiKey(sendgridKey)
    await sgMail.send({ to, from: sendgridFrom, subject, text })
    return
  }

  const smtpHost = getEnv('SMTP_HOST')
  const smtpUser = getEnv('SMTP_USER')
  const smtpPass = getEnv('SMTP_PASS')
  const smtpFrom = getEnv('SMTP_FROM') || smtpUser

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    const error = new Error('Email service is not configured')
    error.code = 'ECONFIG'
    throw error
  }

  const port = Number(getEnv('SMTP_PORT') || '587') || 587
  const secure = getEnv('SMTP_SECURE').toLowerCase() === 'true'

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
  })

  await transporter.sendMail({ from: smtpFrom, to, subject, text })
}

/* ---------- simple brute-force protection: 10 failed logins per IP per 15 minutes ---------- */
const failed = new Map()
const WINDOW_MS = 15 * 60 * 1000
const tooManyAttempts = (ip) => {
  const entry = failed.get(ip)
  if (!entry || entry.until < Date.now()) return false
  return entry.count >= 10
}
const noteFailure = (ip) => {
  const entry = failed.get(ip)
  if (!entry || entry.until < Date.now()) failed.set(ip, { count: 1, until: Date.now() + WINDOW_MS })
  else entry.count += 1
}

router.post('/login', async (req, res, next) => {
  try {
    const ip = req.ip || 'unknown'
    if (tooManyAttempts(ip)) return res.status(429).json({ message: 'Too many failed attempts. Try again in 15 minutes.' })

    await User.ensureInitialAdmin()
    const user = await User.verifyLogin(req.body?.username, req.body?.password)
    if (!user) {
      noteFailure(ip)
      return res.status(401).json({ message: 'Invalid username or password' })
    }

    failed.delete(ip)
    user.lastLoginAt = new Date()
    await user.save()
    const { token, expiresAt } = await Session.start(user._id)
    res.json({ ok: true, token, expiresAt, user: User.toPublic(user) })
  } catch (error) {
    next(error)
  }
})

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await Session.end(req.token)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: User.toPublic(req.user) })
})

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {}
    const ok = await User.verifyLogin(req.user.username, currentPassword)
    if (!ok) return res.status(400).json({ message: 'Current password is wrong' })
    const problem = User.validatePassword(newPassword)
    if (problem) return res.status(400).json({ message: problem })
    await User.setPassword(req.user._id, newPassword)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

router.post('/forgot-password', async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase()
  if (!username) return res.status(400).json({ message: 'Username is required' })
  const generic = { ok: true, message: 'If the account exists, a reset email has been sent.' }
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  try {
    await User.ensureInitialAdmin()
    const user = await User.findOne({ username, active: true }).lean()
    const to = user?.email || (username.includes('@') ? username : '')
    if (!user || !to) return res.json(generic)

    const { token, expiresAt } = await PasswordResetToken.createToken(username, 15)
    const resetLink = `${appUrl}/reset-password?token=${token}&username=${encodeURIComponent(username)}`
    const text = [
      'Hello,',
      '',
      `A password reset was requested for: ${username}`,
      `This link is valid until: ${expiresAt.toISOString()}`,
      '',
      `Reset link: ${resetLink}`,
      '',
      `Reset token: ${token}`,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n')

    try {
      await sendEmail({ to, subject: 'Reset your Billing System password', text })
      return res.json({ ok: true, message: 'Reset link sent to your email.' })
    } catch (error) {
      await PasswordResetToken.deleteMany({ username })
      throw error
    }
  } catch (error) {
    console.error('forgot-password failed', { code: error?.code, message: error?.message })
    res.status(500).json({
      message: 'Unable to send reset email',
      detail: error?.code || error?.response?.body?.errors?.[0]?.message || error?.message || 'UNKNOWN',
    })
  }
})

router.post('/reset-password', async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase()
  const token = String(req.body?.token || '').trim()
  const newPassword = String(req.body?.newPassword || '')
  if (!username || !token || !newPassword) return res.status(400).json({ message: 'Username, token and new password are required' })
  const problem = User.validatePassword(newPassword)
  if (problem) return res.status(400).json({ message: problem })

  try {
    await User.ensureInitialAdmin()
    const ok = await PasswordResetToken.consumeToken(username, token)
    if (!ok) return res.status(400).json({ message: 'Invalid or expired token' })
    const user = await User.findOne({ username })
    if (!user) return res.status(400).json({ message: 'Invalid or expired token' })
    await User.setPassword(user._id, newPassword)
    await Session.endAllForUser(user._id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
