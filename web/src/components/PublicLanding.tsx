'use client'

import { Source_Serif_4 } from 'next/font/google'
import Link from 'next/link'
import { useRef } from 'react'

import { ExpandingStage } from '@/components/landing/ExpandingStage'
import { OpportunitiesMock, ResumeFitMock } from '@/components/landing/FeatureMocks'
import { InterviewDemo } from '@/components/landing/InterviewDemo'
import { useActiveSection, useScrolledPast } from '@/components/landing/motion'
import { Reveal } from '@/components/landing/primitives'
import { PANEL_AVATARS, PANEL_AVATAR_ORDER } from '@/lib/panelAvatars'
import { CANDIDATE_PLAN, PLANS, formatPrice } from '@/lib/plans'

/** Display face for this page only. The app itself is set in Instrument
 * Sans throughout; the serif is what stops the signed-out page reading like
 * a settings screen with a headline on top. */
const display = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '600'],
  variable: '--font-landing-serif',
})

const STEPS = [
  {
    n: '01',
    t: 'Tell it what you are going for',
    d: 'The role, the company, and your resume. Everything you get asked comes out of that, so the questions are about your work rather than a generic list.',
  },
  {
    n: '02',
    t: 'Sit the interview',
    d: 'You talk. Three interviewers listen, take the room from each other, and follow up on the part of your answer you moved past quickly.',
  },
  {
    n: '03',
    t: 'Read what they made of you',
    d: 'A scorecard the moment you hang up: competency by competency, the lines from your own transcript behind each call, and whether the role actually fits.',
  },
]

/** The two features either side of the interview. `flip` alternates which
 * column the illustration sits in, so the pair reads as a rhythm rather
 * than two identical rows. */
const FEATURES = [
  {
    id: 'resume',
    eyebrow: 'Resume analysis',
    title: 'Find out where you actually fit',
    body: 'Upload your resume and name the role you are aiming at. You get a straight verdict on that role — strong, moderate, or weak, and the reasoning behind it — plus the roles your experience genuinely points at, whether or not they were the ones you had in mind.',
    points: [
      'A fit score and verdict for the role you named',
      'The strengths carrying it, and the gaps that are not',
      'Better-suited roles ranked by how well they match',
    ],
    href: '/resume',
    cta: 'Analyse your resume',
    mock: ResumeFitMock,
    flip: false,
  },
  {
    id: 'opportunities',
    eyebrow: 'Opportunities',
    title: 'Then find the openings worth your time',
    body: 'Search live jobs and internships by role and location. Every listing is scored against your own resume, so what you are looking at is ranked by how well you actually match it — not by how recently it was posted.',
    points: [
      'Live listings by role, location, and job or internship',
      'Each one matched and ranked against your resume',
      'Start a practice interview built from that exact posting',
    ],
    href: '/opportunities',
    cta: 'Browse opportunities',
    mock: OpportunitiesMock,
    flip: true,
  },
] as const

const PANEL_NOTES = {
  technical_interviewer: 'Goes at how you build things, and keeps going when the answer stays on the surface.',
  product_manager: 'Presses on trade-offs and users — why this, and not the other thing.',
  hiring_manager: 'Listens across the whole conversation for scope, ownership, and level.',
} as const

const SHELL = 'mx-auto w-full max-w-[72rem] px-6 sm:px-10'
const SERIF = { fontFamily: 'var(--font-landing-serif), Georgia, serif' } as const

const NAV_LINKS = [
  { id: 'how', label: 'How it works' },
  { id: 'panel', label: 'The panel' },
  { id: 'more', label: 'Resume & jobs' },
  { id: 'pricing', label: 'Pricing' },
] as const

/** Ids are hoisted to module scope so the array identity is stable — passing
 * a fresh literal would re-run the observer effect on every render. */
const NAV_SECTION_IDS = NAV_LINKS.map((l) => l.id)

