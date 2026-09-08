import { describe, expect, test } from 'bun:test'

import { DEFAULT_COMPETENCIES, JOB_STATUSES, PANEL_SEATS, validateJobInput } from '@/lib/jobs'

const valid = {
  title: 'Senior Backend Engineer',
  level: 'Senior',
  description: 'Own our payments platform end to end.',
}

describe('validateJobInput — required fields', () => {
  test('accepts a minimal job and fills sensible defaults', () => {
    const result = validateJobInput(valid)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.competencies).toEqual(DEFAULT_COMPETENCIES)
    expect(result.value.panelSeats).toEqual([...PANEL_SEATS])
    expect(result.value.durationMinutes).toBe(15)
    expect(result.value.status).toBe('draft')
    expect(result.value.mustAskQuestions).toEqual([])
  })

  test('the default competencies are themselves valid', () => {
    // Guards against someone editing DEFAULT_COMPETENCIES to something the
    // validator would reject, which would make every new job fail.
    const result = validateJobInput({ ...valid, competencies: DEFAULT_COMPETENCIES })
    expect(result.ok).toBe(true)
  })

  test('rejects a missing title or description', () => {
    expect(validateJobInput({ ...valid, title: '   ' }).ok).toBe(false)
    expect(validateJobInput({ ...valid, description: '' }).ok).toBe(false)
  })

  test('rejects a non-object payload', () => {
    expect(validateJobInput(null).ok).toBe(false)
    expect(validateJobInput('a job').ok).toBe(false)
  })

  test('rejects an over-long description at the same limit as the backend', () => {
    expect(validateJobInput({ ...valid, description: 'x'.repeat(10_001) }).ok).toBe(false)
    expect(validateJobInput({ ...valid, description: 'x'.repeat(10_000) }).ok).toBe(true)
  })
})

describe('validateJobInput — competency weights', () => {
  test('accepts weights that total 100', () => {
    const result = validateJobInput({
      ...valid,
      competencies: [
        { name: 'Technical', weight: 60 },
        { name: 'Communication', weight: 40 },
      ],
    })
    expect(result.ok).toBe(true)
  })

  test('rejects weights that do not total 100, and says the actual total', () => {
    const result = validateJobInput({
      ...valid,
      competencies: [
        { name: 'Technical', weight: 60 },
        { name: 'Communication', weight: 30 },
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('90')
  })

  test('accepts an even three-way split despite the floating-point remainder', () => {
    // 33.33 x 3 = 99.99. Rejecting this would be a bug the user could do
    // nothing about, which is why the total is rounded before comparing.
    const result = validateJobInput({
      ...valid,
      competencies: [
        { name: 'A', weight: 33.34 },
        { name: 'B', weight: 33.33 },
        { name: 'C', weight: 33.33 },
      ],
    })
    expect(result.ok).toBe(true)
  })

  test('rejects duplicate competency names regardless of case', () => {
    const result = validateJobInput({
      ...valid,
      competencies: [
        { name: 'Technical', weight: 50 },
        { name: 'technical', weight: 50 },
      ],
    })
    expect(result.ok).toBe(false)
  })

  test('rejects zero, negative and non-numeric weights', () => {
    for (const weight of [0, -10, 'lots', Number.NaN]) {
      const result = validateJobInput({
        ...valid,
        competencies: [
          { name: 'Technical', weight },
          { name: 'Other', weight: 50 },
        ],
      })
      expect(result.ok).toBe(false)
    }
  })

  test('rejects an empty competency list and an unnamed competency', () => {
    expect(validateJobInput({ ...valid, competencies: [] }).ok).toBe(false)
    expect(validateJobInput({ ...valid, competencies: [{ name: '', weight: 100 }] }).ok).toBe(false)
  })
})

describe('validateJobInput — panel seats', () => {
  test('accepts a subset', () => {
    const result = validateJobInput({ ...valid, panelSeats: ['hiring_manager'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.panelSeats).toEqual(['hiring_manager'])
  })

  test('normalises to PANEL_SEATS order regardless of input order', () => {
    const result = validateJobInput({
      ...valid,
      panelSeats: ['hiring_manager', 'technical_interviewer'],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.panelSeats).toEqual(['technical_interviewer', 'hiring_manager'])
  })

  test('de-duplicates', () => {
    const result = validateJobInput({ ...valid, panelSeats: ['product_manager', 'product_manager'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.panelSeats).toEqual(['product_manager'])
  })

  test('rejects an unknown seat and an empty panel', () => {
    expect(validateJobInput({ ...valid, panelSeats: ['ceo'] }).ok).toBe(false)
    expect(validateJobInput({ ...valid, panelSeats: [] }).ok).toBe(false)
  })
})

describe('validateJobInput — duration, questions, status', () => {
  test('accepts the boundary durations and rejects outside them', () => {
    expect(validateJobInput({ ...valid, durationMinutes: 5 }).ok).toBe(true)
    expect(validateJobInput({ ...valid, durationMinutes: 180 }).ok).toBe(true)
    expect(validateJobInput({ ...valid, durationMinutes: 4 }).ok).toBe(false)
    expect(validateJobInput({ ...valid, durationMinutes: 181 }).ok).toBe(false)
    expect(validateJobInput({ ...valid, durationMinutes: 15.5 }).ok).toBe(false)
  })

  test('drops blank must-ask questions rather than storing them', () => {
    const result = validateJobInput({ ...valid, mustAskQuestions: ['Real question?', '   ', ''] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.mustAskQuestions).toEqual(['Real question?'])
  })

  test('rejects too many questions and an over-long one', () => {
    expect(validateJobInput({ ...valid, mustAskQuestions: Array(21).fill('q') }).ok).toBe(false)
    expect(validateJobInput({ ...valid, mustAskQuestions: ['x'.repeat(501)] }).ok).toBe(false)
  })

  test('accepts every declared status and rejects anything else', () => {
    for (const status of JOB_STATUSES) {
      expect(validateJobInput({ ...valid, status }).ok).toBe(true)
    }
    expect(validateJobInput({ ...valid, status: 'archived' }).ok).toBe(false)
  })
})
