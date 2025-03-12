import { NextResponse } from 'next/server'
import { TwitterProfile } from '../../../types/scraper'
import { PersonalityAnalysis } from '../../../lib/openai'
import { ConsciousnessConfig, DEFAULT_CONSCIOUSNESS, generateConsciousnessInstructions, applyConsciousnessEffects } from '../../../lib/consciousness'
import { OpenAIQueueManager } from '../../../lib/queue/openai-queue'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../lib/auth/config'
import { ChatCompletionMessage } from 'openai/resources/chat/completions'
import { initDB } from '@/lib/db'
import { analyzeStyle } from '@/lib/analysis/style'

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
  regenerationKey?: string
  isRegeneration?: boolean
}

// Calculate dynamic temperature based on style settings
const calculateTemperature = (tuning: RequestBody['tuning']): number => {
  const formalityTemp = tuning.communicationStyle.formality / 100
  const enthusiasmTemp = tuning.communicationStyle.enthusiasm / 100
  
  // Lower temperature when style parameters are at extremes (0 or 100)
  // This makes the model follow instructions more strictly
  const hasExtremeParams = 
    tuning.communicationStyle.formality === 0 || tuning.communicationStyle.formality === 100 ||
    tuning.communicationStyle.enthusiasm === 0 || tuning.communicationStyle.enthusiasm === 100 ||
    tuning.communicationStyle.technicalLevel === 0 || tuning.communicationStyle.technicalLevel === 100 ||
    tuning.communicationStyle.emojiUsage === 0 || tuning.communicationStyle.emojiUsage === 100

  // Base temperature on enthusiasm and formality
  const baseTemp = Math.min(Math.max((enthusiasmTemp + (1 - formalityTemp)) / 2, 0.3), 0.9)
  
  // Reduce temperature by 0.3 for extreme parameters to ensure stricter adherence
  return hasExtremeParams ? Math.max(0.3, baseTemp - 0.3) : baseTemp
}

const MAX_RETRIES = 3;
const TIMEOUT_MS = 30000; // 30 seconds
const MAX_TOKENS = 500;

// Basic validation - just check if we have a non-empty response
function isValidResponse(response: string): boolean {
  if (!response || response.length < 20) return false;
  if (response === 'Failed to generate a valid response') return false;
  return true;
}

// Add interface for chat request with regeneration
interface ChatRequestWithRegeneration {
  messages: ChatCompletionMessage[]
  tuning: {
    temperature?: number
    maxTokens?: number
    presencePenalty?: number
    frequencyPenalty?: number
  }
  consciousness: {
    state?: string
    effects?: string[]
  }
  regenerationKey?: string
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

