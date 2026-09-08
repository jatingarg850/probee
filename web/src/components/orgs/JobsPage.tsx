'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, ClipboardText, Plus } from '@/components/ui/icons'
import { EmptyState, PageContainer, PageHeader, Skeleton } from '@/components/ui/page'
import { useOrgs } from '@/contexts/OrgContext'
import type { JobSummary } from '@/lib/jobTypes'
import { fetchJobs } from '@/lib/orgApi'

function formatDate(value: string | Date) {
  try {
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return 'Unknown date'
  }
}

export function JobsPage({ orgId }: { orgId: string }) {
  const { currentOrg } = useOrgs()
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await fetchJobs(orgId)
        if (!cancelled) setJobs(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load jobs.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [orgId])

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow={currentOrg?.name ?? 'Hiring'}
        title="Jobs"
        description="Each job sets what the panel asks about and how a candidate is scored."
        action={
          <Button asChild className="group">
            <Link href={`/orgs/${orgId}/jobs/new`}>
              <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
              New job
            </Link>
          </Button>
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
      ) : jobs.length === 0 && !error ? (
        <EmptyState
          icon={ClipboardText}
          title="No jobs yet"
          description="A job holds the role, the description the panel reads, and the competencies it scores against. Create one to start interviewing for it."
          action={
            <Button asChild size="sm">
              <Link href={`/orgs/${orgId}/jobs/new`}>
                <Plus className="h-3.5 w-3.5" />
                Create your first job
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="flex animate-fade-up flex-col gap-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/orgs/${orgId}/jobs/${job.id}`}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lift sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="truncate text-[1.05rem] font-semibold tracking-tight text-foreground">{job.title}</h2>
                  <StatusBadge status={job.status} />
                  {job.level ? <span className="text-xs text-muted-foreground">{job.level}</span> : null}
                </div>
                <p className="mt-1.5 line-clamp-1 max-w-[70ch] text-[13.5px] text-muted-foreground">
                  {job.description}
                </p>
              </div>

              <dl className="flex shrink-0 items-center gap-5 text-[12px] text-muted-foreground">
                <div>
                  <dt className="sr-only">Interviewers</dt>
                  <dd className="tabular-nums">
                    {job.panelSeats.length} {job.panelSeats.length === 1 ? 'interviewer' : 'interviewers'}
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Duration</dt>
                  <dd className="tabular-nums">{job.durationMinutes} min</dd>
                </div>
                <div>
                  <dt className="sr-only">Created</dt>
                  <dd>{formatDate(job.createdAt)}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
