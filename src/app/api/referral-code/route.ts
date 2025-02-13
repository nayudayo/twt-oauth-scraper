import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db/index'
import { getServerSession } from 'next-auth'
import { generateReferralCode } from '@/utils/referral'

// POST /api/referral-code
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Get the session username from either location
    const sessionUsername = session.username || session.user.name
    if (!sessionUsername) {
      return NextResponse.json({ error: 'No username found in session' }, { status: 401 })
    }

    // Verify the user is creating their own referral code
    if (userId !== sessionUsername) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = await initDB()

    // First get or create user
    let user = await db.getUserByUsername(userId)
    if (!user) {
      user = await db.createUser({
        username: userId,
        created_at: new Date()
      })
      console.log('Created new user:', user)
    }

    // Get funnel progress to get the wallet address
    const progress = await db.getFunnelProgress(user.id)
    if (!progress || !progress.command_responses['SOL_WALLET']) {
      return NextResponse.json({ error: 'Wallet address not found in funnel progress' }, { status: 400 })
    }

    // Generate referral code using username and stored wallet address
    const walletAddress = progress.command_responses['SOL_WALLET']
    const referralCode = generateReferralCode(userId, walletAddress)
    console.log('Generated referral code:', referralCode)

    // Create referral code using the database user ID
    await db.createReferralCode({
      code: referralCode,
      owner_user_id: user.id,
      usage_count: 0,
      created_at: new Date()
    })

    return NextResponse.json({ success: true, referralCode })
  } catch (error) {
    console.error('Failed to create referral code:', error)
    return NextResponse.json({ error: 'Failed to create referral code' }, { status: 500 })
  }
} 