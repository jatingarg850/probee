import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'
import { listOrganizationsForUser } from '@/lib/orgs'

/**
 * Organisations the caller belongs to, and creating a new one.
 *
 * Creation lives in the billing routes — see the POST handler below. This file
 * only lists what the caller already belongs to.
 *
 * The owner is always the verified token holder. No route in this file reads
 * a user id from the body or the query string; see web/src/lib/apiAuth.ts for
 * why that rule exists.
 */

export async function GET(request: Request) {
  try {
    const userId = getAuthedUserId(request)
    if (!userId) return unauthorized()

    const organizations = await listOrganizationsForUser(userId)
    return Response.json({ organizations }, { status: 200 })
  } catch (error) {
    console.error('GET /api/orgs error:', error)
    return Response.json({ error: 'Failed to load organisations' }, { status: 500 })
  }
}

/**
 * Deliberately gone: organisations are created by `POST /api/billing/verify`,
 * after a payment signature has been checked server-side.
 *
 * Leaving an unauthenticated-by-payment create route here would be a complete
 * bypass of the paywall — anyone who could read the network tab would find it.
 * A route that answers 405 with a pointer is better than a route that quietly
 * does not exist, because it tells the next developer where creation moved to
 * rather than leaving them to wonder if it was an oversight.
 */
export function POST() {
  return Response.json(
    {
      error: 'Organisations are created through checkout.',
      hint: 'POST /api/billing/order to start a payment, then POST /api/billing/verify to complete it.',
    },
    { status: 405, headers: { Allow: 'GET' } },
  )
}
