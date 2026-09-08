import { ObjectId } from 'mongodb'

import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'
import { appUrl, sendEmailQuietly } from '@/lib/email'
import { memberJoinedEmail } from '@/lib/emailTemplates'
import { acceptInvitation, hashToken } from '@/lib/invites'
import { connectToDatabase } from '@/lib/mongoDb'

/**
 * Redeem an invitation.
 *
 * ============================================================
 * THE TOKEN IS IN THE BODY, NOT THE URL
 * ============================================================
 * The link the recipient clicks carries the token in its path, because a link
 * has nowhere else to put it. This route does not: the browser page reads the
 * token out of the URL and POSTs it. URLs end up in server access logs, in
 * `Referer` headers sent to third parties, and in browser history — a live
 * credential does not belong in any of them, and the one place it is
 * unavoidable should not be multiplied.
 *
 * ============================================================
 * THE EMAIL COMES FROM THE DATABASE
 * ============================================================
 * Not from the JWT, and certainly not from the request body. The token is
 * seven days old at most but the address on it was true when it was issued;
 * the address that matters is the one on the account right now. Taking it from
 * the body would make the address check — the thing that stops a forwarded
 * link working — trivially bypassable by the caller.
 */

export async function POST(request: Request) {
  try {
    const userId = getAuthedUserId(request)
    if (!userId) return unauthorized()

    let body: { token?: unknown }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const token = typeof body.token === 'string' ? body.token : ''
    if (!token) return Response.json({ error: 'That invitation link is not valid.' }, { status: 400 })

    const { db } = await connectToDatabase()
    const user = await db
      .collection('users')
      .findOne({ _id: new ObjectId(userId) }, { projection: { email: 1, name: 1 } })
    if (!user?.email) {
      return Response.json(
        { error: 'Your account has no email address, so it cannot accept invitations.' },
        { status: 400 },
      )
    }

    const result = await acceptInvitation({ token, userId, userEmail: user.email as string })
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status })

    // Tell whoever sent it. Looked up by token hash rather than being carried
    // through `acceptInvitation`'s return value, so the accept path stays a
    // pure membership operation with the notification bolted on outside it.
    void notifyInviter({
      tokenHash: hashToken(token),
      organizationId: result.organizationId,
      organizationName: result.organizationName,
      memberName: (user.name as string) ?? 'A new member',
      memberEmail: user.email as string,
      role: result.role,
    })

    return Response.json(
      {
        organization: {
          id: result.organizationId,
          name: result.organizationName,
          role: result.role,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('POST /api/invites/accept error:', error)
    return Response.json({ error: 'Could not accept that invitation.' }, { status: 500 })
  }
}

async function notifyInviter(input: {
  tokenHash: string
  organizationId: string
  organizationName: string
  memberName: string
  memberEmail: string
  role: Parameters<typeof memberJoinedEmail>[0]['role']
}): Promise<void> {
  try {
    const { db } = await connectToDatabase()
    const invite = await db.collection('invitations').findOne({ tokenHash: input.tokenHash })
    if (!invite?.invitedBy) return

    const inviter = await db
      .collection('users')
      .findOne({ _id: invite.invitedBy as ObjectId }, { projection: { email: 1 } })
    if (!inviter?.email) return

    const message = memberJoinedEmail({
      organizationName: input.organizationName,
      memberName: input.memberName,
      memberEmail: input.memberEmail,
      role: input.role,
      teamUrl: `${appUrl()}/orgs/${input.organizationId}/team`,
    })
    await sendEmailQuietly({
      to: inviter.email as string,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
  } catch (error) {
    console.error('Could not notify the inviter:', error)
  }
}
