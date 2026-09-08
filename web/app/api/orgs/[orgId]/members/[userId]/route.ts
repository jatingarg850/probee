import { ObjectId } from 'mongodb'

import { requireOrgMember } from '@/lib/apiAuth'
import { appUrl, sendEmailQuietly } from '@/lib/email'
import { removedFromOrgEmail, roleChangedEmail } from '@/lib/emailTemplates'
import { removeMember, updateMemberRole } from '@/lib/invites'
import { connectToDatabase } from '@/lib/mongoDb'
import { getOrganization } from '@/lib/orgs'

/**
 * Change or revoke one person's access.
 *
 * Both need `owner`. Both notify the person affected by email, which is the
 * point of doing it here rather than in the database: somebody whose access
 * changed silently finds out by hitting a 404 on a page that worked yesterday,
 * and has no way to tell an outage from a decision.
 *
 * The guards against demoting or removing the last owner live in
 * `lib/invites.ts`, next to the queries they depend on.
 */

type RouteParams = { params: Promise<{ orgId: string; userId: string }> }

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { orgId, userId } = await params
    const gate = await requireOrgMember(request, orgId, 'owner')
    if (gate instanceof Response) return gate

    let body: { role?: unknown }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const result = await updateMemberRole({
      organizationId: orgId,
      targetUserId: userId,
      role: body.role,
      actorUserId: gate.userId,
    })
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status })

    const organization = await getOrganization(orgId)
    if (result.email && organization) {
      const message = roleChangedEmail({
        organizationName: organization.name,
        actorName: await actorName(gate.userId),
        role: result.role,
        organizationUrl: `${appUrl()}/orgs/${orgId}/jobs`,
      })
      await sendEmailQuietly({
        to: result.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })
    }

    return Response.json({ ok: true, role: result.role }, { status: 200 })
  } catch (error) {
    console.error('PATCH /api/orgs/[orgId]/members/[userId] error:', error)
    return Response.json({ error: 'Could not change that role.' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { orgId, userId } = await params
    const gate = await requireOrgMember(request, orgId, 'owner')
    if (gate instanceof Response) return gate

    const organization = await getOrganization(orgId)
    const result = await removeMember({
      organizationId: orgId,
      targetUserId: userId,
      actorUserId: gate.userId,
    })
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status })

    if (result.email && organization) {
      const message = removedFromOrgEmail({
        organizationName: organization.name,
        actorName: await actorName(gate.userId),
      })
      await sendEmailQuietly({
        to: result.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })
    }

    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('DELETE /api/orgs/[orgId]/members/[userId] error:', error)
    return Response.json({ error: 'Could not remove that person.' }, { status: 500 })
  }
}

/** The name to put in "X changed your role". Falls back to something neutral
 * rather than an id — an email that names a database identifier reads as a
 * malfunction. */
async function actorName(userId: string): Promise<string> {
  try {
    const { db } = await connectToDatabase()
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) }, { projection: { name: 1 } })
    return (user?.name as string) ?? 'An owner'
  } catch {
    return 'An owner'
  }
}
