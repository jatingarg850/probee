'use client'

import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from '@/components/ui/icons'

import {
  CompetencyBars,
  CompetencyDonut,
  DecisionTimelineChart,
  EvidenceCompositionBar,
  PercentRing,
  ScoreRing,
} from '@/components/AssessmentCharts'
import { competencyColor, scoreColor } from '@/lib/scoreColor'
import type { Assessment, EvidenceItem } from '@/types/conversation'

function confidenceColor(confidence: string) {
  if (confidence === 'high') return 'text-success'
  if (confidence === 'medium') return 'text-warning'
  return 'text-muted-foreground'
}

function evidenceStrengthStyle(strength: EvidenceItem['strength']) {
  if (strength === 'strong') return { color: scoreColor(10), label: 'Strong' }
  if (strength === 'weak') return { color: scoreColor(5), label: 'Weak' }
  return { color: scoreColor(0), label: 'Missing' }
}

/** One number + label + icon, for the "adaptive intelligence" grid. Plain
 * count, not a chart — the fact that these are whole numbers pulled
 * straight from what the panel did is the point, no decoration needed. */
function StatTile({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: number
  label: string
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3.5">
      <Icon className="h-4 w-4 text-accent" />
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
    </div>
  )
}

/** The full graphical breakdown of a panel assessment — score ring,
 * per-competency bars/donut, strengths/weaknesses, role fit, panel
 * disagreement, and contradictions. Shared between the live post-call
 * results screen (AssessmentResults) and the historical session detail on
 * the dashboard, so a session looks the same whether you're seeing it right
 * after the call or pulling it up later. */
