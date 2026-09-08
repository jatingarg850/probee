import { appUrl, formatEmailDate } from '@/lib/email'
import type { OrgRole } from '@/lib/orgTypes'
import { formatPrice, getPlan } from '@/lib/plans'

/**
 * Transactional email templates.
 *
 * ============================================================
 * WHY THIS LOOKS LIKE 2005 HTML
 * ============================================================
 * Nested `<table>` elements, inline styles, no flexbox, no grid, no
 * stylesheet. Not nostalgia — Outlook renders mail through Word's HTML engine,
 * Gmail strips `<style>` blocks in some clients, and neither supports the
 * layout primitives the rest of this codebase is built on. A table with inline
 * styles is the only thing that renders the same in all of them.
 *
 * The palette is PROBE's own, hard-coded as hex. Emails cannot read the app's
 * CSS custom properties, and `prefers-color-scheme` support across mail
 * clients is inconsistent enough that a dark variant is more likely to produce
 * unreadable text than to help — so these are deliberately single-theme, with
 * explicit backgrounds on every surface so a client that forces dark mode
 * still has something legible to work with.
 *
 * ============================================================
 * EVERY INTERPOLATION IS ESCAPED
 * ============================================================
 * Organisation names, person names and job titles are user-supplied and end up
 * in someone else's inbox. `escapeHtml` is applied at every `${}` in an HTML
 * template — an unescaped organisation name is a stored XSS that delivers
 * itself to the victim by email. The one exception is content this file
 * generates itself, which is marked where it occurs.
 */

/* ------------------------------------------------------------------ *
 * Palette — PROBE's warm neutral ground with a terracotta accent.
 * ------------------------------------------------------------------ */

const C = {
  page: '#F2EFE7',
  card: '#FFFDF8',
  ink: '#151513',
  body: '#3B3A36',
  muted: '#6B6960',
  border: '#E3DFD5',
  accent: '#C2603C',
  accentSoft: '#FBF0EA',
  rule: '#EDE8DD',
} as const

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

/**
 * The outer frame every email shares: wordmark, content, footer.
 *
 * `body` is trusted HTML built by the functions below, which have already
 * escaped anything user-supplied. `preheader` is the grey line a client shows
 * next to the subject in the inbox list — left unset it shows whatever the
 * first characters of the body happen to be, which is usually the wordmark.
 */
