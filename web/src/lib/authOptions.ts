import { MongoClient } from 'mongodb'
import type { NextAuthOptions, Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import GoogleProvider from 'next-auth/providers/google'

// Extend Session type to include id
declare module 'next-auth' {
  interface Session {
    user: {
      id?: string
      email?: string
      name?: string
      image?: string
    }
  }
}

// Extend JWT type to include id and provider
declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    provider?: string
  }
}

// MongoDB connection helper for OAuth
async function getMongoDb() {
  const mongoUrl = process.env.MONGODB_URI
  if (!mongoUrl) {
    throw new Error('MONGODB_URI environment variable is not set')
  }

  const client = new MongoClient(mongoUrl)
  await client.connect()
  return client.db('knotic-chat')
}

// Create or update user in MongoDB during OAuth sign-in
async function upsertOAuthUser(email: string, name: string, image?: string | null) {
  try {
    const db = await getMongoDb()
    const usersCollection = db.collection('users')

    // Case-insensitive email lookup
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const existingUser = await usersCollection.findOne({
      email: { $regex: `^${escapedEmail}$`, $options: 'i' },
    })

    if (existingUser) {
      // Update existing user (preserve password-based accounts)
      await usersCollection.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            name: name || existingUser.name,
            image: image || existingUser.image || undefined,
            lastLoginAt: new Date(),
          },
        },
      )
      return {
        id: existingUser._id.toString(),
        email: existingUser.email,
        name: existingUser.name,
      }
    }
    // Create new OAuth user (no password needed)
    const result = await usersCollection.insertOne({
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      image: image || undefined,
      password: null, // OAuth users don't have passwords
      provider: 'google',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
    })

    return {
      id: result.insertedId.toString(),
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
    }
  } catch (error) {
    console.error('Error upserting OAuth user:', error)
    throw error
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    // Google OAuth Provider. Email/password login does not go through
    // NextAuth at all — `AuthContext.tsx` calls `/api/auth/login` directly
    // and manages its own bearer token (see that route's own JWT/bcrypt
    // implementation). A `CredentialsProvider` used to live here pointing at
    // a Python backend `/login` endpoint that no longer exists — dead code
    // nothing ever called, removed rather than left as a trap for whoever
    // next tries to add password login through NextAuth and wonders why it
    // 404s.
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        // Handle Google OAuth sign-in
        if (account?.provider === 'google' && profile) {
          const email = profile.email || user.email
          if (!email) {
            console.error('No email from Google profile')
            return false
          }

          const name = profile.name || user.name || email.split('@')[0]
          const image = profile.image || user.image

          try {
            // Create/update user in MongoDB
            const oauthUser = await upsertOAuthUser(email, name, image)
            user.id = oauthUser.id
            user.email = oauthUser.email
            user.name = oauthUser.name
            user.image = image

            return true
          } catch (error) {
            console.error('Failed to create/update OAuth user:', error)
            return false
          }
        }

        return true
      } catch (error) {
        console.error('SignIn callback error:', error)
        return false
      }
    },

    async jwt({ token, user, account }: { token: JWT; user?: any; account?: any }) {
      if (user) {
        token.id = user.id || user.email
        token.email = user.email
        token.name = user.name
      }

      if (account?.provider === 'google') {
        token.provider = 'google'
      }

      return token
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
      }
      return session
    },

    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`
      // Allows callback URLs on the same origin
      if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,
}
