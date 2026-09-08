'use client'

import { useEffect, useRef, useState } from 'react'

/** The landing page does NOT scroll the window.
 *
 * AppShell renders every route inside `<main class="... overflow-y-auto">`,
 * so the element that actually scrolls is that `<main>`, not the document.
 * Anything reading `window.scrollY` here reads a permanent 0. Rather than
 * change the shell (the signed-in dashboard shares that same `<main>`),
 * everything scroll-aware on this page resolves its own scroll container. */
export function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export function useReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/** Phones get a deliberately lighter treatment: no cursor-tracked effects,
 * no backdrop blur on large surfaces, fewer animated elements. Those are
 * the three things that actually cost frames on mid-range hardware. */
export function useIsCompact() {
  return useMediaQuery('(max-width: 767px)')
}

/** Fires once when the element first comes into view, observed against the
 * real scroll container — with a viewport root, entries here resolve late
 * or not at all, which reads as content popping in long after it should. */
export function useInView<T extends HTMLElement>(options?: { threshold?: number; disabled?: boolean }) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  const { threshold = 0, disabled = false } = options ?? {}

  useEffect(() => {
    if (disabled) {
      setInView(true)
      return
    }
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setInView(true)
        observer.disconnect()
      },
      { root: getScrollParent(el), threshold, rootMargin: '0px 0px -6% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, disabled])

  return { ref, inView }
}

/** Like useInView but keeps reporting — used to PAUSE looping animations
 * once they scroll off screen. An off-screen CSS animation still burns
 * compositor work every frame; on a phone that is the difference between a
 * smooth page and a warm one. */
export function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [onScreen, setOnScreen] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      root: getScrollParent(el),
      rootMargin: '10% 0px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, onScreen }
}

/** Scroll progress (0 → 1) of whichever container actually scrolls.
 *
 * Reads are batched into one rAF per frame: a `scroll` handler that touches
 * `scrollHeight` synchronously forces a layout on every wheel event, which
 * is its own source of jank. `scrollHeight` is re-measured on resize only. */
export function useScrollProgress(anchorRef: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const scroller = getScrollParent(anchorRef.current)
    const target: HTMLElement | Window = scroller ?? window

    let frame = 0
    let maxScroll = 0

    const measure = () => {
      maxScroll = scroller
        ? scroller.scrollHeight - scroller.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight
    }

    const read = () => {
      frame = 0
      const top = scroller ? scroller.scrollTop : window.scrollY
      setProgress(maxScroll > 0 ? Math.min(1, Math.max(0, top / maxScroll)) : 0)
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(read)
    }

    measure()
    read()

    target.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(() => {
      measure()
      onScroll()
    })
    observer.observe(scroller ?? document.documentElement)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      target.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [anchorRef])

  return progress
}

/** How far a specific element has travelled through the viewport, 0 → 1,
 * written straight to a CSS custom property on that element instead of
 * through React state.
 *
 * Setting a variable the stylesheet already consumes keeps the whole effect
 * on the compositor: no re-render, no reconciliation, one style write per
 * frame. Driving the same effect through useState re-renders the subtree on
 * every scroll event, which is where scroll-linked animation usually loses
 * its frames. */
export function useElementScrollProgress<T extends HTMLElement>(
  varName = '--p',
  /** Remaps the raw 0 -> 1 travel onto a sub-range, so an effect can finish
   * while the element is still mid-screen instead of only completing once it
   * has left the viewport entirely. */
  range: [number, number] = [0, 1],
) {
  const ref = useRef<T>(null)
  const [from, to] = range

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const scroller = getScrollParent(el)
    const target: HTMLElement | Window = scroller ?? window

    let frame = 0

    const read = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      const viewportH = scroller ? scroller.clientHeight : window.innerHeight
      const total = rect.height + viewportH
      const travelled = viewportH - rect.top
      const raw = Math.min(1, Math.max(0, travelled / total))
      const mapped = to === from ? 0 : (raw - from) / (to - from)
      el.style.setProperty(varName, Math.min(1, Math.max(0, mapped)).toFixed(4))
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(read)
    }

    // Deliberately NOT gated on an IntersectionObserver "is it near the
    // viewport" flag. That saved one rect read per scroll frame — which is
    // nothing — at the cost of a state the effect could get stuck in: once
    // the flag went false, every later frame bailed out early, and if the
    // observer did not fire again the progress variable froze at whatever
    // value it last held, leaving the animation stuck mid-way. A read per
    // frame while scrolling is not worth that failure mode.
    read()
    target.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [varName, from, to])

  return ref
}

/** True once the referenced element has been scrolled past the top of the
 * viewport — used by the landing nav, which has to stay transparent for as
 * long as it sits over the dark hero and only take on a solid background
 * once the page behind it turns light. Page-wide scroll progress can't
 * express that: it crosses any small threshold within the first few pixels,
 * long before the hero is actually behind you. */
export function useScrolledPast<T extends HTMLElement>(ref: React.RefObject<T | null>, offsetPx = 56) {
  const [past, setPast] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setPast(!entry.isIntersecting), {
      root: getScrollParent(el),
      rootMargin: `-${offsetPx}px 0px 0px 0px`,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, offsetPx])

  return past
}

/** Which of the given section ids is currently the one being read.
 *
 * Drives the nav's active state. Uses a band across the upper-middle of the
 * viewport rather than "topmost visible section": with a plain top-edge
 * test, a short section sandwiched between two tall ones never wins, and the
 * indicator skips it entirely. */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null)
    if (els.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Track everything, then pick the entry nearest the top of the band
        // — several sections can satisfy the margin at once.
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        const best = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b))
        setActive(best.target.id)
      },
      { root: getScrollParent(els[0]), rootMargin: '-20% 0px -55% 0px' },
    )

    for (const el of els) observer.observe(el)
    return () => observer.disconnect()
  }, [ids])

  return active
}
