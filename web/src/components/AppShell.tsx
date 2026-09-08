'use client'

import { Menu } from '@/components/ui/icons'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Sidebar } from '@/components/Sidebar'
import { useAuth } from '@/contexts/AuthContext'

// Routes an authenticated visitor gets redirected away from (there's
// nothing for them to do there once signed in).
const AUTH_ONLY_ROUTES = new Set(['/login'])
// Routes reachable regardless of auth state — content adapts instead of
// forcing a redirect either way. "/" renders a public landing page when
// signed out and the real dashboard (behind the sidebar) when signed in;
// every actual feature route (e.g. /interview) is NOT in this set, so
// clicking through to one is what actually prompts sign-in.
const OPEN_ROUTES = new Set(['/', '/pricing'])

/**
 * Routes that render bare — no sidebar, no mobile header — whether or not the
 * visitor is signed in.
 *
 * A prefix list rather than exact paths, because an invitation URL carries a
 * token in its path and cannot be enumerated. Both of these are pages a person
 * can arrive at from outside the product: a pricing page reached from search,
 * and an invitation link reached from an email. Wrapping either in the
 * signed-in chrome would be wrong for the visitor who has no account, and
 * redirecting them to sign in first is how invitations get abandoned.
 */
const STANDALONE_PREFIXES = ['/invite/', '/pricing', '/interview/']

/**
 * Shown while the initial session check runs, before AppShell knows whether
 * to render the signed-in chrome or bounce to /login. Shaped like the
 * signed-in shell it will most often resolve into — sidebar rail plus a
 * header and card placeholders — so the swap to real content doesn't jump.
 * No spinner: a skeleton of "what's coming" reads as faster and more
 * informative than a circle spinning over a blank page.
 */
function FullPageSpinner() {
  return (
    <div className="flex min-h-0 flex-1 bg-background">
      <div className="hidden shrink-0 flex-col gap-6 border-r border-border px-3 py-4 lg:flex lg:w-[16.5rem]">
        <div className="skeleton h-7 w-28 rounded-md" />
        <div className="skeleton h-10 w-full rounded-lg" />
        <div className="flex flex-col gap-2">
          {['a', 'b', 'c'].map((key) => (
            <div key={key} className="skeleton h-8 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-2 border-b border-border pb-5">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-7 w-64 rounded" />
        </div>
        <div className="flex flex-col gap-3">
          {['a', 'b', 'c'].map((key) => (
            <div key={key} className="skeleton h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Validate a `?next=` destination before redirecting to it.
 *
 * Only same-origin absolute paths are allowed. A value starting with `//` (or
 * `/\`) is a protocol-relative URL that browsers resolve to a *different
 * host* — accepting one would turn this redirect into an open redirect, which
 * is a phishing primitive: an attacker sends `/login?next=//evil.example` and
 * the victim lands on a lookalike having genuinely just signed in here.
 */
function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/')) return null
  // A backslash after the leading slash is normalised to `//` by some
  // browsers, so it reaches a different host the same way.
  if (next.startsWith('//') || next.charAt(1) === '\\') return null
  return next
}

/** Single gate for the whole app. Three route kinds:
 *  - auth-only (/login): redirect an authenticated visitor away from it.
 *  - open (/): never redirected either direction; the page itself renders
 *    differently for signed-in vs signed-out.
 *  - everything else: redirect a signed-out visitor to /login.
 * Centralizing this here means individual pages don't each need their own
 * auth-guard boilerplate. */
export function AppShell({ children }: { children: React.ReactNode }) {
  // Deliberately NOT `isLoading` — that flag also covers an in-flight
  // login/register call, and gating the whole app's render on it meant
  // submitting the login form tore this entire tree down to a spinner and
  // remounted it on completion, wiping LoginForm's own local error/field
  // state right after a failed attempt. `isInitializing` covers only the
  // one-time startup session check.
  const { isAuthenticated, isInitializing } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const isAuthOnlyRoute = AUTH_ONLY_ROUTES.has(pathname)
  const isStandalone = STANDALONE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  const isOpenRoute = OPEN_ROUTES.has(pathname) || isStandalone
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    // Skip if still initializing
    if (isInitializing) return

    // This used to skip the redirect entirely on the first run, guarded by a
    // `__app_shell_redirected` flag in sessionStorage, to avoid a hydration
    // mismatch. But nothing re-ran the effect afterwards — its dependencies
    // had not changed — so a signed-out visitor who opened any gated route
    // *directly* (a bookmarked /interview, a shared /orgs/... link, a hard
    // refresh) set the flag, returned, and sat on the loading spinner forever
    // instead of being sent to sign in.
    //
    // The guard was also unnecessary: this is an effect, so it only ever runs
    // on the client after mount, and `isInitializing` already holds the render
    // back until the session has been checked. There is no server render to
    // mismatch against.
    if (isAuthenticated && isAuthOnlyRoute) {
      // Read from `window` rather than `useSearchParams()`: that hook forces
      // every statically-prerendered page under this shell to bail out of
      // prerendering unless it sits inside a Suspense boundary, and this value
      // is only ever needed here, inside an effect that already runs
      // client-side.
      const next = new URLSearchParams(window.location.search).get('next')
      router.replace(safeNextPath(next) ?? '/')
    } else if (!isAuthenticated && !isAuthOnlyRoute && !isOpenRoute) {
      // `pathname` is preserved so sign-in can send them back where they were
      // trying to go rather than dumping everyone on the dashboard.
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : ''
      router.replace(`/login${next}`)
    }
  }, [isAuthenticated, isInitializing, isAuthOnlyRoute, isOpenRoute, pathname, router])

  // Close the drawer on every navigation instead of leaving it open behind
  // the new page — Sidebar's own links already call onMobileClose, but this
  // also covers back/forward navigation and any other route change.
  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  if (isInitializing) {
    return <FullPageSpinner />
  }

  if (isAuthOnlyRoute) {
    if (isAuthenticated) return <FullPageSpinner />
    return <main className="flex min-h-0 flex-1 flex-col bg-background">{children}</main>
  }

  if (isStandalone || (isOpenRoute && !isAuthenticated)) {
    return <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">{children}</main>
  }

  if (!isAuthenticated) {
    return <FullPageSpinner />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background lg:flex-row">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-1.5 text-foreground transition-colors hover:bg-foreground/5"
        >
          <Menu className="h-5 w-5" />
        </button>
        <img src="/Logo%20Svg/main%20text.svg" alt="PROBE" className="h-6 w-auto" />
      </header>

      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">{children}</main>
    </div>
  )
}
