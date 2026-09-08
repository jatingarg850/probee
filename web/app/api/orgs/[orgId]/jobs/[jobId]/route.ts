import { requireOrgMember } from '@/lib/apiAuth'
import { getJob, updateJob, validateJobInput } from '@/lib/jobs'

/**
 * A single job.
 *
 * There is deliberately no DELETE. A job that has had candidates interviewed
 * against it is part of the evidence trail a bias audit depends on (M3-1) —
 * deleting it would orphan every decision made under it. Closing a job is what
 * `status: 'closed'` is for.
 */

type RouteParams = { params: Promise<{ orgId: string; jobId: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { orgId, jobId } = await params
    const gate = await requireOrgMember(request, orgId, 'viewer')
    if (gate instanceof Response) return gate

    const job = await getJob(orgId, jobId)
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 })

    return Response.json({ job }, { status: 200 })
  } catch (error) {
    console.error('GET /api/orgs/[orgId]/jobs/[jobId] error:', error)
    return Response.json({ error: 'Failed to load job' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { orgId, jobId } = await params
    const gate = await requireOrgMember(request, orgId, 'recruiter')
    if (gate instanceof Response) return gate

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    // The existing job is merged with the patch before validation, so a
    // partial update is still checked as a whole — otherwise you could drop
    // the competency weights below 100 by sending only one of them.
    const existing = await getJob(orgId, jobId)
    if (!existing) return Response.json({ error: 'Job not found' }, { status: 404 })

    const merged = { ...existing, ...(body as Record<string, unknown>) }
    const validated = validateJobInput(merged)
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: 400 })
    }

    const job = await updateJob(orgId, jobId, validated.value)
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 })

    return Response.json({ job }, { status: 200 })
  } catch (error) {
    console.error('PATCH /api/orgs/[orgId]/jobs/[jobId] error:', error)
    return Response.json({ error: 'Failed to update job' }, { status: 500 })
  }
}
