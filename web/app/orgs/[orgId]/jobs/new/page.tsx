import { JobForm } from '@/components/orgs/JobForm'

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  return <JobForm orgId={orgId} />
}
