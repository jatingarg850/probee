import type { SessionMessage } from '@/types/session'

/** Sessions saved before the turnId-upsert fix in
 * app/api/chat/messages/route.ts can hold several documents for the same
 * turn — one per streaming snapshot, each a progressively longer prefix of
 * the last. Collapse those to a single, most-complete entry per turn (by
 * turnId when present, otherwise by identical speaker+timestamp) so older
 * sessions render the same as new ones instead of repeating each line
 * several times. */
export function dedupeMessages(messages: SessionMessage[]): SessionMessage[] {
  const byKey = new Map<string, SessionMessage>()
  const order: string[] = []

  for (const message of messages) {
    const key =
      message.turnId !== undefined && message.turnId !== null
        ? `t:${message.turnId}`
        : `s:${message.speaker}:${message.timestamp}`
    const existing = byKey.get(key)
    if (!existing) {
      order.push(key)
      byKey.set(key, message)
    } else if (message.text.length >= existing.text.length) {
      byKey.set(key, message)
    }
  }

  return order.map((key) => byKey.get(key) as SessionMessage)
}
