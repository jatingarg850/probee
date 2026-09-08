'use client'

import { AlertCircle, Check, ChevronRight, GripHorizontal, Target, Upload, X } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { IMPLAUSIBLE_ROLE_MESSAGE, isPlausibleRoleInput } from '@/lib/inputGuards'
import { hasSeenIntroPanel, markIntroPanelSeen } from '@/lib/introPanel'
import { saveResumeAnalysis } from '@/lib/resumeAnalysisCache'
import { analyzeResume } from '@/services/api'
import type { InterviewSetup } from '@/types/conversation'

type InterviewSetupFormProps = {
  isLoading: boolean
  error: string | null
  onStartConversation: (setup: InterviewSetup) => void
}

const MAX_FILE_BYTES = 8 * 1024 * 1024
const DURATIONS = [10, 15, 20, 30]

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10'

const labelClass = 'flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground'

/** What the panel does with each thing you hand it — shown alongside the
 * form rather than after it, because the reason to upload a resume is the
 * one thing that makes the upload worth doing. */
const RAIL_STEPS = [
  { n: '01', t: 'Your resume is read first', d: 'Questions come out of your actual projects, not a generic list.' },
  {
    n: '02',
    t: 'Three interviewers join',
    d: 'Technical, product, and hiring manager, handing the room between them.',
  },
  { n: '03', t: 'You are scored on hang-up', d: 'Competency breakdown with the lines from your transcript behind it.' },
]

type FieldErrors = Partial<Record<'candidateName' | 'resume' | 'role' | 'description', string>>

