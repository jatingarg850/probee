'use client'

import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { AlertCircle, AlertTriangle, Check } from '@/components/ui/icons'

/**
 * Every way a candidate's visit can end.
 *
 * ============================================================
 * NO SCORE, AND NO PRETENDING THERE MIGHT BE
 * ============================================================
 * The finished state does not show a result, does not promise one, and does
 * not say "we'll be in touch" — PROBE cannot know whether the employer will
 * be. It says what actually happened and who now has it, which is the only
 * honest thing available.
 *
 * The one thing it does offer is the practice product, because that is
 * genuinely useful to somebody who has just sat an interview and is going to
 * sit more. It is offered once, plainly, below the fold of the actual message.
 */

type Variant = 'complete' | 'terminated' | 'declined' | 'invalid'

const COPY: Record<
  Variant,
  { icon: 'check' | 'warn' | 'error'; title: string; body: (org: string) => string; sub?: (org: string) => string }
> = {
  complete: {
    icon: 'check',
    title: 'That is it — you are done',
    body: (org) =>
      `Your interview has been sent to ${org}. They will review it and contact you directly about what happens next.`,
    sub: () => 'You can close this tab. There is nothing else to submit, and the link will not open another interview.',
  },
  terminated: {
    icon: 'warn',
    title: 'Your interview ended early',
    body: (org) =>
      `The interview was stopped before it finished. What was recorded up to that point has been sent to ${org}, along with the reason it stopped.`,
    sub: (org) => `If you think this was a mistake — a camera problem, a bad connection — contact ${org} directly.`,
  },
  declined: {
    icon: 'check',
    title: 'Understood — nothing was recorded',
    body: (org) =>
      `You have declined the AI interview and nothing about you was recorded. ${org} has been told only that you were asked and said no.`,
    sub: (org) =>
      `Declining is not withdrawing your application. Contact ${org} if you would like a conventional interview instead.`,
  },
  invalid: {
    icon: 'error',
    title: 'This link does not work',
    body: () => 'It may have expired, been withdrawn, or already been used for an interview.',
    sub: () => 'Interview links last 21 days and work once. Ask whoever invited you to send a new one.',
  },
}

export function CandidateDone({
  variant,
  organizationName,
  message,
}: {
  variant: Variant
  organizationName?: string
  message?: string | null
}) {
  const copy = COPY[variant]
  const org = organizationName ?? 'the employer'
  const Icon = copy.icon === 'check' ? Check : copy.icon === 'warn' ? AlertTriangle : AlertCircle
  const tone =
    copy.icon === 'check'
      ? 'bg-success/12 text-success'
      : copy.icon === 'warn'
        ? 'bg-warning/12 text-warning'
        : 'bg-destructive/10 text-destructive'

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-14">
      <div className="w-full max-w-[30rem] text-center">
        <img src="/Logo%20Svg/main%20text.svg" alt="PROBE" className="mx-auto h-6 w-auto opacity-70" />

        <span className={`mx-auto mt-10 flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>

        <h1 className="mt-5 text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">{copy.title}</h1>
        <p className="mt-3.5 font-editorial text-[15.5px] leading-relaxed text-muted-foreground">{copy.body(org)}</p>

        {/* The proctoring reason, when there is one. Shown to the candidate
            because they are entitled to know why their interview stopped —
            finding out from a rejection letter weeks later would be worse. */}
        {message && variant === 'terminated' ? (
          <p className="mt-4 rounded-lg border border-border bg-surface/60 px-3.5 py-3 text-[13.5px] leading-relaxed text-foreground">
            {message}
          </p>
        ) : null}
        {message && variant === 'invalid' ? (
          <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">{message}</p>
        ) : null}

        {copy.sub ? <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">{copy.sub(org)}</p> : null}

        {/* Offered once, below the message, and only where it is genuinely
            useful — not on the "your link is broken" screen, where it would
            read as a consolation prize. */}
        {variant !== 'invalid' ? (
          <div className="mt-10 border-t border-border pt-8">
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Practising for your next one is free on PROBE, with the same panel. Nothing you do there is visible to{' '}
              {org} — or to any employer.
            </p>
            <Button asChild variant="outline" className="mt-4 h-11">
              <Link href="/">Try a practice interview</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  )
}
