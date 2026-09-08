/**
 * Export the candidates table to a CSV file the recruiter can open in Excel
 * or Sheets, or hand to someone who isn't in PROBE at all.
 *
 * Hand-rolled rather than a library: the rows are flat scalars (no nested
 * objects, no embedded newlines to worry about beyond what `escapeCsvCell`
 * already handles), so a real CSV library would add a dependency to do what
 * a dozen lines already do correctly.
 */

export interface ExportableCandidateRow {
  candidateName: string
  candidateEmail: string
  jobTitle: string
  status: string
  overallScore: number | null
  strikes: number
  terminated: boolean
  startedAt: string | null
  endedAt: string | null
  durationSeconds: number | null
}

const COLUMNS: Array<{ header: string; value: (row: ExportableCandidateRow) => string }> = [
  { header: 'Candidate', value: (r) => r.candidateName },
  { header: 'Email', value: (r) => r.candidateEmail },
  { header: 'Role', value: (r) => r.jobTitle },
  { header: 'Status', value: (r) => r.status },
  { header: 'Overall score', value: (r) => (r.overallScore === null ? '' : r.overallScore.toFixed(1)) },
  { header: 'Integrity flags', value: (r) => String(r.strikes) },
  { header: 'Ended early', value: (r) => (r.terminated ? 'Yes' : 'No') },
  { header: 'Started at', value: (r) => (r.startedAt ? new Date(r.startedAt).toISOString() : '') },
  { header: 'Ended at', value: (r) => (r.endedAt ? new Date(r.endedAt).toISOString() : '') },
  {
    header: 'Duration (min)',
    value: (r) => (r.durationSeconds === null ? '' : String(Math.round(r.durationSeconds / 60))),
  },
]

/** Quotes a cell only when it needs it, and escapes embedded quotes by
 * doubling them — standard RFC4180, and enough to round-trip through Excel,
 * Sheets and back through this app's own CSV importer. */
function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function candidatesToCsv(rows: ExportableCandidateRow[]): string {
  const lines = [COLUMNS.map((c) => c.header).join(',')]
  for (const row of rows) {
    lines.push(COLUMNS.map((c) => escapeCsvCell(c.value(row))).join(','))
  }
  return lines.join('\r\n')
}

/** Triggers a browser download. A `﻿` BOM is prepended so Excel (which
 * otherwise guesses the wrong encoding for a plain UTF-8 CSV) renders names
 * with accents correctly rather than as mojibake. */
export function downloadCandidatesCsv(rows: ExportableCandidateRow[], filename: string): void {
  const csv = `﻿${candidatesToCsv(rows)}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } finally {
    URL.revokeObjectURL(url)
  }
}
