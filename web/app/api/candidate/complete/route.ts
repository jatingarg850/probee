import { getCandidateInvitation, markCompleted } from '@/lib/candidateInvites'
import { getInterviewContext, interviewSessionExpired } from '@/lib/interviewToken'
import { connectToDatabase, ensureSessionIndexes } from '@/lib/mongoDb'

import { backendUrl } from '@/lib/backendUrl'

const BACKEND_URL = backendUrl()

/** Violation types the proctoring hook can emit. Anything else is dropped
 * rather than stored — the client supplies this array, and an open string
 * field is a place to put whatever you like in a recruiter's UI. */
const VIOLATION_TYPES = new Set(['gaze_away', 'no_face', 'multiple_faces', 'tab_switch', 'fullscreen_exit', 'devtools'])
const MAX_VIOLATIONS = 200

/**
 * Save a finished candidate interview (M1-5, and the end of the M1 loop).
 *
 * ============================================================
 * THE CANDIDATE NEVER SEES THE SCORE
 * ============================================================
 * This route fetches the assessment and writes it to the session, and returns
 * *nothing* about it. A hiring assessment belongs to the employer; showing a
 * candidate their own competency breakdown would leak the rubric to the next
 * applicant they talk to, and would turn a screening tool into feedback the
 * employer never agreed to give.
 *
 * This is the one place the hiring product deliberately behaves worse for the
 * person in front of it than the practice product does — and it is why
 * practice remains free and separate.
 *
 * ============================================================
 * PROCTORING IS PERSISTED, NOT DISCARDED
 * ============================================================
 * `useProctoringStrikes` computes violations during the call and, until now,
 * threw them away. A recruiter reviewing a candidate needs to know whether the
 * interview was clean, and — importantly — needs to see a *terminated* session
 * as distinct from a completed one, so that a candidate cut off by the strike
 * limit is not silently compared against people who finished.
 *
 * The array arrives from the client, which means a candidate could in
 * principle suppress their own violations. That is a real limitation and not
 * one this route can close: the detection runs in their browser because that
 * is where the camera is. It is recorded as a signal, not as evidence.
 */
export async function POST(request: Request) {
  try {
    const context = getInterviewContext(request)
    if (!context) return interviewSessionExpired()

    let body: {
      sessionId?: unknown
      channelId?: unknown
      startedAt?: unknown
      endedAt?: unknown
      duration?: unknown
      messages?: unknown
      transcript?: unknown
      integrity?: unknown
      terminatedReason?: unknown
    }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    const channelId = typeof body.channelId === 'string' ? body.channelId : ''
    if (!sessionId || !channelId) {
      return Response.json({ error: 'Missing session details.' }, { status: 400 })
    }

    const invitation = await getCandidateInvitation(context.invitationId)
    if (!invitation) return Response.json({ error: 'This interview is no longer available.' }, { status: 404 })

    // The session id was minted by /api/candidate/start and stored on the
    // invitation. Requiring them to match stops a candidate writing a second
    // session document under an id of their choosing.
    if (invitation.sessionId && invitation.sessionId !== sessionId) {
      return Response.json({ error: 'That session does not belong to this interview.' }, { status: 409 })
    }

    const terminatedReason = typeof body.terminatedReason === 'string' ? body.terminatedReason : null
    const integrity = normaliseIntegrity(body.integrity, terminatedReason !== null)

    // Scored server-side, from the channel — not from anything the browser
    // sends. Best effort: an interview that happened must be saved even if
    // the assessment call fails, because the transcript is the record.
    const [assessment, cost] = await Promise.all([fetchAssessment(channelId), fetchCost(channelId)])

    const { db } = await connectToDatabase()
    await ensureSessionIndexes(db)

    const startedAt = Number(body.startedAt) || Date.now()
    const endedAt = Number(body.endedAt) || Date.now()

    await db.collection('sessions').updateOne(
      { sessionId },
      {
        $set: {
          channelId,
          sessionId,
          // A candidate has no account, so there is no owning user. This is
          // what distinguishes a hiring session from a practice one on read,
          // alongside `organizationId`.
          userId: null,
          candidateEmail: invitation.candidateEmail,
          userName: invitation.candidateName || invitation.candidateEmail,
          organizationId: context.organizationId,
          jobId: context.jobId,
          invitationId: context.invitationId,
          startedAt,
          endedAt,
          duration: Number(body.duration) || Math.floor((endedAt - startedAt) / 1000),
          messages: Array.isArray(body.messages) ? body.messages.slice(0, 2000) : [],
          transcript: typeof body.transcript === 'string' ? body.transcript.slice(0, 500_000) : '',
          integrity,
          // Terminated is a distinct outcome from abandoned: one is the
          // system ending the interview, the other is the candidate leaving.
          status: terminatedReason ? 'terminated' : 'completed',
          ...(terminatedReason ? { terminatedReason } : {}),
          ...(assessment ? { assessment } : {}),
          ...(cost ? { cost } : {}),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    )

    await markCompleted(context.invitationId, sessionId)

    // Deliberately bare. See the note at the top of this file.
    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('POST /api/candidate/complete error:', error)
    return Response.json({ error: 'Could not save the interview.' }, { status: 500 })
  }
}

/** Clamp and whitelist whatever the client sent. */
function normaliseIntegrity(
  raw: unknown,
  terminated: boolean,
): { strikes: number; violations: Array<{ type: string; at: number }>; terminated: boolean } {
  const source = (raw ?? {}) as { strikes?: unknown; violations?: unknown }
  const violations = Array.isArray(source.violations)
    ? source.violations
        .map((entry) => {
          const item = entry as { type?: unknown; at?: unknown }
          return { type: String(item?.type ?? ''), at: Number(item?.at) || 0 }
        })
        .filter((item) => VIOLATION_TYPES.has(item.type))
        .slice(0, MAX_VIOLATIONS)
    : []

  const claimed = Number(source.strikes)
  return {
    // Never below the number of violations actually listed — a client that
    // reports "0 strikes" alongside three violations is not believed.
    strikes: Math.max(Number.isFinite(claimed) ? Math.max(0, Math.floor(claimed)) : 0, violations.length),
    violations,
    terminated,
  }
}

async function fetchAssessment(channelName: string): Promise<unknown | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/getAssessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName }),
    })
    if (!response.ok) return null
    const payload = await response.json()
    return payload?.code === 0 && payload?.data && !payload.data.error ? payload.data : null
  } catch (error) {
    console.warn('[candidate/complete] assessment fetch failed:', error)
    return null
  }
}

async function fetchCost(channelName: string): Promise<unknown | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/sessionCost?channelName=${encodeURIComponent(channelName)}`)
    if (!response.ok) return null
    const payload = await response.json()
    return payload?.code === 0 ? payload.data : null
  } catch {
    return null
  }
}
