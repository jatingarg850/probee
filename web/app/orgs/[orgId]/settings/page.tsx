import { OrgSettingsPage } from '@/components/orgs/OrgSettingsPage'

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  return <OrgSettingsPage orgId={orgId} />
}
