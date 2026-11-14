require('dotenv').config()
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const connectDB = require('./config/db')
const { requireAuth } = require('./middleware/auth')
const authRoutes = require('./routes/authRoutes')
const billRoutes = require('./routes/billRoutes')
const testRoutes = require('./routes/testRoutes')
const patientRoutes = require('./routes/patientRoutes')
const userRoutes = require('./routes/userRoutes')
const profileRoutes = require('./routes/profileRoutes')
const User = require('./models/User')

const app = express()
const PORT = process.env.PORT || 5000

app.set('trust proxy', 1) // correct client IP behind Render/Vercel proxies (used by the login limiter)
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    database: 'mongodb',
    connected: mongoose.connection.readyState === 1,
  })
})

// Public: login, logout, forgot/reset password. Everything else needs a valid login token.
app.use('/api/auth', authRoutes)
app.use('/api/bills', requireAuth, billRoutes)
app.use('/api/tests', requireAuth, testRoutes)
app.use('/api/patients', requireAuth, patientRoutes)
app.use('/api/users', requireAuth, userRoutes)
app.use('/api/profiles', requireAuth, profileRoutes)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: 'Server error' })
})

connectDB().then(async () => {
  await User.ensureInitialAdmin()
  app.listen(PORT, () => {
    console.log(`Billing API running on http://localhost:${PORT}`)
  })
})
