import type { ResumeAnalysis } from '@/types/resume'

const STORAGE_PREFIX = 'probe:lastResumeAnalysis:'

/** The Opportunities page has no job-board integration of its own — it
 * reuses whatever the Gemini resume analysis (run from Resume Analysis or
 * the interview setup form) already grounded in the candidate's actual
 * resume, so it doesn't need to re-fetch or fabricate listings. Scoped per
 * user so one browser can't leak another account's analysis. */
export function saveResumeAnalysis(userId: string, analysis: ResumeAnalysis) {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify({ analysis, savedAt: Date.now() }))
  } catch (error) {
    console.warn('Could not cache resume analysis:', error)
  }
}

export function loadResumeAnalysis(userId: string): { analysis: ResumeAnalysis; savedAt: number } | null {
  if (typeof window === 'undefined' || !userId) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userId)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (error) {
    console.warn('Could not read cached resume analysis:', error)
    return null
  }
}
