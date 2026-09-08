'use client'

import type { LucideIcon } from '@/components/ui/icons'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/** Every signed-in route renders inside one of these so page width, top
 * padding and vertical rhythm are identical across the app instead of each
 * screen picking its own `w-[min(94vw,Nrem)]`. */
export function PageContainer({
  children,
  width = 'default',
  className,
}: {
  children: React.ReactNode
  width?: 'narrow' | 'default' | 'wide'
  className?: string
}) {
  const max = width === 'narrow' ? 'max-w-3xl' : width === 'wide' ? 'max-w-6xl' : 'max-w-5xl'
  return (
    <div className={cn('mx-auto flex w-full flex-1 flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10', max, className)}>
      {children}
    </div>
  )
}

/** Shared page masthead: eyebrow, title, one line of supporting copy, and
 * an optional action on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <header className="flex animate-fade-up flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        {eyebrow ? (
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</span>
        ) : null}
        <h1 className="mt-1.5 text-[1.75rem] font-bold leading-tight tracking-tight text-foreground sm:text-[2rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-[60ch] font-editorial text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  )
}

/** The single empty/zero state used everywhere — icon medallion, headline,
 * one explanatory line, optional call to action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex animate-fade-up flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-accent">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/** Headline metric tile for dashboards. */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-accent transition-transform duration-200 group-hover:scale-105">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
        <span className="text-xl font-bold leading-tight text-foreground">{value}</span>
        {hint ? <span className="truncate text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  )
}

/** Small uppercase divider label for grouping sections inside a page. */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
      {action}
    </div>
  )
}

/** Shimmer placeholder block, used while page data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} />
}
