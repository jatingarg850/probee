import crypto from 'node:crypto'

import jwt from 'jsonwebtoken'

import { getJwtSecret } from '@/lib/jwtSecret'

/**
 * The credential a candidate holds during a hiring interview (M1-1).
 *
 * ============================================================
 * WHY THIS IS NOT A USER TOKEN
 * ============================================================
 * A candidate has no PROBE account. They arrive from an emailed link, sit an
 * interview, and leave. Giving them a user JWT to do that would mean handing
 * an unauthenticated stranger a credential that every `/api/chat/*` route
 * accepts — and those routes return interview transcripts.
 *
 * So this is a deliberately *different* credential:
 *
 *   - It carries `invitationId`, `jobId` and `organizationId`. It has no
 *     `userId`, because there is no user.
 *   - It is signed with a **different key**, derived from JWT_SECRET but not
 *     equal to it. `jwt.verify(interviewToken, getJwtSecret())` therefore
 *     fails at the signature — not at a claim check somebody could later
 *     refactor away.
 *   - It travels in `X-Interview-Token`, never `Authorization`. A header that
 *     no user route reads cannot be confused for one that they do.
 *   - It lives three hours. Long enough for a candidate to read the
 *     disclosure, do a camera check and sit a 45-minute interview; short
 *     enough that a token pulled out of a browser session later is dead.
 *
 * The derived key is the load-bearing part. The `typ` claim below is a second,
 * independent barrier — `getAuthedUserId` rejects it explicitly — but a
 * convention like that survives only as long as everyone remembers it. A key
 * mismatch survives on its own.
 */

/**
 * A separate signing key, derived rather than configured.
 *
 * HKDF-style: one more environment variable is one more thing to forget in a
 * deployment, and a *missing* second secret that silently fell back to the
 * first would defeat the entire separation. Deriving it means the separation
 * cannot be misconfigured — it either works or the server has no JWT secret at
 * all and nothing works.
 */
function getInterviewTokenSecret(): string {
  return crypto.createHmac('sha256', getJwtSecret()).update('probe.interview-token.v1').digest('hex')
}

/** Three hours. See the note above on why not longer. */
export const INTERVIEW_TOKEN_TTL_SECONDS = 3 * 60 * 60

/** Marks the token as belonging to a candidate, not a user. Checked by
 * `getAuthedUserId` so that even a token signed with the *right* key — which
 * should be impossible — is still refused on the user routes. */
export const INTERVIEW_TOKEN_TYPE = 'interview'

export interface InterviewTokenClaims {
  invitationId: string
  jobId: string
  organizationId: string
}

export function signInterviewToken(claims: InterviewTokenClaims): string {
  return jwt.sign({ ...claims, typ: INTERVIEW_TOKEN_TYPE }, getInterviewTokenSecret(), {
    expiresIn: INTERVIEW_TOKEN_TTL_SECONDS,
  })
}

/** Claims, or null for anything expired, tampered with, or signed with the
 * user key. Never throws — an invalid token is an ordinary outcome here, not
 * an exceptional one. */
export function verifyInterviewToken(token: string): InterviewTokenClaims | null {
  if (!token) return null
  try {
    const decoded = jwt.verify(token, getInterviewTokenSecret()) as Record<string, unknown>
    if (decoded.typ !== INTERVIEW_TOKEN_TYPE) return null
    const { invitationId, jobId, organizationId } = decoded
    if (typeof invitationId !== 'string' || typeof jobId !== 'string' || typeof organizationId !== 'string') {
      return null
    }
    return { invitationId, jobId, organizationId }
  } catch {
    return null
  }
}

/** Read the candidate's credential off a request. Its own header, so a
 * candidate token can never arrive where a user token is expected. */
export function getInterviewContext(request: Request): InterviewTokenClaims | null {
  return verifyInterviewToken(request.headers.get('X-Interview-Token') ?? '')
}

/** The 401 shared by every candidate route, so an expired interview reads the
 * same everywhere. The wording is deliberately calm: the person seeing it is
 * mid-way through a job interview, and "unauthorized" is not a helpful thing
 * to say to them. */
export function interviewSessionExpired() {
  return Response.json(
    { error: 'This interview session has expired. Open your invitation link again to restart.' },
    { status: 401 },
  )
}
