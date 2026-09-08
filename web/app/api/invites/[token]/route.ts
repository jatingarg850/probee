import { previewInvitation } from '@/lib/invites'
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rateLimit'

/**
 * What an invitation link says, before anyone signs in.
 *
 * Unauthenticated by necessity — the whole point is that the recipient may not
 * have an account yet, and asking them to sign in before telling them what
 * they are signing in for is how invitations get ignored.
 *
 * That makes the response surface worth being strict about. It returns exactly
 * three things: the organisation's name, the role on offer, and a *masked*
 * email address. Not the inviter, not the member count, not the organisation
 * id. Anyone holding the link can call this, including somebody who found it
 * rather than being sent it, so nothing here may be useful to that person.
 *
 * A wrong, expired or revoked token returns 404 with the same body as a token
 * that never existed. There is nothing to learn by trying.
 */

type RouteParams = { params: Promise<{ token: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  try {
    // The token itself is 256 bits of entropy — not brute-forceable — so this
    // isn't guarding against guessing a real one. It's stopping a scripted
    // scan (or a runaway retry loop) from generating unbounded load on an
    // endpoint that takes no credential at all.
    const limit = rateLimit(`invite-preview:${clientIp(request)}`, 30, 5 * 60_000)
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

    const { token } = await params
    const invitation = await previewInvitation(decodeURIComponent(token))
    if (!invitation) {
      return Response.json({ error: 'That invitation link is not valid or has expired.' }, { status: 404 })
    }
    return Response.json({ invitation }, { status: 200 })
  } catch (error) {
    console.error('GET /api/invites/[token] error:', error)
    return Response.json({ error: 'Could not read that invitation.' }, { status: 500 })
  }
}
