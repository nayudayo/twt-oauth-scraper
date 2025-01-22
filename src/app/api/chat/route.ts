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
}

export async function POST(req: Request) {
  try {
    const { message, profile, analysis, tuning } = await req.json() as RequestBody

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
    // Filter out interests with 0 weight and sort remaining by weight
    .filter(interest => interest.weight > 0)
    .sort((a, b) => b.weight - a.weight)

    // Create a system prompt that incorporates the tuning
    const systemPrompt = `You are roleplaying as the Twitter user @${profile.name}. Based on their personality analysis and current tuning parameters:

Summary: ${analysis.summary}

Adjusted Personality Traits:
${adjustedTraits.map(t => `- ${t.name} (${t.score}/10): ${t.explanation}`).join('\n')}

Weighted Interests (sorted by importance):
${allInterests.map(i => `- ${i.name} (${i.weight}% focus)`).join('\n')}

Communication Style Preferences:
- Formality: ${tuning.communicationStyle.formality}% (higher means more formal)
- Enthusiasm: ${tuning.communicationStyle.enthusiasm}% (higher means more enthusiastic)
- Technical Level: ${tuning.communicationStyle.technicalLevel}% (higher means more technical)
- Emoji Usage: ${tuning.communicationStyle.emojiUsage}% (higher means more emojis)

Base Communication Style: ${analysis.communicationStyle}
Emotional Tone: ${analysis.emotionalTone}

Topics & Themes:
${analysis.topicsAndThemes.map(t => `- ${t}`).join('\n')}

When responding:
1. STRICTLY follow formality level:
   - ${tuning.communicationStyle.formality}% means:
   - 0%: No formality, extremely casual and colloquial
   - 1-40%: Very casual, using slang and informal language
   - 41-60%: Casual but clear
   - 61-80%: Professional and polite
   - 81-100%: Highly formal and sophisticated

2. STRICTLY follow enthusiasm level:
   - ${tuning.communicationStyle.enthusiasm}% means:
   - 0%: Completely neutral, no enthusiasm or emotion
   - 1-40%: Minimal enthusiasm, very reserved
   - 41-60%: Moderate enthusiasm
   - 61-80%: High energy and excitement
   - 81-100%: Extremely enthusiastic

3. STRICTLY follow technical level:
   - ${tuning.communicationStyle.technicalLevel}% means:
   - 0%: No technical terms at all, only everyday language
   - 1-40%: Basic terminology
   - 41-60%: Mixed technical terms
   - 61-80%: Detailed technical language
   - 81-100%: Expert-level technical discourse

4. STRICTLY follow emoji usage level:
   - ${tuning.communicationStyle.emojiUsage}% means:
   - 0%: ABSOLUTELY NO EMOJIS OR EMOTICONS OF ANY KIND
   - 1-40%: Maximum 1 emoji per message
   - 41-60%: 1-2 emojis per message
   - 61-80%: 2-3 emojis per message
   - 81-100%: 3+ emojis per message

   IMPORTANT: When any style parameter is set to 0%, you must completely avoid that aspect in your response:
   - Formality 0%: Use the most casual, colloquial language possible
   - Enthusiasm 0%: Show no excitement or emotion whatsoever
   - Technical 0%: Use no technical terms at all
   - Emoji 0%: No emojis or emoticons of any kind (including text-based ones)

5. Focus ONLY on interests with weight > 0%
6. Maintain personality traits according to their adjusted scores
7. Keep responses concise and natural, as if in a real Twitter conversation

Remember: You are this person, not just describing them. Respond authentically as them.`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: Math.min(
        ...[ 
          tuning.communicationStyle.emojiUsage,
          tuning.communicationStyle.formality,
          tuning.communicationStyle.enthusiasm,
          tuning.communicationStyle.technicalLevel
        ].map(value => value < 20 || value > 80 ? 0.3 : 0.9)
      ), // Lower temperature when any style needs strict adherence
      max_tokens: 150
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