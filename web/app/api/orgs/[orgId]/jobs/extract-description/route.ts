import { requireOrgMember } from '@/lib/apiAuth'
import { backendUrl } from '@/lib/backendUrl'

/**
 * Read a job-description file (PDF or plain text) and return its text, so a
 * recruiter can upload the listing they already have instead of retyping it
 * into the job form's textarea.
 *
 * Proxies to the Python backend's `/extractJobDescription`, which — like
 * `/analyzeResume` — hands the raw bytes to Gemini's native document reading
 * rather than running a text-extraction library. Org-gated here (`recruiter`)
 * even though the extraction itself touches no organisation data, so this
 * cannot be used as an unauthenticated file-reading endpoint.
 */

type RouteParams = { params: Promise<{ orgId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { orgId } = await params
    const gate = await requireOrgMember(request, orgId, 'recruiter')
    if (gate instanceof Response) return gate

    const incoming = await request.formData()
    const file = incoming.get('file')
    if (!(file instanceof File)) {
      return Response.json({ error: 'Attach a PDF or text file.' }, { status: 400 })
    }

    const outgoing = new FormData()
    outgoing.append('file', file, file.name)

    let response: Response
    try {
      response = await fetch(`${backendUrl()}/extractJobDescription`, { method: 'POST', body: outgoing })
    } catch (fetchError) {
      console.error('POST /api/orgs/[orgId]/jobs/extract-description backend error:', fetchError)
      return Response.json({ error: 'Could not reach the extraction service.' }, { status: 503 })
    }

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return Response.json({ error: data?.detail ?? 'Could not read that file.' }, { status: response.status })
    }

    return Response.json({ description: typeof data?.description === 'string' ? data.description : '' })
  } catch (error) {
    console.error('POST /api/orgs/[orgId]/jobs/extract-description error:', error)
    return Response.json({ error: 'Could not read that file.' }, { status: 500 })
  }
}
