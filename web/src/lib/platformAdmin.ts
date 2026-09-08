import { ObjectId } from 'mongodb'

import { getAuthedUserId } from '@/lib/apiAuth'
import { connectToDatabase } from '@/lib/mongoDb'

/**
 * Platform administration — PROBE staff looking across every organisation.
 *
 * ============================================================
 * HOW SOMEONE BECOMES AN ADMIN
 * ============================================================
 * By a field on their user document (`platformRole: 'admin'`), set directly in
 * the database. There is deliberately **no route that grants this** — a
 * privilege-escalation endpoint is exactly the thing worth not building, and
 * the number of people who need it is small enough that a `mongosh` one-liner
 * is the right interface:
 *
 *   db.users.updateOne({ email: "you@example.com" }, { $set: { platformRole: "admin" } })
 *
 * ============================================================
 * WHAT AN ADMIN CAN AND CANNOT SEE
 * ============================================================
 * Organisation names, plans, member counts, job counts and aggregate interview
 * cost. **Not** candidate transcripts, assessments, or anything under
 * `demographics`. Staff access to a hiring tool is exactly where a "we can see
 * everything" default becomes a liability — for candidates whose interviews
 * were never meant for a third party, and for the employers relying on this
 * being confidential.
 *
 * Every read here is an aggregate or a count. If a future admin view needs an
 * individual candidate's data, that is a decision to make deliberately with
 * an audit trail, not something to inherit from this file.
 */

export type PlatformRole = 'admin'

/** The verified user id, if they are platform staff. Null otherwise — read
 * from the database on every request, same rule as organisation roles. */
export async function getPlatformAdminId(request: Request): Promise<string | null> {
  const userId = getAuthedUserId(request)
  if (!userId || !ObjectId.isValid(userId)) return null

  const { db } = await connectToDatabase()
  const user = await db.collection('users').findOne({ _id: new ObjectId(userId) }, { projection: { platformRole: 1 } })

  return user?.platformRole === 'admin' ? userId : null
}

/**
 * 404 for a non-admin, not 403.
 *
 * Same reasoning as the organisation guard: a distinct "forbidden" confirms
 * that an admin surface exists at this path, which is the first thing an
 * attacker wants to know.
 */
export function notFound() {
  return Response.json({ error: 'Not found' }, { status: 404 })
}

export interface PlatformOrgRow {
  id: string
  name: string
  slug: string
  plan: string
  createdAt: Date
  memberCount: number
  jobCount: number
  interviewCount: number
  /** Summed from the S1 cost records on this organisation's interviews. */
  totalCostUsd: number
}

export interface PlatformSummary {
  organizations: number
  users: number
  jobs: number
  /** Interviews across the whole platform, hiring and practice combined. */
  interviews: number
  /** Practice interviews have no organisation; counted separately because the
   * two products have very different unit economics. */
  practiceInterviews: number
  totalCostUsd: number
  paidOrganizations: number
  revenuePaise: number
}

