import {
  getCandidateInvitation,
  hashCandidateToken,
  markStatus,
  previewCandidateInvitation,
} from '@/lib/candidateInvites'
import { recordConsent, recordDemographics } from '@/lib/compliance'
import { signInterviewToken } from '@/lib/interviewToken'

/**
 * The consent gate (M1-3). This is where a candidate becomes able to interview.
 *
 * ============================================================
 * CONSENT IS THE THING THAT MINTS THE TOKEN
 * ============================================================
 * The interview token is issued *here*, and only on acceptance. There is no
 * other route that issues one. That is what makes "cannot reach the precheck
 * without a consent row" a structural property rather than a UI convention: a
 * candidate who skipped this screen has no credential, so `/api/candidate/start`
 * has nothing to accept.
 *
 * ============================================================
 * A DECLINE IS RECORDED, NOT DISCARDED
 * ============================================================
 * "They were shown the disclosure and said no" is itself the compliance-
 * relevant fact — under Illinois AIVIA the employer has to be able to show
 * that notice was given and consent was sought. So a decline writes a
 * `consents` row with `accepted: false` and nothing else. No demographics, no
 * token, no session.
 *
 * ============================================================
 * DEMOGRAPHICS ARE OPTIONAL AND NEVER JOINED
 * ============================================================
 * Written keyed by `invitationId` only. See the rule at the top of
 * lib/compliance.ts: this data exists so a bias audit is possible, and it is
 * never shown next to a score. Skipping is recorded as `declined: true`, which
 * is a different state from never having been asked.
 */

export async function POST(request: Request) {
  try {
    let body: { token?: unknown; accepted?: unknown; demographics?: unknown }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const token = typeof body.token === 'string' ? body.token : ''
    if (!token) return Response.json({ error: 'This interview link is not valid.' }, { status: 400 })

    // The raw token is re-checked here rather than trusted from the page. The
    // preview call the browser made earlier proves nothing about this request.
    const preview = await previewCandidateInvitation(token)
    if (!preview) {
      return Response.json({ error: 'This interview link is not valid, or it has already been used.' }, { status: 404 })
    }

    const invitation = await getCandidateInvitation(preview.invitationId)
    if (!invitation || invitation.tokenHash !== hashCandidateToken(token)) {
      return Response.json({ error: 'This interview link is not valid.' }, { status: 404 })
    }

    const accepted = body.accepted === true
    const userAgent = request.headers.get('user-agent')

    await recordConsent({
      invitationId: preview.invitationId,
      candidateEmail: invitation.candidateEmail,
      accepted,
      userAgent,
    })

    if (!accepted) {
      await markStatus(preview.invitationId, 'declined')
      // Nothing else is written. A candidate who declined has told us the one
      // thing we are allowed to keep about them.
      return Response.json({ accepted: false }, { status: 200 })
    }

    // Voluntary, and separate from the consent decision — a candidate who
    // agrees to the interview but skips these questions is a normal case.
    if (body.demographics && typeof body.demographics === 'object') {
      const raw = body.demographics as Record<string, unknown>
      await recordDemographics(preview.invitationId, {
        sex: typeof raw.sex === 'string' ? raw.sex.slice(0, 60) : undefined,
        raceEthnicity: typeof raw.raceEthnicity === 'string' ? raw.raceEthnicity.slice(0, 60) : undefined,
        declined: raw.declined === true,
      })
    }

    await markStatus(preview.invitationId, 'consented')

    return Response.json(
      {
        accepted: true,
        // The candidate's only credential, and it exists only past this point.
        interviewToken: signInterviewToken({
          invitationId: preview.invitationId,
          jobId: preview.jobId,
          organizationId: preview.organizationId,
        }),
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('POST /api/candidate/consent error:', error)
    return Response.json({ error: 'Could not record your response. Please try again.' }, { status: 500 })
  }
}
