'use client'

import { PhoneOff } from '@/components/ui/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CallStatusPill } from '@/components/CallStatusPill'
import { ConnectionStatusPanel } from '@/components/ConnectionStatusPanel'
import { type ConnectionIssue, getConversationIssueSeverity } from '@/components/ConversationErrorCard'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { MicToggleButton } from '@/components/MicToggleButton'
import { MicrophoneSelector } from '@/components/MicrophoneSelector'
import { PanelStage, preloadPanelAvatarModel } from '@/components/PanelAvatarStage'
import { PanelIndicator } from '@/components/PanelIndicator'
import { QuickstartConversationLayout } from '@/components/QuickstartConversationLayout'
import { QuickstartTranscriptPanel } from '@/components/QuickstartTranscriptPanel'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useCharacterAssetLoader } from '@/hooks/useCharacterAssetLoader'
import { usePanelState } from '@/hooks/usePanelState'
import { DEFAULT_AGENT_UID } from '@/lib/agora'
import {
  type MessageListItemWithSpeaker,
  getCurrentInProgressMessage,
  getMessageList,
  mapAgentVisualizerState,
  normalizeTimestampMs,
  normalizeTranscript,
} from '@/lib/conversation'
import {
  createChatMessage,
  getChatMessages,
  getSpeakerName,
  saveChatMessage,
  saveConversationSession,
} from '@/lib/mongoChat'
import { PANEL_AVATARS, PANEL_AVATAR_ORDER, PANEL_VOICE_NAMES, isPanelistId } from '@/lib/panelAvatars'
import { VisemeScheduler } from '@/lib/visemeScheduler'
import { getSessionCost } from '@/services/api'
import type { ConversationComponentProps } from '@/types/conversation'
import {
  type AgentState,
  type AgentTranscription,
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  MessageSalStatus,
  MessageType,
  type TranscriptHelperItem,
  TranscriptHelperMode,
  TurnStatus,
  type UserTranscription,
} from 'agora-agent-client-toolkit'
import { AgentVisualizer } from 'agora-agent-uikit'
import {
  RemoteUser,
  type UID,
  useClientEvent,
  useJoin,
  useLocalMicrophoneTrack,
  usePublish,
  useRTCClient,
  useRemoteUsers,
} from 'agora-rtc-react'
import { setParameter } from 'agora-rtc-sdk-ng/esm'

const MAX_CONNECTION_ISSUES = 6

type RtmMessageErrorPayload = {
  object: 'message.error'
  module?: string
  code?: number
  message?: string
  send_ts?: number
}

type RtmSalStatusPayload = {
  object: 'message.sal_status'
  status?: string
  timestamp?: number
}

function isRtmMessageErrorPayload(value: unknown): value is RtmMessageErrorPayload {
  return !!value && typeof value === 'object' && (value as { object?: unknown }).object === 'message.error'
}

function isRtmSalStatusPayload(value: unknown): value is RtmSalStatusPayload {
  return !!value && typeof value === 'object' && (value as { object?: unknown }).object === 'message.sal_status'
}

