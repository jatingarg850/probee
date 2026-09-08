'use client'

import { useEffect, useState } from 'react'

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Replaces the raw "Deepgram STT / Gemini LLM / Murf TTS · 123ms" pipeline
 * breakdown in the always-visible header — accurate for debugging, but reads
 * as a developer console rather than an interview. A live dot + elapsed
 * time tells the candidate what they actually need to know: the call is
 * live, how long they've been going, and — when the session has a target
 * length — how much time is left before it wraps up on its own. */
export function CallStatusPill({
  startedAt,
  isLive,
  durationMinutes,
}: {
  startedAt: number
  isLive: boolean
  /** Target interview length, if the candidate picked one at setup. When
   * present, a second segment counts down to it and shifts color as the
   * deadline approaches — purely informational here; the actual auto-end
   * timer lives in ConversationComponent. */
  durationMinutes?: number
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedMs = now - startedAt
  const totalMs = durationMinutes ? durationMinutes * 60_000 : null
  const remainingMs = totalMs !== null ? Math.max(0, totalMs - elapsedMs) : null
  const remainingMinutes = remainingMs !== null ? remainingMs / 60_000 : null

  const remainingTone =
    remainingMinutes === null
      ? ''
      : remainingMinutes <= 1
        ? 'text-destructive'
        : remainingMinutes <= 3
          ? 'text-warning'
          : 'text-muted-foreground'

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="relative flex h-1.5 w-1.5">
        {isLive ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
        ) : null}
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${isLive ? 'bg-success' : 'bg-muted-foreground'}`}
        />
      </span>
      <span>
        {isLive ? 'Live' : 'Connecting'} · {formatElapsed(elapsedMs)}
      </span>
      {remainingMs !== null ? (
        <span className={`font-medium ${remainingTone}`}>· {formatElapsed(remainingMs)} left</span>
      ) : null}
    </div>
  )
}
