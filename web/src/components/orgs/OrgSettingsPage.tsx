'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { AlertCircle, AlertTriangle, Check } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import { PageContainer, PageHeader } from '@/components/ui/page'
import { useOrgs } from '@/contexts/OrgContext'
import { authHeaders, readApiError } from '@/lib/clientAuth'
import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS, type OrgRole } from '@/lib/orgTypes'

// No width baked in — see JobForm.tsx's identical fix for why composing
// this with an explicit w-* utility (as the retention-days input below
// does) previously lost to this class's own `w-full`: same-specificity
// Tailwind utilities resolve by their order in the *compiled* stylesheet,
// not by source order in `className`, so `w-32` was silently overridden
// and the field rendered full-width instead of narrow.
const fieldBaseClass =
  'rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground transition-colors focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60'
const fieldClass = `${fieldBaseClass} w-full`
const labelClass = 'flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground'

interface OrgDetail {
  id: string
  name: string
  slug: string
  plan: string
  role: OrgRole
  retentionDays: number
}

export function OrgSettingsPage({ orgId }: { orgId: string }) {
  const router = useRouter()
  const { refresh: refreshOrgs } = useOrgs()

  const [org, setOrg] = useState<OrgDetail | null>(null)
  const [name, setName] = useState('')
  const [retentionDays, setRetentionDays] = useState(365)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [dangerZoneOpen, setDangerZoneOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/orgs/${orgId}`, { headers: authHeaders() })
        if (!response.ok) throw new Error(await readApiError(response, 'Could not load this organisation.'))
        const { organization } = await response.json()
        if (cancelled) return
        setOrg(organization)
        setName(organization.name)
        setRetentionDays(organization.retentionDays)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this organisation.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [orgId])

  // Only an owner can change anything. The fields still render for everyone
  // else, disabled — seeing what the settings *are* is useful even when you
  // cannot change them, and hiding them would just raise the question.
  const canEdit = org?.role === 'owner'
  const dirty = org !== null && (name !== org.name || retentionDays !== org.retentionDays)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSaving || !dirty) return
    setIsSaving(true)
    setError(null)
    setSaved(false)
    try {
      const response = await fetch(`/api/orgs/${orgId}`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: name.trim(), retentionDays }),
      })
      if (!response.ok) throw new Error(await readApiError(response, 'Could not save settings.'))
      const { organization } = await response.json()
      setOrg(organization)
      setName(organization.name)
      setRetentionDays(organization.retentionDays)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (isDeleting || !org || confirmText !== org.name) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const response = await fetch(`/api/orgs/${orgId}`, {
        method: 'DELETE',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ confirmName: confirmText }),
      })
      if (!response.ok) throw new Error(await readApiError(response, 'Could not delete this organisation.'))
      // The sidebar and switcher read from OrgContext, so this has to refresh
      // before the redirect or they would still list an organisation that no
      // longer exists until the next full load.
      await refreshOrgs()
      router.push('/')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this organisation.')
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-2 border-b border-border pb-5">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-7 w-32 rounded" />
        </div>
        <div className="mt-6 flex flex-col gap-5">
          <div className="rounded-xl border border-border p-4">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="mt-4 flex flex-col gap-4">
              <div className="skeleton h-10 w-full rounded-lg" />
              <div className="skeleton h-10 w-2/3 rounded-lg" />
              <div className="skeleton h-6 w-20 rounded-full" />
            </div>
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="skeleton h-3 w-32 rounded" />
            <div className="mt-4 skeleton h-10 w-40 rounded-lg" />
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Organisation"
        title="Settings"
        description={
          canEdit
            ? 'Change the name candidates see, and how long their data is kept.'
            : 'How this organisation is configured. Only an owner can change these.'
        }
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Card className="overflow-hidden">
          <CardHeader title="Details" />
          <div className="flex flex-col gap-5 p-4">
            <label className={labelClass}>
              Name
              <input
                className={fieldClass}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setSaved(false)
                }}
                maxLength={80}
                disabled={!canEdit || isSaving}
              />
              <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                Candidates see this when they are invited.
              </span>
            </label>

            <div className={labelClass}>
              Address
              <p className="rounded-lg border border-border bg-surface/60 px-3.5 py-2.5">
                <code className="text-[13px] text-foreground">{org?.slug}</code>
              </p>
              <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                Fixed once created — it may already be in an invitation link somebody is holding.
              </span>
            </div>

            <div className={labelClass}>
              Plan
              <div>{org ? <Badge>{org.plan}</Badge> : null}</div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Data and retention" />
          <div className="flex flex-col gap-5 p-4">
            <label className={labelClass}>
              Keep candidate data for
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className={`${fieldBaseClass} w-32 tabular-nums`}
                  value={retentionDays}
                  onChange={(e) => {
                    setRetentionDays(Number(e.target.value))
                    setSaved(false)
                  }}
                  min={MIN_RETENTION_DAYS}
                  max={MAX_RETENTION_DAYS}
                  step={1}
                  disabled={!canEdit || isSaving}
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <span className="max-w-[60ch] text-[11px] font-normal normal-case leading-relaxed tracking-normal text-muted-foreground">
                Between {MIN_RETENTION_DAYS} and {MAX_RETENTION_DAYS}. The floor exists because a candidate needs time
                to request their data — in Illinois they have 30 days to ask for deletion, which means nothing if the
                record is already gone.
              </span>
            </label>

            <p className="rounded-lg border border-warning/35 bg-warning/[0.07] px-3.5 py-3 text-[12.5px] leading-relaxed text-foreground">
              <strong className="font-semibold">Not yet enforced automatically.</strong> This value is stored and will
              drive automatic deletion once that job ships. Until then, deleting data on request is a manual process.
            </p>
          </div>
        </Card>

        {error ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSaving || !dirty} className="h-11">
              {isSaving ? (
                <>
                  <LoadingDots />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
            {saved && !dirty ? (
              <span className="flex items-center gap-1.5 text-[13px] text-success">
                <Check className="h-4 w-4" />
                Saved
              </span>
            ) : null}
          </div>
        ) : null}
      </form>

      {/* Owner-only, and outside the settings form — deleting an organisation
          is not a field you save, it is its own irreversible action, and
          giving it a separate confirm-by-typing flow keeps it from ever being
          triggered by the same click that saves a name change. */}
      {canEdit ? (
        <Card className="overflow-hidden border-destructive/30">
          <CardHeader
            title="Danger zone"
            action={
              !dangerZoneOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setDangerZoneOpen(true)}
                >
                  Delete organisation
                </Button>
              ) : null
            }
          />

          {dangerZoneOpen ? (
            <div className="flex flex-col gap-4 p-4">
              <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>
                  This permanently deletes <strong className="font-semibold">{org?.name}</strong>, its jobs, its team
                  and every pending invitation. There is no undo.
                </span>
              </p>

              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Candidate interviews already recorded — transcripts, scores, consent records — are kept, governed by the
                retention setting above, the same as they are today. This deletes the organisation itself, not its
                compliance history.
              </p>

              <label className={labelClass}>
                Type <span className="font-mono normal-case tracking-normal text-foreground">{org?.name}</span> to
                confirm
                <input
                  className={fieldClass}
                  value={confirmText}
                  onChange={(event) => {
                    setConfirmText(event.target.value)
                    setDeleteError(null)
                  }}
                  disabled={isDeleting}
                  autoComplete="off"
                  placeholder={org?.name}
                />
              </label>

              {deleteError ? (
                <p
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-sm text-destructive"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {deleteError}
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isDeleting || confirmText !== org?.name}
                  onClick={handleDelete}
                  className="h-11"
                >
                  {isDeleting ? (
                    <>
                      <LoadingDots />
                      Deleting…
                    </>
                  ) : (
                    'Permanently delete'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isDeleting}
                  onClick={() => {
                    setDangerZoneOpen(false)
                    setConfirmText('')
                    setDeleteError(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </PageContainer>
  )
}
