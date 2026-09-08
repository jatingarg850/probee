#!/usr/bin/env bun

/**
 * Verify recording storage end to end against whatever is in web/.env.
 *
 * Three checks, each catching a different class of misconfiguration:
 *
 *   1. Config is present.        Wrong env var names, or none set at all.
 *   2. A signed URL can be issued and actually accepts a PUT.
 *      Wrong endpoint shape (the most common Supabase/R2/B2 mistake — see
 *      the note in .env.example about the S3 sub-path), wrong region,
 *      or a bucket that does not exist.
 *   3. A signed GET reads back the exact bytes just written.
 *      Confirms the round trip a real interview recording takes:
 *      presigned PUT from the browser, presigned GET for playback.
 *
 * Uploads a tiny throwaway object under `recordings/_healthcheck/` and
 * deletes it again, so running this repeatedly leaves nothing behind.
 */

import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'

import { createPlaybackUrl, createUploadUrl, getStorageConfig, recordingKey } from '../src/lib/storage'

const config = getStorageConfig()
if (!config) {
  console.error('Storage is not configured. Set STORAGE_ENDPOINT, STORAGE_BUCKET,')
  console.error('STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY in web/.env.')
  process.exit(1)
}

console.log(`Endpoint: ${config.endpoint}`)
console.log(`Bucket:   ${config.bucket}`)
console.log(`Region:   ${config.region}\n`)

const key = recordingKey({
  organizationId: '_healthcheck',
  sessionId: `check-${Date.now()}`,
  kind: 'video',
  extension: 'txt',
})
const body = `PROBE storage check — ${new Date().toISOString()}`

let failed = false

console.log(`1. Signing an upload URL for ${key} ...`)
const upload = await createUploadUrl({ key, contentType: 'video/webm', contentLength: body.length })
if (!upload) {
  console.error('   FAILED — createUploadUrl returned null even though config is present.')
  process.exit(1)
}
console.log('   OK — signed.')

console.log('2. Uploading a small test object with that URL ...')
try {
  const putResponse = await fetch(upload.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/webm' },
    body,
  })
  if (!putResponse.ok) {
    failed = true
    console.error(`   FAILED — bucket rejected the upload: ${putResponse.status} ${putResponse.statusText}`)
    console.error(`   ${await putResponse.text().catch(() => '(no body)')}`)
  } else {
    console.log('   OK — accepted.')
  }
} catch (error) {
  failed = true
  console.error('   FAILED — network error reaching the endpoint:', error)
}

if (!failed) {
  console.log('3. Signing a playback URL and reading the object back ...')
  const playbackUrl = await createPlaybackUrl(key)
  if (!playbackUrl) {
    failed = true
    console.error('   FAILED — createPlaybackUrl returned null.')
  } else {
    const getResponse = await fetch(playbackUrl)
    const text = await getResponse.text()
    if (!getResponse.ok) {
      failed = true
      console.error(`   FAILED — bucket rejected the read: ${getResponse.status} ${getResponse.statusText}`)
    } else if (text !== body) {
      failed = true
      console.error('   FAILED — read back different bytes than were written.')
    } else {
      console.log('   OK — round trip matched exactly.')
    }
  }
}

console.log('\nCleaning up the test object ...')
try {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true,
  })
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
  console.log('Cleaned up.')
} catch (error) {
  console.warn('Could not delete the test object (harmless — it is 47 bytes):', error)
}

if (failed) {
  console.error('\nStorage check FAILED. See the errors above.')
  console.error('The most common cause: STORAGE_ENDPOINT missing the provider-specific path.')
  console.error('For Supabase it must end in /storage/v1/s3 — see web/.env.example.')
  process.exit(1)
}

console.log('\nAll checks passed. Recording storage is working.')
