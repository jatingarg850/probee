import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import jwt from 'jsonwebtoken'
import { MongoClient, ObjectId } from 'mongodb'

import { getAuthedUserId, getOrgContext, requireOrgMember } from '@/lib/apiAuth'
import { createOrganization, ensureOrgIndexes, resetOrgIndexCacheForTests } from '@/lib/orgs'

/**
 * M0-2 acceptance. The rules under test are the ones that would be a security
 * incident if they regressed, not the happy path.
 */

const SECRET = process.env.JWT_SECRET
const MONGO_URI = process.env.MONGODB_URI

function bearer(token: string): Request {
  return new Request('https://example.test/api/orgs/x/jobs', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function tokenFor(userId: string): string {
  return jwt.sign({ userId, email: 'test@example.com' }, SECRET as string, { expiresIn: '5m' })
}

const describeAuth = SECRET ? describe : describe.skip

describeAuth('getAuthedUserId', () => {
  test('accepts a well-formed token', () => {
    const id = new ObjectId().toString()
    expect(getAuthedUserId(bearer(tokenFor(id)))).toBe(id)
  })

  test('rejects a missing, malformed or unsigned header', () => {
    expect(getAuthedUserId(new Request('https://example.test/'))).toBeNull()
    expect(
      getAuthedUserId(new Request('https://example.test/', { headers: { Authorization: 'Basic abc' } })),
    ).toBeNull()
    expect(getAuthedUserId(bearer('not-a-jwt'))).toBeNull()
  })

  test('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ userId: new ObjectId().toString() }, 'some-other-secret')
    expect(getAuthedUserId(bearer(forged))).toBeNull()
  })

  test('rejects an expired token', () => {
    const expired = jwt.sign({ userId: new ObjectId().toString() }, SECRET as string, { expiresIn: -10 })
    expect(getAuthedUserId(bearer(expired))).toBeNull()
  })

  test('rejects a token with no userId claim', () => {
    const noSubject = jwt.sign({ email: 'x@y.z' }, SECRET as string, { expiresIn: '5m' })
    expect(getAuthedUserId(bearer(noSubject))).toBeNull()
  })
})

const describeDb = SECRET && MONGO_URI ? describe : describe.skip

describeDb('requireOrgMember (M0-2)', () => {
  let client: MongoClient
  const owner = new ObjectId().toString()
  const outsider = new ObjectId().toString()
  const created: ObjectId[] = []
  let orgId = ''

  beforeAll(async () => {
    client = new MongoClient(MONGO_URI as string)
    await client.connect()
    resetOrgIndexCacheForTests()
    await ensureOrgIndexes(client.db('knotic-chat'))

    const result = await createOrganization(`Auth Test ${Date.now()}`, owner)
    if (!result.ok) throw new Error('fixture organisation could not be created')
    orgId = result.organization.id
    created.push(new ObjectId(orgId))
  })

  afterAll(async () => {
    if (!client) return
    const db = client.db('knotic-chat')
    await db.collection('organizations').deleteMany({ _id: { $in: created } })
    await db.collection('memberships').deleteMany({ organizationId: { $in: created } })
    await client.close()
  })

  test('a member gets their role, read from the database', async () => {
    const context = await getOrgContext(bearer(tokenFor(owner)), orgId)
    expect(context).not.toBeNull()
    expect(context?.role).toBe('owner')
    expect(context?.userId).toBe(owner)
  })

  test('an unauthenticated caller gets 401', async () => {
    const gate = await requireOrgMember(new Request('https://example.test/'), orgId)
    expect(gate).toBeInstanceOf(Response)
    expect((gate as Response).status).toBe(401)
  })

  test('a non-member gets 404, NOT 403', async () => {
    // A 403 would confirm the organisation exists, letting anyone enumerate
    // organisation ids by probing. This is the important assertion in the file.
    const gate = await requireOrgMember(bearer(tokenFor(outsider)), orgId)
    expect(gate).toBeInstanceOf(Response)
    expect((gate as Response).status).toBe(404)
  })

  test('a non-existent organisation is indistinguishable from one you cannot see', async () => {
    const ghost = new ObjectId().toString()
    const missing = await requireOrgMember(bearer(tokenFor(owner)), ghost)
    const forbidden = await requireOrgMember(bearer(tokenFor(outsider)), orgId)
    expect((missing as Response).status).toBe((forbidden as Response).status)
  })

  test('a malformed organisation id is rejected, not crashed on', async () => {
    const gate = await requireOrgMember(bearer(tokenFor(owner)), 'not-an-object-id')
    expect((gate as Response).status).toBe(404)
  })

  test('an owner satisfies every minimum role', async () => {
    for (const role of ['viewer', 'hiring_manager', 'recruiter', 'owner'] as const) {
      const gate = await requireOrgMember(bearer(tokenFor(owner)), orgId, role)
      expect(gate).not.toBeInstanceOf(Response)
    }
  })

  test('a demotion takes effect immediately, without waiting for the token to expire', async () => {
    // The whole reason role is not a JWT claim. The token below is still
    // perfectly valid and unexpired.
    const token = tokenFor(owner)
    const memberships = client.db('knotic-chat').collection('memberships')
    await memberships.updateOne(
      { organizationId: new ObjectId(orgId), userId: new ObjectId(owner) },
      { $set: { role: 'viewer' } },
    )

    const gate = await requireOrgMember(bearer(token), orgId, 'recruiter')
    expect(gate).toBeInstanceOf(Response)
    expect((gate as Response).status).toBe(403)

    // ...and a revoked membership locks them out entirely, same token.
    await memberships.deleteOne({ organizationId: new ObjectId(orgId), userId: new ObjectId(owner) })
    const after = await requireOrgMember(bearer(token), orgId, 'viewer')
    expect((after as Response).status).toBe(404)
  })
})
