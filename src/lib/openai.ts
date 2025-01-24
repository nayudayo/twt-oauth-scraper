import OpenAI from 'openai'
import { Tweet, OpenAITwitterProfile } from '@/types/scraper'

function ensureString(value: string | null | undefined, defaultValue: string = 'Not provided'): string {
  if (!value) return defaultValue
  return value
}

export interface AnalysisSettings {
  temperature: number
  maxTokens: number
  model: 'gpt-3.5-turbo' | 'gpt-4'
  focus: 'general' | 'professional' | 'social' | 'academic'
}

export interface PersonalityAnalysis {
  summary: string
  traits: {
    name: string
    score: number
    explanation: string
  }[]
  interests: string[]
  communicationStyle: {
    formality: number
    enthusiasm: number
    technicalLevel: number
    emojiUsage: number
    description: string  // Overall description of communication style
  }
  topicsAndThemes: string[]  // Additional context about recurring themes
  emotionalTone: string      // Description of emotional expression
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const CHUNK_SIZE = 50 // Fixed chunk size for analysis
const MIN_WORDS = 5 // Minimum words required for a tweet to be analyzed

function chunkTweets(tweets: Tweet[]): Tweet[][] {
  const chunks: Tweet[][] = []
  let currentChunk: Tweet[] = []

  for (const tweet of tweets) {
    if (currentChunk.length >= CHUNK_SIZE) {
      chunks.push(currentChunk)
      currentChunk = []
    }
    currentChunk.push(tweet)
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

function countWords(text: string | null): number {
  if (!text) return 0
  return text.trim().split(/\s+/).length
}

export async function analyzePersonality(
  tweets: Tweet[], 
  profile: OpenAITwitterProfile,
  prompt?: string,
  context?: string
): Promise<PersonalityAnalysis | { response: string }> {
  // Filter out tweets with less than MIN_WORDS words
  const validTweets = tweets.filter((t): t is Tweet & { text: string } => 
    typeof t.text === 'string' && 
    t.text.length > 0 && 
    countWords(t.text) >= MIN_WORDS
  )

  // Chunk the tweets for analysis
  const tweetChunks = chunkTweets(validTweets)
  let combinedAnalysis: PersonalityAnalysis = {
    summary: '',
    traits: [],
    interests: [],
    communicationStyle: {
      formality: 50,
      enthusiasm: 50,
      technicalLevel: 50,
      emojiUsage: 50,
      description: ''
    },
    topicsAndThemes: [],
    emotionalTone: ''
  }

  // Analyze each chunk
  for (const chunk of tweetChunks) {
    const tweetTexts = chunk.map(t => t.text).join('\n')
    
    const profileInfo = `Name: ${ensureString(profile.name)}
Bio: ${ensureString(profile.bio)}
Followers: ${ensureString(profile.followersCount)}
Following: ${ensureString(profile.followingCount)}`

    // If it's a custom prompt, use a different format
    const promptText = prompt && context ? 
      `Based on the following Twitter profile and tweets, ${prompt.toLowerCase()}
      
Context: ${context}

Profile Information:
${profileInfo}

Tweet History:
${tweetTexts}

Provide a detailed analysis focusing specifically on this aspect of their personality.` :
      `Analyze the following Twitter profile and tweets to create a detailed personality profile for AI character creation.

Profile Information:
${profileInfo}

Tweet History:
${tweetTexts}

Create a personality analysis in the following format:

1. Summary (2-3 sentences):
A concise description of their personality, communication style, and main interests.

2. Core Personality Traits (4-6 traits):
List key traits with scores (0-10) and brief explanations
Format: [Trait] [Score]/10 - [One-sentence explanation]
Example:
Openness 8/10 - Shows high curiosity and interest in new ideas
Enthusiasm 7/10 - Frequently expresses excitement about topics

3. Primary Interests (3-5):
List their main interests/topics they engage with most
Format as bullet points
Example:
- Artificial Intelligence
- Software Development
- Gaming

4. Communication Style Analysis:
Please rate the following aspects from 0-100:
- Formality: [0=extremely casual, 100=highly formal]
- Enthusiasm: [0=very reserved, 100=highly enthusiastic]
- Technical Level: [0=non-technical, 100=highly technical]
- Emoji Usage: [0=never uses emojis, 100=frequent emoji use]

Focus on being accurate and concise. Base all analysis strictly on the provided tweets.`

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert personality analyst specializing in creating accurate personality profiles for AI character development. Focus on clear, actionable insights that can be used to create a conversational AI character."
          },
          {
            role: "user",
            content: promptText
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })

      const response = completion.choices[0].message.content
      if (!response) {
        throw new Error('OpenAI returned empty response')
      }

      // If it's a custom prompt, return just the response
      if (prompt && context) {
        return { response }
      }

      // Parse the response and merge with previous chunks
      const chunkAnalysis = parseAnalysisResponse(response)
      combinedAnalysis = mergeAnalyses(combinedAnalysis, chunkAnalysis)
    } catch (error) {
      console.error('Error analyzing personality:', error)
      throw error
    }
  }

  return combinedAnalysis
}

