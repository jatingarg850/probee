/**
 * Seed script to create test users in MongoDB for development/testing
 * Run with: npx ts-node scripts/seed-test-user.ts
 */

import bcrypt from 'bcrypt'
import { MongoClient } from 'mongodb'

async function seedTestUser() {
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

    // Test users to create
    const testUsers = [
      {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Test@123456',
      },
      {
        email: 'demo@example.com',
        name: 'Demo User',
        password: 'Demo@123456',
      },
    ]

    for (const testUser of testUsers) {
      // Check if user already exists
      const existingUser = await usersCollection.findOne({
        email: { $regex: `^${testUser.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      })

      if (existingUser) {
        console.log(`ℹ User already exists: ${testUser.email}`)
        continue
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(testUser.password, 10)

      // Create user
      const result = await usersCollection.insertOne({
        email: testUser.email,
        name: testUser.name,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      console.log(`✓ User created: ${testUser.email}`)
      console.log(`  Password: ${testUser.password}`)
      console.log(`  ID: ${result.insertedId}\n`)
    }

    console.log('✓ All test users ready!')
    console.log('\nYou can now login with:')
    console.log('  Email: test@example.com')
    console.log('  Password: Test@123456')
  } catch (error) {
    console.error('ERROR:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n✓ Disconnected from MongoDB')
  }
}

seedTestUser()
