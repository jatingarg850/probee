'use client'

import { useEffect, useState } from 'react'

import { PANEL_AVATARS, PANEL_AVATAR_ORDER, type PanelistId } from '@/lib/panelAvatars'

import { RoleIllustration } from './RoleIllustration'
import { useOnScreen, useReducedMotion } from './motion'

/** A real exchange rather than filler — this is the product's actual shape:
 * three interviewers who hand the room between themselves, each following up
 * on what you just said. */
const SCRIPT: { who: PanelistId; listensFor: string; question: string; followUp: string }[] = [
  {
    who: 'technical_interviewer',
    listensFor: 'Depth under the answer',
    question: 'Walk me through how you would design a rate limiter for a public API.',
    followUp: 'And what happens under a sudden burst of concurrent requests?',
  },
  {
    who: 'product_manager',
    listensFor: 'The trade-off you chose',
    question: 'Who gets hurt first when that limit is set too aggressively?',
    followUp: 'How would you know that was happening, from the data you already have?',
  },
  {
    who: 'hiring_manager',
    listensFor: 'Scope, ownership, level',
    question: 'Tell me about something you shipped that turned out to be wrong.',
    followUp: 'What did you change about the way you work afterwards?',
  },
]

const PHASE_MS = { asking: 3400, followUp: 3800 } as const
type Phase = keyof typeof PHASE_MS

/** The live call, playing quietly.
 *
 * Everything that moves is a CSS animation on `opacity` or `transform`, so
 * the compositor handles it without touching layout or paint. JavaScript
 * only advances a phase on a timer, and stops doing even that once the
 * panel scrolls off screen. */
export function InterviewDemo() {
  const reduced = useReducedMotion()
  const { ref, onScreen } = useOnScreen<HTMLDivElement>()
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<Phase>('asking')

  useEffect(() => {
    if (reduced || !onScreen) return
    const timer = setTimeout(() => {
      if (phase === 'asking') {
        setPhase('followUp')
      } else {
        setStep((s) => (s + 1) % SCRIPT.length)
        setPhase('asking')
      }
    }, PHASE_MS[phase])
    return () => clearTimeout(timer)
  }, [phase, reduced, onScreen])

  const current = SCRIPT[step]
  const showFollowUp = phase === 'followUp' || reduced

  return (
    <div
      ref={ref}
      className="grid grid-cols-1 items-center gap-10 md:grid-cols-[13rem_1fr] md:gap-14 lg:grid-cols-[13rem_14rem_1fr] lg:gap-16"
    >
      <style>{`
        @keyframes probe-soft-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes probe-mark-in { from { opacity: 0; transform: scale(0.94) rotate(-3deg); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* Who is in the room. */}
      <div className="flex flex-col">
        <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-white/30">In the room</p>
        <ul className="mt-5 flex flex-col gap-3.5">
          {PANEL_AVATAR_ORDER.map((id) => {
            const active = id === current.who
            return (
              <li key={id} className="flex items-center gap-3">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-300"
                  style={{ background: active ? '#d97757' : 'rgba(255,255,255,0.18)' }}
                />
                <span
                  className="text-[15px] transition-colors duration-300"
                  style={{ color: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.34)' }}
                >
                  {PANEL_AVATARS[id].label}
                </span>
              </li>
            )
          })}
        </ul>

        <p className="mt-10 font-sans text-[11px] uppercase tracking-[0.18em] text-white/30">Listening for</p>
        <p
          key={`l-${step}`}
          className="mt-2 text-[14px] text-white/55"
          style={{ animation: reduced ? undefined : 'probe-soft-in 700ms ease-out both' }}
        >
          {current.listensFor}
        </p>
      </div>

      {/* The speaking seat's mark. Hidden below lg, where the column would
       * squeeze the transcript rather than support it. */}
      <div className="hidden lg:flex lg:items-center lg:justify-center">
        <div className="h-[13rem] w-[13rem]">
          <RoleIllustration id={current.who} />
        </div>
      </div>

      {/* What is being asked. The reserved min-height keeps the block from
       * resizing as lines swap, which would otherwise shift the whole stage
       * mid-animation. */}
      <div className="min-h-[11rem] border-t border-white/10 pt-8 sm:min-h-[12rem] md:border-l md:border-t-0 md:pl-14 md:pt-0">
        <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-white/30">
          {PANEL_AVATARS[current.who].label}
        </p>
        <p
          key={`q-${step}`}
          className="mt-4 max-w-[34ch] text-[1.4rem] leading-[1.35] text-white sm:text-[1.7rem]"
          style={{
            fontFamily: 'var(--font-landing-serif), Georgia, serif',
            animation: reduced ? undefined : 'probe-soft-in 700ms ease-out both',
          }}
        >
          {current.question}
        </p>

        {/* The follow-up is always mounted, and only its emphasis changes —
         * it sits waiting as a queued line, then comes forward. Mounting it
         * on arrival instead left a block of empty panel for the whole first
         * phase of every cycle, which read as the card being broken. */}
        <div
          key={`f-${step}`}
          className="mt-7 max-w-[42ch] transition-opacity duration-700"
          style={{ opacity: showFollowUp ? 1 : 0.32 }}
        >
          <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-white/30">
            {showFollowUp ? 'Follow-up' : 'Follow-up, queued'}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-white/60">{current.followUp}</p>
        </div>
      </div>
    </div>
  )
}
