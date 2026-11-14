/**
 * One-time migration: create Patient records from existing bills and link each bill to its patient.
 *
 *   node scripts/migrate-patients.js            -> dry run (shows what would happen, changes nothing)
 *   node scripts/migrate-patients.js --apply    -> backs up all bills to backups/, then migrates
 *
 * Safe to run again: bills that already have a patientId are skipped.
 * Matching rule (same as new bills): same mobile + same name = same patient.
 */
require('dotenv').config({ quiet: true })
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const connectDB = require('../config/db')
const Bill = require('../models/Bill')
const Patient = require('../models/Patient')

const apply = process.argv.includes('--apply')

;(async () => {
  await connectDB()
  const bills = await Bill.find({ $or: [{ patientId: { $exists: false } }, { patientId: '' }] })
    .sort({ 'meta.billingDateTime': 1, createdAt: 1 })
    .lean()

  const groups = new Map()
  for (const bill of bills) {
    const key = `${Patient.cleanMobile(bill.patient?.mobile)}|${Patient.nameKeyOf(bill.patient?.name)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(bill)
  }

  console.log(`Bills without a patient: ${bills.length}`)
  console.log(`Patients that will be created/linked: ${groups.size}`)

  if (!apply) {
    console.log('\nDry run only. Run with --apply to back up and migrate.')
    await mongoose.disconnect()
    return
  }

  const dir = path.join(__dirname, '..', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `bills-before-patient-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  fs.writeFileSync(file, JSON.stringify(await Bill.find({}).lean(), null, 2))
  console.log(`Backup of all bills written to ${file}`)

  let linked = 0
  for (const [, group] of groups) {
    const latest = group[group.length - 1].patient || {}
    const patient = await Patient.resolveForBill(latest, { id: 'migration', name: 'Migration' })
    const res = await Bill.updateMany(
      { _id: { $in: group.map((b) => b._id) } },
      { $set: { patientRef: patient._id, patientId: patient.patientId } },
      { timestamps: false },
    )
    linked += res.modifiedCount
  }

  console.log(`Done. Linked ${linked} bills to ${groups.size} patients. Total patients now: ${await Patient.countDocuments()}`)
  await mongoose.disconnect()
})().catch(async (error) => {
  console.error('Migration failed:', error.message)
  await mongoose.disconnect()
  process.exit(1)
})
