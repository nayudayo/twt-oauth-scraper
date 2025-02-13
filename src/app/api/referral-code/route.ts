import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db/index'
import { getServerSession } from 'next-auth'
import { generateReferralCode } from '@/utils/referral'
import { authOptions } from '@/lib/auth/config'
import { extractSolanaAddress } from '@/utils/solana'

// POST /api/referral-code
export async function POST(req: NextRequest) {
  try {
    // Get and validate session
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      console.error('No session or user found:', { session })
      return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 })
    }

    const body = await req.json()
    const { userId } = body

    if (!userId) {
      console.error('No userId provided in request body')
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Get the session username from either location
    const sessionUsername = session.username || session.user.name
    if (!sessionUsername) {
      console.error('No username in session:', { session })
      return NextResponse.json({ error: 'No username found in session' }, { status: 401 })
    }

    // Verify the user is creating their own referral code
    if (userId !== sessionUsername) {
      console.error('User ID mismatch:', { userId, sessionUsername })
      return NextResponse.json({ error: 'Unauthorized - User mismatch' }, { status: 401 })
    }

    const db = await initDB()

    // First get or create user
    let user = await db.getUserByUsername(userId)
    if (!user) {
      console.log('Creating new user:', userId)
      user = await db.createUser({
        username: userId,
        created_at: new Date()
      })
      console.log('Created new user:', user)
    }

    // Get funnel progress to get the wallet address
    const progress = await db.getFunnelProgress(user.id)
    if (!progress || !progress.command_responses) {
      console.error('No funnel progress found:', { userId })
      return NextResponse.json({ error: 'Funnel progress not found' }, { status: 400 })
    }

    // Find the wallet address in command responses
    const walletCommand = Object.entries(progress.command_responses)
      .find(([key]) => key.includes('SOL_WALLET'))?.[1]

    if (!walletCommand) {
      console.error('No wallet address found:', { 
        userId, 
        hasProgress: !!progress,
        commandResponses: progress.command_responses 
      })
      return NextResponse.json({ error: 'Wallet address not found in funnel progress' }, { status: 400 })
    }

    // Extract the wallet address from the command
    const walletAddress = extractSolanaAddress(walletCommand)
    if (!walletAddress) {
      console.error('Failed to extract wallet address from command:', { walletCommand })
      return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 })
    }

    // Generate referral code using username and wallet address
    const referralCode = generateReferralCode(userId, walletAddress)
    console.log('Generated referral code:', { userId, referralCode, walletAddress })

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
    return NextResponse.json({ 
      error: 'Failed to create referral code',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 