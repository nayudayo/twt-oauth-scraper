import { NextResponse } from 'next/server'
import { initDB, createReferralCode } from '@/lib/db'
import { getServerSession } from 'next-auth'

// POST /api/referral-code
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

    // Verify the user is creating their own referral code
    if (userId !== session.user.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = await initDB()
    const success = await createReferralCode(db, referralCode, userId)

    if (!success) {
      return NextResponse.json({ error: 'Failed to create referral code' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error creating referral code:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 