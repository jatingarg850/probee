const STORAGE_PREFIX = 'probe:seenIntroPanel:'

/** Whether this user has already had a given collapsible context rail (the
 * "New interview" 01/02/03 explainer, the camera precheck's instructions,
 * etc.) shown to them on a previous visit — each such rail only auto-opens
 * once, on a candidate's actual first time reaching that page; after that
 * it starts collapsed and they pull it open themselves. `panelId` keeps
 * each rail's "seen" state independent (seeing one doesn't silently mark
 * another as seen too), and everything is scoped per user so one browser
 * can't carry a first-timer's state into another account signed in on the
 * same machine. */
export function hasSeenIntroPanel(userId: string, panelId: string): boolean {
  if (typeof window === 'undefined' || !userId) return true
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${panelId}:${userId}`) === '1'
  } catch (error) {
    console.warn('Could not read intro panel state:', error)
    return true
  }
}

export function markIntroPanelSeen(userId: string, panelId: string) {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${panelId}:${userId}`, '1')
  } catch (error) {
    console.warn('Could not save intro panel state:', error)
  }
}