function parseAnalysisResponse(response: string): PersonalityAnalysis {
  const analysis: PersonalityAnalysis = {
    summary: '',
    traits: [],
    interests: [],
    communicationStyle: {
      formality: 50,
      enthusiasm: 50,
      technicalLevel: 50,
      emojiUsage: 50,
      description: ''
    },
    topicsAndThemes: [],
    emotionalTone: ''
  }

  try {
    const sections = response.split('\n\n')
    
    for (const section of sections) {
      if (section.includes('Summary')) {
        analysis.summary = section.split('\n').slice(1).join(' ').trim()
      }
      else if (section.includes('Core Personality Traits')) {
        const traitLines = section.split('\n').slice(1)
        for (const line of traitLines) {
          const match = line.match(/(\w+)\s+(\d+)\/10\s*-\s*(.+)/)
          if (match) {
            analysis.traits.push({
              name: match[1],
              score: parseInt(match[2]),
              explanation: match[3].trim()
            })
          }
        }
      }
      else if (section.includes('Primary Interests')) {
        const interestLines = section.split('\n').slice(1)
        analysis.interests = interestLines
          .filter(line => line.startsWith('-'))
          .map(line => line.replace('-', '').trim())
      }
      else if (section.includes('Communication Style Analysis')) {
        // First get the numerical scores
        const styleLines = section.split('\n').slice(1)
        const descriptionParts = []
        
        for (const line of styleLines) {
          if (line.includes('Formality:')) {
            const match = line.match(/Formality:\s*(\d+)/)
            if (match) {
              analysis.communicationStyle.formality = parseInt(match[1])
              descriptionParts.push(`Formality level: ${match[1]}/100`)
            }
          }
          else if (line.includes('Enthusiasm:')) {
            const match = line.match(/Enthusiasm:\s*(\d+)/)
            if (match) {
              analysis.communicationStyle.enthusiasm = parseInt(match[1])
              descriptionParts.push(`Enthusiasm level: ${match[1]}/100`)
            }
          }
          else if (line.includes('Technical Level:')) {
            const match = line.match(/Technical Level:\s*(\d+)/)
            if (match) {
              analysis.communicationStyle.technicalLevel = parseInt(match[1])
              descriptionParts.push(`Technical level: ${match[1]}/100`)
            }
          }
          else if (line.includes('Emoji Usage:')) {
            const match = line.match(/Emoji Usage:\s*(\d+)/)
            if (match) {
              analysis.communicationStyle.emojiUsage = parseInt(match[1])
              descriptionParts.push(`Emoji usage: ${match[1]}/100`)
            }
          }
        }
        
        // Combine into a descriptive string
        analysis.communicationStyle.description = descriptionParts.join('. ')
      }
      else if (section.toLowerCase().includes('topics and themes')) {
        analysis.topicsAndThemes = section.split('\n')
          .slice(1)
          .filter(line => line.startsWith('-'))
          .map(line => line.replace('-', '').trim())
      }
      else if (section.toLowerCase().includes('emotional tone')) {
        analysis.emotionalTone = section.split(':')[1]?.trim() || ''
      }
    }
  } catch (error) {
    console.error('Error parsing analysis response:', error)
  }

  return analysis
}

function mergeAnalyses(a: PersonalityAnalysis, b: PersonalityAnalysis): PersonalityAnalysis {
  return {
    summary: a.summary + (a.summary && b.summary ? ' ' : '') + b.summary,
    traits: mergeTraits(a.traits, b.traits),
    interests: [...new Set([...a.interests, ...b.interests])],
    communicationStyle: {
      formality: Math.round((a.communicationStyle.formality + b.communicationStyle.formality) / 2),
      enthusiasm: Math.round((a.communicationStyle.enthusiasm + b.communicationStyle.enthusiasm) / 2),
      technicalLevel: Math.round((a.communicationStyle.technicalLevel + b.communicationStyle.technicalLevel) / 2),
      emojiUsage: Math.round((a.communicationStyle.emojiUsage + b.communicationStyle.emojiUsage) / 2),
      description: a.communicationStyle.description + (a.communicationStyle.description && b.communicationStyle.description ? ' ' : '') + b.communicationStyle.description
    },
    topicsAndThemes: [...new Set([...a.topicsAndThemes, ...b.topicsAndThemes])],
    emotionalTone: a.emotionalTone + (a.emotionalTone && b.emotionalTone ? ' ' : '') + b.emotionalTone
  }
}

function mergeTraits(a: PersonalityAnalysis['traits'], b: PersonalityAnalysis['traits']): PersonalityAnalysis['traits'] {
  const traitMap = new Map<string, { score: number, count: number, explanations: string[] }>()

  // Process all traits
  for (const trait of [...a, ...b]) {
    const existing = traitMap.get(trait.name)
    if (existing) {
      existing.score += trait.score
      existing.count += 1
      existing.explanations.push(trait.explanation)
    } else {
      traitMap.set(trait.name, {
        score: trait.score,
        count: 1,
        explanations: [trait.explanation]
      })
    }
  }

  // Calculate averages and combine explanations
  return Array.from(traitMap.entries()).map(([name, data]) => ({
    name,
    score: Math.round(data.score / data.count),
    explanation: data.explanations.join(' ')
  }))
} 