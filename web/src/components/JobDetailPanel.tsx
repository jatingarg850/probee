'use client'

import {
  AlertCircle,
  Award,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Flame,
  GraduationCap,
  Lightbulb,
  Mic,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
  Wrench,
  X,
  XCircle,
} from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { buildPracticeInterviewHref } from '@/lib/jobPractice'
import { scoreColor } from '@/lib/scoreColor'
import type { MatchedJob } from '@/types/resume'

interface JobDetailPanelProps {
  job: MatchedJob
  onClose: () => void
}

export function JobDetailPanel({ job, onClose }: JobDetailPanelProps) {
  const router = useRouter()
  const match = job.match
  const companyInsights = match?.company_insights
  const [isPreparingPractice, setIsPreparingPractice] = useState(false)

  const handleStartPractice = async () => {
    if (isPreparingPractice) return
    setIsPreparingPractice(true)
    try {
      const href = await buildPracticeInterviewHref(job)
      router.push(href)
    } finally {
      setIsPreparingPractice(false)
    }
  }

  // No fallback numbers: this panel used to show a fabricated "75% Strong
  // Candidate" and a full 6-dimension breakdown of invented scores whenever
  // the match request hadn't come back (it degrades independently of the
  // listing fetch — see OpportunitiesPage). Every score below is `null`,
  // not a guess, when there is genuinely nothing to show.
  const hasMatch = match != null
  const overallScore = match?.overall_match ?? null
  const overallColor = overallScore === null ? '#6b7280' : scoreColor(overallScore / 10)

  const dimensions = match
    ? [
        { label: 'Skills Match', weight: '35%', score: match.skill_match, icon: Wrench },
        { label: 'Experience Match', weight: '20%', score: match.experience_match, icon: Award },
        { label: 'Project Relevance', weight: '15%', score: match.project_match, icon: BookOpen },
        { label: 'Tech Stack', weight: '10%', score: match.tech_stack_match, icon: Flame },
        { label: 'Education Match', weight: '10%', score: match.education_match, icon: GraduationCap },
        { label: 'Soft Skills', weight: '10%', score: match.soft_skill_match, icon: ShieldCheck },
      ]
    : []

  // Escape closes the dialog. Previously the only way out was a mouse click
  // on the backdrop or the close button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    // Closing on a backdrop click is checked with `e.target === e.currentTarget`
    // rather than by stopping propagation on the dialog itself — the old
    // version needed an onClick on the panel purely to swallow the event,
    // which made a non-interactive container look interactive.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard equivalent is Escape, handled in the effect above, and the dialog also has a visible close button.
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-foreground/45 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: <dialog> would need showModal() imperatively and brings its own backdrop and focus behaviour; this panel is rendered conditionally by its parent and already sets role, aria-modal and a label. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${job.title} at ${job.company}`}
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border bg-surface p-6">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary">
                {job.site || 'LinkedIn'}
              </span>
              {job.job_type && (
                <span className="rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs text-muted-foreground capitalize">
                  {job.job_type}
                </span>
              )}
              {job.is_remote && (
                <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs text-success">Remote</span>
              )}
            </div>
            <h2 className="mt-2 text-xl font-bold text-foreground">{job.title}</h2>
            <p className="text-sm text-muted-foreground">
              {job.company} · 📍 {job.location || 'Location not specified'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6 text-left">
          {/* Main Match Overview Card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-20 w-20 flex-col items-center justify-center rounded-2xl border border-white/10"
                  style={{ backgroundColor: `${overallColor}15` }}
                >
                  <span className="text-2xl font-black" style={{ color: overallColor }}>
                    {overallScore === null ? '—' : `${overallScore}%`}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Match
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-foreground">
                      {overallScore === null
                        ? 'Not scored yet'
                        : overallScore >= 85
                          ? '★★★★★ Excellent Fit'
                          : overallScore >= 70
                            ? '★★★★☆ Strong Candidate'
                            : '★★★☆☆ Moderate Match'}
                    </span>
                    {match?.difficulty && (
                      <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] text-warning">
                        {match.difficulty}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                    {match?.recommendation || 'Evaluated against your resume skills, experience, and projects.'}
                  </p>
                </div>
              </div>

              {match?.interview_probability && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-4 py-3 text-center sm:w-36">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <TrendingUp className="h-3 w-3 text-primary" /> Shortlist Odds
                  </span>
                  <span className="mt-0.5 text-lg font-bold text-success">{match.interview_probability}%</span>
                  <span className="text-[9px] text-muted-foreground">Estimated chance</span>
                </div>
              )}
            </div>

            {/* 6-Dimension Breakdown */}
            <div className="mt-6 border-t border-border pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Match Dimensions Breakdown
              </span>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {dimensions.map((dim) => {
                  const Icon = dim.icon
                  const dimColor = scoreColor(dim.score / 10)
                  return (
                    <div key={dim.label} className="rounded-lg border border-border bg-surface p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          {dim.label}
                          <span className="text-[10px] text-muted-foreground font-normal">({dim.weight})</span>
                        </span>
                        <span className="font-semibold" style={{ color: dimColor }}>
                          {dim.score}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${dim.score}%`, backgroundColor: dimColor }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Strengths & Missing Skills Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Strengths */}
            <div className="rounded-xl border border-success/25 bg-success/[0.07] p-4">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-success">
                <CheckCircle2 className="h-4 w-4" /> Why You Stand Out ({match?.strengths?.length || 0})
              </span>
              <ul className="mt-3 space-y-1.5">
                {match?.strengths && match.strengths.length > 0 ? (
                  match.strengths.map((s) => (
                    <li key={s} className="flex items-start gap-2 text-xs text-success">
                      <span className="mt-0.5 text-success">✓</span>
                      <span>{s}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-muted-foreground">General background aligns with requirements.</li>
                )}
              </ul>
            </div>

            {/* Missing Skills */}
            <div className="rounded-xl border border-warning/25 bg-warning/[0.07] p-4">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-warning">
                <XCircle className="h-4 w-4" /> Missing / Gaps ({match?.missing_skills?.length || 0})
              </span>
              <ul className="mt-3 space-y-1.5">
                {match?.missing_skills && match.missing_skills.length > 0 ? (
                  match.missing_skills.map((m) => (
                    <li key={m} className="flex items-start gap-2 text-xs text-warning">
                      <span className="mt-0.5 text-warning">✗</span>
                      <span>{m}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-muted-foreground">No significant skill gaps identified.</li>
                )}
              </ul>
            </div>
          </div>

          {/* Company Insights */}
          {companyInsights && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Building2 className="h-4 w-4" /> Company Insights · {job.company}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Interview Difficulty:</span>
                  <div className="flex text-warning">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-3.5 w-3.5 ${
                          star <= (companyInsights.difficulty || 3)
                            ? 'fill-warning text-warning'
                            : 'text-muted-foreground/40'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Size & Pattern */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>
                      Company Size: <strong className="text-foreground">{companyInsights.size_estimate}</strong>
                    </span>
                  </div>

                  {companyInsights.interview_pattern && companyInsights.interview_pattern.length > 0 && (
                    <div>
                      <span className="text-[11px] font-medium text-muted-foreground">Typical Interview Stages:</span>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {companyInsights.interview_pattern.map((step, idx) => (
                          <React.Fragment key={step}>
                            <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground">
                              {step}
                            </span>
                            {idx < companyInsights.interview_pattern.length - 1 && (
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Commonly Asked Topics */}
                {companyInsights.commonly_asked && companyInsights.commonly_asked.length > 0 && (
                  <div>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      High-Frequency Interview Topics:
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {companyInsights.commonly_asked.map((topic, idx) => (
                        <span
                          key={topic}
                          className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] text-primary"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actionable Suggestions */}
          {match?.suggestions && match.suggestions.length > 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                <Lightbulb className="h-4 w-4" /> AI Action Plan Before Applying
              </span>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {match.suggestions.map((suggestion) => (
                  <div
                    key={suggestion}
                    className="flex items-start gap-2 rounded-lg border border-border bg-surface p-2.5 text-xs text-foreground"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{suggestion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resume Improvements */}
          {match?.resume_improvements && match.resume_improvements.length > 0 && (
            <div className="rounded-xl border border-border bg-surface/70 p-4">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 text-warning" /> Resume Tweaks for This Role
              </span>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc list-inside">
                {match.resume_improvements.map((imp) => (
                  <li key={imp}>{imp}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Full Job Description */}
          {job.description && (
            <div className="rounded-xl border border-border bg-surface/70 p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Job Description
              </span>
              <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line rounded-lg border border-border bg-surface p-3 text-xs leading-relaxed text-muted-foreground">
                {job.description}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface p-4 sm:px-6">
          {job.job_url ? (
            <a
              href={job.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition"
            >
              Apply on LinkedIn <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="h-9 border-border bg-surface text-xs font-medium text-foreground hover:bg-surface-elevated"
            >
              Close
            </Button>
            <Button
              onClick={handleStartPractice}
              disabled={isPreparingPractice}
              className="h-9 gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
            >
              {isPreparingPractice ? (
                <>
                  <LoadingDots />
                  Reading the posting…
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" />
                  Practice interview for this job
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
