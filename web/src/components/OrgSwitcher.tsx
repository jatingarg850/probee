'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Buildings, CaretRight, Check, Plus, User } from '@/components/ui/icons'
import { useOrgs } from '@/contexts/OrgContext'

/**
 * Switches between Personal (the practice product) and each organisation the
 * user belongs to.
 *
 * Navigates rather than setting state — the current organisation lives in the
 * URL, so switching is a route change and the browser's back button does the
 * obvious thing. See OrgContext for why.
 */
export function OrgSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { organizations, currentOrg, isLoading } = useOrgs()
  const router = useRouter()

  const go = (href: string) => {
    onNavigate?.()
    router.push(href)
  }

  const label = currentOrg ? currentOrg.name : 'Personal'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/25 hover:bg-foreground/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={`Current workspace: ${label}. Switch workspace`}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
              currentOrg ? 'bg-primary/15 text-accent' : 'bg-foreground/[0.07] text-muted-foreground'
            }`}
          >
            {currentOrg ? <Buildings className="h-4 w-4" /> : <User className="h-4 w-4" />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13.5px] font-medium text-foreground">{label}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {currentOrg ? capitalise(currentOrg.role) : 'Your own practice'}
            </span>
          </span>
          <CaretRight className="ml-auto h-3.5 w-3.5 shrink-0 rotate-90 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[15.5rem]">
        <DropdownMenuLabel>Practice</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => go('/')} className="gap-2.5">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1">Personal</span>
          {!currentOrg ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
        </DropdownMenuItem>

        {organizations.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Hiring</DropdownMenuLabel>
            {organizations.map((org) => (
              <DropdownMenuItem key={org.id} onSelect={() => go(`/orgs/${org.id}/jobs`)} className="gap-2.5">
                <Buildings className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{org.name}</span>
                {currentOrg?.id === org.id ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/orgs/new" onClick={onNavigate} className="flex items-center gap-2.5">
            <Plus className="h-4 w-4 text-muted-foreground" />
            {/* Wording changes with the situation: the first one is a bigger
             * decision than the fifth, and "Create an organisation" reads as
             * setup rather than as one more item in a list. */}
            {organizations.length === 0 ? 'Create an organisation' : 'New organisation'}
          </Link>
        </DropdownMenuItem>

        {isLoading ? <DropdownMenuLabel>Loading…</DropdownMenuLabel> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function capitalise(role: string): string {
  return role.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
