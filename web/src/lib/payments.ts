import { type Db, ObjectId } from 'mongodb'

import { connectToDatabase } from '@/lib/mongoDb'
import { DEFAULT_PLAN_ID, type PlanId, isPlanId } from '@/lib/plans'

/**
 * Payment records for organisation activation.
 *
 * Every successful payment is written here *before* the organisation is
 * created, and the record is what links the two. Two properties matter:
 *
 * 1. **A payment can only be spent once.** `razorpayPaymentId` is uniquely
 *    indexed, so replaying a verify request with a signature that already
 *    created an organisation fails at the database rather than quietly
 *    minting a second one for free.
 * 2. **The payer is the token holder.** `userId` comes from the verified
 *    bearer token, never from the request body, so a leaked payment id cannot
 *    be redeemed by somebody else.
 * 3. **The plan is whatever was paid for.** `planId` is written when the order
 *    is opened, from the price this server charged, and read back at verify
 *    time. The verify request never gets to say which plan it bought — that
 *    would be a ₹4,999 payment redeemable for a ₹19,999 plan.
 */

export type PaymentStatus = 'created' | 'paid' | 'consumed'

export interface PaymentRecord {
  _id: ObjectId
  userId: ObjectId
  razorpayOrderId: string
  razorpayPaymentId: string | null
  amount: number
  currency: string
  /** The tier this payment buys. Written at order time, never at verify time. */
  planId: PlanId
  status: PaymentStatus
  /** Set once the payment has been exchanged for an organisation. */
  organizationId: ObjectId | null
  createdAt: Date
  paidAt: Date | null
}

let indexesReady: Promise<void> | null = null

export async function ensurePaymentIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = Promise.all([
      db.collection('payments').createIndex({ razorpayOrderId: 1 }, { unique: true, name: 'payment_order_unique' }),
      // Sparse: an order exists before a payment id does, and unique indexes
      // in MongoDB treat multiple nulls as a collision without this.
      // partialFilterExpression: only index actual payment IDs (strings), not nulls
      db.collection('payments').createIndex(
        { razorpayPaymentId: 1 },
        {
          unique: true,
          name: 'payment_id_unique',
          partialFilterExpression: { razorpayPaymentId: { $type: 'string' } },
        },
      ),
      db.collection('payments').createIndex({ userId: 1, createdAt: -1 }, { name: 'payment_user_created' }),
    ])
      .then(() => undefined)
      .catch((error) => {
        indexesReady = null
        throw error
      })
  }
  return indexesReady
}

export function resetPaymentIndexCacheForTests(): void {
  indexesReady = null
}

export async function recordOrderCreated(input: {
  userId: string
  razorpayOrderId: string
  amount: number
  currency: string
  planId: PlanId
}): Promise<void> {
  const { db } = await connectToDatabase()
  await ensurePaymentIndexes(db)
  await db.collection('payments').insertOne({
    userId: new ObjectId(input.userId),
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: null,
    amount: input.amount,
    currency: input.currency,
    planId: input.planId,
    status: 'created' satisfies PaymentStatus,
    organizationId: null,
    createdAt: new Date(),
    paidAt: null,
  })
}

/**
 * Mark a verified payment as paid, and claim it atomically.
 *
 * The filter includes `status: 'created'`, so two concurrent verify requests
 * for the same order cannot both succeed — the second matches nothing. This is
 * the double-spend guard, and it is one round trip rather than a read followed
 * by a write, which would have a race between them.
 */
export async function claimPayment(input: {
  userId: string
  razorpayOrderId: string
  razorpayPaymentId: string
}): Promise<
  | { ok: true; paymentId: ObjectId; planId: PlanId; amount: number; currency: string }
  | { ok: false; reason: 'not_found' | 'already_used' }
> {
  const { db } = await connectToDatabase()
  await ensurePaymentIndexes(db)

  const result = await db.collection('payments').findOneAndUpdate(
    {
      razorpayOrderId: input.razorpayOrderId,
      userId: new ObjectId(input.userId),
      status: 'created',
    },
    {
      $set: {
        status: 'paid' satisfies PaymentStatus,
        razorpayPaymentId: input.razorpayPaymentId,
        paidAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  )

  if (result) {
    return {
      ok: true,
      paymentId: result._id as ObjectId,
      // Defaulted rather than trusted blindly: payments taken before plans
      // existed carry no planId, and they all bought what is now Starter.
      planId: isPlanId(result.planId) ? result.planId : DEFAULT_PLAN_ID,
      amount: result.amount as number,
      currency: result.currency as string,
    }
  }

  // Nothing matched. Distinguish "no such order for this user" from "this
  // order was already redeemed", because they mean very different things to
  // whoever is looking at the logs.
  const existing = await db.collection('payments').findOne({ razorpayOrderId: input.razorpayOrderId })
  return { ok: false, reason: existing ? 'already_used' : 'not_found' }
}

/** Link a claimed payment to the organisation it bought. */
export async function attachOrganizationToPayment(paymentId: ObjectId, organizationId: string): Promise<void> {
  const { db } = await connectToDatabase()
  await db
    .collection('payments')
    .updateOne(
      { _id: paymentId },
      { $set: { organizationId: new ObjectId(organizationId), status: 'consumed' satisfies PaymentStatus } },
    )
}

/** Release a claim when organisation creation fails after payment.
 *
 * Without this, a payment taken for an organisation that then failed to create
 * would be stuck as `paid` forever — the customer has been charged and has
 * nothing, and cannot retry. Returning it to `created` lets them try again on
 * the same payment. */
export async function releasePaymentClaim(paymentId: ObjectId): Promise<void> {
  const { db } = await connectToDatabase()
  await db.collection('payments').updateOne({ _id: paymentId }, { $set: { status: 'created' satisfies PaymentStatus } })
}
