import { NextResponse } from 'next/server'
import { initDB, validateReferralCode, trackReferralUse } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { isValidReferralCode, normalizeReferralCode } from '@/utils/referral'

// POST /api/validate-referral
export async function POST(request: Request) {
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

    const db = await initDB()
    const isValid = await validateReferralCode(db, normalizedCode)

    if (!isValid) {
      console.log('Invalid referral code:', {
        code: normalizedCode,
        userId
      })
      return NextResponse.json({ 
        error: 'Invalid referral code',
        details: 'Code does not exist in the system'
      }, { status: 400 })
    }

    console.log('Valid referral code, tracking usage:', {
      code: normalizedCode,
      userId
    })

    // Track the referral code usage
    const tracked = await trackReferralUse(db, normalizedCode, userId)
    if (!tracked) {
      console.log('Failed to track referral usage:', {
        code: normalizedCode,
        userId
      })
      return NextResponse.json({ 
        error: 'Failed to track referral usage',
        details: 'Database error while tracking usage'
      }, { status: 500 })
    }

    console.log('Successfully validated and tracked referral code:', {
      code: normalizedCode,
      userId
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error validating referral code:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 