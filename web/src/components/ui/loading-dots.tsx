import { cn } from '@/lib/utils'

/**
 * Three-dot "in progress" indicator, for inline use where a skeleton block
 * doesn't fit — a submit button's "Saving…", a small icon-only action.
 *
 * Deliberately not a spinner. A circular spinner is a strong, separate
 * signal that reads as "the whole surface is loading," which is the wrong
 * message for "this one action is in flight" — and it is its own kind of
 * motion the rest of the app's loading language (the skeleton shimmer in
 * `index.css`) doesn't use anywhere else. Three dots pulsing in sequence is
 * the same "give me a moment" message without introducing a second visual
 * vocabulary for the same idea.
 */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <output className={cn('inline-flex items-center gap-1', className)} aria-label="Loading">
      <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
      <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
      <span className="loading-dot h-1.5 w-1.5 rounded-full bg-current" />
    </output>
  )
}
