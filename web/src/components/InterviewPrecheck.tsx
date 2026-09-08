'use client'

import { useEffect, useState } from 'react'

import { PanelAvatarWarmup } from '@/components/PanelAvatarWarmup'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2, Circle, Eye, Maximize, XCircle } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import { useCameraPreviewRef } from '@/hooks/useCameraPreviewRef'
import type { FaceGazeMonitorState } from '@/hooks/useFaceGazeMonitor'
import type { InterviewLockdownState } from '@/hooks/useInterviewLockdown'
import { preloadAllPanelAvatars } from '@/lib/preloadPanelAvatars'

interface InterviewPrecheckProps {
  faceGaze: FaceGazeMonitorState
  lockdown: InterviewLockdownState
  onConfirm: () => void
  isStarting: boolean
  startError: string | null
}

function CheckRow({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 weight="fill" className="mt-0.5 h-[1.05rem] w-[1.05rem] shrink-0 text-success" />
      ) : (
        <Circle className="mt-0.5 h-[1.05rem] w-[1.05rem] shrink-0 text-muted-foreground/50" />
      )}
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${ok ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
        {!ok ? <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{hint}</span> : null}
      </span>
    </li>
  )
}

/** Gate between the setup form and the actual call: the candidate must
 * grant the camera, be visible to it, and enter fullscreen before the
 * interview agent is ever started — "started without fullscreen" simply
 * can't happen because handleConfirm only proceeds once requestFullscreen()
 * resolves true. */
