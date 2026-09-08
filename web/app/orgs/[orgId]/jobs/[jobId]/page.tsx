import { JobForm } from '@/components/orgs/JobForm'

export default async function Page({ params }: { params: Promise<{ orgId: string; jobId: string }> }) {
  const { orgId, jobId } = await params
  return <JobForm orgId={orgId} jobId={jobId} />
}
