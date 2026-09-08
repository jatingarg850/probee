import { type Collection, type Db, type Document, type MongoClient, ObjectId } from 'mongodb'

import { connectToDatabase } from '@/lib/mongoDb'
import {
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  type OrgRole,
  type OrganizationPlan,
  type OrganizationSummary,
  isOrgRole,
  slugify,
  validateOrgName,
  validateRetentionDays,
} from '@/lib/orgTypes'
import { DEFAULT_PLAN_ID, type PlanId, isPlanId } from '@/lib/plans'

// Re-exported so server code can keep importing everything from one place,
// while client components import the pure half directly from orgTypes.
export {
  ORG_ROLES,
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  validateRetentionDays,
  roleAtLeast,
  isOrgRole,
  slugify,
  validateOrgName,
} from '@/lib/orgTypes'
export type { OrgRole, OrganizationPlan, OrganizationSummary } from '@/lib/orgTypes'

/**
 * Organisations and memberships — the tenancy model for the recruiter product.
 *
 * Two deliberate shapes, both load-bearing:
 *
 * 1. **A user belongs to many organisations.** There is no `organizationId` on
 *    the user document. The same person can be a recruiter at one company, a
 *    hiring manager at another, and a candidate practising on their own time.
 *    Membership is its own collection, and it is the only thing that grants
 *    access to org data.
 *
 * 2. **The consumer product stays outside organisations entirely.** Practice
 *    interviews carry no `organizationId` and are unaffected by anything here.
 *    That is why nothing in this file migrates or rewrites existing data — the
 *    live product cannot regress from a change it never sees.
 */

export interface Organization {
  _id: ObjectId
  name: string
  slug: string
  /** Lifecycle status. */
  plan: OrganizationPlan
  /** Purchased tier. Organisations created before plans existed carry no such
   * field, so every read defaults it rather than assuming it is present. */
  planId: PlanId
  /** How long candidate interview data is kept. Enforced by M3-3, stored now
   * so orgs created before that lands already carry a value. */
  retentionDays: number
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}

export interface Membership {
  _id: ObjectId
  organizationId: ObjectId
  userId: ObjectId
  role: OrgRole
  invitedBy: ObjectId | null
  createdAt: Date
}

/* ------------------------------------------------------------------ *
 * Indexes
 * ------------------------------------------------------------------ */

let indexesReady: Promise<void> | null = null

/**
 * Create the indexes this module depends on, once per process.
 *
 * These are not decoration. `memberships (organizationId, userId)` being
 * unique is the only thing that stops two concurrent requests creating two
 * memberships for the same person, and `organizations (slug)` being unique is
 * what makes the slug-collision retry in `createOrganization` terminate
 * instead of silently producing duplicates.
 *
 * Done here rather than in a migration script so correctness never depends on
 * someone remembering to run one. `createIndex` is idempotent, and the promise
 * is cached so it costs one round trip per process, not one per request.
 */
export async function ensureOrgIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = Promise.all([
      db.collection('organizations').createIndex({ slug: 1 }, { unique: true, name: 'org_slug_unique' }),
      db
        .collection('memberships')
        .createIndex({ organizationId: 1, userId: 1 }, { unique: true, name: 'membership_org_user_unique' }),
      // Listing "my organisations" is the hot read on every recruiter page load.
      db
        .collection('memberships')
        .createIndex({ userId: 1 }, { name: 'membership_user' }),
    ])
      .then(() => undefined)
      .catch((error) => {
        // Never cache a failure — a transient connection error at boot would
        // otherwise permanently convince the process that indexes exist.
        indexesReady = null
        throw error
      })
  }
  return indexesReady
}

/** Test seam: forget that indexes were created, so a fresh database in a test
 * run gets them again. Not used in application code. */
export function resetOrgIndexCacheForTests(): void {
  indexesReady = null
}

