import { requireOrgMember } from '@/lib/apiAuth'
import { getCandidateResult } from '@/lib/candidateResults'

/** One candidate's full interview — transcript, assessment, integrity
 * timeline. Scoped by organisation as well as session id, so a session
 * belonging to a different organisation returns 404 rather than leaking a
 * candidate's interview across a tenancy boundary. */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string; sessionId: string }> }) {
  try {
    const { orgId, sessionId } = await params
    const gate = await requireOrgMember(request, orgId, 'viewer')
    if (gate instanceof Response) return gate

    const result = await getCandidateResult(orgId, sessionId)
    if (!result) return Response.json({ error: 'Candidate not found.' }, { status: 404 })

    return Response.json({ candidate: result }, { status: 200 })
  } catch (error) {
    console.error('GET /api/orgs/[orgId]/candidates/[sessionId] error:', error)
    return Response.json({ error: 'Failed to load this candidate.' }, { status: 500 })
  }
}
