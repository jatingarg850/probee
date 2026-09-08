import { type Db, ObjectId } from 'mongodb'

import { connectToDatabase } from '@/lib/mongoDb'

/**
 * Compliance capture (M0-4).
 *
 * ============================================================
 * WHY THIS EXISTS BEFORE ANYTHING READS IT
 * ============================================================
 * A bias audit needs two things that cannot be reconstructed after the fact:
 * self-reported demographics captured at invite time, and an immutable record
 * of who was advanced or rejected and why. You cannot audit what you never
 * recorded. So these collections are written from the first hiring interview
 * (M1) even though nothing reads them until the export job lands (M3-1).
 *
 * The obligations this serves, none of which are hypothetical:
 *   - NYC Local Law 144 — annual independent bias audit of selection and
 *     scoring rates by sex, race/ethnicity and their intersections; a summary
 *     published by the employer; ≥10 business days' notice to candidates.
 *   - Illinois AIVIA — notice, an explanation of the AI, and consent before
 *     the interview; deletion of the recording and all copies within 30 days
 *     of a request.
 *   - EU AI Act Annex III — candidate ranking and interview evaluation are
 *     high-risk uses, requiring documented human oversight at decision points.
 *
 * These are engineering notes, not legal advice. Confirm current statute text
 * with counsel before relying on any of it.
 *
 * ============================================================
 * THE ONE RULE THAT MUST NOT BE BROKEN
 * ============================================================
 * `demographics` is keyed by `invitationId` and MUST NEVER be joined to an
 * assessment, a score, or a candidate's identity anywhere in application code.
 * The only permitted join is inside the aggregate bias-audit export (M3-1),
 * which emits group-level rates and suppresses small cells.
 *
 * The reason is not squeamishness. If a recruiter can see a candidate's race
 * or sex next to their score, the tool stops being a fairness instrument and
 * becomes a discrimination instrument — and the very data collected to prove
 * the system is fair becomes the evidence that it is not. There is no read
 * helper in this file that returns demographics for a single candidate, and
 * one must never be added.
 */

/* ------------------------------------------------------------------ *
 * Consent
 * ------------------------------------------------------------------ */

/** Bump when the disclosure wording changes, so it is always possible to say
 * exactly what a given candidate was shown. Never reuse a version. */
export const CONSENT_POLICY_VERSION = '2026-09-01'

export interface ConsentRecord {
  _id: ObjectId
  invitationId: ObjectId
  candidateEmail: string
  policyVersion: string
  acceptedAt: Date
  /** False when the candidate read the disclosure and declined. Recorded
   * rather than discarded: "they were asked and said no" is itself the
   * compliance-relevant fact. */
  accepted: boolean
  userAgent: string | null
  disclosureShown: true
}

export async function recordConsent(input: {
  invitationId: string
  candidateEmail: string
  accepted: boolean
  userAgent?: string | null
}): Promise<void> {
  const { db } = await connectToDatabase()
  await ensureComplianceIndexes(db)
  await db.collection('consents').insertOne({
    invitationId: new ObjectId(input.invitationId),
    candidateEmail: input.candidateEmail.toLowerCase(),
    policyVersion: CONSENT_POLICY_VERSION,
    acceptedAt: new Date(),
    accepted: input.accepted,
    userAgent: input.userAgent ?? null,
    disclosureShown: true,
  })
}

/** Whether this invitation has an accepted consent on file. The gate M1-3
 * puts in front of the precheck. */
export async function hasAcceptedConsent(invitationId: string): Promise<boolean> {
  if (!ObjectId.isValid(invitationId)) return false
  const { db } = await connectToDatabase()
  const found = await db
    .collection('consents')
    .findOne({ invitationId: new ObjectId(invitationId), accepted: true }, { projection: { _id: 1 } })
  return found !== null
}

/* ------------------------------------------------------------------ *
 * Demographics  — write-only from the application's point of view
 * ------------------------------------------------------------------ */

/** Categories follow the shape NYC LL144 audits report on. All optional: the
 * questions are voluntary, and a skipped question is a valid, recorded state
 * rather than a missing row. */
export interface SelfReportedDemographics {
  sex?: string
  raceEthnicity?: string
  /** True when the candidate saw the questions and chose not to answer. Kept
   * distinct from "never asked", which the absence of a row means. */
  declined?: boolean
}

/**
 * Store a candidate's voluntary self-report.
 *
 * Upsert, not insert — the unique index on `invitationId` means a second
 * call for the same invitation is a real, expected case rather than a bug: a
 * double-click on "Agree and continue" before the button's disabled state
 * takes effect, a network response dropped after the write actually
 * succeeded (so the client retries the whole consent submission), or a
 * candidate using the browser's back button and resubmitting. In every one
 * of those, a hard insert-or-crash meant a benign resubmission of an
 * *optional* field 500'd the entire consent step and stranded the candidate
 * without the interview token their (valid) consent already earned them.
 * "What did they most recently report" is the only sensible answer to two
 * submissions anyway, so overwriting is correct, not just convenient.
 *
 * `createdAt` is set only on the first write (`$setOnInsert`), so a
 * resubmission updates what was answered without erasing when the candidate
 * first actually answered it — the fact a bias audit would want.
 *
 * There is intentionally no corresponding read-one function. See the rule at
 * the top of this file.
 */
