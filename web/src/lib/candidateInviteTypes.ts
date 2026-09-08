/**
 * Candidate-invite constants shared between the server (`candidateInvites.ts`,
 * which pulls in the MongoDB driver) and client components that need the same
 * bounds without pulling that driver into the browser bundle — same split as
 * `jobTypes.ts` (pure) vs `jobs.ts` (DB-backed).
 */

export const CANDIDATE_INVITE_TTL_DAYS_DEFAULT = 21
export const CANDIDATE_INVITE_TTL_DAYS_MIN = 1
export const CANDIDATE_INVITE_TTL_DAYS_MAX = 90

/** Coerces anything a client might send into a valid TTL, silently — an
 * out-of-range or missing value falls back to the default rather than
 * rejecting the whole invite batch over one bad number. */
export function clampInviteTtlDays(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return CANDIDATE_INVITE_TTL_DAYS_DEFAULT
  return Math.min(CANDIDATE_INVITE_TTL_DAYS_MAX, Math.max(CANDIDATE_INVITE_TTL_DAYS_MIN, Math.round(num)))
}
