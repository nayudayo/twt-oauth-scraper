import { NextResponse } from 'next/server'
import { TwitterProfile } from '../../../types/scraper'
import { PersonalityAnalysis } from '../../../lib/openai'
import { ConsciousnessConfig, DEFAULT_CONSCIOUSNESS, generateConsciousnessInstructions, applyConsciousnessEffects } from '../../../lib/consciousness'
import { OpenAIQueueManager } from '../../../lib/queue/openai-queue'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth/config'
import { ChatCompletionMessage } from 'openai/resources/chat/completions'
import { initDB } from '@/lib/db'

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
  conversationId?: number
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

const MAX_RETRIES = 3;
const TIMEOUT_MS = 30000; // 30 seconds
const MIN_RESPONSE_LENGTH = 20;
const MAX_TOKENS = 500; // Increased from 150

// Add response validation
function isValidResponse(response: string): boolean {
  if (!response || response.length < MIN_RESPONSE_LENGTH) return false;
  if (response === 'Failed to generate a valid response') return false;
  // Check for common error patterns
  if (response.toLowerCase().includes('error') && response.toLowerCase().includes('generating')) return false;
  return true;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.username) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Store username in a const to preserve type narrowing
    const username = session.username

    const { message, profile, analysis, tuning, consciousness, conversationHistory = [], conversationId } = await req.json() as RequestBody

    if (!message || !analysis) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    console.log(`Processing chat request for user ${username}`)

    // Initialize database
    const db = await initDB()

    // First, ensure the user exists
    let user = await db.getUserByUsername(username)
    if (!user) {
      console.log(`Creating new user for ${username}`)
      // Create the user if they don't exist
      user = await db.createUser({
        username: username,
        twitter_username: username,
        created_at: new Date()
      })
    }
    console.log(`User found/created with ID: ${user.id}`)

    // Get or create conversation with proper error handling
    let activeConversationId: number
    if (conversationId) {
      // Verify the conversation exists and belongs to the user
      const conversation = await db.conversation.getConversation(conversationId, user.id)
      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found or unauthorized' },
          { status: 404 }
        )
      }
      activeConversationId = conversationId
    } else {
      // Create a new conversation
      try {
        const conversation = await db.conversation.startNewChat({
          userId: user.id,
          initialMessage: message,
          title: `Chat with ${profile.name || 'AI'}`,
          metadata: {
            profileName: profile.name,
            lastMessageAt: new Date(),
            messageCount: 0
          }
        })
        activeConversationId = conversation.id
        console.log(`Created new conversation with ID: ${activeConversationId}`)
      } catch (error) {
        console.error('Failed to create conversation:', error)
        return NextResponse.json(
          { error: 'Failed to create conversation' },
          { status: 500 }
        )
      }
    }

    // Save user message with error handling
    try {
      console.log('Saving user message to database')
      await db.conversation.addMessage({
        conversationId: activeConversationId,
        content: message,
        role: 'user'
      })
      console.log('User message saved successfully')
    } catch (error) {
      console.error('Failed to save user message:', error)
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
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
      { role: "system", content: baseSystemPrompt },
      ...conversationHistory.map(msg => ({ 
        role: msg.role,
        content: msg.content
      })),
      { role: "user", content: message }
    ] as ChatCompletionMessage[]

    // Get queue instance
    const queue = OpenAIQueueManager.getInstance()

    // Create a function to generate response with retries
    const generateResponse = async (retryCount = 0): Promise<string> => {
      try {
        const config = consciousness ?? DEFAULT_CONSCIOUSNESS
        const effects = config.quirks.length > 0 ? config.quirks : ['normal conversation']

        const response = await Promise.race([
          new Promise<string>((resolve, reject) => {
            queue.enqueueRequest(
              'chat',
              {
                messages,
                tuning: {
                  temperature: calculateTemperature(tuning),
                  maxTokens: MAX_TOKENS,
                  presencePenalty: 0.6,
                  frequencyPenalty: 0.3
                },
                consciousness: {
                  state: generateConsciousnessInstructions(config),
                  effects
                }
              },
              username,  // Use the stored username instead of session.username
              (result) => {
                const content = typeof result === 'object' && result !== null && 'content' in result 
                  ? result.content as string 
                  : String(result)

                if (validateStyle(content, tuning) && isValidResponse(content)) {
                  resolve(applyConsciousnessEffects(content, config))
                } else {
                  reject(new Error('Response validation failed'))
                }
              },
              reject
            )
          }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), TIMEOUT_MS)
          )
        ])

        if (!isValidResponse(response)) {
          throw new Error('Invalid response received')
        }

        return response
      } catch (error) {
        console.error(`Chat generation attempt ${retryCount + 1} failed:`, error)
        
        if (retryCount < MAX_RETRIES - 1) {
          console.log(`Retrying... (${retryCount + 2}/${MAX_RETRIES})`)
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000))
          return generateResponse(retryCount + 1)
        }
        
        throw new Error('Failed to generate valid response after multiple attempts')
      }
    }

    // Generate response with retries and validation
    console.log('Generating AI response')
    const response = await generateResponse()
    console.log('AI response generated successfully')

    // Save AI response with error handling
    try {
      console.log('Saving assistant response to database')
      await db.conversation.addMessage({
        conversationId: activeConversationId,
        content: response,
        role: 'assistant'
      })
      console.log('Assistant response saved successfully')
    } catch (error) {
      console.error('Failed to save assistant response:', error)
      // Don't throw here - we want to return the response even if saving fails
    }

    return NextResponse.json({
      response,
      conversationId: activeConversationId
    })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 