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
    console.log('Session check:', { 
      hasSession: !!session, 
      hasUser: !!session?.user,
      username: session?.username,
      userName: session?.user?.name 
    })

    if (!session?.user) {
      console.error('No session or user found:', { session })
      return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 })
    }

    const body = await req.json()
    const { userId } = body
    console.log('Request body:', { userId })

    if (!userId) {
      console.error('No userId provided in request body')
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Get the session username from either location
    const sessionUsername = session.username || session.user.name
    console.log('Username check:', { sessionUsername, userId })

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
    console.log('User lookup:', { 
      userId, 
      userFound: !!user,
      userData: user ? { 
        id: user.id, 
        username: user.username,
        created_at: user.created_at 
      } : null
    })

    if (!user) {
      console.log('Creating new user:', userId)
      user = await db.createUser({
        username: userId,
        created_at: new Date()
      })
      console.log('Created new user:', { 
        id: user.id, 
        username: user.username,
        created_at: user.created_at 
      })
    }

    // Get funnel progress to get the wallet address
    const progress = await db.getFunnelProgress(user.id)
    console.log('Funnel progress:', { 
      userId: user.id,
      hasProgress: !!progress,
      commandsFound: progress ? Object.keys(progress.command_responses || {}) : [],
      currentIndex: progress?.current_command_index
    })

    if (!progress || !progress.command_responses) {
      console.error('No funnel progress found:', { userId })
      return NextResponse.json({ error: 'Funnel progress not found' }, { status: 400 })
    }

    // Find the wallet address in command responses
    const walletCommand = Object.entries(progress.command_responses)
      .find(([key]) => key.includes('SOL_WALLET'))?.[1]
    console.log('Wallet command found:', { 
      walletCommand,
      allCommands: progress.command_responses
    })

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
    console.log('Extracted wallet:', { 
      walletCommand, 
      extractedAddress: walletAddress 
    })

    if (!walletAddress) {
      console.error('Failed to extract wallet address from command:', { walletCommand })
      return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 })
    }

    // Try to generate a unique code with retries
    let attempts = 0;
    const maxAttempts = 5;
    let referralCode;
    let existingCode;

    while (attempts < maxAttempts) {
      referralCode = generateReferralCode(userId, walletAddress, attempts)
      console.log('Generated referral code attempt:', { 
        attempt: attempts + 1,
        userId, 
        referralCode, 
        walletAddress,
        strategy: attempts === 0 ? 'first4' :
                  attempts === 1 ? 'last4' :
                  attempts === 2 ? 'middle4' :
                  attempts === 3 ? 'firstLast2' :
                  'random4'
      })

      // Check if code exists
      existingCode = await db.getReferralCodeDetails(referralCode)
      if (!existingCode) {
        // Code is unique, try to create it
        try {
          await db.createReferralCode({
            code: referralCode,
            owner_user_id: user.id,
            usage_count: 0,
            created_at: new Date()
          })
          console.log('Successfully created referral code:', {
            code: referralCode,
            owner_user_id: user.id,
            attempt: attempts + 1
          })
          break; // Success, exit loop
        } catch (dbError) {
          console.error('Failed to create code on attempt', attempts + 1, dbError);
          attempts++;
          continue; // Try next attempt
        }
      }
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.error('Failed to generate unique referral code after', maxAttempts, 'attempts');
      return NextResponse.json({ 
        error: 'Failed to generate unique referral code',
        details: 'Max attempts reached'
      }, { status: 500 })
    }

    return NextResponse.json({ success: true, referralCode })
  } catch (error) {
    console.error('Failed to create referral code:', {
      error,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      code: error instanceof Error && 'code' in error ? error.code : 'No code',
      stack: error instanceof Error ? error.stack : 'No stack'
    })
    return NextResponse.json({ 
      error: 'Failed to create referral code',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 