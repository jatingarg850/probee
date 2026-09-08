'use client'

import { Source_Serif_4 } from 'next/font/google'
import Link from 'next/link'
import { useState } from 'react'

import { Reveal } from '@/components/landing/primitives'
import { CANDIDATE_PLAN, PLANS, type Plan, formatPrice } from '@/lib/plans'

/**
 * The public pricing page.
 *
 * ============================================================
 * TWO AUDIENCES, ONE PAGE, IN THE RIGHT ORDER
 * ============================================================
 * A candidate practising for an interview and a company running interviews are
 * both real visitors here, and they want opposite things — one is checking
 * whether this costs money, the other is comparing tiers. Splitting them
 * across two pages means half the visitors land on the wrong one.
 *
 * So: the candidate answer ("free, and here is exactly what that includes")
 * comes first and is short, because it is a single fact and dwelling on it
 * would read like a sales pitch for something with no price. The hiring plans
 * follow, with room to compare.
 *
 * Set in the landing page's palette, not the app's tokens — `#faf9f5` ground,
 * `#141413` ink, `#d97757` accent — because this page sits alongside the
 * signed-out landing page and shares its typography.
 */

const display = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '600'],
  variable: '--font-pricing-serif',
})

const SHELL = 'mx-auto w-full max-w-[72rem] px-6 sm:px-10'
const SERIF = { fontFamily: 'var(--font-pricing-serif), Georgia, serif' } as const

