'use client'

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react'

interface Size {
  width: number
  height: number
}

/** Makes an element draggable anywhere within the viewport via pointer
 * events (covers mouse, touch, and pen alike). Position is clamped so the
 * element can never end up fully off-screen, and re-clamps on window
 * resize (e.g. exiting fullscreen) so it doesn't get stranded off the
 * visible area. Starts pinned to the bottom-right corner. */
export function useDraggable(size: Size, margin = 16) {
  const clamp = useCallback(
    (x: number, y: number) => {
      const maxX = Math.max(margin, window.innerWidth - size.width - margin)
      const maxY = Math.max(margin, window.innerHeight - size.height - margin)
      return { x: Math.min(Math.max(x, margin), maxX), y: Math.min(Math.max(y, margin), maxY) }
    },
    [size.width, size.height, margin],
  )

  const [position, setPosition] = useState(() => {
    if (typeof window === 'undefined') return { x: margin, y: margin }
    return clamp(window.innerWidth - size.width - margin, window.innerHeight - size.height - margin)
  })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const positionRef = useRef(position)
  positionRef.current = position

  useEffect(() => {
    const onResize = () => setPosition((p) => clamp(p.x, p.y))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragOffset.current = { x: e.clientX - positionRef.current.x, y: e.clientY - positionRef.current.y }
    setIsDragging(true)
  }, [])

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!isDragging) return
      setPosition(clamp(e.clientX - dragOffset.current.x, e.clientY - dragOffset.current.y))
    },
    [isDragging, clamp],
  )

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    setIsDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  return { position, isDragging, onPointerDown, onPointerMove, onPointerUp }
}
