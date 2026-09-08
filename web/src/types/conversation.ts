import type { RTMClient } from 'agora-rtm'

/** Session bootstrap from GET /api/get_config (channel + tokens + agent identity). */
export interface AgoraTokenData {
  token: string
  uid: string
  channel: string
  agentId?: string
  appId?: string // `app_id` returned by backend
  agentUid?: string // `NEXT_PUBLIC_AGENT_UID`
}

/** Candidate-provided interview setup, collected before the call starts. */
export interface InterviewSetup {
  candidateName: string
  role: string
  company?: string
  jobDescription?: string
  durationMinutes?: number
}

export interface PanelMember {
  id: string
  label: string
  active: boolean
}

/** Live snapshot from GET /api/panelState — who's speaking and why. */
export interface PanelState {
  current_interviewer: string
  current_interviewer_label: string
  panel: PanelMember[]
  last_switch_reason: string
  last_switch_action: string
}

export interface CompetencyScore {
  name: string
  score: number
  confidence: 'low' | 'medium' | 'high'
  strengths: string[]
  weaknesses: string[]
  evidence: string[]
}

export interface PanelNote {
  interviewer: string
  score: number
  summary: string
}

/** Whether the transcript supports the candidate being a fit for the role
 * they interviewed for, and — if not — what roles their demonstrated
 * strengths would suit better. */
export interface RoleFit {
  target_role: string
  is_suitable_for_target_role: boolean
  reasoning: string
  suggested_roles: string[]
}

/** One specific, checkable thing the candidate claimed, and how well they
 * actually backed it up before the topic moved on. */
export interface EvidenceItem {
  claim: string
  strength: 'strong' | 'weak' | 'missing'
}

/** Evidence Coverage/Strong/Weak/Missing/Contradictions — every number here
 * is counted from `evidence` and `contradictions` server-side, never
 * invented for this screen. Both percentages are `null` (not 0) when the
 * candidate made no checkable claims at all — a different fact from every
 * claim having gone unbacked.
 *
 * `coverage_pct` and `probed_pct` answer different questions and must be
 * shown together, not interchangeably: `coverage_pct` (strong / total) is
 * how much was CONCLUSIVELY proven, `probed_pct` (strong + weak / total) is
 * how much the panel followed up on AT ALL. A transcript with mostly weak
 * evidence shows low coverage but high probed — showing coverage alone read
 * as "the panel did nothing" when it had in fact pushed on most of what was
 * claimed, just not to a conclusive standard. */
export interface EvidenceQuality {
  coverage_pct: number | null
  probed_pct: number | null
  strong_evidence_count: number
  weak_evidence_count: number
  missing_evidence_count: number
  contradictions_count: number
}

/** What the panel actually did during the call — real counts over the
 * decisions it made, not a plausible-looking guess. This is the section
 * that demonstrates the interview adapted to the candidate's own answers
 * rather than working through a fixed script. */
export interface AdaptiveIntelligence {
  questions_asked: number
  adaptive_follow_ups: number
  interviewer_switches: number
  difficulty_adjustments: number
  evidence_probes: number
  scenario_challenges: number
}

export type DecisionType = 'follow_up' | 'evidence_probe' | 'scenario_injection' | 'new_topic'

/** One point on the "how the interview adapted" timeline — one entry per
 * question the panel actually asked, in the order it asked them. */
export interface DecisionTimelinePoint {
  index: number
  interviewer: string | null
  decision_type: DecisionType | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  switched: boolean
}

/** Final panel assessment from POST /api/getAssessment. */
export interface Assessment {
  overall_score: number | null
  competencies: CompetencyScore[]
  panel_notes: PanelNote[]
  contradictions: string[]
  recommendation: string
  role_fit?: RoleFit | null
  evidence?: EvidenceItem[]
  evidence_quality?: EvidenceQuality
  adaptive_intelligence?: AdaptiveIntelligence
  decision_timeline?: DecisionTimelinePoint[]
  error?: boolean
}

export interface AgoraRenewalTokens {
  rtcToken: string
  rtmToken: string
}

export interface ConversationComponentProps {
  agoraData: AgoraTokenData
  rtmClient: RTMClient
  onTokenWillExpire: (uid: string) => Promise<AgoraRenewalTokens>
  onEndConversation: (sessionId: string, reason?: string) => void
  /** Bump this (e.g. Date.now()) to force the call to end immediately —
   * used when proctoring hits its strike limit. Compared against its
   * previous value internally, so the initial render never triggers it. */
  forceEndSignal?: number
  /** Reason shown/recorded when forceEndSignal fires. */
  forceEndReason?: string
  /** Target interview length picked at setup. When set, the call ends
   * itself automatically once this much time has elapsed instead of
   * running indefinitely. */
  durationMinutes?: number

  /* ---- Hiring mode (M1) ------------------------------------------- *
   * Set together, or not at all. Present only when a candidate with no
   * PROBE account is sitting a hiring interview: they cannot call any
   * /api/chat route, so the whole persistence path has to be swapped for
   * one that authenticates with an interview token instead.
   *
   * Left unset, the component behaves exactly as it always has — the
   * practice product is untouched by any of this. */

  /** The session id minted by /api/candidate/start. Supplied rather than
   * generated so the invitation and the session document agree on it
   * without trusting the browser to report back. */
  sessionId?: string
  /** Called for every finalised turn instead of POSTing to
   * /api/chat/messages, which requires a user token. The candidate flow
   * accumulates turns in memory and submits them all at the end. */
  onTranscriptTurn?: (turn: {
    speaker: string
    speakerName: string
    text: string
    timestamp: number
    turnId?: number
  }) => void
  /** Replaces the end-of-call save. When provided, the component does not
   * call saveConversationSession or getSessionCost — the candidate route
   * does both server-side, where the interview token is checked. */
  onPersistSession?: (data: {
    sessionId: string
    channelId: string
    startedAt: number
    endedAt: number
    duration: number
    reason?: string
  }) => Promise<void>
}
