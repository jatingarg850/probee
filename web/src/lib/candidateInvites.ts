import crypto from 'node:crypto'

import { type Collection, type Db, type Document, ObjectId } from 'mongodb'

import { CANDIDATE_INVITE_TTL_DAYS_DEFAULT, clampInviteTtlDays } from '@/lib/candidateInviteTypes'
import { normaliseEmail } from '@/lib/invites'
import { connectToDatabase } from '@/lib/mongoDb'

/**
 * Candidate invitations — the link that lets somebody sit a hiring interview
 * without a PROBE account (M1-1).
 *
 * ============================================================
 * NOT THE SAME THING AS A TEAM INVITATION
 * ============================================================
 * `lib/invites.ts` handles inviting a *colleague* into an organisation; that
 * grants a membership and lasts forever once accepted. This handles inviting a
 * *candidate* to one interview for one job; it grants a short-lived interview
 * token and nothing else.
 *
 * They are separate collections — `invitations` and `candidateInvitations` —
 * on purpose. One table with a `kind` column would mean every membership query
 * had to remember to filter it, and the day one forgot, a candidate would have
 * a membership. The security models are opposites: a colleague is trusted with
 * the organisation's data, a candidate is the subject of it.
 *
 * ============================================================
 * TOKEN HANDLING
 * ============================================================
 * Same as team invitations, and for the same reasons: 256 bits of entropy,
 * only the SHA-256 hash is stored, the plaintext exists once in the return
 * value of `createCandidateInvitation`. Redeeming it does not consume it —
 * see `markStarted` — because a candidate whose browser crashed during the
 * camera check must be able to reopen their own link.
 *
 * What *is* single-use is the interview itself: once a session completes, the
 * invitation moves to `completed` and the link stops minting tokens. A
 * candidate cannot sit the same interview twice and keep the better score.
 *
 * ============================================================
 * ONE INVITATION PER CANDIDATE PER JOB
 * ============================================================
 * Enforced by a unique index on `(jobId, candidateEmail)`, which is what makes
 * bulk CSV invite idempotent: uploading the same list twice re-issues links to
 * the same rows rather than creating a second set of interviews for everyone.
 */

export const CANDIDATE_INVITE_TTL_DAYS = CANDIDATE_INVITE_TTL_DAYS_DEFAULT
const TOKEN_BYTES = 32

/**
 * `pending`    invited, has not opened the link
 * `consented`  read the disclosure and agreed; not yet in the call
 * `started`    the interview is running
 * `completed`  the interview finished and was scored — link is spent
 * `declined`   read the disclosure and said no
 * `revoked`    withdrawn by the recruiter
 */
export const CANDIDATE_INVITE_STATUSES = [
  'pending',
  'consented',
  'started',
  'completed',
  'declined',
  'revoked',
] as const
export type CandidateInviteStatus = (typeof CANDIDATE_INVITE_STATUSES)[number]

/** Statuses from which a candidate may still enter the interview. */
const ENTERABLE: readonly CandidateInviteStatus[] = ['pending', 'consented', 'started']

export interface CandidateInvitationRecord {
  _id: ObjectId
  organizationId: ObjectId
  jobId: ObjectId
  candidateEmail: string
  candidateName: string
  tokenHash: string
  status: CandidateInviteStatus
  expiresAt: Date
  usedAt: Date | null
  sessionId: string | null
  createdBy: ObjectId
  createdAt: Date
}

/** What the recruiter's job page shows. Never the token — that is returned
 * once, at creation, and is a hash thereafter. */
export interface CandidateInviteSummary {
  id: string
  candidateEmail: string
  candidateName: string
  status: CandidateInviteStatus
  expiresAt: Date
  createdAt: Date
  sessionId: string | null
  expired: boolean
}

/* ------------------------------------------------------------------ *
 * Indexes
 * ------------------------------------------------------------------ */

let indexesReady: Promise<void> | null = null

