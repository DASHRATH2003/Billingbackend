const express = require('express')
const mongoose = require('mongoose')
const Profile = require('../models/Profile')
const { requireAdmin, actor } = require('../middleware/auth')

// Mounted behind requireAuth. Reading is open to all staff; changing profiles is admin-only.
const router = express.Router()

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res)
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message })
    next(error)
  }
}

const validId = (req, res) => {
  if (mongoose.isValidObjectId(req.params.id)) return true
  res.status(404).json({ message: 'Profile not found' })
  return false
}

router.get(
  '/',
  handle(async (req, res) => {
    res.json({ profiles: await Profile.find({}).sort({ name: 1 }).lean() })
  }),
)

router.get(
  '/:id',
  handle(async (req, res) => {
    if (!validId(req, res)) return
    const profile = await Profile.findById(req.params.id).lean()
    if (!profile) return res.status(404).json({ message: 'Profile not found' })
    res.json({ profile })
  }),
)

router.post(
  '/',
  requireAdmin,
  handle(async (req, res) => {
    res.status(201).json({ profile: await Profile.createProfile(req.body, actor(req)) })
  }),
)

router.put(
  '/:id',
  requireAdmin,
  handle(async (req, res) => {
    if (!validId(req, res)) return
    const profile = await Profile.updateProfile(req.params.id, req.body, actor(req))
    if (!profile) return res.status(404).json({ message: 'Profile not found' })
    res.json({ profile })
  }),
)

/** Profile Setting: replace only the list (and order) of tests in a profile. */
router.put(
  '/:id/tests',
  requireAdmin,
  handle(async (req, res) => {
    if (!validId(req, res)) return
    if (!Array.isArray(req.body?.tests)) return res.status(400).json({ message: 'tests must be a list of test names' })
    const tests = [...new Set(req.body.tests.map((t) => String(t ?? '').trim().slice(0, 200)).filter(Boolean))]
    const profile = await Profile.findByIdAndUpdate(req.params.id, { $set: { tests, updatedBy: actor(req) } }, { new: true }).lean()
    if (!profile) return res.status(404).json({ message: 'Profile not found' })
    res.json({ profile })
  }),
)

router.delete(
  '/:id',
  requireAdmin,
  handle(async (req, res) => {
    if (!validId(req, res)) return
    const result = await Profile.deleteOne({ _id: req.params.id })
    res.json({ deletedCount: result.deletedCount || 0 })
  }),
)

module.exports = router
