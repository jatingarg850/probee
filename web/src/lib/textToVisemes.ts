/** The 15 Oculus/ARKit viseme shapes present on this project's RPM-style
 * avatars (viseme_sil, viseme_PP, ... — see the morph target list on
 * Wolf3D_Head / Wolf3D_Teeth in the .glb). */
export type VisemeId =
  | 'viseme_sil'
  | 'viseme_PP'
  | 'viseme_FF'
  | 'viseme_TH'
  | 'viseme_DD'
  | 'viseme_kk'
  | 'viseme_CH'
  | 'viseme_SS'
  | 'viseme_nn'
  | 'viseme_RR'
  | 'viseme_aa'
  | 'viseme_E'
  | 'viseme_I'
  | 'viseme_O'
  | 'viseme_U'

/** How far the jaw drops for each viseme, 0 (fully closed) to 1 (wide open).
 *
 * This is what makes speech read as *words* rather than a mouth flapping
 * with volume: "m"/"p"/"b" must fully close the lips even mid-shout, while
 * "aa" opens wide even when spoken softly. The avatars have no jaw bone
 * (verified against the .glb's 67-joint skeleton — only Head/Neck/eyes
 * exist in the head), so jaw motion comes from the `jawOpen` morph, which
 * Wolf3D_Head AND Wolf3D_Teeth both carry — meaning the teeth travel with
 * the jaw exactly as they should. */
export const VISEME_JAW_OPEN: Record<VisemeId, number> = {
  viseme_sil: 0.0,
  viseme_PP: 0.0, // p/b/m — lips pressed shut
  viseme_FF: 0.12, // f/v — lower lip to upper teeth
  viseme_TH: 0.2, // th — tongue between teeth
  viseme_DD: 0.22, // t/d
  viseme_kk: 0.25, // k/g — back of tongue
  viseme_CH: 0.24, // ch/sh/j
  viseme_SS: 0.14, // s/z — teeth nearly closed
  viseme_nn: 0.18, // n/l
  viseme_RR: 0.3, // r
  viseme_aa: 0.95, // "ah" — widest
  viseme_E: 0.55, // "eh"
  viseme_I: 0.4, // "ih"
  viseme_O: 0.7, // "oh" — open and rounded
  viseme_U: 0.35, // "oo" — rounded but narrow
}

/** Viseme → ARKit blendshape weights.
 *
 * Ready Player Me exports ship ready-made `viseme_*` shapes, but the
 * Avatar-SDK style models in this project only carry the standard ARKit
 * set (jawOpen / mouthClose / mouthPucker / mouthFunnel / mouthStretch /
 * mouthPress / mouthLowerDown …). Those are enough to *build* each viseme,
 * which is what lets those avatars lip-sync properly instead of falling
 * back to a generic flap. `jawOpen` is applied separately from
 * VISEME_JAW_OPEN above; these are the lip/cheek shapes layered on top. */
export const VISEME_ARKIT_SHAPES: Record<VisemeId, Record<string, number>> = {
  viseme_sil: {},
  // Lips pressed firmly together.
  viseme_PP: { mouthClose: 0.9, mouthPressLeft: 0.6, mouthPressRight: 0.6 },
  // Lower lip tucks under the upper teeth.
  viseme_FF: { mouthLowerDownLeft: 0.5, mouthLowerDownRight: 0.5, mouthRollLower: 0.45 },
  viseme_TH: { mouthLowerDownLeft: 0.3, mouthLowerDownRight: 0.3, mouthShrugUpper: 0.3 },
  viseme_DD: { mouthStretchLeft: 0.2, mouthStretchRight: 0.2 },
  viseme_kk: { mouthStretchLeft: 0.15, mouthStretchRight: 0.15 },
  // Rounded and pushed forward, as in "ch"/"sh".
  viseme_CH: { mouthPucker: 0.55, mouthFunnel: 0.35 },
  // Wide and narrow — teeth close together.
  viseme_SS: { mouthStretchLeft: 0.45, mouthStretchRight: 0.45 },
  viseme_nn: { mouthStretchLeft: 0.15, mouthStretchRight: 0.15 },
  viseme_RR: { mouthPucker: 0.35, mouthFunnel: 0.2 },
  // Open and relaxed.
  viseme_aa: { mouthStretchLeft: 0.2, mouthStretchRight: 0.2 },
  viseme_E: { mouthStretchLeft: 0.4, mouthStretchRight: 0.4 },
  viseme_I: { mouthStretchLeft: 0.5, mouthStretchRight: 0.5, mouthSmileLeft: 0.2, mouthSmileRight: 0.2 },
  // Rounded "oh".
  viseme_O: { mouthFunnel: 0.6, mouthPucker: 0.35 },
  // Tight rounded "oo".
  viseme_U: { mouthPucker: 0.8, mouthFunnel: 0.45 },
}

