'use client'

import type { RTMClient } from 'agora-rtm'
import dynamic from 'next/dynamic'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InterviewPrecheck } from '@/components/InterviewPrecheck'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { ProctoringOverlay } from '@/components/ProctoringOverlay'
import { CandidateConsent } from '@/components/candidate/CandidateConsent'
import { CandidateDone } from '@/components/candidate/CandidateDone'
import { AlertCircle } from '@/components/ui/icons'
import { useFaceGazeMonitor } from '@/hooks/useFaceGazeMonitor'
import { useInterviewLockdown } from '@/hooks/useInterviewLockdown'
import { useProctoringStrikes } from '@/hooks/useProctoringStrikes'
import { useTabHidden } from '@/hooks/useTabHidden'
import { readApiError } from '@/lib/clientAuth'
import { preloadAllPanelAvatars } from '@/lib/preloadPanelAvatars'
import { suppressKnownConsoleNoise } from '@/lib/suppressKnownConsoleNoise'
import { useInterviewRecorder } from '@/lib/useInterviewRecorder'
import type { AgoraRenewalTokens, AgoraTokenData } from '@/types/conversation'

/**
 * The candidate's whole experience (M1-2 through M1-5).
 *
 * ============================================================
 * WHAT THIS IS NOT
 * ============================================================
 * It is not `InterviewFlow` with a flag. That component starts at a setup form
 * where the candidate types the role, the company and the job description they
 * want to be interviewed about — which is exactly right for practice and
 * exactly wrong here, where the employer decides all three and the candidate
 * must not be able to influence any of them.
 *
 * The two flows share the parts that are genuinely the same — the precheck,
 * the proctoring hooks, the live call — and diverge everywhere the question
 * "who is in charge of this interview?" has a different answer.
 *
 * ============================================================
 * THE STAGES
 * ============================================================
 *   checking   resolving the link
 *   invalid    expired, revoked, already sat, or never existed
 *   consent    the disclosure gate — nothing is recorded before this
 *   precheck   camera and microphone, after consent
 *   live       the interview
 *   done       a plain thank-you, with no score
 *   declined   they read it and said no
 *
 * A candidate never sees their own assessment. That is deliberate and is
 * explained in `/api/candidate/complete`.
 */

const ConversationComponent = dynamic(() => import('@/components/ConversationComponent'), { ssr: false })

suppressKnownConsoleNoise()

const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } = await import('agora-rtc-react')
    return {
      default: function AgoraProviders({ children }: { children: React.ReactNode }) {
        const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null)
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
        }
        return <AgoraRTCProvider client={clientRef.current}>{children}</AgoraRTCProvider>
      },
    }
  },
  { ssr: false },
)

type Stage = 'checking' | 'invalid' | 'consent' | 'precheck' | 'live' | 'done' | 'declined'

interface InvitePreview {
  invitationId: string
  organizationName: string
  jobTitle: string
  candidateName: string
  maskedEmail: string
  durationMinutes: number
  consented: boolean
}

interface TranscriptTurn {
  speaker: string
  speakerName: string
  text: string
  timestamp: number
  turnId?: number
}