export function AssessmentBreakdown({ assessment }: { assessment: Assessment }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface/70 px-8 py-6">
          <ScoreRing score={assessment.overall_score} />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Overall</span>
        </div>

        {assessment.competencies.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Scores by competency
            </span>
            <div className="mt-3">
              <CompetencyBars competencies={assessment.competencies} />
            </div>
          </div>
        ) : null}
      </div>

      {assessment.error ? (
        <p className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
          {assessment.recommendation}
        </p>
      ) : null}

      {assessment.competencies.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Score composition</span>
            <CompetencyDonut
              competencies={assessment.competencies}
              colors={assessment.competencies.map((_, i) => competencyColor(i))}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Legend</span>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {assessment.competencies.map((c, i) => (
                <div key={c.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: competencyColor(i) }} />
                  <span className="text-foreground">{c.name}</span>
                  <span className="ml-auto text-muted-foreground">{c.score.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {assessment.competencies.length > 0 ? (
        <div className="flex flex-col gap-4">
          {assessment.competencies.map((competency) => (
            <div key={competency.name} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: scoreColor(competency.score) }} />
                  {competency.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {competency.score.toFixed(1)} / 10 ·{' '}
                  <span className={confidenceColor(competency.confidence)}>{competency.confidence} confidence</span>
                </span>
              </div>
              {competency.strengths.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-xs text-success">
                  {competency.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {competency.weaknesses.length > 0 ? (
                <ul className="mt-1 list-inside list-disc text-xs text-warning">
                  {competency.weaknesses.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {competency.evidence.length > 0 ? (
                <p className="mt-2 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
                  {competency.evidence.join(' · ')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {assessment.role_fit ? (
        <div
          className={`flex flex-col gap-2 rounded-xl border p-4 ${
            assessment.role_fit.is_suitable_for_target_role
              ? 'border-success/30 bg-success/[0.07]'
              : 'border-warning/30 bg-warning/[0.07]'
          }`}
        >
          <div className="flex items-center gap-2">
            {assessment.role_fit.is_suitable_for_target_role ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            )}
            <span className="text-sm font-medium text-foreground">
              {assessment.role_fit.is_suitable_for_target_role
                ? `Good practice fit for ${assessment.role_fit.target_role}`
                : `Not yet a strong fit for ${assessment.role_fit.target_role}`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{assessment.role_fit.reasoning}</p>
          {!assessment.role_fit.is_suitable_for_target_role && assessment.role_fit.suggested_roles.length > 0 ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Roles better matched to what you showed today
              </span>
              <div className="flex flex-wrap gap-1.5">
                {assessment.role_fit.suggested_roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs text-warning"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {assessment.role_fit.is_suitable_for_target_role && assessment.role_fit.suggested_roles.length > 0 ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Other roles that match your interview performance
              </span>
              <div className="flex flex-wrap gap-1.5">
                {assessment.role_fit.suggested_roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs text-success"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {assessment.evidence_quality ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidence quality</span>
          <p className="mt-1 max-w-[62ch] text-xs leading-relaxed text-muted-foreground">
            Every specific, checkable thing you claimed — a number, a named result, "I built/led X" — and whether the
            panel actually got proof of it before the topic moved on.
          </p>
          {/* Two numbers, not one: "fully backed" (strong evidence only) and
           * "probed" (strong + weak) answer different questions. Showing
           * only the strict one meant a transcript with mostly weak evidence
           * — real follow-up, just not conclusive — read as "0%, the panel
           * did nothing," which was never true. */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
            <div className="flex items-center justify-center gap-4 rounded-xl border border-border bg-surface/70 px-5 py-4">
              <PercentRing percent={assessment.evidence_quality.coverage_pct} label="fully backed" size={92} />
              <PercentRing percent={assessment.evidence_quality.probed_pct} label="probed" size={92} />
            </div>
            <div className="flex flex-col justify-center gap-3">
              <EvidenceCompositionBar
                strong={assessment.evidence_quality.strong_evidence_count}
                weak={assessment.evidence_quality.weak_evidence_count}
                missing={assessment.evidence_quality.missing_evidence_count}
              />
              {assessment.evidence_quality.contradictions_count > 0 ? (
                <p className="text-xs text-warning">
                  {assessment.evidence_quality.contradictions_count} contradiction
                  {assessment.evidence_quality.contradictions_count === 1 ? '' : 's'} found — see below.
                </p>
              ) : null}
            </div>
          </div>

          {assessment.evidence && assessment.evidence.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
              {assessment.evidence.map((item) => {
                const style = evidenceStrengthStyle(item.strength)
                return (
                  <li key={item.claim} className="flex items-start gap-2 text-xs">
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: style.color }}
                      aria-hidden="true"
                    />
                    <span className="text-foreground">{item.claim}</span>
                    <span className="ml-auto shrink-0 pl-2 font-medium" style={{ color: style.color }}>
                      {style.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {assessment.adaptive_intelligence ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Adaptive intelligence
          </span>
          <p className="mt-1 max-w-[62ch] text-xs leading-relaxed text-muted-foreground">
            What the panel actually did with your answers, not a fixed list of questions worked through in order.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile
              icon={MessageSquareText}
              value={assessment.adaptive_intelligence.questions_asked}
              label="Questions asked"
            />
            <StatTile
              icon={Sparkles}
              value={assessment.adaptive_intelligence.adaptive_follow_ups}
              label="Adaptive follow-ups"
            />
            <StatTile
              icon={RefreshCw}
              value={assessment.adaptive_intelligence.interviewer_switches}
              label="Interviewer switches"
            />
            <StatTile
              icon={TrendingUp}
              value={assessment.adaptive_intelligence.difficulty_adjustments}
              label="Difficulty adjustments"
            />
            <StatTile icon={Target} value={assessment.adaptive_intelligence.evidence_probes} label="Evidence probes" />
            <StatTile
              icon={Flame}
              value={assessment.adaptive_intelligence.scenario_challenges}
              label="Scenario challenges"
            />
          </div>

          {assessment.decision_timeline && assessment.decision_timeline.length > 0 ? (
            <div className="mt-4 border-t border-border pt-4">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Difficulty over the interview
              </span>
              <div className="mt-3">
                <DecisionTimelineChart points={assessment.decision_timeline} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {assessment.panel_notes.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Panel disagreement</span>
          {assessment.panel_notes.map((note) => (
            <div key={note.interviewer} className="flex items-baseline justify-between text-sm">
              <span className="text-foreground">{note.summary}</span>
              <span className="ml-3 shrink-0 text-muted-foreground">{note.score.toFixed(1)}/10</span>
            </div>
          ))}
        </div>
      ) : null}

      {assessment.contradictions.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-xl border border-warning/30 bg-warning/[0.07] p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-warning">Potential contradictions</span>
          {assessment.contradictions.map((item) => (
            <p key={item} className="text-sm text-warning">
              {item}
            </p>
          ))}
        </div>
      ) : null}

      {!assessment.error && assessment.recommendation ? (
        <p className="text-sm text-muted-foreground">{assessment.recommendation}</p>
      ) : null}
    </div>
  )
}