/** Every ARKit shape referenced above — the renderer zeroes all of these
 * each frame before applying the active viseme, so shapes from a previous
 * viseme can't linger on the face. */
export const ARKIT_MOUTH_SHAPES: string[] = Array.from(
  new Set(Object.values(VISEME_ARKIT_SHAPES).flatMap((shapes) => Object.keys(shapes))),
)

/** Ordered so multi-letter graphemes ("th", "ch", "sh"...) are tried before
 * their single-letter components, letter-cluster → Preston Blair-style
 * viseme, the same grapheme groupings real-time web lipsync tools use when
 * there's no phoneme/audio-alignment API available (which is the case
 * here — Agora's pipeline hands us words and timing, not phonemes). This
 * doesn't require correct pronunciation, just a plausible mouth shape per
 * letter cluster so the mouth reads as "saying that word" rather than
 * generic chatter. */
const GRAPHEME_VISEMES: Array<[string, VisemeId]> = [
  ['tch', 'viseme_CH'],
  ['dge', 'viseme_CH'],
  ['th', 'viseme_TH'],
  ['ch', 'viseme_CH'],
  ['sh', 'viseme_CH'],
  ['zh', 'viseme_CH'],
  ['ph', 'viseme_FF'],
  ['ng', 'viseme_kk'],
  ['oo', 'viseme_U'],
  ['ou', 'viseme_U'],
  ['ow', 'viseme_O'],
  ['oy', 'viseme_O'],
  ['ai', 'viseme_E'],
  ['ay', 'viseme_E'],
  ['ee', 'viseme_I'],
  ['ea', 'viseme_I'],
  ['p', 'viseme_PP'],
  ['b', 'viseme_PP'],
  ['m', 'viseme_PP'],
  ['f', 'viseme_FF'],
  ['v', 'viseme_FF'],
  ['t', 'viseme_DD'],
  ['d', 'viseme_DD'],
  ['k', 'viseme_kk'],
  ['g', 'viseme_kk'],
  ['c', 'viseme_kk'],
  ['q', 'viseme_kk'],
  ['j', 'viseme_CH'],
  ['x', 'viseme_SS'],
  ['s', 'viseme_SS'],
  ['z', 'viseme_SS'],
  ['n', 'viseme_nn'],
  ['l', 'viseme_nn'],
  ['r', 'viseme_RR'],
  ['a', 'viseme_aa'],
  ['e', 'viseme_E'],
  ['i', 'viseme_I'],
  ['o', 'viseme_O'],
  ['u', 'viseme_U'],
  ['w', 'viseme_U'],
  ['y', 'viseme_I'],
  ['h', 'viseme_sil'],
]

/** Converts a word into an ordered sequence of viseme shapes by walking its
 * letters and matching the longest grapheme cluster at each position. Not
 * phonetically accurate, but produces a distinct, word-shaped sequence of
 * mouth movements instead of the previous random cycling — the mouth now
 * closes on "m"/"p"/"b", opens wide on "a", rounds on "o"/"u", etc., matched
 * to what's actually being said. */
export function wordToVisemes(word: string): VisemeId[] {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!letters) return ['viseme_sil']

  const visemes: VisemeId[] = []
  let i = 0
  while (i < letters.length) {
    let matched = false
    for (const [grapheme, viseme] of GRAPHEME_VISEMES) {
      if (letters.startsWith(grapheme, i)) {
        visemes.push(viseme)
        i += grapheme.length
        matched = true
        break
      }
    }
    if (!matched) i += 1
  }

  return visemes.length > 0 ? visemes : ['viseme_sil']
}
