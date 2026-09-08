import { CandidateDetailPage } from '@/components/orgs/CandidateDetailPage'

export default async function Page({ params }: { params: Promise<{ orgId: string; sessionId: string }> }) {
  const { orgId, sessionId } = await params
  return <CandidateDetailPage orgId={orgId} sessionId={sessionId} />
}
