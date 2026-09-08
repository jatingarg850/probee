import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'
import { connectToDatabase, ensureSessionIndexes } from '@/lib/mongoDb'

export interface ConversationSession {
  channelId: string
  sessionId: string
  userId: string // Owner. Always taken from the verified token, never the body.
  userEmail?: string // Store user email for easy lookup
  userName?: string // Store user name for display
  startedAt: number
  endedAt?: number
  duration?: number // in seconds
  messages: Array<{
    speaker: string
    speakerName: string
    text: string
    timestamp: number
    turnId?: number
  }>
  transcript: string // full conversation transcript
  result?: {
    scores?: Record<string, number>
    assessment?: string
    feedback?: string
    interviewerNotes?: string
  }
  status: 'in_progress' | 'completed' | 'abandoned'
  /** Usage and estimated cost (S1). Optional — practice sessions saved
   * before this existed have none, and a failed cost fetch must not block
   * saving the interview itself. */
  cost?: Record<string, unknown>

  /* ---- Hiring context (M0-5) ------------------------------------- *
   * All optional, and absent on every practice interview. The consumer
   * product and the recruiter product share this collection, so these
   * fields distinguish "someone practising" from "someone being screened"
   * without a migration and without two code paths for reading a session.
   * A session carrying `organizationId` is a hiring interview; one without
   * is practice. */
  organizationId?: string
  jobId?: string
  invitationId?: string
  candidateEmail?: string
  /** Proctoring outcome, persisted rather than discarded (M1-5 fills it).
   * A recruiter needs the integrity signal on the record; today
   * useProctoringStrikes computes violations and throws them away. */
  integrity?: {
    strikes: number
    violations: Array<{ type: string; at: number }>
    terminated: boolean
  }
  createdAt: Date
}

export async function POST(request: Request) {
  try {
    // `userId` used to be read straight out of the request body, so a caller
    // could file a session under anyone's account — or, by reusing a known
    // sessionId, overwrite someone else's saved interview outright. The
    // owner is now the authenticated caller, full stop.
    const authedUserId = getAuthedUserId(request)
    if (!authedUserId) return unauthorized()

    const { db } = await connectToDatabase()
    await ensureSessionIndexes(db)
    const payload = await request.json()

    const {
      channelId,
      sessionId,
      userEmail,
      userName,
      messages,
      transcript,
      result,
      status,
      cost,
      organizationId,
      jobId,
      invitationId,
      candidateEmail,
      integrity,
    } = payload

    if (!channelId || !sessionId) {
      return Response.json({ error: 'Missing channelId or sessionId' }, { status: 400 })
    }

    const collection = db.collection('sessions')

    const session: ConversationSession = {
      channelId,
      sessionId,
      userId: authedUserId,
      userEmail,
      userName,
      startedAt: payload.startedAt || Date.now(),
      endedAt: payload.endedAt || Date.now(),
      duration: payload.duration,
      messages: messages || [],
      transcript: transcript || '',
      result: result,
      cost: cost,
      status: status || 'completed',
      // Spread conditionally: writing `organizationId: undefined` would set
      // the field to null on every practice interview, which would then match
      // an org-scoped query looking for a missing value.
      ...(organizationId ? { organizationId } : {}),
      ...(jobId ? { jobId } : {}),
      ...(invitationId ? { invitationId } : {}),
      ...(candidateEmail ? { candidateEmail } : {}),
      ...(integrity ? { integrity } : {}),
      createdAt: new Date(),
    }

    // The filter carries userId as well as sessionId: an upsert keyed on
    // sessionId alone would let one account clobber another account's
    // document if it ever guessed or replayed that id.
    const result_insert = await collection.updateOne(
      { sessionId, userId: authedUserId },
      { $set: session },
      { upsert: true },
    )

    return Response.json(
      {
        success: true,
        upsertedId: result_insert.upsertedId,
        modifiedCount: result_insert.modifiedCount,
        sessionId,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST /api/chat/sessions error:', error)
    return Response.json({ error: 'Failed to save session' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const authedUserId = getAuthedUserId(request)
    if (!authedUserId) return unauthorized()

    const { db } = await connectToDatabase()
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId')
    const channelId = url.searchParams.get('channelId')
    const limitParam = Number.parseInt(url.searchParams.get('limit') || '50', 10)
    // An unbounded (or NaN) limit let a single request pull the whole
    // collection into memory.
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50

    const collection = db.collection('sessions')

    // Every read is scoped to the authenticated owner. The `userId` query
    // parameter this route used to honour is deliberately ignored — that
    // parameter WAS the vulnerability: passing someone else's id returned
    // their transcripts.
    if (sessionId) {
      const session = await collection.findOne({ sessionId, userId: authedUserId })

      // Deliberately 404, not 403, when the session exists but belongs to
      // someone else: a distinct "forbidden" would confirm that a given
      // session id is real, which is itself a small leak.
      if (!session) {
        return Response.json({ error: 'Session not found' }, { status: 404 })
      }

      return Response.json(session, { status: 200 })
    }

    const filter: Record<string, unknown> = { userId: authedUserId }
    if (channelId) filter.channelId = channelId

    const sessions = await collection.find(filter).sort({ endedAt: -1 }).limit(limit).toArray()

    return Response.json(sessions, { status: 200 })
  } catch (error) {
    console.error('GET /api/chat/sessions error:', error)
    return Response.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}
