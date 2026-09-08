'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type ViolationType = 'gaze_away' | 'no_face' | 'multiple_faces' | 'tab_switch' | 'fullscreen_exit' | 'devtools'

export interface ProctoringWarning {
  id: number
  type: ViolationType
  message: string
  strikeNumber: number
}

const VIOLATION_MESSAGES: Record<ViolationType, string> = {
  gaze_away: 'You looked away from the screen for too long.',
  no_face: "We couldn't see your face in the camera — stay in frame.",
  multiple_faces: 'More than one face was detected in the camera.',
  tab_switch: 'You switched away from the interview tab.',
  fullscreen_exit: 'You exited fullscreen mode.',
  devtools: 'Developer tools were detected.',
}

export const MAX_STRIKES = 3
// Minimum gap between two recorded strikes, so one real incident (e.g.
// exiting fullscreen while DevTools also flags) doesn't burn two strikes
// at once.
const STRIKE_COOLDOWN_MS = 4000
// Signals are ignored for a short window after monitoring starts — the
// camera/model are still warming up and fullscreen may still be animating
// in, and neither should count as the candidate's fault.
const GRACE_PERIOD_MS = 3000

interface UseProctoringStrikesArgs {
  active: boolean
  gazeAway: boolean
  noFace: boolean
  multipleFaces: boolean
  tabHidden: boolean
  fullscreenExited: boolean
  devToolsSuspected: boolean
  onRejected: (reason: string) => void
}

export interface ProctoringStrikesState {
  strikeCount: number
  warning: ProctoringWarning | null
  dismissWarning: () => void
  maxStrikes: number
}

export function useProctoringStrikes({
  active,
  gazeAway,
  noFace,
  multipleFaces,
  tabHidden,
  fullscreenExited,
  devToolsSuspected,
  onRejected,
}: UseProctoringStrikesArgs): ProctoringStrikesState {
  const [strikeCount, setStrikeCount] = useState(0)
  const [warning, setWarning] = useState<ProctoringWarning | null>(null)
  const lastStrikeAtRef = useRef(0)
  const armedRef = useRef<Partial<Record<ViolationType, boolean>>>({})
  const warningIdRef = useRef(0)
  const activatedAtRef = useRef(0)
  const rejectedRef = useRef(false)

  useEffect(() => {
    if (active) {
      activatedAtRef.current = Date.now()
      rejectedRef.current = false
      setStrikeCount(0)
      setWarning(null)
      lastStrikeAtRef.current = 0
      armedRef.current = {}
    }
  }, [active])

  const recordStrike = useCallback(
    (type: ViolationType) => {
      if (rejectedRef.current) return
      const now = Date.now()
      if (now - activatedAtRef.current < GRACE_PERIOD_MS) return
      if (now - lastStrikeAtRef.current < STRIKE_COOLDOWN_MS) return
      lastStrikeAtRef.current = now

      setStrikeCount((prev) => {
        const next = prev + 1
        warningIdRef.current += 1
        setWarning({ id: warningIdRef.current, type, message: VIOLATION_MESSAGES[type], strikeNumber: next })
        if (next >= MAX_STRIKES) {
          rejectedRef.current = true
          onRejected(VIOLATION_MESSAGES[type])
        }
        return next
      })
    },
    [onRejected],
  )

  useEffect(() => {
    if (!active) return
    const checks: Array<[ViolationType, boolean]> = [
      ['gaze_away', gazeAway],
      ['no_face', noFace],
      ['multiple_faces', multipleFaces],
      ['tab_switch', tabHidden],
      ['fullscreen_exit', fullscreenExited],
      ['devtools', devToolsSuspected],
    ]
    for (const [type, isTriggered] of checks) {
      if (isTriggered && !armedRef.current[type]) {
        armedRef.current[type] = true
        recordStrike(type)
      } else if (!isTriggered) {
        armedRef.current[type] = false
      }
    }
  }, [active, gazeAway, noFace, multipleFaces, tabHidden, fullscreenExited, devToolsSuspected, recordStrike])

  const dismissWarning = useCallback(() => setWarning(null), [])

  return { strikeCount, warning, dismissWarning, maxStrikes: MAX_STRIKES }
}
