'use client'

import { useEffect, useState } from 'react'

import { getPanelState } from '@/services/api'
import type { PanelState } from '@/types/conversation'

// Kept short deliberately: this is what tells ConversationComponent which
// avatar seat is "active" (see `activePanelistId` there), which gates
// EVERYTHING about that seat's mouth — both the real word-driven lip-sync
// and the volume-driven fallback flap only run for the seat currently
// flagged active. The incoming interviewer's handoff greeting starts
// playing on the backend right after the switch, so if this poll takes
// several seconds to notice the switch, that seat sits inert (mouth
// closed) for however much of the greeting plays before we catch up —
// which is exactly what showed up as "the switched agent doesn't lip-sync
// on their first line, then it's fine from the next one." Polling this
// often is still cheap (an in-memory dict read on the backend), and real
// switches only happen roughly every MIN_SECONDS_BETWEEN_SWITCHES anyway.
const POLL_INTERVAL_MS = 600

/**
 * `enabled` should be false once the call is no longer live (e.g.
 * `connectionState !== 'CONNECTED'`). Without it, this kept polling a channel
 * whose agent had already been stopped server-side for as long as
 * `ConversationComponent` stayed mounted after the interview ended — each
 * poll landing on a channel the backend had already discarded, logged there
 * as a wall of `GET /panelState ... 404` lines with nothing left to fix on
 * the client side (a 404 here was already handled as "no state yet", not an
 * error) or the server side (the channel really is gone). The state genuinely
 * has nowhere useful to go once the call ends, so the right fix is to stop
 * asking, not to keep polling and silence the log.
 */
export function usePanelState(channelName: string, enabled = true): PanelState | null {
  const [state, setState] = useState<PanelState | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const poll = async () => {
      try {
        const next = await getPanelState(channelName)
        if (!cancelled && next) setState(next)
      } catch (error) {
        console.warn('Failed to poll panel state:', error)
      }
    }

    poll()
    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [channelName, enabled])

  return state
}
