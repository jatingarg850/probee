import { getCandidateInvitation } from '@/lib/candidateInvites'
import { getInterviewContext, interviewSessionExpired } from '@/lib/interviewToken'
import { connectToDatabase } from '@/lib/mongoDb'
import {
  MAX_RECORDING_BYTES,
  createUploadUrl,
  isAllowedContentType,
  isStorageConfigured,
  recordingKey,
} from '@/lib/storage'

/**
 * Issue a presigned upload URL for a candidate's own recording.
 *
 * ============================================================
 * WHY THIS IS A SEPARATE ROUTE FROM /api/recordings/upload-url
 * ============================================================
 * That route authenticates with `getAuthedUserId` — a bearer token from a
 * signed-in PROBE user. A candidate sitting a hiring interview has no such
 * token; the only credential they hold is the interview token minted at
 * consent (see `lib/interviewToken.ts`), which travels in `X-Interview-Token`
 * and which `getAuthedUserId` explicitly refuses to accept (by design — see
 * that function's own comment on why a candidate token must never
 * authenticate a user route). The two credentials are deliberately
 * incompatible, so uploading a candidate's recording needs its own route
 * built on the credential a candidate actually has, the same way
 * `/api/candidate/start` and `/api/candidate/complete` are separate from
 * their signed-in-user equivalents.
 *
 * ============================================================
 * THE SESSION IS DERIVED, NOT ACCEPTED
 * ============================================================
 * The request names nothing about which session or organisation this is —
 * both come from the invitation the interview token was signed for, read
 * from the database via `getCandidateInvitation`. A candidate cannot upload
 * into a session that is not the one their own token was issued for.
 */
export async function POST(request: Request) {
  try {
    const context = getInterviewContext(request)
    if (!context) return interviewSessionExpired()

    if (!isStorageConfigured()) {
      return Response.json(
        { error: 'Recording storage is not configured on this deployment.', code: 'storage_not_configured' },
        { status: 503 },
      )
    }

    let body: { contentType?: unknown; contentLength?: unknown }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

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

    const invitation = await getCandidateInvitation(context.invitationId)
    // `/api/candidate/start` sets this the moment the call opens; a recording
    // upload should never be requested before that has happened.
    if (!invitation || !invitation.sessionId) {
      return Response.json({ error: 'This interview has not started yet.' }, { status: 409 })
    }

    const extension = body.contentType.includes('webm') ? 'webm' : body.contentType.includes('mp4') ? 'mp4' : 'bin'
    const key = recordingKey({
      organizationId: context.organizationId,
      sessionId: invitation.sessionId,
      kind: 'video',
      extension,
    })

    const upload = await createUploadUrl({ key, contentType: body.contentType, contentLength })
    if (!upload) {
      return Response.json({ error: 'Recording storage is not configured.' }, { status: 503 })
    }

    // Written now rather than waiting for the upload to finish, matching the
    // signed-in-user route's own reasoning: a failed upload should leave a
    // dangling key, not a lost pointer to a recording that does exist. The
    // session document may not have been created yet at this point — the
    // upload happens in parallel with /api/candidate/complete at hangup, and
    // this can land first — so this upserts rather than requiring the row to
    // already exist.
    const { db } = await connectToDatabase()
    await db
      .collection('sessions')
      .updateOne(
        { sessionId: invitation.sessionId },
        { $set: { 'recording.videoKey': key, 'recording.videoUpdatedAt': new Date() } },
        { upsert: true },
      )

    return Response.json({ uploadUrl: upload.url, key: upload.key }, { status: 201 })
  } catch (error) {
    console.error('POST /api/candidate/recording-url error:', error)
    return Response.json({ error: 'Could not prepare the recording upload.' }, { status: 500 })
  }
}
