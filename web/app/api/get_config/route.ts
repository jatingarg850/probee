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
    const url = new URL(request.url)
    const channel = url.searchParams.get('channel')
    const uid = url.searchParams.get('uid')

    const backendParams = new URLSearchParams()
    if (channel) backendParams.append('channel', channel)
    if (uid) backendParams.append('uid', uid)

    const backendQuery = backendParams.toString()
    const backendUrl = `${BACKEND_URL}/get_config${backendQuery ? `?${backendQuery}` : ''}`

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }))
      console.error('[get_config] Backend error:', response.status, error)
      return Response.json(error, { status: response.status })
    }

    const data = await response.json()
    return Response.json(data)
  } catch (error) {
    console.error('[get_config] Route error:', error)
    return Response.json({ error: 'Could not load the connection config.' }, { status: 500 })
  }
}
