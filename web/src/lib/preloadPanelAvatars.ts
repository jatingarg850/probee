'use client'

import { PANEL_AVATARS, PANEL_AVATAR_ORDER } from '@/lib/panelAvatars'

/** Warm the browser cache with the panel's .glb models.
 *
 * This lives here, not in PanelAvatarStage, because of what a static import
 * costs. PanelAvatarStage pulls in three.js, @react-three/fiber and drei at
 * module scope — several hundred modules. Two routes imported this one
 * function from it: /interview (where the 3D panel is behind a `dynamic()`
 * import, so the static import defeated that code-splitting and dragged the
 * whole 3D stack into the route's main chunk) and /resume (which has no 3D
 * content at all and was compiling three.js purely for a cache hint).
 *
 * The `import()` is deferred to call time, so neither route's module graph —
 * and neither route's dev compile — touches three.js until something
 * actually renders an avatar.
 *
 * Fire-and-forget by design: this is an optimisation, and a failure to warm
 * the cache should never surface to the caller or block a render. */
export function preloadAllPanelAvatars(): void {
  void import('@react-three/drei')
    .then(({ useGLTF }) => {
      for (const id of PANEL_AVATAR_ORDER) {
        useGLTF.preload(PANEL_AVATARS[id].modelUrl)
      }
    })
    .catch(() => {
      // Cache warming is best-effort; the models load normally on demand.
    })
}
