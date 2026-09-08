import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'
import { connectToDatabase } from '@/lib/mongoDb'

/** A single turn's text is capped well above any real spoken answer, but low
 * enough that a scripted caller cannot use this route as free storage. */
const MAX_TEXT_LENGTH = 20_000

export async function POST(request: Request) {
  try {
    const authedUserId = getAuthedUserId(request)
    if (!authedUserId) return unauthorized()

    const { db } = await connectToDatabase()
    const message = await request.json()

    if (typeof message?.text === 'string' && message.text.length > MAX_TEXT_LENGTH) {
      return Response.json({ error: 'Message too long' }, { status: 413 })
    }

    const collection = db.collection('messages')
    // Stamped from the token, so the read path below has something
    // trustworthy to scope on. Anything the client sent under this key is
    // overwritten rather than merged.
    // `organizationId` (M0-5) rides along when present so hiring transcripts
    // can be scoped to their organisation without a second lookup. Practice
    // messages simply do not carry it.
    const owned = { ...message, userId: authedUserId, createdAt: new Date() }

    // The client saves on every non-in-progress transcript event for a
    // turn, and the same turn can re-emit with progressively longer text
    // across multiple events (the SDK doesn't guarantee a single terminal
    // event) — without keying on turnId, each of those became its own
    // inserted document, flooding a session with near-duplicate partial
    // messages. Upserting on (userId, channelId, sessionId, turnId)
    // collapses them to one row per turn, always holding the most recently
    // saved text.
    if (message.channelId && message.sessionId && message.turnId !== undefined && message.turnId !== null) {
      const result = await collection.updateOne(
        {
          userId: authedUserId,
          channelId: message.channelId,
          sessionId: message.sessionId,
          turnId: message.turnId,
        },
        { $set: owned },
        { upsert: true },
      )
      return Response.json(
        { success: true, upsertedId: result.upsertedId, modifiedCount: result.modifiedCount },
        { status: 201 },
      )
    }

    const result = await collection.insertOne(owned)

    return Response.json({ success: true, insertedId: result.insertedId }, { status: 201 })
  } catch (error) {
    console.error('POST /api/chat/messages error:', error)
    return Response.json({ error: 'Failed to save message' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const authedUserId = getAuthedUserId(request)
    if (!authedUserId) return unauthorized()

    const { db } = await connectToDatabase()
    const url = new URL(request.url)
    const channelId = url.searchParams.get('channelId')
    const sessionId = url.searchParams.get('sessionId')

    if (!channelId || !sessionId) {
      return Response.json({ error: 'Missing channelId or sessionId' }, { status: 400 })
    }

    const collection = db.collection('messages')

    // channelId/sessionId are client-supplied and guessable, so they cannot
    // be the only thing standing between one account and another account's
    // transcript — the owner check is what actually restricts this.
    const messages = await collection
      .find({ userId: authedUserId, channelId, sessionId })
      .sort({ timestamp: 1 })
      .toArray()

    return Response.json(messages, { status: 200 })
  } catch (error) {
    console.error('GET /api/chat/messages error:', error)
    return Response.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}
