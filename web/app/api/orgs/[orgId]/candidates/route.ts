import { requireOrgMember } from '@/lib/apiAuth'
import { listCandidateResults } from '@/lib/candidateResults'

/**
 * Everyone who has interviewed for a job in this organisation (M2-1, minimum
 * slice). Read-only, `viewer` and up — the same reasoning as the jobs list:
 * seeing who applied is not privileged inside a team that already has access.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params
    const gate = await requireOrgMember(request, orgId, 'viewer')
    if (gate instanceof Response) return gate

    return Response.json({ candidates: await listCandidateResults(orgId) }, { status: 200 })
  } catch (error) {
    console.error('GET /api/orgs/[orgId]/candidates error:', error)
    return Response.json({ error: 'Failed to load candidates' }, { status: 500 })
  }
}
