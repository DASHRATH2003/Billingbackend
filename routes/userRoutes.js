const express = require('express')
const User = require('../models/User')
const Session = require('../models/Session')
const { requireAdmin } = require('../middleware/auth')

// Mounted behind requireAuth; every route here is admin-only.
const router = express.Router()
router.use(requireAdmin)

router.get('/', async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ role: 1, name: 1 }).lean()
    res.json({ users: users.map(User.toPublic) })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const role = User.ROLES.includes(req.body?.role) ? req.body.role : 'staff'
    if (!/^[a-z0-9._@-]{3,60}$/.test(username)) {
      return res.status(400).json({ message: 'Username must be 3–60 letters, numbers or . _ @ -' })
    }
    const problem = User.validatePassword(password)
    if (problem) return res.status(400).json({ message: problem })
    if (await User.exists({ username })) return res.status(400).json({ message: 'This username is already taken' })

    const user = await User.create({
      username,
      name: String(req.body?.name || '').trim() || username,
      email: String(req.body?.email || '').trim(),
      role,
      active: true,
      ...User.makePassword(password),
    })
    res.status(201).json({ user: User.toPublic(user) })
  } catch (error) {
    next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    const isSelf = String(user._id) === String(req.user._id)

    if (req.body?.name !== undefined) user.name = String(req.body.name).trim() || user.username
    if (req.body?.email !== undefined) user.email = String(req.body.email).trim()
    if (req.body?.role !== undefined && User.ROLES.includes(req.body.role)) {
      if (isSelf && req.body.role !== 'admin') return res.status(400).json({ message: 'You cannot remove your own admin role' })
      user.role = req.body.role
    }
    if (req.body?.active !== undefined) {
      if (isSelf && !req.body.active) return res.status(400).json({ message: 'You cannot disable your own account' })
      user.active = Boolean(req.body.active)
    }
    if (req.body?.password) {
      const problem = User.validatePassword(req.body.password)
      if (problem) return res.status(400).json({ message: problem })
      Object.assign(user, User.makePassword(req.body.password))
    }

    // Keep at least one active admin.
    if (user.role !== 'admin' || !user.active) {
      const otherAdmins = await User.countDocuments({ _id: { $ne: user._id }, role: 'admin', active: true })
      if (!otherAdmins) return res.status(400).json({ message: 'There must be at least one active admin' })
    }

    await user.save()
    if (!user.active || req.body?.password) await Session.endAllForUser(user._id) // log them out everywhere
    res.json({ user: User.toPublic(user) })
  } catch (error) {
    next(error)
  }
})

module.exports = router
