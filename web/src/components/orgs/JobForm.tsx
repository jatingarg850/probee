'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { JobCandidatesPanel } from '@/components/orgs/JobCandidatesPanel'
import { Button } from '@/components/ui/button'
import { AlertCircle, Check, FileText, Plus, Trash, Upload } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import { PageContainer, PageHeader } from '@/components/ui/page'
import { stashCreatedJob, takeStashedJob } from '@/lib/jobHandoffCache'
import {
  type Competency,
  DEFAULT_COMPETENCIES,
  JOB_STATUSES,
  type JobStatus,
  PANEL_SEATS,
  type PanelSeat,
} from '@/lib/jobTypes'
import { createJobRequest, extractJobDescriptionRequest, fetchJob, updateJobRequest } from '@/lib/orgApi'

// No width baked in: composing this with an explicit w-* utility (as the
// weight input below does) previously lost that fight to this class's own
// `w-full` — same-specificity Tailwind utilities resolve by their order in
// the *compiled* stylesheet, not the order they're listed in `className`,
// so `w-24 shrink-0` on the weight input was silently overridden and it
// rendered full-width, squeezing the competency-name input beside it down
// to almost nothing. Width is applied per call site instead.
const fieldBaseClass =
  'rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10'
const fieldClass = `${fieldBaseClass} w-full`
const labelClass = 'flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground'

const SEAT_LABELS: Record<PanelSeat, string> = {
  technical_interviewer: 'Technical Interviewer',
  product_manager: 'Product Manager',
  hiring_manager: 'Hiring Manager',
}

const DURATIONS = [10, 15, 20, 30, 45]

/**
 * Create or edit a job.
 *
 * One component for both so the two paths cannot validate or lay out
 * differently — the only difference is whether it loads an existing job first
 * and which request it sends.
 */