function Nav({ heroRef }: { heroRef: React.RefObject<HTMLElement | null> }) {
  // The bar sits flat and borderless over the hero and only gains its
  // hairline and shadow once the hero is behind you, so it is not drawing a
  // box around the headline while you read it.
  const scrolled = useScrolledPast(heroRef, 64)
  const activeSection = useActiveSection(NAV_SECTION_IDS)

  return (
    <header
      className={`relative sticky top-0 z-40 bg-[#faf9f5]/80 backdrop-blur-xl transition-[border-color,box-shadow] duration-500 ${
        scrolled
          ? 'border-b border-[#141413]/10 shadow-[0_1px_20px_-12px_rgba(20,20,19,0.5)]'
          : 'border-b border-transparent'
      }`}
    >
      <div className={`flex h-16 items-center justify-between gap-6 ${SHELL}`}>
        <Link href="/" aria-label="PROBE home" className="shrink-0">
          <img src="/Logo%20Svg/main%20text.svg" alt="PROBE" className="h-[1.6rem] w-auto" />
        </Link>

        {/* Centred independently of the two flanking groups, so the links do
         * not drift left or right as the sign-in group changes width. */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {NAV_LINKS.map(({ id, label }) => {
            const active = activeSection === id
            return (
              <a
                key={id}
                href={`#${id}`}
                aria-current={active ? 'true' : undefined}
                className={`relative rounded-lg px-3 py-2 text-[13.5px] transition-colors duration-300 hover:text-[#141413] ${
                  active ? 'text-[#141413]' : 'text-[#5e5d59]'
                }`}
              >
                {label}
                {/* A dot rather than an underline: it reads as a position
                 * marker instead of a hover state, and it can animate in
                 * with transform alone. */}
                <span
                  aria-hidden
                  className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#d97757] transition-transform duration-300"
                  style={{ transform: `translateX(-50%) scale(${active ? 1 : 0})` }}
                />
              </a>
            )
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {/* Hiring side. Routes into the app rather than to a marketing page —
           * creating an organisation needs an account, and sending someone to
           * a pitch they have to bounce out of is a step for nothing. */}
          <Link
            href="/pricing"
            className="hidden rounded-lg px-2 py-2 text-[13.5px] text-[#5e5d59] transition-colors hover:text-[#141413] sm:inline-flex"
          >
            For teams
          </Link>
          <Link
            href="/login"
            className="rounded-lg px-2 py-2 text-[13.5px] text-[#5e5d59] transition-colors hover:text-[#141413]"
          >
            Sign in
          </Link>
          <Link
            href="/interview"
            className="inline-flex h-9 items-center rounded-full bg-[#141413] px-5 text-[13.5px] font-medium text-[#faf9f5] transition-colors duration-300 hover:bg-[#3a3a37]"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  )
}

export function PublicLanding() {
  const heroRef = useRef<HTMLElement>(null)

  return (
    <div className={`${display.variable} w-full shrink-0 bg-[#faf9f5] text-[#141413]`}>
      <style>{`
        @keyframes probe-enter { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
        .probe-enter { animation: probe-enter 900ms cubic-bezier(0.16,1,0.3,1) both; }
        @media (prefers-reduced-motion: reduce) { .probe-enter { animation: none; } }
      `}</style>

      <Nav heroRef={heroRef} />

      {/* Hero — one idea, said once. */}
      <section ref={heroRef} className={`${SHELL} pb-16 pt-20 text-center sm:pb-24 sm:pt-28`}>
        <h1
          className="probe-enter mx-auto max-w-[19ch] text-[clamp(2.6rem,6.2vw,4.5rem)] font-normal leading-[1.05] tracking-[-0.02em]"
          style={{ ...SERIF, animationDelay: '60ms' }}
        >
          The interview room, before it counts
        </h1>

        <p
          className="probe-enter mx-auto mt-7 max-w-[52ch] text-[1.0625rem] leading-[1.7] text-[#5e5d59]"
          style={{ animationDelay: '180ms' }}
        >
          PROBE puts you in front of three AI interviewers who listen to what you say, push on it, and score what you
          actually demonstrated — in a room where getting it wrong costs you nothing.
        </p>

        <div
          className="probe-enter mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: '300ms' }}
        >
          <Link
            href="/interview"
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#141413] px-8 text-[15px] font-medium text-[#faf9f5] transition-colors hover:bg-[#3a3a37] sm:w-auto"
          >
            Start an interview
          </Link>
          <a
            href="#how"
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-[#141413]/20 px-8 text-[15px] font-medium text-[#141413] transition-colors hover:border-[#141413]/45 sm:w-auto"
          >
            See how it works
          </a>
        </div>
      </section>

      {/* The page's one scroll moment: this opens from a contained card out
       * to the full width of the screen as you come down into it. */}
      <div className="probe-enter" style={{ animationDelay: '420ms' }}>
        <ExpandingStage>
          <InterviewDemo />
        </ExpandingStage>
      </div>

      <section id="how" className={`${SHELL} scroll-mt-24 py-24 sm:py-32`}>
        <Reveal>
          <h2
            className="max-w-[16ch] text-[clamp(2rem,4vw,2.9rem)] font-normal leading-[1.1] tracking-[-0.015em]"
            style={SERIF}
          >
            Three steps, about fifteen minutes
          </h2>
        </Reveal>

        <div className="mt-14 flex flex-col">
          {STEPS.map(({ n, t, d }, i) => (
            <Reveal key={n} delayMs={i * 90}>
              <div className="grid grid-cols-1 gap-3 border-t border-[#141413]/12 py-9 sm:grid-cols-[4rem_1fr] sm:gap-10 md:grid-cols-[4rem_20rem_1fr]">
                <span className="text-sm tabular-nums text-[#d97757]">{n}</span>
                <h3 className="text-[1.25rem] font-medium leading-snug tracking-[-0.01em]">{t}</h3>
                <p className="max-w-[54ch] text-[15px] leading-[1.7] text-[#5e5d59]">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="panel" className={`${SHELL} scroll-mt-24 pb-24 sm:pb-32`}>
        <Reveal>
          <h2
            className="max-w-[18ch] text-[clamp(2rem,4vw,2.9rem)] font-normal leading-[1.1] tracking-[-0.015em]"
            style={SERIF}
          >
            Not one interviewer. Three.
          </h2>
        </Reveal>
        <Reveal delayMs={80}>
          <p className="mt-5 max-w-[54ch] text-[15px] leading-[1.7] text-[#5e5d59]">
            They hand the conversation between themselves while it is running, the way a real loop does — and each one
            remembers what the last one already asked you.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {PANEL_AVATAR_ORDER.map((id, i) => (
            <Reveal key={id} delayMs={i * 90} className="h-full">
              <article className="group flex h-full flex-col rounded-2xl border border-[#141413]/12 bg-[#f0eee6] p-7 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-1 hover:border-[#141413]/25 hover:shadow-[0_18px_40px_-24px_rgba(20,20,19,0.45)]">
                <div className="flex items-baseline justify-between">
                  <span className="font-sans text-[11px] tabular-nums tracking-[0.2em] text-[#d97757]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-sans text-[10px] uppercase tracking-[0.16em] text-[#5e5d59]/60">
                    {PANEL_AVATARS[id].voiceName}
                  </span>
                </div>

                <h3 className="mt-7 text-[1.4rem] font-normal leading-tight tracking-[-0.01em]" style={SERIF}>
                  {PANEL_AVATARS[id].label}
                </h3>

                <span
                  aria-hidden
                  className="mt-5 block h-px w-10 bg-[#141413]/20 transition-all duration-300 group-hover:w-16 group-hover:bg-[#d97757]"
                />

                <p className="mt-5 text-[14.5px] leading-[1.65] text-[#5e5d59]">{PANEL_NOTES[id]}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Everything either side of the interview itself. These are real
       * routes in the product — /resume and /opportunities — and the
       * illustrations mirror what those pages actually render. */}
      <section id="more" className="scroll-mt-24 border-t border-[#141413]/12 bg-[#faf9f5]">
        <div className={`${SHELL} py-24 sm:py-32`}>
          <Reveal>
            <h2
              className="max-w-[20ch] text-[clamp(2rem,4vw,2.9rem)] font-normal leading-[1.1] tracking-[-0.015em]"
              style={SERIF}
            >
              The interview is the middle of it
            </h2>
          </Reveal>
          <Reveal delayMs={80}>
            <p className="mt-5 max-w-[56ch] text-[15px] leading-[1.7] text-[#5e5d59]">
              Knowing which roles to go for, and which openings are worth your afternoon, is the part nobody helps with.
              PROBE does both — and then hands you back to the panel to rehearse the one you picked.
            </p>
          </Reveal>

          <div className="mt-16 flex flex-col gap-20 sm:gap-24">
            {FEATURES.map(({ id, eyebrow, title, body, points, href, cta, mock: Mock, flip }) => (
              <div key={id} className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <Reveal className={flip ? 'lg:order-2' : undefined}>
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d97757]">
                    {eyebrow}
                  </span>
                  <h3
                    className="mt-5 max-w-[16ch] text-[clamp(1.6rem,2.8vw,2.1rem)] font-normal leading-[1.15] tracking-[-0.015em]"
                    style={SERIF}
                  >
                    {title}
                  </h3>
                  <p className="mt-5 max-w-[46ch] text-[15px] leading-[1.7] text-[#5e5d59]">{body}</p>

                  <ul className="mt-7 flex flex-col gap-3">
                    {points.map((point) => (
                      <li key={point} className="flex gap-3 text-[14.5px] leading-[1.6] text-[#141413]">
                        <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-[#d97757]" />
                        {point}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={href}
                    className="group mt-8 inline-flex items-center gap-2 text-[15px] font-medium text-[#141413]"
                  >
                    <span className="border-b border-[#141413]/25 pb-0.5 transition-colors group-hover:border-[#141413]">
                      {cta}
                    </span>
                    <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
                  </Link>
                </Reveal>

                <Reveal delayMs={110} className={flip ? 'lg:order-1' : undefined}>
                  <Mock />
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PricingBand />

      <section className="border-t border-[#141413]/12">
        <div className={`${SHELL} py-24 text-center sm:py-32`}>
          <Reveal>
            <h2
              className="mx-auto max-w-[24ch] text-[clamp(2rem,4.4vw,3.2rem)] font-normal leading-[1.08] tracking-[-0.02em]"
              style={SERIF}
            >
              Your next interview starts here
            </h2>
          </Reveal>
          <Reveal delayMs={90}>
            <Link
              href="/interview"
              className="mt-9 inline-flex h-12 items-center justify-center rounded-full bg-[#141413] px-8 text-[15px] font-medium text-[#faf9f5] transition-colors hover:bg-[#3a3a37]"
            >
              Start an interview
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-[#141413]/12">
        <div className={`${SHELL} flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between`}>
          <img src="/Logo%20Svg/main%20text.svg" alt="PROBE" className="h-5 w-auto opacity-70" />
          <div className="flex items-center gap-6 text-[13px] text-[#5e5d59]">
            <a href="#how" className="transition-colors hover:text-[#141413]">
              How it works
            </a>
            <a href="#panel" className="transition-colors hover:text-[#141413]">
              The panel
            </a>
            <a href="#more" className="transition-colors hover:text-[#141413]">
              Resume &amp; jobs
            </a>
            <Link href="/pricing" className="transition-colors hover:text-[#141413]">
              Pricing
            </Link>
            <Link href="/login" className="transition-colors hover:text-[#141413]">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

/**
 * The pricing band.
 *
 * Two columns, not three cards. A landing page is the wrong place to compare
 * tiers — that is what /pricing is for — and putting a three-card grid here
 * would ask a visitor who came to read about interviews to start doing
 * procurement. What it does instead is answer the only two questions the page
 * has left open: does this cost me anything (no), and what does it cost my
 * employer (a number, and a link).
 */
function PricingBand() {
  const cheapest = PLANS.find((plan) => plan.pricePaise !== null)

  return (
    <section id="pricing" className="scroll-mt-24 border-t border-[#141413]/12 bg-[#f4f2ec]">
      <div className={`${SHELL} py-24 sm:py-32`}>
        <Reveal>
          <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d97757]">Pricing</span>
          <h2
            className="mt-5 max-w-[22ch] text-[clamp(2rem,4vw,2.9rem)] font-normal leading-[1.1] tracking-[-0.015em]"
            style={SERIF}
          >
            Free to practise. Paid to hire.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-2 lg:gap-8">
          <Reveal>
            <div className="flex h-full flex-col rounded-2xl border border-[#141413]/12 bg-[#faf9f5] p-8 sm:p-9">
              <p className="font-sans text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[#5e5d59]">
                You, preparing
              </p>
              <p className="mt-4 text-[3rem] font-normal leading-none tracking-[-0.02em]" style={SERIF}>
                {CANDIDATE_PLAN.price}
              </p>
              <p className="mt-4 max-w-[40ch] text-[15px] leading-[1.7] text-[#5e5d59]">
                Every practice interview, every scorecard, the resume analysis and the matched openings. No card, and no
                trial that quietly ends.
              </p>
              <Link
                href="/interview"
                className="mt-8 inline-flex h-11 w-fit items-center rounded-full bg-[#141413] px-6 text-[14.5px] font-medium text-[#faf9f5] transition-colors hover:bg-[#3a3a37]"
              >
                Start an interview
              </Link>
            </div>
          </Reveal>

          <Reveal delayMs={110}>
            <div className="flex h-full flex-col rounded-2xl border border-[#141413]/12 bg-[#faf9f5] p-8 sm:p-9">
              <p className="font-sans text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[#5e5d59]">
                Your company, hiring
              </p>
              <p
                className="mt-4 flex items-baseline gap-2 text-[3rem] font-normal leading-none tracking-[-0.02em]"
                style={SERIF}
              >
                <span className="tabular-nums">
                  {cheapest ? formatPrice(cheapest.pricePaise ?? 0, cheapest.currency) : '—'}
                </span>
                <span className="font-sans text-[15px] tracking-normal text-[#5e5d59]">/ year and up</span>
              </p>
              <p className="mt-4 max-w-[42ch] text-[15px] leading-[1.7] text-[#5e5d59]">
                Roles you define, candidates scored on criteria you set, and the evidence behind every call. Seats are
                included, not billed on top.
              </p>
              <Link
                href="/pricing"
                className="group mt-8 inline-flex w-fit items-center gap-2 text-[15px] font-medium text-[#141413]"
              >
                <span className="border-b border-[#141413]/25 pb-0.5 transition-colors group-hover:border-[#141413]">
                  See what each plan includes
                </span>
                <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
