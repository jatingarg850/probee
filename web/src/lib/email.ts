import { Resend } from 'resend'

/**
 * Transactional email, via Resend.
 *
 * ============================================================
 * EMAIL NEVER FAILS A REQUEST
 * ============================================================
 * Every call here returns a result object rather than throwing, and every
 * caller is expected to ignore a failure. The reason is that email is always
 * the *last* step of an operation that has already happened — an organisation
 * has been created, a payment has been taken, a colleague has been given a
 * role. Rolling any of that back because a mail provider had a bad minute
 * would be strictly worse than the person not getting a receipt, and retrying
 * the operation would double-charge them.
 *
 * So: send, log what happened, carry on. Where the email carries something the
 * user cannot get any other way — an invitation link — the UI shows them the
 * link directly as well, so a lost email is an inconvenience rather than a
 * dead end.
 *
 * ============================================================
 * UNCONFIGURED IS A VALID STATE
 * ============================================================
 * `getEmailConfig` returns null when the keys are absent instead of throwing,
 * so the whole product runs locally without a Resend account. Anything that
 * depends on delivery must degrade rather than break.
 */

const API_KEY_ENV = 'RESEND_API_KEY'
const FROM_ENV = 'FROM_EMAIL'
const APP_URL_ENV = 'NEXT_PUBLIC_APP_URL'

export interface EmailConfig {
  apiKey: string
  /** Must be on a domain verified in Resend, or delivery is rejected. */
  from: string
}

export function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env[API_KEY_ENV]
  const from = process.env[FROM_ENV]
  // Both are required. A key without a verified sender produces a 403 from
  // Resend on every send, which is a worse failure than being switched off,
  // because it looks configured.
  if (!apiKey || !from) return null
  return { apiKey, from }
}

export function isEmailConfigured(): boolean {
  return getEmailConfig() !== null
}

/**
 * The public origin, used to build links that must work in someone's inbox.
 *
 * Falls back to localhost so a development send is still clickable by the
 * developer who triggered it. A production deployment that forgets to set this
 * sends links nobody outside the machine can open, so it is logged loudly.
 */
export function appUrl(): string {
  const configured = process.env[APP_URL_ENV]?.replace(/\/+$/, '')
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') {
    console.warn(`${APP_URL_ENV} is not set — email links will point at localhost.`)
  }
  return 'http://localhost:3000'
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string }

/**
 * Send one email.
 *
 * `text` is required, not optional. A plain-text alternative is what keeps a
 * message out of spam filters that penalise HTML-only mail, and it is the only
 * version a screen reader in a text-mode client will read. Making it a
 * required argument means it cannot be quietly skipped.
 */
export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}): Promise<SendResult> {
  const config = getEmailConfig()
  if (!config) {
    console.warn(`Email not sent to ${redact(params.to)}: Resend is not configured.`)
    return { ok: false, error: 'Email is not configured on this deployment.' }
  }

  try {
    const resend = new Resend(config.apiKey)
    const result = await resend.emails.send({
      from: config.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
    })

    if (result.error) {
      console.error(`Resend rejected mail to ${redact(params.to)}:`, result.error.message)
      return { ok: false, error: result.error.message }
    }
    return { ok: true, id: result.data?.id ?? 'unknown' }
  } catch (error) {
    console.error(`Failed to send mail to ${redact(params.to)}:`, error)
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Send without letting a failure escape.
 *
 * The shape most callers want: they are in a route that has already succeeded
 * and must return 200 regardless. Using this instead of a bare `sendEmail`
 * makes "a failure here is not an error" explicit at the call site.
 */
export async function sendEmailQuietly(params: Parameters<typeof sendEmail>[0]): Promise<SendResult> {
  try {
    return await sendEmail(params)
  } catch (error) {
    console.error('Unexpected email failure:', error)
    return { ok: false, error: 'Unexpected email failure' }
  }
}

/** `a***@example.com` — enough to correlate a log line with a user, without
 * writing a full address into logs that may be shipped off the box. */
function redact(address: string): string {
  const [local, domain] = address.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 1)}***@${domain}`
}

export function formatEmailDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}
