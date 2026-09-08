'use client'

import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AuthShowcase } from '@/components/auth/AuthShowcase'
import { Button } from '@/components/ui/button'
import { AlertCircle } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import { useAuth } from '@/contexts/AuthContext'

const fieldClass =
  'w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10'

function GoogleMark() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

export function LoginForm() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [next, setNext] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const { login, register } = useAuth()

  // Read from `window` rather than `useSearchParams()`, which would force this
  // page out of static prerendering. `mode=register` lets an invitation email
  // send somebody who has never used PROBE straight to the sign-up form
  // instead of a sign-in form they will fail at; `next` is validated and acted
  // on by AppShell once authentication succeeds.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mode') === 'register') setIsSignUp(true)
    setNext(params.get('next'))
  }, [])

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)
    setError(null)
    try {
      // Preserved across the OAuth round trip, which leaves and re-enters the
      // app and so loses any state not encoded in the URL.
      await signIn('google', { callbackUrl: next?.startsWith('/') && !next.startsWith('//') ? next : '/' })
    } catch {
      setError('Google sign-in failed. Please try again.')
      setIsGoogleLoading(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (!password) {
      setError('Please enter your password.')
      return
    }
    if (isSignUp && !name.trim()) {
      setError('Please enter your name.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }

    setIsLoading(true)
    try {
      if (isSignUp) {
        await register(email, password, name.trim())
      } else {
        await login(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const busy = isLoading || isGoogleLoading

  return (
    // Split screen: the form owns the left half at a comfortable reading
    // width, the product does the talking on the right. The showcase is
    // dropped entirely below lg rather than stacked — on a phone it would
    // just push the actual sign-in below the fold.
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex flex-1 flex-col overflow-y-auto px-6 py-10 sm:px-10 lg:w-1/2 lg:flex-none lg:px-14">
        <Link href="/" className="shrink-0 self-start" aria-label="PROBE home">
          <img src="/Logo%20Svg/main%20text.svg" alt="PROBE" className="h-7 w-auto" />
        </Link>

        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-[24rem] flex-1 flex-col justify-center py-10"
        >
          <h1 className="text-[1.85rem] font-bold leading-tight tracking-tight text-foreground">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted-foreground">
            {isSignUp
              ? 'Save every interview, and watch the scores move.'
              : 'Pick up where you left off — your transcripts and scores are waiting.'}
          </p>

          {/* Google first: it is the fastest way in, and burying it under
           * the password fields made the slow path look like the only one. */}
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy}
            variant="outline"
            className="mt-8 h-12 w-full rounded-xl text-[14.5px]"
          >
            {isGoogleLoading ? (
              <>
                <LoadingDots />
                Connecting to Google…
              </>
            ) : (
              <>
                <GoogleMark />
                Continue with Google
              </>
            )}
          </Button>

          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-4">
            {isSignUp ? (
              <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Full name
                <input
                  className={fieldClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  disabled={isLoading}
                  autoComplete="name"
                />
              </label>
            ) : null}

            <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Email
              <input
                type="email"
                className={fieldClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isLoading}
                required
                autoComplete="email"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Password
              <input
                type="password"
                className={fieldClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                required
                minLength={6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
              {isSignUp ? (
                <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                  At least 6 characters
                </span>
              ) : null}
            </label>
          </div>

          {error ? (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.07] px-3.5 py-3 text-left text-[13px] text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">{error}</p>
                {error.toLowerCase().includes('not found') ? (
                  <p className="mt-1.5 text-[12px] opacity-90">
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(true)
                        setError(null)
                      }}
                      className="font-semibold underline hover:no-underline"
                    >
                      Sign up
                    </button>
                  </p>
                ) : null}
                {error.toLowerCase().includes('incorrect') ? (
                  <p className="mt-1.5 text-[12px] opacity-90">
                    Check your password and try again — make sure caps lock is off.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <Button type="submit" disabled={busy} className="mt-6 h-12 w-full rounded-xl text-[14.5px]">
            {isLoading ? (
              <>
                <LoadingDots />
                {isSignUp ? 'Creating account…' : 'Signing in…'}
              </>
            ) : isSignUp ? (
              'Create account'
            ) : (
              'Sign in'
            )}
          </Button>

          <p className="mt-6 text-[13px] text-muted-foreground">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp((v) => !v)
                setError(null)
              }}
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </form>

        <p className="shrink-0 text-[12px] leading-relaxed text-muted-foreground">
          Practice interviews only — nothing here is a real hiring decision.
        </p>
      </div>

      <div className="hidden lg:block lg:w-1/2">
        <AuthShowcase />
      </div>
    </div>
  )
}
