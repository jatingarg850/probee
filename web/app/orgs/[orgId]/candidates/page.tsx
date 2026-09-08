import { CandidatesPage } from '@/components/orgs/CandidatesPage'

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  return <CandidatesPage orgId={orgId} />
}
