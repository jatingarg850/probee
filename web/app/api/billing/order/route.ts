import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'
import {
  ORG_ACTIVATION_CURRENCY,
  createActivationOrder,
  isBillingConfigured,
  isTestMode,
  resolvePlan,
} from '@/lib/billing'
import { recordOrderCreated } from '@/lib/payments'
import { PLANS } from '@/lib/plans'

/**
 * Open a Razorpay order for one organisation.
 *
 * The request names a *plan*, never an amount. The price attached to that plan
 * is looked up server-side in `lib/plans.ts` — a client-supplied price is a
 * client-chosen price, and this is the one route where that would cost real
 * money.
 */
export async function POST(request: Request) {
  try {
    const userId = getAuthedUserId(request)
    if (!userId) return unauthorized()

    if (!isBillingConfigured()) {
      return Response.json(
        {
          error:
            'Payments are not configured on this deployment. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable organisation creation.',
          code: 'billing_not_configured',
        },
        { status: 503 },
      )
    }

    let body: { planId?: unknown }
    try {
      body = await request.json()
    } catch {
      // An empty body is not an error — it means the default plan.
      body = {}
    }

    const resolved = resolvePlan(body.planId ?? 'starter')
    if (!resolved.ok) return Response.json({ error: resolved.error }, { status: resolved.status })

    const order = await createActivationOrder(userId, resolved.plan.id)
    await recordOrderCreated({
      userId,
      razorpayOrderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      planId: resolved.plan.id,
    })

    return Response.json(
      { order: { ...order, testMode: isTestMode(), planId: resolved.plan.id, planName: resolved.plan.name } },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST /api/billing/order error:', error)
    return Response.json({ error: 'Could not start the payment.' }, { status: 500 })
  }
}

/**
 * What can be bought, and whether buying works right now.
 *
 * Unauthenticated: this is the same information the public pricing page shows,
 * and gating it would mean maintaining the price list in two places.
 */
export async function GET() {
  return Response.json({
    configured: isBillingConfigured(),
    testMode: isTestMode(),
    currency: ORG_ACTIVATION_CURRENCY,
    plans: PLANS,
  })
}
