import { NextResponse } from 'next/server'
import { Tweet, TwitterProfile } from '@/types/scraper'
import { OpenAIQueueManager } from '@/lib/queue/openai-queue'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { CommunicationLevel, PersonalityAnalysis } from '@/lib/openai/types'
import { PersonalityTuning } from '@/types/scraper'
import { MissingInterestsError, MissingPsychoanalysisError, PersonalityAnalysisError } from '@/lib/openai/types'
import { initDB } from '@/lib/db'

export async function POST(req: Request) {
  try {
    // Log environment configuration (safely)
    console.log('[Analyze Route] Environment check:', {
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasOpenAIBaseURL: !!process.env.OPENAI_BASE_URL,
      openAIKeyLength: process.env.OPENAI_API_KEY?.length || 0
    });

    // Get user session for rate limiting
    const session = await getServerSession(authOptions)
    if (!session?.username) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { tweets, profile, prompt, context, currentTuning } = await req.json() as { 
      tweets: Tweet[]
      profile: TwitterProfile
      prompt?: string
      context?: string
      currentTuning?: PersonalityTuning
    }
    
    // Log analysis request details (safely)
    console.log('[Analyze Route] Processing request:', {
      username: session.username,
      tweetCount: tweets.length,
      hasPrompt: !!prompt,
      hasContext: !!context,
      hasTuning: !!currentTuning
    });
    
    // Validate input data
    if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
      return NextResponse.json({ error: 'Invalid or empty tweets data' }, { status: 400 })
    }

    if (!profile || !profile.name) {
      return NextResponse.json({ error: 'Invalid profile data' }, { status: 400 })
    }

    // Initialize database and get/create user
    const db = await initDB();
    let user = await db.getUserByUsername(session.username);
    if (!user) {
      user = await db.createUser({
        username: session.username,
        twitter_username: session.username,
        created_at: new Date()
      });
    }

    // Update last analysis time
    await db.updateLastOperationTime(user.id, 'analyze');

    // Get queue instance
    const queue = OpenAIQueueManager.getInstance()

    // Create a promise to handle the queued request
    const analysis = await new Promise((resolve, reject) => {
      // Ensure username is available (we already checked this at the start of the function)
      if (!session.username) {
        reject(new Error('User session not found'))
        return
      }

      console.log('[Analyze Route] Enqueueing analysis request');

      queue.enqueueRequest(
        'analyze',
        {
          tweets,
          profile,
          prompt: prompt || undefined,
          context: context || undefined,
          currentTuning // Pass through current tuning
        },
        session.username,
        (result) => {
          console.log('[Analyze Route] Analysis completed successfully');
          // Convert numeric values to boolean if needed
          if (result && typeof result === 'object' && 'communicationStyle' in result) {
            const style = (result as PersonalityAnalysis).communicationStyle;
            if (style && currentTuning) {
              // Preserve existing communication style values if they exist
              style.formality = currentTuning.communicationStyle.formality;
              style.enthusiasm = currentTuning.communicationStyle.enthusiasm;
              style.technicalLevel = currentTuning.communicationStyle.technicalLevel;
              style.emojiUsage = currentTuning.communicationStyle.emojiUsage;
            } else {
              style.formality = style.formality as CommunicationLevel;
              style.enthusiasm = style.enthusiasm as CommunicationLevel;
              style.technicalLevel = style.technicalLevel as CommunicationLevel;
              style.emojiUsage = style.emojiUsage as CommunicationLevel;
            }
          }
          resolve(result);
        },
        (error) => {
          console.error('[Analyze Route] Analysis failed:', error);
          reject(error);
        }
      )
    }).catch(error => {
      console.error('[Analyze Route] Analysis promise error:', error)
      throw error
    })

    // Validate the analysis response
    if (!analysis || typeof analysis !== 'object') {
      throw new Error('Invalid analysis response from OpenAI')
    }

    return NextResponse.json(analysis)
  } catch (error: unknown) {
    console.error('[Analyze Route] Error in analyze route:', error)
    
    // Handle specific error types
    if (error instanceof MissingInterestsError) {
      return NextResponse.json(
        { error: 'Failed to generate interests after multiple attempts. Please try again.' },
        { status: 422 }
      )
    }
    
    if (error instanceof MissingPsychoanalysisError) {
      return NextResponse.json(
        { error: 'Failed to generate psychological analysis after multiple attempts. Please try again.' },
        { status: 422 }
      )
    }
    
    if (error instanceof PersonalityAnalysisError) {
      return NextResponse.json(
        { 
          error: 'Failed to generate complete personality analysis',
          missingFields: error.missingFields 
        },
        { status: 422 }
      )
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze personality' },
      { status: 500 }
    )
  }
} 