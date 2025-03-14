import { NextResponse } from 'next/server'
import { Tweet, TwitterProfile } from '@/types/scraper'
import { OpenAIQueueManager } from '@/lib/queue/openai-queue'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { CommunicationLevel, PersonalityAnalysis } from '@/lib/openai'

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
    
    // Validate input data
    if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
      return NextResponse.json({ error: 'Invalid or empty tweets data' }, { status: 400 })
    }

    if (!profile || !profile.name) {
      return NextResponse.json({ error: 'Invalid profile data' }, { status: 400 })
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
          prompt: prompt || undefined,
          context: context || undefined
        },
        session.username,
        (result) => {
          // Convert numeric values to boolean if needed
          if (result && typeof result === 'object' && 'communicationStyle' in result) {
            const style = (result as PersonalityAnalysis).communicationStyle;
            if (style) {
              style.formality = style.formality as CommunicationLevel;
              style.enthusiasm = style.enthusiasm as CommunicationLevel;
              style.technicalLevel = style.technicalLevel as CommunicationLevel;
              style.emojiUsage = style.emojiUsage as CommunicationLevel;
            }
          }
          resolve(result);
        },
        reject
      )
    }).catch(error => {
      console.error('Analysis error:', error)
      throw error
    })

    // Validate the analysis response
    if (!analysis || typeof analysis !== 'object') {
      throw new Error('Invalid analysis response from OpenAI')
    }

    return NextResponse.json(analysis)
  } catch (error) {
    console.error('Error in analyze route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze personality' },
      { status: 500 }
    )
  }
} 