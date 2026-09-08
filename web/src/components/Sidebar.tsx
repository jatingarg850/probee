'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { OrgSwitcher } from '@/components/OrgSwitcher'
import { Button } from '@/components/ui/button'
import {
  Briefcase,
  ClipboardText,
  FileSearch,
  Gear,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plus,
  Radio,
  Sliders,
  Users,
  X,
} from '@/components/ui/icons'
import { useAuth } from '@/contexts/AuthContext'
import { useOrgs } from '@/contexts/OrgContext'
import { useIsPlatformAdmin } from '@/lib/usePlatformAdmin'

/** Grouped rather than one flat list — "your history" and "what's next"
 * are different jobs, and eight undifferentiated rows read as a dump. */
const PERSONAL_GROUPS = [
  {
    label: 'Overview',
    links: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard, hint: 'Your progress at a glance' }],
  },
  {
    label: 'Your practice',
    links: [
      { href: '/interviews', label: 'Interviews', icon: MessageSquare, hint: 'Scores and feedback' },
      { href: '/sessions', label: 'Transcripts', icon: Radio, hint: 'Every word, saved' },
      { href: '/questions', label: 'Question bank', icon: HelpCircle, hint: "Everything you've been asked" },
    ],
  },
  {
    label: 'Get hired',
    links: [
      { href: '/resume', label: 'Resume analysis', icon: FileSearch, hint: 'Where you actually fit' },
      { href: '/opportunities', label: 'Opportunities', icon: Briefcase, hint: 'Live roles, ranked for you' },
    ],
  },
] as const

/** The recruiter side. Same shape as above so both render through one
 * component and cannot drift apart visually. */
function orgGroups(orgId: string) {
  return [
    {
      label: 'Hiring',
      links: [
        { href: `/orgs/${orgId}/jobs`, label: 'Jobs', icon: ClipboardText, hint: 'Roles you are hiring for' },
        { href: `/orgs/${orgId}/candidates`, label: 'Candidates', icon: Users, hint: 'Everyone who has interviewed' },
      ],
    },
    {
      label: 'Organisation',
      links: [
        { href: `/orgs/${orgId}/team`, label: 'Team', icon: Users, hint: 'Who has access' },
        { href: `/orgs/${orgId}/settings`, label: 'Settings', icon: Gear, hint: 'Name, retention, plan' },
      ],
    },
  ] as const
}

interface SidebarProps {
  /** Only meaningful below the lg breakpoint — on lg+ the sidebar is
   * always visible as a static column regardless of this. */
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { currentOrgId } = useOrgs()
  const isPlatformAdmin = useIsPlatformAdmin()

  // The nav follows the URL, not a stored preference — so a shared link to a
  // job opens with the hiring nav already in place.
  const groups = currentOrgId ? orgGroups(currentOrgId) : PERSONAL_GROUPS
  const primaryAction = currentOrgId
    ? { href: `/orgs/${currentOrgId}/jobs/new`, label: 'New job' }
    : { href: '/interview', label: 'Start an interview' }

  return (
    <>
      {/* Backdrop — mobile/tablet only, closes the drawer on tap. */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onMobileClose}
        className={`fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm transition-opacity lg:hidden ${
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-72 shrink-0 flex-col border-r border-border bg-background px-3 py-4 transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-[16.5rem] lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-2" onClick={onMobileClose}>
            <img src="/Logo%20Svg/main%20text.svg" alt="PROBE" className="h-7 w-auto" />
          </Link>
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Close menu"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          <OrgSwitcher onNavigate={onMobileClose} />
        </div>

        <Button asChild className="group mt-3 h-10 w-full">
          <Link href={primaryAction.href} onClick={onMobileClose}>
            <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
            {primaryAction.label}
          </Link>
        </Button>

        <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                {group.label}
              </span>
              {group.links.map(({ href, label, icon: Icon, hint }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onMobileClose}
                    title={hint}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary/12 text-accent'
                        : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                    }`}
                  >
                    {/* Active marker rail — reads as "you are here" faster
                        than the tint alone at a glance. */}
                    <span
                      aria-hidden
                      className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-opacity ${
                        active ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Staff only. Absent entirely for everyone else — the API returns
            404 to a non-admin, so there is nothing here to discover. */}
        {isPlatformAdmin ? (
          <Link
            href="/admin"
            onClick={onMobileClose}
            className={`mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              pathname.startsWith('/admin')
                ? 'bg-primary/12 text-accent'
                : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            }`}
          >
            <Sliders className="h-4 w-4 shrink-0" />
            Platform admin
          </Link>
        ) : null}

        <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3">
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-ink-foreground">
              {(user?.name ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-semibold text-foreground">{user?.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">{user?.email}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
