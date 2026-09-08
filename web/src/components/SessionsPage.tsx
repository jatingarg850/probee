'use client'

import { Download, Plus, Radio, Search } from '@/components/ui/icons'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { SearchBar } from '@/components/SearchBar'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, PageContainer, PageHeader, Skeleton } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { getUserSessions } from '@/lib/mongoChat'
import { dedupeMessages } from '@/lib/sessionMessages'
import type { InterviewSession } from '@/types/session'

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

function formatTime(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function downloadTranscript(session: InterviewSession) {
  const blob = new Blob([session.transcript], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `interview_${session.sessionId}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function SessionsPage() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!user?.id) return
      setIsLoading(true)
      try {
        const result = await getUserSessions(user.id, 200)
        const list: InterviewSession[] = Array.isArray(result) ? result : []
        if (!cancelled) {
          setSessions(list)
          setSelectedId((current) => current ?? list[0]?._id ?? null)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const selected = useMemo(() => sessions.find((s) => s._id === selectedId) ?? null, [sessions, selectedId])
  const selectedMessages = useMemo(() => (selected ? dedupeMessages(selected.messages ?? []) : []), [selected])
  const turnCounts = useMemo(
    () => new Map(sessions.map((s) => [s._id, dedupeMessages(s.messages ?? []).length])),
    [sessions],
  )

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
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Your practice"
        title="Transcripts"
        description="Every word from every practice session, turn by turn — yours and the panel’s. Read it back, or download the whole thing."
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[19rem_1fr]">
          <Card className="flex flex-col gap-3 p-4">
            {['a', 'b', 'c', 'd'].map((key) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </Card>
          <Card className="flex flex-col gap-3 p-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="ml-auto h-12 w-2/3" />
            <Skeleton className="h-14 w-4/5" />
          </Card>
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No transcripts yet"
          description="Every practice interview is recorded turn by turn. Finish one and the full conversation shows up here."
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
        <div className="grid animate-fade-up grid-cols-1 gap-4 lg:grid-cols-[19rem_1fr]">
          <Card className="flex max-h-[38rem] flex-col overflow-hidden">
            <div className="border-b border-border p-3">
              <SearchBar placeholder="Search transcripts…" value={searchQuery} onChange={setSearchQuery} />
            </div>
            {filteredSessions.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Search className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Nothing matches that search</p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                {filteredSessions.map((session) => {
                  const active = session._id === selectedId
                  return (
                    <button
                      type="button"
                      key={session._id}
                      onClick={() => setSelectedId(session._id)}
                      aria-current={active ? 'true' : undefined}
                      className={`relative w-full px-4 py-3 text-left transition-colors ${
                        active ? 'bg-primary/[0.08]' : 'hover:bg-foreground/[0.03]'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`absolute left-0 top-0 h-full w-[3px] bg-accent transition-opacity ${
                          active ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <p className="truncate text-sm font-medium text-foreground">{formatDate(session.startedAt)}</p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {turnCounts.get(session._id) ?? 0} turns
                        <StatusBadge status={session.status} />
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          <Card className="flex min-h-0 flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{formatDate(selected.startedAt)}</p>
                    <p className="text-xs text-muted-foreground">{selectedMessages.length} turns in this session</p>
                  </div>
                  <Button onClick={() => downloadTranscript(selected)} variant="outline" size="sm">
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                </div>
                <div className="flex max-h-[34rem] flex-col gap-4 overflow-y-auto bg-background/50 px-4 py-5">
                  {selectedMessages.length > 0 ? (
                    selectedMessages.map((message, index) => {
                      const isUser = message.speaker === 'user'
                      return (
                        <div
                          key={`${message.timestamp}-${index}`}
                          className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                        >
                          <div className="mb-1 flex items-center gap-2 px-1 text-[11px] font-semibold text-muted-foreground">
                            <span>{message.speakerName}</span>
                            <span className="font-normal opacity-70">{formatTime(message.timestamp)}</span>
                          </div>
                          <div
                            className={`max-w-2xl whitespace-pre-wrap rounded-xl border px-3.5 py-2.5 text-sm leading-6 shadow-soft ${
                              isUser
                                ? 'rounded-br-sm border-primary/25 bg-primary/10 text-foreground'
                                : 'rounded-bl-sm border-border bg-card text-foreground'
                            }`}
                          >
                            {message.text}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {selected.transcript || 'No transcript was recorded for this session.'}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                Pick a session on the left to read it back.
              </p>
            )}
          </Card>
        </div>
      )}
    </PageContainer>
  )
}
