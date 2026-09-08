import * as XLSX from 'xlsx'

/**
 * Turn an uploaded CSV/XLSX candidate list into rows the invite endpoint
 * already understands (`{ email, name }`, the same shape `parseCandidateList`
 * produces from pasted text).
 *
 * Runs entirely in the browser — the file never has to round-trip through a
 * server just to find out which column is which. The server still
 * re-validates every email with `normaliseEmail` when the invite is actually
 * created; this is only good enough to show the recruiter a preview and stop
 * an obviously-wrong file before it's submitted.
 */

const MAX_ROWS = 200 // mirrors MAX_BULK_INVITES in candidateInvites.ts
const MAX_FILE_BYTES = 2 * 1024 * 1024 // a candidate list is never legitimately bigger than this
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ParsedCandidateFileRow {
  email: string
  name: string
}

export interface ParsedCandidateFile {
  rows: ParsedCandidateFileRow[]
  errors: string[]
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalised = headers.map((h) => h.trim().toLowerCase())
  for (const candidate of candidates) {
    const index = normalised.indexOf(candidate)
    if (index !== -1) return index
  }
  return -1
}

/** Minimal RFC4180-ish line splitter: handles quoted fields containing commas
 * or escaped quotes, which is as far as a real spreadsheet export goes. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}

function rowsFromTable(headerRow: string[], dataRows: string[][]): ParsedCandidateFile {
  const emailCol = findColumn(headerRow, ['email', 'e-mail', 'email address', 'candidate email'])
  const nameCol = findColumn(headerRow, ['name', 'full name', 'candidate name', 'candidate'])

  if (emailCol === -1) {
    return { rows: [], errors: ['No "email" column found. The first row must be a header with an "email" column.'] }
  }

  const rows: ParsedCandidateFileRow[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i]
    const rawEmail = (cells[emailCol] ?? '').trim()
    if (!rawEmail) continue // a blank trailing row is normal, not an error

    if (rows.length >= MAX_ROWS) {
      errors.push(`Row ${i + 2}: only ${MAX_ROWS} candidates can be invited at once — the rest were skipped.`)
      break
    }

    const email = rawEmail.toLowerCase()
    if (!EMAIL_RE.test(email)) {
      errors.push(`Row ${i + 2}: "${rawEmail}" doesn't look like an email address.`)
      continue
    }
    if (seen.has(email)) continue // duplicates are dropped silently, same as the paste path
    seen.add(email)

    const name = nameCol === -1 ? '' : (cells[nameCol] ?? '').trim().slice(0, 100)
    rows.push({ email, name })
  }

  return { rows, errors }
}

async function parseCsv(file: File): Promise<ParsedCandidateFile> {
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { rows: [], errors: ['That file is empty.'] }

  const table = lines.map(splitCsvLine)
  return rowsFromTable(table[0], table.slice(1))
}

async function parseExcel(file: File): Promise<ParsedCandidateFile> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { rows: [], errors: ['That workbook has no sheets.'] }

  const sheet = workbook.Sheets[sheetName]
  const table: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false })
  if (table.length === 0) return { rows: [], errors: ['That sheet is empty.'] }

  const headerRow = table[0].map((cell) => String(cell))
  const dataRows = table.slice(1).map((row) => row.map((cell) => String(cell)))
  return rowsFromTable(headerRow, dataRows)
}

export async function parseCandidateFile(file: File): Promise<ParsedCandidateFile> {
  if (file.size > MAX_FILE_BYTES) {
    return { rows: [], errors: [`That file is too large (max ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB).`] }
  }

  const name = file.name.toLowerCase()
  try {
    if (name.endsWith('.csv')) return await parseCsv(file)
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return await parseExcel(file)
    return { rows: [], errors: ['Only .csv, .xlsx and .xls files are supported.'] }
  } catch {
    return { rows: [], errors: ['Could not read that file — make sure it is a valid CSV or Excel export.'] }
  }
}
