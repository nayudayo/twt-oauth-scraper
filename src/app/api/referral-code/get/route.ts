import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db'

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
    
    // Get the user's referral code from the referral_codes table
    const result = await db.get(`
      SELECT code 
      FROM referral_codes 
      WHERE owner_user_id = ?
      ORDER BY created_at DESC 
      LIMIT 1
    `, userId)

    if (!result) {
      return NextResponse.json({ referralCode: null })
    }

    return NextResponse.json({ referralCode: result.code })

  } catch (error) {
    console.error('Error fetching referral code:', error)
    return NextResponse.json(
      { error: 'Failed to fetch referral code' },
      { status: 500 }
    )
  }
} 