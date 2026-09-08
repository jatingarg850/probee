import jwt from 'jsonwebtoken'
import { type Db, MongoClient } from 'mongodb'
import { getServerSession } from 'next-auth/next'

import { authOptions } from '@/lib/authOptions'
import { getJwtSecret } from '@/lib/jwtSecret'

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
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    const email = session?.user?.email
    if (!email) {
      return Response.json({ error: 'No active session' }, { status: 401 })
    }

    const { db } = await connectToDatabase()
    const usersCollection = db.collection('users')
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const user = await usersCollection.findOne({ email: { $regex: `^${escapedEmail}$`, $options: 'i' } })

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    const token = jwt.sign({ userId: user._id, email: user.email }, getJwtSecret(), { expiresIn: '7d' })

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
    console.error('POST /api/auth/oauth-token error:', error)
    return Response.json({ error: 'Failed to issue token' }, { status: 500 })
  }
}
