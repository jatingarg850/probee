'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { AlertCircle, Check, Copy, Trash, Upload, UserPlus } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import {
  CANDIDATE_INVITE_TTL_DAYS_DEFAULT,
  CANDIDATE_INVITE_TTL_DAYS_MAX,
  CANDIDATE_INVITE_TTL_DAYS_MIN,
} from '@/lib/candidateInviteTypes'
import { authHeaders, readApiError } from '@/lib/clientAuth'
import { type ParsedCandidateFileRow, parseCandidateFile } from '@/lib/parseCandidateFile'

/**
 * Inviting candidates to one job, and seeing who has been invited (M1-6).
 *
 * ============================================================
 * ONE BOX, NOT TWO MODES
 * ============================================================
 * There is no "single invite" tab and "bulk import" tab. A recruiter inviting
 * one person types one line; a recruiter inviting forty pastes forty. The
 * server parses `email`, `email,name` and `Name <email>` because those are
 * what actually comes out of a spreadsheet or an email client, and it reports
 * per-row failures rather than rejecting the batch — one typo in row 40 should
 * not cost you rows 1 to 39.
 *
 * ============================================================
 * EVERY LINK IS SHOWN, EVEN WHEN THE EMAIL SENT
 * ============================================================
 * The plaintext token exists exactly once, in the response to this request.
 * If email is not configured, or a candidate's mail server bounced it, the
 * recruiter's only recovery is the link — and asking them to re-invite to get
 * one back would issue a *new* token, silently invalidating a link the
 * candidate may already be holding.
 */

interface InviteRow {
  id: string
  candidateEmail: string
  candidateName: string
  status: 'pending' | 'consented' | 'started' | 'completed' | 'declined' | 'revoked'
  expiresAt: string
  createdAt: string
  sessionId: string | null
  expired: boolean
}

interface SentRow {
  email: string
  status: 'invited' | 'reissued'
  emailed: boolean
  inviteUrl: string
}

/** Plain words for a state a recruiter is scanning, not the enum value. */
const STATUS_LABEL: Record<InviteRow['status'], string> = {
  pending: 'Invited',
  consented: 'Agreed, not started',
  started: 'In progress',
  completed: 'Interviewed',
  declined: 'Declined AI interview',
  revoked: 'Cancelled',
}

const STATUS_TONE: Record<InviteRow['status'], string> = {
  pending: 'text-muted-foreground',
  consented: 'text-muted-foreground',
  started: 'text-accent',
  completed: 'text-success',
  declined: 'text-warning',
  revoked: 'text-muted-foreground',
}

