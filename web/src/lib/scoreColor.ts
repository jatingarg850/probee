/** Consistent score-band color across the assessment UI — same thresholds
 * everywhere a score gets colored (ring, bars, donut, confidence chips).
 *
 * These are deliberately the mid-weight (600-ish) shades rather than the
 * bright 400s: the app renders on a warm paper ground, and the lighter
 * variants washed out to near-invisible against it. */
export function scoreColor(score: number): string {
  if (score >= 7) return '#047857' // emerald 700
  if (score >= 4) return '#b45309' // amber 700
  return '#b91c1c' // red 700
}

export function scoreBandLabel(score: number): string {
  if (score >= 7) return 'Strong'
  if (score >= 4) return 'Developing'
  return 'Needs work'
}

/** Distinct, stable per-competency colors for the donut chart legend —
 * cycles if there are ever more competencies than colors. Tuned for
 * contrast against the bone card surface, and ordered so neighbouring
 * slices never sit in the same hue family. */
const COMPETENCY_PALETTE = ['#c2410c', '#1d4ed8', '#047857', '#7c3aed', '#b45309', '#0e7490', '#be185d']

export function competencyColor(index: number): string {
  return COMPETENCY_PALETTE[index % COMPETENCY_PALETTE.length]
}
