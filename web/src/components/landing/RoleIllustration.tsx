'use client'

import type { PanelistId } from '@/lib/panelAvatars'

/** One abstract mark per interviewer, drawn rather than photographed.
 *
 * The stage is a full screen of near-black with three short lines of text on
 * it, which read as an empty page. This gives each seat something to occupy
 * the middle of that space, and gives the handoff something visible to
 * change — the mark swaps with the speaker.
 *
 * Geometry, not portraiture: a fake headshot of a person who does not exist
 * would be the wrong claim to make about an AI panel, and stock faces are
 * exactly the register this page is trying to avoid. Each mark instead says
 * something about what that seat listens for. */

const STROKE = 'rgba(255,255,255,0.22)'
const STROKE_STRONG = 'rgba(255,255,255,0.45)'
const ACCENT = '#d97757'

/** Technical: nested frames narrowing to a point — depth, layer under layer. */
function TechnicalMark() {
  return (
    <>
      <title>Nested frames narrowing inward</title>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={20 + i * 22}
          y={20 + i * 22}
          width={160 - i * 44}
          height={160 - i * 44}
          rx={4}
          fill="none"
          stroke={i === 3 ? ACCENT : STROKE}
          strokeWidth={i === 3 ? 2 : 1}
        />
      ))}
      <line x1="20" y1="100" x2="8" y2="100" stroke={STROKE} strokeWidth="1" />
      <line x1="180" y1="100" x2="192" y2="100" stroke={STROKE} strokeWidth="1" />
    </>
  )
}

/** Product: two circles and the overlap between them — the trade-off. */
function ProductMark() {
  return (
    <>
      <title>Two overlapping circles with the intersection marked</title>
      {/* Centres 60 apart with r=52, so the circles read as two distinct
       * positions rather than one lens. The intersection's half-height is
       * sqrt(52² − 30²) ≈ 42.5, which is where the arcs below meet. */}
      <circle cx="70" cy="100" r="52" fill="none" stroke={STROKE} strokeWidth="1" />
      <circle cx="130" cy="100" r="52" fill="none" stroke={STROKE} strokeWidth="1" />
      <path
        d="M100 57.5 A52 52 0 0 1 100 142.5 A52 52 0 0 1 100 57.5 Z"
        fill="rgba(217,119,87,0.14)"
        stroke={ACCENT}
        strokeWidth="1.5"
      />
      <circle cx="100" cy="100" r="2.5" fill={ACCENT} />
    </>
  )
}

/** Hiring: stacked arcs widening outward — the whole conversation, in scope. */
function HiringMark() {
  return (
    <>
      <title>Concentric arcs widening outward from a point</title>
      <circle cx="100" cy="100" r="3" fill={ACCENT} />
      {[28, 48, 68, 88].map((r, i) => (
        <path
          key={r}
          d={`M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`}
          fill="none"
          stroke={i === 0 ? STROKE_STRONG : STROKE}
          strokeWidth="1"
        />
      ))}
      {[28, 48, 68, 88].map((r, i) => (
        <path
          key={`b-${r}`}
          d={`M ${100 - r} 100 A ${r} ${r} 0 0 0 ${100 + r} 100`}
          fill="none"
          stroke={i === 0 ? STROKE_STRONG : STROKE}
          strokeWidth="1"
          strokeDasharray="2 6"
        />
      ))}
    </>
  )
}

const MARKS: Record<PanelistId, () => React.JSX.Element> = {
  technical_interviewer: TechnicalMark,
  product_manager: ProductMark,
  hiring_manager: HiringMark,
}

export function RoleIllustration({ id, className = '' }: { id: PanelistId; className?: string }) {
  const Mark = MARKS[id]
  return (
    <svg
      // Keyed on the seat so the cross-fade below restarts on every handoff.
      key={id}
      viewBox="0 0 200 200"
      className={`h-full w-full ${className}`}
      role="img"
      aria-label="Abstract mark for the interviewer currently speaking"
      style={{ animation: 'probe-mark-in 900ms cubic-bezier(0.22,1,0.36,1) both' }}
    >
      <Mark />
    </svg>
  )
}
