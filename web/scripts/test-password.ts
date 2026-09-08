/**
 * Test password hashing and verification
 * Run with: npx ts-node scripts/test-password.ts
 */

import bcrypt from 'bcrypt'
import { MongoClient } from 'mongodb'

async function testPassword() {
  const mongoUrl = process.env.MONGODB_URI
  if (!mongoUrl) {
    console.error('ERROR: MONGODB_URI environment variable is not set')
    process.exit(1)
  }

  const client = new MongoClient(mongoUrl)

  try {
    await client.connect()
    console.log('✓ Connected to MongoDB\n')

    const db = client.db('knotic-chat')
    const usersCollection = db.collection('users')

    // Get the test user
    const user = await usersCollection.findOne({ email: 'test@example.com' })
    if (!user) {
      console.error('❌ Test user not found')
      process.exit(1)
    }

    console.log('Test User:', user.email)
    console.log('Stored password hash:', user.password)
    console.log('Hash length:', user.password.length)

    // Test password: Test@123456
    const testPassword = 'Test@123456'
    console.log('\nTesting password:', testPassword)

    const isValid = await bcrypt.compare(testPassword, user.password)
    console.log('Password match:', isValid ? '✓ YES' : '❌ NO')

    // If it doesn't match, let's also try other common passwords
    if (!isValid) {
      console.log('\nTrying other common passwords:')
      const commonPasswords = ['password', '123456', 'test123', 'Test@123', 'password123']

      for (const pwd of commonPasswords) {
        const match = await bcrypt.compare(pwd, user.password)
        console.log(`  "${pwd}": ${match ? '✓ MATCH' : '❌ no match'}`)
      }
    }

    // Also check one of the Gmail users
    const gmailUser = await usersCollection.findOne({ email: 'jatingarg850@gmail.com' })
    if (gmailUser) {
      console.log('\n\nGmail User:', gmailUser.email)
      console.log('Stored password hash:', gmailUser.password)
      console.log('Hash length:', gmailUser.password.length)

      // Check if it's a bcrypt hash (starts with $2)
      const isBcryptHash = gmailUser.password.startsWith('$2')
      console.log('Is bcrypt hash format:', isBcryptHash ? '✓ YES' : '❌ NO')
    }
  } catch (error) {
    console.error('ERROR:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n✓ Disconnected from MongoDB')
  }
}

testPassword()
