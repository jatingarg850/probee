'use client'

import { scoreColor } from '@/lib/scoreColor'
import type { DecisionTimelinePoint, DecisionType } from '@/types/conversation'

interface ScoreRingProps {
  score: number | null
  size?: number
  strokeWidth?: number
}

/** Circular progress ring for the headline overall score — reads instantly
 * as "how full is the bar" the way a plain number doesn't. */
export function ScoreRing({ score, size = 148, strokeWidth = 12 }: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // Same guard as PercentRing: a missing (not just null) score must not
  // reach Math.min/Math.max as NaN and end up in strokeDashoffset.
  const hasValue = typeof score === 'number' && Number.isFinite(score)
  const clamped = hasValue ? Math.max(0, Math.min(10, score)) : 0
  const progress = clamped / 10
  const dashOffset = circumference * (1 - progress)
  const color = hasValue ? scoreColor(score) : 'hsl(var(--muted-foreground))'

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-foreground">{hasValue ? score.toFixed(1) : '—'}</span>
        <span className="text-[11px] text-muted-foreground">out of 10</span>
      </div>
    </div>
  )
}

interface CompetencyBarsProps {
  competencies: Array<{ name: string; score: number }>
}

/** Horizontal bar per competency — the shape best suited to comparing a
 * handful of 0-10 scores against each other and against a shared axis. */
