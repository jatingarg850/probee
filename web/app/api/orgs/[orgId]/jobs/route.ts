import { requireOrgMember } from '@/lib/apiAuth'
import { createJob, listJobs, validateJobInput } from '@/lib/jobs'

/**
 * Jobs within an organisation (M0-3).
 *
 * Every handler goes through `requireOrgMember`, which resolves the caller's
 * role from the database and returns a 404 — not a 403 — when they are not a
 * member, so organisation ids cannot be enumerated by probing this route.
 *
 * Reading needs `viewer`; creating needs `recruiter`. A hiring manager can see
 * the jobs they are interviewing for without being able to change what the
 * panel scores against.
 */

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params
    const gate = await requireOrgMember(request, orgId, 'viewer')
    if (gate instanceof Response) return gate

    return Response.json({ jobs: await listJobs(orgId) }, { status: 200 })
  } catch (error) {
    console.error('GET /api/orgs/[orgId]/jobs error:', error)
    return Response.json({ error: 'Failed to load jobs' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params
    const gate = await requireOrgMember(request, orgId, 'recruiter')
    if (gate instanceof Response) return gate

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Expected a JSON body.' }, { status: 400 })
    }

    const validated = validateJobInput(body)
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: 400 })
    }

    const job = await createJob(orgId, gate.userId, validated.value)
    return Response.json({ job }, { status: 201 })
  } catch (error) {
    console.error('POST /api/orgs/[orgId]/jobs error:', error)
    return Response.json({ error: 'Failed to create job' }, { status: 500 })
  }
}
