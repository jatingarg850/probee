import { scrapeJobDescription } from '@/services/api'
import type { MatchedJob } from '@/types/resume'

/** The interview backend only ever uses the first ~1200 characters of the
 * job description it's given (see _build_role_context in server/src/agent.py)
 * — anything past that is wasted, so there's no benefit to shipping more
 * than this through the URL. */
const MAX_JD_CHARS = 4000

/** Builds the `/interview` URL for practicing a specific job listing.
 *
 * Scrapes the listing's own page for its full description first (via
 * BeautifulSoup on the backend) so the panel is grounded in what that
 * specific company actually asked for, not just the short summary the bulk
 * "Find jobs" scrape returned. Best-effort — falls back to whatever
 * description is already on the job object if the scrape comes back empty
 * or fails, so a slow/blocked source page never blocks starting practice. */
export async function buildPracticeInterviewHref(job: MatchedJob): Promise<string> {
  const params = new URLSearchParams()
  if (job.title) params.set('role', job.title)
  if (job.company && job.company !== 'Unknown Company') params.set('company', job.company)

  const fallbackDescription = job.description || job.description_short || ''
  const scraped = job.job_url ? await scrapeJobDescription(job.job_url) : ''
  const description = (scraped || fallbackDescription).slice(0, MAX_JD_CHARS)

  if (description) params.set('jd', description)

  return `/interview?${params.toString()}`
}
