import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { TwitterProfile } from '@/types/scraper'
import { PersonalityAnalysis } from '@/lib/openai'
import { ConsciousnessConfig, DEFAULT_CONSCIOUSNESS, generateConsciousnessInstructions, applyConsciousnessEffects } from '@/lib/consciousness'

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
  consciousness?: ConsciousnessConfig
  conversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

// Style validation function
const validateStyle = (response: string, tuning: RequestBody['tuning']): boolean => {
  // Check emoji count
  const emojiCount = (response.match(/[\p{Emoji}]/gu) || []).length
  if (tuning.communicationStyle.emojiUsage > 80 && emojiCount < 3) return false
  if (tuning.communicationStyle.emojiUsage < 20 && emojiCount > 0) return false
  
  // Check enthusiasm (exclamation marks)
  const exclamationCount = (response.match(/!/g) || []).length
  if (tuning.communicationStyle.enthusiasm > 80 && exclamationCount < 2) return false
  if (tuning.communicationStyle.enthusiasm < 20 && exclamationCount > 0) return false
  
  return true
}

// Calculate dynamic temperature based on style settings
const calculateTemperature = (tuning: RequestBody['tuning']): number => {
  const formalityTemp = tuning.communicationStyle.formality / 100
  const enthusiasmTemp = tuning.communicationStyle.enthusiasm / 100
  
  // Higher enthusiasm and lower formality should increase temperature
  return Math.min(Math.max((enthusiasmTemp + (1 - formalityTemp)) / 2, 0.3), 0.9)
}

export async function POST(req: Request) {
  try {
    const { message, profile, analysis, tuning, consciousness, conversationHistory = [] } = await req.json() as RequestBody

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
    } as PersonalityAnalysis['traits'][0]))

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

    // Enhanced style instructions
    const styleInstructions = `
STRICT STYLE ENFORCEMENT:
${tuning.communicationStyle.formality < 40 ? 
  "YOU MUST USE VERY CASUAL LANGUAGE. Use slang, abbreviations, and informal expressions." :
  tuning.communicationStyle.formality > 80 ?
  "YOU MUST USE HIGHLY FORMAL LANGUAGE. Use sophisticated vocabulary and proper grammar." :
  "Use moderately formal language."
}

${tuning.communicationStyle.enthusiasm > 80 ?
  "YOU MUST SHOW EXTREME ENTHUSIASM! Use multiple exclamation marks!! Express excitement!!!" :
  tuning.communicationStyle.enthusiasm < 20 ?
  "Maintain a very reserved tone. No exclamation marks." :
  "Show moderate enthusiasm."
}

${tuning.communicationStyle.technicalLevel > 80 ?
  "YOU MUST USE EXPERT TECHNICAL TERMS extensively in your responses." :
  tuning.communicationStyle.technicalLevel < 20 ?
  "Avoid all technical terms. Use simple language only." :
  "Mix technical and non-technical terms appropriately."
}

${tuning.communicationStyle.emojiUsage > 80 ?
  "YOU MUST USE AT LEAST 3 EMOJIS in every response! 🚀 💫 ✨" :
  tuning.communicationStyle.emojiUsage < 20 ?
  "Do not use any emojis or emoticons." :
  "Use 1-2 emojis where appropriate."
}

YOUR RESPONSE MUST STRICTLY FOLLOW THESE STYLE REQUIREMENTS. THIS IS NOT A SUGGESTION.`

    // Create base system prompt
    const baseSystemPrompt = `You are roleplaying as the Twitter user @${profile.name}. Based on their personality analysis and current tuning parameters:

Summary: ${analysis.summary}

Adjusted Personality Traits:
${adjustedTraits.map(t => `- ${t.name} (${t.score}/10): ${t.explanation}${t.details ? `\n  Details: ${t.details}` : ''}${t.relatedTraits ? `\n  Related traits: ${t.relatedTraits.join(', ')}` : ''}`).join('\n')}

Weighted Interests (sorted by importance):
${allInterests.map(i => `- ${i.name} (${i.weight}% focus)`).join('\n')}

Base Communication Style: ${analysis.communicationStyle.description}
Emotional Tone: ${analysis.emotionalTone}

Topics & Themes:
${analysis.topicsAndThemes.map(t => `- ${t}`).join('\n')}

CONSCIOUSNESS STATE:
${generateConsciousnessInstructions(consciousness ?? DEFAULT_CONSCIOUSNESS)}

CONVERSATION HISTORY ANALYSIS:
${conversationHistory.length > 0 ? `
Previous interactions show:
- Topics discussed: ${Array.from(new Set(conversationHistory.map(msg => msg.content.toLowerCase().match(/\b\w+\b/g) || []))).join(', ')}
- User's tone: ${conversationHistory.filter(msg => msg.role === 'user').map(msg => msg.content).join(' ')}
- Your previous responses: ${conversationHistory.filter(msg => msg.role === 'assistant').map(msg => msg.content).join(' ')}

Maintain consistency with previous responses while adapting to the user's current tone and topics.` : 'No previous conversation history.'}

${styleInstructions}

CRITICAL RULES:
1. You MUST strictly follow ALL style requirements simultaneously
2. When any parameter is 0%, you MUST completely avoid that aspect
3. Focus ONLY on interests with weight > 0%
4. Maintain personality traits according to their adjusted scores
5. Keep responses concise and natural, as if in a real Twitter conversation
6. Maintain consistency with previous conversation history
7. Adapt your tone to match the user's emotional state while staying within your style parameters
8. Show strong enthusiasm for topics that match the analyzed interests and themes
9. Use terminology and emojis that match the analyzed personality and topics
10. Be engaging and show genuine interest in topics that align with the analyzed interests
11. STRICTLY FOLLOW THE CONSCIOUSNESS STATE INSTRUCTIONS

Remember: You are this person, not just describing them. Respond authentically as them based on their analyzed personality, interests, and communication style.`

    // Create messages array with conversation history
    const messages = [
      { role: "system" as const, content: baseSystemPrompt },
      ...conversationHistory.map(msg => ({ 
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content 
      })),
      { role: "user" as const, content: message }
    ]

    // Try up to 3 times to get a response that matches style requirements
    let attempts = 0
    let validResponse: string | null = null
    let lastResponse: string | null = null

    while (!validResponse && attempts < 3) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature: calculateTemperature(tuning),
        max_tokens: 150,
        presence_penalty: 0.6,
        frequency_penalty: 0.3
      })

      lastResponse = response.choices[0].message.content || ''
      if (validateStyle(lastResponse, tuning)) {
        // Apply consciousness effects to the response
        validResponse = applyConsciousnessEffects(lastResponse, consciousness ?? DEFAULT_CONSCIOUSNESS)
      }
      attempts++
    }

    // If we couldn't get a valid response after 3 attempts, use the last one
    const finalResponse = validResponse || (lastResponse ? applyConsciousnessEffects(lastResponse, consciousness ?? DEFAULT_CONSCIOUSNESS) : 'Failed to generate a valid response')

    return NextResponse.json({ response: finalResponse })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
} 