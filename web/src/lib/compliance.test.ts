import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { MongoClient, ObjectId } from 'mongodb'

import {
  CONSENT_POLICY_VERSION,
  DECISION_ACTIONS,
  appendDecision,
  ensureComplianceIndexes,
  hasAcceptedConsent,
  isDecisionAction,
  listDecisionsForSession,
  recordConsent,
  recordDemographics,
  resetComplianceIndexCacheForTests,
  validateDecisionReason,
} from '@/lib/compliance'

/* ================================================================== *
 * Pure logic
 * ================================================================== */

describe('decision actions', () => {
  test('recognises exactly the declared actions', () => {
    for (const action of DECISION_ACTIONS) {
      expect(isDecisionAction(action)).toBe(true)
    }
    expect(isDecisionAction('hire')).toBe(false)
    expect(isDecisionAction('')).toBe(false)
    expect(isDecisionAction(undefined)).toBe(false)
  })
})

describe('decision reason', () => {
  test('requires enough text to be meaningful', () => {
    // This is the artifact that demonstrates human oversight — "no" is not one.
    expect(validateDecisionReason('no').ok).toBe(false)
    expect(validateDecisionReason('   ').ok).toBe(false)
    expect(validateDecisionReason(undefined).ok).toBe(false)
  })

  test('accepts and trims a real reason', () => {
    const result = validateDecisionReason('  Strong system design, weak on trade-offs.  ')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reason).toBe('Strong system design, weak on trade-offs.')
  })

  test('rejects an over-long reason', () => {
    expect(validateDecisionReason('x'.repeat(2001)).ok).toBe(false)
  })
})

describe('consent policy version', () => {
  test('is set, so it is always possible to say what a candidate was shown', () => {
    expect(CONSENT_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

/* ================================================================== *
 * Integration
 * ================================================================== */

const MONGO_URI = process.env.MONGODB_URI
const describeDb = MONGO_URI ? describe : describe.skip

describeDb('compliance capture (integration)', () => {
  let client: MongoClient
  const invitations: ObjectId[] = []
  const orgId = new ObjectId()
  const jobId = new ObjectId()
  const actorId = new ObjectId()
  const sessionId = `session_test_${Date.now()}`

  beforeAll(async () => {
    client = new MongoClient(MONGO_URI as string)
    await client.connect()
    resetComplianceIndexCacheForTests()
    await ensureComplianceIndexes(client.db('knotic-chat'))
  })

  afterAll(async () => {
    if (!client) return
    const db = client.db('knotic-chat')
    await db.collection('consents').deleteMany({ invitationId: { $in: invitations } })
    await db.collection('demographics').deleteMany({ invitationId: { $in: invitations } })
    await db.collection('decisions').deleteMany({ organizationId: orgId })
    await client.close()
  })

  test('an accepted consent gates the interview; nothing recorded means no', async () => {
    const invitationId = new ObjectId()
    invitations.push(invitationId)

    expect(await hasAcceptedConsent(invitationId.toString())).toBe(false)

    await recordConsent({
      invitationId: invitationId.toString(),
      candidateEmail: 'Candidate@Example.com',
      accepted: true,
      userAgent: 'test-agent',
    })

    expect(await hasAcceptedConsent(invitationId.toString())).toBe(true)
  })

  test('a decline is recorded, and does not open the gate', async () => {
    const invitationId = new ObjectId()
    invitations.push(invitationId)

    await recordConsent({
      invitationId: invitationId.toString(),
      candidateEmail: 'declined@example.com',
      accepted: false,
    })

    // "They were asked and said no" is itself the compliance-relevant fact,
    // so the row exists — but it must not let them through.
    expect(await hasAcceptedConsent(invitationId.toString())).toBe(false)
    const row = await client.db('knotic-chat').collection('consents').findOne({ invitationId })
    expect(row?.accepted).toBe(false)
    expect(row?.disclosureShown).toBe(true)
  })

  test('candidate email is stored lower-cased so audits do not split one person in two', async () => {
    const invitationId = new ObjectId()
    invitations.push(invitationId)
    await recordConsent({
      invitationId: invitationId.toString(),
      candidateEmail: 'MiXeD@Example.COM',
      accepted: true,
    })
    const row = await client.db('knotic-chat').collection('consents').findOne({ invitationId })
    expect(row?.candidateEmail).toBe('mixed@example.com')
  })

  test('demographics stay one row per invitation, enforced by the index', async () => {
    const invitationId = new ObjectId()
    invitations.push(invitationId)

    await recordDemographics(invitationId.toString(), { sex: 'prefer_not_to_say', declined: true })
    const rows = await client.db('knotic-chat').collection('demographics').find({ invitationId }).toArray()
    expect(rows).toHaveLength(1)
  })

  test('a second submission overwrites the report rather than crashing', async () => {
    // The real bug this guards against: a double-click on "Agree and
    // continue" before the button disabled, a dropped response after the
    // write actually succeeded (so the client retried the whole consent
    // call), or the candidate hitting back and resubmitting. Every one of
    // those is a second call for the same invitation, and it used to insert-
    // or-crash — a 500 on an otherwise-valid consent, over an optional field.
    const invitationId = new ObjectId()
    invitations.push(invitationId)

    await recordDemographics(invitationId.toString(), { sex: 'prefer_not_to_say', declined: true })
    const first = await client.db('knotic-chat').collection('demographics').findOne({ invitationId })

    // Must not throw.
    await recordDemographics(invitationId.toString(), { sex: 'female' })

    const rows = await client.db('knotic-chat').collection('demographics').find({ invitationId }).toArray()
    expect(rows).toHaveLength(1) // still one row, not two
    expect(rows[0]?.selfReported).toEqual({ sex: 'female' }) // latest answer wins
    expect(rows[0]?.createdAt).toEqual(first?.createdAt) // first-answered time preserved
  })

  test('decisions append rather than replace, preserving the sequence', async () => {
    await appendDecision({
      organizationId: orgId.toString(),
      jobId: jobId.toString(),
      sessionId,
      actorUserId: actorId.toString(),
      action: 'review',
      reason: 'Wants a second opinion on the system design answer.',
    })
    await appendDecision({
      organizationId: orgId.toString(),
      jobId: jobId.toString(),
      sessionId,
      actorUserId: actorId.toString(),
      action: 'advance',
      reason: 'Second reviewer agreed the depth was there.',
    })

    const history = await listDecisionsForSession(orgId.toString(), sessionId)
    expect(history).toHaveLength(2)
    // Changing your mind writes a new row — the sequence IS the record.
    expect(history[0].action).toBe('review')
    expect(history[1].action).toBe('advance')
    expect(history[0].createdAt <= history[1].createdAt).toBe(true)
  })

  test('decisions are scoped to their organisation', async () => {
    const otherOrg = new ObjectId().toString()
    expect(await listDecisionsForSession(otherOrg, sessionId)).toEqual([])
  })

  test('the decision history carries no demographic data', async () => {
    // The rule at the top of compliance.ts, asserted rather than trusted.
    const history = await listDecisionsForSession(orgId.toString(), sessionId)
    for (const entry of history) {
      const keys = Object.keys(entry)
      expect(keys).not.toContain('selfReported')
      expect(keys).not.toContain('sex')
      expect(keys).not.toContain('raceEthnicity')
    }
  })
})
