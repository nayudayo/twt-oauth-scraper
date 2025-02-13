import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db/index'

// POST /api/validate-referral
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, referralCode } = body

    if (!userId || !referralCode) {
      return NextResponse.json({ error: 'User ID and referral code are required' }, { status: 400 })
    }

    // Special case for "NO"
    if (referralCode.toUpperCase() === 'NO') {
      return NextResponse.json({ success: true })
    }

    const db = await initDB()

    // First validate the code exists in database
    const isValid = await db.validateReferralCode(referralCode)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })
    }

    // Get referral code details
    const referralCodes = await db.getReferralStats(userId)
    const code = referralCodes.codes.find(c => c.code === referralCode)
    if (!code) {
      return NextResponse.json({ error: 'Referral code not found' }, { status: 400 })
    }

    // Prevent self-referral
    if (code.owner_user_id === userId) {
      return NextResponse.json({ error: 'Cannot use your own referral code' }, { status: 400 })
    }

    try {
      // Track the usage in a transaction
      await db.trackReferralUse({
        id: 0, // Will be auto-generated
        referral_code: referralCode,
        referrer_user_id: code.owner_user_id,
        referred_user_id: userId,
        used_at: new Date()
      })

      // Also log the usage
      await db.logReferralUsage({
        id: 0, // Will be auto-generated
        referral_code: referralCode,
        used_by_user_id: userId,
        used_at: new Date()
      })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Failed to track referral usage:', error)
      return NextResponse.json({ 
        error: 'Failed to track referral usage',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to validate referral code:', error)
    return NextResponse.json({ 
      error: 'Failed to validate referral code',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 