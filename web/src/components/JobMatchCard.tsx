'use client'

import { Briefcase, Check, ExternalLink, Info, Mic, Sparkles, TrendingUp, X } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { buildPracticeInterviewHref } from '@/lib/jobPractice'
import { scoreColor } from '@/lib/scoreColor'
import type { MatchedJob } from '@/types/resume'

interface JobMatchCardProps {
  job: MatchedJob
  onOpenDetails: (job: MatchedJob) => void
}

function formatSalary(min?: number, max?: number, interval?: string): string {
  if (!min && !max) return ''
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const formatted = []
  if (min) formatted.push(formatter.format(min))
  if (max) formatted.push(formatter.format(max))
  const range = formatted.join(' - ')
  const period = interval === 'hourly' ? '/hr' : ''
  return `${range}${period}`
}

export function JobMatchCard({ job, onOpenDetails }: JobMatchCardProps) {
  const router = useRouter()
  const match = job.match
  // No fallback number: a job whose match request never came back (see
  // OpportunitiesPage's own note on that call degrading independently of the
  // listing fetch) has no fit score, and showing an invented "75% Strong Fit"
  // in its place would tell the candidate something was actually analysed
  // when it wasn't.
  const score = match?.overall_match ?? null
  const badgeColor = score === null ? '#6b7280' /* neutral, no score to color */ : scoreColor(score / 10)
  const [isPreparingPractice, setIsPreparingPractice] = useState(false)

  const handlePracticeInterview = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPreparingPractice) return
    setIsPreparingPractice(true)
    try {
      const href = await buildPracticeInterviewHref(job)
      router.push(href)
    } finally {
      // Only relevant if the push above didn't unmount this card (e.g. the
      // route change is still in flight) — otherwise this is a no-op on an
      // unmounted component, which React tolerates for a plain state setter.
      setIsPreparingPractice(false)
    }
  }

  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_interval)

  return (
    // Not a <button>: the card contains its own buttons and links, and
    // nesting interactive elements inside a button is invalid HTML. This is
    // the standard alternative — an explicit button role, keyboard focus, and
    // Enter/Space activation, so it behaves like one for keyboard and screen
    // reader users instead of being mouse-only.
    // biome-ignore lint/a11y/useSemanticElements: a real <button> cannot wrap this — the card contains its own action buttons, and nesting interactive elements inside a button is invalid HTML.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(job)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetails(job)
        }
      }}
      className="group relative flex cursor-pointer flex-col justify-between rounded-xl border border-border bg-card p-5 text-left transition-all duration-300 hover:border-primary/50 hover:bg-card/90 hover:shadow-xl hover:shadow-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {/* Top Header: Title, Company, Match Badge */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                {job.site || 'LinkedIn'}
              </span>
              {job.job_type && (
                <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] text-muted-foreground capitalize">
                  {job.job_type}
                </span>
              )}
              {job.is_remote && (
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">Remote</span>
              )}
            </div>

            <h3 className="mt-1.5 truncate text-base font-bold text-foreground group-hover:text-accent transition-colors">
              {job.title}
            </h3>
            <p className="truncate text-xs font-medium text-muted-foreground">
              {job.company} · 📍 {job.location || 'Location not specified'}
            </p>
          </div>

          {/* AI Match Score Badge */}
          <div
            className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-center"
            style={{ backgroundColor: `${badgeColor}15` }}
          >
            <div className="flex items-center gap-1 font-black text-sm" style={{ color: badgeColor }}>
              <Sparkles className="h-3 w-3" />
              <span>{score === null ? '—' : `${score}%`}</span>
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {score === null
                ? 'Not scored yet'
                : score >= 85
                  ? 'Excellent Fit'
                  : score >= 70
                    ? 'Strong Fit'
                    : 'Good Fit'}
            </span>
          </div>
        </div>

        {/* Match Progress Bar — omitted entirely when there is no real score
            to show; a bar at some arbitrary width would read as a measurement */}
        {score !== null ? (
          <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${score}%`, backgroundColor: badgeColor }}
            />
          </div>
        ) : null}

        {/* Strengths & Missing Skills chips */}
        <div className="mt-4 space-y-2">
          {match?.strengths && match.strengths.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground mr-1">Strengths:</span>
              {match.strengths.slice(0, 3).map((st) => (
                <span
                  key={st}
                  className="inline-flex items-center gap-1 rounded-md bg-success/10 border border-success/25 px-2 py-0.5 text-[10px] font-medium text-success"
                >
                  <Check className="h-2.5 w-2.5 text-success" />
                  {st}
                </span>
              ))}
            </div>
          )}

          {match?.missing_skills && match.missing_skills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground mr-1">Gaps:</span>
              {match.missing_skills.slice(0, 2).map((ms) => (
                <span
                  key={ms}
                  className="inline-flex items-center gap-1 rounded-md bg-warning/10 border border-warning/25 px-2 py-0.5 text-[10px] font-medium text-warning"
                >
                  <X className="h-2.5 w-2.5 text-warning" />
                  {ms}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Recommendation Snippet */}
        {match?.recommendation && (
          <p className="mt-3 line-clamp-2 text-xs text-muted-foreground italic leading-relaxed">
            "{match.recommendation}"
          </p>
        )}
      </div>

      {/* Card Footer: Metadata and Action Buttons */}
      <div className="mt-5 border-t border-border pt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {salary && <span className="font-semibold text-success">💰 {salary}</span>}
          {match?.interview_probability && (
            <span className="flex items-center gap-1 text-[11px] text-success">
              <TrendingUp className="h-3 w-3" /> {match.interview_probability}% shortlisted odds
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetails(job)
            }}
            className="h-8 border-border bg-surface px-2.5 text-[11px] font-medium text-foreground hover:bg-surface-elevated hover:text-foreground"
          >
            <Info className="h-3.5 w-3.5 mr-1" />
            Intelligence
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handlePracticeInterview}
            disabled={isPreparingPractice}
            className="h-8 gap-1.5 bg-primary px-3 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/10"
          >
            {isPreparingPractice ? (
              <>
                <LoadingDots />
                Reading posting…
              </>
            ) : (
              <>
                <Mic className="h-3 w-3" />
                Practice
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
