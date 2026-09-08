import { ObjectId } from 'mongodb'

import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'
import { ORG_ACTIVATION_CURRENCY, isTestMode, verifyPaymentSignature } from '@/lib/billing'
import { sendEmailQuietly } from '@/lib/email'
import { organizationReceiptEmail } from '@/lib/emailTemplates'
import { connectToDatabase } from '@/lib/mongoDb'
import { createOrganization } from '@/lib/orgs'
import { attachOrganizationToPayment, claimPayment, releasePaymentClaim } from '@/lib/payments'

/**
 * Verify a payment and create the organisation it bought.
 *
 * This is the only route that creates an organisation. The order matters:
 *
 *   1. verify the signature   — is this payment real?
 *   2. claim the payment      — has it already been spent?
 *   3. create the org         — only now, on the plan the *claim* names
 *   4. attach it to the payment
 *   5. email the receipt      — after everything that can fail has succeeded
 *
 * If step 3 fails the claim is released, so the customer can retry with the
 * same payment rather than being charged for nothing. If step 5 fails, nothing
 * is rolled back: the organisation exists and is paid for, and a missing
 * receipt is not worth undoing that.
 */
export async function POST(request: Request) {
  try {
    const userId = getAuthedUserId(request)
    if (!userId) return unauthorized()

    let body: { razorpayOrderId?: string; razorpayPaymentId?: string; razorpaySignature?: string; name?: string }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const orderId = String(body.razorpayOrderId ?? '')
    const paymentId = String(body.razorpayPaymentId ?? '')
    const signature = String(body.razorpaySignature ?? '')

    // Everything above is a claim by the client. The signature is the only
    // thing that turns it into a fact.
    if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
      console.warn('Rejected payment verification', { userId, orderId })
      return Response.json({ error: 'That payment could not be verified.' }, { status: 400 })
    }

    const claim = await claimPayment({ userId, razorpayOrderId: orderId, razorpayPaymentId: paymentId })
    if (!claim.ok) {
      return Response.json(
        {
          error:
            claim.reason === 'already_used'
              ? 'That payment has already been used to create an organisation.'
              : 'No matching payment was found for your account.',
        },
        { status: 409 },
      )
    }

    // Note where the plan comes from: the payment record, written when the
    // order was opened at a price this server set. Not from `body`. A request
    // that could name its own plan would let a Starter payment buy Growth.
    const created = await createOrganization(body.name, userId, { planId: claim.planId, status: 'active' })
    if (!created.ok) {
      await releasePaymentClaim(claim.paymentId)
      return Response.json({ error: created.error }, { status: created.status })
    }

    await attachOrganizationToPayment(claim.paymentId, created.organization.id)

    await sendReceipt({
      userId,
      organizationName: created.organization.name,
      organizationId: created.organization.id,
      planId: claim.planId,
      amountPaise: claim.amount,
      currency: claim.currency || ORG_ACTIVATION_CURRENCY,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
    })

    return Response.json({ organization: created.organization }, { status: 201 })
  } catch (error) {
    console.error('POST /api/billing/verify error:', error)
    return Response.json({ error: 'Could not complete the purchase.' }, { status: 500 })
  }
}

/** Best effort, and deliberately unable to throw into the caller: the money has
 * been taken and the organisation exists by the time this runs. */
async function sendReceipt(input: {
  userId: string
  organizationName: string
  organizationId: string
  planId: string
  amountPaise: number
  currency: string
  razorpayOrderId: string
  razorpayPaymentId: string
}): Promise<void> {
  try {
    const { db } = await connectToDatabase()
    const user = await db
      .collection('users')
      .findOne({ _id: new ObjectId(input.userId) }, { projection: { email: 1, name: 1 } })

    if (!user?.email) {
      console.warn(`User ${input.userId} has no email address; skipping the receipt.`)
      return
    }

    const message = organizationReceiptEmail({
      organizationName: input.organizationName,
      organizationId: input.organizationId,
      userName: (user.name as string) ?? 'there',
      planId: input.planId,
      amountPaise: input.amountPaise,
      currency: input.currency,
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      purchaseDate: new Date(),
      // Stated on the receipt itself. A test-mode payment is not a tax
      // document, and a receipt that does not say so is misleading.
      testMode: isTestMode(),
    })

    await sendEmailQuietly({
      to: user.email as string,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
  } catch (error) {
    console.error('Could not send the purchase receipt:', error)
  }
}
