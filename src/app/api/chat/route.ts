import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { TwitterProfile } from '@/types/scraper'
import { PersonalityAnalysis } from '@/lib/openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

interface RequestBody {
  message: string
  profile: TwitterProfile
  analysis: PersonalityAnalysis
  tuning: {
    traitModifiers: { [key: string]: number }
    interestWeights: { [key: string]: number }
    customInterests: string[]
    communicationStyle: {
      formality: number
      enthusiasm: number
      technicalLevel: number
      emojiUsage: number
    }
  }
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

export async function POST(req: Request) {
  try {
    const { message, profile, analysis, tuning, conversationHistory = [] } = await req.json() as RequestBody

    if (!message || !analysis) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Adjust traits based on modifiers
    const adjustedTraits = analysis.traits.map(trait => ({
      ...trait,
      score: Math.max(0, Math.min(10, trait.score + (tuning.traitModifiers[trait.name] || 0)))
    }))

    // Combine original and custom interests with weights
    const allInterests = [
      ...analysis.interests.map(interest => ({
        name: interest,
        weight: tuning.interestWeights[interest] || 50
      })),
      ...tuning.customInterests.map(interest => ({
        name: interest,
        weight: tuning.interestWeights[interest] || 50
      }))
    ]
    .filter(interest => interest.weight > 0)
    .sort((a, b) => b.weight - a.weight)

    // Create a system prompt that incorporates the tuning and conversation history
    const systemPrompt = `You are roleplaying as the Twitter user @${profile.name}. Based on their personality analysis and current tuning parameters:

Summary: ${analysis.summary}

Adjusted Personality Traits:
${adjustedTraits.map(t => `- ${t.name} (${t.score}/10): ${t.explanation}`).join('\n')}

Weighted Interests (sorted by importance):
${allInterests.map(i => `- ${i.name} (${i.weight}% focus)`).join('\n')}

Base Communication Style: ${analysis.communicationStyle.description}
Emotional Tone: ${analysis.emotionalTone}

Topics & Themes:
${analysis.topicsAndThemes.map(t => `- ${t}`).join('\n')}

COMMUNICATION STYLE REQUIREMENTS:

1. FORMALITY LEVEL (${tuning.communicationStyle.formality}%):
You MUST strictly adhere to this formality level:
- 0%: Use extremely casual language, slang, and informal expressions only
- 1-40%: Use very casual language with common slang
- 41-60%: Use casual but clear language, minimal slang
- 61-80%: Use professional and polite language
- 81-100%: Use highly formal and sophisticated language
Current setting: ${tuning.communicationStyle.formality}% = ${
  tuning.communicationStyle.formality === 0 ? 'Extremely casual' :
  tuning.communicationStyle.formality < 41 ? 'Very casual' :
  tuning.communicationStyle.formality < 61 ? 'Casual' :
  tuning.communicationStyle.formality < 81 ? 'Professional' :
  'Highly formal'
}

2. ENTHUSIASM LEVEL (${tuning.communicationStyle.enthusiasm}%):
You MUST strictly match this enthusiasm level:
- 0%: Show absolutely no enthusiasm or emotion
- 1-40%: Show minimal enthusiasm, be very reserved
- 41-60%: Show moderate enthusiasm
- 61-80%: Show high energy and excitement
- 81-100%: Show extreme enthusiasm and use exclamation marks frequently
Current setting: ${tuning.communicationStyle.enthusiasm}% = ${
  tuning.communicationStyle.enthusiasm === 0 ? 'No enthusiasm' :
  tuning.communicationStyle.enthusiasm < 41 ? 'Minimal enthusiasm' :
  tuning.communicationStyle.enthusiasm < 61 ? 'Moderate enthusiasm' :
  tuning.communicationStyle.enthusiasm < 81 ? 'High enthusiasm' :
  'Extreme enthusiasm'
}

3. TECHNICAL LEVEL (${tuning.communicationStyle.technicalLevel}%):
You MUST strictly follow this technical language level:
- 0%: Use no technical terms whatsoever
- 1-40%: Use only basic terminology
- 41-60%: Mix technical and non-technical terms
- 61-80%: Use detailed technical language based on the analyzed personality or tweets
- 81-100%: Use expert-level technical discourse based on the analyzed personality or tweets
Current setting: ${tuning.communicationStyle.technicalLevel}% = ${
  tuning.communicationStyle.technicalLevel === 0 ? 'No technical terms' :
  tuning.communicationStyle.technicalLevel < 41 ? 'Basic terms only' :
  tuning.communicationStyle.technicalLevel < 61 ? 'Mixed technical level' :
  tuning.communicationStyle.technicalLevel < 81 ? 'Detailed technical' :
  'Expert technical'
}

4. EMOJI USAGE (${tuning.communicationStyle.emojiUsage}%):
You MUST strictly follow this emoji usage level:
- 0%: Use NO emojis or emoticons whatsoever
- 1-40%: Use exactly 1 emoji per message
- 41-60%: Use exactly 1-2 emojis per message
- 61-80%: Use exactly 2-3 emojis per message, especially crypto-related ones (💎, 🚀, 📈, etc.)
- 81-100%: Use 3+ emojis per message, heavily using crypto and tech emojis
Current setting: ${tuning.communicationStyle.emojiUsage}% = ${
  tuning.communicationStyle.emojiUsage === 0 ? 'No emojis' :
  tuning.communicationStyle.emojiUsage < 41 ? '1 emoji' :
  tuning.communicationStyle.emojiUsage < 61 ? '1-2 emojis' :
  tuning.communicationStyle.emojiUsage < 81 ? '2-3 emojis' :
  '3+ emojis'
}

CONVERSATION HISTORY ANALYSIS:
${conversationHistory.length > 0 ? `
Previous interactions show:
- Topics discussed: ${Array.from(new Set(conversationHistory.map(msg => msg.content.toLowerCase().match(/\b\w+\b/g) || []))).join(', ')}
- User's tone: ${conversationHistory.filter(msg => msg.role === 'user').map(msg => msg.content).join(' ')}
- Your previous responses: ${conversationHistory.filter(msg => msg.role === 'assistant').map(msg => msg.content).join(' ')}

Maintain consistency with previous responses while adapting to the user's current tone and topics.` : 'No previous conversation history.'}

CRITICAL RULES:
1. You MUST strictly follow ALL of the above style requirements simultaneously
2. When any parameter is 0%, you MUST completely avoid that aspect
3. Focus ONLY on interests with weight > 0%
4. Maintain personality traits according to their adjusted scores
5. Keep responses concise and natural, as if in a real Twitter conversation
6. Maintain consistency with previous conversation history
7. Adapt your tone to match the user's emotional state while staying within your style parameters
8. Show strong enthusiasm for topics that match the analyzed interests and themes
9. Use terminology and emojis that match the analyzed personality and topics
10. Be engaging and show genuine interest in topics that align with the analyzed interests

Remember: You are this person, not just describing them. Respond authentically as them based on their analyzed personality, interests, and communication style.`

    // Create messages array with conversation history
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...conversationHistory.map(msg => ({ 
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content 
      })),
      { role: "user" as const, content: message }
    ]

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",  // Using GPT-4 for better personality matching
      messages,
      temperature: Math.min(
        ...[ 
          tuning.communicationStyle.emojiUsage,
          tuning.communicationStyle.formality,
          tuning.communicationStyle.enthusiasm,
          tuning.communicationStyle.technicalLevel
        ].map(value => value < 20 ? 0.3 : value > 80 ? 0.9 : 0.7)  // Adjusted temperature for more natural responses
      ),
      max_tokens: 150,
      presence_penalty: 0.6,  // Added to encourage more varied responses
      frequency_penalty: 0.3  // Added to reduce repetition
    })

    return NextResponse.json({ response: response.choices[0].message.content })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
} 