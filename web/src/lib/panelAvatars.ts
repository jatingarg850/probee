export type PanelistId = 'technical_interviewer' | 'product_manager' | 'hiring_manager'

export interface PanelAvatarDef {
  id: PanelistId
  label: string
  /** The TTS voice name this persona speaks with (must match voice_default
   * in server/src/agent.py's PANEL_DEFS — used only for display, e.g. the
   * transcript panel's speaker label). */
  voiceName: string
  modelUrl: string
  accentColor: string
}

/** One interviewer per panel seat (mirrors PANEL_ORDER in server/src/agent.py).
 *
 * Each seat points at its own distinct .glb. Note these reference the source
 * filenames directly rather than copies under per-persona names: overwriting
 * a file in place keeps the same URL, and both the browser HTTP cache and
 * three's useGLTF cache key on URL — so a swapped-in model kept rendering as
 * the old one until a hard reload. Distinct paths make a model change take
 * effect immediately. */
export const PANEL_AVATARS: Record<PanelistId, PanelAvatarDef> = {
  technical_interviewer: {
    id: 'technical_interviewer',
    label: 'Technical Interviewer',
    voiceName: 'Abhinav',
    // Male model — matches the "Abhinav" TTS voice for this seat.
    modelUrl: '/models/model_m.glb',
    accentColor: '#6ea8fe',
  },
  product_manager: {
    id: 'product_manager',
    label: 'Product Manager',
    voiceName: 'Anisha',
    modelUrl: '/models/model.glb',
    accentColor: '#f9a8d4',
  },
  hiring_manager: {
    id: 'hiring_manager',
    label: 'Hiring Manager',
    voiceName: 'Alia',
    modelUrl: '/models/hiring_manager.glb',
    accentColor: '#86efac',
  },
}

/** persona id -> TTS voice name, derived from PANEL_AVATARS so there's one
 * place this mapping can drift out of sync with the backend instead of
 * three (it previously had product_manager/hiring_manager swapped in two
 * separate hardcoded copies — this is why "Anisha" showed up for the
 * technical interviewer). */
export const PANEL_VOICE_NAMES: Record<PanelistId, string> = Object.fromEntries(
  (Object.keys(PANEL_AVATARS) as PanelistId[]).map((id) => [id, PANEL_AVATARS[id].voiceName]),
) as Record<PanelistId, string>

export const PANEL_AVATAR_ORDER: PanelistId[] = ['technical_interviewer', 'product_manager', 'hiring_manager']

export function isPanelistId(value: string | undefined | null): value is PanelistId {
  return !!value && value in PANEL_AVATARS
}
