require('dotenv').config()
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const connectDB = require('./config/db')
const authRoutes = require('./routes/authRoutes')
const billRoutes = require('./routes/billRoutes')
const testRoutes = require('./routes/testRoutes')

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    database: 'mongodb',
    connected: mongoose.connection.readyState === 1,
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/bills', billRoutes)
app.use('/api/tests', testRoutes)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: 'Server error' })
})

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Billing API running on http://localhost:${PORT}`)
  })
})
