import { previewCandidateInvitation } from '@/lib/candidateInvites'
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rateLimit'

/**
 * What a candidate invitation link says, before anything is agreed.
 *
 * Unauthenticated by necessity: the recipient has no account and is not going
 * to make one. That puts the whole burden on the response shape being safe to
 * show to whoever is holding the link — so it carries the organisation, the
 * role, the length, and a *masked* address, and nothing that identifies
 * another candidate or exposes the organisation's pipeline.
 *
 * A token that is expired, revoked, already completed, or for a closed job
 * returns the same 404 as one that never existed.
 */

type RouteParams = { params: Promise<{ token: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const limit = rateLimit(`candidate-preview:${clientIp(request)}`, 30, 5 * 60_000)
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

    const { token } = await params
    const invitation = await previewCandidateInvitation(decodeURIComponent(token))
    if (!invitation) {
      return Response.json({ error: 'This interview link is not valid, or it has already been used.' }, { status: 404 })
    }
    return Response.json({ invitation })
  } catch (error) {
    console.error('GET /api/candidate/[token] error:', error)
    return Response.json({ error: 'Could not open that interview link.' }, { status: 500 })
  }
}
