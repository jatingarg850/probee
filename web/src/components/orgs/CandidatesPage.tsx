'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, AlertTriangle, ClipboardText, Download, Users } from '@/components/ui/icons'
import { EmptyState, PageContainer, PageHeader, Skeleton } from '@/components/ui/page'
import { useOrgs } from '@/contexts/OrgContext'
import { authHeaders, readApiError } from '@/lib/clientAuth'
import { downloadCandidatesCsv } from '@/lib/exportCandidates'
import { scoreColor } from '@/lib/scoreColor'

/**
 * Every candidate who has interviewed for a job here (M2-1, minimum slice).
 *
 * The rest of M2 — filtering, comparison, recorded decisions — is out of
 * scope. This exists to close the loop M1 opened: a completed interview is
 * scored and written to `sessions`, and until this page read it back, that
 * score had nowhere to be seen. Server-side sort (newest first) rather than
 * a client-side sort, per the roadmap's own note that a client sort stops
 * scaling well past a couple hundred rows.
 */

interface CandidateRow {
  sessionId: string
  candidateEmail: string
  candidateName: string
  jobId: string | null
  jobTitle: string
  status: string
  overallScore: number | null
  strikes: number
  terminated: boolean
  startedAt: string | null
  endedAt: string | null
  durationSeconds: number | null
}

export function CandidatesPage({ orgId }: { orgId: string }) {
  const router = useRouter()
  const { currentOrg } = useOrgs()
  const [candidates, setCandidates] = useState<CandidateRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/orgs/${orgId}/candidates`, { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, 'Could not load candidates.'))
        return response.json()
      })
      .then((data) => {
        if (!cancelled) setCandidates(data.candidates ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load candidates.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow={currentOrg?.name ?? 'Hiring'}
        title="Candidates"
        description="Everyone who has interviewed for one of your jobs, with their scores and integrity flags."
        action={
          candidates.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadCandidatesCsv(candidates, `candidates-${new Date().toISOString().slice(0, 10)}.csv`)
              }
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          ) : null
        }
      />

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {['a', 'b', 'c'].map((key) => (
            <div key={key} className="flex flex-col gap-2 rounded-xl border border-border p-5">
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-3 w-80" />
            </div>
          ))}
        </div>
      ) : candidates.length === 0 && !error ? (
        <EmptyState
          icon={Users}
          title="No candidates yet"
          description="Once you invite someone to a job and they complete the interview, they appear here with their competency scores, the evidence behind them, and whether the session was flagged."
          action={
            <Link
              href={`/orgs/${orgId}/jobs`}
              className="inline-flex items-center gap-2 text-[13.5px] font-medium text-accent hover:underline"
            >
              <ClipboardText className="h-3.5 w-3.5" />
              Set up a job in the meantime
            </Link>
          }
        />
      ) : (
        <div className="animate-fade-up overflow-hidden rounded-xl border border-border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/60 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Candidate</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Interviewed</th>
                  <th className="px-4 py-3 font-semibold">Duration</th>
                  <th className="px-4 py-3 text-right font-semibold">Score</th>
                  <th className="px-4 py-3 font-semibold">Integrity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {candidates.map((row) => {
                  const href = `/orgs/${orgId}/candidates/${row.sessionId}`
                  return (
                    <tr
                      key={row.sessionId}
                      tabIndex={0}
                      aria-label={`Open ${row.candidateName}'s interview`}
                      className="cursor-pointer transition-colors hover:bg-surface/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                      onClick={() => router.push(href)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          router.push(href)
                        }
                      }}
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-foreground">{row.candidateName}</p>
                        <p className="text-[12.5px] text-muted-foreground">{row.candidateEmail}</p>
                      </td>
                      <td className="px-4 py-3.5 text-foreground">{row.jobTitle}</td>
                      <td className="px-4 py-3.5 text-muted-foreground">{formatDate(row.endedAt ?? row.startedAt)}</td>
                      <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                        {formatDuration(row.durationSeconds)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {row.overallScore === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="font-semibold" style={{ color: scoreColor(row.overallScore) }}>
                            {row.overallScore.toFixed(1)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {/* Visible without opening the row, per the roadmap's own
                          M2-1 acceptance criterion — a recruiter scanning the
                          list should not have to click in to see a flag. */}
                        {row.terminated ? (
                          <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            Ended early
                          </Badge>
                        ) : row.strikes > 0 ? (
                          <Badge className="border-warning/35 bg-warning/10 text-warning">
                            {row.strikes} {row.strikes === 1 ? 'flag' : 'flags'}
                          </Badge>
                        ) : (
                          <span className="text-[12.5px] text-muted-foreground">Clean</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}
