'use client'

import { ArrowRight, Clock, Download, MessageSquare, Plus, Sparkles, Target, TrendingUp } from '@/components/ui/icons'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AssessmentBreakdown } from '@/components/AssessmentBreakdown'
import { PublicLanding } from '@/components/PublicLanding'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState, PageContainer, PageHeader, SectionTitle, Skeleton, StatCard } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { getUserSessions } from '@/lib/mongoChat'
import { scoreBandLabel, scoreColor } from '@/lib/scoreColor'
import type { InterviewSession as Session } from '@/types/session'

function averageScore(session: Session): number | null {
  const scores = session.result?.scores
  if (!scores || Object.keys(scores).length === 0) return null
  const values = Object.values(scores)
  return values.reduce((a, b) => a + b, 0) / values.length
}

function formatDate(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return 'Unknown date'
  }
}

function formatDuration(seconds?: number) {
  if (!seconds) return '0m'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

/** Greeting that tracks the clock — a small touch, but it makes the app
 * feel like it noticed you showed up rather than rendering a static
 * string. */
function timeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard() {
  const { user, isAuthenticated } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!user?.id) return
      setIsLoading(true)
      try {
        const result = await getUserSessions(user.id, 100)
        if (!cancelled) setSessions(Array.isArray(result) ? result : [])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // "/" is reachable without signing in (see AppShell) so it can act as a
  // public landing page — but the rest of this component fetches and
  // displays this specific user's own interview history, which must never
  // render for a signed-out visitor. Bail out to the public view before any
  // of that.
  if (!isAuthenticated) {
    return <PublicLanding />
  }

  const totalInterviews = sessions.length
  const totalDurationSeconds = sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0)
  const scored = sessions.map(averageScore).filter((s): s is number => s !== null)
  const avgScore = scored.length > 0 ? scored.reduce((a, b) => a + b, 0) / scored.length : null
  const totalExchanges = sessions.reduce((sum, s) => sum + (s.transcript ? s.transcript.split('\n').length : 0), 0)

  const selected = sessions.find((s) => s._id === selectedId) ?? null
  const firstName = user?.name ? user.name.split(' ')[0] : null

  return (
    <PageContainer>
      <PageHeader
        eyebrow={timeGreeting()}
        title={firstName ? `Welcome back, ${firstName}` : 'Your dashboard'}
        description={
          totalInterviews > 0
            ? `You have run ${totalInterviews} practice ${totalInterviews === 1 ? 'interview' : 'interviews'} so far. Pick one below to see exactly where the panel pushed back.`
            : 'Nothing here yet. Run your first practice interview and this page fills up with scores, transcripts, and the panel’s reasoning.'
        }
        action={
          <Button asChild className="group">
            <Link href="/interview">
              <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
              New interview
            </Link>
          </Button>
        }
      />

      <div className="grid animate-fade-up animate-fade-up-d1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={MessageSquare} label="Interviews" value={String(totalInterviews)} hint="Sessions completed" />
        <StatCard
          icon={Clock}
          label="Time on mic"
          value={formatDuration(totalDurationSeconds)}
          hint="Total speaking time"
        />
        <StatCard
          icon={Target}
          label="Average score"
          value={avgScore !== null ? `${Math.round(avgScore)}%` : '—'}
          hint={avgScore !== null ? scoreBandLabel(avgScore / 10) : 'Awaiting your first score'}
        />
        <StatCard icon={TrendingUp} label="Exchanges" value={String(totalExchanges)} hint="Questions and answers" />
      </div>

      <div className="grid animate-fade-up animate-fade-up-d2 grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Recent interviews"
            action={
              sessions.length > 0 ? (
                <Link
                  href="/interviews"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-accent transition-colors hover:text-foreground"
                >
                  See all
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ) : null
            }
          />

          {isLoading ? (
            <div className="flex flex-col gap-4 p-4">
              {['a', 'b', 'c'].map((key) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <div className="flex w-full flex-col gap-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-6 w-10 shrink-0" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No interviews yet"
              description="Your first session takes about fifteen minutes. The panel reads your resume first, so the questions are about your actual work."
              action={
                <Button asChild size="sm">
                  <Link href="/interview">
                    <Plus className="h-3.5 w-3.5" />
                    Start your first interview
                  </Link>
                </Button>
              }
              className="rounded-none border-0 bg-transparent"
            />
          ) : (
            <div className="divide-y divide-border">
              {sessions.slice(0, 8).map((session) => {
                const score = averageScore(session)
                const active = session._id === selectedId
                return (
                  <button
                    type="button"
                    key={session._id}
                    onClick={() => setSelectedId(active ? null : session._id)}
                    aria-pressed={active}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                      active ? 'bg-primary/[0.08]' : 'hover:bg-foreground/[0.03]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {formatDate(session.startedAt)}
                        </span>
                        <StatusBadge status={session.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDuration(session.duration)} on mic
                        {score !== null ? ` · ${scoreBandLabel(score / 10)}` : ''}
                      </p>
                    </div>
                    {score !== null ? (
                      <span className="shrink-0 text-base font-bold" style={{ color: scoreColor(score / 10) }}>
                        {Math.round(score)}%
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">Not scored</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Session detail" />
          {selected ? (
            <div className="flex animate-fade-in flex-col gap-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Date</span>
                  <p className="text-sm font-medium text-foreground">{formatDate(selected.startedAt)}</p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Duration</span>
                  <p className="text-sm font-medium text-foreground">{formatDuration(selected.duration)}</p>
                </div>
              </div>

              {selected.result?.scores ? (
                <div>
                  <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Scores</span>
                  <div className="mt-2 flex flex-col gap-2.5">
                    {Object.entries(selected.result.scores).map(([category, score]) => (
                      <div key={category} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize text-muted-foreground">{category}</span>
                          <span className="font-semibold text-foreground">{Math.round(score)}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className="h-full rounded-full transition-[width] duration-700"
                            style={{ width: `${score}%`, background: scoreColor(score / 10) }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.result?.feedback ? (
                <div>
                  <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Panel feedback</span>
                  <p className="mt-1.5 rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground">
                    {selected.result.feedback}
                  </p>
                </div>
              ) : null}

              <div>
                <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Transcript preview</span>
                <div className="mt-1.5 max-h-32 overflow-y-auto rounded-lg border border-border bg-background p-3">
                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                    {selected.transcript.slice(0, 400)}
                    {selected.transcript.length > 400 ? '…' : ''}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  const blob = new Blob([selected.transcript], { type: 'text/plain' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `interview_${selected.sessionId}.txt`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                }}
                className="h-9 w-full text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                Download full transcript
              </Button>
            </div>
          ) : (
            <p className="px-6 py-12 text-center text-sm leading-relaxed text-muted-foreground">
              Pick an interview on the left and its scores, feedback, and transcript open here.
            </p>
          )}
        </Card>
      </div>

      {selected ? (
        <div className="flex animate-fade-up flex-col gap-3">
          <SectionTitle>Graphical analysis · {formatDate(selected.startedAt)}</SectionTitle>
          {selected.assessment ? (
            <AssessmentBreakdown assessment={selected.assessment} />
          ) : (
            <Card className="px-4 py-10 text-center text-sm text-muted-foreground">
              No detailed assessment was recorded for this session.
            </Card>
          )}
        </div>
      ) : null}
    </PageContainer>
  )
}