function shell(options: { title: string; preheader: string; body: string; footerNote?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0; padding:0; background-color:${C.page}; font-family:${FONT}; -webkit-font-smoothing:antialiased;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(options.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page};">
  <tr>
    <td align="center" style="padding:32px 16px 48px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

        <tr>
          <td style="padding:0 4px 18px;">
            <span style="font-family:${SERIF}; font-size:19px; letter-spacing:0.14em; color:${C.ink}; font-weight:600;">PROBE</span>
          </td>
        </tr>

        <tr>
          <td style="background-color:${C.card}; border:1px solid ${C.border}; border-radius:14px; padding:36px 36px 32px;">
${options.body}
          </td>
        </tr>

        <tr>
          <td style="padding:22px 6px 0;">
            <p style="margin:0; font-size:12px; line-height:19px; color:${C.muted};">
              ${options.footerNote ? `${escapeHtml(options.footerNote)}<br><br>` : ''}You received this because of activity on your PROBE account. This mailbox is not monitored — replies do not reach anyone.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/** A heading and a lead paragraph — the opening of every message. */
function heading(title: string, lead: string): string {
  return `            <h1 style="margin:0 0 14px; font-family:${SERIF}; font-size:26px; line-height:33px; font-weight:600; color:${C.ink}; letter-spacing:-0.01em;">${title}</h1>
            <p style="margin:0 0 22px; font-size:15px; line-height:25px; color:${C.body};">${lead}</p>`
}

/** The single call to action. One per email — a message with two equally
 * weighted buttons has not decided what it is asking for. */
function button(href: string, label: string): string {
  return `            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;">
              <tr>
                <td style="background-color:${C.accent}; border-radius:9px;">
                  <a href="${escapeAttr(href)}" style="display:inline-block; padding:13px 26px; font-size:15px; font-weight:600; color:#FFFFFF; text-decoration:none;">${escapeHtml(label)}</a>
                </td>
              </tr>
            </table>`
}

/** Label/value rows, for receipts and summaries. */
function detailTable(rows: Array<[string, string]>, emphasiseLast = false): string {
  const cells = rows
    .map(([label, value], index) => {
      const last = emphasiseLast && index === rows.length - 1
      const top = last ? `border-top:1px solid ${C.border}; padding-top:14px;` : ''
      return `                <tr>
                  <td style="padding:7px 0; font-size:13.5px; color:${C.muted}; ${top}">${escapeHtml(label)}</td>
                  <td align="right" style="padding:7px 0; font-size:${last ? '17px' : '13.5px'}; font-weight:${last ? '700' : '500'}; color:${C.ink}; ${top}">${escapeHtml(value)}</td>
                </tr>`
    })
    .join('\n')

  return `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page}; border-radius:10px; padding:0; margin:0 0 24px;">
              <tr><td style="padding:18px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${cells}
                </table>
              </td></tr>
            </table>`
}

/** Small print under the fold — expiry warnings, fallback links. */
function note(html: string): string {
  return `            <p style="margin:0 0 8px; font-size:13px; line-height:21px; color:${C.muted};">${html}</p>`
}

/** A raw URL, shown because "the button did not work" is a real thing that
 * happens in corporate mail clients that rewrite links. */
function fallbackLink(url: string): string {
  return `            <p style="margin:20px 0 0; padding-top:18px; border-top:1px solid ${C.rule}; font-size:12.5px; line-height:20px; color:${C.muted};">
              If the button does not work, paste this into your browser:<br>
              <span style="color:${C.accent}; word-break:break-all;">${escapeHtml(url)}</span>
            </p>`
}

/* ------------------------------------------------------------------ *
 * Roles, in words a person understands
 * ------------------------------------------------------------------ */

/** Kept beside the templates rather than imported from the team page, because
 * an email has to stand alone: the recipient may not have an account yet and
 * cannot go and read the permissions table. */
export const ROLE_SUMMARY: Record<OrgRole, string> = {
  owner: 'Full access, including billing, retention settings and managing who else is on the team.',
  recruiter: 'Create and edit roles, invite candidates, and record hiring decisions.',
  hiring_manager: 'Review candidates and record decisions. Cannot change what the panel scores against.',
  viewer: 'Read-only. Can see roles and candidates, but change nothing.',
}

export function formatRole(role: OrgRole): string {
  return role.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/* ------------------------------------------------------------------ *
 * 1. Team invitation
 * ------------------------------------------------------------------ */

export function teamInvitationEmail(data: {
  organizationName: string
  inviterName: string
  role: OrgRole
  acceptUrl: string
  expiresAt: Date
}): RenderedEmail {
  const org = escapeHtml(data.organizationName)
  const inviter = escapeHtml(data.inviterName)
  const roleLabel = formatRole(data.role)
  const expires = formatEmailDate(data.expiresAt)

  const body = `${heading(
    `${inviter} added you to ${org}`,
    `You have been given the <strong style="color:${C.ink};">${escapeHtml(roleLabel)}</strong> role on PROBE — the interview platform ${org} uses to run structured, scored candidate interviews.`,
  )}
${detailTable([
  ['Organisation', data.organizationName],
  ['Your role', roleLabel],
  ['Invited by', data.inviterName],
])}
            <p style="margin:0 0 18px; font-size:14.5px; line-height:24px; color:${C.body};"><strong style="color:${C.ink};">What ${escapeHtml(roleLabel)} means:</strong> ${escapeHtml(ROLE_SUMMARY[data.role])}</p>
${button(data.acceptUrl, 'Accept the invitation')}
${note(`This link expires on <strong style="color:${C.ink};">${escapeHtml(expires)}</strong>, and works only for the address it was sent to. If you do not have a PROBE account yet, you will be asked to create one first.`)}
${fallbackLink(data.acceptUrl)}`

  const text = `${data.inviterName} added you to ${data.organizationName}

You have been given the ${roleLabel} role on PROBE, the interview platform ${data.organizationName} uses to run structured, scored candidate interviews.

Organisation: ${data.organizationName}
Your role:    ${roleLabel}
Invited by:   ${data.inviterName}

What ${roleLabel} means: ${ROLE_SUMMARY[data.role]}

Accept the invitation:
${data.acceptUrl}

This link expires on ${expires}, and works only for the address it was sent to. If you do not have a PROBE account yet, you will be asked to create one first.

If you were not expecting this, you can ignore this email — nothing happens until you open the link.`

  return {
    subject: `${data.inviterName} invited you to ${data.organizationName} on PROBE`,
    html: shell({
      title: 'You have been invited',
      preheader: `Join ${data.organizationName} as ${roleLabel}.`,
      body,
      footerNote: 'If you were not expecting this, ignore this email. Nothing happens until you open the link.',
    }),
    text,
  }
}

/* ------------------------------------------------------------------ *
 * 2. Role changed
 * ------------------------------------------------------------------ */

export function roleChangedEmail(data: {
  organizationName: string
  actorName: string
  role: OrgRole
  organizationUrl: string
}): RenderedEmail {
  const roleLabel = formatRole(data.role)

  const body = `${heading(
    `Your access to ${escapeHtml(data.organizationName)} changed`,
    `${escapeHtml(data.actorName)} set your role to <strong style="color:${C.ink};">${escapeHtml(roleLabel)}</strong>. This takes effect immediately.`,
  )}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.accentSoft}; border-radius:10px; margin:0 0 24px;">
              <tr><td style="padding:16px 20px;">
                <p style="margin:0 0 5px; font-size:12px; font-weight:600; letter-spacing:0.09em; text-transform:uppercase; color:${C.accent};">${escapeHtml(roleLabel)}</p>
                <p style="margin:0; font-size:14px; line-height:22px; color:${C.body};">${escapeHtml(ROLE_SUMMARY[data.role])}</p>
              </td></tr>
            </table>
${button(data.organizationUrl, `Open ${data.organizationName}`)}
${note('If this looks wrong, speak to an owner of the organisation — they can change it back.')}`

  const text = `Your access to ${data.organizationName} changed

${data.actorName} set your role to ${roleLabel}. This takes effect immediately.

${roleLabel}: ${ROLE_SUMMARY[data.role]}

Open ${data.organizationName}:
${data.organizationUrl}

If this looks wrong, speak to an owner of the organisation — they can change it back.`

  return {
    subject: `You are now ${roleLabel} at ${data.organizationName}`,
    html: shell({
      title: 'Your role changed',
      preheader: `${data.actorName} set your role to ${roleLabel}.`,
      body,
    }),
    text,
  }
}

/* ------------------------------------------------------------------ *
 * 3. Removed from an organisation
 * ------------------------------------------------------------------ */

export function removedFromOrgEmail(data: { organizationName: string; actorName: string }): RenderedEmail {
  const body = `${heading(
    `You no longer have access to ${escapeHtml(data.organizationName)}`,
    `${escapeHtml(data.actorName)} removed your access. You can no longer see that organisation's roles, candidates or interviews.`,
  )}
${note(`Your own PROBE account is unaffected, and your practice interviews stay private to you as they always were. If you think this is a mistake, contact an owner at ${escapeHtml(data.organizationName)}.`)}`

  const text = `You no longer have access to ${data.organizationName}

${data.actorName} removed your access. You can no longer see that organisation's roles, candidates or interviews.

Your own PROBE account is unaffected, and your practice interviews stay private to you as they always were.

If you think this is a mistake, contact an owner at ${data.organizationName}.`

  return {
    subject: `Your access to ${data.organizationName} was removed`,
    html: shell({
      title: 'Access removed',
      preheader: `${data.actorName} removed your access to ${data.organizationName}.`,
      body,
    }),
    text,
  }
}

/* ------------------------------------------------------------------ *
 * 4. Somebody accepted — sent to whoever invited them
 * ------------------------------------------------------------------ */

export function memberJoinedEmail(data: {
  organizationName: string
  memberName: string
  memberEmail: string
  role: OrgRole
  teamUrl: string
}): RenderedEmail {
  const roleLabel = formatRole(data.role)

  const body = `${heading(
    `${escapeHtml(data.memberName)} joined ${escapeHtml(data.organizationName)}`,
    'The invitation you sent has been accepted. They have access now.',
  )}
${detailTable([
  ['Name', data.memberName],
  ['Email', data.memberEmail],
  ['Role', roleLabel],
])}
${button(data.teamUrl, 'View the team')}`

  const text = `${data.memberName} joined ${data.organizationName}

The invitation you sent has been accepted. They have access now.

Name:  ${data.memberName}
Email: ${data.memberEmail}
Role:  ${roleLabel}

View the team:
${data.teamUrl}`

  return {
    subject: `${data.memberName} joined ${data.organizationName}`,
    html: shell({
      title: 'Invitation accepted',
      preheader: `${data.memberName} accepted as ${roleLabel}.`,
      body,
    }),
    text,
  }
}

/* ------------------------------------------------------------------ *
 * 5. Purchase receipt
 * ------------------------------------------------------------------ */

export function organizationReceiptEmail(data: {
  organizationName: string
  organizationId: string
  userName: string
  planId: string
  amountPaise: number
  currency: string
  razorpayOrderId: string
  razorpayPaymentId: string
  purchaseDate: Date
  testMode: boolean
}): RenderedEmail {
  const plan = getPlan(data.planId)
  const planName = plan?.name ?? 'Organisation'
  const orgUrl = `${appUrl()}/orgs/${data.organizationId}/jobs`
  const teamUrl = `${appUrl()}/orgs/${data.organizationId}/team`

  const included = plan?.includedInterviews === null ? 'Negotiated' : `${plan?.includedInterviews ?? '—'} interviews`
  const seats = plan?.seats === null ? 'Unlimited' : `${plan?.seats ?? '—'}`

  const testBanner = data.testMode
    ? `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FDF4E3; border:1px solid #E8D5AE; border-radius:9px; margin:0 0 22px;">
              <tr><td style="padding:12px 16px; font-size:13px; line-height:20px; color:#6B4E12;">
                <strong>Test payment.</strong> This was made with Razorpay test keys. No money moved and this is not a valid tax receipt.
              </td></tr>
            </table>`
    : ''

  const body = `${heading(
    `${escapeHtml(data.organizationName)} is ready`,
    `Thanks, ${escapeHtml(data.userName)}. Your organisation is set up on the <strong style="color:${C.ink};">${escapeHtml(planName)}</strong> plan and you are its owner.`,
  )}
${testBanner}
${detailTable(
  [
    ['Organisation', data.organizationName],
    ['Plan', planName],
    ['Included', included],
    ['Team seats', seats],
    ['Date', formatEmailDate(data.purchaseDate)],
    ['Payment ID', data.razorpayPaymentId],
    ['Order ID', data.razorpayOrderId],
    ['Total paid', formatPrice(data.amountPaise, data.currency)],
  ],
  true,
)}
            <p style="margin:0 0 6px; font-size:14.5px; line-height:24px; color:${C.ink}; font-weight:600;">Two things worth doing first</p>
            <p style="margin:0 0 6px; font-size:14.5px; line-height:24px; color:${C.body}">1. Create a role and set what the panel should score against — the weights are yours to decide, and they are what every candidate is measured on.</p>
            <p style="margin:0 0 22px; font-size:14.5px; line-height:24px; color:${C.body};">2. <a href="${escapeAttr(teamUrl)}" style="color:${C.accent};">Invite your colleagues</a> and give them a role.</p>
${button(orgUrl, 'Open your organisation')}
${note('Keep this email — it is your receipt.')}`

  const text = `${data.organizationName} is ready

Thanks, ${data.userName}. Your organisation is set up on the ${planName} plan and you are its owner.
${data.testMode ? '\nTEST PAYMENT: made with Razorpay test keys. No money moved and this is not a valid tax receipt.\n' : ''}
RECEIPT
Organisation: ${data.organizationName}
Plan:         ${planName}
Included:     ${included}
Team seats:   ${seats}
Date:         ${formatEmailDate(data.purchaseDate)}
Payment ID:   ${data.razorpayPaymentId}
Order ID:     ${data.razorpayOrderId}
Total paid:   ${formatPrice(data.amountPaise, data.currency)}

TWO THINGS WORTH DOING FIRST
1. Create a role and set what the panel should score against — the weights are
   yours to decide, and they are what every candidate is measured on.
2. Invite your colleagues and give them a role: ${teamUrl}

Open your organisation:
${orgUrl}

Keep this email — it is your receipt.`

  return {
    subject: `${data.organizationName} is ready — your PROBE receipt`,
    html: shell({
      title: 'Your organisation is ready',
      preheader: `${planName} plan, ${formatPrice(data.amountPaise, data.currency)}. Receipt inside.`,
      body,
    }),
    text,
  }
}

/* ------------------------------------------------------------------ *
 * Escaping
 * ------------------------------------------------------------------ */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Attribute context, for `href`. Same escapes, plus a guard on the scheme:
 * `javascript:` in an href is inert in most mail clients but not in a webmail
 * preview pane, and every URL these templates emit is one we constructed. */
function escapeAttr(value: string): string {
  const safe = /^https?:\/\//i.test(value) ? value : '#'
  return escapeHtml(safe)
}

/* ------------------------------------------------------------------ *
 * 6. Candidate interview invitation (M1-6)
 * ------------------------------------------------------------------ */

/**
 * The one email in this file that goes to somebody who has never heard of us.
 *
 * Everything else here is sent to a person with a PROBE account who is
 * expecting it. This lands in a job applicant's inbox, and it has to survive
 * being read with suspicion: an unsolicited message saying "sit an AI
 * interview" reads like a scam unless it says immediately who it is from, who
 * asked for it, and what happens to the recording.
 *
 * So the disclosure is in the email, not only behind the link. Illinois AIVIA
 * requires notice before the interview; putting it here means the notice
 * arrives even if the candidate never clicks. The full consent gate still runs
 * on the page — this is notice, not consent.
 */
export function candidateInterviewEmail(data: {
  organizationName: string
  jobTitle: string
  candidateName: string
  durationMinutes: number
  interviewUrl: string
  expiresAt: Date
  retentionDays: number
}): RenderedEmail {
  const org = escapeHtml(data.organizationName)
  const role = escapeHtml(data.jobTitle)
  const greeting = data.candidateName ? `Hi ${escapeHtml(data.candidateName.split(' ')[0])},` : 'Hi,'

  const body = `${heading(
    `${org} would like to interview you`,
    `${greeting} you have been invited to a first-round interview for <strong style="color:${C.ink};">${role}</strong>. It takes about ${data.durationMinutes} minutes and you can do it whenever suits you — there is nothing to schedule and no account to create.`,
  )}
${detailTable([
  ['Role', data.jobTitle],
  ['Company', data.organizationName],
  ['Length', `About ${data.durationMinutes} minutes`],
  ['When', 'Whenever you are ready, before the link expires'],
])}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.accentSoft}; border-radius:10px; margin:0 0 24px;">
              <tr><td style="padding:16px 20px;">
                <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.09em; text-transform:uppercase; color:${C.accent};">Before you start</p>
                <p style="margin:0 0 10px; font-size:14px; line-height:22px; color:${C.body};">This interview is conducted by AI. A panel of three AI interviewers asks the questions and scores your answers against criteria ${org} set for this role.</p>
                <p style="margin:0 0 10px; font-size:14px; line-height:22px; color:${C.body};">Your camera and microphone are used during the interview, and the conversation is recorded and transcribed so ${org} can review it. ${org} keeps that for ${escapeHtml(String(data.retentionDays))} days.</p>
                <p style="margin:0; font-size:14px; line-height:22px; color:${C.body};">You will see the full details and be asked to agree before anything starts. If you would rather not be interviewed this way, you can decline — reply to ${org} directly and ask for an alternative.</p>
              </td></tr>
            </table>
${button(data.interviewUrl, 'Read the details and start')}
${note(`This link is yours alone and expires on <strong style="color:${C.ink};">${escapeHtml(formatEmailDate(data.expiresAt))}</strong>. Use a laptop or desktop with a working camera, somewhere quiet.`)}
${fallbackLink(data.interviewUrl)}`

  const text = `${data.organizationName} would like to interview you

${data.candidateName ? `Hi ${data.candidateName.split(' ')[0]},` : 'Hi,'} you have been invited to a first-round interview for ${data.jobTitle}. It takes about ${data.durationMinutes} minutes and you can do it whenever suits you — there is nothing to schedule and no account to create.

Role:    ${data.jobTitle}
Company: ${data.organizationName}
Length:  About ${data.durationMinutes} minutes
When:    Whenever you are ready, before the link expires

BEFORE YOU START
This interview is conducted by AI. A panel of three AI interviewers asks the
questions and scores your answers against criteria ${data.organizationName} set
for this role.

Your camera and microphone are used during the interview, and the conversation
is recorded and transcribed so ${data.organizationName} can review it.
${data.organizationName} keeps that for ${data.retentionDays} days.

You will see the full details and be asked to agree before anything starts. If
you would rather not be interviewed this way, you can decline — reply to
${data.organizationName} directly and ask for an alternative.

Read the details and start:
${data.interviewUrl}

This link is yours alone and expires on ${formatEmailDate(data.expiresAt)}. Use a
laptop or desktop with a working camera, somewhere quiet.`

  return {
    subject: `Interview invitation: ${data.jobTitle} at ${data.organizationName}`,
    html: shell({
      title: 'Interview invitation',
      preheader: `${data.durationMinutes} minutes, whenever suits you. AI-conducted — details inside.`,
      body,
      footerNote: `Sent on behalf of ${data.organizationName}, who invited you. PROBE is the interview platform they use.`,
    }),
    text,
  }
}
