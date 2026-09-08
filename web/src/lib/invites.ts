import crypto from 'node:crypto'

import { type Collection, type Db, type Document, ObjectId } from 'mongodb'

import { connectToDatabase } from '@/lib/mongoDb'
import { type OrgRole, isOrgRole } from '@/lib/orgTypes'
import { ensureOrgIndexes, isDuplicateKeyError } from '@/lib/orgs'

/**
 * Team invitations and membership management.
 *
 * ============================================================
 * THE TOKEN IS NEVER STORED
 * ============================================================
 * An invitation link is a bearer credential: whoever holds it can join an
 * organisation. So the database stores only `sha256(token)`, the same way a
 * password is stored. A dump of the `invitations` collection — a backup on a
 * laptop, a read-only replica, a leaked mongodump — then contains nothing that
 * can be used to join anything.
 *
 * The plaintext token exists exactly once, in the return value of
 * `createInvitation`, long enough to be put in an email and shown to the
 * inviter. It cannot be recovered afterwards; re-inviting issues a new one.
 *
 * ============================================================
 * A LINK IS NOT ENOUGH — THE EMAIL MUST MATCH
 * ============================================================
 * `acceptInvitation` checks that the signed-in user's address equals the
 * invited address. Invitation links get forwarded, pasted into group chats and
 * quoted in replies; without this check, any of those is a way into a hiring
 * organisation where the members can read candidate transcripts. The link
 * proves the invitation is real; the address proves it was for you.
 *
 * ============================================================
 * INVITATIONS EXPIRE
 * ============================================================
 * Fourteen days. An invitation that never expires is a credential sitting in
 * an inbox forever, still valid long after the person it was meant for changed
 * jobs. Expiry is enforced on read, not by a cleanup job, so a missed cron run
 * cannot leave a live token behind.
 */

export const INVITE_TTL_DAYS = 14
const TOKEN_BYTES = 32

export type InvitationStatus = 'pending' | 'accepted' | 'revoked'

export interface InvitationRecord {
  _id: ObjectId
  organizationId: ObjectId
  email: string
  role: OrgRole
  tokenHash: string
  invitedBy: ObjectId
  status: InvitationStatus
  createdAt: Date
  expiresAt: Date
  acceptedAt: Date | null
  acceptedBy: ObjectId | null
}

/** What the team page shows for a pending invitation. Never includes the
 * token — the API returns that once, on creation, and never again. */
export interface InvitationSummary {
  id: string
  email: string
  role: OrgRole
  createdAt: Date
  expiresAt: Date
  expired: boolean
}

export interface MemberSummary {
  userId: string
  name: string
  email: string
  role: OrgRole
  joinedAt: Date
}

/* ------------------------------------------------------------------ *
 * Indexes
 * ------------------------------------------------------------------ */

let indexesReady: Promise<void> | null = null

export async function ensureInviteIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = Promise.all([
      db.collection('invitations').createIndex({ tokenHash: 1 }, { unique: true, name: 'invite_token_unique' }),
      // Partial, so an org can re-invite an address whose earlier invitation
      // was revoked or accepted, while still being unable to have two live
      // invitations outstanding for the same person.
      db
        .collection('invitations')
        .createIndex(
          { organizationId: 1, email: 1 },
          {
            unique: true,
            name: 'invite_org_email_pending_unique',
            partialFilterExpression: { status: 'pending' },
          },
        ),
      db.collection('invitations').createIndex({ organizationId: 1, createdAt: -1 }, { name: 'invite_org_created' }),
    ])
      .then(() => undefined)
      .catch((error) => {
        indexesReady = null
        throw error
      })
  }
  return indexesReady
}

export function resetInviteIndexCacheForTests(): void {
  indexesReady = null
}

