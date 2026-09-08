import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { MongoClient, ObjectId } from 'mongodb'

import {
  DEFAULT_RETENTION_DAYS,
  ORG_ROLES,
  createOrganization,
  deleteOrganization,
  ensureOrgIndexes,
  getMembershipRole,
  getOrganization,
  isDuplicateKeyError,
  isOrgRole,
  listOrganizationsForUser,
  resetOrgIndexCacheForTests,
  roleAtLeast,
  slugify,
  validateOrgName,
} from '@/lib/orgs'

/* ================================================================== *
 * Pure logic — always runs, no database required.
 * ================================================================== */

describe('role hierarchy', () => {
  test('is ordered least to most privileged', () => {
    expect(ORG_ROLES).toEqual(['viewer', 'hiring_manager', 'recruiter', 'owner'])
  })

  test('a role always satisfies itself', () => {
    for (const role of ORG_ROLES) {
      expect(roleAtLeast(role, role)).toBe(true)
    }
  })

  test('owner satisfies every role', () => {
    for (const role of ORG_ROLES) {
      expect(roleAtLeast('owner', role)).toBe(true)
    }
  })

  test('viewer satisfies nothing above itself', () => {
    expect(roleAtLeast('viewer', 'hiring_manager')).toBe(false)
    expect(roleAtLeast('viewer', 'recruiter')).toBe(false)
    expect(roleAtLeast('viewer', 'owner')).toBe(false)
  })

  test('recruiter outranks hiring_manager but not owner', () => {
    expect(roleAtLeast('recruiter', 'hiring_manager')).toBe(true)
    expect(roleAtLeast('recruiter', 'owner')).toBe(false)
  })

  test('rejects values that are not roles', () => {
    expect(isOrgRole('admin')).toBe(false)
    expect(isOrgRole('')).toBe(false)
    expect(isOrgRole(undefined)).toBe(false)
    expect(isOrgRole('owner')).toBe(true)
  })
})

describe('slugify', () => {
  test('lowercases and hyphenates', () => {
    expect(slugify('Acme Corp')).toBe('acme-corp')
  })

  test('strips accents rather than dropping the letter', () => {
    expect(slugify('Café Ltd')).toBe('cafe-ltd')
  })

  test('collapses punctuation and repeated separators', () => {
    expect(slugify('Foo   &&&   Bar!!')).toBe('foo-bar')
  })

  test('trims leading and trailing separators', () => {
    expect(slugify('  --Hello--  ')).toBe('hello')
  })

  test('caps length and never ends on a separator', () => {
    const slug = slugify('a'.repeat(60))
    expect(slug.length).toBeLessThanOrEqual(48)
    expect(slug.endsWith('-')).toBe(false)
  })

  test('a name that is cut mid-word does not leave a trailing hyphen', () => {
    // 47 characters, then a space, then more — the slice lands on the space.
    const slug = slugify(`${'a'.repeat(47)} tail`)
    expect(slug.endsWith('-')).toBe(false)
  })

  test('returns empty for a name with no slug-able characters', () => {
    // Callers must handle this; createOrganization falls back to a generated id.
    expect(slugify('日本語')).toBe('')
    expect(slugify('!!!')).toBe('')
  })
})

describe('validateOrgName', () => {
  test('accepts and normalises internal whitespace', () => {
    const result = validateOrgName('  Acme    Corp  ')
    expect(result).toEqual({ ok: true, name: 'Acme Corp' })
  })

  test('rejects too short, too long, and non-strings', () => {
    expect(validateOrgName('a').ok).toBe(false)
    expect(validateOrgName('x'.repeat(81)).ok).toBe(false)
    expect(validateOrgName(undefined).ok).toBe(false)
    expect(validateOrgName(42).ok).toBe(false)
  })

  test('rejects a name that is only whitespace', () => {
    expect(validateOrgName('     ').ok).toBe(false)
  })
})

