import { requireOrgMember } from '@/lib/apiAuth'
import { revokeCandidateInvitation } from '@/lib/candidateInvites'
import { getJob } from '@/lib/jobs'

/**
 * Withdraw a candidate invitation.
 *
 * A completed interview cannot be withdrawn — the assessment exists and the
 * candidate sat it, and making that disappear from the recruiter's side would
 * be the opposite of the audit trail this product is supposed to keep. Use the
 * decision log to record a rejection instead.
 */

type RouteParams = { params: Promise<{ orgId: string; jobId: string; inviteId: string }> }

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { orgId, jobId, inviteId } = await params
    const gate = await requireOrgMember(request, orgId, 'recruiter')
    if (gate instanceof Response) return gate

    // Confirms the job belongs to this organisation before the id is used to
    // scope the revoke.
    const job = await getJob(orgId, jobId)
    if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 })

    const result = await revokeCandidateInvitation(jobId, inviteId)
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status })

    return Response.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/orgs/[orgId]/jobs/[jobId]/candidates/[inviteId] error:', error)
    return Response.json({ error: 'Could not cancel that invitation.' }, { status: 500 })
  }
}
