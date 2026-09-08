import jwt from 'jsonwebtoken'
import { type Db, MongoClient, ObjectId } from 'mongodb'

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

function getAuthToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}

export async function GET(request: Request) {
  try {
    const token = getAuthToken(request)
    if (!token) {
      return Response.json({ error: 'Authorization token is required' }, { status: 401 })
    }

    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string }

    const { db } = await connectToDatabase()
    const usersCollection = db.collection('users')

    const user = await usersCollection.findOne({
      _id: new ObjectId(decoded.userId),
    })

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    const { password: _, ...userWithoutPassword } = user

    return Response.json(
      {
        success: true,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('GET /api/auth/profile error:', error)
    return Response.json({ error: 'Failed to fetch profile' }, { status: 401 })
  }
}
