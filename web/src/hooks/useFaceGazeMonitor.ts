'use client'

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { useEffect, useState } from 'react'

import { suppressKnownConsoleNoise } from '@/lib/suppressKnownConsoleNoise'

// Called at module scope so it runs the moment anything imports this hook —
// MediaPipe's own "Created TensorFlow Lite XNNPACK delegate" log line fires
// from inside this file (see the detectForVideo loop below), on the first
// detection call, which is before any component-level effect could patch
// console.error in time. See suppressKnownConsoleNoise's own comment for why
// this needs calling from here specifically, not only from InterviewFlow.
suppressKnownConsoleNoise()

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

/** Iris landmark indices in MediaPipe's 478-point face mesh. The Tasks API
 * face_landmarker bundle always emits all 478 (unlike the legacy FaceMesh
 * solution, iris isn't behind a `refineLandmarks` flag) — but the code
 * doesn't assume that blindly (see hasIris below): if a landmark set ever
 * comes back without them, gaze falls back to head-yaw only instead of
 * silently reporting "never looking away".               */
const LEFT_IRIS = [468, 469, 470, 471, 472]
const RIGHT_IRIS = [473, 474, 475, 476, 477]
const NOSE_TIP = 1
// Eye-socket corners used to normalize where the iris sits within the eye,
// and (outer corners only) as anchors for the head-yaw fallback below.
const LEFT_EYE_OUTER = 33
const LEFT_EYE_INNER = 133
const RIGHT_EYE_INNER = 362
const RIGHT_EYE_OUTER = 263
const LEFT_EYE_TOP = 159
const LEFT_EYE_BOTTOM = 145
const RIGHT_EYE_TOP = 386
const RIGHT_EYE_BOTTOM = 374

const LOOK_AWAY_THRESHOLD_MS = 5000
const NO_FACE_THRESHOLD_MS = 4000
const MULTIPLE_FACES_THRESHOLD_MS = 1500
// How far off-center the iris can sit within its eye socket (0 = dead
// center, ~0.5 = at the corner) before a frame counts as "not looking at
// the screen". Averaged across both eyes rather than requiring each eye to
// individually clear the bar — per-eye landmark noise made that version
// under-fire in practice.
const GAZE_OFFSET_THRESHOLD = 0.18
// Head-turn fallback/booster: (distance from nose to far eye corner minus
// distance to near eye corner) / their sum. ~0 facing the camera straight
// on, growing as the head turns. Runs alongside the iris check (not only
// as a fallback) since eyes on their own miss a turned head with a
// centered gaze within the socket, e.g. glancing at a second monitor.
const YAW_RATIO_THRESHOLD = 0.14
// ARKit-style blink blendshape score (0 = open, 1 = fully closed) above
// which an eye counts as shut. This is a genuinely separate model output
// from the 468 face-mesh landmarks — it comes from FaceLandmarker's own
// blendshape head (outputFaceBlendshapes), not derived from face presence
// or landmark positions — so "face detected" and "eyes detected/open" can
// now actually disagree (e.g. eyes closed, camera angle occluding an eye)
// instead of the eye state trivially mirroring the face state.
const EYE_CLOSED_SCORE = 0.5

type Point = { x: number; y: number }

function landmarkCenter(landmarks: Point[], indices: number[]): Point {
  const sum = indices.reduce((acc, i) => ({ x: acc.x + landmarks[i].x, y: acc.y + landmarks[i].y }), { x: 0, y: 0 })
  return { x: sum.x / indices.length, y: sum.y / indices.length }
}

