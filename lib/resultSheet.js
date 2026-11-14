/**
 * Result Entry sheet for one bill: every test the patient paid for (profiles and multi-tests expanded
 * into their parameters), with unit + normal range picked for the patient's age/sex from Test Entry,
 * merged with the results already typed.
 */
const Test = require('../models/Test')
const Profile = require('../models/Profile')

const keyOf = (group, name) => `${group || ''}|${name}`
const toNum = (v) => {
  const s = String(v ?? '').trim()
  return s && Number.isFinite(Number(s)) ? Number(s) : null
}

/** Patient age in years (0 for "2 Month" / "10 Day" babies, null when unknown). */
const ageYears = (patient = {}) => {
  const y = toNum(patient.ageY)
  if (y !== null && y > 0) return y
  if (toNum(patient.ageM) || toNum(patient.ageD)) return 0
  const age = String(patient.age || '').trim()
  if (/month|day/i.test(age)) return 0
  return toNum(age.replace(/\s*(y|yr|yrs|year|years)\.?$/i, ''))
}

/** Normal range for this patient: age/sex-based when the test has it, else the general range. */
const rangeFor = (test, patient) => {
  const sex = String(patient.sex || patient.category || '').toLowerCase()
  const isF = sex.startsWith('f')
  if (test.ageBased && test.ageRanges) {
    const age = ageYears(patient)
    const group = age !== null && age < 1 ? 'infant' : age !== null && age < 12 ? (isF ? 'childF' : 'childM') : isF ? 'female' : 'male'
    const order = [group, isF ? 'female' : 'male', 'male', 'female']
    for (const g of order) {
      const r = test.ageRanges[g] || {}
      if (r.text || r.low || r.high) {
        return { range: r.text || [r.low, r.high].filter(Boolean).join(' - '), low: r.low, high: r.high }
      }
    }
  }
  const lines = (test.normalRanges || []).filter((l) => String(l || '').trim())
  const lowHigh = test.normalLow || test.normalHigh ? `${test.normalLow || ''} - ${test.normalHigh || ''}` : ''
  return { range: lines.length ? lines.join('\n') : lowHigh, low: test.normalLow, high: test.normalHigh }
}

const flagOf = (value, low, high) => {
  const v = toNum(value)
  if (v === null) return ''
  const lo = toNum(low)
  const hi = toNum(high)
  if (lo !== null && v < lo) return 'L'
  if (hi !== null && v > hi) return 'H'
  return ''
}

const rowFor = (test, name, group, patient, saved) => {
  const t = test || {}
  const { range, low, high } = test ? rangeFor(test, patient) : { range: '', low: '', high: '' }
  const s = saved.get(keyOf(group, name)) || {}
  const value = s.value ?? ''
  const unit = s.unit ?? t.unit ?? ''
  const shownRange = s.range ?? range ?? ''
  return {
    key: keyOf(group, name),
    name,
    group,
    heading: t.format === 'Heading',
    department: t.department || '',
    method: t.method || '',
    showMethod: !!t.showMethod,
    interpretation: t.interpretation || '',
    bold: !!t.testNameBold,
    resultBold: !!t.resultBold,
    paragraph: !!t.paragraphResult,
    defaultResult: t.defaultResult || '',
    unit,
    range: shownRange,
    low: low || '',
    high: high || '',
    value,
    remark: s.remark || '',
    flag: flagOf(value, low, high),
    known: !!test,
  }
}

const buildSheet = async (bill) => {
  const saved = new Map((bill.results || []).map((r) => [keyOf(r.group, r.name), r]))
  const patient = bill.patient || {}

  // Names to look up: bill tests, profile tests, and children of multi-tests.
  const profileNames = (bill.items || []).filter((i) => i.kind === 'profile').map((i) => i.name)
  const profiles = await Profile.find({ name: { $in: profileNames } }, { name: 1, tests: 1, department: 1 }).lean()
  const profileTests = new Map(profiles.map((p) => [p.name, p.tests || []]))

  const sections = (bill.items || []).map((item) => ({
    item,
    names: item.kind === 'profile' ? (profileTests.get(item.name)?.length ? profileTests.get(item.name) : item.tests || []) : [item.name],
  }))
  const allNames = [...new Set(sections.flatMap((s) => s.names))]
  const tests = await Test.find({ $or: [{ name: { $in: allNames } }, { underTest: { $in: allNames } }] }).lean()
  const byName = new Map(tests.map((t) => [t.name, t]))
  const children = new Map()
  for (const t of tests) {
    if (t.underTest) children.set(t.underTest, [...(children.get(t.underTest) || []), t])
  }

  const groups = []
  for (const { item, names } of sections) {
    const isProfile = item.kind === 'profile'
    const rows = []
    for (const name of names) {
      const test = byName.get(name)
      const kids = children.get(name) || []
      if (kids.length) {
        // Multi-parameter test (e.g. CBC): a sub-heading, then each parameter.
        rows.push({ ...rowFor(test, name, isProfile ? item.name : '', patient, saved), heading: true })
        for (const kid of kids) rows.push(rowFor(kid, kid.name, name, patient, saved))
      } else {
        rows.push(rowFor(test, name, isProfile ? item.name : '', patient, saved))
      }
    }
    const department = byName.get(names[0])?.department || profiles.find((p) => p.name === item.name)?.department || ''
    groups.push({ title: item.name, isProfile, department, rows })
  }

  const entryRows = groups.flatMap((g) => g.rows).filter((r) => !r.heading)
  return {
    billId: bill.billId,
    status: bill.status || 'registered',
    comment: bill.reportComment || '',
    resultAt: bill.resultAt || null,
    resultBy: bill.resultBy?.name ? bill.resultBy : null,
    filled: entryRows.filter((r) => String(r.value).trim()).length,
    total: entryRows.length,
    groups,
  }
}

/** Clean what the Result Entry form sends. */
const cleanResults = (list) =>
  (Array.isArray(list) ? list : [])
    .map((r) => ({
      name: String(r?.name || '').trim().slice(0, 200),
      group: String(r?.group || '').trim().slice(0, 200),
      value: String(r?.value ?? '').slice(0, 4000),
      unit: String(r?.unit ?? '').trim().slice(0, 40),
      range: String(r?.range ?? '').slice(0, 600),
      remark: String(r?.remark ?? '').slice(0, 1000),
    }))
    .filter((r) => r.name)
    .slice(0, 500)

module.exports = { buildSheet, cleanResults }
