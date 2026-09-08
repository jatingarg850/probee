import jwt from 'jsonwebtoken'

import { getJwtSecret } from '@/lib/jwtSecret'

export async function POST(request: Request) {
  try {
    const { token } = await request.json()

    if (!token) {
      return Response.json({ error: 'Token is required' }, { status: 400 })
    }

    const decoded = jwt.verify(token, getJwtSecret())

    return Response.json(
      {
        success: true,
        decoded,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('POST /api/auth/verify error:', error)
    return Response.json({ error: 'Invalid or expired token' }, { status: 401 })
  }
}
