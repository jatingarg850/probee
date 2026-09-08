import type { Assessment } from '@/types/conversation'

export interface SessionMessage {
  speaker: string
  speakerName: string
  text: string
  timestamp: number
  turnId?: number
}

export interface InterviewSession {
  _id: string
  sessionId: string
  channelId: string
  startedAt: number
  endedAt?: number
  duration?: number
  messages: SessionMessage[]
  transcript: string
  status: string
  result?: {
    scores?: Record<string, number>
    assessment?: string
    feedback?: string
    interviewerNotes?: string
  }
  /** Full panel assessment (score ring, competency breakdown, role fit,
   * panel notes, contradictions) attached after the call ends — see
   * saveSessionAssessment in lib/mongoChat.ts. Absent on sessions saved
   * before this existed, or if the assessment call itself failed. */
  assessment?: Assessment
  /** Usage and estimated cost (S1). Absent on sessions saved before this
   * existed, or when the cost fetch failed. */
  cost?: SessionCost

  /* Hiring context (M0-5). Present only on recruiter-product interviews;
   * a session without `organizationId` is a practice interview. */
  organizationId?: string
  jobId?: string
  invitationId?: string
  candidateEmail?: string
  integrity?: SessionIntegrity
}

/** Proctoring outcome for one interview. Computed today by
 * `useProctoringStrikes` and discarded; M1-5 persists it, because a recruiter
 * reviewing a candidate needs to know whether the interview was clean. */
export interface SessionIntegrity {
  strikes: number
  violations: Array<{ type: string; at: number }>
  /** True when the interview was ended by the strike limit rather than
   * finishing normally. */
  terminated: boolean
}

/** Usage and estimated cost for one interview (S1).
 *
 * Produced by GET /api/sessionCost after a call ends and stored on the
 * session. `measured` figures come from provider responses; `derived` figures
 * are estimated from the transcript, because Agora runs the STT/LLM/TTS loop
 * in its own infrastructure and that usage never reaches our server.
 *
 * `totalUsd` is an estimate against a dated rate card, not a bill. Re-pricing
 * history is possible because the raw usage and the card version are both
 * stored — see server/src/rates.py.
 */
export interface SessionCost {
  rateCardVersion: string
  durationMinutes: number
  handoffs: number
  measured: {
    geminiDirectCalls: number
    geminiPromptTokens: number
    geminiOutputTokens: number
    byPurpose: Record<string, { calls: number; promptTokens: number; outputTokens: number }>
  }
  derived: {
    agentWords: number
    candidateWords: number
    ttsMinutes: number
    sttMinutes: number
    convoLlmInputTokens: number
    convoLlmOutputTokens: number
  }
  breakdownUsd: {
    agora: number
    murfTts: number
    deepgramStt: number
    geminiDirect: number
    geminiConversation: number
  }
  totalUsd: number
  /** Share of the bill that is Agora's per-minute charge — the line that no
   * amount of prompt engineering can reduce. The number pricing hinges on. */
  agoraShareOfTotal: number | null
  confidence: 'derived'
}
