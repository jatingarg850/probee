'use client'

import { useEffect, useMemo, useRef } from 'react'

import { PANEL_VOICE_NAMES } from '@/lib/panelAvatars'

type TranscriptMessage = {
  turn_id?: string | number
  uid: number
  text?: string
  createdAt?: number
  speaker?: string
  speakerName?: string
}

type QuickstartTranscriptPanelProps = {
  messageList: TranscriptMessage[]
  currentInProgressMessage: TranscriptMessage | null
  agentUID: string
  currentAgent?: string
}

const SPEAKER_NAMES: Record<string, string> = {
  ...PANEL_VOICE_NAMES,
  user: 'You',
}

function formatMessageTime(createdAt?: number) {
  if (!createdAt) return null
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(createdAt))
}

function getSpeakerLabel(message: TranscriptMessage, agentUID: string, currentAgent?: string): string {
  // `uid` is the one signal here that can't be wrong — it's whoever
  // actually published the audio this transcript entry came from. Checking
  // it FIRST, before trusting any supplied `speakerName`, is what stops a
  // stray/stale speakerName (e.g. one attributed via a turn_id that
  // happened to collide with an interviewer's) from ever mislabeling the
  // candidate's own bubble with an interviewer's name.
  const isAgent = String(message.uid) === agentUID

  if (!isAgent) {
    return 'You'
  }

  // If we have explicit speaker info from MongoDB
  if (message.speakerName) {
    return message.speakerName
  }

  // For agent messages, try to get the agent name from currentAgent
  if (currentAgent && SPEAKER_NAMES[currentAgent]) {
    return SPEAKER_NAMES[currentAgent]
  }

  // Fallback
  return 'Agent'
}

interface TranscriptGroup {
  key: string
  isAgent: boolean
  label: string
  createdAt?: number
  text: string
}

/** Speech-to-text commits a turn in segments, so one continuous stretch of
 * talking arrives as several transcript entries. Rendering one bubble each
 * chopped a single answer into a stack of fragments down the right-hand
 * side. Consecutive entries from the same speaker are folded into one
 * bubble instead, so a bubble stays open until somebody else actually
 * speaks — which is also what makes the in-progress segment read as the
 * live continuation of the sentence rather than a new message. A change of
 * speaker (including one interviewer handing off to another) always starts
 * a new bubble. */
function groupConsecutiveTurns(
  messages: TranscriptMessage[],
  agentUID: string,
  currentAgent?: string,
): TranscriptGroup[] {
  const groups: TranscriptGroup[] = []

  messages.forEach((message, index) => {
    const isAgent = String(message.uid) === agentUID
    const label = getSpeakerLabel(message, agentUID, currentAgent)
    const text = message.text?.trim() ?? ''
    const last = groups[groups.length - 1]

    if (last && last.isAgent === isAgent && last.label === label) {
      if (!text || last.text.endsWith(text)) return
      // A segment that re-sends the same turn with more words appended
      // (streaming growth) replaces what's there rather than doubling it.
      if (text.startsWith(last.text)) {
        last.text = text
        return
      }
      last.text = last.text ? `${last.text} ${text}` : text
      return
    }

    groups.push({
      key: `${message.turn_id ?? message.uid}-${index}`,
      isAgent,
      label,
      createdAt: message.createdAt,
      text,
    })
  })

  return groups
}

export function QuickstartTranscriptPanel({
  messageList,
  currentInProgressMessage,
  agentUID,
  currentAgent,
}: QuickstartTranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const groups = useMemo(() => {
    const all = currentInProgressMessage ? [...messageList, currentInProgressMessage] : messageList
    return groupConsecutiveTurns(all, agentUID, currentAgent)
  }, [currentInProgressMessage, messageList, agentUID, currentAgent])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  })

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card/20"
      aria-label="Transcription panel"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Transcript</h2>
          <p className="text-xs text-muted-foreground">Live voice turns</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {groups.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Start speaking to see the live transcript here.
          </div>
        ) : (
          groups.map((group) => {
            const time = formatMessageTime(group.createdAt)

            return (
              <article key={group.key} className={`flex flex-col ${group.isAgent ? 'items-start' : 'items-end'}`}>
                <div className="mb-1 flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground">
                  <span>{group.label}</span>
                  {time ? <span className="font-normal">{time}</span> : null}
                </div>
                <div
                  className={`max-w-full whitespace-pre-wrap rounded-xl border px-3 py-2 text-sm leading-6 ${
                    group.isAgent
                      ? 'border-border bg-surface/70 text-foreground'
                      : 'border-primary/30 bg-primary/10 text-foreground'
                  }`}
                >
                  {group.text || '...'}
                </div>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
