const mongoose = require('mongoose')

const patientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: String, default: '' },
    sex: { type: String, default: '' },
    mobile: { type: String, default: '', trim: true },
    refBy: { type: String, default: '', trim: true },
  },
  { _id: false },
)

const metaSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    siNo: { type: String, default: '' },
    collectionDateTime: { type: String, default: '' },
    billingDateTime: { type: String, default: '' },
    reportingTime: { type: String, default: '' },
  },
  { _id: false },
)

const labSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    contact1: { type: String, default: '' },
    contact2: { type: String, default: '' },
    email: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
  },
  { _id: false, strict: false },
)

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, default: 0 },
  },
  { _id: false },
)

const billSchema = new mongoose.Schema(
  {
    billId: { type: String, required: true, unique: true, trim: true, index: true },
    patient: { type: patientSchema, required: true },
    meta: { type: metaSchema, required: true },
    lab: { type: labSchema, default: () => ({}) },
    items: { type: [itemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    receivedAmt: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    duesAmt: { type: Number, default: 0 },
    narration: { type: String, default: '' },
    collectionAt: { type: Date },
    billingAt: { type: Date },
    reportingAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

billSchema.index({ createdAt: -1 })
billSchema.index({ billingAt: -1 })
billSchema.index({ 'meta.billingDateTime': -1 })
billSchema.index({ 'patient.mobile': 1 })
billSchema.index({ 'patient.name': 'text', 'patient.mobile': 'text', billId: 'text', 'patient.refBy': 'text' })

const prepareBill = (data) => {
  const patient = data.patient || {}
  const meta = data.meta || {}
  const lab = data.lab || {}
  const items = Array.isArray(data.items) ? data.items : []
  const cleanItems = items
    .map((item) => ({
      name: String(item.name || '').trim(),
      amount: Number(item.amount) || 0,
    }))
    .filter((item) => item.name)

  const subtotal = cleanItems.reduce((sum, item) => sum + item.amount, 0)
  const discount = Number(data.discount) || 0
  const receivedAmt = Number(data.receivedAmt) || 0
  const netAmount = Math.max(0, subtotal - discount)
  const duesAmt = Math.max(0, netAmount - receivedAmt)
  const billId = String(meta.id || data.id || '').trim()
  const patientName = String(patient.name || '').trim()
  const parseDate = (value) => {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  if (!billId) {
    throw new Error('Bill ID is required')
  }

  if (!patientName) {
    throw new Error('Patient name is required')
  }

  return {
    billId,
    patient: {
      name: patientName,
      age: String(patient.age || ''),
      sex: String(patient.sex || ''),
      mobile: String(patient.mobile || ''),
      refBy: String(patient.refBy || ''),
    },
    meta: {
      id: billId,
      siNo: meta.siNo || '',
      collectionDateTime: meta.collectionDateTime || '',
      billingDateTime: meta.billingDateTime || '',
      reportingTime: meta.reportingTime || '',
    },
    lab,
    items: cleanItems,
    subtotal,
    discount,
    receivedAmt,
    netAmount,
    duesAmt,
    narration: String(data.narration || ''),
    collectionAt: parseDate(meta.collectionDateTime),
    billingAt: parseDate(meta.billingDateTime),
    reportingAt: parseDate(meta.reportingTime),
  }
}

const toApiBill = (bill) => {
  if (!bill) return null

  const data = typeof bill.toObject === 'function' ? bill.toObject() : bill

  return {
    id: data.billId,
    patient: data.patient,
    meta: data.meta,
    lab: data.lab,
    items: data.items,
    subtotal: Number(data.subtotal) || 0,
    discount: Number(data.discount) || 0,
    receivedAmt: Number(data.receivedAmt) || 0,
    netAmount: Number(data.netAmount) || 0,
    duesAmt: Number(data.duesAmt) || 0,
    narration: data.narration || '',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

billSchema.statics.createOrUpdateBill = async function createOrUpdateBill(data) {
  const bill = prepareBill(data)

  const savedBill = await this.findOneAndUpdate(
    { billId: bill.billId },
    { $set: bill },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  )

  return toApiBill(savedBill)
}

billSchema.statics.listBills = async function listBills({ search = '', limit = 50 } = {}) {
  const cleanLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const query = String(search || '').trim()
  const filter = query
    ? {
        $or: [
          { billId: { $regex: query, $options: 'i' } },
          { 'patient.name': { $regex: query, $options: 'i' } },
          { 'patient.mobile': { $regex: query, $options: 'i' } },
          { 'patient.refBy': { $regex: query, $options: 'i' } },
        ],
      }
    : {}

  const bills = await this.find(filter).sort({ createdAt: -1 }).limit(cleanLimit).lean()
  return bills.map(toApiBill)
}

billSchema.statics.findByBillId = async function findByBillId(id) {
  const bill = await this.findOne({ billId: id }).lean()
  return toApiBill(bill)
}

billSchema.statics.dashboardStats = async function dashboardStats() {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const startOfRange = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  const billDate = { $ifNull: ['$billingAt', '$createdAt'] }

  const [totals = {}] = await this.aggregate([
    {
      $group: {
        _id: null,
        totalBills: { $sum: 1 },
        patientKeys: {
          $addToSet: {
            $cond: [
              { $ne: ['$patient.mobile', ''] },
              '$patient.mobile',
              '$patient.name',
            ],
          },
        },
        subtotal: { $sum: '$subtotal' },
        discount: { $sum: '$discount' },
        netAmount: { $sum: '$netAmount' },
        receivedAmount: { $sum: '$receivedAmt' },
        duesAmount: { $sum: '$duesAmt' },
      },
    },
    {
      $project: {
        _id: 0,
        totalBills: 1,
        totalPatients: { $size: '$patientKeys' },
        subtotal: 1,
        discount: 1,
        netAmount: 1,
        receivedAmount: 1,
        duesAmount: 1,
      },
    },
  ])

  const [today = {}] = await this.aggregate([
    {
      $match: {
        $expr: {
          $and: [
            { $gte: [billDate, startOfToday] },
            { $lt: [billDate, startOfTomorrow] },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        billsToday: { $sum: 1 },
        revenueToday: { $sum: '$netAmount' },
        receivedToday: { $sum: '$receivedAmt' },
        duesToday: { $sum: '$duesAmt' },
        patientKeys: {
          $addToSet: {
            $cond: [
              { $ne: ['$patient.mobile', ''] },
              '$patient.mobile',
              '$patient.name',
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        billsToday: 1,
        revenueToday: 1,
        receivedToday: 1,
        duesToday: 1,
        patientsToday: { $size: '$patientKeys' },
      },
    },
  ])

  const revenueRows = await this.aggregate([
    {
      $match: {
        $expr: {
          $gte: [billDate, startOfRange],
        },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: billDate } },
        bills: { $sum: 1 },
        amount: { $sum: '$netAmount' },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', bills: 1, amount: 1 } },
  ])

  const topTests = await this.aggregate([
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        count: { $sum: 1 },
        amount: { $sum: '$items.amount' },
      },
    },
    { $sort: { count: -1, amount: -1 } },
    { $limit: 6 },
    { $project: { _id: 0, name: '$_id', count: 1, amount: 1 } },
  ])

  return {
    totals: {
      totalBills: totals.totalBills || 0,
      totalPatients: totals.totalPatients || 0,
      subtotal: totals.subtotal || 0,
      discount: totals.discount || 0,
      netAmount: totals.netAmount || 0,
      receivedAmount: totals.receivedAmount || 0,
      duesAmount: totals.duesAmount || 0,
    },
    today: {
      billsToday: today.billsToday || 0,
      revenueToday: today.revenueToday || 0,
      receivedToday: today.receivedToday || 0,
      duesToday: today.duesToday || 0,
      patientsToday: today.patientsToday || 0,
    },
    dailyRevenue: revenueRows,
    topTests,
  }
}

module.exports = mongoose.model('Bill', billSchema)