export function CompetencyBars({ competencies }: CompetencyBarsProps) {
  return (
    <div className="flex flex-col gap-3">
      {competencies.map((c) => (
        <div key={c.name} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-foreground">{c.name}</span>
            <span className="text-muted-foreground">{c.score.toFixed(1)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(0, Math.min(10, c.score)) * 10}%`,
                background: scoreColor(c.score),
                transition: 'width 0.6s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

interface CompetencyDonutProps {
  competencies: Array<{ name: string; score: number }>
  colors: string[]
  size?: number
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) }
}

function describeDonutSlice(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
) {
  // A full-circle slice degenerates the arc flags; nudge it a hair so a
  // single 100%-share competency still renders instead of vanishing.
  const safeEnd = endAngle - startAngle >= 359.99 ? startAngle + 359.99 : endAngle
  const outerStart = polarToCartesian(cx, cy, outerR, safeEnd)
  const outerEnd = polarToCartesian(cx, cy, outerR, startAngle)
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle)
  const innerEnd = polarToCartesian(cx, cy, innerR, safeEnd)
  const largeArc = safeEnd - startAngle > 180 ? 1 : 0

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ')
}

/** Donut showing each competency's share of total points earned — a
 * complementary "composition" view alongside the bars' "magnitude" view. */
export function CompetencyDonut({ competencies, colors, size = 168 }: CompetencyDonutProps) {
  const total = competencies.reduce((sum, c) => sum + Math.max(0, c.score), 0)
  const cx = size / 2
  const cy = size / 2
  const outerR = size / 2 - 4
  const innerR = outerR * 0.6

  if (total <= 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        No scored data yet
      </div>
    )
  }

  let cursor = 0
  const slices = competencies
    .filter((c) => c.score > 0)
    .map((c, i) => {
      const share = c.score / total
      const start = cursor
      const end = cursor + share * 360
      cursor = end
      return {
        name: c.name,
        path: describeDonutSlice(cx, cy, outerR, innerR, start, end),
        color: colors[i % colors.length],
      }
    })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((slice) => (
        <path key={slice.name} d={slice.path} fill={slice.color} stroke="hsl(var(--background))" strokeWidth={1.5} />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" className="fill-black text-[15px] font-semibold">
        {total.toFixed(0)}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" className="fill-black text-[9px] opacity-70">
        points earned
      </text>
    </svg>
  )
}

interface PercentRingProps {
  /** 0-100, or null when there is nothing to grade yet (no checkable claims
   * were made) — rendered as an explicit dash rather than a misleading 0%. */
  percent: number | null
  size?: number
  strokeWidth?: number
  label?: string
}

/** Same ring as ScoreRing, generalized to a 0-100 percentage rather than a
 * fixed 0-10 score — used for Evidence Coverage, where the denominator is
 * "claims actually made", not a fixed scale. Kept as its own component
 * rather than widening ScoreRing's contract: ScoreRing already has a
 * separate caller (ResumeAnalyzerPage) depending on its 0-10 behavior. */
export function PercentRing({ percent, size = 132, strokeWidth = 11, label = 'coverage' }: PercentRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // `percent` is typed `number | null`, but an older cached assessment
  // (written before `probed_pct` existed) has that field simply missing —
  // `undefined`, not `null` — which slipped past the `=== null` check below
  // and fed `NaN` straight into `strokeDashoffset`, a React DOM warning and
  // a ring stuck rendering nothing. Treat any non-finite value the same as
  // "nothing to grade yet".
  const hasValue = typeof percent === 'number' && Number.isFinite(percent)
  const clamped = hasValue ? Math.max(0, Math.min(100, percent)) : 0
  const dashOffset = circumference * (1 - clamped / 100)
  const color = hasValue ? scoreColor(clamped / 10) : 'hsl(var(--muted-foreground))'

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-foreground">{hasValue ? `${Math.round(percent)}%` : '—'}</span>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}

interface EvidenceCompositionBarProps {
  strong: number
  weak: number
  missing: number
}

/** Strong/Weak/Missing evidence as one stacked bar plus a counted legend —
 * the shape best suited to "what fraction of what they claimed actually
 * held up", at a glance, before reading the per-claim list below it.
 * Colors are literally `scoreColor` at the top/mid/bottom of its scale, so
 * "strong" reads as the same green a high competency score does everywhere
 * else in this UI, not a separately-invented palette. */
export function EvidenceCompositionBar({ strong, weak, missing }: EvidenceCompositionBarProps) {
  const total = strong + weak + missing
  const strongColor = scoreColor(10)
  const weakColor = scoreColor(5)
  const missingColor = scoreColor(0)

  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No specific, checkable claims came up to grade — the candidate didn't state numbers or named results this time.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-foreground/10">
        {strong > 0 ? (
          <div style={{ width: `${(strong / total) * 100}%`, background: strongColor }} title={`${strong} strong`} />
        ) : null}
        {weak > 0 ? (
          <div style={{ width: `${(weak / total) * 100}%`, background: weakColor }} title={`${weak} weak`} />
        ) : null}
        {missing > 0 ? (
          <div
            style={{ width: `${(missing / total) * 100}%`, background: missingColor }}
            title={`${missing} missing`}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 text-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: strongColor }} />
          Strong · {strong}
        </span>
        <span className="flex items-center gap-1.5 text-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: weakColor }} />
          Weak · {weak}
        </span>
        <span className="flex items-center gap-1.5 text-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: missingColor }} />
          Missing · {missing}
        </span>
      </div>
    </div>
  )
}

const DIFFICULTY_LEVEL: Record<string, number> = { easy: 0, medium: 1, hard: 2 }
const DIFFICULTY_LABEL: Record<number, string> = { 0: 'Easy', 1: 'Medium', 2: 'Hard' }

/** Distinct from scoreColor's palette on purpose — these mark WHAT KIND of
 * question was asked, not how well the candidate did, so reusing the
 * score-band greens/ambers/reds here would visually claim a good/bad
 * judgment this chart isn't making. Pulled from the same hex family
 * FlowChart.tsx already uses elsewhere in the assessment UI. */
const DECISION_TYPE_STYLE: Record<string, { color: string; label: string }> = {
  follow_up: { color: 'hsl(var(--muted-foreground))', label: 'Follow-up' },
  evidence_probe: { color: '#c2410c', label: 'Evidence probe' },
  scenario_injection: { color: '#7c3aed', label: 'Scenario challenge' },
  new_topic: { color: '#1d4ed8', label: 'New topic' },
}

interface DecisionTimelineChartProps {
  points: DecisionTimelinePoint[]
}

/** Difficulty across the interview, one point per question the panel
 * actually asked, in the order it asked them — a real line chart over real
 * telemetry (see agent.py's `_decision_timeline`), not a synthetic curve.
 * Point color is the kind of question it was; a ringed point is one where
 * the panel also changed which interviewer was speaking. This is the chart
 * that shows the interview adapting turn by turn, rather than working
 * through a fixed script. */
export function DecisionTimelineChart({ points }: DecisionTimelineChartProps) {
  const valid = points.filter((p) => p.difficulty !== null && p.difficulty in DIFFICULTY_LEVEL)

  if (valid.length === 0) {
    return <p className="text-xs text-muted-foreground">Not enough questions yet to chart.</p>
  }

  const width = 560
  const height = 150
  // Wide enough to fit "Medium" — the widest of the three y-axis labels —
  // fully to the LEFT of x=0 in the SVG's own coordinate space, given the
  // labels are right-aligned (textAnchor="end") against `padX - 8`. At the
  // old padX=34 that anchor sat at x=26, and "Medium" at this font size
  // runs wider than that, so its leading "M" fell past x=0 and the SVG
  // simply didn't paint it — it rendered as "edium", not a typo.
  const padX = 46
  const padTop = 14
  const padBottom = 22
  const innerW = width - padX * 2
  const innerH = height - padTop - padBottom
  const n = valid.length

  const xFor = (i: number) => (n === 1 ? padX + innerW / 2 : padX + (innerW * i) / (n - 1))
  const yFor = (level: number) => padTop + innerH - (level / 2) * innerH

  const linePath = valid
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(DIFFICULTY_LEVEL[p.difficulty as string]).toFixed(1)}`,
    )
    .join(' ')

  const usedTypes = Array.from(new Set(valid.map((p) => p.decision_type).filter((t): t is DecisionType => Boolean(t))))
  const anySwitches = valid.some((p) => p.switched)

  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Question difficulty over the course of the interview"
      >
        {[0, 1, 2].map((level) => (
          <g key={level}>
            <line
              x1={padX}
              y1={yFor(level)}
              x2={width - padX}
              y2={yFor(level)}
              stroke="hsl(var(--border))"
              strokeWidth={1}
            />
            <text x={padX - 8} y={yFor(level) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
              {DIFFICULTY_LABEL[level]}
            </text>
          </g>
        ))}
        <path d={linePath} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.5} opacity={0.3} />
        {valid.map((p, i) => {
          const cx = xFor(i)
          const cy = yFor(DIFFICULTY_LEVEL[p.difficulty as string])
          const style = DECISION_TYPE_STYLE[p.decision_type ?? 'follow_up'] ?? DECISION_TYPE_STYLE.follow_up
          return (
            <g key={p.index}>
              {p.switched ? (
                <circle cx={cx} cy={cy} r={7.5} fill="none" stroke={style.color} strokeWidth={1.5} />
              ) : null}
              <circle cx={cx} cy={cy} r={4} fill={style.color} />
              <text x={cx} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[8px]">
                {p.index}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        {usedTypes.map((type) => {
          const style = DECISION_TYPE_STYLE[type] ?? DECISION_TYPE_STYLE.follow_up
          return (
            <span key={type} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: style.color }} />
              {style.label}
            </span>
          )
        })}
        {anySwitches ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-muted-foreground" />
            Interviewer switched
          </span>
        ) : null}
      </div>
    </div>
  )
}
