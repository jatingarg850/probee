'use client'

import { useEffect, useState } from 'react'

import { AssessmentBreakdown } from '@/components/AssessmentBreakdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { AlertCircle, AlertTriangle, PlayCircle } from '@/components/ui/icons'
import { PageContainer, PageHeader } from '@/components/ui/page'
import { useOrgs } from '@/contexts/OrgContext'
import { authHeaders, readApiError } from '@/lib/clientAuth'
import type { Assessment } from '@/types/conversation'
import type { SessionIntegrity } from '@/types/session'

/**
 * One candidate's interview (M2-1, minimum slice).
 *
 * Reuses `AssessmentBreakdown` — the same component the candidate-facing
 * results screen would use, if a candidate were ever shown one, which they
 * are not (see `/api/candidate/complete`'s own note on why). Adding the
 * integrity timeline and full transcript beside it is what turns "a score"
 * into something a recruiter can actually stand behind a decision with.
 */

interface CandidateDetail {
  sessionId: string
  candidateEmail: string
  candidateName: string
  jobTitle: string
  status: string
  transcript: string
  assessment: Assessment | null
  integrity: SessionIntegrity | null
  terminatedReason: string | null
  startedAt: string | null
  endedAt: string | null
}

const VIOLATION_LABEL: Record<string, string> = {
  gaze_away: 'Looked away from the screen',
  no_face: 'No face detected',
  multiple_faces: 'More than one face detected',
  tab_switch: 'Switched away from the interview tab',
  fullscreen_exit: 'Exited fullscreen',
  devtools: 'Developer tools detected',
}

export function CandidateDetailPage({ orgId, sessionId }: { orgId: string; sessionId: string }) {
  const { currentOrg } = useOrgs()
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/orgs/${orgId}/candidates/${sessionId}`, { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, 'Could not load this candidate.'))
        return response.json()
      })
      .then((data) => {
        if (!cancelled) setCandidate(data.candidate)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this candidate.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId, sessionId])

  if (isLoading) {
    return (
      <PageContainer width="wide">
        <p className="py-16 text-sm text-muted-foreground">Loading…</p>
      </PageContainer>
    )
  }

  if (error || !candidate) {
    return (
      <PageContainer width="wide">
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error ?? 'Candidate not found.'}
        </p>
      </PageContainer>
    )
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow={currentOrg?.name ?? 'Hiring'}
        title={candidate.candidateName}
        description={`${candidate.jobTitle} · ${candidate.candidateEmail}`}
        action={
          candidate.terminatedReason ? (
            <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Ended early
            </Badge>
          ) : null
        }
      />

      {candidate.terminatedReason ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3.5 py-3 text-[13.5px] leading-relaxed text-foreground">
          This interview was stopped before it finished: {candidate.terminatedReason}
        </p>
      ) : null}

      <RecordingCard sessionId={candidate.sessionId} />

      {candidate.assessment ? (
        <AssessmentBreakdown assessment={candidate.assessment} />
      ) : (
        <Card>
          <CardHeader title="Assessment" />
          <p className="px-4 py-6 text-[13.5px] leading-relaxed text-muted-foreground">
            No assessment was recorded for this interview.
          </p>
        </Card>
      )}

      {candidate.integrity && (candidate.integrity.violations?.length ?? 0) > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader title={`Integrity flags (${candidate.integrity.strikes})`} />
          <ul className="divide-y divide-border">
            {candidate.integrity.violations.map((violation, index) => (
              <li
                key={`${violation.type}-${violation.at}-${index}`}
                className="flex items-center justify-between gap-4 px-4 py-3 text-[13.5px]"
              >
                <span className="text-foreground">{VIOLATION_LABEL[violation.type] ?? violation.type}</span>
                <span className="tabular-nums text-muted-foreground">
                  {candidate.startedAt
                    ? `${Math.max(0, Math.round((violation.at - new Date(candidate.startedAt).getTime()) / 1000))}s in`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader title="Transcript" />
        <pre className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap px-4 py-4 font-sans text-[13.5px] leading-relaxed text-foreground">
          {candidate.transcript || 'No transcript was recorded.'}
        </pre>
      </Card>
    </PageContainer>
  )
}

/**
 * The interview recording, loaded on demand.
 *
 * Not fetched eagerly on page load: a playback URL is a short-lived signed
 * link to a real video file, and most candidates a recruiter opens are ones
 * they are reading the transcript and score for, not watching back — fetching
 * (and the browser pre-buffering) a video nobody asked to see would waste
 * bandwidth on every single page view. One click gets one URL, used once.
 */
function RecordingCard({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'none' | 'error'>('idle')
  const [urls, setUrls] = useState<{ video: string | null; audio: string | null }>({ video: null, audio: null })
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setState('loading')
    setError(null)
    try {
      const response = await fetch(`/api/recordings/${sessionId}`, { headers: authHeaders() })
      if (response.status === 404) {
        setState('none')
        return
      }
      if (!response.ok) throw new Error(await readApiError(response, 'Could not load the recording.'))
      const data = await response.json()
      setUrls({ video: data.video ?? null, audio: data.audio ?? null })
      setState('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the recording.')
      setState('error')
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Recording" />
      <div className="p-4">
        {state === 'idle' ? (
          <Button variant="outline" onClick={load} className="h-10">
            <PlayCircle className="h-4 w-4" />
            Load recording
          </Button>
        ) : state === 'loading' ? (
          <div className="skeleton aspect-video w-full max-w-2xl rounded-lg" />
        ) : state === 'none' ? (
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            No recording was saved for this interview — recording is best-effort, and a candidate who denied the extra
            camera permission, or whose upload failed, still has their transcript and score above.
          </p>
        ) : state === 'error' ? (
          <p role="alert" className="flex items-center gap-2 text-[13.5px] text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : urls.video ? (
          <video
            src={urls.video}
            controls
            preload="metadata"
            className="aspect-video w-full max-w-2xl rounded-lg border border-border bg-foreground"
          >
            <track kind="captions" />
          </video>
        ) : urls.audio ? (
          // biome-ignore lint/a11y/useMediaCaption: raw interview audio has no authored caption track.
          <audio src={urls.audio} controls preload="metadata" className="w-full max-w-2xl" />
        ) : (
          <p className="text-[13.5px] text-muted-foreground">No recording was saved for this interview.</p>
        )}
      </div>
    </Card>
  )
}
