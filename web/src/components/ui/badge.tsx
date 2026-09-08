'use client'

import { type VariantProps, cva } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface text-muted-foreground',
        ink: 'border-transparent bg-ink text-ink-foreground',
        ember: 'border-primary/25 bg-primary/12 text-accent',
        success: 'border-success/25 bg-success/10 text-success',
        warning: 'border-warning/25 bg-warning/10 text-warning',
        danger: 'border-destructive/25 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

/** Status chips derive their tone from the session status string so a
 * "completed" pill looks identical on the dashboard, the interviews list
 * and the sessions list. */
export function StatusBadge({ status }: { status?: string }) {
  const value = (status ?? 'unknown').toLowerCase()
  const tone = value === 'completed' ? 'success' : value === 'rejected' || value === 'failed' ? 'danger' : 'warning'
  return (
    <Badge tone={tone} className="capitalize">
      {value}
    </Badge>
  )
}
