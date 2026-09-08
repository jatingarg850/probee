import { CandidateInterviewPage } from '@/components/candidate/CandidateInterviewPage'

/**
 * The candidate's entry point (M1-2).
 *
 * Sits outside AppShell's auth gate — see STANDALONE_PREFIXES there. A
 * candidate has no PROBE account and is never going to make one, so the gate's
 * default behaviour (redirect a signed-out visitor to /login) would bounce
 * them off the one page that explains what they have been invited to.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <CandidateInterviewPage token={decodeURIComponent(token)} />
}
