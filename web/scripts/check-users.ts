/**
 * Check what users exist in MongoDB
 * Run with: npx ts-node scripts/check-users.ts
 */

import { MongoClient } from 'mongodb'

async function checkUsers() {
  const mongoUrl = process.env.MONGODB_URI
  if (!mongoUrl) {
    console.error('ERROR: MONGODB_URI environment variable is not set')
    process.exit(1)
  }

  const client = new MongoClient(mongoUrl)

  try {
    await client.connect()
    console.log('✓ Connected to MongoDB')

    const db = client.db('knotic-chat')
    const usersCollection = db.collection('users')

    // Get count
    const count = await usersCollection.countDocuments()
    console.log(`\nTotal users in database: ${count}`)

    // List all users
    if (count > 0) {
      console.log('\nUsers:')
      const users = await usersCollection.find({}).toArray()
      users.forEach((user, index) => {
        console.log(`  ${index + 1}. Email: ${user.email}`)
        console.log(`     Name: ${user.name}`)
        console.log(`     ID: ${user._id}`)
        console.log(`     Has password: ${!!user.password}`)
        console.log(`     Created: ${user.createdAt}`)
      })
    } else {
      console.log('\n⚠ No users found in database!')
      console.log('Run: npx ts-node scripts/seed-test-user.ts')
    }
  } catch (error) {
    console.error('ERROR:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n✓ Disconnected from MongoDB')
  }
}

checkUsers()
