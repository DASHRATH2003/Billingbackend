const mongoose = require('mongoose')

const patientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: String, default: '' },
    sex: { type: String, default: '' },
    mobile: { type: String, default: '', trim: true },
    refBy: { type: String, default: '', trim: true },
    // Patient Registration extras
    title: { type: String, default: '' }, // Mr / Mrs / Miss / Baby / Master / Dr
    ageY: { type: String, default: '' },
    ageM: { type: String, default: '' },
    ageD: { type: String, default: '' },
    address: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    category: { type: String, default: '' },
    weight: { type: String, default: '' },
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
    // Patient Registration extras
    receivedDateTime: { type: String, default: '' }, // sample received
    centerName: { type: String, default: '' },
    labName: { type: String, default: '' },
    sampleType: { type: String, default: '' },
    otherReference: { type: String, default: '' },
    rateType: { type: String, default: '' }, // which rate was used: patient / offer
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
    kind: { type: String, default: 'test' }, // test | profile
    tests: { type: [String], default: undefined }, // for a profile: the tests inside it
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
    payMode: { type: String, default: '' }, // Cash / UPI / Card ...
    transactionId: { type: String, default: '' },
    discountBy: { type: String, default: '' }, // Self / Doctor / Management ...
    discountMode: { type: String, default: '' }, // amount | percent
    discountValue: { type: Number, default: 0 }, // the number typed (₹ or %)
    // Dues collected later from the Dashboard popup ("Amount ₹900 Dues").
    payments: {
      type: [{ amount: Number, payMode: String, at: Date, by: { id: String, name: String }, _id: false }],
      default: [],
    },
    // Result Entry: the values typed for each test (Patient Report).
    results: {
      type: [{ name: String, group: String, value: String, unit: String, range: String, remark: String, _id: false }],
      default: [],
    },
    reportComment: { type: String, default: '' },
    resultAt: { type: Date },
    resultBy: { id: String, name: String },
    // Work status shown on the Dashboard: registered -> collected -> ready -> delivered
    status: { type: String, enum: ['registered', 'collected', 'ready', 'delivered'], default: 'registered', index: true },
    statusAt: { type: Date },
    statusBy: { id: String, name: String },
    collectionAt: { type: Date },
    billingAt: { type: Date },
    reportingAt: { type: Date },
    patientRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
    patientId: { type: String, default: '', index: true },
    createdBy: { id: String, name: String },
    updatedBy: { id: String, name: String },
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
    .map((item) => {
      const out = { name: String(item.name || '').trim(), amount: Number(item.amount) || 0 }
      if (item.kind === 'profile') {
        out.kind = 'profile'
        out.tests = Array.isArray(item.tests) ? item.tests.map((t) => String(t || '').trim()).filter(Boolean) : []
      }
      return out
    })
    .filter((item) => item.name)
  const text = (v, max = 300) => String(v ?? '').trim().slice(0, max)

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
      title: text(patient.title, 20),
      ageY: text(patient.ageY, 5),
      ageM: text(patient.ageM, 5),
      ageD: text(patient.ageD, 5),
      address: text(patient.address),
      email: text(patient.email, 120),
      category: text(patient.category, 40),
      weight: text(patient.weight, 20),
    },
    meta: {
      id: billId,
      siNo: meta.siNo || '',
      collectionDateTime: meta.collectionDateTime || '',
      billingDateTime: meta.billingDateTime || '',
      reportingTime: meta.reportingTime || '',
      receivedDateTime: text(meta.receivedDateTime, 30),
      centerName: text(meta.centerName, 80),
      labName: text(meta.labName, 120),
      sampleType: text(meta.sampleType, 120),
      otherReference: text(meta.otherReference, 120),
      rateType: text(meta.rateType, 30),
    },
    lab,
    items: cleanItems,
    subtotal,
    discount,
    receivedAmt,
    netAmount,
    duesAmt,
    narration: String(data.narration || ''),
    payMode: text(data.payMode, 30),
    transactionId: text(data.transactionId, 80),
    discountBy: text(data.discountBy, 60),
    discountMode: data.discountMode === 'percent' ? 'percent' : data.discountMode === 'amount' ? 'amount' : '',
    discountValue: Math.max(0, Number(data.discountValue) || 0),
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
    payMode: data.payMode || '',
    transactionId: data.transactionId || '',
    discountBy: data.discountBy || '',
    discountMode: data.discountMode || '',
    discountValue: Number(data.discountValue) || 0,
    payments: Array.isArray(data.payments) ? data.payments : [],
    status: data.status || 'registered',
    statusAt: data.statusAt || null,
    statusBy: data.statusBy?.name ? data.statusBy : null,
    patientId: data.patientId || '',
    createdBy: data.createdBy?.name ? data.createdBy : null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

