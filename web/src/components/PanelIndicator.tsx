'use client'

import { PANEL_AVATARS, isPanelistId } from '@/lib/panelAvatars'
import type { PanelState } from '@/types/conversation'

type PanelIndicatorProps = {
  state: PanelState | null
  /** The agent is mid-utterance — pulses the active member's dot in their
   * own accent color instead of a flat static fill, so the strip reads as
   * "this person is talking right now" rather than just "this person has
   * the floor." */
  isSpeaking?: boolean
}

/** The name-tag strip for the live panel: three seats, one line each,
 * color-keyed to the same accent each interviewer's 3D seat glows with —
 * so the strip and the avatars below it read as one consistent panel
 * rather than a generic status readout. */
export function PanelIndicator({ state, isSpeaking = false }: PanelIndicatorProps) {
  if (!state) return null

  return (
    <div className="mb-6 flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {state.panel.map((member) => {
          const accent = isPanelistId(member.id) ? PANEL_AVATARS[member.id].accentColor : undefined
          const active = member.active
          return (
            <span
              key={member.id}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
                active
                  ? 'border-transparent bg-ink text-ink-foreground shadow-lift'
                  : 'border-border bg-card/70 text-muted-foreground'
              }`}
            >
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                {active && isSpeaking ? (
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                    style={{ backgroundColor: accent ?? 'currentColor' }}
                  />
                ) : null}
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full ${active ? '' : 'bg-muted-foreground/50'}`}
                  style={active ? { backgroundColor: accent ?? 'currentColor' } : undefined}
                />
              </span>
              {member.label}
            </span>
          )
        })}
      </div>
      {state.last_switch_reason ? (
        <span className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
          {state.last_switch_reason}
        </span>
      ) : null}
    </div>
  )
}
