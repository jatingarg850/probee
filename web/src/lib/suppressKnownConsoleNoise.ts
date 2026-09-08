'use client'

declare global {
  interface Window {
    __knownConsoleNoisePatched?: boolean
  }
}

/**
 * Downgrade a short list of known-harmless, known-noisy `console.error`
 * calls from third-party SDKs to `console.debug`, so Next's dev overlay
 * stops treating them as blocking errors.
 *
 * Every one of these is a library logging its own internal, self-recovering
 * behaviour through `console.error` rather than `console.warn` or
 * `console.debug` — not a defect in this codebase, and not something a
 * try/catch here could intercept, since the SDK calls `console.error`
 * directly rather than throwing.
 *
 * ============================================================
 * CALL THIS FROM EVERY ENTRY POINT THAT CAN EMIT THESE, NOT JUST ONE
 * ============================================================
 * This used to live only inside `InterviewFlow.tsx` (the practice flow),
 * called once at module scope. The candidate flow
 * (`CandidateInterviewPage.tsx`) never imports that module — it is a
 * separate component tree — so the patch never ran there, and a candidate
 * sitting a hiring interview saw every one of these as an unhandled
 * "Console Error" in their dev tools. Since `useFaceGazeMonitor` (the
 * MediaPipe/TFLite noise) and the RTM/Agora call setup are both shared by
 * practice and hiring, this is called from each of the actual sites that can
 * produce the noise — the gaze-monitoring hook and the call-setup
 * components — rather than from one page-level component that happens to be
 * upstream of only one of the two flows. The `window` guard makes calling it
 * from multiple places safe: only the first call ever patches anything.
 */
export function suppressKnownConsoleNoise(): void {
  if (typeof window === 'undefined' || window.__knownConsoleNoisePatched) return
  window.__knownConsoleNoisePatched = true

  const originalError = console.error
  console.error = (...args: unknown[]) => {
    const text = args.filter((arg) => typeof arg === 'string').join(' ')

    // RTM presence self-healing (transient -13001 error). The SDK's own
    // rejoin loop catches this and retries in the background; it never
    // rejects our subscribe() call, so there is no promise to catch or
    // retry around — it just logs every internal attempt via console.error.
    if (text.includes('joinPresenceColl error') && text.includes('Presence service not connected')) {
      console.debug('[rtm presence self-healing, suppressed]', ...args)
      return
    }

    // RTM database teardown noise (normal during logout).
    if (text.includes('Database disconnection failed')) {
      console.debug('[rtm teardown noise, suppressed]', ...args)
      return
    }

    // RTM socket connection noise (normal closure during shutdown).
    if (text.includes('socket connection error') && text.includes('Normal closure')) {
      console.debug('[rtm socket closure, suppressed]', ...args)
      return
    }

    // RTM socket connection noise — the SDK's own auto-reconnect kicking in
    // on a flaky network. "try force reconnecting" IS that recovery already
    // starting, not a failure the app needs to react to.
    if (text.includes('socket connection error') && text.includes('try force reconnecting')) {
      console.debug('[rtm socket auto-reconnect, suppressed]', ...args)
      return
    }

    // MediaPipe/TFLite WASM startup noise. "INFO: Created TensorFlow Lite
    // XNNPACK delegate for CPU." is TFLite's own informational log line
    // about which backend it picked, routed through Emscripten's console
    // binding on the first call to detectForVideo() rather than at
    // FaceLandmarker construction — it is not an error and carries no
    // failure information.
    if (text.includes('Created TensorFlow Lite XNNPACK delegate')) {
      console.debug('[mediapipe startup noise, suppressed]', ...args)
      return
    }

    // Agora RTC SDK internal race on (re)subscribing to a remote user —
    // observed right after a panel handoff, when the agent's UID leaves and
    // rejoins under a fresh session. The SDK's own subscribe-retry logic is
    // what recovers this. If audio is ever actually missing after a
    // handoff (not just this log line), that is a real regression and this
    // suppression is the first place to look.
    if (text.includes('subscribe') && text.includes("Cannot use 'in' operator to search for 'name' in undefined")) {
      console.debug('[agora sdk subscribe race, suppressed]', ...args)
      return
    }

    // Everything else — a real error — reaches console.error normally.
    originalError(...args)
  }
}