export async function recordDemographics(invitationId: string, selfReported: SelfReportedDemographics): Promise<void> {
  const { db } = await connectToDatabase()
  await ensureComplianceIndexes(db)
  await db.collection('demographics').updateOne(
    { invitationId: new ObjectId(invitationId) },
    {
      $set: { selfReported },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  )
}

/* ------------------------------------------------------------------ *
 * Decisions — append-only
 * ------------------------------------------------------------------ */

export const DECISION_ACTIONS = ['advance', 'reject', 'review'] as const
export type DecisionAction = (typeof DECISION_ACTIONS)[number]

export interface DecisionRecord {
  _id: ObjectId
  organizationId: ObjectId
  jobId: ObjectId
  sessionId: string
  actorUserId: ObjectId
  action: DecisionAction
  reason: string
  createdAt: Date
}

/** A reason short enough to be meaningless defeats the purpose — this is the
 * artifact that demonstrates a human actually exercised oversight. */
const REASON_MIN = 10
const REASON_MAX = 2000

export function isDecisionAction(value: unknown): value is DecisionAction {
  return typeof value === 'string' && (DECISION_ACTIONS as readonly string[]).includes(value)
}

export function validateDecisionReason(reason: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const text = typeof reason === 'string' ? reason.trim() : ''
  if (text.length < REASON_MIN) {
    return {
      ok: false,
      error: `Give a reason of at least ${REASON_MIN} characters. This is recorded in the audit log.`,
    }
  }
  if (text.length > REASON_MAX) {
    return { ok: false, error: `Reason must be ${REASON_MAX} characters or fewer.` }
  }
  return { ok: true, reason: text }
}

/**
 * Append a hiring decision.
 *
 * **Append-only by construction.** There is no update and no delete, here or
 * in any route. Changing your mind writes a new row, so the sequence of
 * decisions on a candidate is itself part of the record — which is what makes
 * it usable as evidence of human oversight rather than a mutable field that
 * happens to hold the latest value.
 */
export async function appendDecision(input: {
  organizationId: string
  jobId: string
  sessionId: string
  actorUserId: string
  action: DecisionAction
  reason: string
}): Promise<void> {
  const { db } = await connectToDatabase()
  await ensureComplianceIndexes(db)
  await db.collection('decisions').insertOne({
    organizationId: new ObjectId(input.organizationId),
    jobId: new ObjectId(input.jobId),
    sessionId: input.sessionId,
    actorUserId: new ObjectId(input.actorUserId),
    action: input.action,
    reason: input.reason,
    createdAt: new Date(),
  })
}

/** Every decision made on a session, oldest first — the history M2-4 shows on
 * a candidate. Safe to expose: it contains no demographic data. */
export async function listDecisionsForSession(
  organizationId: string,
  sessionId: string,
): Promise<
  Array<
    Omit<DecisionRecord, '_id' | 'organizationId' | 'jobId' | 'actorUserId'> & {
      id: string
      actorUserId: string
    }
  >
> {
  if (!ObjectId.isValid(organizationId)) return []
  const { db } = await connectToDatabase()
  const docs = await db
    .collection('decisions')
    .find({ organizationId: new ObjectId(organizationId), sessionId })
    .sort({ createdAt: 1 })
    .toArray()

  return docs.map((doc) => ({
    id: String(doc._id),
    sessionId: doc.sessionId,
    actorUserId: String(doc.actorUserId),
    action: doc.action,
    reason: doc.reason,
    createdAt: doc.createdAt,
  }))
}

/* ------------------------------------------------------------------ *
 * Indexes
 * ------------------------------------------------------------------ */

let indexesReady: Promise<void> | null = null

export async function ensureComplianceIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = Promise.all([
      db.collection('consents').createIndex({ invitationId: 1 }, { name: 'consent_invitation' }),
      // One self-report per invitation. Without this, a candidate reloading
      // the consent screen would write a second row and double-count that
      // person in every audit the export produces.
      db
        .collection('demographics')
        .createIndex({ invitationId: 1 }, { unique: true, name: 'demographics_invitation_unique' }),
      db
        .collection('decisions')
        .createIndex({ organizationId: 1, sessionId: 1, createdAt: 1 }, { name: 'decision_session' }),
      // The M3-1 export walks decisions by job over a date range.
      db
        .collection('decisions')
        .createIndex({ jobId: 1, createdAt: 1 }, { name: 'decision_job_created' }),
    ])
      .then(() => undefined)
      .catch((error) => {
        indexesReady = null
        throw error
      })
  }
  return indexesReady
}

export function resetComplianceIndexCacheForTests(): void {
  indexesReady = null
}
