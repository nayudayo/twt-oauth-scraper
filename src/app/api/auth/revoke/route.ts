import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'

export async function POST() {
  try {
    // Get current session
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ success: true })
    }

    // Revoke Twitter OAuth token
    const response = await fetch('https://api.twitter.com/2/oauth2/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`
      },
      body: `token=${session.accessToken}&token_type_hint=access_token`
    })

    if (!response.ok) {
      console.error('Failed to revoke Twitter token:', await response.text())
      // Continue with logout even if revocation fails
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error revoking token:', error)
    // Return success anyway to ensure client proceeds with logout
    return NextResponse.json({ success: true })
  }
} 