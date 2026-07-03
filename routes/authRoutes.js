const express = require('express')
const nodemailer = require('nodemailer')
const sgMail = require('@sendgrid/mail')
const AdminCredential = require('../models/AdminCredential')
const PasswordResetToken = require('../models/PasswordResetToken')

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

  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  const run = async () => {
    await AdminCredential.ensureDefault()
    const existing = await AdminCredential.findOne({ username: adminUsername }).lean()

    if (!existing) {
      return res.json({ ok: true, message: 'If the account exists, a reset email has been sent.' })
    }

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
      await sendEmail({ to: adminUsername, subject, text })
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
      detail: error?.code || error?.response?.body?.errors?.[0]?.message || error?.message || 'UNKNOWN',
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
