import { AcceptInvitePage } from '@/components/orgs/AcceptInvitePage'

/**
 * Outside the signed-in AppShell on purpose.
 *
 * The recipient may have no account at all, and AppShell redirects anyone
 * without a session to /login — which would bounce them off the very page
 * that explains what they are being asked to sign in for.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <AcceptInvitePage token={decodeURIComponent(token)} />
}
