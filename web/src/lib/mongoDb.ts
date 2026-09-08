import { type Db, MongoClient } from 'mongodb'

/** One cached Mongo connection for every route to share.
 *
 * This block was copy-pasted verbatim into each route file, which meant each
 * one held its own client and its own cache — several connections to the
 * same database per process instead of one, and any fix (timeouts, pool
 * size, auth) had to be made in every copy or silently applied to only some
 * of them. */
let cachedClient: MongoClient | null = null
let cachedDb: Db | null = null

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb }
  }

  const mongoUrl = process.env.MONGODB_URI
  if (!mongoUrl) {
    throw new Error('MONGODB_URI environment variable is not set')
  }

  const client = new MongoClient(mongoUrl)
  await client.connect()

  cachedClient = client
  cachedDb = client.db('knotic-chat')

  return { client: cachedClient, db: cachedDb }
}

/**
 * Indexes for the shared session collection (M0-5).
 *
 * Kept here rather than in a feature module because `sessions` is written by
 * both products — the practice app and the recruiter app — so neither owns it.
 * Idempotent and cached, same pattern as the org and job indexes.
 */
let sessionIndexesReady: Promise<void> | null = null

export async function ensureSessionIndexes(db: Db): Promise<void> {
  if (!sessionIndexesReady) {
    sessionIndexesReady = Promise.all([
      // The recruiter pipeline read: every candidate for one job, newest
      // first. Sparse because practice sessions carry none of these fields,
      // and there is no reason to index a null for every one of them.
      db
        .collection('sessions')
        .createIndex({ organizationId: 1, jobId: 1, endedAt: -1 }, { name: 'session_org_job_ended', sparse: true }),
      // The consumer read, which predates all of this.
      db
        .collection('sessions')
        .createIndex({ userId: 1, endedAt: -1 }, { name: 'session_user_ended' }),
    ])
      .then(() => undefined)
      .catch((error) => {
        sessionIndexesReady = null
        throw error
      })
  }
  return sessionIndexesReady
}

export function resetSessionIndexCacheForTests(): void {
  sessionIndexesReady = null
}
