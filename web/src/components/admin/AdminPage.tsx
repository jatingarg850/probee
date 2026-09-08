'use client'

import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { AlertCircle, Buildings, ClipboardText, MessageSquare, Users } from '@/components/ui/icons'
import { EmptyState, PageContainer, PageHeader, StatCard } from '@/components/ui/page'
import { authHeaders } from '@/lib/clientAuth'
import type { CostByRateCard, PlatformOrgRow, PlatformSummary } from '@/lib/platformAdmin'

interface AdminData {
  summary: PlatformSummary
  organizations: PlatformOrgRow[]
  costs: CostByRateCard[]
}

function usd(value: number, digits = 2): string {
  return `$${value.toFixed(digits)}`
}

function inr(paise: number): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(paise / 100)
  } catch {
    return `₹${paise / 100}`
  }
}

function formatDate(value: string | Date): string {
  try {
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

/**
 * Platform administration.
 *
 * Reached at /admin. A non-admin gets a 404 from the API and the "not
 * available" state below — the page never confirms that an admin surface
 * exists here.
 */
export function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/admin', { headers: authHeaders() })
        if (response.status === 404) {
          if (!cancelled) setDenied(true)
          return
        }
        if (!response.ok) throw new Error('Could not load platform data.')
        const json = await response.json()
        if (!cancelled) setData(json)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load platform data.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (isLoading) {
    return (
      <PageContainer width="wide">
        <p className="py-16 text-sm text-muted-foreground">Loading…</p>
      </PageContainer>
    )
  }

  if (denied) {
    return (
      <PageContainer width="wide">
        <EmptyState
          icon={AlertCircle}
          title="Not available"
          description="This page isn't available for your account."
        />
      </PageContainer>
    )
  }

  if (error || !data) {
    return (
      <PageContainer width="wide">
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error ?? 'Could not load platform data.'}
        </p>
      </PageContainer>
    )
  }

  const { summary, organizations, costs } = data
  const hiringInterviews = summary.interviews - summary.practiceInterviews

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Platform"
        title="Admin"
        description="Every organisation on PROBE, with usage and unit cost. Aggregates only — no candidate data."
      />

      <div className="grid animate-fade-up grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Buildings}
          label="Organisations"
          value={String(summary.organizations)}
          hint={`${summary.paidOrganizations} paid`}
        />
        <StatCard icon={Users} label="Users" value={String(summary.users)} hint="Across both products" />
        <StatCard
          icon={MessageSquare}
          label="Interviews"
          value={String(summary.interviews)}
          hint={`${hiringInterviews} hiring · ${summary.practiceInterviews} practice`}
        />
        <StatCard
          icon={ClipboardText}
          label="Revenue"
          value={inr(summary.revenuePaise)}
          hint={`Model cost ${usd(summary.totalCostUsd)}`}
        />
      </div>

      {/* The S1 answer, front and centre — this is the number that decides
          whether the three-voice panel is the default or the upsell. */}
      <Card className="overflow-hidden">
        <CardHeader title="Cost per interview" />
        {costs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No interviews have been costed yet. Figures appear here once interviews run with cost instrumentation.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Rate card</th>
                  <th className="px-4 py-2.5 font-semibold">Interviews</th>
                  <th className="px-4 py-2.5 font-semibold">Median cost</th>
                  <th className="px-4 py-2.5 font-semibold">Median length</th>
                  <th className="px-4 py-2.5 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {costs.map((row) => (
                  <tr key={row.rateCardVersion}>
                    <td className="px-4 py-3 font-mono text-[13px]">{row.rateCardVersion}</td>
                    <td className="px-4 py-3 tabular-nums">{row.interviews}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-foreground">{usd(row.medianUsd, 3)}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {row.medianDurationMinutes.toFixed(1)} min
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{usd(row.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Median, not mean — one interview that ran long or ended in ten seconds moves an average enough to make it
          useless for pricing. Figures are estimates against a dated rate card, not a bill.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Organisations" />
        {organizations.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No organisations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Organisation</th>
                  <th className="px-4 py-2.5 font-semibold">Plan</th>
                  <th className="px-4 py-2.5 font-semibold">Members</th>
                  <th className="px-4 py-2.5 font-semibold">Jobs</th>
                  <th className="px-4 py-2.5 font-semibold">Interviews</th>
                  <th className="px-4 py-2.5 font-semibold">Cost</th>
                  <th className="px-4 py-2.5 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td className="px-4 py-3">
                      <span className="block font-medium text-foreground">{org.name}</span>
                      <code className="text-[11.5px] text-muted-foreground">{org.slug}</code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge>{org.plan}</Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{org.memberCount}</td>
                    <td className="px-4 py-3 tabular-nums">{org.jobCount}</td>
                    <td className="px-4 py-3 tabular-nums">{org.interviewCount}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{usd(org.totalCostUsd)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(org.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  )
}
