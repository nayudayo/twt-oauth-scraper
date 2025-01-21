import { NextResponse } from 'next/server'
import { analyzePersonality } from '@/lib/openai'
import { Tweet, TwitterProfile } from '@/types/scraper'

export async function POST(req: Request) {
  try {
    const { tweets, profile, prompt, context } = await req.json() as { 
      tweets: Tweet[]
      profile: TwitterProfile
      prompt?: string
      context?: string
    }
    
    if (!tweets || !Array.isArray(tweets)) {
      return NextResponse.json({ error: 'Invalid tweets data' }, { status: 400 })
    }

    const analysis = await analyzePersonality(tweets, profile, prompt, context)
    return NextResponse.json(analysis)
  } catch (error) {
    console.error('Error in analyze route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze personality' },
      { status: 500 }
    )
  }
} 