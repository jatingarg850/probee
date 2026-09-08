import { requireOrgMember } from '@/lib/apiAuth'
import { revokeInvitation } from '@/lib/invites'

/**
 * Cancel a pending invitation.
 *
 * There is no route that reads an invitation back out by id, deliberately —
 * the token is stored as a hash and cannot be recovered, so an owner who loses
 * the link re-invites rather than looking it up. That also means this endpoint
 * cannot be used to enumerate outstanding tokens.
 */

type RouteParams = { params: Promise<{ orgId: string; inviteId: string }> }

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { orgId, inviteId } = await params
    const gate = await requireOrgMember(request, orgId, 'owner')
    if (gate instanceof Response) return gate

    const result = await revokeInvitation(orgId, inviteId)
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status })

    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('DELETE /api/orgs/[orgId]/invites/[inviteId] error:', error)
    return Response.json({ error: 'Could not cancel that invitation.' }, { status: 500 })
  }
}