export default function ConversationComponent({
  agoraData,
  rtmClient,
  onTokenWillExpire,
  onEndConversation,
  forceEndSignal,
  forceEndReason,
  durationMinutes,
  sessionId: providedSessionId,
  onTranscriptTurn,
  onPersistSession,
}: ConversationComponentProps) {
  const { user } = useAuth()
  const client = useRTCClient()
  const remoteUsers = useRemoteUsers()
  const [isEnabled, setIsEnabled] = useState(true)
  const [isAgentConnected, setIsAgentConnected] = useState(false)
  const [isConnectionDetailsOpen, setIsConnectionDetailsOpen] = useState(false)

  // Track character asset loading
  const characterAssetLoader = useCharacterAssetLoader()

  const [connectionState, setConnectionState] = useState<string>('CONNECTING')
  const agentUID = agoraData.agentUid ?? process.env.NEXT_PUBLIC_AGENT_UID ?? String(DEFAULT_AGENT_UID)
  const [joinedUID, setJoinedUID] = useState<UID>(0)

  // Generate or use session ID for persistent chat. A hiring interview
  // supplies one: it was minted server-side by /api/candidate/start and
  // recorded against the invitation, so the browser must not invent its own.
  const [sessionId] = useState(
    () => providedSessionId ?? `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  )
  const [conversationStartTime] = useState(Date.now())

  // Stops polling once the call has actually ended (not merely reconnecting
  // — a mid-call blip should not cut off panel-state updates the moment it
  // resolves). This is what stopped the 404 flood in the backend logs after
  // an interview ends: previously this polled every 600ms for as long as
  // the component stayed mounted, regardless of whether the channel it was
  // asking about still existed.
  const panelStateEnabled = connectionState !== 'DISCONNECTED' && connectionState !== 'DISCONNECTING'
  const panelState = usePanelState(agoraData.channel, panelStateEnabled)
  const activePanelistId = isPanelistId(panelState?.current_interviewer)
    ? panelState.current_interviewer
    : PANEL_AVATAR_ORDER[0]

  useEffect(() => {
    for (const id of PANEL_AVATAR_ORDER) {
      preloadPanelAvatarModel(PANEL_AVATARS[id].modelUrl)
    }
  }, [])

  // Word-driven lip-sync: fed by real word-arrival events (see the
  // TRANSCRIPT_UPDATED handler below), read every animation frame by the
  // active avatar's seat instead of any React state, to avoid re-rendering
  // the whole tree per word.
  const visemeSchedulerRef = useRef(new VisemeScheduler())
  const wordsSeenByTurnRef = useRef<Map<number, number>>(new Map())
  const getActiveViseme = useCallback((advanceMs: number) => visemeSchedulerRef.current.advance(advanceMs), [])

  // A stale word queue from the previous interviewer must never bleed into
  // the next one's mouth after a handoff.
  useEffect(() => {
    visemeSchedulerRef.current.reset()
    wordsSeenByTurnRef.current.clear()
  }, [activePanelistId])

  // Track which speaker (interviewer) was active when each message was
  // created — declared here (ahead of the handoff effect below, which
  // clears it) rather than after, so the ordering in source matches the
  // ordering that actually matters at runtime. Prevents message overwrites
  // when agents switch.
  const messagesSpeakerMapRef = useRef<Map<number, string>>(new Map())

  // A persona handoff on the backend is a full pipeline restart (see
  // agent.py's module docstring) — the Conversational AI Engine's turn_id
  // sequence starts over from a low number under the new session. The
  // vendor SDK's TranscriptHelper treats turn_id as strictly monotonic
  // within one instance (it drops/overwrites anything at or below the
  // highest turn_id already seen), so feeding it a second session's
  // restarted numbering into the SAME instance either drops the new
  // interviewer's lines outright or overwrites an earlier turn's text in
  // place — visually, the transcript panel appears to "rewrite itself from
  // the start" mid-handoff.
  //
  // The fix: on every handoff, snapshot whatever this generation has
  // rendered so far into `committedMessages` (which persists for the rest
  // of the call), then bump `handoffGeneration` to tear down and recreate
  // the AgoraVoiceAI instance below — a fresh TranscriptHelper with no
  // memory of the old turn_id range, matching the new session's numbering
  // exactly. The displayed transcript is committedMessages + whatever the
  // current generation has produced, so nothing already on screen is lost
  // or rewritten.
  const [handoffGeneration, setHandoffGeneration] = useState(0)
  const [committedMessages, setCommittedMessages] = useState<MessageListItemWithSpeaker[]>([])
  const currentMessageListRef = useRef<MessageListItemWithSpeaker[]>([])
  const lastPanelistIdRef = useRef(activePanelistId)

  useEffect(() => {
    if (lastPanelistIdRef.current === activePanelistId) return
    lastPanelistIdRef.current = activePanelistId
    setCommittedMessages((prev) => [...prev, ...currentMessageListRef.current])
    messagesSpeakerMapRef.current.clear()
    wordsSeenByTurnRef.current.clear()
    setRawTranscript([])
    // The outgoing session's last reported state belongs to a pipeline that
    // no longer exists — and because the handoff deliberately waits for that
    // interviewer to finish speaking before switching, it is almost always
    // `listening`. Left in place it reads as "the panel is silent" for the
    // whole of the incoming interviewer's opening line, until their fresh
    // session gets around to reporting a state of its own.
    setAgentState(null)
    setHandoffGeneration((generation) => generation + 1)
  }, [activePanelistId])

  const [rawTranscript, setRawTranscript] = useState<
    TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[]
  >([])
  const [agentState, setAgentState] = useState<AgentState | null>(null)
  const [connectionIssues, setConnectionIssues] = useState<ConnectionIssue[]>([])
  const addConnectionIssue = useCallback((issue: ConnectionIssue) => {
    setConnectionIssues((prev) => {
      const isDuplicate = prev.some(
        (x) =>
          x.agentUserId === issue.agentUserId &&
          x.code === issue.code &&
          x.message === issue.message &&
          Math.abs(x.timestamp - issue.timestamp) < 1500,
      )
      if (isDuplicate) return prev
      return [issue, ...prev].slice(0, MAX_CONNECTION_ISSUES)
    })
  }, [])

  useEffect(() => {
    if (connectionIssues.length > 0) {
      setIsConnectionDetailsOpen(true)
    }
  }, [connectionIssues.length])

  const [isReady, setIsReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    const id = setTimeout(() => {
      if (!cancelled) setIsReady(true)
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(id)
      setIsReady(false)
    }
  }, [])

  const appId = agoraData.appId ?? ''

  const { isConnected: joinSuccess } = useJoin(
    {
      appid: appId,
      channel: agoraData.channel,
      token: agoraData.token,
      uid: Number.parseInt(agoraData.uid, 10),
    },
    isReady,
  )

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady)

  useEffect(() => {
    if (!client) return
    try {
      setParameter('ENABLE_AUDIO_PTS', true)
    } catch (error) {
      console.warn('Could not set ENABLE_AUDIO_PTS:', error)
    }
  }, [client])

  useEffect(() => {
    if (joinSuccess && client) {
      const uid = client.uid
      if (uid !== null && uid !== undefined) {
        setJoinedUID(uid)
      }
    }
  }, [joinSuccess, client])

  // `handoffGeneration` is in the dependency array deliberately: bumping it
  // (see the persona-handoff effect above) tears down this effect's `ai`
  // instance via the cleanup below and creates a fresh one, which is what
  // gives the new session's turn_id sequence a clean TranscriptHelper to
  // land in instead of colliding with the previous session's numbering.
  useEffect(() => {
    if (!isReady || !joinSuccess) return

    let cancelled = false
    ;(async () => {
      try {
        const ai = await AgoraVoiceAI.init({
          rtcEngine: client,
          rtmConfig: { rtmEngine: rtmClient },
          // TEXT mode is what actually renders the live transcript with
          // this backend pipeline — WORD mode's incremental per-word
          // delivery isn't produced by it in practice (verified live: the
          // transcript panel went blank when this was set to WORD). Word
          // timing for lip-sync is instead read straight off
          // metadata.words on each TEXT update below, when the backend
          // happens to include it — see the TRANSCRIPT_UPDATED handler.
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: true,
        })

        if (cancelled) {
          try {
            if (AgoraVoiceAI.getInstance() === ai) {
              ai.unsubscribe()
              ai.destroy()
            }
          } catch {}
          return
        }

        ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => {
          setRawTranscript([...t])

          // Feed newly-revealed agent words into the lip-sync scheduler.
          //
          // Two sources, in preference order:
          //  1. `metadata.words` — carries real per-word timing, but this
          //     pipeline (Deepgram STT -> MiniMax TTS) does not populate it
          //     in TEXT render mode.
          //  2. The transcript text itself, which DOES stream here. We diff
          //     against how many words we've already scheduled for the turn
          //     and queue whatever is new.
          // Without (2) the scheduler stayed empty for the whole call, so
          // getViseme() always returned null and the avatars fell back to
          // volume-driven mouth flapping — the mouth moved, which masked
          // the fact that no word data was ever arriving.
          for (const item of t) {
            // Lock the speaker for this turn ID the FIRST time we see it, and
            // never touch it again. `t` is the full transcript on every
            // update (not just the newest item), so a plain `.set()` here —
            // no existence check — was overwriting every past turn's
            // recorded speaker with whichever interviewer happened to be
            // active by the time of that particular event. That's why every
            // message in the panel ended up labeled with the same (most
            // recent) interviewer's name once a handoff occurred, even
            // turns spoken before the switch.
            if (
              item.turn_id &&
              item.metadata?.object === MessageType.AGENT_TRANSCRIPTION &&
              !messagesSpeakerMapRef.current.has(item.turn_id)
            ) {
              messagesSpeakerMapRef.current.set(item.turn_id, activePanelistId)
            }

            // Save messages to MongoDB (only completed/final messages, not in-progress)
            // Use the tracked speaker for agent messages to avoid rewriting on agent switch
            if (item.status !== TurnStatus.IN_PROGRESS) {
              let speaker = 'user'

              if (item.metadata?.object === MessageType.AGENT_TRANSCRIPTION) {
                // Get the speaker from the tracked map (set when message first arrived)
                // If not found, use current activePanelistId as fallback
                speaker = messagesSpeakerMapRef.current.get(item.turn_id) ?? activePanelistId
              }

              const text = typeof item.text === 'string' ? item.text : ''

              if (text) {
                // The DB upserts on (channelId, sessionId, turnId) — see
                // /api/chat/messages — to collapse a turn's repeated
                // in-progress-then-final events into one row. But `t` comes
                // from a fresh AgoraVoiceAI instance every handoff (see the
                // generation effect above), and each restarted pipeline
                // session numbers its own turn_ids from a low number again.
                // Saving the raw turn_id here meant the second interviewer's
                // "turn 1" upserted directly over the first interviewer's
                // "turn 1" — same for every turn number both happened to
                // reach — silently deleting most non-first-interviewer
                // messages for the rest of the session (which is exactly
                // why only the technical interviewer's questions were
                // showing up in the question bank afterward). Folding in
                // handoffGeneration makes the saved id unique across the
                // whole session again, not just within one pipeline run.
                const globalTurnId =
                  typeof item.turn_id === 'number' ? handoffGeneration * 100_000 + item.turn_id : item.turn_id

                const message = createChatMessage(
                  agoraData.channel,
                  sessionId,
                  speaker,
                  text,
                  globalTurnId,
                  String(item.status),
                )
                // A candidate has no user token, so /api/chat/messages would
                // reject them. In hiring mode the turns are accumulated by the
                // caller and submitted in one authenticated write at the end.
                if (onTranscriptTurn) {
                  onTranscriptTurn({
                    speaker,
                    speakerName: getSpeakerName(speaker),
                    text,
                    timestamp: Date.now(),
                    turnId: typeof globalTurnId === 'number' ? globalTurnId : undefined,
                  })
                } else {
                  saveChatMessage(message)
                }
              }
            }

            if (item.metadata?.object !== MessageType.AGENT_TRANSCRIPTION) continue

            const timedWords = item.metadata.words
            const seen = wordsSeenByTurnRef.current.get(item.turn_id) ?? 0

            if (timedWords && timedWords.length > 0) {
              if (timedWords.length <= seen) continue
              for (let i = seen; i < timedWords.length; i++) {
                visemeSchedulerRef.current.pushWord(timedWords[i].word, timedWords[i].duration_ms)
              }
              wordsSeenByTurnRef.current.set(item.turn_id, timedWords.length)
              continue
            }

            const text = typeof item.text === 'string' ? item.text : ''
            if (!text) continue
            const textWords = text.split(/\s+/).filter(Boolean)
            if (textWords.length <= seen) continue

            // No timing available, so the scheduler estimates each word's
            // duration from its length. Queue order is what matters here —
            // the renderer consumes the queue in step with actual audio, so
            // a burst of text can't make the mouth run ahead of the voice.
            for (let i = seen; i < textWords.length; i++) {
              visemeSchedulerRef.current.pushWord(textWords[i])
            }
            wordsSeenByTurnRef.current.set(item.turn_id, textWords.length)
          }
        })
        ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) => {
          setAgentState(event.state)
          // Clear queued speech only when the floor genuinely passes back to
          // the candidate. Resetting on *any* non-speaking state wiped the
          // queue mid-utterance: the transcript usually arrives while the
          // agent is still `thinking` (the LLM streams text before TTS
          // starts), and `idle`/`silent` also fire between chunks — so the
          // words were being discarded before they could ever be spoken.
          if (event.state === 'listening') {
            visemeSchedulerRef.current.reset()
          }
        })
        ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (agentUserId, error) => {
          addConnectionIssue({
            id: `${Date.now()}-${agentUserId}-message-error-${error.code}`,
            source: 'rtm',
            agentUserId,
            code: error.code,
            message: error.message,
            timestamp: normalizeTimestampMs(error.timestamp),
          })
        })
        ai.on(AgoraVoiceAIEvents.MESSAGE_SAL_STATUS, (agentUserId, salStatus) => {
          if (
            salStatus.status === MessageSalStatus.VP_REGISTER_FAIL ||
            salStatus.status === MessageSalStatus.VP_REGISTER_DUPLICATE
          ) {
            addConnectionIssue({
              id: `${Date.now()}-${agentUserId}-sal-${salStatus.status}`,
              source: 'rtm',
              agentUserId,
              code: salStatus.status,
              message: `SAL status: ${salStatus.status}`,
              timestamp: normalizeTimestampMs(salStatus.timestamp),
            })
          }
        })
        ai.on(AgoraVoiceAIEvents.AGENT_ERROR, (agentUserId, error) => {
          addConnectionIssue({
            id: `${Date.now()}-${agentUserId}-agent-error-${error.code}`,
            source: 'agent',
            agentUserId,
            code: error.code,
            message: `${error.type}: ${error.message}`,
            timestamp: normalizeTimestampMs(error.timestamp),
          })
        })
        ai.subscribeMessage(agoraData.channel)
      } catch (error) {
        if (!cancelled) {
          console.error('[AgoraVoiceAI] init failed:', error)
        }
      }
    })()

    return () => {
      cancelled = true
      try {
        const ai = AgoraVoiceAI.getInstance()
        if (ai) {
          ai.unsubscribe()
          ai.destroy()
        }
      } catch {}
    }
  }, [isReady, joinSuccess, client, rtmClient, agoraData.channel, addConnectionIssue, handoffGeneration])

  useEffect(() => {
    const handleRtmMessage = (event: {
      message: string | Uint8Array
      publisher: string
    }) => {
      const payloadText = typeof event.message === 'string' ? event.message : new TextDecoder().decode(event.message)

      let parsed: unknown
      try {
        parsed = JSON.parse(payloadText)
      } catch {
        return
      }

      if (isRtmMessageErrorPayload(parsed)) {
        const p = parsed
        addConnectionIssue({
          id: `${Date.now()}-${event.publisher}-rtm-msg-error-${p.code ?? 'unknown'}`,
          source: 'rtm-signaling',
          agentUserId: event.publisher,
          code: p.code ?? 'unknown',
          message: `${p.module ?? 'unknown'}: ${p.message ?? 'Unknown signaling error'}`,
          timestamp: normalizeTimestampMs(p.send_ts ?? Date.now()),
        })
        return
      }

      if (isRtmSalStatusPayload(parsed)) {
        const p = parsed
        if (p.status === 'VP_REGISTER_FAIL' || p.status === 'VP_REGISTER_DUPLICATE') {
          addConnectionIssue({
            id: `${Date.now()}-${event.publisher}-rtm-sal-${p.status}`,
            source: 'rtm-signaling',
            agentUserId: event.publisher,
            code: p.status,
            message: `SAL status: ${p.status}`,
            timestamp: normalizeTimestampMs(p.timestamp ?? Date.now()),
          })
        }
      }
    }

    rtmClient.addEventListener('message', handleRtmMessage)
    return () => {
      rtmClient.removeEventListener('message', handleRtmMessage)
    }
  }, [rtmClient, addConnectionIssue])

  // Resolved fresh on every read rather than cached by an effect.
  //
  // A handoff makes the agent leave the RTC channel and rejoin under a new
  // session, so its audio track object is replaced. Caching that track in a
  // ref updated by an effect left a window — from the agent republishing to
  // the effect re-running — where the cached track was the torn-down one and
  // getVolumeLevel() returned 0. That window lands exactly on the incoming
  // interviewer's opening line, and because measured volume is what drives
  // the mouth when the pipeline's own speaking state is unavailable (see
  // AvatarSeat), the new interviewer delivered their whole first line with a
  // completely still face. Reading through a ref that always holds the
  // latest remote-user list closes the window: the frame after the track
  // exists, the volume is live.
  const remoteUsersRef = useRef(remoteUsers)
  remoteUsersRef.current = remoteUsers
  const agentUIDRef = useRef(agentUID)
  agentUIDRef.current = agentUID
  const getAgentVolume = useCallback(() => {
    const agentUser = remoteUsersRef.current.find((u) => u.uid.toString() === agentUIDRef.current)
    return agentUser?.audioTrack?.getVolumeLevel() ?? 0
  }, [])

  const transcript = useMemo(() => {
    return normalizeTranscript(rawTranscript, String(client.uid))
  }, [rawTranscript, client.uid])

  // Re-run whenever the transcript changes (the ref itself is mutated
  // synchronously inside the TRANSCRIPT_UPDATED handler above, so by the
  // time `transcript` updates and this memo re-runs, the map already
  // reflects that update).
  const messageList = useMemo(
    () => getMessageList(transcript, messagesSpeakerMapRef.current, PANEL_VOICE_NAMES),
    [transcript],
  )

  const currentInProgressMessage = useMemo(() => {
    return getCurrentInProgressMessage(transcript, messagesSpeakerMapRef.current, PANEL_VOICE_NAMES)
  }, [transcript])

  // Kept in sync so the handoff effect above can read "everything this
  // generation has said so far" at the moment a persona switch is detected,
  // without needing messageList itself in that effect's dependency array
  // (which changes on every transcript update, not just on a handoff).
  useEffect(() => {
    currentMessageListRef.current = messageList
  }, [messageList])

  // What actually renders: every prior generation's messages, followed by
  // this generation's — see the handoff effect above for why the list is
  // split into generations in the first place.
  const fullMessageList = useMemo(() => [...committedMessages, ...messageList], [committedMessages, messageList])

  usePublish([localMicrophoneTrack])

  useClientEvent(client, 'user-joined', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(true)
  })

  useClientEvent(client, 'user-left', (user) => {
    if (user.uid.toString() === agentUID) setIsAgentConnected(false)
  })

  useEffect(() => {
    const isAgentInRemoteUsers = remoteUsers.some((user) => user.uid.toString() === agentUID)
    setIsAgentConnected(isAgentInRemoteUsers)
  }, [remoteUsers, agentUID])

  // A persona handoff restarts the agent's pipeline, which briefly drops it
  // off the RTC channel and rejoins under the same UID a moment later —
  // `isAgentConnected` goes false -> true for that gap. Switching the
  // visualizer on that flag unmounted and remounted the whole PanelStage
  // <Canvas>, which re-initializes WebGL from scratch and showed as a
  // flash of black between handoffs. Once the panel has connected for the
  // first time, keep rendering it through any later reconnect blip instead
  // of tearing it down — the seats just idle silently for the ~1-2s the
  // restart takes, which reads far better than a blackout.
  const [hasEverConnected, setHasEverConnected] = useState(false)
  useEffect(() => {
    if (isAgentConnected) setHasEverConnected(true)
  }, [isAgentConnected])

  useClientEvent(client, 'connection-state-change', (curState) => {
    setConnectionState(curState)
  })

  const connectionSeverity = useMemo<'normal' | 'warning' | 'error'>(() => {
    if (connectionState === 'DISCONNECTED' || connectionState === 'DISCONNECTING') {
      return 'error'
    }
    if (connectionState === 'CONNECTING' || connectionState === 'RECONNECTING') {
      return 'warning'
    }
    if (connectionIssues.length === 0) {
      return 'normal'
    }
    return connectionIssues.some((issue) => getConversationIssueSeverity(issue) === 'error') ? 'error' : 'warning'
  }, [connectionState, connectionIssues])

  const visualizerState = useMemo(
    () => mapAgentVisualizerState(agentState, isAgentConnected, connectionState),
    [agentState, isAgentConnected, connectionState],
  )

  const handleMicToggle = useCallback(async () => {
    const next = !isEnabled
    const track = localMicrophoneTrack
    if (!track) {
      setIsEnabled(next)
      return
    }
    try {
      await track.setEnabled(next)
      setIsEnabled(next)
    } catch (error) {
      console.error('Failed to toggle microphone:', error)
    }
  }, [isEnabled, localMicrophoneTrack])

  const handleTokenWillExpire = useCallback(async () => {
    if (!onTokenWillExpire || !joinedUID) return
    try {
      const { rtcToken, rtmToken } = await onTokenWillExpire(joinedUID.toString())
      await client?.renewToken(rtcToken)
      await rtmClient.renewToken(rtmToken)
    } catch (error) {
      console.error('Failed to renew Agora token:', error)
    }
  }, [client, onTokenWillExpire, joinedUID, rtmClient])

  useClientEvent(client, 'token-privilege-will-expire', handleTokenWillExpire)

  // Guards against the hang-up sequence running twice. Three independent
  // triggers can call this — the "End call" button, the forceEndSignal
  // effect (proctoring), and the auto-end-on-duration effect — and each of
  // those already stops *itself* from firing more than once, but nothing
  // previously stopped two DIFFERENT triggers from both landing in the same
  // moment (e.g. the duration deadline hits the same tick as a manual
  // click). When that happened, everything below ran twice: the mic track
  // was unpublished twice, the session was saved to Mongo twice, and
  // stopAgent was called twice with the same agent id — all three showed up
  // as genuine duplicate entries in the server log. Checked and set before
  // any await, so a second call arriving synchronously (not just a second
  // tick of a poll) is still caught.
  const hasEndedRef = useRef(false)

  const handleEndConversation = useCallback(
    async (reason?: string) => {
      if (hasEndedRef.current) return
      hasEndedRef.current = true

      const track = localMicrophoneTrack
      if (track) {
        try {
          await client?.unpublish(track)
        } catch (error) {
          console.warn('Failed to unpublish microphone track:', error)
        }

        try {
          track.stop()
          track.close()
        } catch (error) {
          console.warn('Failed to release microphone track:', error)
        }
      }

      // Save complete conversation session to MongoDB before ending
      try {
        const endTime = Date.now()
        const duration = Math.floor((endTime - conversationStartTime) / 1000) // in seconds

        // Hiring mode: everything below — reading the messages back, pricing
        // the call, writing the session — happens server-side in
        // /api/candidate/complete, where the interview token is checked. None
        // of it can happen here, because a candidate holds no user token and
        // every /api/chat route would reject them.
        if (onPersistSession) {
          await onPersistSession({
            sessionId,
            channelId: agoraData.channel,
            startedAt: conversationStartTime,
            endedAt: endTime,
            duration,
            reason,
          })
          onEndConversation(sessionId, reason)
          return
        }

        // Fetch all messages for this session
        const messages = await getChatMessages(agoraData.channel, sessionId)

        // Build transcript from messages
        const transcript = messages.map((msg) => `${msg.speakerName}: ${msg.text}`).join('\n')

        // What this interview cost (S1). Read before saving so it lands in
        // the same write. Returns null on any failure — cost measurement must
        // never be the reason an interview fails to save.
        const cost = await getSessionCost(agoraData.channel)

        // Save the complete session with userId
        await saveConversationSession(agoraData.channel, sessionId, {
          userId: user?.id,
          userEmail: user?.email,
          userName: user?.name,
          startedAt: conversationStartTime,
          endedAt: endTime,
          duration,
          messages: messages,
          transcript: transcript,
          status: reason ? 'abandoned' : 'completed',
          ...(cost ? { cost } : {}),
          result: {
            interviewerNotes: reason
              ? `Interview ended early — rejected by proctoring: ${reason}`
              : `Interview conducted on ${new Date(conversationStartTime).toLocaleString()}`,
          },
        })

        console.log(`✅ Conversation session saved: ${sessionId}`)
      } catch (error) {
        console.error('Failed to save conversation session:', error)
      }

      onEndConversation(sessionId, reason)
    },
    [
      client,
      localMicrophoneTrack,
      onEndConversation,
      onPersistSession,
      conversationStartTime,
      agoraData.channel,
      sessionId,
      user,
    ],
  )

  const forceEndHandledRef = useRef(forceEndSignal)
  useEffect(() => {
    if (forceEndSignal === undefined || forceEndSignal === forceEndHandledRef.current) return
    forceEndHandledRef.current = forceEndSignal
    handleEndConversation(forceEndReason)
  }, [forceEndSignal, forceEndReason, handleEndConversation])

  // Auto-end once the candidate's chosen interview length has elapsed,
  // rather than letting the call run indefinitely. Ends the same way the
  // hang-up button does (no reason passed) — this is a normal, completed
  // interview, not an abandoned one, so it should score and save that way.
  const autoEndFiredRef = useRef(false)
  useEffect(() => {
    if (!durationMinutes || durationMinutes <= 0) return

    const deadline = conversationStartTime + durationMinutes * 60_000

    const checkDeadline = () => {
      if (autoEndFiredRef.current) return
      if (Date.now() >= deadline) {
        autoEndFiredRef.current = true
        handleEndConversation()
      }
    }

    checkDeadline()
    const id = setInterval(checkDeadline, 1000)
    return () => clearInterval(id)
  }, [durationMinutes, conversationStartTime, handleEndConversation])

  // Don't render the full conversation until character assets are loaded
  if (!characterAssetLoader.isReady) {
    return <LoadingSkeleton />
  }

  return (
    <QuickstartConversationLayout
      statusPanel={
        <ConnectionStatusPanel
          connectionState={connectionState}
          connectionSeverity={connectionSeverity}
          connectionIssues={connectionIssues}
          isOpen={isConnectionDetailsOpen}
          onToggle={() => setIsConnectionDetailsOpen((open) => !open)}
        />
      }
      callStatus={
        <CallStatusPill
          startedAt={conversationStartTime}
          isLive={connectionState === 'CONNECTED'}
          durationMinutes={durationMinutes}
        />
      }
      transcriptPanel={
        <QuickstartTranscriptPanel
          messageList={fullMessageList}
          currentInProgressMessage={currentInProgressMessage}
          agentUID={agentUID}
          currentAgent={activePanelistId}
        />
      }
      visualizer={
        <section
          className="relative flex h-full min-h-[20rem] w-full flex-1 flex-col items-center justify-center"
          aria-label="AI agent status visualization"
        >
          <PanelIndicator state={panelState} isSpeaking={agentState === 'speaking'} />
          {hasEverConnected ? (
            <PanelStage
              activeId={activePanelistId}
              isSpeaking={agentState === 'speaking'}
              getVolume={getAgentVolume}
              getViseme={getActiveViseme}
              // Fills the column instead of sitting as a fixed short strip
              // in the middle of it — StageCamera's own framing (in
              // PanelAvatarStage) already clamps how far it pulls back on a
              // narrow aspect, and PanelDesk occludes anything below the
              // desk line regardless of zoom, so a taller canvas just shows
              // more of the room rather than revealing legs/feet.
              // flex-1, not h-full: the indicator above shares this column,
              // so a full-height canvas would add to it and overflow rather
              // than split the space with it.
              className="w-full min-h-[16rem] flex-1"
            />
          ) : (
            <AgentVisualizer state={visualizerState} size="lg" />
          )}
          {remoteUsers.map((user) => (
            <div key={user.uid} className="hidden">
              <RemoteUser user={user} />
            </div>
          ))}
        </section>
      }
      controls={
        <fieldset
          className="mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-card/80 px-4 py-2 backdrop-blur-md"
          aria-label="Audio controls"
        >
          <MicToggleButton isEnabled={isEnabled} track={localMicrophoneTrack} onToggle={handleMicToggle} />
          <MicrophoneSelector
            localMicrophoneTrack={localMicrophoneTrack}
            onEndConversation={() => handleEndConversation()}
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={() => handleEndConversation()}
            className="h-10 w-10 rounded-full"
            aria-label="Hang up"
            title="Hang up"
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </fieldset>
      }
      onEndConversation={() => handleEndConversation()}
    />
  )
}
