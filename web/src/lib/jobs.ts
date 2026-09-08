import { type Collection, type Db, type Document, ObjectId } from 'mongodb'

import type { Competency, JobInput, JobStatus, JobSummary, PanelSeat } from '@/lib/jobTypes'
import { connectToDatabase } from '@/lib/mongoDb'

// Re-exported so server code imports from one place; client components take
// the pure half straight from jobTypes.
export {
  PANEL_SEATS,
  JOB_STATUSES,
  DEFAULT_COMPETENCIES,
  validateJobInput,
} from '@/lib/jobTypes'
export type { Competency, PanelSeat, JobStatus, JobInput, JobSummary, ValidationResult } from '@/lib/jobTypes'

/**
 * Jobs — what a candidate is actually being interviewed for (M0-3).
 *
 * This is the entity that replaces the free-text blob the panel currently
 * runs on. Today `_build_role_context()` in server/src/agent.py takes a single
 * string capped at 1,200 characters, and the competencies it scores against
 * are five hardcoded names. Neither is configurable by the people who would
 * be paying for this.
 *
 * A job carries the structure instead: which competencies matter and how much,
 * which panel seats sit on it, how long it runs, and the questions the
 * orchestrator must cover. M1-4 makes the backend read from here.
 */

/** The stored shape. Lives here rather than in jobTypes because ObjectId
 * is a driver type — see the note at the top of jobTypes.ts. */
export interface Job {
  _id: ObjectId
  organizationId: ObjectId
  title: string
  level: string
  description: string
  competencies: Competency[]
  panelSeats: PanelSeat[]
  durationMinutes: number
  mustAskQuestions: string[]
  status: JobStatus
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

let indexesReady: Promise<void> | null = null

export async function ensureJobIndexes(db: Db): Promise<void> {
  if (!indexesReady) {
    indexesReady = db
      .collection('jobs')
      // Every job read is "the jobs for this organisation", newest first.
      .createIndex({ organizationId: 1, createdAt: -1 }, { name: 'job_org_created' })
      .then(() => undefined)
      .catch((error) => {
        indexesReady = null
        throw error
      })
  }
  return indexesReady
}

export function resetJobIndexCacheForTests(): void {
  indexesReady = null
}

async function jobsCollection(): Promise<Collection<Document>> {
  const { db } = await connectToDatabase()
  await ensureJobIndexes(db)
  return db.collection('jobs')
}

function toSummary(doc: Document): JobSummary {
  return {
    id: String(doc._id),
    organizationId: String(doc.organizationId),
    title: doc.title,
    level: doc.level ?? '',
    description: doc.description,
    competencies: doc.competencies ?? [],
    panelSeats: doc.panelSeats ?? [],
    durationMinutes: doc.durationMinutes ?? 15,
    mustAskQuestions: doc.mustAskQuestions ?? [],
    status: doc.status ?? 'draft',
    createdBy: String(doc.createdBy),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export async function createJob(organizationId: string, createdBy: string, input: JobInput): Promise<JobSummary> {
  const jobs = await jobsCollection()
  const now = new Date()
  const doc = {
    organizationId: new ObjectId(organizationId),
    createdBy: new ObjectId(createdBy),
    ...input,
    createdAt: now,
    updatedAt: now,
  }
  const inserted = await jobs.insertOne(doc)
  return toSummary({ ...doc, _id: inserted.insertedId })
}

export async function listJobs(organizationId: string, limit = 100): Promise<JobSummary[]> {
  if (!ObjectId.isValid(organizationId)) return []
  const jobs = await jobsCollection()
  const docs = await jobs
    .find({ organizationId: new ObjectId(organizationId) })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .toArray()
  return docs.map(toSummary)
}

/**
 * A single job, scoped to its organisation.
 *
 * `organizationId` is part of the filter, not checked afterwards — so a job id
 * from one organisation can never be read through another organisation's URL,
 * even if the caller is a legitimate member of that other organisation.
 */
export async function getJob(organizationId: string, jobId: string): Promise<JobSummary | null> {
  if (!ObjectId.isValid(organizationId) || !ObjectId.isValid(jobId)) return null
  const jobs = await jobsCollection()
  const doc = await jobs.findOne({ _id: new ObjectId(jobId), organizationId: new ObjectId(organizationId) })
  return doc ? toSummary(doc) : null
}

export async function updateJob(organizationId: string, jobId: string, input: JobInput): Promise<JobSummary | null> {
  if (!ObjectId.isValid(organizationId) || !ObjectId.isValid(jobId)) return null
  const jobs = await jobsCollection()
  const result = await jobs.findOneAndUpdate(
    { _id: new ObjectId(jobId), organizationId: new ObjectId(organizationId) },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: 'after' },
  )
  return result ? toSummary(result) : null
}
