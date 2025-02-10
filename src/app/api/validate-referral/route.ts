import { NextResponse } from 'next/server'
import { initDB, validateReferralCode, trackReferralUse } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { isValidReferralCode, normalizeReferralCode } from '@/utils/referral'

// POST /api/validate-referral
export async function POST(request: Request) {
  let db;
  try {
    const session = await getServerSession()
    if (!session?.user) {
      console.log('Unauthorized: No session user')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { userId, referralCode } = body

    console.log('Received validation request:', {
      userId,
      referralCode,
      sessionUser: session.user.name
    })

    if (!userId || !referralCode) {
      console.log('Invalid request body:', { userId, referralCode })
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Verify the user is submitting their own referral
    if (userId !== session.user.name) {
      console.log('Unauthorized: User ID mismatch', {
        requestUserId: userId,
        sessionUserId: session.user.name
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // First validate the format
    if (!isValidReferralCode(referralCode)) {
      console.log('Invalid referral code format:', referralCode)
      return NextResponse.json({ 
        error: 'Invalid referral code format',
        details: 'Code must be in format PUSH-XXXX-YYYY or NO'
      }, { status: 400 })
    }

    // Special case for "NO" referral code
    const normalizedCode = normalizeReferralCode(referralCode)
    if (normalizedCode === 'NO') {
      console.log('NO referral code submitted')
      return NextResponse.json({ success: true })
    }

    console.log('Validating referral code:', { 
      original: referralCode,
      normalized: normalizedCode,
      userId 
    })

    db = await initDB()

    // Start transaction
    await db.run('BEGIN TRANSACTION')

    try {
      // Check if user exists in database
      const user = await db.get('SELECT id FROM users WHERE username = ?', userId)
      let userIdForTracking = user?.id

      if (!user) {
        // Create user if they don't exist
        const newUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
        await db.run(`
          INSERT INTO users (id, username)
          VALUES (?, ?)
        `, newUserId, userId)
        console.log('Created new user:', { userId: newUserId, username: userId })
        userIdForTracking = newUserId
      }

      const isValid = await validateReferralCode(db, normalizedCode)

      if (!isValid) {
        console.log('Invalid referral code:', {
          code: normalizedCode,
          userId
        })
        await db.run('ROLLBACK')
        return NextResponse.json({ 
          error: 'Invalid referral code',
          details: 'Code does not exist in the system'
        }, { status: 400 })
      }

      console.log('Valid referral code, tracking usage:', {
        code: normalizedCode,
        userId: userIdForTracking
      })

      // Track the referral code usage
      const tracked = await trackReferralUse(db, normalizedCode, userIdForTracking)
      if (!tracked) {
        console.log('Failed to track referral usage:', {
          code: normalizedCode,
          userId: userIdForTracking
        })
        await db.run('ROLLBACK')
        return NextResponse.json({ 
          error: 'Failed to track referral usage',
          details: 'Database error while tracking usage'
        }, { status: 500 })
      }

      await db.run('COMMIT')

      console.log('Successfully validated and tracked referral code:', {
        code: normalizedCode,
        userId: userIdForTracking
      })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Error in transaction:', error)
      await db.run('ROLLBACK')
      throw error
    }
  } catch (error) {
    console.error('Error validating referral code:', error)
    if (db) {
      try {
        await db.run('ROLLBACK')
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError)
      }
    }
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 