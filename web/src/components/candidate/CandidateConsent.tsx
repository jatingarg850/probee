'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { AlertCircle } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'

/**
 * The consent and disclosure gate (M1-3).
 *
 * ============================================================
 * WRITTEN TO BE READ, NOT TO BE CLICKED THROUGH
 * ============================================================
 * The obligation this discharges — Illinois AIVIA, and good practice
 * everywhere else — is *informed* consent. A wall of legal text with an
 * "I agree" underneath satisfies a lawyer and nobody else, and it is not what
 * the statute asks for: it asks that the candidate be told how the AI works
 * and what it evaluates.
 *
 * So this is written in plain sentences, in the second person, and it says the
 * unflattering parts out loud: an AI scores you, a person may never watch the
 * recording, and you can say no. A candidate who declines has still had a
 * better experience than one who agreed without understanding.
 *
 * ============================================================
 * THE DEMOGRAPHIC QUESTIONS ARE NOT PART OF THE CONSENT
 * ============================================================
 * They sit below the decision, are explicitly optional, and skipping them is
 * recorded as a valid answer. They exist so a bias audit is possible at all —
 * you cannot audit what you never recorded — and the screen says plainly that
 * interviewers never see them. That claim is enforced in `lib/compliance.ts`,
 * which has no function that reads demographics for one candidate.
 */

interface Props {
  organizationName: string
  jobTitle: string
  candidateName: string
  durationMinutes: number
  onDecision: (accepted: boolean, demographics?: { sex?: string; raceEthnicity?: string; declined?: boolean }) => void
  isSubmitting: boolean
  error: string | null
}

/** Categories follow the shape NYC Local Law 144 audits report on. "Prefer not
 * to say" is a first-class option rather than an empty default, so a candidate
 * who actively declines is distinguishable from one who never got that far. */
const SEX_OPTIONS = ['Female', 'Male', 'Non-binary', 'Prefer not to say']
const RACE_OPTIONS = [
  'Asian',
  'Black or African American',
  'Hispanic or Latino',
  'Middle Eastern or North African',
  'Native American or Alaska Native',
  'Native Hawaiian or Pacific Islander',
  'White',
  'Two or more',
  'Prefer not to say',
]

const DISCLOSURE = [
  {
    q: 'Who is interviewing you',
    a: 'Nobody, in the live sense. A panel of three AI interviewers asks the questions, listens to your answers, and decides what to ask next based on what you actually said. There is no person on the call.',
  },
  {
    q: 'What it is judging',
    a: 'Your answers are scored against competencies this employer chose for this role, with weights they set. It scores what you demonstrably said — the assessment quotes your own words as the evidence behind each score.',
  },
  {
    q: 'What is recorded',
    a: 'Audio and video from your camera and microphone for the length of the interview, a full written transcript, and the scores. Your screen is not recorded and your files are not read.',
  },
  {
    q: 'What else is monitored',
    a: 'The interview checks that you stay in frame and in the interview window. If it flags something, the employer sees that flag alongside your interview.',
  },
  {
    q: 'Who sees it',
    a: 'People at this employer who have been given access. PROBE staff can see how much the interview cost to run, not what you said.',
  },
  {
    q: 'If you would rather not',
    a: 'Say no below. Nothing is recorded, and you can ask the employer for a conventional interview instead — declining here is not an application withdrawn.',
  },
]

