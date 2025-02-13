import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db/index'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
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
    
    // Get the user's referral stats which includes their codes
    const referralStats = await db.getReferralStats(user.id)
    
    // Get the most recent code if any exist
    const mostRecentCode = referralStats.codes.length > 0 
      ? referralStats.codes[referralStats.codes.length - 1].code 
      : null

    // Also get the code from funnel progress as backup
    const progress = await db.getFunnelProgress(user.id)
    const generatedCode = progress?.command_responses?.['GENERATE_REFERRAL']

    // Return the most recent code or the generated code from progress
    return NextResponse.json({ 
      referralCode: mostRecentCode || generatedCode || null 
    })

  } catch (error) {
    console.error('Error fetching referral code:', error)
    return NextResponse.json(
      { error: 'Failed to fetch referral code' },
      { status: 500 }
    )
  }
} 