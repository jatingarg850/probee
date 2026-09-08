import crypto from 'node:crypto'

import Razorpay from 'razorpay'

import { type Plan, type PlanId, getPlan, isPurchasablePlan } from '@/lib/plans'

/**
 * Razorpay billing for organisation creation.
 *
 * ============================================================
 * THE RULE THIS FILE EXISTS TO ENFORCE
 * ============================================================
 * An organisation is created by the *verify* route, after a payment signature
 * has been checked server-side — never by the client saying it paid.
 *
 * Razorpay's checkout hands the browser a `razorpay_payment_id`,
 * `razorpay_order_id` and `razorpay_signature`. Only the signature is
 * meaningful: it is an HMAC-SHA256 of `order_id|payment_id` keyed with the
 * secret, which only this server holds. A client can trivially POST a made-up
 * payment id; it cannot forge the HMAC. So every field the client sends is
 * treated as a claim, and the signature is the only thing that turns a claim
 * into a fact.
 *
 * ============================================================
 * ONE-TIME ORDERS, NOT SUBSCRIPTIONS — FOR NOW
 * ============================================================
 * Razorpay Subscriptions require plans configured in their dashboard and a
 * webhook to track renewals, which is more moving parts than a first
 * integration needs. This uses Orders: a single activation payment per
 * organisation. Moving to subscriptions later changes `createOrder` and adds a
 * webhook handler; the "verify before create" rule above does not change.
 */

/** Test keys work here unchanged — Razorpay distinguishes test from live by
 * the key prefix (`rzp_test_` vs `rzp_live_`), not by a separate endpoint. */
const KEY_ID_ENV = 'RAZORPAY_KEY_ID'
const KEY_SECRET_ENV = 'RAZORPAY_KEY_SECRET'

/**
 * Prices live in `lib/plans.ts`, not here.
 *
 * Amounts are in the smallest currency unit — Razorpay works in paise, not
 * rupees. ₹4,999.00 is 499900. Getting this wrong by a factor of 100 is the
 * classic payments bug, so every variable carrying one says `Paise`.
 *
 * `resolvePlan` is the only way a price enters this module, and it takes a
 * plan *id* rather than an amount. A route that accepted an amount from a
 * request body would be letting the buyer name their own price; a route that
 * accepts an id can only ever select one of three numbers this server wrote.
 */
export const ORG_ACTIVATION_CURRENCY = 'INR'

export type ResolvedPlan = { ok: true; plan: Plan; amountPaise: number } | { ok: false; error: string; status: number }

export function resolvePlan(planId: unknown): ResolvedPlan {
  const plan = getPlan(planId)
  if (!plan) return { ok: false, error: 'Pick a plan.', status: 400 }
  if (!isPurchasablePlan(plan) || plan.pricePaise === null) {
    return {
      ok: false,
      error: `${plan.name} is priced per organisation. Get in touch and we will set it up.`,
      status: 400,
    }
  }
  return { ok: true, plan, amountPaise: plan.pricePaise }
}

export interface BillingConfig {
  keyId: string
  keySecret: string
}

/**
 * Read the keys, or null when billing is not configured.
 *
 * Returning null rather than throwing is deliberate: a developer running this
 * repo without payment keys should still be able to work on everything else.
 * The routes turn a null into an explicit "billing is not configured" response
 * rather than a 500 that looks like a bug.
 */
export function getBillingConfig(): BillingConfig | null {
  const keyId = process.env[KEY_ID_ENV]
  const keySecret = process.env[KEY_SECRET_ENV]
  if (!keyId || !keySecret) return null
  return { keyId, keySecret }
}

export function isBillingConfigured(): boolean {
  return getBillingConfig() !== null
}

/** True when the configured key is a test key. Surfaced in the UI so nobody
 * mistakes a sandbox payment for a real one. */
export function isTestMode(): boolean {
  return getBillingConfig()?.keyId.startsWith('rzp_test_') ?? false
}

export interface CreatedOrder {
  orderId: string
  amount: number
  currency: string
  /** Safe to send to the browser — the key id is public by design; the secret
   * is what must never leave this server. */
  keyId: string
}

/**
 * Open a Razorpay order for one organisation activation.
 *
 * `receipt` carries the user id so a payment can always be traced back to who
 * made it, including in Razorpay's own dashboard.
 */
export async function createActivationOrder(userId: string, planId: PlanId): Promise<CreatedOrder> {
  const config = getBillingConfig()
  if (!config) throw new Error('Billing is not configured.')

  const resolved = resolvePlan(planId)
  if (!resolved.ok) throw new Error(resolved.error)

  const client = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret })

  const order = await client.orders.create({
    amount: resolved.amountPaise,
    currency: ORG_ACTIVATION_CURRENCY,
    // Razorpay caps receipts at 40 characters.
    receipt: `org-${userId}`.slice(0, 40),
    notes: { purpose: 'organisation_activation', userId, planId },
  })

  return {
    orderId: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    keyId: config.keyId,
  }
}

/**
 * Verify a completed payment.
 *
 * Uses `crypto.timingSafeEqual` rather than `===`. String comparison short-
 * circuits on the first differing byte, so how long it takes leaks how much of
 * a guess was correct — enough, over many attempts, to reconstruct a valid
 * signature one byte at a time.
 */
export function verifyPaymentSignature(input: {
  orderId: string
  paymentId: string
  signature: string
}): boolean {
  const config = getBillingConfig()
  if (!config) return false
  if (!input.orderId || !input.paymentId || !input.signature) return false

  const expected = crypto
    .createHmac('sha256', config.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest('hex')

  const provided = input.signature
  // timingSafeEqual throws on a length mismatch, which is itself a signal —
  // so length is checked first and treated as a plain failure.
  if (expected.length !== provided.length) return false

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(provided, 'utf8'))
  } catch {
    return false
  }
}