async function collections(): Promise<{
  db: Db
  orgs: Collection<Document>
  memberships: Collection<Document>
}> {
  const { db } = await connectToDatabase()
  await ensureOrgIndexes(db)
  return { db, orgs: db.collection('organizations'), memberships: db.collection('memberships') }
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/**
 * The caller's role in an organisation, or null if they are not a member.
 *
 * This is the single primitive every org-scoped route builds on. It reads the
 * role from the database on every call rather than trusting a token claim:
 * tokens here live seven days, so a revoked membership or a demotion baked
 * into a JWT would keep working until expiry.
 */
export async function getMembershipRole(organizationId: string, userId: string): Promise<OrgRole | null> {
  if (!ObjectId.isValid(organizationId) || !ObjectId.isValid(userId)) return null
  const { memberships } = await collections()
  const doc = await memberships.findOne(
    { organizationId: new ObjectId(organizationId), userId: new ObjectId(userId) },
    { projection: { role: 1 } },
  )
  return doc && isOrgRole(doc.role) ? doc.role : null
}

/** Every organisation the user belongs to, with their role in each. */
export async function listOrganizationsForUser(userId: string): Promise<OrganizationSummary[]> {
  if (!ObjectId.isValid(userId)) return []
  const { orgs, memberships } = await collections()

  const mine = await memberships.find({ userId: new ObjectId(userId) }).toArray()
  if (mine.length === 0) return []

  const byId = new Map(mine.map((m) => [String(m.organizationId), m.role as OrgRole]))
  const docs = await orgs.find({ _id: { $in: mine.map((m) => m.organizationId as ObjectId) } }).toArray()

  return docs
    .map((doc) => ({
      id: String(doc._id),
      name: doc.name as string,
      slug: doc.slug as string,
      plan: doc.plan as OrganizationPlan,
      planId: isPlanId(doc.planId) ? doc.planId : DEFAULT_PLAN_ID,
      role: byId.get(String(doc._id)) as OrgRole,
      createdAt: doc.createdAt as Date,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export type CreateOrgResult =
  | { ok: true; organization: OrganizationSummary }
  | { ok: false; error: string; status: number }

const SLUG_ATTEMPTS = 5

/**
 * Create an organisation and make the creator its owner.
 *
 * **Ordering matters.** The organisation is inserted first, then the
 * membership. If the membership insert fails, the organisation is deleted
 * again — an org nobody can reach is worse than no org, because the slug is
 * taken and the user cannot retry with the same name. MongoDB has no
 * cross-document transaction on a standalone server, so this compensating
 * delete is the portable equivalent; on a replica set it could become a real
 * transaction without changing any caller.
 */
export async function createOrganization(
  name: unknown,
  creatorUserId: string,
  /** Set by the billing route from the plan that was actually paid for. The
   * default exists for tests and any future path that creates an organisation
   * without a purchase; it is never read from a request body. */
  purchase: { planId?: PlanId; status?: OrganizationPlan } = {},
): Promise<CreateOrgResult> {
  const validated = validateOrgName(name)
  if (!validated.ok) return { ok: false, error: validated.error, status: 400 }
  if (!ObjectId.isValid(creatorUserId)) return { ok: false, error: 'Invalid user.', status: 401 }

  const { orgs, memberships } = await collections()
  const creator = new ObjectId(creatorUserId)
  const base = slugify(validated.name) || `org-${Date.now().toString(36)}`

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    // First attempt uses the clean slug; collisions get a short random suffix
    // rather than an incrementing counter, which would leak how many
    // organisations share a name.
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date()
    const org = {
      name: validated.name,
      slug,
      plan: purchase.status ?? ('trial' as OrganizationPlan),
      planId: purchase.planId ?? DEFAULT_PLAN_ID,
      retentionDays: DEFAULT_RETENTION_DAYS,
      createdBy: creator,
      createdAt: now,
      updatedAt: now,
    }

    let organizationId: ObjectId
    try {
      const inserted = await orgs.insertOne(org)
      organizationId = inserted.insertedId
    } catch (error) {
      if (isDuplicateKeyError(error)) continue
      throw error
    }

    try {
      await memberships.insertOne({
        organizationId,
        userId: creator,
        role: 'owner' satisfies OrgRole,
        invitedBy: null,
        createdAt: now,
      })
    } catch (error) {
      await orgs.deleteOne({ _id: organizationId }).catch(() => {})
      throw error
    }

    return {
      ok: true,
      organization: {
        id: String(organizationId),
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        planId: org.planId,
        role: 'owner',
        createdAt: now,
      },
    }
  }

  return { ok: false, error: 'Could not allocate a unique address for that name. Try a different name.', status: 409 }
}

/** MongoDB signals a unique-index violation with code 11000. */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
}

/* ------------------------------------------------------------------ *
 * Updates
 * ------------------------------------------------------------------ */

export interface OrgSettingsPatch {
  name?: string
  retentionDays?: number
}

export async function updateOrganization(
  organizationId: string,
  patch: OrgSettingsPatch,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!ObjectId.isValid(organizationId)) return { ok: false, error: 'Organisation not found.', status: 404 }

  const update: Record<string, unknown> = { updatedAt: new Date() }

  if (patch.name !== undefined) {
    const validated = validateOrgName(patch.name)
    if (!validated.ok) return { ok: false, error: validated.error, status: 400 }
    update.name = validated.name
  }

  if (patch.retentionDays !== undefined) {
    const validated = validateRetentionDays(patch.retentionDays)
    if (!validated.ok) return { ok: false, error: validated.error, status: 400 }
    update.retentionDays = validated.days
  }

  const { orgs } = await collections()
  const result = await orgs.updateOne({ _id: new ObjectId(organizationId) }, { $set: update })
  if (result.matchedCount === 0) return { ok: false, error: 'Organisation not found.', status: 404 }
  return { ok: true }
}

/** One organisation with the fields its settings page shows. */
export async function getOrganization(
  organizationId: string,
): Promise<(OrganizationSummary & { retentionDays: number }) | null> {
  if (!ObjectId.isValid(organizationId)) return null
  const { orgs } = await collections()
  const doc = await orgs.findOne({ _id: new ObjectId(organizationId) })
  if (!doc) return null
  return {
    id: String(doc._id),
    name: doc.name as string,
    slug: doc.slug as string,
    plan: doc.plan as OrganizationPlan,
    planId: isPlanId(doc.planId) ? doc.planId : DEFAULT_PLAN_ID,
    // Filled in by the route from the caller's membership — this read does not
    // know who is asking.
    role: 'viewer',
    createdAt: doc.createdAt as Date,
    retentionDays: (doc.retentionDays as number) ?? DEFAULT_RETENTION_DAYS,
  }
}

/* ------------------------------------------------------------------ *
 * Deleting
 * ------------------------------------------------------------------ */

export type DeleteOrgResult = { ok: true } | { ok: false; error: string; status: number }

/**
 * Permanently delete an organisation.
 *
 * ============================================================
 * WHAT THIS DELETES, AND WHAT IT DELIBERATELY DOES NOT
 * ============================================================
 * Deleted: the organisation itself, every membership in it, its jobs, its
 * team invitations, and its candidate invitations. These are the
 * organisation's own operational records — nothing outside it depends on
 * them existing.
 *
 * NOT deleted:
 *   - `sessions` (candidate interviews, transcripts, assessments). The
 *     settings page already states plainly that retention is not yet
 *     enforced automatically and deletion on request is a manual process —
 *     an owner clicking a button in this dialog is not that process, and
 *     silently hard-deleting a hiring record because the *organisation* was
 *     deleted would quietly break that promise.
 *   - `consents`, `decisions`, `demographics` (M0-4 compliance records).
 *     `decisions` is append-only by design — there is no delete route for it
 *     anywhere in this codebase, and this must not become the first one.
 *     A record that consent was sought, or that a hiring decision was made
 *     and why, has to survive the organisation that made it for exactly the
 *     audits it exists to support.
 *   - `payments`. A financial record of what was charged does not stop
 *     being true because the thing it paid for was later deleted.
 *
 * ============================================================
 * WHY DELETE-THEN-DELETE-THEN-DELETE RATHER THAN A TRANSACTION
 * ============================================================
 * Same reason as `createOrganization`'s compensating delete: no
 * cross-document transaction on a standalone MongoDB server. The
 * organisation document is deleted LAST, so a failure partway through
 * (a dropped connection between two of these calls) leaves an org that is
 * missing its jobs but still exists and still shows the failure to its
 * owner — not an org that looks gone while its memberships still grant
 * access to whoever held them.
 */
export async function deleteOrganization(organizationId: string): Promise<DeleteOrgResult> {
  if (!ObjectId.isValid(organizationId)) return { ok: false, error: 'Organisation not found.', status: 404 }

  const { db, orgs, memberships } = await collections()
  const orgObjectId = new ObjectId(organizationId)

  const existing = await orgs.findOne({ _id: orgObjectId }, { projection: { _id: 1 } })
  if (!existing) return { ok: false, error: 'Organisation not found.', status: 404 }

  await Promise.all([
    memberships.deleteMany({ organizationId: orgObjectId }),
    db.collection('jobs').deleteMany({ organizationId: orgObjectId }),
    db.collection('invitations').deleteMany({ organizationId: orgObjectId }),
    db.collection('candidateInvitations').deleteMany({ organizationId: orgObjectId }),
  ])

  await orgs.deleteOne({ _id: orgObjectId })

  return { ok: true }
}
