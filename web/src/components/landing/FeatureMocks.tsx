'use client'

/** Small, static illustrations for the two supporting features. They mirror
 * what those pages actually render — the resume analyser's fit verdict and
 * suggested roles (see ResumeAnalysis in types/resume.ts), and the
 * opportunities board's ranked listings (MatchedJob) — so the landing page
 * is not promising a shape of output the product does not produce.
 *
 * Deliberately motionless: the page already has one thing that moves, and a
 * second competing animation is what made the earlier version feel busy. */

const SUGGESTED = [
  { role: 'Backend Engineer', score: 88 },
  { role: 'Platform Engineer', score: 81 },
  { role: 'Infrastructure Engineer', score: 74 },
]

export function ResumeFitMock() {
  const score = 78
  // Arc geometry for the fit ring: a circle of r=52 has a circumference of
  // ~327, and the visible sweep is that scaled by the score.
  const radius = 52
  const circumference = 2 * Math.PI * radius

  return (
    <div className="rounded-2xl border border-[#141413]/12 bg-[#f0eee6] p-7">
      <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-[#5e5d59]/70">Target role</p>
      <p className="mt-1.5 text-[1.05rem] font-medium tracking-[-0.01em]">Senior Backend Engineer</p>

      <div className="mt-7 flex items-center gap-6">
        <div className="relative h-[7.5rem] w-[7.5rem] shrink-0">
          <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="64" cy="64" r={radius} fill="none" stroke="#141413" strokeOpacity="0.1" strokeWidth="8" />
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke="#d97757"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(circumference * score) / 100} ${circumference}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[1.7rem] font-semibold leading-none tabular-nums tracking-tight">{score}</span>
            <span className="mt-1 font-sans text-[10px] uppercase tracking-[0.16em] text-[#5e5d59]">Fit</span>
          </div>
        </div>

        <div className="min-w-0">
          <span className="inline-flex items-center rounded-full bg-[#d97757]/14 px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b45f43]">
            Strong match
          </span>
          <p className="mt-3 text-[13.5px] leading-[1.6] text-[#5e5d59]">
            Depth in distributed systems and ownership of production services carry the level.
          </p>
        </div>
      </div>

      <p className="mt-7 font-sans text-[11px] uppercase tracking-[0.18em] text-[#5e5d59]/70">Also suits you</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {SUGGESTED.map(({ role, score: s }) => (
          <li key={role} className="flex items-center gap-3">
            <span className="w-[3.5rem] shrink-0 text-[13px] tabular-nums text-[#5e5d59]">{s}%</span>
            <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-[#141413]/10">
              <span className="block h-full rounded-full bg-[#141413]/35" style={{ width: `${s}%` }} />
            </span>
            <span className="w-[10.5rem] shrink-0 text-right text-[13px] text-[#141413]">{role}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const LISTINGS = [
  { title: 'Backend Engineer II', company: 'Razorpay', place: 'Bengaluru · Hybrid', match: 91 },
  { title: 'Platform Engineer', company: 'Zerodha', place: 'Remote, India', match: 84 },
  { title: 'Software Engineer, Infra', company: 'Postman', place: 'Bengaluru', match: 76 },
]

export function OpportunitiesMock() {
  return (
    <div className="rounded-2xl border border-[#141413]/12 bg-[#f0eee6] p-7">
      <div className="flex items-center gap-2 rounded-xl border border-[#141413]/12 bg-[#faf9f5] px-4 py-3">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-[#5e5d59]"
          fill="none"
          stroke="currentColor"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-[14px] text-[#141413]">Backend Engineer</span>
        <span className="ml-auto font-sans text-[11px] uppercase tracking-[0.14em] text-[#5e5d59]/70">India</span>
      </div>

      <ul className="mt-4 flex flex-col">
        {LISTINGS.map(({ title, company, place, match }) => (
          <li
            key={title}
            className="flex items-center justify-between gap-4 border-b border-[#141413]/10 py-4 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-medium tracking-[-0.01em]">{title}</p>
              <p className="mt-0.5 truncate text-[12.5px] text-[#5e5d59]">
                {company} · {place}
              </p>
            </div>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#b45f43]">{match}%</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#141413] px-4 py-3">
        <span className="text-[13px] font-medium text-[#faf9f5]">Practice for this role</span>
        <span aria-hidden className="ml-auto text-[13px] text-[#faf9f5]/60">
          →
        </span>
      </div>
    </div>
  )
}