export function CandidateConsent({
  organizationName,
  jobTitle,
  candidateName,
  durationMinutes,
  onDecision,
  isSubmitting,
  error,
}: Props) {
  const [agreed, setAgreed] = useState(false)
  const [sex, setSex] = useState('')
  const [raceEthnicity, setRaceEthnicity] = useState('')
  const [confirmingDecline, setConfirmingDecline] = useState(false)

  const submit = () => {
    if (!agreed || isSubmitting) return
    const answered = sex !== '' || raceEthnicity !== ''
    onDecision(true, {
      ...(sex ? { sex } : {}),
      ...(raceEthnicity ? { raceEthnicity } : {}),
      // "Asked and skipped" is a different, recorded state from "never asked",
      // which is what the absence of a row means.
      declined: !answered,
    })
  }

  return (
    // Same visual family as this flow's other two standalone screens
    // (AcceptInvitePage, CandidateDone): logo above, then everything else
    // inside one bounded card on the page background — not bare text
    // floating directly on `bg-background`, which is what this screen used
    // to do and the only one of the three that did. Not vertically centered
    // like those two, though — this one is long enough on most invitations
    // that centering it would just push the top of the disclosure off
    // screen on a normal laptop.
    <main className="min-h-dvh bg-background px-5 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-[42rem]">
        <img src="/Logo%20Svg/main%20text.svg" alt="PROBE" className="h-6 w-auto opacity-70" />

        <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-8">
          <header>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Interview with {organizationName}
            </p>
            <h1 className="mt-2.5 text-[2rem] font-bold leading-[1.12] tracking-tight text-foreground sm:text-[2.4rem]">
              {candidateName ? `${candidateName.split(' ')[0]}, before you start` : 'Before you start'}
            </h1>
            <p className="mt-3.5 max-w-[58ch] font-editorial text-[15.5px] leading-relaxed text-muted-foreground">
              You are about to sit a {durationMinutes}-minute interview for{' '}
              <strong className="font-semibold text-foreground">{jobTitle}</strong>. It is conducted by AI. Here is
              exactly what that means, so you can decide.
            </p>
          </header>

          <dl className="mt-8 divide-y divide-border border-y border-border">
            {DISCLOSURE.map(({ q, a }) => (
              <div key={q} className="flex flex-col gap-1.5 py-4 sm:flex-row sm:gap-8">
                <dt className="w-52 shrink-0 text-[14px] font-semibold leading-snug text-foreground">{q}</dt>
                <dd className="text-[14.5px] leading-relaxed text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
            {organizationName} decides how long your interview is kept and can delete it on request. Ask them directly —
            they control this data, not PROBE.
          </p>

          {/* The decision, before the optional questions. Putting demographics
            above the agreement would make them feel like part of it. */}
          <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface/60 px-4 py-4">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              disabled={isSubmitting}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
            />
            <span className="text-[14.5px] leading-relaxed text-foreground">
              I have read the above. I agree to be interviewed and scored by AI, and to this interview being recorded
              and transcribed for {organizationName}.
            </span>
          </label>

          <section className="mt-6 rounded-xl border border-border bg-surface/50 px-4 py-4">
            <h2 className="text-[14px] font-semibold text-foreground">Two optional questions</h2>
            <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
              Employers using AI interviewing have to be able to show it does not favour one group over another.
              Answering makes that check possible.{' '}
              <strong className="font-medium text-foreground">Interviewers never see these</strong> — they are stored
              apart from your interview and are only ever read as group totals, never next to your name or your score.
              Skipping is completely fine and changes nothing about your interview.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Sex
                <select
                  value={sex}
                  onChange={(event) => setSex(event.target.value)}
                  disabled={isSubmitting}
                  className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
                >
                  <option value="">Skip this</option>
                  {SEX_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Race or ethnicity
                <select
                  value={raceEthnicity}
                  onChange={(event) => setRaceEthnicity(event.target.value)}
                  disabled={isSubmitting}
                  className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
                >
                  <option value="">Skip this</option>
                  {RACE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {error ? (
            <p
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-3 text-[13.5px] leading-relaxed text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button onClick={submit} disabled={!agreed || isSubmitting} className="h-12 sm:flex-1">
              {isSubmitting ? (
                <>
                  <LoadingDots />
                  Setting up…
                </>
              ) : (
                'Agree and continue'
              )}
            </Button>

            {/* Declining is a real, equally available choice — not a link in
              small print. It is confirmed once, because it cannot be undone
              from this screen. */}
            {confirmingDecline ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => onDecision(false)} disabled={isSubmitting} className="h-12">
                  Yes, decline
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingDecline(false)} className="h-12">
                  Go back
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setConfirmingDecline(true)}
                disabled={isSubmitting}
                className="h-12"
              >
                I would rather not
              </Button>
            )}
          </div>

          <p className="mt-5 text-[12.5px] leading-relaxed text-muted-foreground">
            You will get a camera and microphone check before anything is recorded.
          </p>
        </div>
      </div>
    </main>
  )
}
