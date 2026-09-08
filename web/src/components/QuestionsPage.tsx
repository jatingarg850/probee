'use client'

import { HelpCircle, Plus, Quote, Search } from '@/components/ui/icons'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { SearchBar } from '@/components/SearchBar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, PageContainer, PageHeader, Skeleton } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { getUserSessions } from '@/lib/mongoChat'
import { dedupeMessages } from '@/lib/sessionMessages'
import type { InterviewSession } from '@/types/session'

interface AskedQuestion {
  key: string
  text: string
  speakerName: string
  sessionDate: number
}

function formatDate(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return 'Unknown date'
  }
}

/** A question "asked" is any interviewer (non-candidate) turn that reads
 * like a question — the transcript only tags speaker, not utterance type,
 * so this is a best-effort heuristic (ends in "?", or opens with a common
 * interrogative) rather than a guaranteed classifier. */
function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.includes('?')) return true
  return /^(tell me|walk me|describe|explain|what|how|why|when|where|which|can you|could you|would you)\b/i.test(
    trimmed,
  )
}

function extractQuestions(session: InterviewSession): AskedQuestion[] {
  if (!session.messages) return []
  const questions: AskedQuestion[] = []
  // A running counter across the whole session, not per-message — two
  // interviewer turns can share the same timestamp, and two sentences
  // (even across different turns) can share their first 24 characters
  // (e.g. two "What specific metrics would..." follow-ups with different
  // endings), so neither on its own is safe to key on. The counter makes
  // every question's key unique regardless of content or timing overlap.
  let ordinal = 0
  for (const message of dedupeMessages(session.messages)) {
    if (message.speaker === 'user') continue
    // A turn can contain multiple sentences; split so each question stands
    // on its own instead of dragging the interviewer's lead-in with it.
    const sentences = message.text
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const sentence of sentences) {
      if (looksLikeQuestion(sentence)) {
        questions.push({
          key: `${session._id}-${message.timestamp}-${ordinal++}`,
          text: sentence,
          speakerName: message.speakerName,
          sessionDate: session.startedAt,
        })
      }
    }
  }
  return questions
}

export function QuestionsPage() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState<string>('')

  useEffect(
    function setupLoad() {
      let cancelled = false
      const loadSessions = async () => {
        if (!user?.id) return
        setIsLoading(true)
        try {
          const result = await getUserSessions(user.id, 200)
          if (!cancelled) setSessions(Array.isArray(result) ? result : [])
        } finally {
          if (!cancelled) setIsLoading(false)
        }
      }
      void loadSessions()
      return () => {
        cancelled = true
      }
    },
    [user?.id],
  )

  const questions = useMemo(
    () => sessions.flatMap(extractQuestions).sort((a, b) => b.sessionDate - a.sessionDate),
    [sessions],
  )

  const filteredQuestions = useMemo(() => {
    if (!searchQuery.trim()) return questions

    const query = searchQuery.toLowerCase()
    return questions.filter(
      (q) =>
        q.text.toLowerCase().includes(query) ||
        q.speakerName.toLowerCase().includes(query) ||
        formatDate(q.sessionDate).toLowerCase().includes(query),
    )
  }, [questions, searchQuery])

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Your practice"
        title="Question bank"
        description="Every question the panel has put to you, pulled straight from your transcripts. Read them cold and see which ones you would still fumble."
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
        <div className="flex flex-col gap-2.5">
          {['a', 'b', 'c', 'd', 'e'].map((key) => (
            <Card key={key} className="flex flex-col gap-2 p-4">
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-3 w-40" />
            </Card>
          ))}
        </div>
      ) : questions.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No questions recorded yet"
          description="Finish a practice interview and every question the panel asked lands here, tagged with who asked it and when."
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SearchBar
              placeholder="Search by question text or interviewer…"
              value={searchQuery}
              onChange={setSearchQuery}
              className="w-full sm:max-w-md"
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              <strong className="font-semibold text-foreground">{filteredQuestions.length}</strong> of{' '}
              {questions.length} questions
            </span>
          </div>

          {filteredQuestions.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing matches that search"
              description={`No question mentions “${searchQuery}”. Try a shorter phrase.`}
              action={
                <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredQuestions.map((question) => (
                <Card key={question.key} className="group flex gap-3 p-4 transition-shadow hover:shadow-lift">
                  <Quote className="mt-0.5 h-4 w-4 shrink-0 text-primary/50 transition-colors group-hover:text-accent" />
                  <div className="min-w-0">
                    <p className="text-[15px] leading-relaxed text-foreground">{question.text}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-accent">{question.speakerName}</span> ·{' '}
                      {formatDate(question.sessionDate)}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  )
}