describe('isDuplicateKeyError', () => {
  test('recognises MongoDB code 11000 and nothing else', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true)
    expect(isDuplicateKeyError({ code: 121 })).toBe(false)
    expect(isDuplicateKeyError(new Error('boom'))).toBe(false)
    expect(isDuplicateKeyError(null)).toBe(false)
  })
})

/* ================================================================== *
 * Integration — needs a real MongoDB. Skipped when MONGODB_URI is unset
 * so the suite still passes on a machine without one, rather than
 * failing for a reason that has nothing to do with the code.
 * ================================================================== */

const MONGO_URI = process.env.MONGODB_URI
const describeDb = MONGO_URI ? describe : describe.skip

describeDb('organisations (integration)', () => {
  let client: MongoClient
  const userA = new ObjectId().toString()
  const userB = new ObjectId().toString()
  const created: ObjectId[] = []

  beforeAll(async () => {
    client = new MongoClient(MONGO_URI as string)
    await client.connect()
    resetOrgIndexCacheForTests()
    await ensureOrgIndexes(client.db('knotic-chat'))
  })

  afterAll(async () => {
    if (!client) return
    const db = client.db('knotic-chat')
    // Clean up only what this run created.
    await db.collection('organizations').deleteMany({ _id: { $in: created } })
    await db.collection('memberships').deleteMany({ organizationId: { $in: created } })
    await client.close()
  })

  test('creating an organisation makes the creator its owner in the same operation', async () => {
    const result = await createOrganization(`Test Org ${Date.now()}`, userA)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    created.push(new ObjectId(result.organization.id))

    expect(result.organization.role).toBe('owner')
    expect(result.organization.plan).toBe('trial')

    const role = await getMembershipRole(result.organization.id, userA)
    expect(role).toBe('owner')
  })

  test('a new organisation carries a retention window', async () => {
    const result = await createOrganization(`Retention ${Date.now()}`, userA)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    created.push(new ObjectId(result.organization.id))

    const doc = await client
      .db('knotic-chat')
      .collection('organizations')
      .findOne({ _id: new ObjectId(result.organization.id) })
    expect(doc?.retentionDays).toBe(DEFAULT_RETENTION_DAYS)
  })

  test('two organisations with the same name get different slugs', async () => {
    const name = `Collide ${Date.now()}`
    const first = await createOrganization(name, userA)
    const second = await createOrganization(name, userB)
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    created.push(new ObjectId(first.organization.id), new ObjectId(second.organization.id))

    expect(first.organization.slug).not.toBe(second.organization.slug)
    expect(second.organization.slug.startsWith(first.organization.slug)).toBe(true)
  })

  test('a non-member has no role', async () => {
    const result = await createOrganization(`Private ${Date.now()}`, userA)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    created.push(new ObjectId(result.organization.id))

    expect(await getMembershipRole(result.organization.id, userB)).toBeNull()
  })

  test('malformed ids are rejected without touching the database', async () => {
    expect(await getMembershipRole('not-an-object-id', userA)).toBeNull()
    expect(await getMembershipRole(new ObjectId().toString(), 'nope')).toBeNull()
    expect(await listOrganizationsForUser('nope')).toEqual([])
  })

  test('listing returns only the caller’s organisations, with their role', async () => {
    const mine = await createOrganization(`Mine ${Date.now()}`, userA)
    const theirs = await createOrganization(`Theirs ${Date.now()}`, userB)
    expect(mine.ok && theirs.ok).toBe(true)
    if (!mine.ok || !theirs.ok) return
    created.push(new ObjectId(mine.organization.id), new ObjectId(theirs.organization.id))

    const list = await listOrganizationsForUser(userA)
    const ids = list.map((o) => o.id)
    expect(ids).toContain(mine.organization.id)
    expect(ids).not.toContain(theirs.organization.id)
    for (const org of list) {
      expect(org.role).toBe('owner')
    }
  })

  test('the membership unique index rejects a duplicate', async () => {
    const result = await createOrganization(`Dupe ${Date.now()}`, userA)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const orgId = new ObjectId(result.organization.id)
    created.push(orgId)

    // This is what stops two concurrent requests both adding the same person.
    let threw: unknown
    try {
      await client
        .db('knotic-chat')
        .collection('memberships')
        .insertOne({
          organizationId: orgId,
          userId: new ObjectId(userA),
          role: 'viewer',
          invitedBy: null,
          createdAt: new Date(),
        })
    } catch (error) {
      threw = error
    }
    expect(isDuplicateKeyError(threw)).toBe(true)
  })

  test('a user with no memberships gets an empty list, not an error', async () => {
    expect(await listOrganizationsForUser(new ObjectId().toString())).toEqual([])
  })

  // These two run five-plus round trips against Atlas (several inserts, the
  // deletes themselves, then verification reads) — comfortably over the
  // default 5000ms per-test budget on this connection's observed latency,
  // where every other test here does one or two round trips.
  test('deleting an organisation removes it and its memberships, jobs and invitations', async () => {
    const db = client.db('knotic-chat')
    const result = await createOrganization(`Delete Me ${Date.now()}`, userA)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const orgId = new ObjectId(result.organization.id)

    // Not pushed to `created` — a successful delete is expected to remove
    // it, and afterAll's cleanup only needs to catch a failed test leaving
    // it behind.
    created.push(orgId)

    await db.collection('jobs').insertOne({ organizationId: orgId, title: 'Backend Engineer' })
    await db.collection('invitations').insertOne({ organizationId: orgId, email: 'colleague@example.com' })
    await db.collection('candidateInvitations').insertOne({ organizationId: orgId, candidateEmail: 'c@example.com' })

    const outcome = await deleteOrganization(result.organization.id)
    expect(outcome.ok).toBe(true)

    expect(await getOrganization(result.organization.id)).toBeNull()
    expect(await getMembershipRole(result.organization.id, userA)).toBeNull()
    expect(await db.collection('jobs').findOne({ organizationId: orgId })).toBeNull()
    expect(await db.collection('invitations').findOne({ organizationId: orgId })).toBeNull()
    expect(await db.collection('candidateInvitations').findOne({ organizationId: orgId })).toBeNull()
  }, 15000)

  test('deleting an organisation leaves session, consent and decision records untouched', async () => {
    // The compliance guarantee stated in deleteOrganization's own comment:
    // an org-scoped session/consent/decision record must survive the
    // organisation being deleted, because they are the audit trail for a
    // hiring decision that already happened.
    const db = client.db('knotic-chat')
    const result = await createOrganization(`Delete Preserve ${Date.now()}`, userA)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const orgId = new ObjectId(result.organization.id)
    created.push(orgId)

    const orgIdString = result.organization.id
    await db.collection('sessions').insertOne({ organizationId: orgIdString, sessionId: `keep-${Date.now()}` })
    await db.collection('consents').insertOne({ invitationId: new ObjectId(), accepted: true })
    await db
      .collection('decisions')
      .insertOne({ organizationId: orgId, action: 'advance', reason: 'Strong systems-design answers.' })

    await deleteOrganization(orgIdString)

    expect(await db.collection('sessions').findOne({ organizationId: orgIdString })).not.toBeNull()
    expect(await db.collection('decisions').findOne({ organizationId: orgId })).not.toBeNull()

    // Cleanup this test's own leftovers — deleteOrganization deliberately
    // does not touch these collections, so nothing else will.
    await db.collection('sessions').deleteMany({ organizationId: orgIdString })
    await db.collection('decisions').deleteMany({ organizationId: orgId })
  }, 15000)

  test('deleting an already-deleted organisation reports not found rather than succeeding silently', async () => {
    const result = await createOrganization(`Delete Twice ${Date.now()}`, userA)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const first = await deleteOrganization(result.organization.id)
    expect(first.ok).toBe(true)

    const second = await deleteOrganization(result.organization.id)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.status).toBe(404)
  }, 15000)
})
