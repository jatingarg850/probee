/**
 * Bearer token for browser-side API calls.
 *
 * Every /api route that touches data verifies this token and scopes what it
 * reads or writes to the user it identifies — see web/src/lib/apiAuth.ts. This
 * helper is the single place the token is read out of storage, so there is one
 * thing to change if it ever moves out of localStorage.
 */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('auth_token')
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return headers
}

/** Body shape every API route in this app returns on failure. */
export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json()
    return typeof data?.error === 'string' ? data.error : fallback
  } catch {
    // A proxy error or a crashed route can return HTML or nothing at all;
    // surfacing a JSON parse failure would hide the real problem.
    return fallback
  }
}
