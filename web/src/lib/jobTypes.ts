/**
 * Job types and pure validation — safe to import from a browser bundle.
 *
 * Split from jobs.ts for the same reason as orgTypes: jobs.ts imports the
 * MongoDB driver, and a client component importing a value like `PANEL_SEATS`
 * from it would pull the driver into the browser bundle. The validator lives
 * here too, so the form and the route validate through exactly the same code.
 */

/** The panel seats available to a job. Mirrors PANEL_ORDER in agent.py — if
 * that list ever grows, this must grow with it or a job could request a seat
 * the backend cannot fill. */
export const PANEL_SEATS = ['technical_interviewer', 'product_manager', 'hiring_manager'] as const
export type PanelSeat = (typeof PANEL_SEATS)[number]

export const JOB_STATUSES = ['draft', 'open', 'closed'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export interface Competency {
  name: string
  /** Percentage of the overall score. Weights across a job sum to 100. */
  weight: number
}

/** Mirrors the five hardcoded names in `COMPETENCIES` (server/src/agent.py),
 * evenly weighted — so a job created without specifying any scores exactly the
 * way the practice product does today. */
export const DEFAULT_COMPETENCIES: Competency[] = [
  { name: 'Technical', weight: 20 },
  { name: 'Problem Solving', weight: 20 },
  { name: 'Communication', weight: 20 },
  { name: 'Product Thinking', weight: 20 },
  { name: 'Leadership', weight: 20 },
]

const TITLE_MAX = 120
const LEVEL_MAX = 60
/** Matches MAX_JOB_DESCRIPTION_CHARS in server/src/server.py. Rejecting here
 * as well means a bad job never reaches the point of failing at interview
 * time, when a candidate is already waiting. */
const DESCRIPTION_MAX = 10_000
const QUESTION_MAX = 500
const MAX_QUESTIONS = 20
const MAX_COMPETENCIES = 12
const WEIGHT_TOTAL = 100

export interface JobInput {
  title: string
  level: string
  description: string
  competencies: Competency[]
  panelSeats: PanelSeat[]
  durationMinutes: number
  mustAskQuestions: string[]
  status: JobStatus
}

export type ValidationResult = { ok: true; value: JobInput } | { ok: false; error: string }

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Validate and normalise a job payload.
 *
 * Pure and exported so it can be tested without a database, and so the create
 * and update routes cannot drift apart by validating differently.
 */
export function validateJobInput(input: unknown, { partial = false } = {}): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Expected a job object.' }
  }
  const raw = input as Record<string, unknown>

  const title = asString(raw.title)
  if (!partial || raw.title !== undefined) {
    if (!title) return { ok: false, error: 'A job title is required.' }
    if (title.length > TITLE_MAX) return { ok: false, error: `Title must be ${TITLE_MAX} characters or fewer.` }
  }

  const level = asString(raw.level)
  if (level.length > LEVEL_MAX) return { ok: false, error: `Level must be ${LEVEL_MAX} characters or fewer.` }

  const description = asString(raw.description)
  if (!partial || raw.description !== undefined) {
    if (!description) return { ok: false, error: 'A job description is required.' }
    if (description.length > DESCRIPTION_MAX) {
      return { ok: false, error: `Description must be ${DESCRIPTION_MAX} characters or fewer.` }
    }
  }

  // --- competencies ---
  let competencies = DEFAULT_COMPETENCIES
  if (raw.competencies !== undefined) {
    if (!Array.isArray(raw.competencies) || raw.competencies.length === 0) {
      return { ok: false, error: 'At least one competency is required.' }
    }
    if (raw.competencies.length > MAX_COMPETENCIES) {
      return { ok: false, error: `A job can score at most ${MAX_COMPETENCIES} competencies.` }
    }

    const parsed: Competency[] = []
    const seen = new Set<string>()
    for (const entry of raw.competencies) {
      const item = entry as Record<string, unknown>
      const name = asString(item?.name)
      const weight = typeof item?.weight === 'number' ? item.weight : Number.NaN

      if (!name) return { ok: false, error: 'Every competency needs a name.' }
      const key = name.toLowerCase()
      if (seen.has(key)) return { ok: false, error: `Duplicate competency: ${name}.` }
      seen.add(key)

      if (!Number.isFinite(weight) || weight <= 0) {
        return { ok: false, error: `Weight for ${name} must be a positive number.` }
      }
      parsed.push({ name, weight })
    }

    // Rounded before comparing: 33.33 x 3 is a legitimate way to split three
    // competencies evenly, and rejecting it on a floating-point remainder
    // would be a bug the user could not do anything about.
    const total = Math.round(parsed.reduce((sum, c) => sum + c.weight, 0) * 100) / 100
    if (total !== WEIGHT_TOTAL) {
      return { ok: false, error: `Competency weights must add up to ${WEIGHT_TOTAL}. They currently total ${total}.` }
    }
    competencies = parsed
  }

  // --- panel seats ---
  let panelSeats: PanelSeat[] = [...PANEL_SEATS]
  if (raw.panelSeats !== undefined) {
    if (!Array.isArray(raw.panelSeats) || raw.panelSeats.length === 0) {
      return { ok: false, error: 'A job needs at least one interviewer.' }
    }
    const unique = Array.from(new Set(raw.panelSeats.map((s) => String(s))))
    for (const seat of unique) {
      if (!(PANEL_SEATS as readonly string[]).includes(seat)) {
        return { ok: false, error: `Unknown interviewer: ${seat}.` }
      }
    }
    // Kept in PANEL_SEATS order rather than the order supplied, so the seat
    // sequence is stable regardless of how the client happened to serialise it.
    panelSeats = PANEL_SEATS.filter((seat) => unique.includes(seat))
  }

  // --- duration ---
  let durationMinutes = 15
  if (raw.durationMinutes !== undefined) {
    const value = Number(raw.durationMinutes)
    // Upper bound matches the backend's own limit on StartAgentRequest.
    if (!Number.isInteger(value) || value < 5 || value > 180) {
      return { ok: false, error: 'Duration must be a whole number of minutes between 5 and 180.' }
    }
    durationMinutes = value
  }

  // --- must-ask questions ---
  let mustAskQuestions: string[] = []
  if (raw.mustAskQuestions !== undefined) {
    if (!Array.isArray(raw.mustAskQuestions)) {
      return { ok: false, error: 'Must-ask questions must be a list.' }
    }
    const questions = raw.mustAskQuestions.map((q) => asString(q)).filter(Boolean)
    if (questions.length > MAX_QUESTIONS) {
      return { ok: false, error: `A job can require at most ${MAX_QUESTIONS} questions.` }
    }
    if (questions.some((q) => q.length > QUESTION_MAX)) {
      return { ok: false, error: `Each question must be ${QUESTION_MAX} characters or fewer.` }
    }
    mustAskQuestions = questions
  }

  // --- status ---
  let status: JobStatus = 'draft'
  if (raw.status !== undefined) {
    if (!(JOB_STATUSES as readonly string[]).includes(String(raw.status))) {
      return { ok: false, error: `Status must be one of: ${JOB_STATUSES.join(', ')}.` }
    }
    status = raw.status as JobStatus
  }

  return {
    ok: true,
    value: { title, level, description, competencies, panelSeats, durationMinutes, mustAskQuestions, status },
  }
}

/** A job as it crosses the wire: ids are strings, not ObjectIds. This is the
 * shape every client component and API response uses. */
export interface JobSummary {
  id: string
  organizationId: string
  title: string
  level: string
  description: string
  competencies: Competency[]
  panelSeats: PanelSeat[]
  durationMinutes: number
  mustAskQuestions: string[]
  status: JobStatus
  createdBy: string
  createdAt: Date
  updatedAt: Date
}
