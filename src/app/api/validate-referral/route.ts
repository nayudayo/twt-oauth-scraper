import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db/index'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'

// POST /api/validate-referral
export async function POST(req: NextRequest) {
  try {
    // Get and validate session
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      console.error('No session found')
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
    }

    // Ensure username is available
    const sessionUsername = session.username || session.user.name
    if (!sessionUsername) {
      console.error('No username in session:', { session })
      return NextResponse.json({ error: 'Unauthorized - No username found' }, { status: 401 })
    }

    const body = await req.json()
    const { userId, referralCode } = body

    if (!userId || !referralCode) {
      console.error('Missing required fields:', { userId, referralCode })
      return NextResponse.json({ 
        error: 'Missing required fields',
        details: {
          userId: !userId ? 'User ID is required' : null,
          referralCode: !referralCode ? 'Referral code is required' : null
        }
      }, { status: 400 })
    }

    // Verify the user is submitting for themselves
    if (userId !== sessionUsername) {
      console.error('User mismatch:', { sessionUsername, userId })
      return NextResponse.json({ error: 'Unauthorized - Cannot submit for another user' }, { status: 401 })
    }

    // Special case for "NO"
    if (referralCode.toUpperCase() === 'NO') {
      return NextResponse.json({ 
        success: true,
        message: 'No referral code used'
      })
    }

    const db = await initDB()

    try {
      // First validate if the code exists in the database
      const isValid = await db.validateReferralCode(referralCode)
      if (!isValid) {
        console.error('Invalid referral code:', { referralCode })
        return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })
      }

      // Get referral code details
      const codeDetails = await db.getReferralCodeDetails(referralCode)
      if (!codeDetails) {
        console.error('Failed to get referral code details:', { referralCode })
        return NextResponse.json({ error: 'Failed to process referral code' }, { status: 500 })
      }

      // Prevent self-referral
      if (codeDetails.owner_user_id === userId) {
        console.error('Self-referral attempt:', { userId, referralCode })
        return NextResponse.json({ error: 'Cannot use your own referral code' }, { status: 400 })
      }

      // Check if user has already used a referral code
      const referralHistory = await db.getReferralHistory(userId)
      if (referralHistory.referredBy) {
        console.error('User already used a referral code:', { 
          userId,
          existingReferral: referralHistory.referredBy
        })
        return NextResponse.json({ 
          error: 'You have already used a referral code',
          details: {
            usedAt: referralHistory.referredBy.used_at,
            referralCode: referralHistory.referredBy.referral_code
          }
        }, { status: 400 })
      }

      // Ensure user exists in database
      let user = await db.getUserByUsername(userId)
      if (!user) {
        // Create the user if they don't exist
        user = await db.createUser({
          username: userId,
          created_at: new Date()
        })
        console.log('Created new user for referral:', user)
      }

      // Track the usage in a transaction
      await db.trackReferralUse({
        id: 0, // Auto-generated
        referral_code: referralCode,
        referrer_user_id: codeDetails.owner_user_id,
        referred_user_id: user.id, // Use the user.id instead of userId
        used_at: new Date()
      })

      // Log the usage
      await db.logReferralUsage({
        id: 0, // Auto-generated
        referral_code: referralCode,
        used_by_user_id: user.id, // Use the user.id instead of userId
        used_at: new Date()
      })

      console.log('Successfully validated and tracked referral:', {
        referralCode,
        userId: user.id,
        referrerId: codeDetails.owner_user_id
      })

      return NextResponse.json({ 
        success: true,
        message: 'Referral code successfully applied',
        details: {
          referralCode,
          referrerId: codeDetails.owner_user_id,
          appliedAt: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error('Database operation failed:', error)
      return NextResponse.json({ 
        error: 'Failed to process referral code',
        details: error instanceof Error ? error.message : 'Unknown database error'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Validation process failed:', error)
    return NextResponse.json({ 
      error: 'Failed to validate referral code',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 