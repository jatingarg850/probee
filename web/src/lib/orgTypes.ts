/**
 * Organisation types and pure logic — safe to import from a browser bundle.
 *
 * Split from orgs.ts, which imports the MongoDB driver. A client component
 * importing a *value* (not just a type) from a module drags that module's
 * whole dependency graph into the browser bundle, so `ORG_ROLES` living beside
 * a `MongoClient` import is enough to break the build. Types and constants
 * live here; anything that touches the database lives in orgs.ts.
 */

import type { PlanId } from '@/lib/plans'

/** Ordered least to most privileged. Index in this array IS the privilege
 * level, which is what `roleAtLeast` compares — so never reorder it, only
 * append, or every permission check silently changes meaning. */
export const ORG_ROLES = ['viewer', 'hiring_manager', 'recruiter', 'owner'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

export interface OrganizationSummary {
  id: string
  name: string
  slug: string
  /** Lifecycle status — whether the account works at all. */
  plan: OrganizationPlan
  /** Which tier was bought — what the limits are. See lib/plans.ts for why
   * these are two fields and not one. */
  planId: PlanId
  role: OrgRole
  createdAt: Date
}

export type OrganizationPlan = 'trial' | 'active' | 'suspended'

export const DEFAULT_RETENTION_DAYS = 365
const NAME_MIN = 2
const NAME_MAX = 80

/** True when `role` is at least as privileged as `minimum`. */
export function roleAtLeast(role: OrgRole, minimum: OrgRole): boolean {
  return ORG_ROLES.indexOf(role) >= ORG_ROLES.indexOf(minimum)
}

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ORG_ROLES as readonly string[]).includes(value)
}

/**
 * URL-safe slug from an organisation name.
 *
 * Returns an empty string when the name has no slug-able characters at all
 * (e.g. a name written entirely in a non-Latin script, or only punctuation).
 * Callers must handle that rather than persisting an empty slug — see
 * `createOrganization`, which falls back to a generated identifier.
 */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      // NFKD splits "é" into "e" + a combining acute. The combining mark is
      // then not [a-z0-9], so the separator rule below sweeps it up along with
      // the surrounding punctuation — "Café Ltd" lands on "cafe-ltd" without
      // needing an explicit strip of the combining-mark range.
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/g, '')
  )
}

export function validateOrgName(name: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof name !== 'string') return { ok: false, error: 'Organisation name is required.' }
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (trimmed.length < NAME_MIN) return { ok: false, error: 'Organisation name is too short.' }
  if (trimmed.length > NAME_MAX)
    return { ok: false, error: `Organisation name must be ${NAME_MAX} characters or fewer.` }
  return { ok: true, name: trimmed }
}

/** Retention bounds. The floor exists because a candidate needs long enough to
 * request their data (Illinois AIVIA gives them 30 days to ask for deletion,
 * which is meaningless if the record is gone in a week); the ceiling because
 * "keep forever" is not a defensible answer to a data-protection question. */
export const MIN_RETENTION_DAYS = 30
export const MAX_RETENTION_DAYS = 1825

export function validateRetentionDays(value: unknown): { ok: true; days: number } | { ok: false; error: string } {
  const days = Number(value)
  if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) {
    return {
      ok: false,
      error: `Retention must be a whole number of days between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}.`,
    }
  }
  return { ok: true, days }
}

/**
 * Update an organisation's own settings.
 *
 * The slug is deliberately NOT regenerated when the name changes. It is a
 * stable address that may already be in a candidate's invitation link, and
 * silently moving it would break URLs somebody else is holding.
 */
