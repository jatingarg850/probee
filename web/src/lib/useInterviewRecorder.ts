'use client'

import { useCallback, useRef, useState } from 'react'

import { authHeaders, readApiError } from '@/lib/clientAuth'

/**
 * Record an interview in the browser and upload it when the call ends.
 *
 * ============================================================
 * RECORDED LOCALLY, NOT SERVER-SIDE
 * ============================================================
 * The alternative is Agora Cloud Recording, which is a separate paid product
 * with its own token flow and per-minute charge on top of the Conversational
 * AI Engine minutes we already pay for. `MediaRecorder` on the candidate's own
 * stream costs nothing and captures the same thing: what the candidate said
 * and, if they consented, what they looked like saying it.
 *
 * The trade is that a browser crash loses the recording. That is acceptable
 * because the recording is not the record — the transcript and the scores are
 * written server-side as the interview happens, and they are what a hiring
 * decision rests on. The video is corroboration.
 *
 * ============================================================
 * CONSENT IS THE CALLER'S JOB, NOT THIS HOOK'S
 * ============================================================
 * `start` is never called speculatively. Recording somebody's face without
 * them having agreed to it is the exact thing Illinois AIVIA and BIPA exist
 * about, and a hook that could be switched on by a prop default is a hook that
 * will eventually be switched on by accident. The caller must have a recorded
 * consent before calling `start`.
 */

export type RecorderState = 'idle' | 'recording' | 'uploading' | 'saved' | 'failed' | 'unsupported'

/** In preference order. The first the browser admits to is used — Safari
 * supports none of the VP9 variants and falls back to mp4. */
const CANDIDATE_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] as const

/** Chunked rather than one blob at the end, so a long interview does not sit
 * entirely in memory as a single growing buffer. */
const CHUNK_MS = 5000

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const type of CANDIDATE_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return null
}

export function useInterviewRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<string>('video/webm')

  /** Begin recording an existing stream. The stream belongs to the caller —
   * this hook neither requests camera permission nor stops the tracks, because
   * the same stream is being published to the call and stopping it here would
   * end the interview. */
  const start = useCallback((stream: MediaStream) => {
    const mimeType = pickMimeType()
    if (!mimeType) {
      setState('unsupported')
      return false
    }

    try {
      chunksRef.current = []
      mimeRef.current = mimeType
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.start(CHUNK_MS)
      recorderRef.current = recorder
      setState('recording')
      setError(null)
      return true
    } catch (err) {
      console.warn('Could not start recording:', err)
      setState('unsupported')
      return false
    }
  }, [])

  /**
   * Stop and upload.
   *
   * Returns the storage key on success and null on any failure. Deliberately
   * never throws: this runs during hang-up, and an exception here would take
   * down the flow that saves the transcript and shows the scorecard — which
   * matter far more than the video does.
   */
  /**
   * `requestTicket` overrides how the upload ticket is requested — the
   * candidate flow has no user bearer token (a candidate has no PROBE
   * account) and must call a different route with a different header
   * carrying its interview token instead. Defaults to the signed-in-user
   * route so existing/future practice-side callers need no changes.
   */
  const stopAndUpload = useCallback(
    async (
      sessionId: string,
      requestTicket?: (contentType: string, contentLength: number) => Promise<Response>,
    ): Promise<string | null> => {
      const recorder = recorderRef.current
      recorderRef.current = null
      if (!recorder || recorder.state === 'inactive') return null

      const blob = await new Promise<Blob | null>((resolve) => {
        recorder.onstop = () => {
          const parts = chunksRef.current
          chunksRef.current = []
          resolve(parts.length > 0 ? new Blob(parts, { type: mimeRef.current }) : null)
        }
        try {
          recorder.stop()
        } catch {
          resolve(null)
        }
      })

      if (!blob || blob.size === 0) {
        setState('idle')
        return null
      }

      setState('uploading')
      try {
        // The server derives the storage key from the session and signs a
        // permission for that one object. Nothing about the path is decided here.
        const contentType = mimeRef.current.split(';')[0]
        const ticketResponse = requestTicket
          ? await requestTicket(contentType, blob.size)
          : await fetch('/api/recordings/upload-url', {
              method: 'POST',
              headers: authHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ sessionId, kind: 'video', contentType, contentLength: blob.size }),
            })
        if (!ticketResponse.ok) {
          throw new Error(await readApiError(ticketResponse, 'Could not prepare the upload.'))
        }
        const { uploadUrl, key } = await ticketResponse.json()

        // Straight to the bucket. `Content-Type` must match what was signed, or
        // the storage service rejects the signature.
        const upload = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: blob,
        })
        if (!upload.ok) {
          const uploadError = await upload.text().catch(() => '')
          const statusMessage = upload.status === 404 
            ? 'Recording storage endpoint is misconfigured (404). Check STORAGE_ENDPOINT in server configuration.'
            : upload.status === 403
            ? 'Recording storage credentials are invalid (403). Check STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY.'
            : `Upload failed with status ${upload.status}`
          throw new Error(statusMessage + (uploadError ? ` — ${uploadError}` : ''))
        }

        setState('saved')
        return key as string
      } catch (err) {
        console.warn('Could not upload the recording:', err)
        setError(err instanceof Error ? err.message : 'The recording could not be saved.')
        setState('failed')
        return null
      }
    },
    [],
  )

  /** Abandon without uploading — for a candidate who withdraws consent, or a
   * session that ended before it began. */
  const discard = useCallback(() => {
    const recorder = recorderRef.current
    recorderRef.current = null
    chunksRef.current = []
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
    } catch {
      // Already stopped; nothing to do.
    }
    setState('idle')
  }, [])

  return { state, error, start, stopAndUpload, discard }
}
