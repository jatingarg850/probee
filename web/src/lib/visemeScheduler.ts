import { type VisemeId, wordToVisemes } from '@/lib/textToVisemes'

interface QueuedViseme {
  viseme: VisemeId
  durationMs: number
}

/** Roughly 150 words/minute of natural speech, the range most TTS voices
 * land in. Used only when the pipeline gives us no real word timing. */
const MS_PER_WORD_BASE = 260
const MS_PER_LETTER = 34
const MIN_WORD_DURATION_MS = 180
const MAX_QUEUED_VISEMES = 400

/** Turns a stream of spoken words into a queue of mouth shapes, and answers
 * "what should the mouth look like right now" each frame.
 *
 * Crucially the queue is advanced by a *speech clock*, not wall-clock time:
 * the caller only advances it while the agent is actually producing audio.
 * The transcript arrives far faster than the TTS speaks it (the LLM streams
 * a whole sentence in a few hundred ms), so a wall-clock timeline drained
 * the queue long before the audio finished and the mouth went still
 * mid-sentence. Consuming the queue in proportion to audio played keeps the
 * two in step regardless of how bursty the text is. */
export class VisemeScheduler {
  private queue: QueuedViseme[] = []
  private elapsedInHeadMs = 0

  /** Queue one spoken word. `durationMs` is the real spoken duration when
   * the pipeline provides it; otherwise it's estimated from word length. */
  pushWord(word: string, durationMs?: number) {
    const visemes = wordToVisemes(word)
    if (visemes.length === 0) return

    const total =
      durationMs && durationMs > 0
        ? durationMs
        : Math.max(MIN_WORD_DURATION_MS, MS_PER_WORD_BASE + word.length * MS_PER_LETTER)

    const per = total / visemes.length
    for (const viseme of visemes) {
      this.queue.push({ viseme, durationMs: per })
    }

    // Guard against an unbounded backlog if text ever badly outruns audio.
    if (this.queue.length > MAX_QUEUED_VISEMES) {
      this.queue.splice(0, this.queue.length - MAX_QUEUED_VISEMES)
      this.elapsedInHeadMs = 0
    }
  }

  /** Advance the timeline by `deltaMs` of *speech* (call only while the
   * agent is audibly speaking), then return the shape now showing. */
  advance(deltaMs: number): VisemeId | null {
    if (this.queue.length === 0) return null

    this.elapsedInHeadMs += deltaMs
    while (this.queue.length > 0 && this.elapsedInHeadMs >= this.queue[0].durationMs) {
      this.elapsedInHeadMs -= this.queue[0].durationMs
      this.queue.shift()
    }
    return this.queue.length > 0 ? this.queue[0].viseme : null
  }

  /** Current shape without advancing — for read-only observers. */
  peek(): VisemeId | null {
    return this.queue.length > 0 ? this.queue[0].viseme : null
  }

  /** How much speech is still queued, in milliseconds. Lets the caller tell
   * "still mid-sentence" from "ran dry". */
  pendingMs(): number {
    if (this.queue.length === 0) return 0
    let total = -this.elapsedInHeadMs
    for (const item of this.queue) total += item.durationMs
    return Math.max(0, total)
  }

  hasPending(): boolean {
    return this.queue.length > 0
  }

  /** Drop everything — call when the speaker changes or a turn is
   * interrupted, so a stale queue never drives the next turn's mouth. */
  reset() {
    this.queue = []
    this.elapsedInHeadMs = 0
  }
}
