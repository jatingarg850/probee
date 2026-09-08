import { authHeaders } from '@/lib/clientAuth'
import type { Assessment, InterviewSetup, PanelState } from '@/types/conversation'
import type { ResumeAnalysis } from '@/types/resume'
import type { SessionCost } from '@/types/session'

const API_BASE_URL = '/api'

/**
 * Every call in this file carries the bearer token.
 *
 * These routes proxy to the Python backend, which mints Agora tokens, starts
 * paid interview agents and reads back assessments. Unauthenticated, they were
 * three separate problems: anyone could start an interview agent at our
 * expense, anyone could pull a candidate's assessment by naming a channel, and
 * anyone could run resume analysis and job matching through our Gemini quota.
 *
 * `authHeaders` merges the token into whatever headers a call already needs.
 * Note that a `FormData` body must be sent with NO `Content-Type` at all — the
 * browser sets it, including the multipart boundary, and naming it by hand
 * produces a body the server cannot parse.
 */

export interface GetConfigResponse {
  app_id: string
  token: string
  uid: string
  channel_name: string
  agent_uid: string
}

export async function getConfig(options?: { channel?: string; uid?: string | number }): Promise<GetConfigResponse> {
  const params = new URLSearchParams()
  if (options?.channel !== undefined && options.channel !== '') {
    params.set('channel', options.channel)
  }
  if (options?.uid !== undefined && options.uid !== '') {
    params.set('uid', String(options.uid))
  }

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/get_config${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const result = await response.json()
  if (result.code !== 0 || !result.data) {
    throw new Error(result.msg || 'Failed to get configuration')
  }
  return result.data
}

export async function startAgent(
  channelName: string,
  rtcUid: number,
  userUid: number,
  interview?: InterviewSetup,
): Promise<string> {
  const payload = {
    channelName,
    rtcUid,
    userUid,
    role: interview?.role,
    company: interview?.company,
    jobDescription: interview?.jobDescription,
    durationMinutes: interview?.durationMinutes,
    candidateName: interview?.candidateName,
  }

  const response = await fetch(`${API_BASE_URL}/startAgent`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const result = await response.json()
  if (result.code !== 0 || !result.data?.agent_id) {
    throw new Error(result.msg || 'Failed to start agent')
  }
  return result.data.agent_id
}

export async function stopAgent(agentId: string, channelName?: string): Promise<void> {
  if (!agentId && !channelName) return

  const response = await fetch(`${API_BASE_URL}/stopAgent`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ agentId, channelName }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }
}

/** Polled during the live call to render the panel indicator. Returns null
 * once the interview has ended (404) rather than throwing, since the poller
 * calls this on an interval and a 404 just means "stop polling". */
export async function getPanelState(channelName: string): Promise<PanelState | null> {
  const response = await fetch(`${API_BASE_URL}/panelState?channelName=${encodeURIComponent(channelName)}`, {
    method: 'GET',
    headers: authHeaders(),
  })

  if (response.status === 404) return null
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const result = await response.json()
  if (result.code !== 0 || !result.data) return null
  return result.data
}

export async function getAssessment(channelName: string): Promise<Assessment> {
  const response = await fetch(`${API_BASE_URL}/getAssessment`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ channelName }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const result = await response.json()
  if (result.code !== 0 || !result.data) {
    throw new Error(result.msg || 'Failed to get assessment')
  }
  return result.data
}

/** Usage and estimated cost for a finished interview (S1).
 *
 * Best-effort by design: cost measurement must never affect what the
 * candidate sees, so a failure here returns null and the session is saved
 * without a cost record rather than the end-of-call flow erroring out.
 */
export async function getSessionCost(channelName: string): Promise<SessionCost | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/sessionCost?channelName=${encodeURIComponent(channelName)}`, {
      method: 'GET',
      headers: authHeaders(),
    })
    if (!response.ok) return null

    const result = await response.json()
    if (result.code !== 0 || !result.data) return null
    return result.data as SessionCost
  } catch (error) {
    console.warn('Could not read session cost:', error)
    return null
  }
}

export async function analyzeResume(file: File, targetRole: string): Promise<ResumeAnalysis> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('targetRole', targetRole)

  const response = await fetch(`${API_BASE_URL}/analyzeResume`, {
    method: 'POST',
    // No Content-Type: the browser must set it so the multipart boundary
    // matches the body it generated.
    headers: authHeaders(),
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: undefined }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const result = await response.json()
  if (result.code !== 0 || !result.data) {
    throw new Error(result.msg || 'Failed to analyze resume')
  }
  return result.data
}

/** Full-text scrape (BeautifulSoup, server-side) of a single job posting —
 * used right before starting a "Practice" interview for a specific listing
 * so the panel is grounded in that company's actual requirements rather
 * than the short summary from the bulk listing scrape. Best-effort: returns
 * an empty string on any failure so callers can fall back to whatever short
 * description they already have. */
export async function scrapeJobDescription(jobUrl: string): Promise<string> {
  if (!jobUrl) return ''

  try {
    const response = await fetch(`${API_BASE_URL}/jobs/description`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ job_url: jobUrl }),
    })
    if (!response.ok) return ''

    const result = await response.json()
    if (result.code !== 0 || !result.data) return ''
    return typeof result.data.description === 'string' ? result.data.description : ''
  } catch (error) {
    console.warn('Failed to scrape job description:', error)
    return ''
  }
}

export async function matchJobs(
  resumeAnalysis: ResumeAnalysis,
  jobs: Record<string, import('@/types/resume').MatchedJob[]>,
  maxJobsPerRole = 6,
): Promise<Record<string, import('@/types/resume').MatchedJob[]>> {
  const response = await fetch(`${API_BASE_URL}/matchJobs`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      resume_analysis: resumeAnalysis,
      jobs,
      max_jobs_per_role: maxJobsPerRole,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: undefined }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const result = await response.json()
  if (result.code !== 0 || !result.data) {
    throw new Error(result.msg || 'Failed to match jobs')
  }
  return result.data
}