function estimateIrisOffset(landmarks: Point[]): number {
  const leftIris = landmarkCenter(landmarks, LEFT_IRIS)
  const rightIris = landmarkCenter(landmarks, RIGHT_IRIS)

  const leftEyeWidth = Math.abs(landmarks[LEFT_EYE_INNER].x - landmarks[LEFT_EYE_OUTER].x) || 1e-6
  const rightEyeWidth = Math.abs(landmarks[RIGHT_EYE_OUTER].x - landmarks[RIGHT_EYE_INNER].x) || 1e-6
  const leftOffsetX = (leftIris.x - (landmarks[LEFT_EYE_OUTER].x + landmarks[LEFT_EYE_INNER].x) / 2) / leftEyeWidth
  const rightOffsetX = (rightIris.x - (landmarks[RIGHT_EYE_INNER].x + landmarks[RIGHT_EYE_OUTER].x) / 2) / rightEyeWidth
  const horizontalOffset = (leftOffsetX + rightOffsetX) / 2

  const leftEyeHeight = Math.abs(landmarks[LEFT_EYE_BOTTOM].y - landmarks[LEFT_EYE_TOP].y) || 1e-6
  const rightEyeHeight = Math.abs(landmarks[RIGHT_EYE_BOTTOM].y - landmarks[RIGHT_EYE_TOP].y) || 1e-6
  const leftOffsetY = (leftIris.y - (landmarks[LEFT_EYE_TOP].y + landmarks[LEFT_EYE_BOTTOM].y) / 2) / leftEyeHeight
  const rightOffsetY = (rightIris.y - (landmarks[RIGHT_EYE_TOP].y + landmarks[RIGHT_EYE_BOTTOM].y) / 2) / rightEyeHeight
  const verticalOffset = (leftOffsetY + rightOffsetY) / 2

  // Vertical parallax (webcam sits above the screen) makes a small vertical
  // offset normal even when looking dead center, so it needs a wider berth
  // than the horizontal check.
  return Math.max(Math.abs(horizontalOffset), Math.abs(verticalOffset) / 1.6)
}

function estimateYawRatio(landmarks: Point[]): number {
  const nose = landmarks[NOSE_TIP]
  const distLeft = Math.hypot(nose.x - landmarks[LEFT_EYE_OUTER].x, nose.y - landmarks[LEFT_EYE_OUTER].y)
  const distRight = Math.hypot(nose.x - landmarks[RIGHT_EYE_OUTER].x, nose.y - landmarks[RIGHT_EYE_OUTER].y)
  return Math.abs(distLeft - distRight) / (distLeft + distRight || 1e-6)
}

interface Category {
  categoryName: string
  score: number
}

function blendshapeScore(categories: Category[], name: string): number {
  return categories.find((c) => c.categoryName === name)?.score ?? 0
}

/** Whether both eyes are open, straight from FaceLandmarker's blendshape
 * model (eyeBlinkLeft/Right) — independent of the 3D face-mesh landmarks
 * used everywhere else in this file. When blendshapes aren't available for
 * some reason, defaults to "open" rather than blocking on a signal that
 * never arrived. */
function estimateEyesOpen(blendshapes: Category[]): boolean {
  if (blendshapes.length === 0) return true
  const blinkLeft = blendshapeScore(blendshapes, 'eyeBlinkLeft')
  const blinkRight = blendshapeScore(blendshapes, 'eyeBlinkRight')
  return blinkLeft < EYE_CLOSED_SCORE && blinkRight < EYE_CLOSED_SCORE
}

/** Rough "is this person looking at the screen" signal — combines iris
 * position within the eye socket with head yaw (a turned head reads as
 * "away" even if the eyes are centered in the socket, which iris-only
 * tracking misses). Not calibrated eye tracking, just a heuristic to catch
 * a sustained look at something else. */
function estimateGazeAway(landmarks: Point[]): boolean {
  const hasIris = landmarks.length >= 478
  const irisAway = hasIris && estimateIrisOffset(landmarks) > GAZE_OFFSET_THRESHOLD
  const yawAway = estimateYawRatio(landmarks) > YAW_RATIO_THRESHOLD
  return irisAway || yawAway
}

/** Accumulates "bad" time and drains "good" time (a leaky bucket) rather
 * than requiring an unbroken run of bad frames — a single noisy/blinked
 * frame no longer resets a multi-second countdown back to zero, which is
 * what made the strict version under-fire in practice. Returns the updated
 * bucket value and whether it has now crossed the threshold. */
function updateBucket(current: number, isBad: boolean, dtMs: number, thresholdMs: number) {
  const next = isBad ? Math.min(thresholdMs, current + dtMs) : Math.max(0, current - dtMs * 1.5)
  return { value: next, triggered: next >= thresholdMs }
}

