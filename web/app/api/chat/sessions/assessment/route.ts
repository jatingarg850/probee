import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'
import { connectToDatabase } from '@/lib/mongoDb'

/** Separate from the main sessions POST (which upserts the whole document,
 * including `messages`/`transcript`) because the panel assessment is only
 * ready well after the call ends and saves the base session. Reusing that
 * upsert here would $set messages/transcript back to whatever (or nothing)
 * this request happened to carry, wiping the transcript already saved. This
 * route only ever touches the `assessment` field. */
export async function POST(request: Request) {
  try {
    const authedUserId = getAuthedUserId(request)
    if (!authedUserId) return unauthorized()

    const { db } = await connectToDatabase()
    const { sessionId, assessment } = await request.json()

    if (!sessionId || !assessment) {
      return Response.json({ error: 'Missing sessionId or assessment' }, { status: 400 })
    }

    const collection = db.collection('sessions')
    // Scoped to the owner: without it, knowing a sessionId was enough to
    // write an arbitrary assessment onto someone else's interview.
    const result = await collection.updateOne({ sessionId, userId: authedUserId }, { $set: { assessment } })

    if (result.matchedCount === 0) {
      // Debug: log what we searched for and what exists
      const existingSession = await collection.findOne({ sessionId })
      console.warn('Assessment update failed to match session', {
        searchedFor: { sessionId, userId: authedUserId },
        sessionExists: !!existingSession,
        existingUserId: existingSession?.userId,
      })
      return Response.json({ error: 'Session not found' }, { status: 404 })
    }

    return Response.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('POST /api/chat/sessions/assessment error:', error)
    return Response.json({ error: 'Failed to save assessment' }, { status: 500 })
  }
}
