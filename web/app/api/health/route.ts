/**
 * Liveness probe for a hosting platform, load balancer, or uptime check.
 *
 * Deliberately does not touch MongoDB or the Python backend — this answers
 * "is the Next.js process itself up and serving requests", which is the
 * question a restart-on-failure policy should be asking. A check that also
 * pings the database would restart a perfectly healthy web process during a
 * transient DB blip, which is the wrong reaction to that failure.
 */
export async function GET() {
  return Response.json({ status: 'ok' })
}
