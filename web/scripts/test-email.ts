#!/usr/bin/env bun

/**
 * Render, preview and optionally send every transactional email.
 *
 * Two modes, because they answer different questions:
 *
 *   bun run scripts/test-email.ts
 *       Renders all templates to .email-preview/ and opens nothing. Answers
 *       "does this look right?" — no Resend account, no network, no risk of
 *       mailing a real person while iterating on a heading.
 *
 *   bun run scripts/test-email.ts you@example.com
 *       Renders, then sends all of them to that one address. Answers "does
 *       delivery actually work?" — which is the only question a preview
 *       cannot answer, because DNS, domain verification and spam filtering
 *       all live outside this codebase.
 *
 *   bun run scripts/test-email.ts you@example.com invite
 *       Sends just one, by name. Useful when you are iterating on delivery of
 *       a single message and do not want five copies each time.
 *
 * The sample data below is deliberately awkward — an organisation name with an
 * apostrophe and an angle bracket in it — so that a regression in HTML
 * escaping shows up in the preview as visible mangling rather than as a
 * working exploit.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { getEmailConfig, sendEmail } from '../src/lib/email'
import {
  type RenderedEmail,
  memberJoinedEmail,
  organizationReceiptEmail,
  removedFromOrgEmail,
  roleChangedEmail,
  teamInvitationEmail,
} from '../src/lib/emailTemplates'

const ORG = `Ada's Analytics <Ltd>`
const OUT_DIR = join(process.cwd(), '.email-preview')
const IN_TWO_WEEKS = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

const TEMPLATES: Record<string, () => RenderedEmail> = {
  invite: () =>
    teamInvitationEmail({
      organizationName: ORG,
      inviterName: 'Priya Raghavan',
      role: 'recruiter',
      acceptUrl: 'http://localhost:3000/invite/Zm9vYmFyLXRlc3QtdG9rZW4tbm90LXJlYWw',
      expiresAt: IN_TWO_WEEKS,
    }),
  'role-changed': () =>
    roleChangedEmail({
      organizationName: ORG,
      actorName: 'Priya Raghavan',
      role: 'hiring_manager',
      organizationUrl: 'http://localhost:3000/orgs/507f1f77bcf86cd799439011/jobs',
    }),
  removed: () =>
    removedFromOrgEmail({
      organizationName: ORG,
      actorName: 'Priya Raghavan',
    }),
  joined: () =>
    memberJoinedEmail({
      organizationName: ORG,
      memberName: 'Sam Okonkwo',
      memberEmail: 'sam@example.com',
      role: 'viewer',
      teamUrl: 'http://localhost:3000/orgs/507f1f77bcf86cd799439011/team',
    }),
  receipt: () =>
    organizationReceiptEmail({
      organizationName: ORG,
      organizationId: '507f1f77bcf86cd799439011',
      userName: 'Priya Raghavan',
      planId: 'growth',
      amountPaise: 1999900,
      currency: 'INR',
      razorpayOrderId: 'order_TestOnly123456',
      razorpayPaymentId: 'pay_TestOnly987654',
      purchaseDate: new Date(),
      testMode: true,
    }),
}

const recipient = process.argv[2]
const only = process.argv[3]

const names = only ? [only] : Object.keys(TEMPLATES)
for (const name of names) {
  if (!TEMPLATES[name]) {
    console.error(`No template called "${name}". Available: ${Object.keys(TEMPLATES).join(', ')}`)
    process.exit(1)
  }
}

mkdirSync(OUT_DIR, { recursive: true })

const rendered = names.map((name) => ({ name, email: TEMPLATES[name]() }))

for (const { name, email } of rendered) {
  writeFileSync(join(OUT_DIR, `${name}.html`), email.html, 'utf8')
  writeFileSync(join(OUT_DIR, `${name}.txt`), email.text, 'utf8')
  console.log(`rendered  ${name.padEnd(13)} ${email.subject}`)
}
console.log(`\nPreviews written to ${OUT_DIR}`)

if (!recipient) {
  console.log('\nPass an email address to also send them:')
  console.log('  bun run scripts/test-email.ts you@example.com')
  process.exit(0)
}

if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(recipient)) {
  console.error(`\n"${recipient}" does not look like an email address.`)
  process.exit(1)
}

if (!getEmailConfig()) {
  console.error('\nRESEND_API_KEY and FROM_EMAIL must both be set in web/.env to send.')
  console.error('The previews above were still written, so you can check the rendering without them.')
  process.exit(1)
}

console.log(`\nSending ${rendered.length} email(s) to ${recipient}…\n`)

let failures = 0
for (const { name, email } of rendered) {
  const result = await sendEmail({
    to: recipient,
    subject: `[test] ${email.subject}`,
    html: email.html,
    text: email.text,
  })
  if (result.ok) {
    console.log(`  sent    ${name.padEnd(13)} ${result.id}`)
  } else {
    failures++
    console.error(`  FAILED  ${name.padEnd(13)} ${result.error}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${rendered.length} failed.`)
  console.error('A 403 from Resend almost always means FROM_EMAIL is not on a domain verified in your Resend account.')
  process.exit(1)
}

console.log(`\nAll ${rendered.length} sent. Check ${recipient}, including the spam folder.`)
