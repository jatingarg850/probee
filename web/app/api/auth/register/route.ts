import bcrypt from 'bcrypt'
import { type Db, MongoClient } from 'mongodb'

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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  try {
    // Lower and slower than login's limit: a real person registers once, not
    // repeatedly, so this mainly exists to stop a script from bulk-creating
    // accounts (each one a free bcrypt hash + a DB write) or probing which
    // emails already exist via the 409 response.
    const limit = rateLimit(`register:${clientIp(request)}`, 5, 60 * 60_000)
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds)

    const { db } = await connectToDatabase()
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    // Validate input
    if (!email || !password || !name) {
      return Response.json({ error: 'Missing required fields: email, password, name' }, { status: 400 })
    }

    if (!EMAIL_PATTERN.test(email)) {
      return Response.json({ error: 'Enter a valid email address' }, { status: 400 })
    }

    if (password.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters long' }, { status: 400 })
    }

    const usersCollection = db.collection('users')

    // Case-insensitive so "User@x.com" can't be registered a second time
    // alongside an existing "user@x.com" account.
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const existingUser = await usersCollection.findOne({ email: { $regex: `^${escapedEmail}$`, $options: 'i' } })
    if (existingUser) {
      return Response.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create new user
    const result = await usersCollection.insertOne({
      email,
      name,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return Response.json(
      {
        success: true,
        userId: result.insertedId,
        message: 'User registered successfully',
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('POST /api/auth/register error:', error)
    return Response.json({ error: 'Failed to register user' }, { status: 500 })
  }
}
