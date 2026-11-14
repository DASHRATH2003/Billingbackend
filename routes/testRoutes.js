const express = require('express')
const mongoose = require('mongoose')
const Test = require('../models/Test')
const { requireAdmin, actor } = require('../middleware/auth')

// Mounted behind requireAuth. Reading is open to all staff; changing tests is admin-only.
const router = express.Router()

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res)
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message })
    next(error)
  }
}

router.get(
  '/',
  handle(async (req, res) => {
    res.json({ tests: await Test.listTests() })
  }),
)

/* ---------- full Test Entry form ---------- */

router.get(
  '/entry/:id',
  handle(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Test not found' })
    const test = await Test.findById(req.params.id).lean()
    if (!test) return res.status(404).json({ message: 'Test not found' })
    res.json({ test })
  }),
)

router.post(
  '/entry',
  requireAdmin,
  handle(async (req, res) => {
    const test = await Test.createEntry(req.body, actor(req))
    res.status(201).json({ test })
  }),
)

router.put(
  '/entry/:id',
  requireAdmin,
  handle(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Test not found' })
    const test = await Test.updateEntry(req.params.id, req.body, actor(req))
    if (!test) return res.status(404).json({ message: 'Test not found' })
    res.json({ test })
  }),
)

router.delete(
  '/entry/:id',
  requireAdmin,
  handle(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Test not found' })
    const result = await Test.deleteOne({ _id: req.params.id })
    res.json({ deletedCount: result.deletedCount || 0 })
  }),
)

/* ---------- simple name + price sync (Test List inline edit, Create Bill) ---------- */

router.put(
  '/',
  requireAdmin,
  handle(async (req, res) => {
    res.json({ tests: await Test.upsertTests(req.body?.tests) })
  }),
)

router.delete(
  '/:name',
  requireAdmin,
  handle(async (req, res) => {
    res.json(await Test.deleteTest(req.params.name))
  }),
)

module.exports = router
