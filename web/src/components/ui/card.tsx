'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

/** The one card surface used across the product. Every page previously
 * rolled its own `rounded-xl border border-border bg-card` (and each
 * one drifted a little), which is why nothing lined up. Radius, border,
 * ground and shadow now live here. */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean; muted?: boolean }
>(({ className, interactive = false, muted = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-xl border border-border shadow-soft',
      muted ? 'bg-surface/60' : 'bg-card',
      interactive &&
        'cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lift',
      className,
    )}
    {...props}
  />
))
Card.displayName = 'Card'

/** Card header strip — the small uppercase label bar that titles a panel. */
function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-border px-4 py-3', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</span>
      {action}
    </div>
  )
}

function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />
}

export { Card, CardHeader, CardBody }