export function PricingPage() {
  return (
    <div className={`${display.variable} w-full shrink-0 bg-[#faf9f5] text-[#141413]`}>
      <Nav />

      <section className={`${SHELL} pb-14 pt-16 sm:pt-24`}>
        <Reveal>
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#d97757]">Pricing</p>
          <h1
            style={SERIF}
            className="mt-4 max-w-[18ch] text-[2.6rem] font-semibold leading-[1.06] tracking-[-0.02em] sm:text-[3.6rem]"
          >
            Practice is free. Hiring is priced per year.
          </h1>
          <p className="mt-6 max-w-[62ch] text-[16.5px] leading-[1.65] text-[#5e5d59]">
            Preparing for your own interviews costs nothing and always will. Running interviews for a company is what we
            charge for, because that is where the cost of the thing actually sits.
          </p>
        </Reveal>
      </section>

      <CandidateBand />
      <HiringPlans />
      <UnitEconomics />
      <Questions />
      <Footer />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Nav
 * ------------------------------------------------------------------ */

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#141413]/10 bg-[#faf9f5]/85 backdrop-blur-xl">
      <div className={`flex h-16 items-center justify-between gap-6 ${SHELL}`}>
        <Link href="/" aria-label="PROBE home" className="shrink-0">
          <img src="/Logo%20Svg/main%20text.svg" alt="PROBE" className="h-[1.6rem] w-auto" />
        </Link>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <Link
            href="/"
            className="hidden rounded-lg px-2 py-2 text-[13.5px] text-[#5e5d59] transition-colors hover:text-[#141413] sm:inline-flex"
          >
            How it works
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

/* ------------------------------------------------------------------ *
 * Candidates
 * ------------------------------------------------------------------ */

function CandidateBand() {
  return (
    <section className={`${SHELL} pb-20`}>
      <Reveal>
        <div className="grid gap-10 rounded-2xl border border-[#141413]/12 bg-white/60 p-8 sm:p-11 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#5e5d59]">For candidates</p>
            <h2 style={SERIF} className="mt-3 text-[2rem] font-semibold leading-[1.12] tracking-[-0.015em]">
              {CANDIDATE_PLAN.name}
            </h2>
            <p className="mt-3 text-[15px] leading-[1.65] text-[#5e5d59]">{CANDIDATE_PLAN.tagline}</p>

            <p style={SERIF} className="mt-7 text-[3rem] font-semibold leading-none tracking-[-0.02em]">
              {CANDIDATE_PLAN.price}
            </p>
            <p className="mt-2 text-[13.5px] text-[#5e5d59]">No card. No trial that ends.</p>

            <Link
              href="/interview"
              className="mt-7 inline-flex h-11 items-center rounded-full bg-[#141413] px-6 text-[14px] font-medium text-[#faf9f5] transition-colors duration-300 hover:bg-[#3a3a37]"
            >
              Start an interview
            </Link>
          </div>

          <ul className="flex flex-col justify-center gap-3.5">
            {CANDIDATE_PLAN.features.map((feature) => (
              <li key={feature} className="flex gap-3 text-[14.5px] leading-[1.6] text-[#141413]">
                <Tick />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Hiring plans
 * ------------------------------------------------------------------ */

function HiringPlans() {
  return (
    <section id="teams" className="border-t border-[#141413]/12 bg-[#f4f2ec] py-20 sm:py-24">
      <div className={SHELL}>
        <Reveal>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#5e5d59]">For hiring teams</p>
          <h2
            style={SERIF}
            className="mt-3 max-w-[20ch] text-[2.2rem] font-semibold leading-[1.1] tracking-[-0.018em] sm:text-[2.7rem]"
          >
            Every plan is the whole product. The difference is volume.
          </h2>
          <p className="mt-5 max-w-[62ch] text-[15.5px] leading-[1.65] text-[#5e5d59]">
            There is no tier where the scoring gets worse, or where the evidence behind a decision is held back. Paying
            more buys more interviews and more colleagues, not a better interviewer.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan, index) => (
            <Reveal key={plan.id} delayMs={index * 90}>
              <PlanCard plan={plan} />
            </Reveal>
          ))}
        </div>

        <p className="mt-8 text-[13px] leading-[1.65] text-[#5e5d59]">
          Prices are per organisation per year, in Indian rupees, exclusive of GST. An interview is one completed
          candidate session of up to 45 minutes.
        </p>
      </div>
    </section>
  )
}

function PlanCard({ plan }: { plan: Plan }) {
  const custom = plan.pricePaise === null

  return (
    <div
      className={`flex h-full flex-col rounded-2xl border bg-[#faf9f5] p-7 transition-shadow duration-300 ${
        plan.recommended ? 'border-[#d97757]/55 shadow-[0_2px_28px_-14px_rgba(217,119,87,0.65)]' : 'border-[#141413]/12'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 style={SERIF} className="text-[1.5rem] font-semibold tracking-[-0.01em]">
          {plan.name}
        </h3>
        {plan.recommended ? (
          <span className="shrink-0 rounded-full bg-[#d97757]/12 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[#b8552f]">
            Most teams
          </span>
        ) : null}
      </div>

      <p className="mt-2.5 min-h-[3.2rem] text-[14px] leading-[1.6] text-[#5e5d59]">{plan.tagline}</p>

      <div className="mt-6 border-t border-[#141413]/10 pt-6">
        {custom ? (
          <p style={SERIF} className="text-[2.1rem] font-semibold leading-none tracking-[-0.02em]">
            Let&rsquo;s talk
          </p>
        ) : (
          <p className="flex items-baseline gap-1.5">
            <span style={SERIF} className="text-[2.5rem] font-semibold leading-none tracking-[-0.02em] tabular-nums">
              {formatPrice(plan.pricePaise ?? 0, plan.currency)}
            </span>
            <span className="text-[14px] text-[#5e5d59]">/ year</span>
          </p>
        )}
        <p className="mt-2 text-[13px] text-[#5e5d59]">
          {custom
            ? 'Priced against your interview volume.'
            : plan.overagePaise !== null
              ? `Then ${formatPrice(plan.overagePaise, plan.currency)} per interview beyond the allowance.`
              : ''}
        </p>
      </div>

      <ul className="mt-6 flex flex-1 flex-col gap-3">
        {plan.features.map((feature) => {
          // A feature line ending in a colon is a carry-forward marker
          // ("Everything in Starter, plus:"), not a feature. It gets no tick —
          // ticking it would claim a capability that has no meaning on its own.
          const isCarryForward = feature.endsWith(':')
          return (
            <li
              key={feature}
              className={
                isCarryForward
                  ? 'pt-1.5 text-[13px] font-medium uppercase tracking-[0.08em] text-[#5e5d59]'
                  : 'flex gap-2.5 text-[14px] leading-[1.55] text-[#141413]'
              }
            >
              {isCarryForward ? feature.replace(/:$/, '') : <Tick />}
              {isCarryForward ? null : <span>{feature}</span>}
            </li>
          )
        })}
      </ul>

      <Link
        href={custom ? '/orgs/new?plan=scale' : `/orgs/new?plan=${plan.id}`}
        className={`mt-8 inline-flex h-11 items-center justify-center rounded-full px-6 text-[14px] font-medium transition-colors duration-300 ${
          plan.recommended
            ? 'bg-[#d97757] text-white hover:bg-[#c26743]'
            : 'border border-[#141413]/20 text-[#141413] hover:border-[#141413]/45'
        }`}
      >
        {custom ? 'Get in touch' : `Start with ${plan.name}`}
      </Link>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * What you are paying for
 * ------------------------------------------------------------------ */

/**
 * Where the money goes.
 *
 * Unusual to publish, and deliberate. The alternative pitch — "cheaper than a
 * recruiter's time" — invites the buyer to imagine the margin is enormous, and
 * they are not wrong to wonder. Saying that a live interview costs real money
 * to run, and roughly how much, is both true and the strongest available
 * argument that the price is not arbitrary.
 */
function UnitEconomics() {
  const facts = [
    {
      k: 'Every interview is live',
      v: 'Speech recognition, three interviewer voices and the model deciding what to ask next all run in real time, for the whole conversation. That has a per-minute cost that does not fall with scale the way storage does.',
    },
    {
      k: 'You are not charged for practice',
      v: 'Candidates interviewing with you have their own free PROBE account for practice. Nothing they do on their own time appears on your bill, and nothing you see about them comes from it.',
    },
    {
      k: 'No per-seat surprise',
      v: 'Seats are included in the plan, not billed on top. Adding a hiring manager to review candidates should not be a purchasing decision.',
    },
  ]

  return (
    <section className={`${SHELL} py-20 sm:py-24`}>
      <Reveal>
        <h2
          style={SERIF}
          className="max-w-[20ch] text-[2rem] font-semibold leading-[1.12] tracking-[-0.018em] sm:text-[2.4rem]"
        >
          What you are actually paying for
        </h2>
      </Reveal>
      <dl className="mt-10 grid gap-x-12 gap-y-9 sm:grid-cols-3">
        {facts.map(({ k, v }, index) => (
          <Reveal key={k} delayMs={index * 80}>
            <dt className="text-[15px] font-semibold text-[#141413]">{k}</dt>
            <dd className="mt-2 text-[14.5px] leading-[1.65] text-[#5e5d59]">{v}</dd>
          </Reveal>
        ))}
      </dl>
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Questions
 * ------------------------------------------------------------------ */

const QUESTIONS = [
  {
    q: 'What happens when we use up our included interviews?',
    a: 'Nothing breaks. Interviews beyond the allowance are charged at the per-interview rate on your plan, and shown on your next invoice. Interviews already in progress are never cut off.',
  },
  {
    q: 'Do candidates need to pay, or even have an account?',
    a: 'No. A candidate opens the link you send and interviews. Practice on PROBE is free and separate — nothing a candidate does there is visible to you, and nothing about your interview appears in their practice history.',
  },
  {
    q: 'Who can see a candidate’s interview?',
    a: 'People you have given a role in your organisation, and nobody else. PROBE staff can see aggregate usage and cost, not transcripts or scores. That boundary is enforced in the code, not by policy.',
  },
  {
    q: 'How long is candidate data kept?',
    a: 'You choose, between 30 days and five years, in your organisation settings. The floor exists because a candidate needs time to ask for their data — in Illinois they have 30 days to request deletion, which means nothing if the record is already gone.',
  },
  {
    q: 'Can we cancel?',
    a: 'A plan runs for a year and is not auto-renewed without you saying so. If you stop, your data stays available for the retention window you set, so an open hiring process is not lost overnight.',
  },
]

function Questions() {
  const [open, setOpen] = useState<string | null>(QUESTIONS[0].q)

  return (
    <section className="border-t border-[#141413]/12 bg-[#f4f2ec] py-20 sm:py-24">
      <div className={`${SHELL} grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16`}>
        <Reveal>
          <h2 style={SERIF} className="text-[2rem] font-semibold leading-[1.12] tracking-[-0.018em] sm:text-[2.4rem]">
            Before you buy
          </h2>
          <p className="mt-4 max-w-[38ch] text-[15px] leading-[1.65] text-[#5e5d59]">
            The five things teams ask, answered without the hedging.
          </p>
        </Reveal>

        <div className="divide-y divide-[#141413]/12 border-y border-[#141413]/12">
          {QUESTIONS.map(({ q, a }) => {
            const isOpen = open === q
            return (
              <div key={q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : q)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start justify-between gap-6 py-5 text-left"
                >
                  <span className="text-[15.5px] font-medium leading-[1.5] text-[#141413]">{q}</span>
                  <span
                    aria-hidden
                    className="mt-1 shrink-0 text-[#d97757] transition-transform duration-300"
                    style={{ transform: isOpen ? 'rotate(45deg)' : 'none' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
                {/* Grid-rows trick: animates open and closed without a fixed
                 * height, and costs no layout thrash mid-transition. */}
                <div
                  className="grid transition-[grid-template-rows] duration-400 ease-out motion-reduce:transition-none"
                  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <p className="pb-5 pr-10 text-[14.5px] leading-[1.7] text-[#5e5d59]">{a}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Footer
 * ------------------------------------------------------------------ */

function Footer() {
  return (
    <>
      <section className={`${SHELL} py-20 text-center sm:py-28`}>
        <Reveal>
          <h2
            style={SERIF}
            className="mx-auto max-w-[20ch] text-[2.2rem] font-semibold leading-[1.1] tracking-[-0.018em] sm:text-[2.9rem]"
          >
            Run one interview before you decide.
          </h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-[15.5px] leading-[1.65] text-[#5e5d59]">
            Sit in the candidate&rsquo;s chair yourself. It costs nothing, takes fifteen minutes, and tells you more
            than this page can.
          </p>
          <Link
            href="/interview"
            className="mt-9 inline-flex h-12 items-center rounded-full bg-[#141413] px-7 text-[14.5px] font-medium text-[#faf9f5] transition-colors duration-300 hover:bg-[#3a3a37]"
          >
            Try it yourself
          </Link>
        </Reveal>
      </section>

      <footer className="border-t border-[#141413]/12">
        <div className={`${SHELL} flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between`}>
          <img src="/Logo%20Svg/main%20text.svg" alt="PROBE" className="h-5 w-auto opacity-70" />
          <div className="flex items-center gap-6 text-[13px] text-[#5e5d59]">
            <Link href="/" className="transition-colors hover:text-[#141413]">
              How it works
            </Link>
            <Link href="/orgs/new" className="transition-colors hover:text-[#141413]">
              For teams
            </Link>
            <Link href="/login" className="transition-colors hover:text-[#141413]">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </>
  )
}

function Tick() {
  return (
    <svg
      aria-hidden
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      className="mt-[3px] shrink-0 text-[#d97757]"
    >
      <path
        d="M3 8.5l3.2 3.2L13 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
