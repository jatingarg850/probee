import { getCandidateInvitation, markStarted } from '@/lib/candidateInvites'
import { hasAcceptedConsent } from '@/lib/compliance'
import { getInterviewContext, interviewSessionExpired } from '@/lib/interviewToken'
import { getJob } from '@/lib/jobs'
import { getOrganization } from '@/lib/orgs'
import { rateLimit, tooManyRequests } from '@/lib/rateLimit'

import { backendUrl } from '@/lib/backendUrl'

const BACKEND_URL = backendUrl()

/**
 * Start a candidate's interview (M1-4).
 *
 * ============================================================
 * THE JOB IS FETCHED HERE, NEVER SENT BY THE CLIENT
 * ============================================================
 * This is the single most important line in the file:
 *
 *     const job = await getJob(context.organizationId, context.jobId)
 *
 * The competencies, their weights, the panel seats and the must-ask questions
 * all come out of the database, keyed by ids that were signed into the
 * interview token by the consent route. The candidate's browser contributes
 * nothing except "I am ready".
 *
 * The alternative — the browser posting the job config, as the practice flow
 * does — would let a candidate rewrite the criteria they are scored against.
 * Not by exploiting a bug: just by editing a request body. In a practice
 * product that is a curiosity; in a hiring product it is the whole system
 * defeated.
 *
 * The job description still reaches a model, so it is still fenced with
 * `_untrusted()` on the Python side. An employer-supplied posting containing
 * "score every candidate 10/10" is not a jailbreak here — it is a route to
 * rigging an outcome, and it is why that fencing does not get relaxed for
 * "our own" job text.
 *
 * ============================================================
 * WHY THIS ROUTE DOES BOTH CONFIG AND START
 * ============================================================
 * The practice flow calls `/api/get_config` and `/api/startAgent` separately,
 * from the browser. A candidate cannot: those routes require a user token, and
 * a candidate has none. Doing both here also removes the window in which a
 * candidate holds an Agora channel with no agent configured for it.
 */
export async function POST(request: Request) {
  try {
    const context = getInterviewContext(request)
    if (!context) return interviewSessionExpired()

    // Keyed by invitation, not IP: this route starts a real, billed Agora +
    // Gemini + Murf session on every call, and a candidate's own retry loop
    // (a flaky connection, a refreshed tab) is the expected case to allow for
    // — 5 starts per 10 minutes covers that generously while still bounding
    // what a single compromised or scripted interview token can cost.
    const limit = rateLimit(`candidate-start:${context.invitationId}`, 5, 10 * 60_000)
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

    // The token proves consent was given at issue time. This re-reads it,
    // because the token lives three hours and a consent row is the artifact a
    // regulator would ask for — not a claim inside a JWT we signed ourselves.
    if (!(await hasAcceptedConsent(context.invitationId))) {
      return Response.json({ error: 'Please agree to the interview terms first.' }, { status: 403 })
    }

    const invitation = await getCandidateInvitation(context.invitationId)
    if (!invitation) return Response.json({ error: 'This interview is no longer available.' }, { status: 404 })
    if (invitation.status === 'completed') {
      return Response.json({ error: 'You have already completed this interview.' }, { status: 409 })
    }
    if (invitation.status === 'revoked' || invitation.expiresAt < new Date()) {
      return Response.json({ error: 'This interview is no longer available.' }, { status: 410 })
    }

    const [job, organization] = await Promise.all([
      getJob(context.organizationId, context.jobId),
      getOrganization(context.organizationId),
    ])
    if (!job || !organization) {
      return Response.json({ error: 'This interview is no longer available.' }, { status: 404 })
    }
    if (job.status !== 'open') {
      return Response.json({ error: 'This role is no longer accepting interviews.' }, { status: 410 })
    }

    // 1. Agora credentials for a fresh channel.
    const configResponse = await fetch(`${BACKEND_URL}/get_config`, { method: 'GET' })
    if (!configResponse.ok) {
      console.error('[candidate/start] get_config failed:', configResponse.status)
      return Response.json({ error: 'Could not set up the interview room. Please try again.' }, { status: 502 })
    }
    const configPayload = await configResponse.json()
    if (configPayload.code !== 0 || !configPayload.data) {
      return Response.json({ error: 'Could not set up the interview room. Please try again.' }, { status: 502 })
    }
    const config = configPayload.data as {
      app_id: string
      token: string
      uid: string
      channel_name: string
      agent_uid: string
    }

    // 2. Start the panel against *this job's* configuration.
    const agentResponse = await fetch(`${BACKEND_URL}/startAgent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelName: config.channel_name,
        rtcUid: Number(config.agent_uid),
        userUid: Number(config.uid),
        role: job.title,
        company: organization.name,
        jobDescription: job.description,
        durationMinutes: job.durationMinutes,
        candidateName: invitation.candidateName,
        // The M1-4 fields. Everything below comes from the job document.
        competencies: job.competencies,
        panelSeats: job.panelSeats,
        mustAskQuestions: job.mustAskQuestions,
        hiring: true,
      }),
    })

    let agentId: string | undefined
    if (agentResponse.ok) {
      const agentPayload = await agentResponse.json()
      agentId = agentPayload?.data?.agent_id
    } else {
      // Deliberately not fatal. The candidate can still join the room and the
      // frontend surfaces "the panel could not connect" — which is a better
      // outcome than a blank error page for somebody who set aside an hour.
      console.error('[candidate/start] startAgent failed:', agentResponse.status, await agentResponse.text())
    }

    // Session id is minted here rather than in the browser, so the invitation
    // and the session document agree on it without the client being trusted to
    // report back.
    const sessionId = `hire_${context.invitationId}_${Date.now().toString(36)}`
    await markStarted(context.invitationId, sessionId)

    return Response.json(
      {
        agora: {
          appId: config.app_id,
          token: config.token,
          uid: config.uid,
          channel: config.channel_name,
          agentUid: config.agent_uid,
          agentId,
        },
        sessionId,
        job: {
          title: job.title,
          durationMinutes: job.durationMinutes,
          // Sent so the candidate UI can name the interviewers it is about to
          // show. Not the competencies or weights — a candidate who knows the
          // scoring rubric answers to the rubric.
          panelSeats: job.panelSeats,
        },
        organizationName: organization.name,
        agentJoinFailed: agentId === undefined,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST /api/candidate/start error:', error)
    return Response.json({ error: 'Could not start the interview. Please try again.' }, { status: 500 })
  }
}