billSchema.statics.createOrUpdateBill = async function createOrUpdateBill(data, by) {
  const bill = prepareBill(data)

  // New registrations without a number get one from the server: R26-000123 (year + running number).
  if (!bill.billId) {
    const Counter = require('./Counter')
    const yy = String(new Date().getFullYear()).slice(2)
    bill.billId = `R${yy}-${String(await Counter.next('bill')).padStart(6, '0')}`
    bill.meta.id = bill.billId
  }
  // Daily serial like E-PathoSoft: "13/11-26" = 26th registration on 13 Nov.
  if (!bill.meta.siNo) {
    const day = String(bill.meta.billingDateTime || '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const count = await this.countDocuments({ 'meta.billingDateTime': { $gte: day, $lt: `${day}T99` }, billId: { $ne: bill.billId } })
      bill.meta.siNo = `${day.slice(8, 10)}/${day.slice(5, 7)}-${count + 1}`
    }
  }

  // Link the bill to a patient record (found by patientId, or mobile + name, or newly created).
  const Patient = require('./Patient')
  const patient = await Patient.resolveForBill({ ...data.patient, patientId: data.patientId || data.patient?.patientId }, by)
  bill.patientRef = patient._id
  bill.patientId = patient.patientId
  if (by) {
    bill.updatedBy = by
    const exists = await this.exists({ billId: bill.billId })
    if (!exists) bill.createdBy = by
  }

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
          { patientId: { $regex: query, $options: 'i' } },
          { 'patient.name': { $regex: query, $options: 'i' } },
          { 'patient.mobile': { $regex: query, $options: 'i' } },
          { 'patient.refBy': { $regex: query, $options: 'i' } },
        ],
      }
    : {}

  const bills = await this.find(filter).sort({ createdAt: -1 }).limit(cleanLimit).lean()
  return bills.map(toApiBill)
}

/**
 * Patient registration report: every bill whose billing date is between `from` and `to` (YYYY-MM-DD, inclusive).
 * Filters on meta.billingDateTime – the wall-clock time typed on the bill ("2026-11-13T17:08") – so the
 * result is the same whatever time zone the server runs in. Bills without that field fall back to createdAt (IST).
 */
