'use client'

import { useInView, useReducedMotion } from './motion'

export { useReducedMotion }

/** Landing-only palette. Deliberately NOT the app's warm paper/ink tokens:
 * the signed-out page is a dark, cinematic room and the product behind it is
 * a light workspace. Kept in one place so the two never drift into each
 * other by accident. */
export const NAVY = '#002b43'
export const MUTED = '#a7a7ad'

/** Reveal-on-scroll for anything below the fold.
 *
 * Animates `opacity` and `transform` only — both compositor-only, so a
 * screenful of these costs no layout or paint. It observes against the real
 * scroll container (see motion.ts); this page scrolls inside AppShell's
 * `<main>`, and a viewport-rooted observer resolves unreliably against it. */
export function Reveal({
  children,
  delayMs = 0,
  className = '',
}: {
  children: React.ReactNode
  delayMs?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const { ref, inView } = useInView<HTMLDivElement>({ disabled: reduced })
  const visible = reduced || inView

  return (
    <div
      ref={ref}
      className={className}
      style={
        reduced
          ? undefined
          : {
              opacity: visible ? 1 : 0,
              transform: visible ? 'none' : 'translateY(24px)',
              transition: `opacity 620ms ease-out ${delayMs}ms, transform 620ms ease-out ${delayMs}ms`,
            }
      }
    >
      {children}
    </div>
  )
}
