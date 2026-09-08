import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'
import { backendUrl } from '@/lib/backendUrl'
/**
 * Full job-posting description scrape endpoint.
 * Proxies a single job_url to the Python backend's BeautifulSoup scraper —
 * used by the Opportunities page "Practice" flow to ground the interview in
 * a specific listing's actual requirements instead of the short summary.
 */

export async function POST(request: Request) {
  const authedUserId = getAuthedUserId(request)
  if (!authedUserId) return unauthorized()

  try {
    const body = await request.json()

    let response: Response
    try {
      response = await fetch(`${backendUrl()}/scrapeJobDescription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (fetchError) {
      console.error('[Job Description Scrape] Network error reaching backend:', fetchError)
      return Response.json(
        { code: 503, msg: 'Backend service unavailable', error: 'Service unavailable.' },
        {
          status: 503,
        },
      )
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      return Response.json(
        { code: response.status, msg: 'Backend error', error: errorData },
        { status: response.status },
      )
    }

    const data = await response.json()
    return Response.json(data)
  } catch (error) {
    console.error('[Job Description Scrape] Route error:', error)
    return Response.json(
      { code: 500, msg: 'Failed to scrape job description', error: 'Could not read that listing.' },
      { status: 500 },
    )
  }
}
