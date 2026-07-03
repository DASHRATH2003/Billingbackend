const mongoose = require('mongoose')

const getMongoUri = () => {
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI
  }

  const user = process.env.MONGO_USER
  const password = process.env.MONGO_PASSWORD
  const host = process.env.MONGO_HOST
  const dbName = process.env.MONGO_DB_NAME || 'billingsystem'

  if (user && password && host) {
    return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${dbName}?retryWrites=true&w=majority`
  }

  return `mongodb://127.0.0.1:27017/${dbName}`
}

const connectDB = async () => {
  const mongoUri = getMongoUri()

  try {
    await mongoose.connect(mongoUri)
    console.log(`MongoDB connected: ${mongoose.connection.host}`)
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`)
    process.exit(1)
  }
}

module.exports = connectDB
