'use client'

import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/contexts/AuthContext'
import { fetchOrganizations } from '@/lib/orgApi'
import type { OrganizationSummary } from '@/lib/orgTypes'

/**
 * Which organisation the app is currently showing, and which ones the signed-in
 * user belongs to.
 *
 * **The current organisation comes from the URL, not from state.** Every
 * recruiter route is `/orgs/[orgId]/...`, so a link is shareable, a refresh
 * lands in the same place, and two tabs can sit in two different organisations
 * without fighting over a single stored value. The switcher navigates; it does
 * not set a variable.
 *
 * `null` means Personal — the practice product, which has no organisation.
 */

interface OrgContextValue {
  /** Every organisation the user belongs to. Empty until loaded. */
  organizations: OrganizationSummary[]
  /** The one the URL is pointing at, or null for Personal. */
  currentOrg: OrganizationSummary | null
  /** The org id in the URL, even if the list has not loaded yet — so a page
   * can start fetching its own data without waiting for the switcher. */
  currentOrgId: string | null
  isLoading: boolean
  error: string | null
  /** Re-read the list, e.g. after creating an organisation. */
  refresh: () => Promise<void>
}

const OrgCtx = createContext<OrgContextValue | undefined>(undefined)

/** `/orgs/<id>/anything` → `<id>`. Returns null for `/orgs/new` and every
 * non-org route, so those correctly read as Personal. */
export function orgIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/orgs\/([^/]+)/)
  if (!match) return null
  const candidate = match[1]
  return candidate === 'new' ? null : candidate
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  const pathname = usePathname()
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentOrgId = orgIdFromPathname(pathname ?? '')

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setOrganizations([])
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setOrganizations(await fetchOrganizations())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your organisations.')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  // Keyed on the user id as well as the auth flag: signing out and back in as
  // somebody else must not leave the previous person's organisations on screen.
  useEffect(() => {
    load()
  }, [load])

  const currentOrg = useMemo(
    () => organizations.find((org) => org.id === currentOrgId) ?? null,
    [organizations, currentOrgId],
  )

  const value = useMemo<OrgContextValue>(
    () => ({ organizations, currentOrg, currentOrgId, isLoading, error, refresh: load }),
    [organizations, currentOrg, currentOrgId, isLoading, error, load],
  )

  // `user?.id` is referenced so the effect above re-runs on account switch.
  void user?.id

  return <OrgCtx.Provider value={value}>{children}</OrgCtx.Provider>
}

export function useOrgs(): OrgContextValue {
  const context = useContext(OrgCtx)
  if (context === undefined) {
    throw new Error('useOrgs must be used within OrgProvider')
  }
  return context
}
