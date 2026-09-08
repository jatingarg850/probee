import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'
import { backendUrl } from '@/lib/backendUrl'
/**
 * Job scraping API endpoint
 * Proxies requests to the Python backend job scraper
 */

export async function POST(request: Request) {
  const authedUserId = getAuthedUserId(request)
  if (!authedUserId) return unauthorized()

  try {
    const body = await request.json()

    const scrapeUrl = `${backendUrl()}/scrapeJobs`

    let response: Response
    try {
      response = await fetch(scrapeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch (fetchError) {
      // Not the backend URL or the raw fetch error: both can name an
      // internal host, and that has no business in a client-facing response.
      console.error('[Job Scrape] Network error reaching backend:', fetchError)
      return Response.json(
        { code: 503, msg: 'Backend service unavailable', error: 'Service unavailable.' },
        {
          status: 503,
        },
      )
    }

    if (!response.ok) {
      let errorData: { message?: string; detail?: string }
      try {
        errorData = await response.json()
      } catch {
        errorData = { message: await response.text() }
      }

      console.error('[Job Scrape] Backend returned error:', {
        status: response.status,
        error: errorData,
      })

      return Response.json(
        { code: response.status, msg: 'Backend error', error: errorData },
        { status: response.status },
      )
    }

    const data = await response.json()
    return Response.json(data)
  } catch (error) {
    console.error('[Job Scrape] Route error:', error)
    return Response.json(
      { code: 500, msg: 'Failed to scrape jobs', error: 'Could not search for jobs.' },
      {
        status: 500,
      },
    )
  }
}
