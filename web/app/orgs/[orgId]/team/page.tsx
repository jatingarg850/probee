import { TeamPage } from '@/components/orgs/TeamPage'

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  return <TeamPage orgId={orgId} />
}
