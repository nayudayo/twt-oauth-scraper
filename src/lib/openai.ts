import OpenAI from 'openai'
import { Tweet } from '@/types/scraper'

function ensureString(value: string | null | undefined, defaultValue: string = 'Not provided'): string {
  if (!value) return defaultValue
  return value
}

interface TwitterProfile {
  name: string | null
  bio: string | null
  followersCount: string | null
  followingCount: string | null
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
  communicationStyle: string
  topicsAndThemes: string[]
  emotionalTone: string
  recommendations: string[]
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function analyzePersonality(
  tweets: Tweet[], 
  profile: TwitterProfile,
  prompt?: string,
  context?: string
): Promise<PersonalityAnalysis | { response: string }> {
  // Prepare the content for analysis
  const validTweets = tweets.filter((t): t is Tweet & { text: string } => 
    typeof t.text === 'string' && t.text.length > 0
  )
  const tweetTexts = validTweets.map(t => t.text).join('\n')
    
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
    `Analyze the following Twitter profile and tweets to create a detailed personality analysis. 
Profile Information:
${profileInfo}

Tweet History:
${tweetTexts}

Create a personality analysis in the following format:

1. Summary:
A brief summary of the person (2-3 sentences)

2. Personality Traits:
List 4-6 key traits with scores and explanations
Example format:
Openness 8/10 - Shows high curiosity and interest in new ideas
Enthusiasm 7/10 - Frequently expresses excitement about topics

3. Interests & Topics:
List 5-8 clear interests/topics they frequently engage with
Format each interest on a new line with a bullet point
Example:
- Cryptocurrency Trading
- NFT Collections
- Blockchain Technology

4. Communication Style:
Describe their typical way of expressing themselves (2-3 sentences)

5. Topics & Themes:
List recurring topics/themes in their tweets
Format as bullet points

6. Emotional Tone:
Describe their emotional expression style (1-2 sentences)

7. Recommendations:
List 3-4 specific ways to engage with this person
Format as bullet points

Focus on being insightful but respectful. Avoid making assumptions about personal details not evident in the data.
Ensure each section is clearly formatted and separated by newlines.`

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert personality analyst specializing in social media behavior analysis. Provide detailed, professional, and respectful insights."
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

    // Otherwise parse the response into structured format
    const analysis = parseAnalysisResponse(response)
    return analysis
  } catch (error) {
    console.error('Error analyzing personality:', error)
    throw error
  }
}

function parseAnalysisResponse(response: string): PersonalityAnalysis {
  // Default structure
  const analysis: PersonalityAnalysis = {
    summary: '',
    traits: [],
    interests: [],
    communicationStyle: '',
    topicsAndThemes: [],
    emotionalTone: '',
    recommendations: []
  }

  try {
    // Split response into sections
    const sections = response.split('\n\n')
    
    sections.forEach(section => {
      if (section.includes('summary') || section.includes('Summary')) {
        analysis.summary = section.split(':')[1]?.trim() || ''
      }
      else if (section.toLowerCase().includes('personality traits')) {
        const traits = section.split('\n').slice(1)
        traits.forEach(trait => {
          const match = trait.match(/(\w+).*?(\d+).*?-\s*(.*)/)
          if (match) {
            analysis.traits.push({
              name: match[1],
              score: parseInt(match[2]),
              explanation: match[3].trim()
            })
          }
        })
      }
      else if (section.toLowerCase().includes('interests')) {
        analysis.interests = section.split('\n')
          .slice(1)
          .map(i => i.replace(/^[•-]\s*/, '').trim())
          .filter(Boolean)
      }
      else if (section.toLowerCase().includes('communication style')) {
        analysis.communicationStyle = section.split(':')[1]?.trim() || ''
      }
      else if (section.toLowerCase().includes('topics and themes')) {
        analysis.topicsAndThemes = section.split('\n')
          .slice(1)
          .map(t => t.replace(/^[•-]\s*/, '').trim())
          .filter(Boolean)
      }
      else if (section.toLowerCase().includes('emotional tone')) {
        analysis.emotionalTone = section.split(':')[1]?.trim() || ''
      }
      else if (section.toLowerCase().includes('recommendations')) {
        analysis.recommendations = section.split('\n')
          .slice(1)
          .map(r => r.replace(/^[•-]\s*/, '').trim())
          .filter(Boolean)
      }
    })

    return analysis
  } catch (error) {
    console.error('Error parsing analysis response:', error)
    return analysis
  }
} 