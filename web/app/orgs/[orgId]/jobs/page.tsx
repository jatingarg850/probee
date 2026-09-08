import { JobsPage } from '@/components/orgs/JobsPage'

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  return <JobsPage orgId={orgId} />
}