export function JobForm({ orgId, jobId }: { orgId: string; jobId?: string }) {
  const router = useRouter()
  const isEdit = Boolean(jobId)

  const [title, setTitle] = useState('')
  const [level, setLevel] = useState('')
  const [description, setDescription] = useState('')
  const [competencies, setCompetencies] = useState<Competency[]>(DEFAULT_COMPETENCIES)
  const [panelSeats, setPanelSeats] = useState<PanelSeat[]>([...PANEL_SEATS])
  const [durationMinutes, setDurationMinutes] = useState(15)
  const [mustAsk, setMustAsk] = useState<string[]>([])
  const [status, setStatus] = useState<JobStatus>('draft')
  /** What the server currently has, as opposed to what the form is showing.
   * The candidate panel gates on this so it never invites against an unsaved
   * change. */
  const [savedStatus, setSavedStatus] = useState<JobStatus>('draft')

  const [isLoading, setIsLoading] = useState(isEdit)
  const [isSaving, setIsSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) return
    let cancelled = false

    const hydrate = (job: {
      title: string
      level: string
      description: string
      competencies: Competency[]
      panelSeats: PanelSeat[]
      durationMinutes: number
      mustAskQuestions: string[]
      status: JobStatus
    }) => {
      setTitle(job.title)
      setLevel(job.level)
      setDescription(job.description)
      setCompetencies(job.competencies)
      setPanelSeats(job.panelSeats)
      setDurationMinutes(job.durationMinutes)
      setMustAsk(job.mustAskQuestions)
      setStatus(job.status)
      setSavedStatus(job.status)
    }

    // A job just created by this same form is already in hand — no need to
    // fetch back what was just sent. See jobHandoffCache.ts for why this
    // exists: `/jobs/new` and `/jobs/[jobId]` are different route files, so
    // creating a job forces a full remount into this same effect.
    const stashed = takeStashedJob(jobId)
    if (stashed) {
      hydrate(stashed)
      setIsLoading(false)
      return
    }

    const load = async () => {
      try {
        const job = await fetchJob(orgId, jobId)
        if (cancelled) return
        hydrate(job)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this job.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [orgId, jobId])

  // Shown live rather than only on submit — the server rejects anything that
  // does not total 100, and finding that out after filling in the whole form
  // is the wrong moment to learn it.
  const weightTotal = useMemo(
    () => Math.round(competencies.reduce((sum, c) => sum + (Number(c.weight) || 0), 0) * 100) / 100,
    [competencies],
  )
  const weightsBalanced = weightTotal === 100

  const setCompetency = (index: number, patch: Partial<Competency>) => {
    setCompetencies((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  const distributeEvenly = () => {
    const count = competencies.length
    if (count === 0) return
    const base = Math.floor((100 / count) * 100) / 100
    const next = competencies.map((c) => ({ ...c, weight: base }))
    // Put the rounding remainder on the first row so the total lands exactly
    // on 100 rather than 99.99.
    const remainder = Math.round((100 - base * count) * 100) / 100
    next[0] = { ...next[0], weight: Math.round((base + remainder) * 100) / 100 }
    setCompetencies(next)
  }

  const toggleSeat = (seat: PanelSeat) => {
    setPanelSeats((prev) => (prev.includes(seat) ? prev.filter((s) => s !== seat) : [...prev, seat]))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSaving) return
    setError(null)
    setIsSaving(true)
    setJustSaved(false)

    const payload = {
      title: title.trim(),
      level: level.trim(),
      description: description.trim(),
      competencies: competencies.map((c) => ({ name: c.name.trim(), weight: Number(c.weight) })),
      panelSeats,
      durationMinutes,
      mustAskQuestions: mustAsk.map((q) => q.trim()).filter(Boolean),
      status,
    }

    try {
      if (jobId) {
        // Same route either way — editing does not navigate anywhere, so
        // there is nothing waiting to flip `isSaving` back off. Previously
        // this only happened in the catch branch, which meant a *successful*
        // save left the button reading "Saving…" forever, looking hung until
        // the recruiter navigated away by hand.
        const job = await updateJobRequest(orgId, jobId, payload)
        setSavedStatus(job.status)
        setIsSaving(false)
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 1800)
      } else {
        const job = await createJobRequest(orgId, payload)
        setSavedStatus(job.status)
        stashCreatedJob(job)
        router.push(`/orgs/${orgId}/jobs/${job.id}`)
        // isSaving deliberately stays true here: the button should keep
        // reading "Saving…" through the navigation rather than flash back to
        // "Create job" for the instant before this component unmounts.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the job.')
      setIsSaving(false)
    }
  }

  const handleDescriptionFile = async (file: File) => {
    if (description.trim() && !window.confirm('Replace the current description with the text from this file?')) {
      return
    }
    setIsExtracting(true)
    setExtractError(null)
    try {
      const text = await extractJobDescriptionRequest(orgId, file)
      setDescription(text.slice(0, 10_000))
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      setIsExtracting(false)
    }
  }

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-2 border-b border-border pb-5">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-7 w-48 rounded" />
        </div>
        <div className="mt-6 flex flex-col gap-6">
          <section className="flex flex-col gap-4">
            <div className="skeleton h-10 w-full rounded-lg" />
            <div className="skeleton h-10 w-1/2 rounded-lg" />
            <div className="skeleton h-32 w-full rounded-lg" />
          </section>
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <div className="skeleton h-4 w-32 rounded" />
            {['a', 'b', 'c'].map((key) => (
              <div key={key} className="skeleton h-10 w-full rounded-lg" />
            ))}
          </section>
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="skeleton h-24 w-full rounded-lg" />
            <div className="skeleton h-24 w-full rounded-lg" />
          </section>
          <div className="skeleton h-11 w-32 rounded-lg" />
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Hiring"
        title={isEdit ? 'Edit job' : 'New job'}
        description="What the panel reads before the interview, and what it scores against afterwards."
        action={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/jobs`}>Cancel</Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="flex animate-fade-up flex-col gap-7">
        {/* --- the role --- */}
        <section className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_14rem]">
            <label className={labelClass}>
              Job title
              <input
                className={fieldClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Senior Backend Engineer"
                maxLength={120}
                required
              />
            </label>
            <label className={labelClass}>
              <span>
                Level <span className="font-normal normal-case tracking-normal opacity-70">— optional</span>
              </span>
              <input
                className={fieldClass}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="Senior"
                maxLength={60}
              />
            </label>
          </div>

          <label className={labelClass}>
            <span className="flex items-center justify-between gap-3">
              Job description
              <span className="relative">
                <input
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) handleDescriptionFile(file)
                  }}
                  disabled={isExtracting}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  aria-label="Upload a job description file (PDF or text)"
                />
                <span className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-normal normal-case tracking-normal text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
                  {isExtracting ? <LoadingDots /> : <Upload className="h-3.5 w-3.5" />}
                  {isExtracting ? 'Reading…' : 'Upload PDF or text'}
                </span>
              </span>
            </span>
            <textarea
              className={`${fieldClass} resize-y`}
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the role actually involves. The panel reads this before the interview and grounds its questions in it — or upload a file above to fill this in."
              maxLength={10_000}
              required
            />
            <span className="flex items-center justify-between gap-3 text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
              <span className="tabular-nums">{description.length.toLocaleString()} / 10,000</span>
              {extractError ? <span className="text-destructive">{extractError}</span> : null}
            </span>
          </label>
        </section>

        {/* --- scoring --- */}
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Competencies</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                What the panel scores against, and how much each one counts.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-[13px] font-semibold tabular-nums ${weightsBalanced ? 'text-success' : 'text-warning'}`}
              >
                {weightTotal} / 100
              </span>
              <button
                type="button"
                onClick={distributeEvenly}
                className="rounded-md border border-border px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                Split evenly
              </button>
            </div>
          </div>

          <ul className="flex flex-col gap-2">
            {competencies.map((competency, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and freely renamed, so the name is not a stable identity
              <li key={index} className="flex items-center gap-2">
                <input
                  className={fieldClass}
                  value={competency.name}
                  onChange={(e) => setCompetency(index, { name: e.target.value })}
                  placeholder="Competency name"
                  aria-label={`Competency ${index + 1} name`}
                />
                <input
                  type="number"
                  className={`${fieldBaseClass} w-24 shrink-0 tabular-nums`}
                  value={competency.weight}
                  onChange={(e) => setCompetency(index, { weight: Number(e.target.value) })}
                  min={1}
                  max={100}
                  step="0.01"
                  aria-label={`Weight for ${competency.name || `competency ${index + 1}`}`}
                />
                <button
                  type="button"
                  onClick={() => setCompetencies((prev) => prev.filter((_, i) => i !== index))}
                  disabled={competencies.length === 1}
                  aria-label={`Remove ${competency.name || 'competency'}`}
                  className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          {competencies.length < 12 ? (
            <button
              type="button"
              onClick={() => setCompetencies((prev) => [...prev, { name: '', weight: 0 }])}
              className="flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-accent transition-colors hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" />
              Add competency
            </button>
          ) : null}
        </section>

        {/* --- the panel --- */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className={labelClass}>
            Interviewers on the panel
            <div className="flex flex-col gap-2">
              {PANEL_SEATS.map((seat) => {
                const checked = panelSeats.includes(seat)
                return (
                  <label
                    key={seat}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal transition-colors ${
                      checked
                        ? 'border-primary/45 bg-primary/[0.06] text-foreground'
                        : 'border-border text-muted-foreground hover:border-foreground/25'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSeat(seat)}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    {SEAT_LABELS[seat]}
                  </label>
                )
              })}
            </div>
            {panelSeats.length === 0 ? (
              <span className="text-[11px] font-normal normal-case tracking-normal text-destructive">
                Pick at least one interviewer.
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-5">
            <div className={labelClass}>
              Interview length
              <div className="flex gap-1.5 rounded-lg border border-border bg-background p-1">
                {DURATIONS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => setDurationMinutes(minutes)}
                    aria-pressed={durationMinutes === minutes}
                    className={`flex-1 rounded-md py-1.5 text-[13px] font-medium tabular-nums transition-colors ${
                      durationMinutes === minutes
                        ? 'bg-ink text-ink-foreground'
                        : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground'
                    }`}
                  >
                    {minutes}m
                  </button>
                ))}
              </div>
            </div>

            <label className={labelClass}>
              Status
              <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
                {JOB_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
              <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                Only open jobs can take candidates.
              </span>
            </label>
          </div>
        </section>

        {/* --- must-ask --- */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Questions the panel must cover</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Optional. Everything else the panel asks follows from the conversation.
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {mustAsk.map((question, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional editable rows
              <li key={index} className="flex items-center gap-2">
                <input
                  className={fieldClass}
                  value={question}
                  onChange={(e) => setMustAsk((prev) => prev.map((q, i) => (i === index ? e.target.value : q)))}
                  placeholder="Walk me through a system you designed end to end."
                  maxLength={500}
                  aria-label={`Required question ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => setMustAsk((prev) => prev.filter((_, i) => i !== index))}
                  aria-label="Remove question"
                  className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          {mustAsk.length < 20 ? (
            <button
              type="button"
              onClick={() => setMustAsk((prev) => [...prev, ''])}
              className="flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-accent transition-colors hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" />
              Add a required question
            </button>
          ) : null}
        </section>

        {error ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3 border-t border-border pt-5">
          <Button type="submit" disabled={isSaving || !weightsBalanced || panelSeats.length === 0} className="h-11">
            {isSaving ? (
              <>
                <LoadingDots />
                Saving…
              </>
            ) : justSaved ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : isEdit ? (
              'Save changes'
            ) : (
              'Create job'
            )}
          </Button>
          {!weightsBalanced ? (
            <span className="text-[13px] text-muted-foreground">
              Weights need to total 100 before this can be saved.
            </span>
          ) : null}
        </div>
      </form>

      {/* Only on an existing job. A job that has not been saved has no id to
          attach a candidate to, and showing the panel greyed out would just
          raise a question the page cannot answer yet. `savedStatus` is the
          status as stored, not the one in the dropdown — inviting against an
          unsaved "open" would send links to a job the server still has as a
          draft, and turn every candidate away. */}
      {jobId ? <JobCandidatesPanel orgId={orgId} jobId={jobId} jobStatus={savedStatus} /> : null}
    </PageContainer>
  )
}
