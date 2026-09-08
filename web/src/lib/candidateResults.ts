import { type Collection, type Db, type Document, ObjectId } from 'mongodb'

import { connectToDatabase } from '@/lib/mongoDb'
import type { Assessment } from '@/types/conversation'
import type { SessionCost, SessionIntegrity } from '@/types/session'

/**
 * The recruiter's view of completed hiring interviews (M2-1, minimum slice).
 *
 * A completed candidate interview writes its assessment straight to
 * `sessions` (see `/api/candidate/complete`) and, until this file existed,
 * nothing ever read it back out for an organisation. M1 could score
 * candidates but had nowhere to show the score — this closes that gap.
 *
 * Deliberately not the full M2-1 pipeline: no filtering, no per-job scoping
 * beyond what the list already carries, no comparison. Just enough that a
 * recruiter can see who interviewed and open one to read the assessment.
 */

export interface CandidateResultSummary {
  sessionId: string
  candidateEmail: string
  candidateName: string
  jobId: string | null
  jobTitle: string
  status: 'completed' | 'terminated' | string
  overallScore: number | null
  strikes: number
  terminated: boolean
  startedAt: Date | null
  endedAt: Date | null
  durationSeconds: number | null
}

export interface CandidateResultDetail extends CandidateResultSummary {
  transcript: string
  assessment: Assessment | null
  integrity: SessionIntegrity | null
  cost: SessionCost | null
  terminatedReason: string | null
}

async function sessionsCollection(): Promise<{ db: Db; sessions: Collection<Document> }> {
  const { db } = await connectToDatabase()
  return { db, sessions: db.collection('sessions') }
}

/**
 * Every hiring-interview session for an organisation, newest first.
 *
 * Server-side sort and a hard cap rather than a client-side sort over
 * however many rows exist — the roadmap's own M2-1 acceptance criterion, and
 * the difference between this staying fast at 20 candidates and at 2,000.
 */
export async function listCandidateResults(organizationId: string, limit = 200): Promise<CandidateResultSummary[]> {
  const { db, sessions } = await sessionsCollection()

  const rows = await sessions
    .find(
      { organizationId },
      {
        projection: {
          sessionId: 1,
          candidateEmail: 1,
          userName: 1,
          jobId: 1,
          status: 1,
          assessment: 1,
          integrity: 1,
          startedAt: 1,
          endedAt: 1,
          duration: 1,
        },
      },
    )
    .sort({ endedAt: -1, startedAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 500))
    .toArray()

  if (rows.length === 0) return []

  const jobIds = Array.from(
    new Set(rows.map((row) => row.jobId).filter((id): id is string => typeof id === 'string' && ObjectId.isValid(id))),
  )
  const jobs =
    jobIds.length > 0
      ? await db
          .collection('jobs')
          .find({ _id: { $in: jobIds.map((id) => new ObjectId(id)) } }, { projection: { title: 1 } })
          .toArray()
      : []
  const jobTitleById = new Map(jobs.map((job) => [String(job._id), job.title as string]))

  return rows.map((row) => toSummary(row, jobTitleById))
}

/** One session's full detail, scoped to the organisation it belongs to — a
 * session id from a different organisation resolves to null rather than
 * leaking a candidate's interview across a tenancy boundary. */
export async function getCandidateResult(
  organizationId: string,
  sessionId: string,
): Promise<CandidateResultDetail | null> {
  const { db, sessions } = await sessionsCollection()

  const row = await sessions.findOne({ sessionId, organizationId })
  if (!row) return null

  let jobTitle = 'Unknown role'
  if (typeof row.jobId === 'string' && ObjectId.isValid(row.jobId)) {
    const job = await db.collection('jobs').findOne({ _id: new ObjectId(row.jobId) }, { projection: { title: 1 } })
    if (job) jobTitle = job.title as string
  }

  const summary = toSummary(row, new Map([[String(row.jobId ?? ''), jobTitle]]))

  return {
    ...summary,
    transcript: (row.transcript as string) ?? '',
    assessment: (row.assessment as Assessment) ?? null,
    integrity: (row.integrity as SessionIntegrity) ?? null,
    cost: (row.cost as SessionCost) ?? null,
    terminatedReason: (row.terminatedReason as string) ?? null,
  }
}

function toSummary(row: Document, jobTitleById: Map<string, string>): CandidateResultSummary {
  const assessment = row.assessment as Assessment | undefined
  const integrity = row.integrity as SessionIntegrity | undefined
  const jobId = typeof row.jobId === 'string' ? row.jobId : null

  return {
    sessionId: row.sessionId as string,
    candidateEmail: (row.candidateEmail as string) ?? '',
    candidateName: (row.userName as string) || (row.candidateEmail as string) || 'Unknown candidate',
    jobId,
    jobTitle: jobTitleById.get(jobId ?? '') ?? 'Unknown role',
    status: (row.status as string) ?? 'completed',
    overallScore: typeof assessment?.overall_score === 'number' ? assessment.overall_score : null,
    strikes: integrity?.strikes ?? 0,
    terminated: integrity?.terminated ?? row.status === 'terminated',
    startedAt: typeof row.startedAt === 'number' ? new Date(row.startedAt) : null,
    endedAt: typeof row.endedAt === 'number' ? new Date(row.endedAt) : null,
    durationSeconds: typeof row.duration === 'number' ? row.duration : null,
  }
}
