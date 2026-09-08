'use client'

import { useEffect, useState } from 'react'

/** True while the interview tab is switched away from, minimized, or the
 * OS window otherwise loses visibility — used as a proctoring signal
 * (someone alt-tabbing to look up an answer), not to pause or resume
 * anything else. */
export function useTabHidden(active: boolean): boolean {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!active) {
      setHidden(false)
      return
    }
    const update = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', update)
    update()
    return () => document.removeEventListener('visibilitychange', update)
  }, [active])

  return hidden
}