export async function ensureCandidateInviteIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = Promise.all([
      db
        .collection('candidateInvitations')
        .createIndex({ tokenHash: 1 }, { unique: true, name: 'candidate_invite_token_unique' }),
      // The idempotency guarantee for bulk invite. Not partial: a candidate
      // gets one invitation per job, full stop, and re-inviting reissues the
      // token on the existing row rather than creating a second interview.
      db
        .collection('candidateInvitations')
        .createIndex({ jobId: 1, candidateEmail: 1 }, { unique: true, name: 'candidate_invite_job_email_unique' }),
      db
        .collection('candidateInvitations')
        .createIndex({ organizationId: 1, createdAt: -1 }, { name: 'candidate_invite_org_created' }),
    ])
      .then(() => undefined)
      .catch((error) => {
        indexesReady = null
        throw error
      })
  }
  return indexesReady
}

export function resetCandidateInviteIndexCacheForTests(): void {
  indexesReady = null
}

async function collection(): Promise<Collection<Document>> {
  const { db } = await connectToDatabase()
  await ensureCandidateInviteIndexes(db)
  return db.collection('candidateInvitations')
}

/* ------------------------------------------------------------------ *
 * Tokens
 * ------------------------------------------------------------------ */

function mintToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url')
}

export function hashCandidateToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** The link that goes in the candidate's email. One place, so the email and
 * the recruiter's copy button can never disagree. */
