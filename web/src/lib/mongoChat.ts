/**
 * MongoDB Chat Management
 * Persists chat messages by agent and user across agent switches
 */

import { PANEL_VOICE_NAMES } from '@/lib/panelAvatars'
import type { Assessment } from '@/types/conversation'
import type { SessionCost } from '@/types/session'

export interface ChatMessage {
  _id?: string
  channelId: string
  sessionId: string
  speaker: 'user' | 'technical_interviewer' | 'product_manager' | 'hiring_manager'
  speakerName: 'You' | 'Abhinav' | 'Alia' | 'Anisha'
  text: string
  timestamp: number
  turnId?: number
  status?: string
}

export interface ChatSession {
  _id?: string
  channelId: string
  sessionId: string
  startedAt: number
  messages: ChatMessage[]
}

/** Every /api/chat/* route now verifies a bearer token and scopes what it
 * reads or writes to that user — see web/src/lib/apiAuth.ts. Before that,
 * those routes were entirely unauthenticated and took `userId` from the
 * query string, so anyone could pull anyone else's transcripts. These
 * helpers attach the same token the rest of the app already stores. */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('auth_token')
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return headers
}

const SPEAKER_NAMES: Record<string, string> = {
  user: 'You',
  ...PANEL_VOICE_NAMES,
}

/**
 * Save a chat message to MongoDB
 */
export async function saveChatMessage(message: ChatMessage): Promise<void> {
  try {
    const response = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(message),
    })
    if (!response.ok) {
      throw new Error(`Failed to save chat message: ${response.statusText}`)
    }
  } catch (error) {
    console.error('Error saving chat message:', error)
  }
}

/**
 * Get all chat messages for a session
 */
export async function getChatMessages(channelId: string, sessionId: string): Promise<ChatMessage[]> {
  try {
    const response = await fetch(`/api/chat/messages?channelId=${channelId}&sessionId=${sessionId}`, {
      method: 'GET',
      headers: authHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch chat messages: ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error fetching chat messages:', error)
    return []
  }
}

/**
 * Get speaker display name
 */
export function getSpeakerName(speaker: string): string {
  return SPEAKER_NAMES[speaker] || speaker
}

/**
 * Create a chat message object
 */
export function createChatMessage(
  channelId: string,
  sessionId: string,
  speaker: string,
  text: string,
  turnId?: number,
  status?: string,
): ChatMessage {
  return {
    channelId,
    sessionId,
    speaker: speaker as ChatMessage['speaker'],
    speakerName: getSpeakerName(speaker) as ChatMessage['speakerName'],
    text,
    timestamp: Date.now(),
    turnId,
    status,
  }
}

/**
 * Save complete conversation session with transcript and results to MongoDB
 */
export async function saveConversationSession(
  channelId: string,
  sessionId: string,
  options: {
    userId?: string
    userEmail?: string
    userName?: string
    startedAt?: number
    endedAt?: number
    duration?: number
    messages?: ChatMessage[]
    transcript?: string
    result?: {
      scores?: Record<string, number>
      assessment?: string
      feedback?: string
      interviewerNotes?: string
    }
    status?: 'in_progress' | 'completed' | 'abandoned'
    cost?: SessionCost
  } = {},
): Promise<void> {
  try {
    const response = await fetch('/api/chat/sessions', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        channelId,
        sessionId,
        ...options,
      }),
    })
    if (!response.ok) {
      throw new Error(`Failed to save session: ${response.statusText}`)
    }
  } catch (error) {
    console.error('Error saving conversation session:', error)
  }
}

/**
 * Attach the panel's graphical assessment to a session already saved via
 * saveConversationSession, without touching its messages/transcript.
 */
export async function saveSessionAssessment(sessionId: string, assessment: Assessment): Promise<void> {
  try {
    const response = await fetch('/api/chat/sessions/assessment', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sessionId, assessment }),
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Failed to save assessment: ${response.statusText}${errorText ? ` — ${errorText}` : ''}`)
    }
  } catch (error) {
    console.error('Error saving session assessment:', error)
    throw error  // Re-throw so callers know it failed
  }
}

/**
 * Fetch complete conversation session from MongoDB
 */
export async function getConversationSession(sessionId: string) {
  try {
    const response = await fetch(`/api/chat/sessions?sessionId=${sessionId}`, { method: 'GET', headers: authHeaders() })
    if (!response.ok) {
      throw new Error(`Failed to fetch session: ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error fetching conversation session:', error)
    return null
  }
}

/**
 * Fetch all sessions for a channel
 */
export async function getChannelSessions(channelId: string, limit = 50) {
  try {
    const response = await fetch(`/api/chat/sessions?channelId=${channelId}&limit=${limit}`, {
      method: 'GET',
      headers: authHeaders(),
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch sessions: ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error fetching channel sessions:', error)
    return []
  }
}

/**
 * Fetch the signed-in user's own sessions.
 *
 * `userId` is kept in the signature because every caller reads it off the
 * auth context anyway and passing it documents the intent at the call site —
 * but it is deliberately NOT sent to the server. The route derives the owner
 * from the bearer token instead; a user id on the query string is exactly
 * what used to make these transcripts readable by anyone who could type a
 * different value into it.
 */
export async function getUserSessions(_userId: string, limit = 50) {
  try {
    const response = await fetch(`/api/chat/sessions?limit=${limit}`, { method: 'GET', headers: authHeaders() })
    if (!response.ok) {
      throw new Error(`Failed to fetch user sessions: ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error('Error fetching user sessions:', error)
    return []
  }
}
