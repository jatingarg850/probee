'use client'

import { useCallback, useEffect, useRef } from 'react'

/** Attaches a MediaStream (from useFaceGazeMonitor) to a local <video>
 * element for display. Each consumer gets its own callback ref/effect, so
 * multiple on-screen previews (or one that gets swapped for another across
 * a view transition) can all show the same underlying camera feed
 * independently.
 *
 * A callback ref rather than a plain ref object: this preview can mount
 * well after the stream already exists (e.g. ProctoringOverlay renders
 * `null` — no <video> in the tree at all — for as long as the call isn't
 * live, then mounts its <video> once it is). A useEffect keyed on `stream`
 * only fires when that value changes, not when a *new* DOM node attaches
 * to an unchanged ref — so the late-mounting element never got its
 * srcObject set and stayed black. The callback ref fires exactly when the
 * node itself attaches, so it always has a chance to apply whatever stream
 * is current at that moment. */
export function useCameraPreviewRef(stream: MediaStream | null) {
  const elRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef(stream)
  streamRef.current = stream

  const attach = useCallback((el: HTMLVideoElement | null) => {
    elRef.current = el
    if (!el) return
    el.srcObject = streamRef.current
    if (streamRef.current) el.play().catch(() => {})
  }, [])

  // Still needed for the case where the <video> is already mounted and the
  // stream arrives or changes afterward.
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    el.srcObject = stream
    if (stream) el.play().catch(() => {})
  }, [stream])

  return attach
}
