'use client'

import type { RTMClient } from 'agora-rtm'
import dynamic from 'next/dynamic'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { AssessmentResults } from '@/components/AssessmentResults'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InterviewPrecheck } from '@/components/InterviewPrecheck'
import { InterviewRejected } from '@/components/InterviewRejected'
import { InterviewSetupForm } from '@/components/InterviewSetupForm'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { ProctoringOverlay } from '@/components/ProctoringOverlay'
import { useFaceGazeMonitor } from '@/hooks/useFaceGazeMonitor'
import { useInterviewLockdown } from '@/hooks/useInterviewLockdown'
import { useProctoringStrikes } from '@/hooks/useProctoringStrikes'
import { useTabHidden } from '@/hooks/useTabHidden'
import { saveSessionAssessment } from '@/lib/mongoChat'
import { preloadAllPanelAvatars } from '@/lib/preloadPanelAvatars'
import { suppressKnownConsoleNoise } from '@/lib/suppressKnownConsoleNoise'
import { getAssessment, getConfig, startAgent, stopAgent } from '@/services/api'
import type { AgoraRenewalTokens, AgoraTokenData, Assessment, InterviewSetup } from '@/types/conversation'

type View = 'setup' | 'precheck' | 'conversation' | 'assessment' | 'rejected'

const ConversationComponent = dynamic(() => import('@/components/ConversationComponent'), {
  ssr: false,
})

suppressKnownConsoleNoise()

function waitForRtmConnected(rtmClient: RTMClient, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = () => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      rtmClient.removeEventListener('status', onStatus)
      resolve()
    }

    const onStatus = (connectionStatus: { newState?: string } | { state?: string } | Record<string, unknown>) => {
      const nextState =
        typeof connectionStatus === 'object' && connectionStatus !== null
          ? 'newState' in connectionStatus
            ? connectionStatus.newState
            : 'state' in connectionStatus
              ? connectionStatus.state
              : undefined
          : undefined
      if (nextState === 'CONNECTED') {
        finish()
      }
    }

    rtmClient.addEventListener('status', onStatus)
    timer = setTimeout(finish, timeoutMs)
  })
}

function isPresenceNotReadyError(error: unknown): boolean {
  const err = error as { reason?: string; message?: string } | undefined
  const text = `${err?.reason ?? ''} ${err?.message ?? ''}`.toLowerCase()
  return text.includes('presence') && text.includes('not connect')
}

/** The RTM "CONNECTED" status only means the login link is up — the presence
 * sub-service can still take a little longer to come online, so subscribe()
 * (which joins presence by default) can transiently fail with "-13001
 * Presence service not connected" right after login even though we already
 * waited for CONNECTED. Retry a few times with backoff before giving up,
 * since the sub-service reliably catches up within a second or two. */
async function subscribeWithPresenceRetry(rtmClient: RTMClient, channelName: string, maxAttempts = 4): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await rtmClient.subscribe(channelName)
      return
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts
      if (!isPresenceNotReadyError(error) || isLastAttempt) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 400))
    }
  }
}

const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } = await import('agora-rtc-react')

    return {
      default: function AgoraProviders({ children }: { children: React.ReactNode }) {
        const clientRef = useRef<ReturnType<typeof AgoraRTC.createClient> | null>(null)
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({
            mode: 'rtc',
            codec: 'vp8',
          })
        }
        return <AgoraRTCProvider client={clientRef.current}>{children}</AgoraRTCProvider>
      },
    }
  },
  { ssr: false },
)

/** The interview call flow: setup form -> live call -> assessment. Auth is
 * already guaranteed before this ever renders (AppShell gates every route),
 * so no auth-checking here — this component only owns the call lifecycle. */
