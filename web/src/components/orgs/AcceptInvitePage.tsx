'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { AlertCircle, Buildings, Check } from '@/components/ui/icons'
import { LoadingDots } from '@/components/ui/loading-dots'
import { useAuth } from '@/contexts/AuthContext'
import { useOrgs } from '@/contexts/OrgContext'
import { authHeaders, readApiError } from '@/lib/clientAuth'
import type { OrgRole } from '@/lib/orgTypes'

/**
 * The page an invitation link opens.
 *
 * It has to work for four different people arriving at the same URL:
 *
 *   1. Signed in as the invited address  → one button, done.
 *   2. Signed in as somebody else        → told which address this is for.
 *   3. Not signed in, has an account     → sent to sign in and returned here.
 *   4. Not signed in, no account         → sent to register and returned here.
 *
 * Cases 3 and 4 are why the invitation is *previewed* before any
 * authentication: being asked to sign in to see what you are being asked to
 * sign in for is how invitations get closed and forgotten. The preview
 * endpoint returns only the organisation name, the role, and a masked address,
 * so showing it to an unauthenticated caller gives away nothing.
 */

interface InvitePreview {
  organizationName: string
  role: OrgRole
  maskedEmail: string
}

const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: 'Everything, including billing, renaming the organisation, and managing who else has access.',
  recruiter: 'Create and edit roles, invite candidates, and record hiring decisions.',
  hiring_manager: 'Review candidates and record decisions. Cannot change what the panel scores against.',
  viewer: 'Read-only. You can see roles and candidates, but change nothing.',
}

export function AcceptInvitePage({ token }: { token: string }) {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const { refresh } = useOrgs()

  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAccepting, setIsAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/invites/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response, 'That invitation is not valid.'))
        return response.json()
      })
      .then((data) => {
        if (!cancelled) setPreview(data.invitation)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'That invitation is not valid.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const accept = async () => {
    if (isAccepting) return
    setIsAccepting(true)
    setAcceptError(null)
    try {
      const response = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        // The token travels in the body, not the URL — see the route's note.
        body: JSON.stringify({ token }),
      })
      if (!response.ok) throw new Error(await readApiError(response, 'Could not accept that invitation.'))
      const { organization } = await response.json()
      await refresh()
      router.push(`/orgs/${organization.id}/jobs`)
    } catch (error) {
      setAcceptError(error instanceof Error ? error.message : 'Could not accept that invitation.')
      setIsAccepting(false)
    }
  }

  // Sending the invitee back here after they authenticate is the whole reason
  // the login page takes a `next` parameter.
  const returnTo = `/invite/${encodeURIComponent(token)}`

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-14">
      <div className="w-full max-w-[26rem]">
        <img src="/Logo%20Svg/main%20text.svg" alt="PROBE" className="mx-auto h-7 w-auto" />

        <div className="mt-8 rounded-2xl border border-border bg-card p-7 shadow-soft">
          {isLoading || authLoading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="skeleton h-11 w-11 rounded-xl" />
              <div className="skeleton mt-1 h-6 w-48 rounded" />
              <div className="skeleton h-4 w-56 rounded" />
              <div className="skeleton mt-3 h-14 w-full rounded-lg" />
              <div className="skeleton mt-2 h-11 w-full rounded-lg" />
            </div>
          ) : loadError ? (
            <Invalid message={loadError} />
          ) : preview ? (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-accent">
                <Buildings className="h-5 w-5" />
              </span>
              <h1 className="mt-4 text-[1.6rem] font-bold leading-tight tracking-tight text-foreground">
                Join {preview.organizationName}
              </h1>
              <p className="mt-2.5 font-editorial text-[15px] leading-relaxed text-muted-foreground">
                You have been invited as a{' '}
                <strong className="font-semibold text-foreground">{formatRole(preview.role)}</strong>.
              </p>

              <p className="mt-5 rounded-lg border border-border bg-surface/60 px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
                {ROLE_DESCRIPTIONS[preview.role]}
              </p>

              {user ? (
                <SignedIn
                  preview={preview}
                  isAccepting={isAccepting}
                  error={acceptError}
                  onAccept={accept}
                  returnTo={returnTo}
                />
              ) : (
                <SignedOut maskedEmail={preview.maskedEmail} returnTo={returnTo} />
              )}
            </>
          ) : null}
        </div>

        <p className="mt-5 text-center text-[12.5px] leading-relaxed text-muted-foreground">
          Members of an organisation can read the interviews of candidates who applied to it. Your own practice
          interviews stay private to you.
        </p>
      </div>
    </main>
  )
}

function SignedIn({
  preview,
  isAccepting,
  error,
  onAccept,
  returnTo,
}: {
  preview: InvitePreview
  isAccepting: boolean
  error: string | null
  onAccept: () => void
  returnTo: string
}) {
  return (
    <>
      {/* The address check happens on the server, so this cannot pre-empt it —
          it only makes the outcome legible before the click. */}
      <p className="mt-5 text-[13px] text-muted-foreground">
        This invitation was sent to <strong className="font-medium text-foreground">{preview.maskedEmail}</strong>.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3.5 py-2.5 text-[13px] leading-relaxed text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <Button onClick={onAccept} disabled={isAccepting} className="mt-5 h-11 w-full">
        {isAccepting ? (
          <>
            <LoadingDots />
            Joining…
          </>
        ) : (
          <>
            <Check className="h-4 w-4" />
            Accept and join
          </>
        )}
      </Button>

      <p className="mt-3 text-center text-[12.5px] text-muted-foreground">
        Signed in as the wrong person?{' '}
        <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className="text-accent hover:underline">
          Use a different account
        </Link>
      </p>
    </>
  )
}

function SignedOut({ maskedEmail, returnTo }: { maskedEmail: string; returnTo: string }) {
  const next = encodeURIComponent(returnTo)
  return (
    <>
      <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
        Sign in as <strong className="font-medium text-foreground">{maskedEmail}</strong> to accept. If you do not have
        a PROBE account yet, create one with that address — you will come straight back here.
      </p>

      <Button asChild className="mt-5 h-11 w-full">
        <Link href={`/login?next=${next}`}>Sign in to accept</Link>
      </Button>
      <Button asChild variant="outline" className="mt-2.5 h-11 w-full">
        <Link href={`/login?mode=register&next=${next}`}>Create an account</Link>
      </Button>
    </>
  )
}

function Invalid({ message }: { message: string }) {
  return (
    <div className="py-3 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <AlertCircle className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-[1.35rem] font-bold tracking-tight text-foreground">This link does not work</h1>
      <p className="mt-2.5 text-[14px] leading-relaxed text-muted-foreground">{message}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        Invitations expire after 14 days, and can be cancelled by an owner. Ask whoever invited you to send a new one.
      </p>
      <Button asChild variant="outline" className="mt-6 h-10">
        <Link href="/">Go to PROBE</Link>
      </Button>
    </div>
  )
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
