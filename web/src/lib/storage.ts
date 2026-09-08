import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Object storage for interview recordings.
 *
 * ============================================================
 * S3-COMPATIBLE, NOT S3
 * ============================================================
 * Written against the S3 *API* rather than AWS, because every storage service
 * worth using for this speaks it and none of them are AWS-priced:
 *
 *   Cloudflare R2   10 GB free, and — the reason it is first on this list —
 *                   **zero egress fees**. Recordings are written once and read
 *                   back by reviewers many times, so egress is the bill that
 *                   grows, not storage.
 *   Backblaze B2    10 GB free, egress free up to 3× stored bytes.
 *   Supabase        1 GB free, worth it only if you already run Supabase.
 *   MinIO           self-hosted, for an on-premises deployment.
 *
 * Switching between them is four environment variables and no code. That is
 * the point of not writing `new S3Client()` at each call site.
 *
 * ============================================================
 * THE FILE NEVER PASSES THROUGH THIS SERVER
 * ============================================================
 * Uploads use a presigned URL: the server signs a short-lived permission to
 * write one exact key, and the browser PUTs the recording straight to the
 * bucket. Proxying a 200 MB video through a Next.js route instead would mean
 * buffering it in the server's memory, holding a request open for minutes, and
 * hitting the body-size limit on every serverless platform there is.
 *
 * The signature is what makes this safe. It names the key, the content type
 * and an expiry, so a client holding one can overwrite nothing else and cannot
 * use it tomorrow.
 *
 * ============================================================
 * NOTHING IS PUBLIC
 * ============================================================
 * The bucket must have no public access. Recordings are read back through
 * presigned GET urls that expire in an hour, issued only after the caller's
 * membership has been checked. A recording is a video of somebody's job
 * interview; a guessable public URL for one is the worst bug this system could
 * have.
 */

const ENDPOINT_ENV = 'STORAGE_ENDPOINT'
const BUCKET_ENV = 'STORAGE_BUCKET'
const ACCESS_KEY_ENV = 'STORAGE_ACCESS_KEY_ID'
const SECRET_KEY_ENV = 'STORAGE_SECRET_ACCESS_KEY'
const REGION_ENV = 'STORAGE_REGION'

/** Upload links live long enough to finish a large upload on a poor
 * connection, and no longer. */
export const UPLOAD_URL_TTL_SECONDS = 60 * 30
/** Playback links live long enough to watch an interview once. */
export const PLAYBACK_URL_TTL_SECONDS = 60 * 60

/** Recordings are chunky but not unbounded. 45 minutes of 720p VP9 with Opus
 * audio lands well under this; anything above it is a bug or an attack. */
export const MAX_RECORDING_BYTES = 512 * 1024 * 1024

/** Only what MediaRecorder actually produces. An open content type would let a
 * signed URL be used to host arbitrary files in our bucket. */
const ALLOWED_CONTENT_TYPES = new Set(['video/webm', 'video/mp4', 'audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg'])

export interface StorageConfig {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region: string
}

/**
 * Read the configuration, or null when storage is not set up.
 *
 * Null rather than a throw, for the same reason billing and email do it: the
 * whole product has to run locally without a storage account. Recording is the
 * one feature that degrades — the routes return an explicit "recording is not
 * configured" rather than a 500, and the interview itself is unaffected.
 */
export function getStorageConfig(): StorageConfig | null {
  const endpoint = process.env[ENDPOINT_ENV]
  const bucket = process.env[BUCKET_ENV]
  const accessKeyId = process.env[ACCESS_KEY_ENV]
  const secretAccessKey = process.env[SECRET_KEY_ENV]
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null

  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    // R2 ignores the region but the SDK insists on one being present, and
    // "auto" is what Cloudflare's own documentation uses.
    region: process.env[REGION_ENV] ?? 'auto',
  }
}

export function isStorageConfigured(): boolean {
  return getStorageConfig() !== null
}

let cachedClient: S3Client | null = null

function client(config: StorageConfig): S3Client {
  // Cached across requests. Creating an S3Client per request leaks sockets
  // under load, the same reason the Mongo connection is cached.
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // Required by R2, B2 and MinIO: without it the SDK builds
      // `https://bucket.endpoint/...` virtual-host URLs, which only AWS
      // resolves. This is the single most common reason an S3-compatible
      // integration returns a DNS error that looks like a credentials problem.
      forcePathStyle: true,
    })
  }
  return cachedClient
}

export function resetStorageClientForTests(): void {
  cachedClient = null
}

/**
 * The key a recording is stored under.
 *
 * Built entirely from ids the server already holds — never from a filename the
 * client supplied. A client-chosen key is a path-traversal bug waiting to
 * happen (`../../other-org/...`) and a way to overwrite somebody else's
 * recording. The organisation prefix also means a bucket listing is grouped
 * the way access is, which is what makes a retention sweep possible later.
 */
export function recordingKey(input: {
  organizationId: string
  sessionId: string
  kind: 'video' | 'audio'
  extension: string
}): string {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '')
  const extension = input.extension.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'webm'
  return `recordings/${safe(input.organizationId)}/${safe(input.sessionId)}/${input.kind}.${extension}`
}

export function isAllowedContentType(value: unknown): value is string {
  return typeof value === 'string' && ALLOWED_CONTENT_TYPES.has(value)
}

/**
 * A short-lived permission for the browser to write exactly one object.
 *
 * `ContentType` and `ContentLength` are part of what is signed, so a client
 * cannot use the URL to upload something larger or of a different type than it
 * declared — the bucket rejects a PUT whose headers do not match the
 * signature.
 */
export async function createUploadUrl(input: {
  key: string
  contentType: string
  contentLength: number
}): Promise<{ url: string; key: string; expiresIn: number } | null> {
  const config = getStorageConfig()
  if (!config) return null

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
  })

  const url = await getSignedUrl(client(config), command, { expiresIn: UPLOAD_URL_TTL_SECONDS })
  return { url, key: input.key, expiresIn: UPLOAD_URL_TTL_SECONDS }
}

/** A short-lived link to watch one recording. Issued only after the caller's
 * membership in the owning organisation has been checked — this function does
 * not know who is asking and must never be called before that. */
export async function createPlaybackUrl(key: string): Promise<string | null> {
  const config = getStorageConfig()
  if (!config) return null

  const command = new GetObjectCommand({ Bucket: config.bucket, Key: key })
  return getSignedUrl(client(config), command, { expiresIn: PLAYBACK_URL_TTL_SECONDS })
}
