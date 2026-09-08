'use client'

import dynamic from 'next/dynamic'

import { PANEL_AVATAR_ORDER } from '@/lib/panelAvatars'

// Heavy (three.js/@react-three/fiber/drei + PanelAvatarStage itself) —
// loaded only once this component actually mounts, not as part of whichever
// screen renders it. Mirrors ConversationComponent's own dynamic() split,
// and for the same reason: a static import of PanelAvatarStage anywhere
// pulls the whole 3D stack into that route's main chunk.
const PanelStage = dynamic(() => import('@/components/PanelAvatarStage').then((mod) => mod.PanelStage), {
  ssr: false,
})

const NO_VOLUME = () => 0

/** Actually renders the panel's three avatars into a real WebGL context,
 * once, off-screen — rather than only warming the .glb *asset* cache the
 * way `preloadAllPanelAvatars` does.
 *
 * Fetching and parsing the model file is most of the first-load cost, but
 * not all of it: the first time a mesh actually renders, the browser still
 * has to compile its shaders and upload its textures and geometry to the
 * GPU, and that work only happens once a `<Canvas>` exists and paints a
 * frame. Mounting the full three-seat `PanelStage` here — hidden, silent,
 * nobody "active" — pays that GPU cost during the camera check instead of
 * on the candidate's first real look at the panel, which is exactly the
 * worst moment for a live call to be doing it.
 *
 * Deliberately not hidden via `display:none` / `visibility:hidden`:
 * browsers can pause rendering (and, in the worst case, reclaim the WebGL
 * context) for elements pulled out of layout that way, which would defeat
 * the entire point of warming it early. A fully transparent, inert,
 * 2x2px canvas stays a genuinely live, rendering element while being
 * invisible and unclickable. */
export function PanelAvatarWarmup() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 h-0.5 w-0.5 overflow-hidden opacity-0">
      <PanelStage activeId={PANEL_AVATAR_ORDER[0]} isSpeaking={false} getVolume={NO_VOLUME} className="h-full w-full" />
    </div>
  )
}
