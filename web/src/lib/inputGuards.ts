/** Lightweight, no-network sanity check for free-text "target role"/career
 * fields — not a replacement for the server's own (Gemini-backed) judgment
 * call in resume.py, just a fast first pass that catches empty input,
 * keyboard mashing, and pure symbol/number strings before spending an API
 * call and the user's time on an interview or analysis built around
 * nonsense input. */
export function isPlausibleRoleInput(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < 2 || trimmed.length > 100) return false

  // Must contain at least one real "word" (2+ letters in a row).
  if (!/[a-zA-Z]{2,}/.test(trimmed)) return false

  // Majority of the string should be letters/spaces, not digits or symbols.
  const letterCount = (trimmed.match(/[a-zA-Z]/g) ?? []).length
  if (letterCount / trimmed.length < 0.5) return false

  // Keyboard-mashing tell: a long "word" with no vowels at all
  // (e.g. "asdkjfhskjdf") almost never occurs in a real job title.
  const words = trimmed.split(/\s+/)
  const looksLikeMashing = words.some((w) => w.length >= 8 && !/[aeiouAEIOU]/.test(w))
  if (looksLikeMashing) return false

  return true
}

export const IMPLAUSIBLE_ROLE_MESSAGE =
  'That doesn\'t look like a real target role — try something like "Backend Engineer" or "Product Manager".'
