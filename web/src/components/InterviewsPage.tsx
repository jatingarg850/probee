'use client'

import { Clock, MessageSquareText, Plus, Search, Sparkles } from '@/components/ui/icons'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { SearchBar } from '@/components/SearchBar'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, PageContainer, PageHeader, Skeleton } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { getUserSessions } from '@/lib/mongoChat'
import { scoreBandLabel, scoreColor } from '@/lib/scoreColor'
import { dedupeMessages } from '@/lib/sessionMessages'
import type { InterviewSession } from '@/types/session'

function averageScore(session: InterviewSession): number | null {
  const scores = session.result?.scores
  if (!scores || Object.keys(scores).length === 0) return null
  const values = Object.values(scores)
  return values.reduce((a, b) => a + b, 0) / values.length
}

function formatDate(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
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

export function InterviewsPage() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!user?.id) return
      setIsLoading(true)
      try {
        const result = await getUserSessions(user.id, 200)
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

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions

    const query = searchQuery.toLowerCase()
    return sessions.filter(
      (s) =>
        formatDate(s.startedAt ?? 0)
          .toLowerCase()
          .includes(query) || Boolean(s.transcript?.toLowerCase().includes(query)),
    )
  }, [sessions, searchQuery])

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Your practice"
        title="Interviews"
        description="Every session the panel has graded, newest first — scores, written feedback, and the notes each interviewer left behind."
        action={
          <Button asChild className="group">
            <Link href="/interview">
              <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
              New interview
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {['a', 'b', 'c'].map((key) => (
            <Card key={key} className="flex flex-col gap-3 p-4">
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="h-1.5 w-4/5" />
            </Card>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No graded interviews yet"
          description="Run a practice interview and the panel’s scoring lands here — competency by competency, with the evidence behind each number."
          action={
            <Button asChild>
              <Link href="/interview">
                <Plus className="h-4 w-4" />
                Start your first interview
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <SearchBar
            placeholder="Search by date or anything said in the interview…"
            value={searchQuery}
            onChange={setSearchQuery}
            className="w-full animate-fade-up"
          />

          {filteredSessions.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing matches that search"
              description={`No interview mentions “${searchQuery}”. Try a shorter phrase, or clear the search to see all ${sessions.length}.`}
              action={
                <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              {filteredSessions.map((session, index) => {
                const score = averageScore(session)
                return (
                  <Card
                    key={session._id}
                    className={`animate-fade-up p-5 transition-shadow hover:shadow-lift ${index < 3 ? `animate-fade-up-d${index}` : ''}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{formatDate(session.startedAt)}</span>
                          <StatusBadge status={session.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDuration(session.duration)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <MessageSquareText className="h-3.5 w-3.5" />
                            {dedupeMessages(session.messages ?? []).length} exchanges
                          </span>
                        </div>
                      </div>

                      {score !== null ? (
                        <div className="flex shrink-0 flex-col items-end">
                          <span className="text-2xl font-bold leading-none" style={{ color: scoreColor(score / 10) }}>
                            {Math.round(score)}%
                          </span>
                          <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                            {scoreBandLabel(score / 10)}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {session.result?.scores ? (
                      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {Object.entries(session.result.scores).map(([category, categoryScore]) => (
                          <div key={category} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="capitalize text-muted-foreground">{category}</span>
                              <span className="font-semibold text-foreground">{Math.round(categoryScore)}%</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                              <div
                                className="h-full rounded-full transition-[width] duration-700"
                                style={{
                                  width: `${categoryScore}%`,
                                  background: scoreColor(categoryScore / 10),
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {session.result?.feedback ? (
                      <div className="mt-4 rounded-lg border border-border bg-background p-3">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          What the panel said
                        </span>
                        <p className="mt-1.5 text-sm leading-relaxed text-foreground">{session.result.feedback}</p>
                      </div>
                    ) : null}

                    {session.result?.interviewerNotes ? (
                      <p className="mt-3 border-l-2 border-primary/40 pl-3 text-xs italic leading-relaxed text-muted-foreground">
                        {session.result.interviewerNotes}
                      </p>
                    ) : null}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  )
}
