'use client'

/**
 * Shown the moment an interview call actually opens — the Suspense fallback
 * while ConversationComponent's own chunk (three.js, the avatar rig, the
 * whole 3D stage) is still downloading and while the character models are
 * still loading in behind it (`characterAssetLoader.isReady`).
 *
 * Shaped to match `QuickstartConversationLayout`'s real geometry — the same
 * header bar, the same stage-plus-controls main column, the same sidebar
 * transcript — rather than an abstract waveform unrelated to what's coming.
 * The point is that the swap from this to the live call reads as "the room
 * finished loading," not as a scene change.
 */
export function LoadingSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col text-left">
      <header className="flex shrink-0 flex-col gap-4 border-b border-border px-4 py-4 md:h-[76px] md:flex-row md:items-center md:justify-between md:px-6 md:py-0">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 flex-col justify-center gap-1.5">
            <span className="text-base font-semibold leading-none tracking-[-0.025em] text-foreground">
              Interview Panel
            </span>
            <div className="skeleton h-3 w-24 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2 md:pr-1">
          <div className="skeleton h-8 w-24 rounded-md" />
        </div>
      </header>

      <div className="flex min-h-0 w-full flex-1 flex-col gap-4 px-4 pb-4 pt-4 md:px-6 lg:flex-row lg:gap-0">
        <aside className="order-2 flex h-64 min-h-0 w-full shrink-0 flex-col gap-3 rounded-xl border border-border p-3 lg:h-full lg:w-[24rem]">
          {['a', 'b', 'c', 'd', 'e'].map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-3 w-full rounded" />
            </div>
          ))}
        </aside>

        <main className="order-1 flex min-h-0 flex-1 flex-col lg:border-r lg:border-border/80 lg:pr-6">
          <div className="flex min-h-0 flex-1 flex-col pb-2 pt-3 md:pb-6">
            <div className="flex min-h-0 flex-1 items-center justify-center gap-6">
              {/* Three seats, the panel's real shape — this is what the 3D
                  stage resolves into a moment later. */}
              {['technical_interviewer', 'product_manager', 'hiring_manager'].map((seat) => (
                <div key={seat} className="flex flex-col items-center gap-3">
                  <div className="skeleton h-20 w-20 rounded-full sm:h-28 sm:w-28" />
                  <div className="skeleton h-2.5 w-16 rounded" />
                </div>
              ))}
            </div>
            <div className="shrink-0 pt-4">
              <div className="mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-card/80 px-4 py-2 backdrop-blur-md">
                <div className="skeleton h-9 w-9 rounded-full" />
                <div className="skeleton h-9 w-9 rounded-full" />
                <div className="skeleton h-10 w-10 rounded-full" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
