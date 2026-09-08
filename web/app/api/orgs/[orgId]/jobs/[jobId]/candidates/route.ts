import { requireOrgMember } from '@/lib/apiAuth'
import { clampInviteTtlDays } from '@/lib/candidateInviteTypes'
import {
  MAX_BULK_INVITES,
  candidateInviteUrl,
  createCandidateInvitation,
  listCandidateInvitations,
  parseCandidateList,
} from '@/lib/candidateInvites'
import { appUrl, sendEmailQuietly } from '@/lib/email'
import { candidateInterviewEmail } from '@/lib/emailTemplates'
import { getJob } from '@/lib/jobs'
import { getOrganization } from '@/lib/orgs'

/**
 * Invite candidates to a job, and see who has been invited (M1-6).
 *
 * Reading needs `viewer`; inviting needs `recruiter`. That split matters: a
 * hiring manager reviewing candidates should not be able to widen the pool
 * without a recruiter, and a viewer should not be able to contact applicants
 * at all.
 *
 * Single and bulk are the same endpoint. A bulk invite is a list of singles,
 * and giving them separate routes would mean two places where the email is
 * composed and two places where the idempotency rule could drift.
 */

type RouteParams = { params: Promise<{ orgId: string; jobId: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { orgId, jobId } = await params
    const gate = await requireOrgMember(request, orgId, 'viewer')
    if (gate instanceof Response) return gate

    // Scoped read: `getJob` filters by organisation, so a job id belonging to
    // another organisation resolves to null rather than leaking its candidates.
    const job = await getJob(orgId, jobId)
    if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 })

    const invitations = await listCandidateInvitations(jobId)
    return Response.json({ invitations, canInvite: gate.role !== 'viewer' && gate.role !== 'hiring_manager' })
  } catch (error) {
    console.error('GET /api/orgs/[orgId]/jobs/[jobId]/candidates error:', error)
    return Response.json({ error: 'Could not load candidates.' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { orgId, jobId } = await params
    const gate = await requireOrgMember(request, orgId, 'recruiter')
    if (gate instanceof Response) return gate

    let body: { candidates?: unknown; text?: unknown; expiresInDays?: unknown }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    // Optional per-batch override of the link's lifetime; every row in this
    // request shares it, same as they already share the job and organisation.
    const expiresInDays = body.expiresInDays === undefined ? undefined : clampInviteTtlDays(body.expiresInDays)

    const [job, organization] = await Promise.all([getJob(orgId, jobId), getOrganization(orgId)])
    if (!job || !organization) return Response.json({ error: 'Job not found.' }, { status: 404 })
    if (job.status !== 'open') {
      return Response.json(
        { error: 'Open the job before inviting candidates — a draft or closed role will not let anyone in.' },
        { status: 409 },
      )
    }

    // Two input shapes for one operation: a structured list from the form, or
    // pasted text from a spreadsheet. Both land on the same rows.
    const parsed = Array.isArray(body.candidates)
      ? {
          rows: body.candidates
            .map((entry) => {
              const item = entry as { email?: unknown; name?: unknown }
              return {
                email: typeof item?.email === 'string' ? item.email.trim().toLowerCase() : '',
                name: typeof item?.name === 'string' ? item.name.trim().slice(0, 100) : '',
              }
            })
            .filter((row) => row.email)
            .slice(0, MAX_BULK_INVITES),
          errors: [] as Array<{ line: number; value: string; error: string }>,
        }
      : parseCandidateList(typeof body.text === 'string' ? body.text : '')

    if (parsed.rows.length === 0) {
      return Response.json(
        { error: parsed.errors[0]?.error ?? 'Add at least one candidate email address.', rejected: parsed.errors },
        { status: 400 },
      )
    }

    const invited: Array<{ email: string; status: 'invited' | 'reissued'; emailed: boolean; inviteUrl: string }> = []
    const failed: Array<{ email: string; error: string }> = []

    // Sequential rather than Promise.all. Each row is an upsert plus an email
    // send; firing two hundred of those at once would open two hundred Resend
    // connections and hit their rate limit, turning a partial success into a
    // batch that half-sent with no record of which half.
    for (const row of parsed.rows) {
      const created = await createCandidateInvitation({
        organizationId: orgId,
        jobId,
        candidateEmail: row.email,
        candidateName: row.name,
        createdBy: gate.userId,
        expiresInDays,
      })

      if (!created.ok) {
        failed.push({ email: row.email, error: created.error })
        continue
      }

      const url = candidateInviteUrl(appUrl(), created.result.token)
      const message = candidateInterviewEmail({
        organizationName: organization.name,
        jobTitle: job.title,
        candidateName: created.result.invitation.candidateName,
        durationMinutes: job.durationMinutes,
        interviewUrl: url,
        expiresAt: created.result.invitation.expiresAt,
        retentionDays: organization.retentionDays,
      })
      const delivery = await sendEmailQuietly({
        to: row.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })

      invited.push({
        email: row.email,
        status: created.result.isNew ? 'invited' : 'reissued',
        emailed: delivery.ok,
        // Returned so the recruiter can send it by hand when email is not
        // configured or bounced. Safe here: the caller is a recruiter on this
        // job, and this is the only moment the plaintext token exists.
        inviteUrl: url,
      })
    }

    return Response.json({ invited, failed, rejected: parsed.errors }, { status: 201 })
  } catch (error) {
    console.error('POST /api/orgs/[orgId]/jobs/[jobId]/candidates error:', error)
    return Response.json({ error: 'Could not send those invitations.' }, { status: 500 })
  }
}
