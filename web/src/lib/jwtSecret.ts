/** Every route that signs or verifies a JWT must go through this instead of
 * inlining `process.env.JWT_SECRET || 'some-default'` — a missing env var
 * used to silently fall back to a hardcoded secret that's visible in this
 * repo's source, meaning anyone could forge a valid auth token for any
 * account on a deployment that forgot to set JWT_SECRET. Throwing instead
 * turns that misconfiguration into an immediate, loud failure instead of a
 * silent security hole. */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is not set. Auth routes refuse to run without it — set a long random value in the server environment (do not commit it).',
    )
  }
  return secret
}