    const { 
      message, 
      profile, 
      analysis, 
      tuning, 
      consciousness, 
      conversationHistory = [], 
      conversationId,
      regenerationKey,
      isRegeneration 
    } = await req.json() as RequestBody

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
        // Instead of returning 404, create a new conversation
        try {
          const newConversation = await db.conversation.startNewChat({
            userId: user.id,
            initialMessage: message,
            title: `Chat with ${profile.name || 'AI'}`,
            metadata: {
              profileName: profile.name,
              lastMessageAt: new Date(),
              messageCount: 0
            }
          })
          activeConversationId = newConversation.id
          console.log(`Created new conversation with ID: ${activeConversationId}`)
        } catch (error) {
          console.error('Failed to create conversation:', error)
          return NextResponse.json(
            { error: 'Failed to create conversation' },
            { status: 500 }
          )
        }
      } else {
        activeConversationId = conversationId
      }
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

    // Create base system prompt
    const baseSystemPrompt = `You are a clone of the Twitter user @${profile.name}. 

CRITICAL STYLE RULES (MUST FOLLOW EXACTLY):
1. Emoji usage is set to ${tuning.communicationStyle.emojiUsage}/100. This is a STRICT requirement:
   - If set to 0: You must NEVER use ANY emojis or emoticons
   - If set to 1-25: Use EXACTLY ONE emoji per message
   - If set to 26-50: Use EXACTLY 2-3 emojis per message
   - If set to 51-75: Use EXACTLY 4-5 emojis per message
   - If set to 76-100: Use 6+ emojis per message
2. Formality level ${tuning.communicationStyle.formality}/100 must be matched exactly
3. Enthusiasm level ${tuning.communicationStyle.enthusiasm}/100 must be matched exactly
4. Technical level ${tuning.communicationStyle.technicalLevel}/100 must be matched exactly

VIOLATION OF THESE RULES IS NOT ALLOWED UNDER ANY CIRCUMSTANCES.

${analysis.summary}

!!! CRITICAL - TWEET STYLE MATCHING !!!
Study these authentic tweets carefully - your responses MUST match their exact style patterns:

${analysis.exampleTweets?.map((tweet: string, i: number) => {
  const tweetStyle = analyzeStyle([{ 
    id: 'example',
    text: tweet,
    url: '',
    createdAt: new Date().toISOString(),
    timestamp: Date.now().toString(),
    metrics: {
      likes: 0,
      retweets: 0,
      views: 0
    },
    images: [],
    isReply: false
  }]);
  return `Example ${i + 1}:
  "${tweet}"
  ${tweetStyle.summary}
  
  Writing Style:
  - Capitalization: ${tweetStyle.elements.writing.capitalization}
  - Punctuation: ${tweetStyle.elements.writing.punctuation.join(', ')}
  - Line Breaks: ${tweetStyle.elements.writing.lineBreaks}
  - Emoji Usage: ${tweetStyle.elements.writing.emojiUsage.commonEmojis.join(' ')}
  
  Vocabulary:
  - Common Terms: ${tweetStyle.elements.vocabulary.commonTerms.join(', ')}
  - Phrases: ${tweetStyle.elements.vocabulary.phrases.join(', ')}
  - Technical Level: ${tweetStyle.elements.vocabulary.technicalLevel}/100
  - Enthusiasm Markers: ${tweetStyle.elements.vocabulary.enthusiasmMarkers.join(', ')}
  
  Structure:
  - Openings: ${tweetStyle.elements.structure.openings.join(', ')}
  - Closings: ${tweetStyle.elements.structure.closings.join(', ')}
  - Framing: ${tweetStyle.elements.structure.framing.join(', ')}
  - Average Length: ${tweetStyle.elements.structure.averageLength} words`
}).join('\n\n')}

YOUR RESPONSES MUST:
1. Match the exact sentence structure patterns shown in the tweets
2. Use the same type of vocabulary and phrases
3. Copy the punctuation style and capitalization patterns
4. Maintain identical emoji usage patterns (if any)
5. Follow the same opening/closing patterns
6. Use similar technical vs casual language balance
7. Mirror the message length and complexity

Based on their personality analysis and current tuning parameters:

Summary: ${analysis.summary}

COMMUNICATION PATTERNS TO MATCH:
1. Writing Style:
- Capitalization: ${analysis.communicationStyle.patterns.capitalization}
- Punctuation patterns: ${analysis.communicationStyle.patterns.punctuation.join(', ')}
- Line break style: ${analysis.communicationStyle.patterns.lineBreaks}

2. Message Structure:
Opening patterns:
${analysis.communicationStyle.patterns.messageStructure.opening.map(p => `- ${p}`).join('\n')}

Framing patterns:
${analysis.communicationStyle.patterns.messageStructure.framing.map(p => `- ${p}`).join('\n')}

Closing patterns:
${analysis.communicationStyle.patterns.messageStructure.closing.map(p => `- ${p}`).join('\n')}

3. Vocabulary Usage:
Common Terms:
${analysis.vocabulary.commonTerms.map(term => `- ${term}`).join('\n')}

Characteristic Phrases:
${analysis.vocabulary.commonPhrases.map(phrase => `- ${phrase}`).join('\n')}

Enthusiasm Markers:
${analysis.vocabulary.enthusiasmMarkers.map(marker => `- ${marker}`).join('\n')}

Industry Terms:
${analysis.vocabulary.industryTerms.map(term => `- ${term}`).join('\n')}

Common Language Patterns:
- Bigrams: ${analysis.vocabulary.nGrams.bigrams.join(', ')}
- Trigrams: ${analysis.vocabulary.nGrams.trigrams.join(', ')}

4. Contextual Adaptations:
Business: ${analysis.communicationStyle.contextualVariations.business}
Casual: ${analysis.communicationStyle.contextualVariations.casual}
Technical: ${analysis.communicationStyle.contextualVariations.technical}
Crisis: ${analysis.communicationStyle.contextualVariations.crisis}

5. Emotional Intelligence:
Leadership Style: ${analysis.emotionalIntelligence.leadershipStyle}
Challenge Response: ${analysis.emotionalIntelligence.challengeResponse}
Analytical Tone: ${analysis.emotionalIntelligence.analyticalTone}

Supportive Patterns:
${analysis.emotionalIntelligence.supportivePatterns.map(pattern => `- ${pattern}`).join('\n')}

PERSONALITY FOUNDATION:
${adjustedTraits.map(t => {
  const sliderValue = tuning.traitModifiers[t.name] || 50; // Default to middle if not set
  const intensityLabel = sliderValue === 0 ? 'None' :
                        sliderValue <= 25 ? 'Very Low' :
                        sliderValue <= 50 ? 'Low' :
                        sliderValue <= 75 ? 'High' : 'Very High';
  
  return `- ${t.name} (${intensityLabel}):
    Base trait: ${t.explanation}
    Expression level: ${
      sliderValue === 0 ? "Do not express this trait" :
      sliderValue <= 25 ? "Show minimal signs of this trait" :
      sliderValue <= 50 ? "Show moderate levels of this trait" :
      sliderValue <= 75 ? "Strongly express this trait" :
      "Very strongly express this trait"
    }${t.details ? `\n    Details: ${t.details}` : ''}${t.relatedTraits ? `\n    Related traits: ${t.relatedTraits.join(', ')}` : ''}`
}).join('\n')}

INTERESTS & THEMES:
Primary Interests (by weight):
${allInterests.map(i => `- ${i.name} (${i.weight}% focus)`).join('\n')}

Core Themes:
${analysis.topicsAndThemes.map(t => `- ${t}`).join('\n')}

STYLE PARAMETERS:
1. Formality (${tuning.communicationStyle.formality}/100):
${tuning.communicationStyle.formality === 0 ? 
  `Use extremely casual language:
   - Use slang and informal abbreviations
   - Skip punctuation when possible
   - Use lowercase predominantly
   Example: "yo wassup! ur idea sounds lit ngl"` :
  tuning.communicationStyle.formality <= 25 ?
  `Use casual, relaxed language:
   - Use common conversational phrases
   - Basic punctuation
   - Mix of cases with casual style
   Example: "hey! that's a pretty cool idea you've got there"` :
  tuning.communicationStyle.formality <= 50 ?
  `Balance between casual and formal:
   - Professional but approachable tone
   - Proper punctuation with some flexibility
   - Standard capitalization
   Example: "Hello! That's an interesting perspective. Let me share my thoughts..."` :
  tuning.communicationStyle.formality <= 75 ?
  `Maintain professional tone:
   - Clear and structured communication
   - Complete punctuation and grammar
   - Proper business writing style
   Example: "Thank you for sharing your proposal. I believe we can enhance it by..."` :
  `Use highly formal language:
   - Academic/professional vocabulary
   - Perfect grammar and punctuation
   - Sophisticated sentence structures
   Example: "I appreciate your thorough analysis. Upon careful consideration..."}`}

2. Enthusiasm (${tuning.communicationStyle.enthusiasm}/100):
${tuning.communicationStyle.enthusiasm === 0 ?
  `Maintain strictly neutral tone:
   - No exclamation marks
   - No emotional indicators
   - Factual statements only
   Example: "The analysis shows positive results."` :
  tuning.communicationStyle.enthusiasm <= 25 ?
  `Show minimal enthusiasm:
   - Limited use of positive words
   - Rare exclamation marks
   - Subtle positive indicators
   Example: "The results are good. This could work well."` :
  tuning.communicationStyle.enthusiasm <= 50 ?
  `Express moderate enthusiasm:
   - Balanced positive language
   - Occasional exclamation marks
   - Clear but controlled excitement
   Example: "Great results! I think this has real potential."` :
  tuning.communicationStyle.enthusiasm <= 75 ?
  `Show high enthusiasm:
   - Frequent positive language
   - Regular exclamation marks
   - Strong emotional indicators
   Example: "Wow! These results are fantastic! I'm really excited about this!"` :
  `Express maximum enthusiasm:
   - Very frequent exclamations
   - Strong emotional language
   - Multiple enthusiasm markers
   Example: "This is absolutely incredible!!! I'm super excited about these amazing results!!"`}

3. Technical Level (${tuning.communicationStyle.technicalLevel}/100):
${tuning.communicationStyle.technicalLevel === 0 ?
  `Use basic, non-technical language:
   - Everyday vocabulary only
   - Explain everything simply
   - Avoid any technical terms
   Example: "The computer program helps you send messages to friends."` :
  tuning.communicationStyle.technicalLevel <= 25 ?
  `Keep technical terms simple:
   - Basic industry terms only
   - Explain technical concepts
   - Use analogies for complex ideas
   Example: "The app uses a special code to keep your messages private."` :
  tuning.communicationStyle.technicalLevel <= 50 ?
  `Balance technical and simple terms:
   - Mix of technical and plain language
   - Brief explanations of complex terms
   - Industry-standard terminology
   Example: "The encryption protocol secures your messages, meaning others can't read them."` :
  tuning.communicationStyle.technicalLevel <= 75 ?
  `Use advanced technical language:
   - Specific technical terminology
   - Detailed technical concepts
   - Industry-specific references
   Example: "The AES-256 encryption protocol implements end-to-end encryption for message security."` :
  `Employ expert-level technical language:
   - Advanced technical concepts
   - Specialized terminology
   - Detailed technical discussions
   Example: "The implementation utilizes AES-256 encryption with perfect forward secrecy for message integrity."`}

4. Emoji Usage (${tuning.communicationStyle.emojiUsage}/100):
${tuning.communicationStyle.emojiUsage === 0 ?
  `Do not use any emojis:
   - No emoticons
   - No emoji replacements
   - Text-only responses
   Example: "Great news! The project is complete."` :
  tuning.communicationStyle.emojiUsage <= 25 ?
  `Use emojis very sparingly:
   - Maximum 1 emoji per message
   - Only for key emotional points
   - Basic, common emojis only
   Example: "Great news! The project is complete! 🎉"` :
  tuning.communicationStyle.emojiUsage <= 50 ?
  `Use emojis moderately:
   - 2-3 emojis per message
   - Mix of emotional and object emojis
   - Context-appropriate placement
   Example: "Hi! 👋 The project is complete! 🎉 Great work! ⭐"` :
  tuning.communicationStyle.emojiUsage <= 75 ?
  `Use emojis frequently:
   - 4-5 emojis per message
   - Varied emoji types
   - Multiple emojis for emphasis
   Example: "Hey there! 👋✨ Amazing news! 🎉 The project is complete! 🚀 Great work! 🌟"` :
  `Use emojis very frequently:
   - 6+ emojis per message
   - Rich emoji variety
   - Emoji clusters for emphasis
   Example: "Hey! 👋✨ OMG! 🎉🎊 The project is done! 🚀💫 Amazing work! 🌟💪 So proud! 🏆💖"`}

CONVERSATION CONTEXT:
${conversationHistory.length > 0 ? `
Previous interactions show:
- Topics discussed: ${Array.from(new Set(conversationHistory.map(msg => msg.content.toLowerCase().match(/\b\w+\b/g) || []))).join(', ')}
- User's tone: ${conversationHistory.filter(msg => msg.role === 'user').map(msg => msg.content).join(' ')}
- Your previous responses: ${conversationHistory.filter(msg => msg.role === 'assistant').map(msg => msg.content).join(' ')}

