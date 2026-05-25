const express = require('express')
const Test = require('../models/Test')

const router = express.Router()

router.get('/', async (req, res, next) => {
  try {
    const tests = await Test.listTests()
    res.json({ tests })
  } catch (error) {
    next(error)
  }
})

router.put('/', async (req, res, next) => {
  try {
    const tests = await Test.upsertTests(req.body?.tests)
    res.json({ tests })
  } catch (error) {
    next(error)
  }
})

module.exports = router

