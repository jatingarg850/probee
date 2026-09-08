import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'

/**
 * Requires a signed-in caller.
 *
 * This route forwards to the Python backend, which spends real money on the
 * other side — Agora minutes, Gemini calls, or a third-party scrape. Left
 * open, it is a way for anyone who can reach the deployment to run up our
 * bill, and in the case of the assessment and cost routes, to read a
 * candidate's interview results by naming a channel.
 *
 * The token only establishes *that* the caller is a real user. Per-session
 * ownership is enforced by the routes under /api/chat, which is where session
 * data actually lives.
 */

import { backendUrl } from '@/lib/backendUrl'

const BACKEND_URL = backendUrl()

export async function GET(request: Request) {
  const authedUserId = getAuthedUserId(request)
  if (!authedUserId) return unauthorized()

  try {
    const channelName = new URL(request.url).searchParams.get('channelName')
    if (!channelName) {
      return Response.json({ error: 'channelName is required' }, { status: 400 })
    }

    const response = await fetch(`${BACKEND_URL}/sessionCost?channelName=${encodeURIComponent(channelName)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      return Response.json(error, { status: response.status })
    }

    return Response.json(await response.json())
  } catch (error) {
    console.error('[sessionCost] Route error:', error)
    return Response.json({ error: 'Could not get the session cost.' }, { status: 500 })
  }
}
