'use client'

import { AlertTriangle, CheckCircle2, ChevronRight, GripHorizontal, RotateCcw, Upload, X } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import { useEffect, useRef, useState } from 'react'

import { ScoreRing } from '@/components/AssessmentCharts'
import { FlowChart } from '@/components/FlowChart'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageContainer, SectionTitle } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { IMPLAUSIBLE_ROLE_MESSAGE, isPlausibleRoleInput } from '@/lib/inputGuards'
import { hasSeenIntroPanel, markIntroPanelSeen } from '@/lib/introPanel'
import { preloadAllPanelAvatars } from '@/lib/preloadPanelAvatars'
import { saveResumeAnalysis } from '@/lib/resumeAnalysisCache'
import { scoreColor } from '@/lib/scoreColor'
import { analyzeResume } from '@/services/api'
import type { ResumeAnalysis } from '@/types/resume'

const MAX_FILE_BYTES = 8 * 1024 * 1024

/** What the analysis actually returns, shown beside the upload rather than
 * after it — the reason to hand over a resume is the one thing that makes
 * the upload worth doing. Mirrors the ResumeAnalysis shape in types/resume. */
const WHAT_YOU_GET = [
  {
    n: '01',
    t: 'A verdict on the role you named',
    d: 'Strong, moderate, or weak — with a fit score and the reasoning behind the call.',
  },
  {
    n: '02',
    t: 'The strengths carrying it, and the gaps',
    d: 'Pulled from your actual experience, not a keyword match against the title.',
  },
  {
    n: '03',
    t: 'Roles that suit you better',
    d: 'Ranked by how well they match — including ones you had not considered.',
  },
]

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10'

function verdictStyle(verdict: ResumeAnalysis['target_role_fit']['verdict']) {
  if (verdict === 'strong') return { color: 'text-success', border: 'border-success/30', bg: 'bg-success/[0.07]' }
  if (verdict === 'moderate') return { color: 'text-warning', border: 'border-warning/30', bg: 'bg-warning/[0.07]' }
  return { color: 'text-destructive', border: 'border-destructive/30', bg: 'bg-destructive/[0.07]' }
}

