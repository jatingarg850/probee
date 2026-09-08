'use client'

import { useReducedMotion } from '@/components/landing/motion'

/** The visual half of the auth screen.
 *
 * Deliberately built from the product's own output — a question the panel
 * asked, a scorecard, a resume fit read, a matched opening — rather than a
 * stock photograph or an abstract gradient. Someone signing in should see
 * the thing they are signing in for, and it keeps the page honest: every
 * card here is a real shape the app renders elsewhere.
 *
 * The whole collage is one rotated plane with two columns drifting in
 * opposite directions. Each column's content is duplicated so the loop is
 * seamless, and the only animated property is `transform`, which the
 * compositor handles without layout or paint. It holds still entirely under
 * prefers-reduced-motion.
 */

const SURFACE = 'rounded-xl border border-[#141413]/10 bg-[#faf9f5] p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]'
const EYEBROW = 'font-sans text-[9px] font-semibold uppercase tracking-[0.16em] text-[#5e5d59]'

function QuestionCard() {
  return (
    <div className={SURFACE}>
      <p className={EYEBROW}>Technical interviewer</p>
      <p className="mt-2 text-[15px] leading-snug text-[#141413]" style={{ fontFamily: 'Georgia, serif' }}>
        Walk me through how you would design a rate limiter for a public API.
      </p>
      <div className="mt-3 border-t border-[#141413]/10 pt-2.5">
        <p className={EYEBROW}>Follow-up</p>
        <p className="mt-1 text-[12px] leading-snug text-[#5e5d59]">
          What happens under a burst of concurrent requests?
        </p>
      </div>
    </div>
  )
}

function ScoreCard() {
  const metrics = [
    ['Communication', 82],
    ['Technical depth', 74],
    ['Structure', 68],
  ] as const
  return (
    // Lifted off the panel with its own border and a lighter ground: at
    // #141413 this dark card sat almost exactly on the panel colour and read
    // as a hole rather than a card.
    <div className={`${SURFACE} border-white/[0.14] bg-[#232320]`}>
      <div className="flex items-baseline justify-between border-b border-white/10 pb-3">
        <span className="font-sans text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">Overall</span>
        <span className="text-[1.6rem] font-bold leading-none tabular-nums text-white">
          82<span className="text-[11px] font-medium text-white/35"> / 100</span>
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <div className="flex justify-between text-[10px] text-white/50">
              <span>{label}</span>
              <span className="tabular-nums text-white/80">{value}</span>
            </div>
            <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#d97757]" style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FitCard() {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className={`${SURFACE} flex items-center gap-4`}>
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={r} fill="none" stroke="#141413" strokeOpacity="0.1" strokeWidth="5" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="#d97757"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${(c * 78) / 100} ${c}`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold tabular-nums text-[#141413]">
          78
        </span>
      </div>
      <div className="min-w-0">
        <p className={EYEBROW}>Role fit</p>
        <p className="mt-1 text-[13px] font-medium text-[#141413]">Senior Backend Engineer</p>
        <p className="mt-0.5 text-[11px] text-[#b45f43]">Strong match</p>
      </div>
    </div>
  )
}

function PanelCard() {
  const seats = [
    ['Technical Interviewer', true],
    ['Product Manager', false],
    ['Hiring Manager', false],
  ] as const
  return (
    <div className={SURFACE}>
      <p className={EYEBROW}>In the room</p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {seats.map(([name, active]) => (
          <li key={name} className="flex items-center gap-2.5">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: active ? '#d97757' : 'rgba(20,20,19,0.18)' }}
            />
            <span className={`text-[12.5px] ${active ? 'text-[#141413]' : 'text-[#5e5d59]/70'}`}>{name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function JobCard() {
  return (
    <div className={SURFACE}>
      <p className={EYEBROW}>Matched opening</p>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[#141413]">Backend Engineer II</p>
          <p className="mt-0.5 truncate text-[11px] text-[#5e5d59]">Razorpay · Bengaluru</p>
        </div>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#b45f43]">91%</span>
      </div>
    </div>
  )
}

function TranscriptCard() {
  return (
    <div className={SURFACE}>
      <p className={EYEBROW}>Transcript</p>
      <p className="mt-2 text-[12px] leading-relaxed text-[#5e5d59]">
        <span className="font-medium text-[#141413]">You:</span> I'd start with a token bucket per API key, held in
        Redis so it survives a restart…
      </p>
    </div>
  )
}

const COLUMN_A = [QuestionCard, FitCard, JobCard]
const COLUMN_B = [ScoreCard, PanelCard, TranscriptCard]

function Column({ items, reverse, paused }: { items: (() => React.JSX.Element)[]; reverse: boolean; paused: boolean }) {
  return (
    <div
      className="flex shrink-0 flex-col gap-5"
      style={{
        // Duplicated below, so translating by exactly half the track height
        // lands back on an identical frame — no visible jump on repeat.
        animation: paused ? undefined : `auth-drift 46s linear infinite${reverse ? ' reverse' : ''}`,
      }}
    >
      {[0, 1].map((copy) => (
        <div key={copy} className="flex flex-col gap-5" aria-hidden={copy === 1}>
          {items.map((Item) => (
            <Item key={Item.name} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function AuthShowcase() {
  const reduced = useReducedMotion()

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#131312]">
      <style>{`
        @keyframes auth-drift { from { transform: translateY(0); } to { transform: translateY(-50%); } }
      `}</style>

      {/* Same depth treatment as the landing page's stage, so the two dark
       * surfaces in the product read as the same material. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(50rem 34rem at 30% 30%, rgba(217,119,87,0.10), transparent 60%)',
            'linear-gradient(rgba(255,255,255,0.014) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px)',
          ].join(','),
          backgroundSize: 'auto, 88px 88px, 88px 88px',
        }}
      />

      {/* The collage plane: rotated and over-scaled so the rotation never
       * exposes a corner of empty panel. */}
      <div
        className="absolute inset-0 flex justify-center gap-5 px-6"
        style={{ transform: 'rotate(-9deg) scale(1.25)', transformOrigin: 'center' }}
      >
        <div className="w-[15.5rem]">
          <Column items={COLUMN_A} reverse={false} paused={reduced} />
        </div>
        <div className="hidden w-[15.5rem] xl:block">
          <Column items={COLUMN_B} reverse paused={reduced} />
        </div>
      </div>

      {/* Fades the cards out into the panel at top and bottom rather than
       * letting them run off a hard edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, #131312 0%, transparent 22%, transparent 78%, #131312 100%), radial-gradient(120% 80% at 50% 50%, transparent 40%, rgba(19,19,18,0.65) 100%)',
        }}
      />
    </div>
  )
}
