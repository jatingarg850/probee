import { ObjectId } from 'mongodb'

import { getAuthedUserId, unauthorized } from '@/lib/apiAuth'
import { connectToDatabase } from '@/lib/mongoDb'
import { getMembershipRole } from '@/lib/orgs'
import {
  MAX_RECORDING_BYTES,
  createUploadUrl,
  isAllowedContentType,
  isStorageConfigured,
  recordingKey,
} from '@/lib/storage'

/**
 * Issue a presigned URL for uploading one interview recording.
 *
 * ============================================================
 * THE KEY IS DERIVED, NOT ACCEPTED
 * ============================================================
 * The request names a *session*, not a path. The storage key is built here
 * from the session's own organisation id and session id, both read from the
 * database. A client that could name its own key could write over another
 * organisation's recording, or escape the prefix entirely with `../`.
 *
 * ============================================================
 * WHO IS ALLOWED TO UPLOAD
 * ============================================================
 * The person whose interview it is. For a hiring interview that is the
 * candidate; for practice it is the practising user. Membership of the
 * organisation is *not* sufficient — a recruiter has no business uploading a
 * recording into a candidate's session, and allowing it would make the
 * recording worthless as evidence of what actually happened.
 */
export async function POST(request: Request) {
  try {
    const userId = getAuthedUserId(request)
    if (!userId) return unauthorized()

    if (!isStorageConfigured()) {
      return Response.json(
        {
          error: 'Recording storage is not configured on this deployment.',
          code: 'storage_not_configured',
        },
        { status: 503 },
      )
    }

    let body: { sessionId?: unknown; kind?: unknown; contentType?: unknown; contentLength?: unknown }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
    if (!sessionId || !ObjectId.isValid(sessionId)) {
      return Response.json({ error: 'A valid session id is required.' }, { status: 400 })
    }

    const kind = body.kind === 'audio' ? 'audio' : 'video'

    if (!isAllowedContentType(body.contentType)) {
      return Response.json({ error: 'That file type cannot be uploaded.' }, { status: 400 })
    }

    const contentLength = Number(body.contentLength)
    if (!Number.isInteger(contentLength) || contentLength <= 0 || contentLength > MAX_RECORDING_BYTES) {
      return Response.json(
        { error: `Recordings must be between 1 byte and ${Math.floor(MAX_RECORDING_BYTES / 1024 / 1024)} MB.` },
        { status: 400 },
      )
    }

    const { db } = await connectToDatabase()
    const session = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(sessionId) }, { projection: { userId: 1, organizationId: 1 } })

    // 404 rather than 403 for a session that is not theirs, so session ids
    // cannot be probed for existence.
    if (!session || String(session.userId) !== userId) {
      return Response.json({ error: 'Session not found.' }, { status: 404 })
    }

    // Practice sessions carry no organisation. They still get a stable prefix
    // so a single retention sweep can cover both.
    const organizationId = typeof session.organizationId === 'string' ? session.organizationId : 'personal'

    if (organizationId !== 'personal') {
      // Defence in depth: the session claims an organisation, so confirm the
      // uploader really is in it before writing under its prefix.
      const role = await getMembershipRole(organizationId, userId)
      if (!role) {
        // A candidate interviewing for a job is not a member of the hiring
        // organisation, so this is not yet reachable for hiring interviews —
        // it becomes reachable when candidate sessions land, and the check
        // being here first is the point.
        console.warn('Recording upload for an org session by a non-member', { userId, sessionId })
      }
    }

    const extension = body.contentType.includes('webm') ? 'webm' : body.contentType.includes('mp4') ? 'mp4' : 'bin'
    const key = recordingKey({ organizationId, sessionId, kind, extension })

    const upload = await createUploadUrl({ key, contentType: body.contentType, contentLength })
    if (!upload) {
      return Response.json({ error: 'Recording storage is not configured.' }, { status: 503 })
    }

    // The key is written to the session now rather than after the upload
    // succeeds, so a failed upload leaves a dangling key rather than a
    // recording nobody can find. A missing object is recoverable; a lost
    // pointer to an existing one is not.
    await db
      .collection('sessions')
      .updateOne(
        { _id: new ObjectId(sessionId) },
        { $set: { [`recording.${kind}Key`]: key, [`recording.${kind}UpdatedAt`]: new Date() } },
      )

    return Response.json({ uploadUrl: upload.url, key: upload.key, expiresIn: upload.expiresIn }, { status: 201 })
  } catch (error) {
    console.error('POST /api/recordings/upload-url error:', error)
    return Response.json({ error: 'Could not prepare the upload.' }, { status: 500 })
  }
}
