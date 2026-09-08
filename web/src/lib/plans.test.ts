import { describe, expect, it } from 'bun:test'

import { CANDIDATE_PLAN, DEFAULT_PLAN_ID, PLANS, formatPrice, getPlan, isPlanId, isPurchasablePlan } from '@/lib/plans'

/**
 * These are not tests of arithmetic. Every one of them guards a property that,
 * if it broke, would either charge somebody the wrong amount or promise them
 * something they are not getting — and would do it silently, because a wrong
 * price is still a valid number.
 */

describe('plans', () => {
  it('has exactly one recommended tier', () => {
    // Two "most teams" badges on a pricing page is a design bug that reads as
    // a mistake to a buyer, and no badge wastes the page's one steer.
    expect(PLANS.filter((plan) => plan.recommended)).toHaveLength(1)
  })

  it('has unique ids and a resolvable default', () => {
    const ids = PLANS.map((plan) => plan.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(getPlan(DEFAULT_PLAN_ID)).not.toBeNull()
  })

  it('prices every purchasable plan in whole rupees', () => {
    // Prices are stored in paise. A tier priced at 499950 renders as "₹5,000"
    // because the formatter drops the fraction — and then charges ₹4,999.50.
    for (const plan of PLANS) {
      if (plan.pricePaise === null) continue
      expect(plan.pricePaise % 100).toBe(0)
      expect(plan.pricePaise).toBeGreaterThan(0)
    }
  })

  it('orders tiers so that paying more never buys less', () => {
    const paid = PLANS.filter((plan) => plan.pricePaise !== null)
    for (let i = 1; i < paid.length; i++) {
      const cheaper = paid[i - 1]
      const dearer = paid[i]
      expect(dearer.pricePaise ?? 0).toBeGreaterThan(cheaper.pricePaise ?? 0)
      expect(dearer.includedInterviews ?? Number.POSITIVE_INFINITY).toBeGreaterThan(cheaper.includedInterviews ?? 0)
      expect(dearer.seats ?? Number.POSITIVE_INFINITY).toBeGreaterThan(cheaper.seats ?? 0)
      // Overage should get cheaper as the tier gets larger, or the larger plan
      // is a worse deal for exactly the customers it is aimed at.
      expect(dearer.overagePaise ?? 0).toBeLessThanOrEqual(cheaper.overagePaise ?? Number.POSITIVE_INFINITY)
    }
  })

  it('keeps every included interview above what it costs to run', () => {
    // ~₹150 per 15-minute interview, dominated by Agora's Conversational AI
    // Engine. A plan whose per-interview revenue falls under this is sold at a
    // loss, and the more it sells the worse that gets.
    const COST_PER_INTERVIEW_PAISE = 15000
    for (const plan of PLANS) {
      if (plan.pricePaise === null || plan.includedInterviews === null) continue
      const perInterview = plan.pricePaise / plan.includedInterviews
      expect(perInterview).toBeGreaterThan(COST_PER_INTERVIEW_PAISE)
      if (plan.overagePaise !== null) expect(plan.overagePaise).toBeGreaterThan(COST_PER_INTERVIEW_PAISE)
    }
  })

  it('treats the sales-led tier as not purchasable', () => {
    const scale = getPlan('scale')
    expect(scale).not.toBeNull()
    expect(isPurchasablePlan(scale!)).toBe(false)
  })

  it('rejects anything that is not a plan id', () => {
    for (const value of ['', 'STARTER', 'free', null, undefined, 0, {}, ['starter']]) {
      expect(isPlanId(value)).toBe(false)
    }
    expect(isPlanId('starter')).toBe(true)
  })

  it('marks carry-forward lines with a trailing colon and nothing else', () => {
    // The pricing card renders a line ending in ":" as a section marker rather
    // than a ticked feature. A real feature that happens to end in a colon
    // would silently lose its tick.
    for (const plan of PLANS) {
      for (const feature of plan.features) {
        if (feature.endsWith(':')) expect(feature.toLowerCase()).toContain('everything in')
      }
    }
  })

  it('formats a price without a fractional part', () => {
    expect(formatPrice(499900)).toContain('4,999')
    expect(formatPrice(499900)).not.toContain('.00')
  })

  it('states a price for candidates', () => {
    expect(CANDIDATE_PLAN.price).toBe('Free')
    expect(CANDIDATE_PLAN.features.length).toBeGreaterThan(0)
  })
})