export interface FaceGazeMonitorState {
  /** The raw camera stream — display it by attaching to any <video> element
   * you own (`el.srcObject = stream`); do not stop its tracks yourself, the
   * hook owns the stream's lifecycle. Detection itself runs against a
   * separate, hidden video element internal to the hook, so any number of
   * on-screen previews can attach this same stream without racing the
   * detection loop or each other. */
  stream: MediaStream | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  faceDetected: boolean
  /** Sustained absence of any face for NO_FACE_THRESHOLD_MS+ (leaky). */
  noFaceSustained: boolean
  /** More than one face held in frame for MULTIPLE_FACES_THRESHOLD_MS+ (leaky). */
  multipleFaces: boolean
  /** Gaze/head-turn estimated off-screen for LOOK_AWAY_THRESHOLD_MS+ (leaky). */
  isLookingAway: boolean
  /** 0-1 fill of the look-away bucket, for a live "how close to a warning"
   * readout — not itself a violation signal. */
  gazeAwayLevel: number
  /** Both eyes open, straight from FaceLandmarker's blendshape classifier —
   * a genuinely separate signal from faceDetected (a face can be detected
   * with eyes shut) and independent of the gaze-direction landmark math. */
  eyesOpen: boolean
  /** The real "eyes tracked" status: a face is present, iris landmarks
   * were returned for it, and the eyes are open. This is what should drive
   * an "eyes detected" indicator — faceDetected alone doesn't tell you the
   * eyes themselves are trackable. */
  eyesDetected: boolean
}

/** Turns on the webcam, runs MediaPipe's FaceLandmarker (Google's on-device
 * face + iris model, entirely client-side — no frame ever leaves the
 * browser) frame by frame, and reports whether a face is visible, whether
 * more than one face is in frame, and roughly where the person is looking.
 * `active` gates the whole lifecycle so the camera is only ever on while
 * needed (the precheck screen and the live interview).
 *
 * Detection runs against a video element the hook creates and owns
 * internally (never inserted into React's tree), rather than a ref handed
 * to whichever consumer happens to be showing the self-view preview at the
 * time — see useCameraPreviewRef for how previews attach to `stream`
 * independently of this. */
