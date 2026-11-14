const express = require('express')
const Patient = require('../models/Patient')
const Bill = require('../models/Bill')
const { actor } = require('../middleware/auth')

// Mounted behind requireAuth.
const router = express.Router()

router.get('/', async (req, res, next) => {
  try {
    const { items, total } = await Patient.search({ q: req.query.q, limit: req.query.limit, skip: req.query.skip })

    // Visit count + totals for the listed patients in one query.
    const ids = items.map((p) => p.patientId)
    const stats = await Bill.aggregate([
      { $match: { patientId: { $in: ids } } },
      {
        $group: {
          _id: '$patientId',
          visits: { $sum: 1 },
          net: { $sum: '$netAmount' },
          received: { $sum: '$receivedAmt' },
          dues: { $sum: '$duesAmt' },
          lastVisit: { $max: '$meta.billingDateTime' },
        },
      },
    ])
    const byId = new Map(stats.map((s) => [s._id, s]))

    res.json({
      total,
      patients: items.map((p) => {
        const s = byId.get(p.patientId) || {}
        return { ...Patient.toPublic(p), visits: s.visits || 0, net: s.net || 0, received: s.received || 0, dues: s.dues || 0, lastVisit: s.lastVisit || '' }
      }),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const patient = await Patient.createPatient(req.body, actor(req))
    res.status(201).json({ patient: Patient.toPublic(patient) })
  } catch (error) {
    if (/required/.test(error.message)) return res.status(400).json({ message: error.message })
    next(error)
  }
})

router.get('/:patientId', async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ patientId: req.params.patientId }).lean()
    if (!patient) return res.status(404).json({ message: 'Patient not found' })
    const bills = await Bill.billsForPatient(patient.patientId)
    res.json({ patient: Patient.toPublic(patient), bills })
  } catch (error) {
    next(error)
  }
})

router.put('/:patientId', async (req, res, next) => {
  try {
    const patient = await Patient.updatePatient(req.params.patientId, req.body)
    if (!patient) return res.status(404).json({ message: 'Patient not found' })
    res.json({ patient: Patient.toPublic(patient) })
  } catch (error) {
    if (/required/.test(error.message)) return res.status(400).json({ message: error.message })
    next(error)
  }
})

module.exports = router
