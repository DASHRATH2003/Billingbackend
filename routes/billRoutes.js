const express = require('express')
const Bill = require('../models/Bill')

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
    const bill = await Bill.createOrUpdateBill(req.body)
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