export function InterviewFlow() {
  const [view, setView] = useState<View>('setup')
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null)
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agentJoinError, setAgentJoinError] = useState(false)
  const [pendingSetup, setPendingSetup] = useState<InterviewSetup | null>(null)

  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [isAssessmentLoading, setIsAssessmentLoading] = useState(false)
  const [assessmentError, setAssessmentError] = useState<string | null>(null)

  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [forceEndSignal, setForceEndSignal] = useState<number | undefined>(undefined)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const showConversation = view === 'conversation'
  // Views that own their whole frame — their own two-column layout, their
  // own padding, sized to the viewport — rather than sitting in the centred,
  // padded, scrolling column the result screens use.
  const fullBleedView = showConversation || view === 'setup' || view === 'precheck'
  // The camera/fullscreen lifecycle spans the precheck gate AND the live
  // call, so it's lifted here (not owned by ProctoringOverlay) — otherwise
  // the camera would restart between the two screens.
  const monitorActive = view === 'precheck' || view === 'conversation'
  const faceGaze = useFaceGazeMonitor(monitorActive)
  const lockdown = useInterviewLockdown(monitorActive)
  const tabHidden = useTabHidden(showConversation)

  const handleProctoringRejected = useCallback((reason: string) => {
    setRejectionReason(reason)
    setForceEndSignal(Date.now())
  }, [])

  const strikes = useProctoringStrikes({
    active: showConversation,
    gazeAway: faceGaze.isLookingAway,
    noFace: faceGaze.noFaceSustained,
    multipleFaces: faceGaze.multipleFaces,
    tabHidden,
    fullscreenExited: !lockdown.isFullscreen,
    devToolsSuspected: lockdown.devToolsSuspected,
    onRejected: handleProctoringRejected,
  })

  useEffect(() => {
    import('agora-rtc-react').catch(() => {})
    import('agora-rtm').catch(() => {})
    // `preloadAllPanelAvatars()` only warms the .glb model *assets* — the
    // three.js/@react-three/fiber/drei rendering code itself, plus
    // PanelAvatarStage, lives entirely inside ConversationComponent's own
    // dynamic() chunk (ssr:false, code-split below), which next/dynamic in
    // this Next.js version has no built-in `.preload()` for. Left alone,
    // that whole chunk — often the heavier half of "the panel is loading"
    // — only starts fetching the instant the candidate reaches the live
    // call, which is exactly the "3D model loads after the interview
    // starts" symptom. Triggering the same `import()` specifier here warms
    // webpack's module cache early; next/dynamic's later import of the
    // identical module resolves from that cache instantly instead of
    // fetching fresh.
    import('@/components/ConversationComponent').catch(() => {})
    // Also covers reaching /interview directly (skipping the resume-analysis
    // page, which starts this same preload) — either way the panel's .glb
    // models are already warm in cache by the time the live call mounts.
    preloadAllPanelAvatars()
  }, [])

  useEffect(() => {
    if ((view === 'assessment' || view === 'rejected') && scrollContainerRef.current) {
      requestAnimationFrame(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' })
      })
    }
  }, [view])

  const handleSetupSubmit = (setup: InterviewSetup) => {
    setPendingSetup(setup)
    setError(null)
    setView('precheck')
  }

  const handleStartConversation = async (setup: InterviewSetup) => {
    setIsLoading(true)
    setError(null)
    setAgentJoinError(false)

    try {
      const config = await getConfig()
      const appId = config.app_id

      const [agentIdResult, rtm] = await Promise.all([
        startAgent(config.channel_name, Number(config.agent_uid), Number(config.uid), setup).catch((err) => {
          console.error('Failed to start interview panel:', err)
          setAgentJoinError(true)
          return undefined
        }),
        (async () => {
          const { default: AgoraRTM } = await import('agora-rtm')
          const nextRtm: RTMClient = new AgoraRTM.RTM(appId, config.uid)
          const connected = waitForRtmConnected(nextRtm)
          await nextRtm.login({ token: config.token })
          await connected
          await subscribeWithPresenceRetry(nextRtm, config.channel_name)
          return nextRtm
        })(),
      ])

      setRtmClient(rtm)
      setAgoraData({
        token: config.token,
        uid: config.uid,
        channel: config.channel_name,
        appId: config.app_id,
        agentUid: config.agent_uid,
        agentId: agentIdResult,
      })
      setView('conversation')
    } catch (nextError) {
      setError('Failed to start the interview. Please try again.')
      console.error('Error starting interview:', nextError)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTokenWillExpire = useCallback(
    async (uid: string): Promise<AgoraRenewalTokens> => {
      try {
        const channel = agoraData?.channel
        if (!channel) {
          throw new Error('Missing channel for token renewal')
        }

        const [rtcConfig, rtmConfig] = await Promise.all([
          getConfig({ channel, uid }),
          getConfig({ channel, uid: agoraData.uid }),
        ])

        return {
          rtcToken: rtcConfig.token,
          rtmToken: rtmConfig.token,
        }
      } catch (error) {
        console.error('Error renewing token:', error)
        throw error
      }
    },
    [agoraData],
  )

  const handleEndConversation = async (sessionId: string, reason?: string) => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }

    const channel = agoraData?.channel

    if (agoraData?.agentId || channel) {
      try {
        await stopAgent(agoraData.agentId ?? '', channel)
      } catch (nextError) {
        console.error('Failed to stop agent:', nextError)
      }
    }

    rtmClient?.logout().catch((err) => console.error('RTM logout error:', err))
    setRtmClient(null)
    setAgoraData(null)

    if (reason) {
      setView('rejected')
      return
    }

    setView('assessment')

    if (!channel) {
      setAssessmentError('The interview ended before it could be scored.')
      return
    }

    setAssessment(null)
    setAssessmentError(null)
    setIsAssessmentLoading(true)
    try {
      const result = await getAssessment(channel)
      setAssessment(result)
      if (!result.error) {
        saveSessionAssessment(sessionId, result).catch((nextError) =>
          console.error('Failed to save session assessment:', nextError),
        )
      }
    } catch (nextError) {
      console.error('Failed to fetch assessment:', nextError)
      setAssessmentError('Could not generate the panel assessment for this interview.')
    } finally {
      setIsAssessmentLoading(false)
    }
  }

  const handleStartNewInterview = () => {
    setAssessment(null)
    setAssessmentError(null)
    setIsAssessmentLoading(false)
    setError(null)
    setAgentJoinError(false)
    setPendingSetup(null)
    setRejectionReason(null)
    setForceEndSignal(undefined)
    setView('setup')
  }

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col bg-background text-foreground ${showConversation ? 'overflow-hidden' : ''}`}
    >
      <ProctoringOverlay active={showConversation} faceGaze={faceGaze} lockdown={lockdown} strikes={strikes} />
      {/* Three framings, not two:
       *  - the live call is locked to the frame and never scrolls;
       *  - setup and precheck lay themselves out edge-to-edge and to the
       *    full height on a wide screen, but on a phone their two columns
       *    stack into something taller than the viewport, so there they
       *    scroll normally;
       *  - the result screens sit in the centred, padded column.
       * Wrapping setup/precheck in that centred column is what boxed them
       * into a narrow card with the page scrolling around it. */}
      <div
        ref={scrollContainerRef}
        className={`flex min-h-0 flex-1 flex-col ${
          showConversation
            ? 'items-stretch justify-start overflow-hidden'
            : fullBleedView
              ? 'items-stretch justify-start overflow-y-auto lg:overflow-hidden'
              : 'items-start justify-start overflow-y-auto'
        }`}
      >
        <div
          className={`z-10 flex w-full flex-col ${
            fullBleedView
              ? `min-h-0 flex-1 items-stretch gap-0 px-0 text-left ${showConversation ? 'h-full' : 'min-h-full lg:h-full'}`
              : 'min-h-full items-center justify-start px-4 py-10 text-center'
          }`}
        >
          {view === 'setup' ? (
            <InterviewSetupForm isLoading={isLoading} error={error} onStartConversation={handleSetupSubmit} />
          ) : view === 'precheck' ? (
            <InterviewPrecheck
              faceGaze={faceGaze}
              lockdown={lockdown}
              isStarting={isLoading}
              startError={error}
              onConfirm={() => pendingSetup && handleStartConversation(pendingSetup)}
            />
          ) : view === 'rejected' ? (
            <InterviewRejected reason={rejectionReason} onStartNewInterview={handleStartNewInterview} />
          ) : view === 'assessment' ? (
            <AssessmentResults
              isLoading={isAssessmentLoading}
              error={assessmentError}
              assessment={assessment}
              onStartNewInterview={handleStartNewInterview}
            />
          ) : agoraData && rtmClient ? (
            <>
              {agentJoinError ? (
                <div className="max-w-sm rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  Failed to connect with AI agent. The conversation may not work as expected.
                </div>
              ) : null}
              <Suspense fallback={<LoadingSkeleton />}>
                <ErrorBoundary>
                  <AgoraProvider>
                    <ConversationComponent
                      agoraData={agoraData}
                      rtmClient={rtmClient}
                      onTokenWillExpire={handleTokenWillExpire}
                      onEndConversation={handleEndConversation}
                      forceEndSignal={forceEndSignal}
                      forceEndReason={rejectionReason ?? undefined}
                      durationMinutes={pendingSetup?.durationMinutes}
                    />
                  </AgoraProvider>
                </ErrorBoundary>
              </Suspense>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Failed to load conversation data.</p>
          )}
        </div>
      </div>
    </div>
  )
}
