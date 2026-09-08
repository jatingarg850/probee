'use client'

import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { AlertCircle, Check, Copy, Trash, UserPlus } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import { PageContainer, PageHeader } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { useOrgs } from '@/contexts/OrgContext'
import {
  type InvitationRow,
  type MemberRow,
  type TeamResponse,
  changeMemberRole,
  fetchTeam,
  inviteMember,
  removeMemberRequest,
  revokeInvitationRequest,
} from '@/lib/orgApi'
import { ORG_ROLES, type OrgRole } from '@/lib/orgTypes'

/** What each role can actually do. Written from the reader's side — "can
 * change what the panel scores against" rather than "has write access to the
 * jobs collection". Kept in sync by hand with `ROLE_SUMMARY` in
 * emailTemplates.ts, which cannot import this client module. */
const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: 'Everything, including billing, renaming the organisation, changing retention, and managing people.',
  recruiter: 'Create and edit roles, invite candidates, and record hiring decisions.',
  hiring_manager: 'Review candidates and record decisions. Cannot change what the panel scores against.',
  viewer: 'Read-only. Can see roles and candidates but change nothing.',
}

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60'

export function TeamPage({ orgId }: { orgId: string }) {
  const { user } = useAuth()
  const { currentOrg } = useOrgs()

  const [team, setTeam] = useState<TeamResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setTeam(await fetchTeam(orgId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the team.')
    } finally {
      setIsLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const canManage = team?.canManage ?? false
  const seatsFull = team?.seats.limit !== null && team !== null && team.seats.used >= (team.seats.limit ?? 0)

  return (
    <PageContainer>
      <PageHeader
        eyebrow={currentOrg?.name ?? 'Organisation'}
        title="Team"
        description="Who can see and change things in this organisation. Everyone here can read candidate interviews, so add people deliberately."
        action={
          team?.seats.limit !== null && team ? (
            <span className="text-[13px] tabular-nums text-muted-foreground">
              {team.seats.used} of {team.seats.limit} seats used
            </span>
          ) : null
        }
      />

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {canManage ? <InviteForm orgId={orgId} seatsFull={seatsFull} onInvited={load} /> : null}

      <Card className="overflow-hidden">
        <CardHeader title="Members" />
        {isLoading ? (
          <div className="flex flex-col divide-y divide-border">
            {['a', 'b'].map((key) => (
              <div key={key} className="flex items-center gap-3 px-4 py-3.5">
                <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="skeleton h-3.5 w-32 rounded" />
                  <div className="skeleton h-3 w-44 rounded" />
                </div>
                <div className="skeleton h-6 w-20 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(team?.members ?? []).map((member) => (
              <MemberRowItem
                key={member.userId}
                orgId={orgId}
                member={member}
                isSelf={member.email === user?.email}
                canManage={canManage}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </Card>

      {(team?.invitations.length ?? 0) > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader title="Invited, not yet joined" />
          <p className="border-b border-border px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
            These people have a link but have not joined. They count against your seats until they accept, or until the
            invitation is cancelled.
          </p>
          <div className="divide-y divide-border">
            {(team?.invitations ?? []).map((invitation) => (
              <PendingInviteRow
                key={invitation.id}
                orgId={orgId}
                invitation={invitation}
                canManage={canManage}
                onChanged={load}
              />
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader title="What each role can do" />
        <dl className="divide-y divide-border">
          {/* Rendered most-privileged first, which is the order people read
           * a permissions list in — ORG_ROLES itself is ordered the other way
           * because its index is the privilege level. */}
          {[...ORG_ROLES].reverse().map((role) => (
            <div key={role} className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:gap-6">
              <dt className="w-36 shrink-0 text-sm font-medium text-foreground">{formatRole(role)}</dt>
              <dd className="text-[13.5px] leading-relaxed text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ *
 * Inviting
 * ------------------------------------------------------------------ */

function InviteForm({
  orgId,
  seatsFull,
  onInvited,
}: {
  orgId: string
  seatsFull: boolean
  onInvited: () => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('recruiter')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ email: string; url: string; emailed: boolean } | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSending || !email.trim()) return
    setIsSending(true)
    setError(null)
    try {
      const result = await inviteMember(orgId, { email: email.trim(), role })
      setSent({ email: result.invitation.email, url: result.inviteUrl, emailed: result.emailed })
      setEmail('')
      await onInvited()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that invitation.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Invite someone" />
      <p className="border-b border-border px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        They receive a link that works only for this address and expires in 14 days.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
        <label className="flex-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <span className="sr-only sm:not-sr-only">Email address</span>
          <input
            type="email"
            className={`${fieldClass} sm:mt-1.5`}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setError(null)
            }}
            placeholder="colleague@company.com"
            disabled={isSending || seatsFull}
            autoComplete="off"
          />
        </label>

        <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:w-48">
          <span className="sr-only sm:not-sr-only">Role</span>
          <select
            className={`${fieldClass} sm:mt-1.5`}
            value={role}
            onChange={(event) => setRole(event.target.value as OrgRole)}
            disabled={isSending || seatsFull}
          >
            {[...ORG_ROLES].reverse().map((value) => (
              <option key={value} value={value}>
                {formatRole(value)}
              </option>
            ))}
          </select>
        </label>

        <Button type="submit" disabled={isSending || seatsFull || !email.trim()} className="h-[42px] sm:mt-[1.65rem]">
          {isSending ? <LoadingDots /> : <UserPlus className="h-4 w-4" />}
          {isSending ? 'Sending…' : 'Send invitation'}
        </Button>
      </form>

      <p className="px-4 pb-4 text-[12.5px] leading-relaxed text-muted-foreground">
        <strong className="font-medium text-foreground">{formatRole(role)}:</strong> {ROLE_DESCRIPTIONS[role]}
      </p>

      {seatsFull ? (
        <p className="border-t border-border bg-warning/[0.07] px-4 py-3 text-[12.5px] leading-relaxed text-foreground">
          Every seat on your plan is taken. Remove someone, cancel a pending invitation, or move to a larger plan.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-2 border-t border-destructive/30 bg-destructive/[0.07] px-4 py-3 text-[13px] text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {/* The link is shown whether or not the email went out. This is the only
          moment it exists in plaintext — the server keeps a hash — and a
          delivery that silently failed would otherwise leave the invitee with
          no way in and the owner with no way to help. */}
      {sent ? (
        <div className="border-t border-border bg-surface/60 px-4 py-3.5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <Check className="h-4 w-4 text-success" />
            {sent.emailed ? `Invitation emailed to ${sent.email}.` : `Invitation created for ${sent.email}.`}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {sent.emailed
              ? 'You can also send them this link directly — it will not be shown again.'
              : 'The email could not be sent from this deployment, so send them this link yourself. It will not be shown again.'}
          </p>
          <CopyableLink url={sent.url} />
        </div>
      ) : null}
    </Card>
  )
}

function CopyableLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="mt-2.5 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2 text-[12px] text-muted-foreground">
        {url}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            // Clipboard access can be denied; the link is selectable either way.
          }
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

function MemberRowItem({
  orgId,
  member,
  isSelf,
  canManage,
  onChanged,
}: {
  orgId: string
  member: MemberRow
  isSelf: boolean
  canManage: boolean
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  // Owners cannot act on themselves — the server rejects it, and the guard
  // exists so an accidental self-demotion cannot lock an organisation out.
  const editable = canManage && !isSelf

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    } finally {
      setBusy(false)
      setConfirmingRemove(false)
    }
  }

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-ink-foreground">
          {(member.name || '?').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {member.name}
            {isSelf ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
          </p>
          <p className="truncate text-[13px] text-muted-foreground">{member.email}</p>
        </div>

        {editable ? (
          <>
            <select
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:opacity-60"
              value={member.role}
              disabled={busy}
              aria-label={`Role for ${member.name}`}
              onChange={(event) => {
                const next = event.target.value as OrgRole
                run(() => changeMemberRole(orgId, member.userId, next))
              }}
            >
              {[...ORG_ROLES].reverse().map((role) => (
                <option key={role} value={role}>
                  {formatRole(role)}
                </option>
              ))}
            </select>
            {confirmingRemove ? (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => removeMemberRequest(orgId, member.userId))}
                >
                  {busy ? <LoadingDots /> : null}
                  Remove
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingRemove(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`Remove ${member.name}`}
                onClick={() => setConfirmingRemove(true)}
              >
                <Trash className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        ) : (
          <Badge>{formatRole(member.role)}</Badge>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-2 pl-12 text-[12.5px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function PendingInviteRow({
  orgId,
  invitation,
  canManage,
  onChanged,
}: {
  orgId: string
  invitation: InvitationRow
  canManage: boolean
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{invitation.email}</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {formatRole(invitation.role)} ·{' '}
            {invitation.expired ? (
              <span className="text-warning">Expired — cancel it and invite again</span>
            ) : (
              `Expires ${new Date(invitation.expiresAt).toLocaleDateString()}`
            )}
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await revokeInvitationRequest(orgId, invitation.id)
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

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
