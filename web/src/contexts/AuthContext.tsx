'use client'

import { getSession, signOut as nextAuthSignOut } from 'next-auth/react'
import type React from 'react'
import { createContext, useContext, useEffect, useState } from 'react'

export interface User {
  id: string
  email: string
  name: string
  createdAt?: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  /** True only while the initial session restore (reading + verifying any
   * stored token) is in flight. AppShell gates the whole app on this — see
   * the note on `isLoading` below for why it must NOT also cover
   * login/register. */
  isInitializing: boolean
  /** True while a login or register call is in flight. Scoped to the
   * LoginForm's own submit-button spinner; deliberately NOT read by AppShell. */
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/** The server doesn't always get to return clean JSON — a proxy/gateway
 * error, a crashed route, or the API being briefly unreachable can all
 * hand back HTML or nothing at all. Calling response.json() unguarded on
 * that surfaced a raw parse error ("Unexpected token < in JSON...") to the
 * user instead of the actual problem. */
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json()
    return typeof data?.error === 'string' ? data.error : fallback
  } catch {
    return fallback
  }
}

/** fetch() itself rejects (not a non-2xx response, an actual network
 * failure — offline, DNS, the server unreachable) with a bare
 * "Failed to fetch"/"NetworkError" TypeError. Surfacing that literally
 * reads like a broken app rather than a connectivity problem. */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  // Initialize from localStorage on mount, but never trust it on its own —
  // a token/user pair sitting in localStorage could be stale (the account
  // was deleted), expired, or hand-edited in devtools, and previously this
  // just set state directly from it, which meant `isAuthenticated` (below)
  // could go true for a token nobody on the server ever issued or still
  // honors. GET /api/auth/profile re-derives the user from the token
  // server-side; only a response it accepts results in a logged-in state.
  //
  // This used to share a single `isLoading` flag with login()/register(),
  // which AppShell reads to decide whether to render the page at all. That
  // meant submitting the login form (which also set `isLoading`) made
  // AppShell tear the whole page down to a spinner and remount it once the
  // request settled — wiping LoginForm's own local `error` state and typed
  // fields right after a failed login, so no error ever appeared. Session
  // restore and login/register are now tracked separately.
  useEffect(() => {
    let cancelled = false

    const restoreSession = async () => {
      const storedToken = localStorage.getItem('auth_token')
      if (storedToken) {
        try {
          const response = await fetch('/api/auth/profile', {
            headers: { Authorization: `Bearer ${storedToken}` },
          })
          if (!response.ok) throw new Error('Session expired')
          const data = await response.json()
          if (cancelled) return
          setToken(storedToken)
          setUser(data.user)
          localStorage.setItem('auth_user', JSON.stringify(data.user))
          setIsInitializing(false)
          return
        } catch {
          if (cancelled) return
          localStorage.removeItem('auth_token')
          localStorage.removeItem('auth_user')
        }
      }

      // No (valid) custom token — but the visitor may have just come back
      // from a Google sign-in. That flow runs entirely through NextAuth's
      // own cookie session (via signIn('google', ...) in LoginForm) and
      // never touches this app's localStorage-based session, which is what
      // AppShell/isAuthenticated actually gate on — so a successful Google
      // login landed back on "/" with a valid NextAuth session but this
      // context still reporting signed-out, and the dashboard never showed.
      // Bridge it: if NextAuth has a session, exchange it for the same kind
      // of token /api/auth/login issues and store it the same way.
      try {
        const nextAuthSession = await getSession()
        if (!nextAuthSession?.user?.email) {
          setIsInitializing(false)
          return
        }

        const response = await fetch('/api/auth/oauth-token', { method: 'POST' })
        if (!response.ok) throw new Error('No bridgeable session')
        const data = await response.json()
        if (cancelled) return
        setToken(data.token)
        setUser(data.user)
        localStorage.setItem('auth_token', data.token)
        localStorage.setItem('auth_user', JSON.stringify(data.user))
      } catch {
        // Not signed in via Google either — just a normal signed-out visitor.
      } finally {
        if (!cancelled) setIsInitializing(false)
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    try {
      let response: Response
      try {
        response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        })
      } catch (err) {
        throw new Error(
          isNetworkError(err)
            ? "Can't reach the server. Check your connection and try again."
            : 'Something went wrong. Please try again.',
        )
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const errorMsg = typeof data?.error === 'string' ? data.error : 'Invalid email or password.'
        // The server's `message` (when present) is the more specific,
        // user-facing copy (e.g. "The password you entered is incorrect...");
        // `error` is the shorter fallback.
        throw new Error(typeof data?.message === 'string' ? data.message : errorMsg)
      }

      const data = await response.json()
      setToken(data.token)
      setUser(data.user)

      // Store in localStorage
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('auth_user', JSON.stringify(data.user))
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (email: string, password: string, name: string) => {
    setIsLoading(true)
    try {
      let response: Response
      try {
        response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password, name }),
        })
      } catch (err) {
        throw new Error(
          isNetworkError(err)
            ? "Can't reach the server. Check your connection and try again."
            : 'Something went wrong. Please try again.',
        )
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Could not create your account.'))
      }

      // Auto-login after registration
      await login(email, password)
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    // If the custom token was bridged from a Google sign-in, its NextAuth
    // cookie session is still valid — without clearing it too, the very
    // next page load would silently bridge a fresh token and log the user
    // right back in.
    nextAuthSignOut({ redirect: false }).catch(() => {})
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isInitializing,
        isLoading,
        login,
        register,
        logout,
        isAuthenticated: !!user && !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
