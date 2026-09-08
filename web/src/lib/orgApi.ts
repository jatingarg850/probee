import { authHeaders, readApiError } from '@/lib/clientAuth'
import type { JobInput, JobSummary } from '@/lib/jobTypes'
import type { OrgRole, OrganizationSummary } from '@/lib/orgTypes'

/**
 * Browser-side client for the organisation and job routes.
 *
 * Every function throws an `Error` carrying the server's own message rather
 * than a status code, so a caller can render it directly — the routes are
 * written to return copy that is safe and useful to show a person.
 */

export type { JobSummary, OrgRole, OrganizationSummary }

export async function fetchOrganizations(): Promise<OrganizationSummary[]> {
  const response = await fetch('/api/orgs', { headers: authHeaders() })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not load your organisations.'))
  const data = await response.json()
  return data.organizations ?? []
}

export async function createOrganizationRequest(name: string): Promise<OrganizationSummary> {
  const response = await fetch('/api/orgs', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not create the organisation.'))
  const data = await response.json()
  return data.organization
}

export async function fetchJobs(orgId: string): Promise<JobSummary[]> {
  const response = await fetch(`/api/orgs/${orgId}/jobs`, { headers: authHeaders() })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not load jobs.'))
  const data = await response.json()
  return data.jobs ?? []
}

export async function fetchJob(orgId: string, jobId: string): Promise<JobSummary> {
  const response = await fetch(`/api/orgs/${orgId}/jobs/${jobId}`, { headers: authHeaders() })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not load this job.'))
  const data = await response.json()
  return data.job
}

export async function createJobRequest(orgId: string, input: Partial<JobInput>): Promise<JobSummary> {
  const response = await fetch(`/api/orgs/${orgId}/jobs`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not create the job.'))
  const data = await response.json()
  return data.job
}

export async function updateJobRequest(orgId: string, jobId: string, input: Partial<JobInput>): Promise<JobSummary> {
  const response = await fetch(`/api/orgs/${orgId}/jobs/${jobId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not save the job.'))
  const data = await response.json()
  return data.job
}

/** Extracts the text of an uploaded job-description file (PDF or plain
 * text) via the backend's Gemini-native document reading — no `Content-Type`
 * header set manually, so the browser attaches the multipart boundary. */
export async function extractJobDescriptionRequest(orgId: string, file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`/api/orgs/${orgId}/jobs/extract-description`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not read that file.'))
  const data = await response.json()
  return data.description ?? ''
}

/* ------------------------------------------------------------------ *
 * Team and invitations
 * ------------------------------------------------------------------ */

export interface MemberRow {
  userId: string
  name: string
  email: string
  role: OrgRole
  joinedAt: string
}

export interface InvitationRow {
  id: string
  email: string
  role: OrgRole
  createdAt: string
  expiresAt: string
  expired: boolean
}

export interface TeamResponse {
  members: MemberRow[]
  invitations: InvitationRow[]
  seats: { used: number; limit: number | null; planName: string | null }
  canManage: boolean
}

export async function fetchTeam(orgId: string): Promise<TeamResponse> {
  const response = await fetch(`/api/orgs/${orgId}/members`, { headers: authHeaders() })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not load the team.'))
  return response.json()
}

/** The returned `inviteUrl` is the one and only time the plaintext token is
 * available — the server stores a hash. The UI must show it immediately
 * rather than assuming the email arrived. */
export async function inviteMember(
  orgId: string,
  input: { email: string; role: OrgRole },
): Promise<{ invitation: InvitationRow; inviteUrl: string; emailed: boolean }> {
  const response = await fetch(`/api/orgs/${orgId}/members`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not send that invitation.'))
  return response.json()
}

export async function changeMemberRole(orgId: string, userId: string, role: OrgRole): Promise<void> {
  const response = await fetch(`/api/orgs/${orgId}/members/${userId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ role }),
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not change that role.'))
}

export async function removeMemberRequest(orgId: string, userId: string): Promise<void> {
  const response = await fetch(`/api/orgs/${orgId}/members/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not remove that person.'))
}

export async function revokeInvitationRequest(orgId: string, inviteId: string): Promise<void> {
  const response = await fetch(`/api/orgs/${orgId}/invites/${inviteId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Could not cancel that invitation.'))
}
