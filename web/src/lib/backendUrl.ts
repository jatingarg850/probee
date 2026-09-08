/**
 * The Python backend's origin, for every route that proxies to it.
 *
 * `AGENT_BACKEND_URL` is what `web/.env` actually sets and what the README
 * documents. `NEXT_PUBLIC_BACKEND_URL` is accepted too — every proxy route
 * originally read only that name, so a deployment that copied `.env` from an
 * older revision, or that set the server-only name because a proxy route has
 * no business being `NEXT_PUBLIC_*` in the first place, still works. Without
 * this, every proxy route silently fell back to `localhost:8000` in
 * production while looking correctly configured.
 *
 * One function so the fallback and the two accepted names live in exactly
 * one place, rather than the same three-way `||` chain copied into a dozen
 * route files where it could drift.
 */
export function backendUrl(): string {
  return process.env.AGENT_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
}
