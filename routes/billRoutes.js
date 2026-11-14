const express = require('express')
const Bill = require('../models/Bill')
const { actor } = require('../middleware/auth')

const router = express.Router()

router.get('/', async (req, res, next) => {
  try {
    const bills = await Bill.listBills({
      search: req.query.search || '',
      limit: req.query.limit || 50,
    })

    res.json({ bills })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res) => {
  try {
    const bill = await Bill.createOrUpdateBill(req.body, actor(req))
    res.status(201).json({ bill })
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

router.get('/dashboard', async (req, res, next) => {
  try {
    res.json(await Bill.dashboardStats())
  } catch (error) {
    next(error)
  }
})

/** Names already used on bills, for the Ref. Doctor / Other Reference / Center dropdowns. */
router.get('/references', async (req, res, next) => {
  try {
    const User = require('../models/User')
    const [doctors, others, centers, userDocs] = await Promise.all([
      Bill.distinct('patient.refBy'),
      Bill.distinct('meta.otherReference'),
      Bill.distinct('meta.centerName'),
      User.find({ active: true }, { name: 1, username: 1 }).lean(),
    ])
    const tidy = (list) => [...new Set(list.map((v) => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    // Only display names (no usernames/emails) — used for the "Select User" filter.
    const users = tidy(userDocs.map((u) => u.name || u.username))
    res.json({ doctors: tidy(doctors), others: tidy(others), centers: tidy(centers), users })
  } catch (error) {
    next(error)
  }
})

router.get('/report', async (req, res, next) => {
  try {
    res.json(
      await Bill.reportBills({
        from: req.query.from,
        to: req.query.to,
        search: req.query.search || '',
      }),
    )
  } catch (error) {
    next(error)
  }
})

/** Dashboard: move a registration to the next work step (sample collected, report ready, delivered). */
router.patch('/:id/status', async (req, res, next) => {
  try {
    const bill = await Bill.setStatus(req.params.id, String(req.body?.status || ''), actor(req))
    if (!bill) return res.status(404).json({ message: 'Bill not found' })
    res.json({ bill })
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message })
    next(error)
  }
})

/** Result Entry: the sheet of tests with ranges and saved values. */
router.get('/:id/results', async (req, res, next) => {
  try {
    const data = await Bill.resultSheet(req.params.id)
    if (!data) return res.status(404).json({ message: 'Bill not found' })
    res.json(data)
  } catch (error) {
    next(error)
  }
})

/** Result Entry: save values; { final: true } marks the report ready. */
router.put('/:id/results', async (req, res, next) => {
  try {
    const data = await Bill.saveResults(req.params.id, req.body || {}, actor(req))
    if (!data) return res.status(404).json({ message: 'Bill not found' })
    res.json(data)
  } catch (error) {
    next(error)
  }
})

/** Dashboard popup: collect dues on a bill. */
router.post('/:id/payment', async (req, res, next) => {
  try {
    const bill = await Bill.collectDues(req.params.id, req.body || {}, actor(req))
    if (!bill) return res.status(404).json({ message: 'Bill not found' })
    res.json({ bill })
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message })
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const bill = await Bill.findByBillId(req.params.id)

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' })
    }

    res.json({ bill })
  } catch (error) {
    next(error)
  }
})

module.exports = router
