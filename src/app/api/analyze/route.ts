import { NextResponse } from 'next/server'
import { Tweet, TwitterProfile } from '@/types/scraper'
import { OpenAIQueueManager } from '@/lib/queue/openai-queue'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'

export async function POST(req: Request) {
  try {
    // Get user session for rate limiting
    const session = await getServerSession(authOptions)
    if (!session?.username) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { tweets, profile, prompt, context } = await req.json() as { 
      tweets: Tweet[]
      profile: TwitterProfile
      prompt?: string
      context?: string
    }
    
    if (!tweets || !Array.isArray(tweets)) {
      return NextResponse.json({ error: 'Invalid tweets data' }, { status: 400 })
    }

    // Get queue instance
    const queue = OpenAIQueueManager.getInstance()

    // Create a promise to handle the queued request
    const analysis = await new Promise((resolve, reject) => {
      // Ensure username is available (we already checked this at the start of the function)
      if (!session.username) {
        reject(new Error('User session not found'))
        return
      }

      queue.enqueueRequest(
        'analyze',
        {
          tweets,
          profile,
          prompt,
          context
        },
        session.username,
        resolve,
        reject
      )
    }).catch(error => {
      console.error('Analysis error:', error)
      throw error
    })

    return NextResponse.json(analysis)
  } catch (error) {
    console.error('Error in analyze route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze personality' },
      { status: 500 }
    )
  }
} 