export function candidateInviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/interview/${encodeURIComponent(token)}`
}

/* ------------------------------------------------------------------ *
 * Creating
 * ------------------------------------------------------------------ */

export interface CreatedCandidateInvite {
  invitation: CandidateInviteSummary
  /** Plaintext, returned once. Never readable again. */
  token: string
  /** False when this reissued a link for somebody already invited. Lets the
   * bulk importer report "12 invited, 3 reissued" honestly. */
  isNew: boolean
}

export type CreateCandidateInviteResult =
  | { ok: true; result: CreatedCandidateInvite }
  | { ok: false; error: string; status: number }

/**
 * Invite one candidate to one job.
 *
 * Upsert rather than insert. Re-inviting somebody is the normal case — the
 * first email went to spam, or the link expired — and it should replace their
 * link rather than fail on a unique index. The exception is a candidate who
 * has already *completed* the interview: reissuing there would let somebody
 * sit the same interview twice, so it is refused.
 */
export async function createCandidateInvitation(input: {
  organizationId: string
  jobId: string
  candidateEmail: unknown
  candidateName?: unknown
  createdBy: string
  /** Days until the link stops working. Defaults to
   * `CANDIDATE_INVITE_TTL_DAYS_DEFAULT`, clamped to
   * `[CANDIDATE_INVITE_TTL_DAYS_MIN, CANDIDATE_INVITE_TTL_DAYS_MAX]`. */
  expiresInDays?: number
}): Promise<CreateCandidateInviteResult> {
  if (!ObjectId.isValid(input.organizationId) || !ObjectId.isValid(input.jobId)) {
    return { ok: false, error: 'That job could not be found.', status: 404 }
  }

  const normalised = normaliseEmail(input.candidateEmail)
  if (!normalised.ok) return { ok: false, error: normalised.error, status: 400 }

  const candidateName = typeof input.candidateName === 'string' ? input.candidateName.trim().slice(0, 100) : ''

  const invitations = await collection()
  const jobObjectId = new ObjectId(input.jobId)

  const existing = await invitations.findOne({ jobId: jobObjectId, candidateEmail: normalised.email })
  if (existing?.status === 'completed') {
    return {
      ok: false,
      error: 'That candidate has already completed this interview. Invite them to a different job instead.',
      status: 409,
    }
  }

  const token = mintToken()
  const now = new Date()
  const ttlDays = clampInviteTtlDays(input.expiresInDays)
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000)

  const document = {
    organizationId: new ObjectId(input.organizationId),
    jobId: jobObjectId,
    candidateEmail: normalised.email,
    candidateName,
    tokenHash: hashCandidateToken(token),
    // Reissuing resets the status: a candidate who declined and is asked
    // again gets a genuine second chance, and their earlier decline is still
    // on record in `consents`, which is where the compliance answer lives.
    status: 'pending' satisfies CandidateInviteStatus,
    expiresAt,
    usedAt: null,
    sessionId: null,
    createdBy: new ObjectId(input.createdBy),
    createdAt: existing?.createdAt ?? now,
  }

  const result = await invitations.findOneAndUpdate(
    { jobId: jobObjectId, candidateEmail: normalised.email },
    { $set: document },
    { upsert: true, returnDocument: 'after' },
  )
  if (!result) return { ok: false, error: 'Could not create that invitation.', status: 500 }

  return {
    ok: true,
    result: {
      token,
      isNew: !existing,
      invitation: toSummary(result),
    },
  }
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export async function listCandidateInvitations(jobId: string): Promise<CandidateInviteSummary[]> {
  if (!ObjectId.isValid(jobId)) return []
  const invitations = await collection()
  const rows = await invitations
    .find({ jobId: new ObjectId(jobId) })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray()
  return rows.map(toSummary)
}

export interface CandidateInvitePreview {
  invitationId: string
  organizationId: string
  organizationName: string
  jobId: string
  jobTitle: string
  candidateName: string
  /** Masked. The page says "this was sent to a***@example.com" so the right
   * person can tell they have the right link, without publishing the address
   * to whoever else might be holding it. */
  maskedEmail: string
  status: CandidateInviteStatus
  durationMinutes: number
  /** Set once the candidate has agreed to the disclosure, so the page can skip
   * straight past the consent gate on a reload mid-interview. */
  consented: boolean
}

/**
 * Resolve a raw token to everything the candidate landing page needs.
 *
 * Unauthenticated by necessity — the whole point is that the holder has no
 * account. So the shape is minimal and the address is masked: everything here
 * is safe to show to somebody who found the link rather than being sent it,
 * and none of it identifies another candidate.
 *
 * Returns null for expired, revoked, completed or unknown tokens alike. There
 * is nothing to learn by guessing.
 */
export async function previewCandidateInvitation(token: string): Promise<CandidateInvitePreview | null> {
  if (!token) return null
  const { db } = await connectToDatabase()
  await ensureCandidateInviteIndexes(db)

  const invite = await db.collection('candidateInvitations').findOne({ tokenHash: hashCandidateToken(token) })
  if (!invite) return null
  if (!ENTERABLE.includes(invite.status as CandidateInviteStatus)) return null
  if ((invite.expiresAt as Date) < new Date()) return null

  const [job, org] = await Promise.all([
    db
      .collection('jobs')
      .findOne({ _id: invite.jobId as ObjectId }, { projection: { title: 1, durationMinutes: 1, status: 1 } }),
    db.collection('organizations').findOne({ _id: invite.organizationId as ObjectId }, { projection: { name: 1 } }),
  ])
  if (!job || !org) return null
  // A closed job stops accepting candidates. Treated as an invalid link
  // rather than a distinct error, so a recruiter closing a role does not
  // leave candidates staring at a half-working page.
  if (job.status === 'closed') return null

  const consented = await db
    .collection('consents')
    .findOne({ invitationId: invite._id as ObjectId, accepted: true }, { projection: { _id: 1 } })

  return {
    invitationId: String(invite._id),
    organizationId: String(invite.organizationId),
    organizationName: org.name as string,
    jobId: String(invite.jobId),
    jobTitle: job.title as string,
    candidateName: (invite.candidateName as string) ?? '',
    maskedEmail: maskEmail(invite.candidateEmail as string),
    status: invite.status as CandidateInviteStatus,
    durationMinutes: (job.durationMinutes as number) ?? 15,
    consented: consented !== null,
  }
}

/** The full record, by id. Server-side only — used by the candidate routes
 * after an interview token has already been verified. */
export async function getCandidateInvitation(invitationId: string): Promise<CandidateInvitationRecord | null> {
  if (!ObjectId.isValid(invitationId)) return null
  const invitations = await collection()
  const row = await invitations.findOne({ _id: new ObjectId(invitationId) })
  return (row as CandidateInvitationRecord | null) ?? null
}

/* ------------------------------------------------------------------ *
 * State transitions
 * ------------------------------------------------------------------ */

export async function markStatus(invitationId: string, status: CandidateInviteStatus): Promise<void> {
  if (!ObjectId.isValid(invitationId)) return
  const invitations = await collection()
  await invitations.updateOne({ _id: new ObjectId(invitationId) }, { $set: { status } })
}

/**
 * Record that the interview has begun.
 *
 * `usedAt` is stamped only the first time. A candidate who reloads during the
 * camera check re-enters the same invitation, and moving `usedAt` forward each
 * time would make "when did this interview actually start" unanswerable.
 */
export async function markStarted(invitationId: string, sessionId: string): Promise<void> {
  if (!ObjectId.isValid(invitationId)) return
  const invitations = await collection()
  await invitations.updateOne({ _id: new ObjectId(invitationId) }, [
    {
      $set: {
        status: 'started',
        sessionId,
        usedAt: { $ifNull: ['$usedAt', new Date()] },
      },
    },
  ])
}

/** Spend the invitation. After this the link no longer opens an interview. */
export async function markCompleted(invitationId: string, sessionId: string): Promise<void> {
  if (!ObjectId.isValid(invitationId)) return
  const invitations = await collection()
  await invitations.updateOne(
    { _id: new ObjectId(invitationId) },
    { $set: { status: 'completed' satisfies CandidateInviteStatus, sessionId } },
  )
}

export async function revokeCandidateInvitation(
  jobId: string,
  invitationId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!ObjectId.isValid(jobId) || !ObjectId.isValid(invitationId)) {
    return { ok: false, error: 'Invitation not found.', status: 404 }
  }
  const invitations = await collection()
  // Scoped by job as well as id, so a recruiter cannot revoke an invitation
  // belonging to a job in another organisation by guessing its id.
  const result = await invitations.updateOne(
    { _id: new ObjectId(invitationId), jobId: new ObjectId(jobId), status: { $ne: 'completed' } },
    { $set: { status: 'revoked' satisfies CandidateInviteStatus } },
  )
  if (result.matchedCount === 0) {
    return { ok: false, error: 'That invitation cannot be cancelled.', status: 404 }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 * Bulk
 * ------------------------------------------------------------------ */

export const MAX_BULK_INVITES = 200

/**
 * Parse a pasted list of candidates.
 *
 * Accepts `email`, `email,name` or `name <email>` per line, because those are
 * what people actually paste out of a spreadsheet or an email client. Returns
 * per-row errors rather than failing the whole batch: a recruiter with one
 * typo in row 40 should not have to redo rows 1 to 39.
 */
export function parseCandidateList(text: string): {
  rows: Array<{ email: string; name: string }>
  errors: Array<{ line: number; value: string; error: string }>
} {
  const rows: Array<{ email: string; name: string }> = []
  const errors: Array<{ line: number; value: string; error: string }> = []
  const seen = new Set<string>()

  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim()
    if (!raw) continue
    if (rows.length >= MAX_BULK_INVITES) {
      errors.push({ line: i + 1, value: raw, error: `Only ${MAX_BULK_INVITES} candidates can be invited at once.` })
      break
    }

    let email = raw
    let name = ''

    const angled = raw.match(/^(.*?)<([^>]+)>$/)
    if (angled) {
      name = angled[1].trim().replace(/^["']|["']$/g, '')
      email = angled[2].trim()
    } else if (raw.includes(',')) {
      const [first, ...rest] = raw.split(',')
      // Either order — "ada@x.com, Ada" and "Ada, ada@x.com" both occur.
      if (first.includes('@')) {
        email = first.trim()
        name = rest.join(',').trim()
      } else {
        name = first.trim()
        email = rest.join(',').trim()
      }
    }

    const normalised = normaliseEmail(email)
    if (!normalised.ok) {
      errors.push({ line: i + 1, value: raw, error: normalised.error })
      continue
    }
    // Duplicates within one paste are dropped silently rather than reported.
    // A list pasted from a spreadsheet often has them, and the database would
    // deduplicate anyway — flagging it would be noise, not information.
    if (seen.has(normalised.email)) continue
    seen.add(normalised.email)

    rows.push({ email: normalised.email, name: name.slice(0, 100) })
  }

  return { rows, errors }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function toSummary(row: Document): CandidateInviteSummary {
  return {
    id: String(row._id),
    candidateEmail: row.candidateEmail as string,
    candidateName: (row.candidateName as string) ?? '',
    status: row.status as CandidateInviteStatus,
    expiresAt: row.expiresAt as Date,
    createdAt: row.createdAt as Date,
    sessionId: (row.sessionId as string) ?? null,
    expired: (row.expiresAt as Date) < new Date(),
  }
}

function maskEmail(address: string): string {
  const [local, domain] = address.split('@')
  if (!domain) return '***'
  const head = local.slice(0, Math.min(2, local.length))
  return `${head}${'*'.repeat(Math.max(3, local.length - head.length))}@${domain}`
}
