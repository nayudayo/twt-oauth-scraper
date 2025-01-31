import { NextResponse } from 'next/server'
import { initDB, validateReferralCode, trackReferralUse } from '@/lib/db'
import { getServerSession } from 'next-auth'

// POST /api/validate-referral
export async function POST(request: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { userId, referralCode } = body

    if (!userId || !referralCode) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Verify the user is submitting their own referral
    if (userId !== session.user.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Special case for "NO" referral code
    if (referralCode === 'NO') {
      return NextResponse.json({ success: true })
    }

    const db = await initDB()
    const isValid = await validateReferralCode(db, referralCode)

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })
    }

    // Track the referral code usage
    await trackReferralUse(db, referralCode, userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error validating referral code:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 