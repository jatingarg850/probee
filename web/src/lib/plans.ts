/**
 * What a customer buys, and what they get for it.
 *
 * Browser-safe — no database, no Razorpay. Imported by the pricing page, the
 * checkout page, the settings page, and the server routes that price an order,
 * so there is exactly one place where a price or an entitlement is written
 * down. A number that appears on a marketing page and again in a checkout
 * route will eventually disagree with itself.
 *
 * ============================================================
 * TWO DIFFERENT FIELDS CALLED "PLAN"
 * ============================================================
 * An organisation carries both:
 *
 *   `plan`   — lifecycle status: trial | active | suspended. Whether the
 *              account works at all.
 *   `planId` — which tier they bought: starter | growth | scale. What their
 *              limits are.
 *
 * They are genuinely independent: a suspended Growth customer is a real state.
 * `OrganizationPlan` in orgTypes.ts is the first one; `PlanId` here is the
 * second.
 *
 * ============================================================
 * WHERE THE PRICES COME FROM
 * ============================================================
 * A 15-minute interview costs roughly ₹150 to run — Agora's Conversational AI
 * Engine is about 89% of that, with Gemini and storage making up the rest (see
 * `docs/reference/RECRUITER_ROADMAP.md` and the S1 cost records). The included
 * interview counts below are set so that a customer who uses their whole
 * allowance still leaves a gross margin in the 60–70% range, which is what
 * makes the support and infrastructure around the product affordable. Raising
 * an allowance without moving the price is not a marketing decision.
 */

export type PlanId = 'starter' | 'growth' | 'scale'

/** Ordered smallest to largest. Used for display order and for comparing tiers. */
export const PLAN_IDS = ['starter', 'growth', 'scale'] as const

export interface Plan {
  id: PlanId
  name: string
  /** One line, on the customer's terms — what this tier is *for*. */
  tagline: string
  /**
   * Price in paise for one year, or null for "talk to us".
   *
   * Paise, not rupees, because that is the unit Razorpay works in and a
   * conversion sitting between the two is the classic factor-of-100 payments
   * bug. ₹4,999.00 is 499900.
   */
  pricePaise: number | null
  currency: string
  /** Interviews included per year. `null` means no fixed cap — negotiated. */
  includedInterviews: number | null
  /** People who can be given a role in the organisation. */
  seats: number | null
  /** Jobs that can be open at once. Closed jobs never count. */
  activeJobs: number | null
  /** Charged per interview beyond the allowance. Null on custom plans. */
  overagePaise: number | null
  features: string[]
  /** The tier the pricing page leads with. Exactly one plan should set this. */
  recommended?: boolean
}

export const PLANS: readonly Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For a first hire, or a team trying this properly before committing.',
    pricePaise: 499900,
    currency: 'INR',
    includedInterviews: 10,
    seats: 3,
    activeJobs: 5,
    overagePaise: 39900,
    features: [
      '10 candidate interviews included',
      '3 team seats',
      '5 open roles at a time',
      'Weighted competency scoring you define per role',
      'Full transcript and evidence for every answer',
      'Structured consent capture for every candidate',
      'Email support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'For a team hiring continuously across several roles.',
    pricePaise: 1999900,
    currency: 'INR',
    includedInterviews: 50,
    seats: 10,
    activeJobs: null,
    overagePaise: 29900,
    recommended: true,
    features: [
      '50 candidate interviews included',
      '10 team seats',
      'Unlimited open roles',
      'Everything in Starter, plus:',
      'Side-by-side candidate comparison on the same criteria',
      'Configurable data retention, down to 30 days',
      'Adverse-impact summary for NYC Local Law 144',
      'Priority support',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    tagline: 'For volume hiring, or where legal needs to sign off first.',
    pricePaise: null,
    currency: 'INR',
    includedInterviews: null,
    seats: null,
    activeJobs: null,
    overagePaise: null,
    features: [
      'Interview volume priced to your intake',
      'Unlimited seats',
      'Everything in Growth, plus:',
      'SSO and enforced domain sign-in',
      'Audit export of every scoring decision',
      'Data-processing agreement and security review',
      'A named contact, not a queue',
    ],
  },
]

export const DEFAULT_PLAN_ID: PlanId = 'starter'

export function getPlan(id: unknown): Plan | null {
  return PLANS.find((plan) => plan.id === id) ?? null
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value)
}

/** A plan someone can actually buy through checkout. `scale` is sales-led, so
 * a request to purchase it directly is a bug or a probe, not a customer. */
export function isPurchasablePlan(plan: Plan): boolean {
  return plan.pricePaise !== null
}

/**
 * Price rendered for a person.
 *
 * `maximumFractionDigits: 0` because every price here is a whole number of
 * rupees; showing "₹4,999.00" on a marketing page reads as machine output.
 */
export function formatPrice(paise: number, currency = 'INR'): string {
  const major = paise / 100
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(major)
  } catch {
    return `${currency} ${major}`
  }
}

/**
 * What the candidate side costs.
 *
 * Kept here beside the hiring plans because the pricing page shows both, and
 * because the answer being "nothing" is a deliberate position rather than an
 * oversight: practice is what brings candidates to the product at all, and a
 * paywall in front of interview practice lands hardest on the people who most
 * need it.
 */
export const CANDIDATE_PLAN = {
  name: 'Practice',
  price: 'Free',
  tagline: 'For anyone getting ready for an interview.',
  features: [
    'Unlimited practice interviews with a live panel',
    'Scored feedback with the evidence behind it',
    'Resume analysis against real job descriptions',
    'Matched openings, ranked against your resume',
    'Your practice history stays private to you — no employer sees it',
  ],
} as const
