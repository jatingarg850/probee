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

export async function POST(request: Request) {
  const authedUserId = getAuthedUserId(request)
  if (!authedUserId) return unauthorized()

  try {
    const body = await request.json()

    const response = await fetch(`${BACKEND_URL}/stopAgent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      console.error('[stopAgent] Backend error:', response.status, error)
      return Response.json(error, { status: response.status })
    }

    const data = await response.json()
    return Response.json(data)
  } catch (error) {
    console.error('[stopAgent] Route error:', error)
    return Response.json({ error: 'Could not stop the interview.' }, { status: 500 })
  }
}
