'use client'

import { useElementScrollProgress, useReducedMotion } from './motion'

/** Depth for the stage, so a full screen of it does not read as one flat
 * fill. Three stacked layers in a single `background` declaration — cheaper
 * than three absolutely-positioned overlay divs, and all of it is painted
 * once rather than per frame:
 *
 *  - a soft warm pool behind where the speaking seat's mark sits,
 *  - a cool counter-light from the opposite corner,
 *  - a faint grid, which is what actually gives the surface a sense of
 *    scale as it opens out to full width.
 *
 * Kept far below the text in contrast: this is meant to be felt rather than
 * looked at. */
const STAGE_DEPTH: React.CSSProperties = {
  backgroundImage: [
    'radial-gradient(60rem 40rem at 32% 42%, rgba(217,119,87,0.09), transparent 60%)',
    'radial-gradient(50rem 36rem at 88% 96%, rgba(120,150,190,0.06), transparent 62%)',
    'linear-gradient(rgba(255,255,255,0.014) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px)',
  ].join(','),
  backgroundSize: 'auto, auto, 88px 88px, 88px 88px',
}

/** The page's one scroll moment: the interview panel starts as a contained
 * card sitting under the headline, and opens out to fill the entire screen
 * — width and height — as you scroll into it, holding there while you read
 * it before the page carries on.
 *
 * Three parts make that work:
 *
 *  - A tall runway `<section>` provides the scroll distance. Nothing is
 *    drawn in it; it exists purely so there is something to scroll through
 *    while the panel is pinned.
 *  - A `sticky` child pins the panel below the nav at exactly the height of
 *    the visible area, so "fully open" really is the whole screen rather
 *    than just the full width.
 *  - The panel itself is already laid out at that final size, and what
 *    animates is a `clip-path` window opening outward over it. Growing an
 *    element's real width or height would reflow its contents on every
 *    frame; clipping never touches layout, so the move stays on the
 *    compositor. The content drifts up slightly slower than the window
 *    opens, which is the parallax.
 *
 * `--p` is written straight onto the section by a rAF-batched scroll
 * listener (see useElementScrollProgress) and read by the CSS below — no
 * React state, so scrolling through this costs zero re-renders. */
export function ExpandingStage({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  // Opens as the panel rises into view and completes shortly after it pins,
  // leaving the rest of the runway to hold it fullscreen.
  const ref = useElementScrollProgress<HTMLDivElement>('--p', [0.08, 0.42])

  if (reduced) {
    return (
      <div className="flex w-full items-center bg-[#131312]" style={STAGE_DEPTH}>
        <div className="mx-auto w-full max-w-[68rem] px-6 py-20 sm:px-10">{children}</div>
      </div>
    )
  }

  return (
    <section ref={ref} className="relative h-[180vh]">
      {/* `top-16` matches the nav's height, so the pinned panel fills every
       * pixel below it rather than sliding under a light bar. */}
      <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-hidden">
        <div
          className="absolute inset-0 flex items-center bg-[#131312]"
          style={{
            ...STAGE_DEPTH,
            // Insets on all four sides at --p = 0 (a centred, rounded card);
            // all four resolve to zero at --p = 1 (the whole screen).
            clipPath: `inset(
              calc((1 - var(--p, 0)) * 11%)
              calc((1 - var(--p, 0)) * 10%)
              calc((1 - var(--p, 0)) * 11%)
              calc((1 - var(--p, 0)) * 10%)
              round calc((1 - var(--p, 0)) * 26px)
            )`,
            willChange: 'clip-path',
          }}
        >
          <div
            className="mx-auto w-full max-w-[68rem] px-6 sm:px-10"
            style={{ transform: 'translateY(calc((1 - var(--p, 0)) * 20px))' }}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
