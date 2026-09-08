'use client'

import { Mic, MicOff } from '@/components/ui/icons'
import type { IMicrophoneAudioTrack } from 'agora-rtc-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

interface MicToggleButtonProps {
  isEnabled: boolean
  track: IMicrophoneAudioTrack | null
  onToggle: () => void | Promise<void>
  className?: string
}

/** The call's mic toggle.
 *
 * Replaces the vendor `MicButtonWithVisualizer` (agora-agent-uikit/rtc),
 * which draws five raw equalizer bars in the exact same color as — and
 * directly behind — the mic icon. At this button's actual on-screen size
 * (~48-56px) those bars and the icon overlap into a single illegible
 * shape rather than reading as "a mic with a waveform," which is what
 * showed up as a glitchy-looking control in the live call.
 *
 * This keeps the same live-level feedback (via the same Web Audio
 * analyser approach the vendor button used) but renders it as a soft ring
 * strictly BEHIND the icon — level and icon never share the same pixels,
 * so there's nothing for them to visually collide into. */
export function MicToggleButton({ isEnabled, track, onToggle, className }: MicToggleButtonProps) {
  const [level, setLevel] = useState(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const cleanup = () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
      rafRef.current = undefined
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
      setLevel(0)
    }

    const mediaStreamTrack = isEnabled ? track?.getMediaStreamTrack() : undefined
    if (!mediaStreamTrack) {
      cleanup()
      return cleanup
    }

    try {
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 32
      analyser.smoothingTimeConstant = 0.6
      const source = audioContext.createMediaStreamSource(new MediaStream([mediaStreamTrack]))
      source.connect(analyser)
      audioContextRef.current = audioContext

      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(data)
        const average = data.reduce((sum, value) => sum + value, 0) / data.length
        setLevel(Math.min(1, average / 90))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // Web Audio unavailable or blocked — the toggle itself still works,
      // it just won't pulse with the candidate's live mic level.
    }

    return cleanup
  }, [isEnabled, track])

  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      aria-label={isEnabled ? 'Mute microphone' : 'Unmute microphone'}
      aria-pressed={!isEnabled}
      className={cn(
        'group relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform duration-150 active:scale-95 sm:h-14 sm:w-14',
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-primary transition-[transform,opacity] duration-150 ease-out"
        style={{
          transform: `scale(${isEnabled ? 1 + level * 0.4 : 1})`,
          opacity: isEnabled ? 0.25 + level * 0.45 : 0,
        }}
      />
      <span
        className={cn(
          'relative flex h-full w-full items-center justify-center rounded-full shadow-soft transition-colors duration-150',
          isEnabled
            ? 'bg-primary text-primary-foreground group-hover:bg-accent'
            : 'bg-destructive text-destructive-foreground group-hover:bg-destructive/90',
        )}
      >
        {isEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </span>
    </button>
  )
}
