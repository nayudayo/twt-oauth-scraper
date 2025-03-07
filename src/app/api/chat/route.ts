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
  regenerationKey?: string
  isRegeneration?: boolean
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

// Add type definition for style elements
interface StyleElements {
  emoji: string[];
  enthusiasm: number;
  capitalization: string;
  punctuation: string[];
  lineBreaks: string;
  formality: string;
  technicalTerms: string[];
  bigrams: string[];
  trigrams: string[];
  structure: string[];
}

// Update identifyStyleElements to use StyleElements
function identifyStyleElements(tweet: string): StyleElements {
  const elements: StyleElements = {
    emoji: [],
    enthusiasm: 0,
    capitalization: 'mixed',
    punctuation: [],
    lineBreaks: 'minimal',
    formality: 'formal',
    technicalTerms: [],
    bigrams: [],
    trigrams: [],
    structure: []
  };
  
  // Emoji usage
  const emojis = tweet.match(/[\p{Emoji}]/gu);
  if (emojis) elements.emoji = emojis;
  
  // Enthusiasm markers
  const exclamations = tweet.match(/!/g);
  elements.enthusiasm = exclamations ? exclamations.length : 0;
  
  // Capitalization pattern
  const upperCaseCount = (tweet.match(/[A-Z]/g) || []).length;
  const lowerCaseCount = (tweet.match(/[a-z]/g) || []).length;
  elements.capitalization = 
    upperCaseCount > lowerCaseCount ? 'mostly-uppercase' :
    upperCaseCount < lowerCaseCount ? 'mostly-lowercase' : 'mixed';
  
  // Punctuation patterns
  const punctuation = tweet.match(/[.!?…-]+/g);
  if (punctuation) elements.punctuation = Array.from(new Set(punctuation));
  
  // Line break analysis
  const lineBreaks = (tweet.match(/\n/g) || []).length;
  elements.lineBreaks = 
    lineBreaks > 2 ? 'frequent' :
    lineBreaks > 0 ? 'moderate' : 'minimal';
  
  // Formality indicators
  const hasSlang = /(?:gonna|wanna|gotta|idk|tbh|imo)/i.test(tweet);
  elements.formality = hasSlang ? 'casual' : 'formal';
  
  // Technical terms
  const technicalTerms = tweet.match(/\b(?:algorithm|framework|implementation|api|function|data|code|system)\b/gi);
  if (technicalTerms) elements.technicalTerms = technicalTerms;
  
  // Extract n-grams
  const words = tweet.toLowerCase().split(/\s+/);
  elements.bigrams = words.slice(0, -1)
    .map((word, i) => `${word} ${words[i + 1]}`)
    .slice(0, 3);
  elements.trigrams = words.slice(0, -2)
    .map((word, i) => `${word} ${words[i + 1]} ${words[i + 2]}`)
    .slice(0, 2);
  
  // Message structure
  const isOpening = /^(?:gm|hey|ok|alright|just|thinking)/i.test(tweet);
  const isClosing = /(?:lfg|stay locked|big love|beautiful|great work)/i.test(tweet);
  if (isOpening) elements.structure.push('opening');
  if (isClosing) elements.structure.push('closing');
  
  return elements;
}

// Helper function to convert StyleElements to string format
function styleElementsToString(elements: StyleElements): string {
  const parts: string[] = [];
  
  if (elements.emoji.length) parts.push(`Emoji style: ${elements.emoji.join(' ')}`);
  if (elements.enthusiasm > 0) parts.push(`Enthusiasm level: ${elements.enthusiasm} exclamation marks`);
  parts.push(`Capitalization: ${elements.capitalization}`);
  if (elements.punctuation.length) parts.push(`Punctuation style: ${elements.punctuation.join(' ')}`);
  parts.push(`Line breaks: ${elements.lineBreaks}`);
  parts.push(`Formality: ${elements.formality}`);
  if (elements.technicalTerms.length) parts.push(`Technical terms: ${elements.technicalTerms.join(', ')}`);
  if (elements.bigrams.length) parts.push(`Common bigrams: ${elements.bigrams.join(', ')}`);
  if (elements.trigrams.length) parts.push(`Common trigrams: ${elements.trigrams.join(', ')}`);
  if (elements.structure.length) parts.push(`Structure: ${elements.structure.join(' & ')} message`);
  
  return parts.join(' | ');
}

function extractVocabularyPatterns(tweet: string): string {
  const patterns = [];
  
  // Extract terms
  const words = tweet.toLowerCase().split(/\s+/);
  const commonTerms = words.filter(word => word.length > 3).slice(0, 3);
  if (commonTerms.length) patterns.push(`Common terms: ${commonTerms.join(', ')}`);
  
  // Extract phrases
  const phrases = tweet.match(/\b\w+\s+\w+\s+\w+\b/g) || [];
  if (phrases.length) patterns.push(`Phrases: ${phrases.slice(0, 2).join(', ')}`);
  
  // Extract enthusiasm markers
  const enthusiasm = tweet.match(/\b(?:wow|omg|lol|amazing|incredible|awesome)\b/gi) || [];
  if (enthusiasm.length) patterns.push(`Enthusiasm: ${enthusiasm.join(', ')}`);
  
  return patterns.join(' | ');
}

function analyzeMessageStructure(tweet: string): string {
  const structure = [];
  
  // Analyze opening
  if (/^(?:hey|hi|ok|so|just|thinking)/i.test(tweet)) {
    structure.push('Standard opening');
  }
  
  // Analyze framing
  if (tweet.includes('because') || tweet.includes('therefore') || tweet.includes('however')) {
    structure.push('Logical framing');
  } else if (tweet.includes('I think') || tweet.includes('In my opinion')) {
    structure.push('Opinion framing');
  }
  
  // Analyze closing
  if (/(?:thanks|cheers|later|bye|ttyl)/i.test(tweet)) {
    structure.push('Standard closing');
  }
  
  return structure.join(' → ') || 'Direct statement';
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
    const baseSystemPrompt = `You are roleplaying as the Twitter user @${profile.name}. Based on their personality analysis and current tuning parameters:

Summary: ${analysis.summary}

AUTHENTIC TWEET EXAMPLES (Study these carefully for style matching):
${analysis.exampleTweets?.map((tweet: string, i: number) => 
  `Example ${i + 1}:
  "${tweet}"
  Style elements: ${styleElementsToString(identifyStyleElements(tweet))}
  Vocabulary patterns: ${extractVocabularyPatterns(tweet)}
  Message structure: ${analyzeMessageStructure(tweet)}`
).join('\n\n')}

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