import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { username, tweets } = await request.json()

    if (!username || !tweets) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const db = await initDB()

    // Get user ID first
    const user = await db.get('SELECT id FROM users WHERE username = ?', username)
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Start a transaction for batch insert
    await db.run('BEGIN TRANSACTION')

    try {
      // Prepare statement for better performance
      const stmt = await db.prepare(`
        INSERT OR REPLACE INTO tweets (
          id,
          user_id,
          text,
          created_at,
          url,
          is_reply,
          metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      // Insert each tweet
      for (const tweet of tweets) {
        await stmt.run([
          tweet.id,
          user.id,
          tweet.text,
          tweet.timestamp,
          tweet.url || null,
          tweet.isReply || false,
          tweet.metadata ? JSON.stringify(tweet.metadata) : null
        ])
      }

      // Finalize statement and commit transaction
      await stmt.finalize()
      await db.run('COMMIT')

      return NextResponse.json({ 
        success: true,
        savedCount: tweets.length
      })

    } catch (error) {
      // Rollback on error
      await db.run('ROLLBACK')
      throw error
    }

  } catch (error) {
    console.error('Error saving tweets:', error)
    return NextResponse.json(
      { error: 'Failed to save tweets' },
      { status: 500 }
    )
  }
} 