'use client'

import { useEffect, useState } from 'react'

import { authHeaders } from '@/lib/clientAuth'

/**
 * Whether the signed-in user is PROBE staff.
 *
 * Asks the admin API, which answers 404 to everyone else — so a non-admin
 * never learns that the endpoint exists, and this hook simply stays false.
 * Purely a UI hint: the API enforces the real check on every request, so a
 * forced `true` here reveals a link that leads to a 404.
 */
export function useIsPlatformAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.localStorage.getItem('auth_token')) return

    let cancelled = false
    fetch('/api/admin', { headers: authHeaders() })
      .then((response) => {
        if (!cancelled) setIsAdmin(response.ok)
      })
      .catch(() => {
        // Offline or a transient failure — stay hidden rather than guess.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return isAdmin
}
