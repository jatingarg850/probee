/**
 * Reset a user's password
 * Run with: npx ts-node scripts/reset-password.ts <email> <newPassword>
 */

import bcrypt from 'bcrypt'
import { MongoClient } from 'mongodb'

async function resetPassword() {
  const mongoUrl = process.env.MONGODB_URI
  if (!mongoUrl) {
    console.error('ERROR: MONGODB_URI environment variable is not set')
    process.exit(1)
  }

  const email = process.argv[2]
  const newPassword = process.argv[3]

  if (!email || !newPassword) {
    console.error('Usage: npx ts-node scripts/reset-password.ts <email> <newPassword>')
    console.error('Example: npx ts-node scripts/reset-password.ts jatingarg850@gmail.com MyPassword123')
    process.exit(1)
  }

  const client = new MongoClient(mongoUrl)

  try {
    await client.connect()
    console.log('✓ Connected to MongoDB\n')

    const db = client.db('knotic-chat')
    const usersCollection = db.collection('users')

    // Find user
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const user = await usersCollection.findOne({
      email: { $regex: `^${escapedEmail}$`, $options: 'i' },
    })

    if (!user) {
      console.error(`❌ User not found: ${email}`)
      process.exit(1)
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Update password
    const result = await usersCollection.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword, updatedAt: new Date() } },
    )

    console.log(`✓ Password reset for ${email}`)
    console.log(`  New password: ${newPassword}`)
    console.log(`  Modified documents: ${result.modifiedCount}`)
  } catch (error) {
    console.error('ERROR:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n✓ Disconnected from MongoDB')
  }
}

resetPassword()