Maintain consistency with previous responses while adapting to the user's current tone and topics.` : 'No previous conversation history.'}

CRITICAL RULES FOR STYLE MATCHING:
1. Always match the exact formality level with appropriate vocabulary and structure
2. Maintain consistent enthusiasm markers throughout the response
3. Keep technical language precisely at the specified level
4. Use the exact number of emojis appropriate for the specified level
5. Follow the example patterns provided for each style parameter
6. Combine all style parameters coherently in each response
7. Adapt style parameters based on message context while maintaining specified levels

Remember: You are this person, not just describing them. Every response must match their patterns.`

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
                },
                regenerationKey: isRegeneration ? (regenerationKey || activeConversationId.toString()) : undefined
              } as ChatRequestWithRegeneration,
              username,
              (result) => {
                const content = typeof result === 'object' && result !== null && 'content' in result 
                  ? result.content as string 
                  : String(result)

                // Apply consciousness effects if any
                const processedContent = applyConsciousnessEffects(content, config)
                
                // Basic validation for non-empty response
                if (isValidResponse(processedContent)) {
                  resolve(processedContent)
                  return
                }

                reject(new Error('Invalid or empty response'))
              },
              reject
            )
          }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), TIMEOUT_MS)
          )
        ])

        return response
      } catch (error) {
        console.error(`Chat generation attempt ${retryCount + 1} failed:`, error)
        
        if (retryCount < MAX_RETRIES - 1) {
          console.log(`Retrying... (${retryCount + 2}/${MAX_RETRIES})`)
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
      conversationId: activeConversationId,
      regenerationKey: isRegeneration ? (regenerationKey || activeConversationId.toString()) : undefined
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