export function ResumeAnalyzerPage() {
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [targetRole, setTargetRole] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ResumeAnalysis | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Interviews grounded in a resume analysis almost always follow this page,
  // and the panel's three .glb models are several MB combined — start that
  // download now, in the background, while the candidate is still filling
  // in the form or waiting on the analysis, so it's already warm in cache
  // well before they ever reach the live call.
  useEffect(() => {
    preloadAllPanelAvatars()
  }, [])

  // The context rail (see the aside below — a drawer at every width, same
  // pattern as the interview setup form's) auto-opens the very first time
  // a candidate reaches this page and stays collapsed after that, so a
  // returning candidate isn't shown the same "what you get" explainer on
  // every visit. Starts closed rather than open-then-collapse: that way a
  // returning candidate — the common case — never sees it flash open at
  // all, and only a genuine first-timer sees the one-time open.
  const [introOpen, setIntroOpen] = useState(false)
  const [introDragPx, setIntroDragPx] = useState(0)
  const introDragState = useRef<{ start: number; wasOpen: boolean } | null>(null)

  useEffect(() => {
    if (!user?.id) return
    if (!hasSeenIntroPanel(user.id, 'resumeAnalysis')) {
      setIntroOpen(true)
      markIntroPanelSeen(user.id, 'resumeAnalysis')
    }
  }, [user?.id])

  // Same generic drag handling as the setup form's rail (see the longer
  // note there): the rail sits on the RIGHT here too, so the desktop
  // handle drags left-to-open (decreasing clientX) and the mobile handle
  // drags up-to-open (decreasing clientY, pre-negated below).
  const beginPanelHandleDrag = (coord: number) => {
    introDragState.current = { start: coord, wasOpen: introOpen }
    setIntroDragPx(0)
  }

  const movePanelHandleDrag = (coord: number) => {
    if (!introDragState.current) return
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
    if (event.detail !== 0) return
    setIntroOpen((prev) => !prev)
  }

  const pickFile = (next: File | null) => {
    setError(null)
    if (!next) {
      setFile(null)
      return
    }
    if (next.type !== 'application/pdf') {
      setError('Only PDF resumes are supported.')
      return
    }
    if (next.size > MAX_FILE_BYTES) {
      setError('That file is larger than 8MB — please upload a smaller PDF.')
      return
    }
    setFile(next)
  }

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    pickFile(event.dataTransfer.files?.[0] ?? null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file || !targetRole.trim() || isLoading) return

    if (!isPlausibleRoleInput(targetRole)) {
      setError(IMPLAUSIBLE_ROLE_MESSAGE)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const analysis = await analyzeResume(file, targetRole.trim())
      if (analysis.error) {
        setError(analysis.error_message || 'Could not analyze this resume. Please try again.')
        setResult(null)
      } else {
        setResult(analysis)
        if (user?.id) saveResumeAnalysis(user.id, analysis)
      }
    } catch (err) {
      console.error('Resume analysis failed:', err)
      setError('Could not analyze this resume. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setTargetRole('')
    setResult(null)
    setError(null)
  }

  if (result) {
    const fitStyle = verdictStyle(result.target_role_fit.verdict)
    return (
      <PageContainer width="narrow" className="animate-fade-up">
        <header className="border-b border-border pb-5 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Get hired</span>
          <h1 className="mt-1.5 text-[1.75rem] font-bold tracking-tight text-foreground sm:text-[2rem]">
            Resume analysis
          </h1>
          <p className="mx-auto mt-2 max-w-[52ch] font-editorial text-[15px] leading-relaxed text-muted-foreground">
            How your resume reads against <span className="font-semibold text-foreground">{result.target_role}</span>,
            and the roles where you would stand out more.
          </p>
        </header>

        <Card className="p-5">
          <SectionTitle>Summary</SectionTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground">{result.candidate_summary}</p>
          {result.experience_years_estimate !== null ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Estimated experience: {result.experience_years_estimate} year
              {result.experience_years_estimate === 1 ? '' : 's'}
            </p>
          ) : null}
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
          <Card className="flex flex-col items-center justify-center gap-2 px-8 py-6">
            <ScoreRing score={result.target_role_fit.score} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Target role fit
            </span>
          </Card>

          <div className={`flex flex-col justify-center gap-2 rounded-xl border p-5 ${fitStyle.border} ${fitStyle.bg}`}>
            <div className="flex items-center gap-2">
              {result.target_role_fit.verdict === 'strong' ? (
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${fitStyle.color}`} />
              ) : (
                <AlertTriangle className={`h-4 w-4 shrink-0 ${fitStyle.color}`} />
              )}
              <span className={`text-sm font-bold uppercase tracking-[0.1em] ${fitStyle.color}`}>
                {result.target_role_fit.verdict} fit
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{result.target_role_fit.reasoning}</p>
          </div>
        </div>

        {result.top_skills.length > 0 ? (
          <Card className="p-5">
            <SectionTitle>Top skills</SectionTitle>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.top_skills.map((skill) => (
                <Badge key={skill} tone="neutral" className="bg-background px-2.5 py-1">
                  {skill}
                </Badge>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {result.strengths.length > 0 ? (
            <Card className="border-success/25 bg-success/[0.05] p-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-success">Strengths</span>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {result.strengths.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {result.gaps.length > 0 ? (
            <Card className="border-warning/25 bg-warning/[0.05] p-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-warning">Gaps to close</span>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {result.gaps.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {result.best_suitable_roles.length > 0 ? (
          <Card className="p-5">
            <SectionTitle>Where you fit best, ranked by what the resume actually shows</SectionTitle>
            <div className="mt-4 flex flex-col gap-4">
              {result.best_suitable_roles.map((role) => (
                <div key={role.role} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-foreground">{role.role}</span>
                    <span className="font-bold" style={{ color: scoreColor(role.match_score / 10) }}>
                      {role.match_score}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${role.match_score}%`, background: scoreColor(role.match_score / 10) }}
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{role.reasoning}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {result.flow.nodes.length > 0 ? (
          <Card className="p-5">
            <SectionTitle>How the analysis got there</SectionTitle>
            <div className="mt-3">
              <FlowChart nodes={result.flow.nodes} edges={result.flow.edges} />
            </div>
          </Card>
        ) : null}

        <Button onClick={handleReset} variant="outline" className="mx-auto mt-2">
          <RotateCcw className="h-4 w-4" />
          Analyze another resume
        </Button>
      </PageContainer>
    )
  }

  return (
    // A Fragment, not just the outer div: the drag handles below are
    // `fixed` to the viewport, but the div has `animate-fade-up`, whose
    // final keyframe leaves `transform: translateY(0)` set — a non-`none`
    // transform makes an element the containing block for `position:
    // fixed` descendants, so a handle nested inside it would silently stop
    // being viewport-fixed (same trap noted on the setup form's handle).
    <>
      <div className="flex min-h-full w-full animate-fade-up flex-col text-left lg:h-full lg:min-h-0 lg:flex-row">
        {/* Fields column. `lg:order-1` (with the context rail below at
         * `lg:order-2`) puts this in the middle of the screen on desktop —
         * flanked by the app sidebar on the left and the rail on the right
         * — while leaving the DOM/mobile order alone, where the rail's "what
         * you get" copy still reads naturally before the form. */}
        <div className="flex flex-1 flex-col px-6 py-8 pb-16 sm:px-10 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:py-10 lg:pb-10">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex w-full max-w-[38rem] flex-1 flex-col justify-center gap-5"
          >
            {/* A <label> wrapping the file input is natively clickable AND
                keyboard-focusable/activatable (Enter/Space) — no manual
                onClick + role/tabIndex plumbing needed for a11y. */}
            <label
              htmlFor="resume-file-input"
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all ${
                isDragging
                  ? 'border-primary bg-primary/[0.07]'
                  : file
                    ? 'border-success/40 bg-success/[0.05]'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-primary/[0.03]'
              }`}
            >
              <input
                id="resume-file-input"
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <>
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/15 text-success">
                    <CheckCircle2 weight="fill" className="h-6 w-6" />
                  </span>
                  <span className="max-w-full truncate text-[15px] font-medium text-foreground">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)} MB · ready
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      pickFile(null)
                    }}
                    className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/[0.06] text-muted-foreground">
                    <Upload className="h-6 w-6" />
                  </span>
                  <span className="text-[15px] font-medium text-foreground">
                    Drop your resume here, or click to browse
                  </span>
                  <span className="text-xs text-muted-foreground">PDF only, up to 8MB</span>
                </>
              )}
            </label>

            <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              What role are you targeting?
              <input
                className={fieldClass}
                placeholder="e.g. Senior Backend Engineer"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                required
              />
            </label>

            {error ? (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-xs text-destructive"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={!file || !targetRole.trim() || isLoading} className="h-12">
              {isLoading ? (
                <>
                  <LoadingDots />
                  Reading your resume…
                </>
              ) : (
                'Analyze resume'
              )}
            </Button>
          </form>
        </div>

        {/* Context rail. Collapsible drawer, same pattern as the setup
         * form's: below `lg` it collapses by max-height (bottom handle),
         * at `lg` and up by width (right-edge handle) — either way this
         * animates a size rather than using `hidden`, so the fields column
         * actually gets to fill and center in the freed-up space when it's
         * closed. */}
        <aside
          className={`flex shrink-0 flex-col justify-between overflow-hidden border-b border-border bg-card px-6 sm:px-10 transition-[max-height,padding] duration-300 ease-out lg:order-2 lg:max-h-none lg:border-b-0 lg:py-10 lg:transition-[width,padding] lg:duration-300 lg:ease-out ${
            introOpen
              ? 'max-h-[42rem] py-8 lg:w-[25rem] lg:border-r-0 lg:border-l lg:px-6 xl:w-[28rem] xl:px-10'
              : 'max-h-0 py-0 lg:w-0 lg:border-l-0 lg:px-0'
          }`}
        >
          <div className="lg:w-[22rem] xl:w-[25rem]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Get hired</span>
            <h1 className="mt-2 text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">
              Resume analysis
            </h1>
            <p className="mt-3 max-w-[42ch] font-editorial text-[15px] leading-relaxed text-muted-foreground">
              Upload your resume, name the role you are chasing, and get an honest read on where you actually fit.
            </p>

            <ol className="mt-9 flex flex-col gap-6">
              {WHAT_YOU_GET.map(({ n, t, d }) => (
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

          <p className="mt-9 text-[12px] leading-5 text-muted-foreground">
            Your resume is read once to produce this analysis. It is not stored as a file, and nothing here is shared
            with an employer.
          </p>
        </aside>
      </div>

      {/* Right-edge/horizontal handle for the drawer above, at desktop
       * widths. Fixed to the true edge of the viewport (a sibling of the
       * animated div, not nested in it — see the note above) so it stays
       * reachable whether the rail is open or closed. */}
      <button
        type="button"
        aria-expanded={introOpen}
        aria-label={introOpen ? 'Hide the resume analysis guide' : 'Show the resume analysis guide'}
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

      {/* Same drawer, bottom-edge/vertical below `lg`, where the rail sits
       * above the form instead of beside it. Drag (or tap) up to open,
       * down to close. */}
      <button
        type="button"
        aria-expanded={introOpen}
        aria-label={introOpen ? 'Hide the resume analysis guide' : 'Show the resume analysis guide'}
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