export function CandidateInterviewPage({ token }: { token: string }) {
  const [stage, setStage] = useState<Stage>('checking')
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null)
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [agentJoinFailed, setAgentJoinFailed] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [forceEndSignal, setForceEndSignal] = useState<number | undefined>(undefined)

  /**
   * The interview token lives in a ref, not in state and not in storage.
   *
   * Not `localStorage`: it is a bearer credential for somebody else's hiring
   * process, and leaving it on a shared or public machine after the tab closes
   * is exactly the failure this design exists to avoid. Not state either —
   * nothing renders from it, and keeping it out of the render tree keeps it
   * out of React DevTools and any error-reporting snapshot of component state.
   */
  const interviewTokenRef = useRef<string | null>(null)

  /** Turns accumulate here rather than being POSTed one at a time: a candidate
   * has no user token, so `/api/chat/messages` would reject every write. */
  const turnsRef = useRef<TranscriptTurn[]>([])
  const violationsRef = useRef<Array<{ type: string; at: number }>>([])

  /**
   * Add or update one turn, collapsing repeats by `turnId`.
   *
   * `onTranscriptTurn` fires once per streaming update of a turn, not once
   * per turn — a candidate's sentence arrives as many partial callbacks as
   * it grows word by word, each with the SAME `turnId`, then one final call
   * with the complete text. The practice path never sees this problem
   * because `/api/chat/messages` upserts on `(channelId, sessionId,
   * turnId)` in Mongo; a bare `.push()` here had no equivalent, so every
   * partial update became its OWN permanent entry — a candidate's transcript
   * showed the interviewer's opening line repeated a dozen times, each copy
   * one word longer than the last, and the same for every answer. This
   * mirrors that upsert client-side: same `turnId` replaces in place, a
   * turn with no numeric id (should not happen in practice, but the type
   * allows it) is appended since there is nothing to key a replace on.
   */
  const upsertTurn = useCallback((turn: TranscriptTurn) => {
    const turns = turnsRef.current
    if (turn.turnId !== undefined) {
      const index = turns.findIndex((existing) => existing.turnId === turn.turnId)
      if (index !== -1) {
        turns[index] = turn
        return
      }
    }
    turns.push(turn)
  }, [])

  const isLive = stage === 'live'
  const monitorActive = stage === 'precheck' || isLive
  const faceGaze = useFaceGazeMonitor(monitorActive)
  const lockdown = useInterviewLockdown(monitorActive)
  const tabHidden = useTabHidden(isLive)

  const handleProctoringRejected = useCallback((reason: string) => {
    setRejectionReason(reason)
    setForceEndSignal(Date.now())
  }, [])

  const strikes = useProctoringStrikes({
    active: isLive,
    gazeAway: faceGaze.isLookingAway,
    noFace: faceGaze.noFaceSustained,
    multipleFaces: faceGaze.multipleFaces,
    tabHidden,
    fullscreenExited: !lockdown.isFullscreen,
    devToolsSuspected: lockdown.devToolsSuspected,
    onRejected: handleProctoringRejected,
  })

  /**
   * Record every strike as it happens (M1-5).
   *
   * The hook exposes only the *current* warning and a running count; it does
   * not keep a list. Appending here as the warning id changes is what turns
   * "3 strikes" into "looked away at 04:12, no face at 07:30, tab switch at
   * 09:01" — which is the difference between a number a recruiter cannot act
   * on and a timeline they can.
   */
  const lastWarningIdRef = useRef(0)
  useEffect(() => {
    const warning = strikes.warning
    if (!warning || warning.id === lastWarningIdRef.current) return
    lastWarningIdRef.current = warning.id
    violationsRef.current.push({ type: warning.type, at: Date.now() })
  }, [strikes.warning])

  useEffect(() => {
    preloadAllPanelAvatars()
    import('@/components/ConversationComponent').catch(() => {})
  }, [])

  /**
   * Recording (M1). A dedicated capture, not the low-resolution,
   * audio-stripped stream `useFaceGazeMonitor` already holds — that one is
   * 320x240 and video-only by design (see its own comment on why: it exists
   * purely to feed MediaPipe cheaply, and a second live microphone capture
   * held open for the whole interview for no reason would be wasteful). A
   * recording worth keeping needs real resolution and the candidate's voice,
   * so this opens its own `getUserMedia` once the call goes live — reusing
   * the permission already granted at precheck, so no second prompt — and
   * tears it down the moment the call ends, on every exit path (a clean
   * hang-up, a proctoring rejection, or the tab closing).
   */
  const recorder = useInterviewRecorder()
  const recordingStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!isLive) return
    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: true })
      .then((stream) => {
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        recordingStreamRef.current = stream
        recorder.start(stream)
      })
      .catch((err) => {
        // Best-effort, like everything else about recording: a candidate who
        // denies (or has already denied) the extra camera/mic grab still
        // sits the interview normally. The transcript and the score, not the
        // video, are what the assessment is built on.
        console.warn('Could not start recording:', err)
      })

    return () => {
      cancelled = true
      const stream = recordingStreamRef.current
      recordingStreamRef.current = null
      if (stream) {
        for (const track of stream.getTracks()) track.stop()
      }
    }
    // `recorder.start` specifically, not the `recorder` object — that object
    // is a fresh literal every render (see useInterviewRecorder's own
    // return), and its `state` changes to 'recording' the instant this
    // effect calls start(). Depending on the whole object would make React
    // treat that as a changed dependency and re-run this effect — tearing
    // the stream down and re-requesting getUserMedia again mid-recording.
  }, [isLive, recorder.start])

  /* ---------------- resolve the link ---------------- */

  useEffect(() => {
    let cancelled = false
    fetch(`/api/candidate/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, 'This interview link is not valid.'))
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        setPreview(data.invitation)
        setStage('consent')
      })
      .catch((err) => {
        if (cancelled) return
        setFatalError(err instanceof Error ? err.message : 'This interview link is not valid.')
        setStage('invalid')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  /* ---------------- consent ---------------- */

  const handleConsent = async (
    accepted: boolean,
    demographics?: { sex?: string; raceEthnicity?: string; declined?: boolean },
  ) => {
    // A rapid double-click (or a double-tap on mobile) can fire this twice
    // before the button's `disabled={isSubmitting}` prop has re-rendered —
    // `setIsBusy` below is not synchronous. Checked here, at the top of the
    // handler itself, rather than relying on the prop alone.
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/candidate/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, accepted, ...(accepted && demographics ? { demographics } : {}) }),
      })
      if (!response.ok) throw new Error(await readApiError(response, 'Could not record your response.'))
      const data = await response.json()

      if (!accepted) {
        setStage('declined')
        return
      }
      // The only credential a candidate ever holds, and it exists only from
      // this moment.
      interviewTokenRef.current = data.interviewToken
      setStage('precheck')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your response.')
    } finally {
      setIsBusy(false)
    }
  }

  /* ---------------- start the call ---------------- */

  const handleStart = async () => {
    const interviewToken = interviewTokenRef.current
    if (!interviewToken || isBusy) return

    setIsBusy(true)
    setError(null)
    try {
      // One call: the server fetches the job, opens the Agora room, and starts
      // the panel against that job's competencies. The browser sends nothing
      // about the interview's content — see the note in the route.
      const response = await fetch('/api/candidate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Interview-Token': interviewToken },
      })
      if (!response.ok) throw new Error(await readApiError(response, 'Could not start the interview.'))
      const data = await response.json()

      const { default: AgoraRTM } = await import('agora-rtm')
      const rtm: RTMClient = new AgoraRTM.RTM(data.agora.appId, data.agora.uid)
      await rtm.login({ token: data.agora.token })
      await rtm.subscribe(data.agora.channel).catch((rtmError: unknown) => {
        // Presence can lag the login by a second; the SDK self-heals. Failing
        // the whole interview over it would be worse than a brief gap.
        console.warn('RTM subscribe warning:', rtmError)
      })

      setRtmClient(rtm)
      setSessionId(data.sessionId)
      setAgentJoinFailed(Boolean(data.agentJoinFailed))
      setAgoraData({
        token: data.agora.token,
        uid: data.agora.uid,
        channel: data.agora.channel,
        appId: data.agora.appId,
        agentUid: data.agora.agentUid,
        agentId: data.agora.agentId,
      })
      setStage('live')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the interview.')
    } finally {
      setIsBusy(false)
    }
  }

  /* ---------------- finish ---------------- */

  const handlePersistSession = useCallback(
    async (data: {
      sessionId: string
      channelId: string
      startedAt: number
      endedAt: number
      duration: number
      reason?: string
    }) => {
      const interviewToken = interviewTokenRef.current
      if (!interviewToken) return

      const turns = turnsRef.current
      try {
        await fetch('/api/candidate/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Interview-Token': interviewToken },
          body: JSON.stringify({
            sessionId: data.sessionId,
            channelId: data.channelId,
            startedAt: data.startedAt,
            endedAt: data.endedAt,
            duration: data.duration,
            messages: turns,
            transcript: turns.map((turn) => `${turn.speakerName}: ${turn.text}`).join('\n'),
            integrity: { strikes: strikes.strikeCount, violations: violationsRef.current },
            ...(data.reason ? { terminatedReason: data.reason } : {}),
          }),
        })
      } catch (err) {
        // Nothing useful to show the candidate here — they are finished and
        // the employer's copy of the transcript is the employer's problem to
        // chase. Logged so it is visible in their console if support asks.
        console.error('Could not submit the interview:', err)
      }

      // After /api/candidate/complete, not before: that call is what
      // creates the session row this upload's key gets attached to, and the
      // route derives the key from the invitation's own sessionId rather
      // than trusting one from the browser — so the two must agree, and the
      // one place that already agrees is data.sessionId itself.
      await recorder.stopAndUpload(data.sessionId, (contentType, contentLength) =>
        fetch('/api/candidate/recording-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Interview-Token': interviewToken },
          body: JSON.stringify({ contentType, contentLength }),
        }),
      )
    },
    [strikes.strikeCount, recorder.stopAndUpload],
  )

  const handleEnd = useCallback((sessionId: string, reason?: string) => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    rtmClient?.logout().catch(() => {})
    setRtmClient(null)
    setAgoraData(null)
    // The token is spent. Clearing it means a candidate who navigates back
    // cannot start a second interview on the same invitation.
    interviewTokenRef.current = null
    setStage('done')
  }, [rtmClient])

  const handleTokenWillExpire = useCallback(async (): Promise<AgoraRenewalTokens> => {
    // Renewal needs `/api/get_config`, which requires a user token a candidate
    // does not have. Rather than build a second signed renewal path for a
    // 45-minute ceiling against a 60-minute Agora token, this rejects and the
    // SDK carries on with the token it has.
    throw new Error('Token renewal is not available in a candidate interview.')
  }, [])

  /* ---------------- render ---------------- */

  if (stage === 'checking') {
    // Shaped like the consent screen this resolves into a moment later —
    // logo, eyebrow, title, and a couple of disclosure lines — rather than a
    // spinner with no relation to what is about to appear. This is the
    // first thing a candidate with no PROBE account ever sees, so it is
    // worth it reading as "your interview is loading," not "something is
    // broken."
    return (
      <main className="min-h-dvh bg-background px-5 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-[42rem]">
          <img src="/Logo%20Svg/main%20text.svg" alt="PROBE" className="h-6 w-auto opacity-70" />
          <div className="mt-8 flex flex-col gap-3">
            <div className="skeleton h-3 w-40 rounded" />
            <div className="skeleton h-9 w-full max-w-md rounded" />
            <div className="skeleton h-4 w-full max-w-lg rounded" />
          </div>
          <div className="mt-9 flex flex-col gap-4 border-y border-border py-6">
            {['a', 'b', 'c'].map((key) => (
              <div key={key} className="flex gap-8">
                <div className="skeleton h-3.5 w-32 shrink-0 rounded" />
                <div className="skeleton h-3.5 w-full rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    )
  }

  if (stage === 'invalid') {
    return <CandidateDone variant="invalid" message={fatalError} />
  }

  if (stage === 'declined') {
    return <CandidateDone variant="declined" organizationName={preview?.organizationName} />
  }

  if (stage === 'done') {
    return (
      <CandidateDone
        variant={rejectionReason ? 'terminated' : 'complete'}
        organizationName={preview?.organizationName}
        message={rejectionReason}
      />
    )
  }

  if (stage === 'consent' && preview) {
    return (
      <CandidateConsent
        organizationName={preview.organizationName}
        jobTitle={preview.jobTitle}
        candidateName={preview.candidateName}
        durationMinutes={preview.durationMinutes}
        onDecision={handleConsent}
        isSubmitting={isBusy}
        error={error}
      />
    )
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <ProctoringOverlay active={isLive} faceGaze={faceGaze} lockdown={lockdown} strikes={strikes} />

      {stage === 'precheck' ? (
        <InterviewPrecheck
          faceGaze={faceGaze}
          lockdown={lockdown}
          isStarting={isBusy}
          startError={error}
          onConfirm={handleStart}
        />
      ) : agoraData && rtmClient && sessionId ? (
        <>
          {agentJoinFailed ? (
            <div className="mx-auto mt-3 flex max-w-sm items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              The panel could not connect. Your interview may not work as expected.
            </div>
          ) : null}
          <Suspense fallback={<LoadingSkeleton />}>
            <ErrorBoundary>
              <AgoraProvider>
                <ConversationComponent
                  agoraData={agoraData}
                  rtmClient={rtmClient}
                  onTokenWillExpire={handleTokenWillExpire}
                  onEndConversation={handleEnd}
                  forceEndSignal={forceEndSignal}
                  forceEndReason={rejectionReason ?? undefined}
                  durationMinutes={preview?.durationMinutes}
                  sessionId={sessionId}
                  onTranscriptTurn={upsertTurn}
                  onPersistSession={handlePersistSession}
                />
              </AgoraProvider>
            </ErrorBoundary>
          </Suspense>
        </>
      ) : (
        <p className="p-8 text-sm text-muted-foreground">Could not load the interview room.</p>
      )}
    </div>
  )
}