export async function getPlatformSummary(): Promise<PlatformSummary> {
  const { db } = await connectToDatabase()

  const [organizations, users, jobs, interviews, practiceInterviews] = await Promise.all([
    db.collection('organizations').countDocuments(),
    db.collection('users').countDocuments(),
    db.collection('jobs').countDocuments(),
    db.collection('sessions').countDocuments(),
    db.collection('sessions').countDocuments({ organizationId: { $exists: false } }),
  ])

  const [costAgg] = await db
    .collection('sessions')
    .aggregate([
      { $match: { 'cost.totalUsd': { $type: 'number' } } },
      { $group: { _id: null, total: { $sum: '$cost.totalUsd' } } },
    ])
    .toArray()

  const [revenueAgg] = await db
    .collection('payments')
    .aggregate([
      { $match: { status: 'consumed' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ])
    .toArray()

  return {
    organizations,
    users,
    jobs,
    interviews,
    practiceInterviews,
    totalCostUsd: Math.round((costAgg?.total ?? 0) * 100) / 100,
    paidOrganizations: revenueAgg?.count ?? 0,
    revenuePaise: revenueAgg?.total ?? 0,
  }
}

/**
 * Every organisation with its counts and cost.
 *
 * Counts are gathered with three grouped aggregations rather than a query per
 * organisation — the naive version is O(n) round trips and falls over the
 * moment there are more than a handful of customers.
 */
export async function listPlatformOrganizations(limit = 100): Promise<PlatformOrgRow[]> {
  const { db } = await connectToDatabase()

  const orgs = await db
    .collection('organizations')
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 500))
    .toArray()

  if (orgs.length === 0) return []
  const ids = orgs.map((o) => o._id as ObjectId)
  const idStrings = ids.map(String)

  const [members, jobs, sessions] = await Promise.all([
    db
      .collection('memberships')
      .aggregate([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', n: { $sum: 1 } } }])
      .toArray(),
    db
      .collection('jobs')
      .aggregate([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', n: { $sum: 1 } } }])
      .toArray(),
    // `sessions.organizationId` is stored as a string (see the M0-5 fields on
    // the sessions route), unlike the ObjectId used elsewhere — matching on
    // the wrong type here silently returns zero rows.
    db
      .collection('sessions')
      .aggregate([
        { $match: { organizationId: { $in: idStrings } } },
        { $group: { _id: '$organizationId', n: { $sum: 1 }, cost: { $sum: '$cost.totalUsd' } } },
      ])
      .toArray(),
  ])

  const memberCounts = new Map(members.map((m) => [String(m._id), m.n as number]))
  const jobCounts = new Map(jobs.map((j) => [String(j._id), j.n as number]))
  const sessionStats = new Map(sessions.map((s) => [String(s._id), s]))

  return orgs.map((org) => {
    const key = String(org._id)
    const stats = sessionStats.get(key)
    return {
      id: key,
      name: org.name as string,
      slug: org.slug as string,
      plan: (org.plan as string) ?? 'trial',
      createdAt: org.createdAt as Date,
      memberCount: memberCounts.get(key) ?? 0,
      jobCount: jobCounts.get(key) ?? 0,
      interviewCount: stats?.n ?? 0,
      totalCostUsd: Math.round((stats?.cost ?? 0) * 100) / 100,
    }
  })
}

export interface CostByRateCard {
  rateCardVersion: string
  interviews: number
  totalUsd: number
  medianUsd: number
  medianDurationMinutes: number
}

/**
 * The S1 answer: what an interview actually costs, grouped by rate card.
 *
 * Median rather than mean. One interview that ran long, or one that ended in
 * the first ten seconds, moves an average enough to make it useless for
 * pricing; the median is what a typical interview costs.
 */
export async function getCostBreakdown(): Promise<CostByRateCard[]> {
  const { db } = await connectToDatabase()

  const rows = await db
    .collection('sessions')
    .find({ 'cost.totalUsd': { $type: 'number' } }, { projection: { cost: 1 } })
    .toArray()

  const byVersion = new Map<string, { costs: number[]; durations: number[] }>()
  for (const row of rows) {
    const cost = row.cost as { rateCardVersion?: string; totalUsd?: number; durationMinutes?: number }
    const version = cost.rateCardVersion ?? 'unknown'
    const bucket = byVersion.get(version) ?? { costs: [], durations: [] }
    if (typeof cost.totalUsd === 'number') bucket.costs.push(cost.totalUsd)
    if (typeof cost.durationMinutes === 'number') bucket.durations.push(cost.durationMinutes)
    byVersion.set(version, bucket)
  }

  return Array.from(byVersion.entries())
    .map(([rateCardVersion, { costs, durations }]) => ({
      rateCardVersion,
      interviews: costs.length,
      totalUsd: Math.round(costs.reduce((a, b) => a + b, 0) * 100) / 100,
      medianUsd: median(costs),
      medianDurationMinutes: median(durations),
    }))
    .sort((a, b) => b.rateCardVersion.localeCompare(a.rateCardVersion))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return Math.round(value * 10000) / 10000
}
