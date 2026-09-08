'use client'

import { AssessmentBreakdown } from '@/components/AssessmentBreakdown'
import { Button } from '@/components/ui/button'
import type { Assessment } from '@/types/conversation'

type AssessmentResultsProps = {
  isLoading: boolean
  error: string | null
  assessment: Assessment | null
  onStartNewInterview: () => void
}

export function AssessmentResults({ isLoading, error, assessment, onStartNewInterview }: AssessmentResultsProps) {
  return (
    // Data-dense screen — score ring, per-competency bars, a donut, a
    // legend, and a full write-up per competency all need real width to
    // breathe. Matches the "wide" page convention used elsewhere (max-w-6xl)
    // rather than the ~52rem this used to cap at, which read as a narrow
    // column with huge dead space on either side on anything wider than a
    // laptop screen.
    <div className="mx-auto flex w-[min(94vw,72rem)] animate-fade-up flex-col gap-6 py-10 text-left">
      <div className="text-center">
        <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">Panel assessment</h1>
        <p className="mx-auto mt-2 max-w-[52ch] font-editorial text-[15px] leading-relaxed text-muted-foreground">
          Practice feedback, scored on evidence from what you actually said. Not a hiring decision.
        </p>
      </div>

      {isLoading ? (
        <AssessmentSkeleton />
      ) : error ? (
        <p className="mx-auto rounded-lg border border-destructive/30 bg-destructive/[0.07] px-4 py-2.5 text-center text-sm text-destructive">
          {error}
        </p>
      ) : assessment ? (
        <AssessmentBreakdown assessment={assessment} />
      ) : null}

      <Button onClick={onStartNewInterview} className="mx-auto mt-2">
        Start a new interview
      </Button>
    </div>
  )
}

/** Mirrors AssessmentBreakdown's real layout — score ring, competency bars,
 * donut, legend, then per-competency write-ups — so the screen the panel is
 * about to fill in is legible as "your results are almost here" rather than
 * a spinner with no shape to it. */
function AssessmentSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface/70 px-8 py-6">
          <div className="skeleton h-24 w-24 rounded-full" />
          <div className="skeleton h-3 w-14 rounded" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="skeleton h-3 w-36 rounded" />
          <div className="mt-4 flex flex-col gap-3">
            {['a', 'b', 'c', 'd', 'e'].map((key) => (
              <div key={key} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="skeleton h-3 w-24 rounded" />
                  <div className="skeleton h-3 w-6 rounded" />
                </div>
                <div className="skeleton h-2.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="skeleton h-32 w-32 rounded-full" />
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {['a', 'b', 'c', 'd'].map((key) => (
              <div key={key} className="skeleton h-4 w-full rounded" />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {['a', 'b'].map((key) => (
          <div key={key} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="skeleton h-3.5 w-32 rounded" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-4/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