async function collections(): Promise<{
  db: Db
  invitations: Collection<Document>
  memberships: Collection<Document>
  users: Collection<Document>
  orgs: Collection<Document>
}> {
  const { db } = await connectToDatabase()
  await Promise.all([ensureOrgIndexes(db), ensureInviteIndexes(db)])
  return {
    db,
    invitations: db.collection('invitations'),
    memberships: db.collection('memberships'),
    users: db.collection('users'),
    orgs: db.collection('organizations'),
  }
}

/* ------------------------------------------------------------------ *
 * Tokens
 * ------------------------------------------------------------------ */

/** base64url so the token survives being pasted into a URL, an email client
 * that linkifies text, and a shell — none of which are kind to `+` or `/`. */
function mintToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url')
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Deliberately permissive.
 *
 * The only address format worth rejecting here is one that obviously is not an
 * address — a real RFC 5322 validator rejects addresses that work, and the
 * actual test of deliverability is whether the invitation arrives. Normalising
 * to lowercase matters more than the pattern, because it is what makes the
 * uniqueness index and the accept-time comparison agree.
 */
export function normaliseEmail(value: unknown): { ok: true; email: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'An email address is required.' }
  const email = value.trim().toLowerCase()
  if (email.length < 3 || email.length > 254) return { ok: false, error: 'That does not look like an email address.' }
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
    return { ok: false, error: 'That does not look like an email address.' }
  }
  return { ok: true, email }
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export async function listMembers(organizationId: string): Promise<MemberSummary[]> {
  if (!ObjectId.isValid(organizationId)) return []
  const { memberships, users } = await collections()

  const rows = await memberships.find({ organizationId: new ObjectId(organizationId) }).toArray()
  if (rows.length === 0) return []

  // One query for every member rather than one per member. Projected down to
  // name and email — nothing else about a user belongs on a team page.
  const profiles = await users
    .find({ _id: { $in: rows.map((r) => r.userId as ObjectId) } }, { projection: { name: 1, email: 1 } })
    .toArray()
  const byId = new Map(profiles.map((p) => [String(p._id), p]))

  return rows
    .map((row) => {
      const profile = byId.get(String(row.userId))
      return {
        userId: String(row.userId),
        name: (profile?.name as string) ?? 'Unknown',
        email: (profile?.email as string) ?? '',
        role: row.role as OrgRole,
        joinedAt: row.createdAt as Date,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listPendingInvitations(organizationId: string): Promise<InvitationSummary[]> {
  if (!ObjectId.isValid(organizationId)) return []
  const { invitations } = await collections()
  const now = new Date()

  const rows = await invitations
    .find({ organizationId: new ObjectId(organizationId), status: 'pending' })
    .sort({ createdAt: -1 })
    .toArray()

  return rows.map((row) => ({
    id: String(row._id),
    email: row.email as string,
    role: row.role as OrgRole,
    createdAt: row.createdAt as Date,
    expiresAt: row.expiresAt as Date,
    // Surfaced rather than hidden: an inviter needs to know why the person
    // they invited a month ago still cannot get in.
    expired: (row.expiresAt as Date) < now,
  }))
}

/** Seats in use — members plus outstanding invitations. Counting pending
 * invitations is what stops a plan limit being bypassed by inviting fifty
 * people at once and letting them all accept later. */
export async function countSeatsInUse(organizationId: string): Promise<number> {
  if (!ObjectId.isValid(organizationId)) return 0
  const { memberships, invitations } = await collections()
  const orgObjectId = new ObjectId(organizationId)

  const [members, pending] = await Promise.all([
    memberships.countDocuments({ organizationId: orgObjectId }),
    invitations.countDocuments({ organizationId: orgObjectId, status: 'pending', expiresAt: { $gt: new Date() } }),
  ])
  return members + pending
}

/* ------------------------------------------------------------------ *
 * Creating an invitation
 * ------------------------------------------------------------------ */

export type CreateInviteResult =
  | { ok: true; token: string; invitation: InvitationSummary; organizationName: string }
  | { ok: false; error: string; status: number }

export async function createInvitation(input: {
  organizationId: string
  email: unknown
  role: unknown
  invitedBy: string
  /** From the organisation's plan. Null means no limit. */
  seatLimit: number | null
}): Promise<CreateInviteResult> {
  if (!ObjectId.isValid(input.organizationId)) return { ok: false, error: 'Organisation not found.', status: 404 }

  const normalised = normaliseEmail(input.email)
  if (!normalised.ok) return { ok: false, error: normalised.error, status: 400 }
  if (!isOrgRole(input.role)) return { ok: false, error: 'Pick a role for this person.', status: 400 }

  const { invitations, memberships, users, orgs } = await collections()
  const orgObjectId = new ObjectId(input.organizationId)

  const org = await orgs.findOne({ _id: orgObjectId }, { projection: { name: 1 } })
  if (!org) return { ok: false, error: 'Organisation not found.', status: 404 }

  // Already a member? Say so plainly. This is not an enumeration risk — the
  // caller is an owner of this organisation and can see the member list.
  const existingUser = await users.findOne({ email: normalised.email }, { projection: { _id: 1 } })
  if (existingUser) {
    const alreadyIn = await memberships.findOne({ organizationId: orgObjectId, userId: existingUser._id })
    if (alreadyIn) return { ok: false, error: 'That person is already in this organisation.', status: 409 }
  }

  if (input.seatLimit !== null) {
    const inUse = await countSeatsInUse(input.organizationId)
    if (inUse >= input.seatLimit) {
      return {
        ok: false,
        error: `Your plan includes ${input.seatLimit} seats and all of them are taken. Remove someone, or move to a larger plan.`,
        status: 409,
      }
    }
  }

  const token = mintToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  const document = {
    organizationId: orgObjectId,
    email: normalised.email,
    role: input.role,
    tokenHash: hashToken(token),
    invitedBy: new ObjectId(input.invitedBy),
    status: 'pending' satisfies InvitationStatus,
    createdAt: now,
    expiresAt,
    acceptedAt: null,
    acceptedBy: null,
  }

  let insertedId: ObjectId
  try {
    const result = await invitations.insertOne(document)
    insertedId = result.insertedId
  } catch (error) {
    // The partial unique index caught a second live invitation for the same
    // address. Re-inviting someone should replace the old link, not fail — so
    // revoke what is there and try once more.
    if (isDuplicateKeyError(error)) {
      await invitations.updateOne(
        { organizationId: orgObjectId, email: normalised.email, status: 'pending' },
        { $set: { status: 'revoked' satisfies InvitationStatus } },
      )
      try {
        const retry = await invitations.insertOne(document)
        insertedId = retry.insertedId
      } catch {
        return { ok: false, error: 'That person already has an invitation. Try again in a moment.', status: 409 }
      }
    } else {
      throw error
    }
  }

  return {
    ok: true,
    token,
    organizationName: org.name as string,
    invitation: {
      id: String(insertedId),
      email: normalised.email,
      role: input.role,
      createdAt: now,
      expiresAt,
      expired: false,
    },
  }
}

/** The link that goes in the email. One place, so the email and the copy
 * button in the UI can never point at different paths. */
export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/invite/${encodeURIComponent(token)}`
}

/* ------------------------------------------------------------------ *
 * Revoking
 * ------------------------------------------------------------------ */

export async function revokeInvitation(
  organizationId: string,
  invitationId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!ObjectId.isValid(organizationId) || !ObjectId.isValid(invitationId)) {
    return { ok: false, error: 'Invitation not found.', status: 404 }
  }
  const { invitations } = await collections()

  // Scoped by organisation as well as id, so an owner of one organisation
  // cannot revoke an invitation belonging to another by guessing its id.
  const result = await invitations.updateOne(
    { _id: new ObjectId(invitationId), organizationId: new ObjectId(organizationId), status: 'pending' },
    { $set: { status: 'revoked' satisfies InvitationStatus } },
  )
  if (result.matchedCount === 0) return { ok: false, error: 'Invitation not found.', status: 404 }
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 * Accepting
 * ------------------------------------------------------------------ */

export interface InvitationPreview {
  organizationName: string
  role: OrgRole
  /** Masked. The page needs to say "this was sent to a***@example.com" so the
   * recipient can tell whether they are signed in as the right person —
   * without publishing the full address to anyone holding the link. */
  maskedEmail: string
}

/**
 * What a holder of the link may see *before* signing in.
 *
 * Only three fields, and the address is masked. Anyone with the link can call
 * this, so it must not reveal anything that would be useful to somebody who
 * found the link rather than being sent it.
 */
export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  if (!token) return null
  const { invitations, orgs } = await collections()

  const invite = await invitations.findOne({ tokenHash: hashToken(token), status: 'pending' })
  if (!invite || (invite.expiresAt as Date) < new Date()) return null

  const org = await orgs.findOne({ _id: invite.organizationId as ObjectId }, { projection: { name: 1 } })
  if (!org) return null

  return {
    organizationName: org.name as string,
    role: invite.role as OrgRole,
    maskedEmail: maskEmail(invite.email as string),
  }
}

export type AcceptInviteResult =
  | { ok: true; organizationId: string; organizationName: string; role: OrgRole }
  | { ok: false; error: string; status: number }

/**
 * Redeem an invitation for the signed-in user.
 *
 * The order is: find the live invitation, check the address matches, create
 * the membership, then mark the invitation used. Marking it used last means a
 * failure anywhere earlier leaves the invitation redeemable — the alternative
 * burns the token and locks the invitee out of an organisation they were
 * entitled to join, with no way to recover it themselves.
 */
export async function acceptInvitation(input: {
  token: string
  userId: string
  userEmail: string
}): Promise<AcceptInviteResult> {
  if (!input.token) return { ok: false, error: 'That invitation link is not valid.', status: 404 }
  if (!ObjectId.isValid(input.userId)) return { ok: false, error: 'Sign in to accept this invitation.', status: 401 }

  const { invitations, memberships, orgs } = await collections()

  const invite = await invitations.findOne({ tokenHash: hashToken(input.token), status: 'pending' })
  if (!invite) return { ok: false, error: 'That invitation is no longer valid.', status: 404 }
  if ((invite.expiresAt as Date) < new Date()) {
    return { ok: false, error: 'That invitation has expired. Ask for a new one.', status: 410 }
  }

  // The check that makes a forwarded link useless.
  if ((invite.email as string) !== input.userEmail.trim().toLowerCase()) {
    return {
      ok: false,
      error: `This invitation was sent to ${maskEmail(invite.email as string)}. Sign in with that address to accept it.`,
      status: 403,
    }
  }

  const org = await orgs.findOne({ _id: invite.organizationId as ObjectId }, { projection: { name: 1 } })
  if (!org) return { ok: false, error: 'That organisation no longer exists.', status: 404 }

  const role = isOrgRole(invite.role) ? invite.role : 'viewer'

  try {
    await memberships.insertOne({
      organizationId: invite.organizationId,
      userId: new ObjectId(input.userId),
      role,
      invitedBy: invite.invitedBy,
      createdAt: new Date(),
    })
  } catch (error) {
    // Already a member — because they clicked the link twice, or were added
    // directly in the meantime. Nothing is wrong; fall through and consume the
    // invitation so the link stops working.
    if (!isDuplicateKeyError(error)) throw error
  }

  await invitations.updateOne(
    { _id: invite._id },
    {
      $set: {
        status: 'accepted' satisfies InvitationStatus,
        acceptedAt: new Date(),
        acceptedBy: new ObjectId(input.userId),
      },
    },
  )

  return {
    ok: true,
    organizationId: String(invite.organizationId),
    organizationName: org.name as string,
    role,
  }
}

/* ------------------------------------------------------------------ *
 * Changing and removing members
 * ------------------------------------------------------------------ */

export type MemberChangeResult =
  | { ok: true; email: string; name: string; role: OrgRole }
  | { ok: false; error: string; status: number }

/**
 * Change somebody's role.
 *
 * Two guards, both about not locking an organisation out of itself:
 *
 * 1. **You cannot change your own role.** An owner demoting themselves by
 *    accident is unrecoverable without database access, and there is no
 *    legitimate reason to do it from this screen.
 * 2. **The last owner cannot be demoted.** An organisation with no owner has
 *    nobody who can add one, invite anyone, or change its settings. It is
 *    permanently stuck, and only a support ticket gets it back.
 */
export async function updateMemberRole(input: {
  organizationId: string
  targetUserId: string
  role: unknown
  actorUserId: string
}): Promise<MemberChangeResult> {
  if (!ObjectId.isValid(input.organizationId) || !ObjectId.isValid(input.targetUserId)) {
    return { ok: false, error: 'That person is not in this organisation.', status: 404 }
  }
  if (!isOrgRole(input.role)) return { ok: false, error: 'Pick a valid role.', status: 400 }
  if (input.targetUserId === input.actorUserId) {
    return { ok: false, error: 'You cannot change your own role.', status: 400 }
  }

  const { memberships, users } = await collections()
  const orgObjectId = new ObjectId(input.organizationId)
  const target = new ObjectId(input.targetUserId)

  const current = await memberships.findOne({ organizationId: orgObjectId, userId: target })
  if (!current) return { ok: false, error: 'That person is not in this organisation.', status: 404 }

  if (current.role === 'owner' && input.role !== 'owner') {
    const owners = await memberships.countDocuments({ organizationId: orgObjectId, role: 'owner' })
    if (owners <= 1) {
      return { ok: false, error: 'An organisation needs at least one owner. Promote someone else first.', status: 409 }
    }
  }

  await memberships.updateOne({ _id: current._id }, { $set: { role: input.role } })

  const profile = await users.findOne({ _id: target }, { projection: { name: 1, email: 1 } })
  return {
    ok: true,
    email: (profile?.email as string) ?? '',
    name: (profile?.name as string) ?? 'there',
    role: input.role,
  }
}

/** Remove somebody. Same last-owner guard, same reason. Removing yourself is
 * blocked here too — leaving is a different action with a different
 * confirmation, and conflating them makes an accidental click unrecoverable. */
export async function removeMember(input: {
  organizationId: string
  targetUserId: string
  actorUserId: string
}): Promise<MemberChangeResult> {
  if (!ObjectId.isValid(input.organizationId) || !ObjectId.isValid(input.targetUserId)) {
    return { ok: false, error: 'That person is not in this organisation.', status: 404 }
  }
  if (input.targetUserId === input.actorUserId) {
    return { ok: false, error: 'You cannot remove yourself from an organisation you own.', status: 400 }
  }

  const { memberships, users } = await collections()
  const orgObjectId = new ObjectId(input.organizationId)
  const target = new ObjectId(input.targetUserId)

  const current = await memberships.findOne({ organizationId: orgObjectId, userId: target })
  if (!current) return { ok: false, error: 'That person is not in this organisation.', status: 404 }

  if (current.role === 'owner') {
    const owners = await memberships.countDocuments({ organizationId: orgObjectId, role: 'owner' })
    if (owners <= 1) {
      return { ok: false, error: 'An organisation needs at least one owner.', status: 409 }
    }
  }

  const profile = await users.findOne({ _id: target }, { projection: { name: 1, email: 1 } })
  await memberships.deleteOne({ _id: current._id })

  return {
    ok: true,
    email: (profile?.email as string) ?? '',
    name: (profile?.name as string) ?? 'there',
    role: current.role as OrgRole,
  }
}

/** `ak***@example.com`. Two leading characters rather than one: enough for the
 * right recipient to recognise their own address, not enough to guess it. */
export function maskEmail(address: string): string {
  const [local, domain] = address.split('@')
  if (!domain) return '***'
  const head = local.slice(0, Math.min(2, local.length))
  return `${head}${'*'.repeat(Math.max(3, local.length - head.length))}@${domain}`
}
