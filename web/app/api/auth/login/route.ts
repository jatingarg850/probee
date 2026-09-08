import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { type Db, MongoClient } from 'mongodb'

import { getJwtSecret } from '@/lib/jwtSecret'
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rateLimit'

let cachedClient: MongoClient | null = null
let cachedDb: Db | null = null

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb }
  }

  const mongoUrl = process.env.MONGODB_URI
  if (!mongoUrl) {
    throw new Error('MONGODB_URI environment variable is not set')
  }

  const client = new MongoClient(mongoUrl)
  await client.connect()

  const db = client.db('knotic-chat')

  cachedClient = client
  cachedDb = db

  return { client, db }
}

export async function POST(request: Request) {
  try {
    // Per-IP rather than per-email: an attacker doesn't need to know a real
    // email up front, and limiting by an unverified request field would let
    // them exhaust a victim's own budget by logging in as them repeatedly.
    // 10 attempts per 5 minutes is generous for a real person who mistyped a
    // password twice, and expensive for a credential-stuffing script.
    const limit = rateLimit(`login:${clientIp(request)}`, 10, 5 * 60_000)
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

    const { db } = await connectToDatabase()
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    // Validate input
    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const usersCollection = db.collection('users')

    // Case-insensitive lookup: existing accounts registered before emails
    // were normalized to lowercase on signup may still have mixed-case
    // stored, and this must keep matching them without a data migration.
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const user = await usersCollection.findOne({ email: { $regex: `^${escapedEmail}$`, $options: 'i' } })
    if (!user) {
      return Response.json(
        {
          error: 'Email not found.',
          errorType: 'EMAIL_NOT_FOUND',
          message: 'This email is not registered. Please sign up first.',
        },
        { status: 401 },
      )
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return Response.json(
        {
          error: 'Incorrect password.',
          errorType: 'INVALID_PASSWORD',
          message: 'The password you entered is incorrect. Please try again or reset your password.',
        },
        { status: 401 },
      )
    }

    // Generate JWT token
    const jwtSecret = getJwtSecret()
    const token = jwt.sign({ userId: user._id, email: user.email }, jwtSecret, { expiresIn: '7d' })

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user

    return Response.json(
      {
        success: true,
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('POST /api/auth/login error:', error)
    return Response.json({ error: 'Failed to login' }, { status: 500 })
  }
}
