/**
 * A minimal in-process rate limiter for unauthenticated or credential-testing
 * endpoints — login, registration, and public token lookups that would
 * otherwise have no cost to hammering them.
 *
 * In-memory rather than backed by Redis or similar: this app deploys as a
 * fixed number of long-running PM2 processes on one VPS (see
 * `docs/operations/DEPLOYMENT_GUIDE.md`), not as ephemeral serverless
 * functions across many instances, so a per-process counter actually holds
 * state for the process's lifetime and does what it looks like it does. If
 * this ever moves to a multi-instance/serverless deployment, this needs a
 * shared store (Redis, or Mongo) instead — a per-instance counter there would
 * silently allow `limit × instance count` requests through.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Opportunistic cleanup so a flood of distinct keys (many IPs) doesn't grow
// this map forever — swept every ~1000 calls rather than on a timer, so an
// idle process holds no background work.
let callsSinceSweep = 0

function sweepExpired(now: number): void {
  callsSinceSweep++
  if (callsSinceSweep < 1000) return
  callsSinceSweep = 0
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export interface RateLimitResult {
  ok: boolean
  /** Seconds until the caller can retry. 0 when `ok` is true. */
  retryAfterSeconds: number
}

/** `key` should already include the route/action — e.g. `login:203.0.113.4` —
 * since the bucket is otherwise shared across every caller of this function. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweepExpired(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSeconds: 0 }
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }

  bucket.count += 1
  return { ok: true, retryAfterSeconds: 0 }
}

/** Best-effort caller IP from the headers a reverse proxy (nginx, the
 * platform's own edge) sets. Not spoof-proof against a client hitting this
 * service directly with a forged header, but this app always sits behind a
 * proxy in every deployment path it documents, and "best-effort" is still a
 * large improvement over no rate limiting at all. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

/** A standard 429 body/response, so every call site returns the same shape. */
export function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    { error: 'Too many attempts. Please wait and try again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}
