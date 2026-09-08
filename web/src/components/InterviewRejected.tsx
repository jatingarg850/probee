'use client'

import { XCircle } from '@/components/ui/icons'

import { Button } from '@/components/ui/button'

interface InterviewRejectedProps {
  reason: string | null
  onStartNewInterview: () => void
}

export function InterviewRejected({ reason, onStartNewInterview }: InterviewRejectedProps) {
  return (
    <div className="mx-auto flex w-[min(92vw,28rem)] animate-fade-up flex-col items-center gap-5 rounded-2xl border border-destructive/30 bg-destructive/[0.06] px-8 py-10 text-center shadow-lift">
      <XCircle className="h-12 w-12 text-destructive" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Interview ended</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This session was ended after three proctoring warnings.
          {reason ? ` Last warning: ${reason}` : ''}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Stay in frame, keep your eyes on the screen, remain in fullscreen, and don't switch tabs or open dev tools
        during a practice interview to avoid this.
      </p>
      <Button onClick={onStartNewInterview} variant="outline" className="mt-1">
        Try again
      </Button>
    </div>
  )
}
