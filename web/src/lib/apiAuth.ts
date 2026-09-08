import jwt from 'jsonwebtoken'

import { INTERVIEW_TOKEN_TYPE } from '@/lib/interviewToken'
import { getJwtSecret } from '@/lib/jwtSecret'
import { type OrgRole, getMembershipRole, roleAtLeast } from '@/lib/orgs'

/** Server-side authorization for the data routes under /api/chat/*.
 *
 * Those routes previously took `userId` straight off the query string with
 * no authentication of any kind, so `GET /api/chat/sessions?userId=<anyone>`
 * returned that person's full interview transcripts to an anonymous caller,
 * and `POST` let anyone overwrite a session by guessing its id. The rule now
 * is: the caller proves who they are with the same bearer token the rest of
 * the app already issues, and the id used to scope every query comes from
 * that verified token — never from client-supplied input, which is exactly
 * the field an attacker controls. */

/** The verified user id, or null when the request carries no usable token. */
export function getAuthedUserId(request: Request): string | null {
  const header = request.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null

  try {
    const decoded = jwt.verify(header.slice(7), getJwtSecret()) as { userId?: unknown; typ?: unknown }

    // A candidate's interview token must never authenticate a user route.
    // It already cannot: it is signed with a *different* key (see
    // lib/interviewToken.ts), so `jwt.verify` above rejects it before this
    // line is reached. This check is the second, independent barrier — if
    // that derivation is ever changed, weakened, or accidentally made equal
    // to the user secret, a candidate still cannot read transcripts. Two
    // barriers, because the failure mode is a stranger reading somebody
    // else's interview.
    if (decoded.typ === INTERVIEW_TOKEN_TYPE) return null

    return typeof decoded.userId === 'string' && decoded.userId.length > 0 ? decoded.userId : null
  } catch {
    // Expired, tampered with, or signed by a different secret.
    return null
  }
}

/** 401 response body shared by every data route, so an expired session looks
 * the same everywhere and the client can treat it uniformly. */
export function unauthorized() {
  return Response.json({ error: 'Authentication required' }, { status: 401 })
}

/* ================================================================== *
 * Organisation-scoped authorization (M0-2)
 * ================================================================== */

export interface OrgContext {
  userId: string
  organizationId: string
  role: OrgRole
}

/**
 * Resolve the caller's context within an organisation, or null.
 *
 * **The role is read from the database on every request, never from the
 * token.** Tokens here live seven days. A role baked into a JWT would keep
 * working for up to a week after the person was demoted or removed — which is
 * exactly the window an attacker wants, and exactly the incident an
 * organisation would expect revocation to prevent.
 *
 * The organisation id always arrives from the URL (client-controlled) and is
 * only ever *validated* against a membership. It is never used to widen what
 * the caller can see, only to narrow it.
 */
export async function getOrgContext(request: Request, organizationId: string): Promise<OrgContext | null> {
  const userId = getAuthedUserId(request)
  if (!userId) return null

  const role = await getMembershipRole(organizationId, userId)
  if (!role) return null

  return { userId, organizationId, role }
}

/**
 * Not-found response used for *both* "no such organisation" and "you are not a
 * member of it".
 *
 * Deliberately indistinguishable. A 403 would confirm that a given
 * organisation id is real, letting anyone enumerate which organisations exist
 * by probing ids. A membership check that leaks the thing it is protecting is
 * not much of a check.
 */
export function orgNotFound() {
  return Response.json({ error: 'Organisation not found' }, { status: 404 })
}

/** 403 for a caller who *is* a member but lacks the privilege for this action.
 * Safe to distinguish here: they already know the organisation exists. */
export function insufficientRole(required: OrgRole) {
  return Response.json({ error: `This action requires the ${required} role or higher.` }, { status: 403 })
}

/**
 * Guard for an org-scoped route.
 *
 * Returns either a ready-to-return `Response` (the request is rejected) or the
 * caller's context. Written this way so a route reads as one early return
 * rather than three nested conditionals, and so no route can accidentally
 * continue after a failed check.
 *
 * ```ts
 * const gate = await requireOrgMember(request, orgId, 'recruiter')
 * if (gate instanceof Response) return gate
 * // gate.role is now guaranteed to be recruiter or higher
 * ```
 */
export async function requireOrgMember(
  request: Request,
  organizationId: string,
  minimumRole: OrgRole = 'viewer',
): Promise<OrgContext | Response> {
  if (!getAuthedUserId(request)) return unauthorized()

  const context = await getOrgContext(request, organizationId)
  if (!context) return orgNotFound()
  if (!roleAtLeast(context.role, minimumRole)) return insufficientRole(minimumRole)

  return context
}
