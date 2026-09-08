import { describe, expect, it } from 'bun:test'

import { hashToken, inviteUrl, maskEmail, normaliseEmail } from '@/lib/invites'

/**
 * The pure half of the invitation module — everything that does not touch
 * MongoDB, so it runs anywhere.
 *
 * Each of these guards a security property rather than a formatting nicety:
 * address normalisation is what makes the accept-time comparison sound,
 * hashing is what keeps a database dump from being a set of live credentials,
 * and masking is what stops the unauthenticated preview endpoint publishing
 * somebody's address to whoever found the link.
 */

describe('normaliseEmail', () => {
  it('lowercases and trims', () => {
    // This is the load-bearing one. `acceptInvitation` compares the stored
    // address to the signed-in account's address as plain strings — if either
    // side skipped normalisation, "Ada@Example.com" would never match the
    // invitation sent to "ada@example.com", and the invitee would be locked
    // out of an organisation they were entitled to join.
    const result = normaliseEmail('  Ada@Example.COM  ')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.email).toBe('ada@example.com')
  })

  it('accepts addresses that real people have', () => {
    for (const address of [
      'a@b.co',
      'first.last+tag@sub.domain.example',
      "o'brien@example.ie",
      'user_name-99@example.co.uk',
    ]) {
      expect(normaliseEmail(address).ok).toBe(true)
    }
  })

  it('rejects what is obviously not an address', () => {
    for (const value of ['', 'nope', 'a@b', 'a@@b.com', 'a b@example.com', '@example.com', 'a@.com', null, 42, {}]) {
      expect(normaliseEmail(value).ok).toBe(false)
    }
  })

  it('rejects an address long enough to be an attack rather than a typo', () => {
    expect(normaliseEmail(`${'a'.repeat(250)}@example.com`).ok).toBe(false)
  })
})

describe('hashToken', () => {
  it('is deterministic, so a token can be looked up', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
  })

  it('does not contain the token', () => {
    // The whole point: what lands in the database must not be usable as the
    // credential it identifies.
    const token = 'a-very-recognisable-token-value'
    expect(hashToken(token)).not.toContain(token)
    expect(hashToken(token)).toHaveLength(64)
  })

  it('separates tokens that differ by one character', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
  })
})

describe('maskEmail', () => {
  it('keeps two characters and the domain', () => {
    expect(maskEmail('akarshit@example.com')).toBe('ak******@example.com')
  })

  it('never reveals a short local part', () => {
    // A one-character local part masked as "a@example.com" would be the whole
    // address. The floor of three asterisks also hides the true length.
    const masked = maskEmail('a@example.com')
    expect(masked).toBe('a***@example.com')
    expect(masked.length).toBeGreaterThan('a@example.com'.length - 1)
  })

  it('does not crash on something that is not an address', () => {
    expect(maskEmail('not-an-address')).toBe('***')
  })
})

describe('inviteUrl', () => {
  it('builds one slash regardless of how the origin was configured', () => {
    expect(inviteUrl('https://probe.example', 'tok')).toBe('https://probe.example/invite/tok')
    expect(inviteUrl('https://probe.example/', 'tok')).toBe('https://probe.example/invite/tok')
    expect(inviteUrl('https://probe.example///', 'tok')).toBe('https://probe.example/invite/tok')
  })

  it('escapes a token so it survives the URL', () => {
    // base64url should never produce these, but the encoding is what makes
    // that a property of the URL builder rather than an assumption about the
    // token generator.
    expect(inviteUrl('https://probe.example', 'a/b+c')).toBe('https://probe.example/invite/a%2Fb%2Bc')
  })
})
