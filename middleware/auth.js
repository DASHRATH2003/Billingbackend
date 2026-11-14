const Session = require('../models/Session')

const readToken = (req) => {
  const header = String(req.headers.authorization || '')
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

/** Rejects the request with 401 unless it carries a valid login token. Sets req.user. */
const requireAuth = async (req, res, next) => {
  try {
    const user = await Session.findUserByToken(readToken(req))
    if (!user) return res.status(401).json({ message: 'Please log in again' })
    req.user = user
    req.token = readToken(req)
    next()
  } catch (error) {
    next(error)
  }
}

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Only an admin can do this' })
  next()
}

/** Who did something, for audit fields on bills and reports. */
const actor = (req) => (req.user ? { id: String(req.user._id), name: req.user.name || req.user.username } : undefined)

module.exports = { requireAuth, requireAdmin, actor, readToken }
