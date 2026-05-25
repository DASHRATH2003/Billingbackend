const express = require('express')
const nodemailer = require('nodemailer')
const AdminCredential = require('../models/AdminCredential')
const PasswordResetToken = require('../models/PasswordResetToken')

const router = express.Router()

router.post('/login', (req, res) => {
  const { username, password } = req.body || {}

  AdminCredential.ensureDefault()
    .then(() => AdminCredential.verify(username, password))
    .then((ok) => {
      if (ok) return res.json({ ok: true })
      return res.status(401).json({ message: 'Invalid username or password' })
    })
    .catch(() => res.status(500).json({ message: 'Server error' }))
})

router.post('/forgot-password', (req, res) => {
  const username = String(req.body?.username || '').trim()
  if (!username) {
    return res.status(400).json({ message: 'Username is required' })
  }

  const adminUsername = String(process.env.LOGIN_USER || 'dashrathkumardbg2003@gmail.com').trim()
  if (username !== adminUsername) {
    return res.json({ ok: true, message: 'If the account exists, a reset email has been sent.' })
  }

  const smtpHost = String(process.env.SMTP_HOST || '').trim()
  const smtpUser = String(process.env.SMTP_USER || '').trim()
  const smtpPass = String(process.env.SMTP_PASS || '').trim()
  const smtpFrom = String(process.env.SMTP_FROM || smtpUser || '').trim()

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    return res.status(500).json({ message: 'Email service is not configured' })
  }

  const port = Number(String(process.env.SMTP_PORT || '587').trim()) || 587
  const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true'

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  const run = async () => {
    await AdminCredential.ensureDefault()
    const existing = await AdminCredential.findOne({ username: adminUsername }).lean()

    if (!existing) {
      return res.json({ ok: true, message: 'If the account exists, a reset email has been sent.' })
    }

    await transporter.verify()

    const { token, expiresAt } = await PasswordResetToken.createToken(adminUsername, 15)
    const resetLink = `${appUrl}/reset-password?token=${token}&username=${encodeURIComponent(adminUsername)}`
    const subject = 'Reset your Billing System password'
    const text = [
      `Hello,`,
      ``,
      `A password reset was requested for: ${adminUsername}`,
      `This link is valid until: ${expiresAt.toISOString()}`,
      ``,
      `Reset link: ${resetLink}`,
      ``,
      `Reset token: ${token}`,
      ``,
      `If you did not request this, you can ignore this email.`,
    ].join('\n')

    try {
      await transporter.sendMail({ from: smtpFrom, to: adminUsername, subject, text })
      return res.json({ ok: true, message: 'Reset link sent to your email.' })
    } catch (error) {
      await PasswordResetToken.deleteMany({ username: adminUsername })
      throw error
    }
  }

  run().catch((error) => {
    console.error('forgot-password failed', {
      code: error?.code,
      message: error?.message,
    })
    res.status(500).json({
      message: 'Unable to send reset email',
      detail: error?.code || error?.message || 'UNKNOWN',
    })
  })
})

router.post('/reset-password', (req, res) => {
  const token = String(req.body?.token || '').trim()
  const newPassword = String(req.body?.newPassword || '')
  const adminUsername = String(process.env.LOGIN_USER || 'dashrathkumardbg2003@gmail.com').trim()

  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required' })
  }

  Promise.all([AdminCredential.ensureDefault(), PasswordResetToken.consumeToken(adminUsername, token)])
    .then(([, ok]) => {
      if (!ok) {
        return res.status(400).json({ message: 'Invalid or expired token' })
      }
      return AdminCredential.updatePassword(adminUsername, newPassword).then(() => res.json({ ok: true }))
    })
    .catch(() => res.status(500).json({ message: 'Server error' }))
})

module.exports = router
