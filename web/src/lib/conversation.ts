import {
  type AgentState,
  type AgentTranscription,
  MessageType,
  type TranscriptHelperItem,
  TurnStatus,
  type UserTranscription,
} from 'agora-agent-client-toolkit'
import type { AgentVisualizerState, IMessageListItem } from 'agora-agent-uikit'

export function normalizeTranscriptSpacing(text: string): string {
  return text
    .replace(/([.!?])([A-Za-z])/g, '$1 $2')
    .replace(/,([A-Za-z])/g, ', $1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function normalizeTimestampMs(timestamp: number): number {
  return timestamp > 1e12 ? timestamp : timestamp * 1000
}

export function mapAgentVisualizerState(
  agentState: AgentState | null,
  isAgentConnected: boolean,
  connectionState: string,
): AgentVisualizerState {
  if (connectionState === 'DISCONNECTED' || connectionState === 'DISCONNECTING') {
    return 'disconnected'
  }

  if (connectionState === 'CONNECTING' || connectionState === 'RECONNECTING') {
    return 'joining'
  }

  if (!isAgentConnected) {
    return 'not-joined'
  }

  switch (agentState) {
    case 'listening':
      return 'listening'
    case 'thinking':
      return 'analyzing'
    case 'speaking':
      return 'talking'
    default:
      return 'ambient'
  }
}

export type MessageListItemWithSpeaker = IMessageListItem & {
  speaker?: string
  speakerName?: string
}

/** `turnSpeakers` maps turn_id -> the interviewer persona that was active
 * when that turn STARTED, locked once per turn (see ConversationComponent's
 * turnSpeakerRef) — this is what makes the displayed name stick to the
 * interviewer who actually said it instead of drifting to whichever
 * interviewer is active by the time this renders. */
function toMessageListItem(
  item: TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>,
  turnSpeakers?: Map<number, string>,
  speakerNames?: Record<string, string>,
): MessageListItemWithSpeaker {
  // Only ever attribute an interviewer persona to an AGENT message.
  // `turn_id` is not guaranteed unique across roles — the candidate and the
  // agent each get their own turn_id sequence, so a candidate's turn_id can
  // land on the same number as an unrelated interviewer turn already
  // recorded in `turnSpeakers`. Looking the map up unconditionally (as this
  // used to) meant the candidate's OWN chat bubble could pick up whichever
  // interviewer's name happened to sit at that same numeric key — which is
  // exactly what showed a candidate's answer labeled "Alia" instead of
  // "You" in the live transcript.
  const isAgentMessage = item.metadata?.object === MessageType.AGENT_TRANSCRIPTION
  const speaker = isAgentMessage && typeof item.turn_id === 'number' ? turnSpeakers?.get(item.turn_id) : undefined
  return {
    turn_id: item.turn_id,
    uid: Number(item.uid) || 0,
    text: typeof item.text === 'string' ? item.text : '',
    status: item.status as unknown as IMessageListItem['status'],
    createdAt: typeof item._time === 'number' ? normalizeTimestampMs(item._time) : undefined,
    speaker,
    speakerName: speaker ? speakerNames?.[speaker] : undefined,
  }
}

export function normalizeTranscript(
  transcript: TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[],
  localUid: string,
) {
  return transcript.map((item) => {
    const nextUid = item.uid === '0' ? localUid : item.uid
    const nextText = typeof item.text === 'string' ? normalizeTranscriptSpacing(item.text) : item.text

    return { ...item, uid: nextUid, text: nextText }
  })
}

export function getMessageList(
  transcript: TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[],
  turnSpeakers?: Map<number, string>,
  speakerNames?: Record<string, string>,
) {
  return transcript
    .filter((item) => item.status !== TurnStatus.IN_PROGRESS)
    .map((item) => toMessageListItem(item, turnSpeakers, speakerNames))
}

export function getCurrentInProgressMessage(
  transcript: TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[],
  turnSpeakers?: Map<number, string>,
  speakerNames?: Record<string, string>,
) {
  const item = transcript.find((entry) => entry.status === TurnStatus.IN_PROGRESS)
  return item ? toMessageListItem(item, turnSpeakers, speakerNames) : null
}