export function JobCandidatesPanel({ orgId, jobId, jobStatus }: { orgId: string; jobId: string; jobStatus: string }) {
  const [rows, setRows] = useState<InviteRow[]>([])
  const [canInvite, setCanInvite] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [text, setText] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(CANDIDATE_INVITE_TTL_DAYS_DEFAULT)
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sent, setSent] = useState<SentRow[] | null>(null)
  const [rejected, setRejected] = useState<Array<{ line: number; value: string; error: string }>>([])

  const [fileName, setFileName] = useState<string | null>(null)
  const [fileRows, setFileRows] = useState<ParsedCandidateFileRow[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [isParsingFile, setIsParsingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const base = `/api/orgs/${orgId}/jobs/${jobId}/candidates`

  const clearFile = () => {
    setFileName(null)
    setFileRows([])
    setFileErrors([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFile = async (file: File) => {
    setIsParsingFile(true)
    setSendError(null)
    setFileName(file.name)
    try {
      const { rows, errors } = await parseCandidateFile(file)
      setFileRows(rows)
      setFileErrors(errors)
    } finally {
      setIsParsingFile(false)
    }
  }

  const load = useCallback(async () => {
    try {
      const response = await fetch(base, { headers: authHeaders() })
      if (!response.ok) throw new Error(await readApiError(response, 'Could not load candidates.'))
      const data = await response.json()
      setRows(data.invitations ?? [])
      setCanInvite(Boolean(data.canInvite))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load candidates.')
    } finally {
      setIsLoading(false)
    }
  }, [base])

  useEffect(() => {
    load()
  }, [load])

  const hasFileRows = fileRows.length > 0
  const canSubmit = text.trim().length > 0 || hasFileRows

  const invite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSending || !canSubmit) return
    setIsSending(true)
    setSendError(null)
    setSent(null)
    setRejected([])
    try {
      // A parsed file takes priority: it is a structured, already-validated
      // list, whereas `text` still needs the server's own line-format parser.
      // The two are mutually exclusive in the UI, so this never silently
      // drops one in favour of the other.
      const body = hasFileRows ? { candidates: fileRows, expiresInDays } : { text, expiresInDays }
      const response = await fetch(base, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error ?? 'Could not send those invitations.')

      setSent(data.invited ?? [])
      setRejected([
        ...(data.rejected ?? []),
        ...(data.failed ?? []).map((f: { email: string; error: string }) => ({
          line: 0,
          value: f.email,
          error: f.error,
        })),
      ])
      setText('')
      clearFile()
      await load()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send those invitations.')
    } finally {
      setIsSending(false)
    }
  }

  const jobIsOpen = jobStatus === 'open'

  return (
    <div className="mt-8 flex flex-col gap-5 border-t border-border pt-8">
      <div>
        <h2 className="text-[1.25rem] font-bold tracking-tight text-foreground">Candidates</h2>
        <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-muted-foreground">
          Each candidate gets their own link. They need no account — they open it, read what the interview involves,
          agree, and sit it. The link works once.
        </p>
      </div>

      {canInvite ? (
        <Card className="overflow-hidden">
          <CardHeader title="Invite" />
          {!jobIsOpen ? (
            <p className="border-b border-border bg-warning/[0.07] px-4 py-3 text-[13px] leading-relaxed text-foreground">
              This job is <strong className="font-semibold">{jobStatus}</strong>. Set it to open before inviting anyone
              — a candidate opening a link to a draft or closed role is turned away.
            </p>
          ) : null}
          <form onSubmit={invite} className="flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Candidates
              <textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value)
                  setSendError(null)
                }}
                disabled={isSending || !jobIsOpen || hasFileRows}
                rows={4}
                spellCheck={false}
                placeholder={'ada@example.com\nGrace Hopper <grace@example.com>\nalan@example.com, Alan Turing'}
                className="w-full resize-y rounded-lg border border-border bg-background px-3.5 py-3 font-mono text-[13px] leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                One per line. An email on its own is fine; a name helps the panel address them properly. Re-inviting
                somebody replaces their old link rather than creating a second interview.
              </span>
            </label>

            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-surface/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] font-medium text-foreground">
                  Or upload a CSV / Excel file
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    — one "email" column, an optional "name" column
                  </span>
                </p>
                <span className="relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) handleFile(file)
                    }}
                    disabled={isSending || !jobIsOpen || isParsingFile}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    aria-label="Upload a CSV or Excel candidate list"
                  />
                  <span className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/30">
                    {isParsingFile ? <LoadingDots /> : <Upload className="h-3.5 w-3.5" />}
                    {isParsingFile ? 'Reading…' : 'Choose file'}
                  </span>
                </span>
              </div>

              {fileName ? (
                <div className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="min-w-0 truncate text-muted-foreground">
                    <code className="text-foreground">{fileName}</code>
                    {hasFileRows ? ` · ${fileRows.length} candidate${fileRows.length === 1 ? '' : 's'} found` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="flex shrink-0 items-center gap-1 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              ) : null}
              {fileErrors.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {fileErrors.slice(0, 5).map((message) => (
                    <li key={message} className="text-[12px] text-warning">
                      {message}
                    </li>
                  ))}
                  {fileErrors.length > 5 ? (
                    <li className="text-[12px] text-muted-foreground">
                      + {fileErrors.length - 5} more row{fileErrors.length - 5 === 1 ? '' : 's'} skipped
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>

            <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:w-64">
              Link expires in
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={CANDIDATE_INVITE_TTL_DAYS_MIN}
                  max={CANDIDATE_INVITE_TTL_DAYS_MAX}
                  value={expiresInDays}
                  onChange={(event) => setExpiresInDays(Number(event.target.value))}
                  disabled={isSending || !jobIsOpen}
                  className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums text-foreground transition-colors focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span className="text-[12.5px] font-normal normal-case tracking-normal text-muted-foreground">
                  days ({CANDIDATE_INVITE_TTL_DAYS_MIN}–{CANDIDATE_INVITE_TTL_DAYS_MAX})
                </span>
              </div>
            </label>

            <div>
              <Button type="submit" disabled={isSending || !canSubmit || !jobIsOpen} className="h-11">
                {isSending ? <LoadingDots /> : <UserPlus className="h-4 w-4" />}
                {isSending ? 'Sending…' : 'Send invitations'}
              </Button>
            </div>
          </form>

          {sendError ? (
            <p
              role="alert"
              className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/[0.07] px-4 py-3 text-[13px] leading-relaxed text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {sendError}
            </p>
          ) : null}

          {rejected.length > 0 ? (
            <div className="border-t border-warning/35 bg-warning/[0.07] px-4 py-3">
              <p className="text-[13px] font-medium text-foreground">
                {rejected.length} {rejected.length === 1 ? 'line was' : 'lines were'} skipped
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {rejected.map((row) => (
                  <li key={`${row.line}-${row.value}`} className="text-[12.5px] leading-relaxed text-muted-foreground">
                    <code className="text-foreground">{row.value}</code> — {row.error}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {sent && sent.length > 0 ? (
            <div className="border-t border-border bg-surface/60 px-4 py-3.5">
              <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <Check className="h-4 w-4 text-success" />
                {sent.length} {sent.length === 1 ? 'invitation' : 'invitations'} created
                {sent.every((row) => row.emailed) ? ' and emailed.' : '.'}
              </p>
              {!sent.every((row) => row.emailed) ? (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  Some could not be emailed from this deployment. Send those links yourself — they are not shown again.
                </p>
              ) : (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  You can also send these links directly. They are not shown again.
                </p>
              )}
              <ul className="mt-2.5 flex flex-col gap-2">
                {sent.map((row) => (
                  <li key={row.email}>
                    <p className="text-[12.5px] text-muted-foreground">
                      {row.email}
                      {row.status === 'reissued' ? ' · link replaced' : ''}
                      {row.emailed ? '' : ' · not emailed'}
                    </p>
                    <CopyableLink url={row.inviteUrl} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader title={`Invited (${rows.length})`} />
        {loadError ? (
          <p role="alert" className="px-4 py-4 text-[13px] text-destructive">
            {loadError}
          </p>
        ) : isLoading ? (
          <div className="flex flex-col gap-0 divide-y divide-border">
            {['a', 'b', 'c'].map((key) => (
              <div key={key} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="skeleton h-3.5 w-40 rounded" />
                  <div className="skeleton h-3 w-56 rounded" />
                </div>
                <div className="skeleton h-5 w-16 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-[13.5px] leading-relaxed text-muted-foreground">
            Nobody yet. Add candidates above and each will get their own interview link.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <CandidateRow key={row.id} row={row} base={base} canInvite={canInvite} onChanged={load} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function CandidateRow({
  row,
  base,
  canInvite,
  onChanged,
}: {
  row: InviteRow
  base: string
  canInvite: boolean
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A completed interview cannot be withdrawn: the assessment exists and the
  // candidate sat it. Removing that would defeat the audit trail the whole
  // product is built to keep.
  const cancellable = canInvite && row.status !== 'completed' && row.status !== 'revoked'

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {row.candidateName || row.candidateEmail}
            {row.candidateName ? (
              <span className="ml-2 font-normal text-muted-foreground">{row.candidateEmail}</span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            <span className={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</span>
            {row.status === 'pending' || row.status === 'consented' ? (
              <>
                {' · '}
                {row.expired ? (
                  <span className="text-warning">Link expired — invite again</span>
                ) : (
                  `Expires ${new Date(row.expiresAt).toLocaleDateString()}`
                )}
              </>
            ) : null}
          </p>
        </div>

        {row.status === 'completed' ? <Badge>Scored</Badge> : null}

        {cancellable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                const response = await fetch(`${base}/${row.id}`, { method: 'DELETE', headers: authHeaders() })
                if (!response.ok) throw new Error(await readApiError(response, 'Could not cancel that invitation.'))
                await onChanged()
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not cancel that invitation.')
                setBusy(false)
              }
            }}
          >
            {busy ? <LoadingDots /> : null}
            Cancel
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[12.5px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function CopyableLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-1 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-1.5 text-[11.5px] text-muted-foreground">
        {url}
      </code>
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            // Clipboard access can be denied; the link is selectable anyway.
          }
        }}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}
