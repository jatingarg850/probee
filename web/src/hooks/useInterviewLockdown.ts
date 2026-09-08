'use client'

import { useCallback, useEffect, useState } from 'react'

const BLOCKED_KEY_COMBOS: Array<(e: KeyboardEvent) => boolean> = [
  (e) => e.key === 'F12',
  (e) => (e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key),
  (e) => (e.ctrlKey || e.metaKey) && ['U', 'u'].includes(e.key),
]

/** DevTools can't actually be disabled from JavaScript — a determined user
 * can always open it from the browser's own menu. This is a best-effort
 * deterrent (blocks the common shortcuts, disables right-click, and flags
 * the window-size jump DevTools panels cause when docked) meant to
 * discourage casual snooping during a practice interview, not a real
 * security boundary. */
export interface InterviewLockdownState {
  isFullscreen: boolean
  requestFullscreen: () => Promise<boolean>
  devToolsSuspected: boolean
}

const DEVTOOLS_SIZE_THRESHOLD = 160

export function useInterviewLockdown(active: boolean): InterviewLockdownState {
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && !!document.fullscreenElement,
  )
  const [devToolsSuspected, setDevToolsSuspected] = useState(false)

  // Fullscreen can only be entered from a direct user gesture (a click
  // handler calling this), never automatically from an effect — browsers
  // silently reject requestFullscreen() otherwise. Returns whether it
  // actually ended up fullscreen, so the precheck screen can gate on it.
  const requestFullscreen = useCallback(async (): Promise<boolean> => {
    if (document.fullscreenElement) return true
    const el = document.documentElement
    if (!el.requestFullscreen) return false
    try {
      await el.requestFullscreen()
      return !!document.fullscreenElement
    } catch (err) {
      console.warn('Could not enter fullscreen:', err)
      return false
    }
  }, [])

  useEffect(() => {
    if (!active) return

    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    onFullscreenChange()

    const onKeyDown = (e: KeyboardEvent) => {
      if (BLOCKED_KEY_COMBOS.some((matches) => matches(e))) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('contextmenu', onContextMenu)

    const sizeCheck = window.setInterval(() => {
      const widthGap = window.outerWidth - window.innerWidth
      const heightGap = window.outerHeight - window.innerHeight
      setDevToolsSuspected(widthGap > DEVTOOLS_SIZE_THRESHOLD || heightGap > DEVTOOLS_SIZE_THRESHOLD)
    }, 1000)

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('contextmenu', onContextMenu)
      window.clearInterval(sizeCheck)
    }
  }, [active])

  return { isFullscreen, requestFullscreen, devToolsSuspected }
}
