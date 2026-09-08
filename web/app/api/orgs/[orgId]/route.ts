import { requireOrgMember } from '@/lib/apiAuth'
import { deleteOrganization, getOrganization, updateOrganization } from '@/lib/orgs'

/**
 * One organisation's settings.
 *
 * Reading needs `viewer`; changing and deleting need `owner`. Retention and
 * the name are the two things an owner can change today — the slug is fixed
 * once created, because it may already be in a link somebody else is
 * holding.
 */

type RouteParams = { params: Promise<{ orgId: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { orgId } = await params
    const gate = await requireOrgMember(request, orgId, 'viewer')
    if (gate instanceof Response) return gate

    const organization = await getOrganization(orgId)
    if (!organization) return Response.json({ error: 'Organisation not found' }, { status: 404 })

    // The stored document has no notion of who is asking; the caller's role
    // comes from their membership.
    return Response.json({ organization: { ...organization, role: gate.role } }, { status: 200 })
  } catch (error) {
    console.error('GET /api/orgs/[orgId] error:', error)
    return Response.json({ error: 'Failed to load organisation' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { orgId } = await params
    const gate = await requireOrgMember(request, orgId, 'owner')
    if (gate instanceof Response) return gate

    let body: { name?: string; retentionDays?: number }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const result = await updateOrganization(orgId, body)
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status })

    const organization = await getOrganization(orgId)
    return Response.json({ organization: { ...organization, role: gate.role } }, { status: 200 })
  } catch (error) {
    console.error('PATCH /api/orgs/[orgId] error:', error)
    return Response.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}

/**
 * Permanently delete an organisation.
 *
 * The request body must repeat the organisation's exact current name. This
 * is checked here, server-side, against what `getOrganization` returns —
 * never trusted from a hidden field the client only happened to send —
 * because a "type the name to confirm" dialog is worth nothing if a script
 * or a mis-wired retry could call this route without a person having
 * actually typed anything.
 *
 * See `deleteOrganization`'s own comment for exactly what is and is not
 * removed — interview data and compliance records deliberately survive.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { orgId } = await params
    const gate = await requireOrgMember(request, orgId, 'owner')
    if (gate instanceof Response) return gate

    let body: { confirmName?: unknown }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const organization = await getOrganization(orgId)
    if (!organization) return Response.json({ error: 'Organisation not found' }, { status: 404 })

    const confirmName = typeof body.confirmName === 'string' ? body.confirmName.trim() : ''
    if (confirmName !== organization.name) {
      return Response.json(
        { error: 'That does not match the organisation name. Nothing was deleted.' },
        { status: 400 },
      )
    }

    const result = await deleteOrganization(orgId)
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status })

    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('DELETE /api/orgs/[orgId] error:', error)
    return Response.json({ error: 'Could not delete this organisation.' }, { status: 500 })
  }
}