billSchema.statics.reportBills = async function reportBills({ from, to, search = '' } = {}) {
  const isDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
  const today = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10) // today in IST
  const start = isDay(from) ? from : today
  const end = isDay(to) ? to : start
  const [lo, hi] = start <= end ? [start, end] : [end, start]

  const dayToUtc = (day, addDays = 0) => {
    const date = new Date(`${day}T00:00:00+05:30`)
    date.setUTCDate(date.getUTCDate() + addDays)
    return date
  }

  const dateFilter = {
    $or: [
      { 'meta.billingDateTime': { $gte: lo, $lt: `${hi}T99` } },
      {
        'meta.billingDateTime': { $in: ['', null] },
        createdAt: { $gte: dayToUtc(lo), $lt: dayToUtc(hi, 1) },
      },
    ],
  }

  const query = String(search || '').trim()
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const filter = query
    ? {
        $and: [
          dateFilter,
          {
            $or: [
              { billId: { $regex: escaped, $options: 'i' } },
              { 'meta.siNo': { $regex: escaped, $options: 'i' } },
              { patientId: { $regex: escaped, $options: 'i' } },
              { 'patient.name': { $regex: escaped, $options: 'i' } },
              { 'patient.mobile': { $regex: escaped, $options: 'i' } },
              { 'patient.refBy': { $regex: escaped, $options: 'i' } },
            ],
          },
        ],
      }
    : dateFilter

  const bills = await this.find(filter).sort({ 'meta.billingDateTime': 1, createdAt: 1 }).limit(5000).lean()
  const rows = bills.map(toApiBill)
  const totals = rows.reduce(
    (acc, bill) => {
      acc.bills += 1
      acc.amount += bill.subtotal
      acc.discount += bill.discount
      acc.net += bill.netAmount
      acc.received += bill.receivedAmt
      acc.dues += bill.duesAmt
      return acc
    },
    { bills: 0, amount: 0, discount: 0, net: 0, received: 0, dues: 0 },
  )

  return { from: lo, to: hi, totals, bills: rows }
}

billSchema.statics.STATUSES = ['registered', 'collected', 'ready', 'delivered']

billSchema.statics.setStatus = async function setStatus(billId, status, by) {
  if (!this.STATUSES.includes(status)) throw Object.assign(new Error('Unknown status'), { status: 400 })
  const bill = await this.findOneAndUpdate({ billId }, { $set: { status, statusAt: new Date(), statusBy: by } }, { new: true }).lean()
  return toApiBill(bill)
}

/** Result Entry sheet (tests + ranges + saved values) for one bill. */
billSchema.statics.resultSheet = async function resultSheet(billId) {
  const bill = await this.findOne({ billId }).lean()
  if (!bill) return null
  const { buildSheet } = require('../lib/resultSheet')
  return { bill: toApiBill(bill), sheet: await buildSheet(bill) }
}

/** Save typed results. `final` marks the report ready (RefNo turns blue on the Dashboard). */
billSchema.statics.saveResults = async function saveResults(billId, { results, comment, final }, by) {
  const { cleanResults } = require('../lib/resultSheet')
  const set = { results: cleanResults(results), reportComment: String(comment || '').slice(0, 4000), resultAt: new Date(), resultBy: by }
  if (final) Object.assign(set, { status: 'ready', statusAt: new Date(), statusBy: by })
  const bill = await this.findOneAndUpdate({ billId }, { $set: set }, { new: true }).lean()
  return bill ? this.resultSheet(billId) : null
}

/** Collect (part of) the dues on a bill. Never takes more than what is due. */
billSchema.statics.collectDues = async function collectDues(billId, { amount, payMode }, by) {
  const bill = await this.findOne({ billId })
  if (!bill) return null
  const pay = Math.round((Number(amount) || 0) * 100) / 100
  if (!(pay > 0)) throw Object.assign(new Error('Enter the amount received.'), { status: 400 })
  const due = Math.max(0, (Number(bill.netAmount) || 0) - (Number(bill.receivedAmt) || 0))
  if (due <= 0) throw Object.assign(new Error('This bill has no dues.'), { status: 400 })
  if (pay > due) throw Object.assign(new Error(`Only ₹${due} is due.`), { status: 400 })

  bill.receivedAmt = Math.round(((Number(bill.receivedAmt) || 0) + pay) * 100) / 100
  bill.duesAmt = Math.max(0, Math.round((bill.netAmount - bill.receivedAmt) * 100) / 100)
  bill.payments.push({ amount: pay, payMode: String(payMode || 'Cash').slice(0, 30), at: new Date(), by })
  if (by) bill.updatedBy = by
  await bill.save()
  return toApiBill(bill)
}

billSchema.statics.billsForPatient =async function billsForPatient(patientId) {
  const bills = await this.find({ patientId: String(patientId || '') }).sort({ 'meta.billingDateTime': -1, createdAt: -1 }).limit(500).lean()
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
