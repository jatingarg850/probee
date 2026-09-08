import { ObjectId } from 'mongodb'

import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'
import { connectToDatabase } from '@/lib/mongoDb'
import { getMembershipRole } from '@/lib/orgs'
import { createPlaybackUrl, isStorageConfigured } from '@/lib/storage'

/**
 * A short-lived link to watch one interview recording.
 *
 * ============================================================
 * WHO MAY WATCH
 * ============================================================
 * Exactly two kinds of caller:
 *
 *   1. The person the interview is of.
 *   2. A member of the organisation the interview was *for* — and only for
 *      sessions that carry an `organizationId`.
 *
 * Practice sessions have no organisation, so nobody but the practising user
 * can ever reach one. That is the whole basis of the promise made on the
 * pricing page: an employer cannot see a candidate's practice.
 *
 * The bucket itself is private. Playback happens through a URL signed here,
 * after the check above, and it expires within the hour — so a link that
 * leaks out of a browser history stops working rather than remaining a
 * permanent public copy of somebody's job interview.
 */

type RouteParams = { params: Promise<{ sessionId: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const userId = getAuthedUserId(request)
    if (!userId) return unauthorized()

    const { sessionId } = await params
    if (!ObjectId.isValid(sessionId)) {
      return Response.json({ error: 'Recording not found.' }, { status: 404 })
    }

    if (!isStorageConfigured()) {
      return Response.json(
        { error: 'Recording storage is not configured on this deployment.', code: 'storage_not_configured' },
        { status: 503 },
      )
    }

    const { db } = await connectToDatabase()
    const session = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(sessionId) }, { projection: { userId: 1, organizationId: 1, recording: 1 } })

    if (!session) return Response.json({ error: 'Recording not found.' }, { status: 404 })

    const isOwner = String(session.userId) === userId
    const organizationId = typeof session.organizationId === 'string' ? session.organizationId : null
    const isOrgMember = organizationId ? (await getMembershipRole(organizationId, userId)) !== null : false

    // 404, not 403 — a distinct "forbidden" would confirm that a recording
    // exists for a session id somebody guessed.
    if (!isOwner && !isOrgMember) return Response.json({ error: 'Recording not found.' }, { status: 404 })

    const recording = (session.recording ?? {}) as { videoKey?: string; audioKey?: string }
    const [video, audio] = await Promise.all([
      recording.videoKey ? createPlaybackUrl(recording.videoKey) : Promise.resolve(null),
      recording.audioKey ? createPlaybackUrl(recording.audioKey) : Promise.resolve(null),
    ])

    if (!video && !audio) return Response.json({ error: 'No recording was saved for this interview.' }, { status: 404 })

    return Response.json({ video, audio }, { status: 200 })
  } catch (error) {
    console.error('GET /api/recordings/[sessionId] error:', error)
    return Response.json({ error: 'Could not load that recording.' }, { status: 500 })
  }
}
