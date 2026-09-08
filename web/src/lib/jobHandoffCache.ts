import type { JobSummary } from '@/lib/jobTypes'

/**
 * Hands a freshly created job to the edit page `JobForm` navigates to right
 * after — `/orgs/[orgId]/jobs/new` and `/orgs/[orgId]/jobs/[jobId]` are
 * different route files, so the router.push after creating a job fully
 * remounts the form component. Without this, that remount re-fetched the
 * exact job the create request had just returned, adding a second network
 * round trip (plus its own loading skeleton) to every "Create job" click for
 * no reason — the data was already in hand.
 *
 * Module-scoped rather than persisted anywhere: it only needs to survive one
 * client-side navigation within the same tab, and a stale leftover entry is
 * harmless since `takeStashedJob` deletes on read.
 */
const cache = new Map<string, JobSummary>()

export function stashCreatedJob(job: JobSummary): void {
  cache.set(job.id, job)
}

export function takeStashedJob(jobId: string): JobSummary | undefined {
  const job = cache.get(jobId)
  cache.delete(jobId)
  return job
}