export function InterviewPrecheck({ faceGaze, lockdown, onConfirm, isStarting, startError }: InterviewPrecheckProps) {
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const videoRef = useCameraPreviewRef(faceGaze.stream)
  const cameraReady = faceGaze.status === 'ready'
  const faceOk = cameraReady && faceGaze.faceDetected
  const canConfirm = cameraReady && faceOk && !isStarting

  // Kicked off from here (a child of InterviewFlow, which owns the
  // faceGaze hook) rather than only relying on InterviewFlow's own
  // earlier preload call — child effects run before their parent's in the
  // same commit, so this reliably starts warming the panel's .glb models
  // before useFaceGazeMonitor's own effect fires the getUserMedia prompt
  // below, whichever route the candidate took to reach this screen.
  // Fire-and-forget by design (see preloadAllPanelAvatars) — it never
  // blocks the camera check or the confirm button.
  useEffect(() => {
    preloadAllPanelAvatars()
  }, [])

  const handleConfirm = async () => {
    setFullscreenError(null)
    const entered = await lockdown.requestFullscreen()
    if (!entered) {
      setFullscreenError('Fullscreen was blocked or dismissed — please allow it to begin the interview.')
      return
    }
    onConfirm()
  }

  const blockingMessage = !cameraReady ? 'Waiting for your camera' : !faceOk ? 'Move into frame to continue' : null

  return (
    // A Fragment, not just the outer div: PanelAvatarWarmup renders its own
    // `fixed` element, which needs to be a sibling of this screen's content
    // rather than a descendant of anything the layout might clip or scroll.
    <>
      {/* Actually renders the panel's avatars into a real (hidden) WebGL
       * context for the whole time the candidate spends on this screen —
       * see PanelAvatarWarmup for why the asset-level preload above isn't
       * enough on its own. Tied to this component's lifecycle on purpose:
       * "before the camera check" means it should be running throughout
       * this screen, then go away once the call actually starts. */}
      <PanelAvatarWarmup />
      {/* Fills the frame beside the sidebar and lays out to the viewport
       * height, matching the setup form it follows — the camera preview is
       * the point of this screen, so it gets the room rather than sitting
       * as a 256px thumbnail inside a centred card. */}
      <div className="flex min-h-full w-full animate-fade-up flex-col text-left lg:h-full lg:min-h-0 lg:flex-row">
        {/* On a phone the camera comes first: seeing yourself is what tells you
         * the check is working, and it should not be below the fold. `flex-1`
         * (with the checklist fixed at `lg:order-2` on the right) is what
         * centers the preview in the middle of the screen on desktop, rather
         * than it sitting off to one side of a leading rail. */}
        <section className="order-1 flex shrink-0 items-center justify-center bg-surface/60 px-4 py-6 sm:px-8 lg:order-1 lg:min-h-0 lg:flex-1 lg:shrink lg:py-10">
          <div className="relative aspect-[4/3] w-full max-w-[34rem] overflow-hidden rounded-2xl border border-border bg-foreground shadow-lift">
            {faceGaze.status === 'error' ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
                <XCircle className="h-7 w-7 text-destructive" />
                <span className="text-sm text-background/80">{faceGaze.error}</span>
              </div>
            ) : faceGaze.status === 'loading' ? (
              // Same 4:3 frame the real camera preview fills a moment later —
              // a shimmering placeholder the exact shape of what's coming,
              // rather than a spinner floating in an empty black box.
              <div className="relative h-full w-full overflow-hidden bg-foreground/90">
                <div className="skeleton-dark absolute inset-0" />
                <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-background/70">
                  Starting camera…
                </span>
              </div>
            ) : (
              <video
                ref={videoRef}
                muted
                playsInline
                className="h-full w-full scale-x-[-1] object-cover"
                aria-label="Your camera self-view"
              />
            )}

            {/* Live status over the preview, so the thing you are looking at
             * tells you what is wrong with it. */}
            {blockingMessage && faceGaze.status === 'ready' ? (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-foreground/85 to-transparent px-4 pb-3.5 pt-8">
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-warning" />
                <span className="text-[13px] font-medium text-background">{blockingMessage}</span>
              </div>
            ) : null}
          </div>
        </section>

        {/* Live checklist, not a dismissible explainer — camera/face/fullscreen
         * status changes throughout this screen, so unlike the setup form's
         * context rail this always stays visible rather than collapsing. */}
        <aside className="order-2 flex shrink-0 flex-col justify-between border-t border-border bg-card px-6 py-6 sm:px-10 lg:order-2 lg:w-[24rem] lg:border-l lg:border-t-0 lg:py-10 xl:w-[26rem]">
          <div className="min-h-0">
            <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight text-foreground sm:text-[1.75rem]">
              Camera &amp; focus check
            </h1>
            <p className="mt-2.5 max-w-[42ch] text-[14.5px] leading-relaxed text-muted-foreground">
              The panel joins once your camera is working and the window is fullscreen.
            </p>

            <ul className="mt-7 flex flex-col gap-4">
              <CheckRow
                ok={cameraReady}
                label="Camera & microphone connected"
                hint="Allow camera and microphone access when your browser asks."
              />
              <CheckRow ok={faceOk} label="Face detected" hint="Centre yourself in the frame, in decent light." />
              <CheckRow
                ok={lockdown.isFullscreen}
                label="Fullscreen mode"
                hint="Switched on by the button below — no action needed yet."
              />
            </ul>

            <div className="mt-7 flex items-start gap-2.5 rounded-xl border border-border bg-surface/70 px-3.5 py-3 text-[12.5px] leading-5 text-muted-foreground">
              <Eye className="mt-px h-4 w-4 shrink-0 text-accent" />
              <span>
                Eye tracking runs for the whole interview. Looking away for too long, leaving fullscreen, switching
                tabs, or opening dev tools is a warning —{' '}
                <strong className="font-semibold text-foreground">three ends it</strong>.
              </span>
            </div>
          </div>

          <div className="mt-7">
            {fullscreenError || startError ? (
              <p
                role="alert"
                className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3 py-2 text-xs leading-5 text-destructive"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {fullscreenError || startError}
              </p>
            ) : null}

            <Button onClick={handleConfirm} disabled={!canConfirm} className="h-12 w-full">
              {isStarting ? (
                <>
                  <LoadingDots />
                  Assembling the panel…
                </>
              ) : (
                <>
                  <Maximize className="h-4 w-4" />
                  Enter fullscreen &amp; begin
                </>
              )}
            </Button>

            {/* Says why the button is dead instead of leaving it greyed out
             * with no explanation. */}
            {!canConfirm && !isStarting ? (
              <p className="mt-2.5 text-center text-[12.5px] text-muted-foreground">{blockingMessage}</p>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  )
}
