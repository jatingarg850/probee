'use client'

import { AlertTriangle, Eye, GripHorizontal, Maximize, ShieldAlert, VideoOff } from '@/components/ui/icons'
import { useEffect, useState } from 'react'

import { useCameraPreviewRef } from '@/hooks/useCameraPreviewRef'
import { useDraggable } from '@/hooks/useDraggable'
import type { FaceGazeMonitorState } from '@/hooks/useFaceGazeMonitor'
import type { InterviewLockdownState } from '@/hooks/useInterviewLockdown'
import type { ProctoringStrikesState } from '@/hooks/useProctoringStrikes'

const NOTICE_VISIBLE_MS = 6000
const WARNING_VISIBLE_MS = 5000
const PIP_SIZE = { width: 240, height: 190 }

interface ProctoringOverlayProps {
  active: boolean
  faceGaze: FaceGazeMonitorState
  lockdown: InterviewLockdownState
  strikes: ProctoringStrikesState
}

/** Runs for the duration of a live interview: shows a small, draggable
 * self-view video (so it visibly reads as "the camera is on", the way a
 * real video call does), surfaces each proctoring warning as it's
 * recorded, nudges fullscreen back on if it's exited, and posts a one-time
 * consent notice explaining why the camera is active. Camera/fullscreen
 * state and strike accounting all live in the parent (InterviewFlow) so
 * they survive this component's own mount/unmount and so a rejection can
 * actually end the call — this component is purely the visual layer. */
export function ProctoringOverlay({ active, faceGaze, lockdown, strikes }: ProctoringOverlayProps) {
  const {
    stream,
    status,
    error,
    faceDetected,
    noFaceSustained,
    multipleFaces,
    isLookingAway,
    gazeAwayLevel,
    eyesDetected,
  } = faceGaze
  const { isFullscreen, requestFullscreen, devToolsSuspected } = lockdown
  const { warning, strikeCount, maxStrikes, dismissWarning } = strikes
  const [showConsentNotice, setShowConsentNotice] = useState(true)
  const videoRef = useCameraPreviewRef(stream)
  const { position, isDragging, onPointerDown, onPointerMove, onPointerUp } = useDraggable(PIP_SIZE)

  useEffect(() => {
    if (!active) return
    setShowConsentNotice(true)
    const timer = window.setTimeout(() => setShowConsentNotice(false), NOTICE_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [active])

  useEffect(() => {
    if (!warning) return
    const timer = window.setTimeout(dismissWarning, WARNING_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [warning, dismissWarning])

  if (!active) return null

  const eyesOk = status === 'ready' && eyesDetected
  const flagged = noFaceSustained || multipleFaces || isLookingAway

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4">
        {showConsentNotice ? (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs text-foreground shadow-lg backdrop-blur">
            <Eye className="h-3.5 w-3.5 shrink-0 text-primary" />
            Eye tracking is on for this practice session — it only checks that you're looking at the screen, nothing is
            recorded or sent anywhere.
          </div>
        ) : null}

        {warning ? (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2 text-xs font-medium text-warning shadow-lg backdrop-blur">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Warning {warning.strikeNumber}/{maxStrikes}: {warning.message}
          </div>
        ) : null}

        {!isFullscreen ? (
          <button
            type="button"
            onClick={() => requestFullscreen()}
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur hover:bg-surface-elevated"
          >
            <Maximize className="h-3.5 w-3.5" />
            Return to fullscreen
          </button>
        ) : null}

        {devToolsSuspected ? (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-xs font-medium text-destructive shadow-lg backdrop-blur">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            Developer tools appear to be open — please close them to continue the interview.
          </div>
        ) : null}
      </div>

      {strikeCount > 0 ? (
        <div className="pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-warning/40 bg-card px-3 py-1 text-[11px] font-medium text-warning shadow-lg backdrop-blur">
          Warnings: {strikeCount}/{maxStrikes}
        </div>
      ) : null}

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          width: PIP_SIZE.width,
          height: PIP_SIZE.height,
          touchAction: 'none',
        }}
        className={`z-50 overflow-hidden rounded-2xl border-2 bg-black shadow-[0_8px_30px_rgba(0,0,0,0.6)] transition-colors ${
          flagged ? 'border-warning/60' : 'border-border'
        } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        title="Drag to move"
      >
        {status === 'error' ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
            <VideoOff className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs leading-tight text-muted-foreground">{error}</span>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              className="pointer-events-none h-full w-full scale-x-[-1] object-cover"
              aria-label="Your camera self-view"
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center bg-gradient-to-b from-black/60 to-transparent py-1">
              <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">You</span>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        status === 'ready' && faceDetected ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    Face
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${eyesOk ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    Eyes
                  </span>
                </div>
              </div>
              {/* Fills as gaze drifts off-screen — reaches full at the
                  5s mark when a warning fires, so it's visibly obvious
                  the tracker is live rather than a static "detected" dot. */}
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-[width] duration-150 ${
                    gazeAwayLevel > 0.6 ? 'bg-amber-400' : 'bg-primary/70'
                  }`}
                  style={{ width: `${Math.round(gazeAwayLevel * 100)}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