export function InterviewSetupForm({ isLoading, error, onStartConversation }: InterviewSetupFormProps) {
  const { user } = useAuth()
  const searchParams = useSearchParams()

  const [candidateName, setCandidateName] = useState(user?.name ?? '')
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [description, setDescription] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(15)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Per-field rather than one lumped "all of these are required" line: with
  // a single message you had to work out for yourself which of the five
  // inputs it meant, and the message sat at the bottom of the form, far
  // from whichever field was actually empty.
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // The context rail (see the aside below — a drawer at every width, just
  // collapsed along a different axis depending on layout) auto-opens the
  // very first time a candidate reaches this page and stays collapsed after
  // that, so a returning candidate isn't shown the same explainer on every
  // visit. Starts closed rather than open-then-collapse: that way a
  // returning candidate — the common case — never sees it flash open at
  // all, and only a genuine first-timer sees the one-time open.
  const [introOpen, setIntroOpen] = useState(false)
  const [introDragPx, setIntroDragPx] = useState(0)
  const introDragState = useRef<{ start: number; wasOpen: boolean } | null>(null)

  useEffect(() => {
    const queryRole = searchParams.get('role')
    const queryCompany = searchParams.get('company')
    const queryJd = searchParams.get('jd') || searchParams.get('description')

    if (queryRole) setRole(queryRole)
    if (queryCompany) setCompany(queryCompany)
    if (queryJd) setDescription(queryJd)
  }, [searchParams])

  useEffect(() => {
    if (!user?.id) return
    if (!hasSeenIntroPanel(user.id, 'interviewSetup')) {
      setIntroOpen(true)
      markIntroPanelSeen(user.id, 'interviewSetup')
    }
  }, [user?.id])

  // Lets either edge handle (the desktop one on the right, dragged
  // horizontally; the mobile one at the bottom, dragged vertically — see
  // the two <button>s below) be clicked or dragged open/closed. Pointer
  // Events cover mouse, touch and pen in one handler rather than separate
  // mouse/touch listeners. `introDragPx` only drives a live "how far past
  // the threshold" read while dragging — the drag ends by committing to
  // fully open or fully closed (see endPanelHandleDrag), never a resting
  // half-state. Generic over axis (`coord` is clientX for the horizontal
  // handle, clientY for the vertical one) so both handles share one
  // implementation instead of two near-identical copies.
  const beginPanelHandleDrag = (coord: number) => {
    introDragState.current = { start: coord, wasOpen: introOpen }
    setIntroDragPx(0)
  }

  const movePanelHandleDrag = (coord: number) => {
    if (!introDragState.current) return
    // Dragging "inward" (left from the right edge, or up from the bottom
    // edge) opens the panel — both reduce `coord` relative to the drag's
    // start, so a plain start-minus-current works for either axis. Clamped
    // to 0 so dragging the wrong way doesn't do anything.
    const d = introDragState.current.start - coord
    setIntroDragPx(Math.max(0, d))
  }

  const endPanelHandleDrag = () => {
    const drag = introDragState.current
    introDragState.current = null
    if (!drag) return
    const DRAG_THRESHOLD_PX = 48
    if (introDragPx > DRAG_THRESHOLD_PX) {
      setIntroOpen(!drag.wasOpen)
    } else if (introDragPx < 4) {
      // Barely moved — treat it as a click/tap rather than a drag.
      setIntroOpen((prev) => !prev)
    }
    setIntroDragPx(0)
  }

  const handleDesktopHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    beginPanelHandleDrag(event.clientX)
  }
  const handleDesktopHandlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) =>
    movePanelHandleDrag(event.clientX)

  const handleMobileHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    beginPanelHandleDrag(event.clientY)
  }
  const handleMobileHandlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) =>
    movePanelHandleDrag(event.clientY)

  const handlePanelHandleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Pointer taps are already toggled above, on pointer-up — a real mouse
    // click firing right after would double-toggle. A keyboard-triggered
    // click (Enter/Space on the focused button) has `detail === 0`, unlike
    // a pointer-driven one, so that's the only case handled here.
    if (event.detail !== 0) return
    setIntroOpen((prev) => !prev)
  }

  const clearFieldError = (key: keyof FieldErrors) =>
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))

  const pickFile = (next: File | null) => {
    setFormError(null)
    clearFieldError('resume')
    if (!next) {
      setResumeFile(null)
      return
    }
    if (next.type !== 'application/pdf') {
      setFieldErrors((prev) => ({ ...prev, resume: 'Resume must be a PDF.' }))
      return
    }
    if (next.size > MAX_FILE_BYTES) {
      setFieldErrors((prev) => ({ ...prev, resume: 'That file is larger than 8MB.' }))
      return
    }
    setResumeFile(next)
  }

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    pickFile(event.dataTransfer.files?.[0] ?? null)
  }

  const validate = (): FieldErrors => {
    const next: FieldErrors = {}
    if (!candidateName.trim()) next.candidateName = 'Tell the panel what to call you.'
    if (!resumeFile) next.resume = 'Upload a PDF resume to ground the questions.'
    if (!role.trim()) next.role = 'Name the role you are practising for.'
    else if (!isPlausibleRoleInput(role)) next.role = IMPLAUSIBLE_ROLE_MESSAGE
    if (!description.trim()) next.description = 'A sentence or two is enough.'
    return next
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isLoading || isPreparing) return

    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setFormError(null)
      // Put the caret in the first thing that needs attention rather than
      // leaving the reader to hunt for it.
      const firstInvalid = document.querySelector<HTMLElement>('[data-invalid="true"]')
      firstInvalid?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      firstInvalid?.focus?.()
      return
    }

    setFieldErrors({})
    setFormError(null)
    setIsPreparing(true)
    try {
      // Ground the panel in the candidate's actual resume rather than just
      // the free-text description — the analyzer reads the PDF directly
      // (Gemini's native document understanding), and its summary + top
      // skills get folded into the job-description context the interview
      // agent receives, so questions can reference real background instead
      // of only the role title.
      let resumeContext = ''
      try {
        const analysis = await analyzeResume(resumeFile as File, role.trim())
        if (analysis.error && analysis.error_type === 'validation') {
          // The input itself was the problem (unreadable resume, nonsense
          // target role) — worth stopping for rather than quietly starting
          // an interview grounded in nothing real.
          setFormError(analysis.error_message || 'Please check your resume and target role and try again.')
          setIsPreparing(false)
          return
        }
        if (!analysis.error) {
          const skills = analysis.top_skills.slice(0, 8).join(', ')
          resumeContext = [
            `Candidate resume summary: ${analysis.candidate_summary}`,
            skills ? `Key skills from resume: ${skills}` : '',
          ]
            .filter(Boolean)
            .join('\n')
          if (user?.id) saveResumeAnalysis(user.id, analysis)
        }
      } catch (resumeErr) {
        // Non-fatal: the interview can proceed on the typed description
        // alone if resume analysis fails (e.g. Gemini hiccup).
        console.warn('Resume analysis failed, continuing without it:', resumeErr)
      }

      const jobDescription = [description.trim(), resumeContext].filter(Boolean).join('\n\n')

      onStartConversation({
        candidateName: candidateName.trim(),
        role: role.trim(),
        company: company.trim(),
        jobDescription,
        durationMinutes,
      })
    } finally {
      setIsPreparing(false)
    }
  }

  const busy = isLoading || isPreparing
  const targetedRole = searchParams.get('role')
  const targetedCompany = searchParams.get('company')

  return (
    // A Fragment, not just the form: the drag handle below is `fixed` to
    // the viewport, but the form has `animate-fade-up`, and any element
    // with a `transform` (the fade-up keyframes leave `translateY(0)` set
    // even after the animation ends) becomes the containing block for
    // `position: fixed` descendants. A handle nested inside the form would
    // silently stop being viewport-fixed and get clipped by the page's own
    // scroll container instead — keeping it as a sibling avoids that trap
    // entirely rather than fighting it with more positioning.
    <>
      <form
        onSubmit={handleSubmit}
        noValidate
        // Fills the whole area beside the sidebar rather than sitting as a
        // narrow card in the middle of it, and lays out to the viewport height
        // so the form does not need scrolling to reach its own submit button.
        className="flex min-h-full w-full animate-fade-up flex-col text-left lg:h-full lg:min-h-0 lg:flex-row"
      >
        {/* Context rail. Static copy, so it can hold the explanation and the
         * disclaimer and leave the fields column free to be purely inputs.
         * `lg:order-2` moves this to the right of the fields on desktop (see
         * the note on the fields column below) while staying first in DOM
         * order so it still reads before the form on a stacked mobile
         * layout.
         *
         * It's a collapsible drawer at every width (see `introOpen` above),
         * just animated along a different axis depending on the layout:
         * below `lg` it's stacked above the form, so it collapses by
         * height (max-height, with the bottom handle below); at `lg` and up
         * it sits beside the form, so it collapses by width instead (with
         * the right-edge handle). Either way this animates a size — not
         * `hidden` — so the fields column reflows to fill the space and
         * stays centered/fills the viewport when it's closed, rather than
         * leaving a blank gap where the rail used to be. The inner div
         * keeps its natural size throughout so the animation reads as the
         * rail sliding out from under the fields column, not its text
         * reflowing and squishing. */}
        <aside
          className={`flex shrink-0 flex-col justify-between overflow-hidden border-b border-border bg-card px-6 sm:px-10 transition-[max-height,padding] duration-300 ease-out lg:order-2 lg:max-h-none lg:border-b-0 lg:py-10 lg:transition-[width,padding] lg:duration-300 lg:ease-out ${
            introOpen
              ? 'max-h-[36rem] py-7 lg:w-[24rem] lg:border-l lg:px-6 xl:w-[27rem] xl:px-10'
              : 'max-h-0 py-0 lg:w-0 lg:border-l-0 lg:px-0'
          }`}
        >
          <div className="lg:w-[21rem] xl:w-[24rem]">
            <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">New interview</h1>

            {targetedRole || targetedCompany ? (
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-xs text-accent">
                <Target className="h-3.5 w-3.5" />
                <span>Targeting</span>
                <strong>{targetedRole || role}</strong>
                {targetedCompany ? (
                  <span>
                    at <strong>{targetedCompany}</strong>
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 max-w-[42ch] font-editorial text-[15px] leading-relaxed text-muted-foreground">
                Tell the panel who you are and what you are aiming for.
              </p>
            )}

            <ol className="mt-8 flex flex-col gap-5">
              {RAIL_STEPS.map(({ n, t, d }) => (
                <li key={n} className="flex gap-3.5">
                  <span className="mt-0.5 text-[11px] font-semibold tabular-nums tracking-[0.14em] text-accent">
                    {n}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{t}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <p className="mt-8 text-[12px] leading-5 text-muted-foreground lg:w-[21rem] xl:w-[24rem]">
            You are talking to AI interviewers. Your answers are transcribed and analysed to build a practice assessment
            — nothing here is a real hiring decision.
          </p>
        </aside>

        {/* Fields. `overflow-y-auto` is a safety net for very short windows
         * only; at any normal height the grid below fits without scrolling.
         * `lg:order-1` (with the context rail below at `lg:order-2`) puts this
         * in the middle of the screen on desktop — flanked by the app sidebar
         * on the left and the context rail on the right — while leaving the
         * DOM/mobile order alone, where the rail's intro copy still reads
         * naturally before the fields instead of trailing after the submit
         * button. */}
        <div className="flex flex-1 flex-col px-6 py-7 pb-16 sm:px-10 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:py-10 lg:pb-10">
          <div className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col justify-center gap-5">
            {/* Two per row: the four short inputs used to be four full-width
             * rows, which is most of why this form needed scrolling at all. */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <label className={labelClass}>
                Your name
                <input
                  className={fieldClass}
                  value={candidateName}
                  onChange={(e) => {
                    setCandidateName(e.target.value)
                    clearFieldError('candidateName')
                  }}
                  placeholder="Your Name"
                  maxLength={120}
                  data-invalid={fieldErrors.candidateName ? 'true' : undefined}
                  aria-invalid={!!fieldErrors.candidateName}
                />
                <FieldError message={fieldErrors.candidateName} />
              </label>

              <label className={labelClass}>
                Target role
                <input
                  className={fieldClass}
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value)
                    clearFieldError('role')
                  }}
                  placeholder="Backend Engineer"
                  maxLength={120}
                  data-invalid={fieldErrors.role ? 'true' : undefined}
                  aria-invalid={!!fieldErrors.role}
                />
                <FieldError message={fieldErrors.role} />
              </label>

              <label className={labelClass}>
                <span>
                  Company <span className="font-normal normal-case tracking-normal opacity-70">— optional</span>
                </span>
                <input
                  className={fieldClass}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Inc."
                  maxLength={120}
                />
              </label>

              {/* Segmented rather than a <select>: four options, all worth
               * seeing at once, and one tap instead of open-scan-pick. */}
              <div className={labelClass}>
                Target duration
                <div className="flex gap-1.5 rounded-lg border border-border bg-background p-1">
                  {DURATIONS.map((minutes) => {
                    const active = durationMinutes === minutes
                    return (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() => setDurationMinutes(minutes)}
                        aria-pressed={active}
                        className={`flex-1 rounded-md py-1.5 text-[13px] font-medium tabular-nums transition-colors ${
                          active
                            ? 'bg-ink text-ink-foreground'
                            : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground'
                        }`}
                      >
                        {minutes}m
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <label className={labelClass}>
              Resume (PDF)
              <label
                htmlFor="interview-resume-input"
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3.5 transition-all ${
                  isDragging
                    ? 'border-primary bg-primary/[0.07]'
                    : resumeFile
                      ? 'border-success/40 bg-success/[0.05]'
                      : fieldErrors.resume
                        ? 'border-destructive/45 bg-destructive/[0.04]'
                        : 'border-border bg-background hover:border-primary/50 hover:bg-primary/[0.03]'
                }`}
              >
                <input
                  id="interview-resume-input"
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  data-invalid={fieldErrors.resume ? 'true' : undefined}
                />
                {resumeFile ? (
                  <>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
                      <Check className="h-4 w-4" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-medium normal-case tracking-normal text-foreground">
                        {resumeFile.name}
                      </span>
                      <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                        {(resumeFile.size / 1024 / 1024).toFixed(1)} MB · ready
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        pickFile(null)
                      }}
                      className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-normal normal-case tracking-normal text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-muted-foreground">
                      <Upload className="h-4 w-4" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-[13px] font-medium normal-case tracking-normal text-foreground">
                        Drop your resume, or click to browse
                      </span>
                      <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                        PDF only, up to 8MB
                      </span>
                    </span>
                  </>
                )}
              </label>
              <FieldError message={fieldErrors.resume} />
            </label>

            <label className={labelClass}>
              A little about you or Job Description
              <textarea
                className={`${fieldClass} resize-none`}
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  clearFieldError('description')
                }}
                placeholder="A couple of sentences on your background and what you're looking for…"
                maxLength={2000}
                data-invalid={fieldErrors.description ? 'true' : undefined}
                aria-invalid={!!fieldErrors.description}
              />
              <FieldError message={fieldErrors.description} />
            </label>

            {formError || error ? (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-xs text-destructive"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {formError || error}
              </p>
            ) : null}

            <Button type="submit" disabled={busy} className="h-11 w-full">
              {isPreparing ? (
                <>
                  <LoadingDots />
                  Reading your resume…
                </>
              ) : isLoading ? (
                <>
                  <LoadingDots />
                  Assembling the panel…
                </>
              ) : (
                'Start interview'
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Drag- or click-to-open handle for the context-rail drawer above,
       * right-edge/horizontal at desktop widths. Fixed to the true edge of
       * the viewport (a sibling of the form, not nested in it — see the
       * note above) so it stays reachable whether the rail is open or
       * closed. Sized and labelled to actually read as a tab to grab, not
       * a stray sliver at the edge of the screen. Desktop only: below `lg`
       * the rail collapses by height instead, with the bottom handle below
       * this one. */}
      <button
        type="button"
        aria-expanded={introOpen}
        aria-label={introOpen ? 'Hide the new interview guide' : 'Show the new interview guide'}
        onPointerDown={handleDesktopHandlePointerDown}
        onPointerMove={handleDesktopHandlePointerMove}
        onPointerUp={endPanelHandleDrag}
        onPointerCancel={endPanelHandleDrag}
        onClick={handlePanelHandleClick}
        className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 cursor-grab touch-none select-none flex-col items-center gap-2 rounded-l-xl border border-primary/30 bg-primary/12 px-2 py-4 text-accent shadow-panel transition-colors hover:bg-primary/20 active:cursor-grabbing lg:flex"
      >
        <GripHorizontal className="h-4 w-4 rotate-90" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] [writing-mode:vertical-rl]">Guide</span>
        <ChevronRight className={`h-4 w-4 transition-transform ${introOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Same drawer, same handle — bottom-edge/vertical below `lg`, where
       * the rail is stacked above the form instead of beside it. Drag (or
       * tap) up to open, down to close, mirroring the desktop handle's
       * "pull toward the content" direction. */}
      <button
        type="button"
        aria-expanded={introOpen}
        aria-label={introOpen ? 'Hide the new interview guide' : 'Show the new interview guide'}
        onPointerDown={handleMobileHandlePointerDown}
        onPointerMove={handleMobileHandlePointerMove}
        onPointerUp={endPanelHandleDrag}
        onPointerCancel={endPanelHandleDrag}
        onClick={handlePanelHandleClick}
        className="fixed bottom-0 left-1/2 z-40 flex -translate-x-1/2 cursor-grab touch-none select-none flex-row items-center gap-2 rounded-t-xl border border-b-0 border-primary/30 bg-primary/12 px-4 py-1.5 text-accent shadow-panel transition-colors hover:bg-primary/20 active:cursor-grabbing lg:hidden"
      >
        <ChevronRight className={`h-4 w-4 transition-transform ${introOpen ? 'rotate-90' : '-rotate-90'}`} />
        <GripHorizontal className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Guide</span>
      </button>
    </>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-normal normal-case tracking-normal text-destructive">
      <AlertCircle className="h-3 w-3 shrink-0" />
      {message}
    </span>
  )
}
