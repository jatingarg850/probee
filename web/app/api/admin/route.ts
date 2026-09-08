import {
  getCostBreakdown,
  getPlatformAdminId,
  getPlatformSummary,
  listPlatformOrganizations,
  notFound,
} from '@/lib/platformAdmin'

/**
 * Platform overview for PROBE staff.
 *
 * Returns aggregates and counts only. No candidate transcript, assessment or
 * demographic data crosses this boundary — see the note at the top of
 * platformAdmin.ts for why that is a deliberate limit rather than an omission.
 */
export async function GET(request: Request) {
  try {
    const adminId = await getPlatformAdminId(request)
    if (!adminId) return notFound()

    const [summary, organizations, costs] = await Promise.all([
      getPlatformSummary(),
      listPlatformOrganizations(),
      getCostBreakdown(),
    ])

    return Response.json({ summary, organizations, costs }, { status: 200 })
  } catch (error) {
    console.error('GET /api/admin error:', error)
    return Response.json({ error: 'Failed to load platform data' }, { status: 500 })
  }
}