export function useFaceGazeMonitor(active: boolean): FaceGazeMonitorState {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<FaceGazeMonitorState['status']>('idle')
  const [error, setError] = useState<string | null>(null)
  const [faceDetected, setFaceDetected] = useState(false)
  const [noFaceSustained, setNoFaceSustained] = useState(false)
  const [multipleFaces, setMultipleFaces] = useState(false)
  const [isLookingAway, setIsLookingAway] = useState(false)
  const [gazeAwayLevel, setGazeAwayLevel] = useState(0)
  const [eyesOpen, setEyesOpen] = useState(true)
  const [eyesDetected, setEyesDetected] = useState(false)

  useEffect(() => {
    if (!active) {
      setStatus('idle')
      setStream(null)
      setFaceDetected(false)
      setNoFaceSustained(false)
      setMultipleFaces(false)
      setIsLookingAway(false)
      setGazeAwayLevel(0)
      setEyesOpen(true)
      setEyesDetected(false)
      return
    }

    let cancelled = false
    let mediaStream: MediaStream | null = null
    let landmarker: FaceLandmarker | null = null
    let rafId: number | null = null
    let lastFrameTime = performance.now()
    let awayBucket = 0
    let noFaceBucket = 0
    let multiFaceBucket = 0
    let loggedLandmarkCount = false

    // Off-DOM but still "attached" (1x1, positioned off-screen rather than
    // display:none) — some browsers throttle or fully pause decoding on
    // detached/display:none video elements, which would silently stall
    // detection.
    const detectionVideo = document.createElement('video')
    detectionVideo.muted = true
    detectionVideo.playsInline = true
    detectionVideo.setAttribute('aria-hidden', 'true')
    detectionVideo.style.position = 'fixed'
    detectionVideo.style.left = '-9999px'
    detectionVideo.style.width = '1px'
    detectionVideo.style.height = '1px'
    document.body.appendChild(detectionVideo)

    const createLandmarker = async (filesetResolver: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) => {
      try {
        return await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 2,
          // Turns on FaceLandmarker's own blendshape classifier head — a
          // second, independent model output alongside the 478 face-mesh
          // points, used here for a real per-eye open/closed signal (see
          // estimateEyesOpen) rather than inferring eye state from the mesh.
          outputFaceBlendshapes: true,
        })
      } catch (gpuError) {
        // Some devices/browsers reject the GPU delegate outright (no WebGL2,
        // driver blocklist, etc.) — without this fallback the whole monitor
        // silently died here and nothing downstream (warnings, strikes)
        // ever fired, which is what "eye detection isn't working" turned
        // out to be in practice.
        console.warn('FaceLandmarker GPU delegate failed, retrying on CPU:', gpuError)
        return await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numFaces: 2,
          outputFaceBlendshapes: true,
        })
      }
    }

    const run = async () => {
      setStatus('loading')
      setError(null)
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
          // Requested together with video so the browser shows ONE combined
          // camera+microphone permission prompt right here on the precheck
          // screen, instead of silently deferring the mic prompt to the
          // moment the live call tries to publish audio — which would
          // otherwise interrupt the actual interview to ask. The audio
          // track itself is discarded immediately below: this hook only
          // ever needs video for face/gaze detection, and holding a second,
          // unused microphone capture open for the whole interview would be
          // wasteful. Agora's own track creation later reuses the
          // now-granted permission without prompting again.
          audio: true,
        })
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop())
          return
        }
        for (const track of mediaStream.getAudioTracks()) {
          track.stop()
          mediaStream.removeTrack(track)
        }
        detectionVideo.srcObject = mediaStream
        await detectionVideo.play()
        setStream(mediaStream)

        const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE)
        if (cancelled) return
        landmarker = await createLandmarker(filesetResolver)
        if (cancelled) {
          landmarker.close()
          return
        }

        setStatus('ready')
        lastFrameTime = performance.now()

        const loop = () => {
          if (cancelled || !landmarker) return
          const now = performance.now()
          const dt = Math.min(200, now - lastFrameTime) // cap so a dropped/backgrounded tab can't dump a huge jump into the buckets
          lastFrameTime = now

          const result = landmarker.detectForVideo(detectionVideo, now)
          const faces = (result.faceLandmarks ?? []) as Point[][]

          const hasFace = faces.length > 0
          setFaceDetected(hasFace)
          const noFaceResult = updateBucket(noFaceBucket, !hasFace, dt, NO_FACE_THRESHOLD_MS)
          noFaceBucket = noFaceResult.value
          setNoFaceSustained(noFaceResult.triggered)

          const multiFaceResult = updateBucket(multiFaceBucket, faces.length > 1, dt, MULTIPLE_FACES_THRESHOLD_MS)
          multiFaceBucket = multiFaceResult.value
          setMultipleFaces(multiFaceResult.triggered)

          const primary = faces[0]
          const hasIris = !!primary && primary.length >= 478
          if (primary && !loggedLandmarkCount) {
            loggedLandmarkCount = true
            if (!hasIris) {
              console.warn(
                `FaceLandmarker returned ${primary.length} landmarks (expected 478 with iris) — gaze tracking is running on head-yaw only.`,
              )
            }
          }

          const blendshapes = result.faceBlendshapes?.[0]?.categories ?? []
          const eyesOpenNow = hasFace ? estimateEyesOpen(blendshapes) : false
          setEyesOpen(eyesOpenNow)
          setEyesDetected(hasFace && hasIris && eyesOpenNow)

          // Eyes shut for a sustained stretch (dozing, reading a phone
          // held low with eyes mostly closed) counts toward "away" too,
          // not just gaze direction — a real eye-specific signal the old
          // landmark-only version had no way to see at all.
          const away = hasFace && !!primary && (estimateGazeAway(primary) || !eyesOpenNow)
          const awayResult = updateBucket(awayBucket, away, dt, LOOK_AWAY_THRESHOLD_MS)
          awayBucket = awayResult.value
          setIsLookingAway(awayResult.triggered)
          setGazeAwayLevel(awayBucket / LOOK_AWAY_THRESHOLD_MS)

          rafId = requestAnimationFrame(loop)
        }
        rafId = requestAnimationFrame(loop)
      } catch (err) {
        if (cancelled) return
        console.error('Face/gaze monitor failed to start:', err)
        setStatus('error')
        setError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera or microphone access was denied. Enable both in your browser settings to start the interview.'
            : 'Could not start the camera or face-tracking model.',
        )
      }
    }

    run()

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      landmarker?.close()
      mediaStream?.getTracks().forEach((t) => t.stop())
      detectionVideo.srcObject = null
      detectionVideo.remove()
      setStream(null)
    }
  }, [active])

  return {
    stream,
    status,
    error,
    faceDetected,
    noFaceSustained,
    multipleFaces,
    isLookingAway,
    gazeAwayLevel,
    eyesOpen,
    eyesDetected,
  }
}
