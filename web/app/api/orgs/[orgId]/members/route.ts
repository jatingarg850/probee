import { ObjectId } from 'mongodb'

import { requireOrgMember } from '@/lib/apiAuth'
import { appUrl, sendEmailQuietly } from '@/lib/email'
import { teamInvitationEmail } from '@/lib/emailTemplates'
import { createInvitation, inviteUrl, listMembers, listPendingInvitations } from '@/lib/invites'
import { connectToDatabase } from '@/lib/mongoDb'
import { getOrganization } from '@/lib/orgs'
import { getPlan } from '@/lib/plans'

/**
 * Who is in an organisation, and inviting more people.
 *
 * Reading needs `viewer` — knowing who your colleagues are is not privileged
 * inside a team you are already part of. Inviting needs `owner`, because an
 * invitation grants access to candidate interview data, and the set of people
 * who can widen that should be small and deliberate.
 */

type RouteParams = { params: Promise<{ orgId: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { orgId } = await params
    const gate = await requireOrgMember(request, orgId, 'viewer')
    if (gate instanceof Response) return gate

    const [members, invitations, organization] = await Promise.all([
      listMembers(orgId),
      listPendingInvitations(orgId),
      getOrganization(orgId),
    ])

    const plan = getPlan(organization?.planId)

    return Response.json(
      {
        members,
        invitations,
        // The client renders "6 of 10 seats" from this rather than deriving it
        // from the arrays, so the limit and the count always come from the
        // same place as the check that enforces them.
        seats: {
          used: members.length + invitations.filter((invite) => !invite.expired).length,
          limit: plan?.seats ?? null,
          planName: plan?.name ?? null,
        },
        /** So the UI can hide controls the server would reject anyway. */
        canManage: gate.role === 'owner',
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('GET /api/orgs/[orgId]/members error:', error)
    return Response.json({ error: 'Failed to load the team.' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { orgId } = await params
    const gate = await requireOrgMember(request, orgId, 'owner')
    if (gate instanceof Response) return gate

    let body: { email?: unknown; role?: unknown }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const organization = await getOrganization(orgId)
    if (!organization) return Response.json({ error: 'Organisation not found.' }, { status: 404 })

    const created = await createInvitation({
      organizationId: orgId,
      email: body.email,
      role: body.role,
      invitedBy: gate.userId,
      seatLimit: getPlan(organization.planId)?.seats ?? null,
    })
    if (!created.ok) return Response.json({ error: created.error }, { status: created.status })

    const url = inviteUrl(appUrl(), created.token)

    // Best effort. `emailed` is reported back so the UI can tell the owner to
    // send the link themselves when delivery is not configured or failed —
    // an invitation nobody can act on is worse than an honest "copy this".
    const { db } = await connectToDatabase()
    const inviter = await db
      .collection('users')
      .findOne({ _id: new ObjectId(gate.userId) }, { projection: { name: 1 } })

    const message = teamInvitationEmail({
      organizationName: organization.name,
      inviterName: (inviter?.name as string) ?? 'A colleague',
      role: created.invitation.role,
      acceptUrl: url,
      expiresAt: created.invitation.expiresAt,
    })
    const delivery = await sendEmailQuietly({
      to: created.invitation.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })

    return Response.json(
      {
        invitation: created.invitation,
        // Returned to the inviting owner only. This is the one moment the
        // plaintext token exists — it is a hash in the database and cannot be
        // shown again.
        inviteUrl: url,
        emailed: delivery.ok,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST /api/orgs/[orgId]/members error:', error)
    return Response.json({ error: 'Could not send that invitation.' }, { status: 500 })
  }
}
