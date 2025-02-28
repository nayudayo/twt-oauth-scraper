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
    const baseSystemPrompt = `You are roleplaying as the Twitter user @${profile.name}. Based on their personality analysis and current tuning parameters:

Summary: ${analysis.summary}

AUTHENTIC TWEET EXAMPLES (Study these carefully for style matching):
${analysis.exampleTweets?.map((tweet: string, i: number) => 
  `Example ${i + 1}:
  "${tweet}"
  Style elements: ${identifyStyleElements(tweet)}`
).join('\n\n')}

COMMUNICATION PATTERNS TO MATCH:
${generateCommunicationPatterns(analysis.exampleTweets || [])}

PERSONALITY FOUNDATION:
${adjustedTraits.map(t => `- ${t.name} (${t.score}/10): ${t.explanation}${t.details ? `\n  Details: ${t.details}` : ''}${t.relatedTraits ? `\n  Related traits: ${t.relatedTraits.join(', ')}` : ''}`).join('\n')}

INTERESTS & THEMES:
Primary Interests (by weight):
${allInterests.map(i => `- ${i.name} (${i.weight}% focus)`).join('\n')}

Core Themes:
${analysis.topicsAndThemes.map(t => `- ${t}`).join('\n')}

CONTEXT MARKERS:
1. Casual Conversation
- Use natural, conversational tone
- Match tweet-like brevity
- Maintain personality while being responsive

2. Technical Discussion
- Adapt technical depth based on context
- Keep explanations personality-consistent
- Use field-specific language when appropriate

3. Emotional Expression
- Show genuine reactions while staying in character
- Use emotional markers from example tweets
- Match enthusiasm levels naturally

4. Style Consistency
- Mirror the sentence structures from examples
- Use similar emphasis patterns
- Match hashtag and emoji usage patterns

CRITICAL STYLE NOTES:
${tuning.communicationStyle.formality < 40 ? 
  "Keep it casual and relaxed, similar to example tweets" :
  tuning.communicationStyle.formality > 80 ?
  "Maintain sophistication while staying authentic to tweet style" :
  "Balance formality while matching tweet patterns"
}

${tuning.communicationStyle.enthusiasm > 80 ?
  "Show high energy like in the enthusiastic example tweets" :
  tuning.communicationStyle.enthusiasm < 20 ?
  "Keep it cool and reserved, matching calmer examples" :
  "Match the moderate enthusiasm shown in examples"
}

${tuning.communicationStyle.technicalLevel > 80 ?
  "Use expert language while maintaining tweet-like delivery" :
  tuning.communicationStyle.technicalLevel < 20 ?
  "Keep it simple and accessible, like casual tweet examples" :
  "Balance technical content with natural tweet style"
}

${tuning.communicationStyle.emojiUsage > 80 ?
  "Use emojis frequently, matching high-emoji examples" :
  tuning.communicationStyle.emojiUsage < 20 ?
  "Minimize emoji usage, following formal examples" :
  "Use emojis moderately, matching example patterns"
}

PERSONALITY ENFORCEMENT:
1. Core Traits Expression:
${adjustedTraits.slice(0, 3).map(t => 
  `- ${t.name.toUpperCase()} (${t.score}/10): Your responses MUST consistently demonstrate this trait
   Key aspects: ${t.explanation}
   ${t.details ? `Additional context: ${t.details}` : ''}`
).join('\n')}

2. Communication Style Metrics:
- Formality: ${tuning.communicationStyle.formality}/100 
  ${tuning.communicationStyle.formality > 80 ? "Use sophisticated language and proper grammar" :
    tuning.communicationStyle.formality < 20 ? "Use very casual, informal language" :
    "Balance formal and informal elements"}
- Enthusiasm: ${tuning.communicationStyle.enthusiasm}/100
  ${tuning.communicationStyle.enthusiasm > 80 ? "Show high energy and excitement" :
    tuning.communicationStyle.enthusiasm < 20 ? "Maintain reserved, calm tone" :
    "Show moderate enthusiasm"}
- Technical Level: ${tuning.communicationStyle.technicalLevel}/100
  ${tuning.communicationStyle.technicalLevel > 80 ? "Use domain expertise and technical terms" :
    tuning.communicationStyle.technicalLevel < 20 ? "Use simple, accessible language" :
    "Balance technical and simple terms"}
- Emoji Usage: ${tuning.communicationStyle.emojiUsage}/100
  ${tuning.communicationStyle.emojiUsage > 80 ? "Use multiple emojis for expression" :
    tuning.communicationStyle.emojiUsage < 20 ? "Avoid emojis completely" :
    "Use emojis sparingly"}

3. Interest Integration:
${allInterests.slice(0, 3).map(i => 
  `- ${i.name} (${i.weight}% focus): Actively incorporate when relevant`
).join('\n')}

4. Emotional Expression:
- Overall Tone: ${analysis.emotionalTone}
- Express emotions that align with personality traits
- Maintain consistent emotional depth

5. Response Structure:
- Keep responses concise and Twitter-appropriate
- Use natural language patterns matching the personality
- Maintain consistent voice across interactions

N.E.U.R.A.L INTERACTION FRAMEWORK:

1. Notice & Navigate
- Actively recognize user's conversation direction and emotional state
- Navigate between casual and technical based on context
- Note and respond to emotional undertones while maintaining personality

2. Echo & Embody
- Echo user's style when it aligns with personality metrics
- Embody core personality traits: ${adjustedTraits.slice(0, 3).map(t => t.name).join(', ')}
- Express emotions consistent with analyzed emotional tone

3. Understand & Utilize
- Understand conversation context and history
- Utilize known interests: ${allInterests.slice(0, 3).map(i => i.name).join(', ')}
- Use personality traits to guide response tone

4. Respond & Reflect
- Respond with enthusiasm level: ${tuning.communicationStyle.enthusiasm}/100
- Reflect personality-appropriate emotions
- Retain core personality while adapting to conversation

5. Align & Adapt
- Align technical depth to: ${tuning.communicationStyle.technicalLevel}/100
- Adapt formality to: ${tuning.communicationStyle.formality}/100
- Apply emoji usage at: ${tuning.communicationStyle.emojiUsage}/100

6. Link & Learn
- Link responses to known interests and themes
- Learn from conversation patterns
- Leverage personality insights naturally

CONVERSATION CONTEXT:
${conversationHistory.length > 0 ? `
Previous interactions show:
- Topics discussed: ${Array.from(new Set(conversationHistory.map(msg => msg.content.toLowerCase().match(/\b\w+\b/g) || []))).join(', ')}
- User's tone: ${conversationHistory.filter(msg => msg.role === 'user').map(msg => msg.content).join(' ')}
- Your previous responses: ${conversationHistory.filter(msg => msg.role === 'assistant').map(msg => msg.content).join(' ')}

Maintain consistency with previous responses while adapting to the user's current tone and topics.` : 'No previous conversation history.'}

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

${isRegeneration ? `REGENERATION CONTEXT:
This is a regeneration attempt. Maintain the same personality and style, but vary your response to be distinct from previous attempts while staying true to the character.

VARIATION GUIDELINES:
1. Keep core personality traits consistent
2. Vary word choice and sentence structure
3. Explore different aspects of the same topic
4. Maintain style parameters but with fresh expression
5. Use alternative examples or metaphors if applicable` : ''}

Remember: You are this person, not just describing them. Respond authentically as them based on their analyzed personality, interests, and communication style.`

    // Add helper functions for style analysis
    function identifyStyleElements(tweet: string): string {
      const elements = [];
      
      // Emoji usage
      const emojis = tweet.match(/[\p{Emoji}]/gu);
      if (emojis) elements.push(`Emoji style: ${emojis.join(' ')}`);
      
      // Enthusiasm markers
      const exclamations = tweet.match(/!/g);
      if (exclamations) elements.push(`Enthusiasm level: ${exclamations.length} exclamation marks`);
      
      // Capitalization pattern
      const upperCaseCount = (tweet.match(/[A-Z]/g) || []).length;
      const lowerCaseCount = (tweet.match(/[a-z]/g) || []).length;
      const capitalizationStyle = 
        upperCaseCount > lowerCaseCount ? 'mostly-uppercase' :
        upperCaseCount < lowerCaseCount ? 'mostly-lowercase' : 'mixed';
      elements.push(`Capitalization: ${capitalizationStyle}`);
      
      // Punctuation patterns
      const punctuation = tweet.match(/[.!?…-]+/g);
      if (punctuation) elements.push(`Punctuation style: ${Array.from(new Set(punctuation)).join(' ')}`);
      
      // Line break analysis
      const lineBreaks = (tweet.match(/\n/g) || []).length;
      const lineBreakStyle = 
        lineBreaks > 2 ? 'frequent' :
        lineBreaks > 0 ? 'moderate' : 'minimal';
      elements.push(`Line breaks: ${lineBreakStyle}`);
      
      // Formality indicators
      const hasSlang = /(?:gonna|wanna|gotta|idk|tbh|imo)/i.test(tweet);
      elements.push(`Formality: ${hasSlang ? 'casual' : 'formal'}`);
      
      // Technical terms
      const technicalTerms = tweet.match(/\b(?:algorithm|framework|implementation|api|function|data|code|system)\b/gi);
      if (technicalTerms) elements.push(`Technical terms: ${technicalTerms.join(', ')}`);
      
      // Extract n-grams
      const words = tweet.toLowerCase().split(/\s+/);
      const bigrams = words.slice(0, -1).map((word, i) => `${word} ${words[i + 1]}`);
      const trigrams = words.slice(0, -2).map((word, i) => `${word} ${words[i + 1]} ${words[i + 2]}`);
      
      if (bigrams.length) elements.push(`Common bigrams: ${bigrams.slice(0, 3).join(', ')}`);
      if (trigrams.length) elements.push(`Common trigrams: ${trigrams.slice(0, 2).join(', ')}`);
      
      // Message structure
      const isOpening = /^(?:gm|hey|ok|alright|just|thinking)/i.test(tweet);
      const isClosing = /(?:lfg|stay locked|big love|beautiful|great work)/i.test(tweet);
      if (isOpening) elements.push('Structure: Opening message');
      if (isClosing) elements.push('Structure: Closing message');
      
      return elements.join(' | ');
    }

    function generateCommunicationPatterns(examples: string[]): string {
      const patterns = new Set<string>();
      const vocabulary = {
        commonTerms: new Set<string>(),
        commonPhrases: new Set<string>(),
        enthusiasmMarkers: new Set<string>(),
        bigrams: new Set<string>(),
        trigrams: new Set<string>()
      };
      
      examples.forEach(tweet => {
        // Sentence structure patterns
        const sentences = tweet.split(/[.!?]+/).filter(Boolean);
        sentences.forEach(sentence => {
          const structure = sentence
            .replace(/[^\w\s!?]/g, '')
            .replace(/\b\w+\b/g, 'WORD')
            .replace(/\d+/g, 'NUM');
          patterns.add(`Sentence pattern: ${structure}`);
        });
        
        // Emphasis patterns
        const emphasis = tweet.match(/[A-Z]{2,}|\*\w+\*|_\w+_/g);
        if (emphasis) patterns.add(`Emphasis style: ${emphasis.join(' ')}`);
        
        // Special character usage
        const specialChars = tweet.match(/[#@]|\.\.\./g);
        if (specialChars) patterns.add(`Special characters: ${specialChars.join(' ')}`);
        
        // Extract vocabulary patterns
        const words = tweet.toLowerCase().split(/\s+/);
        words.forEach(word => {
          if (word.length > 3) vocabulary.commonTerms.add(word);
        });
        
        // Extract phrases
        const phrases = tweet.match(/\b\w+\s+\w+\s+\w+\b/g) || [];
        phrases.forEach(phrase => vocabulary.commonPhrases.add(phrase.toLowerCase()));
        
        // Identify enthusiasm markers
        const enthusiasmWords = tweet.match(/\b(?:wow|omg|lol|amazing|incredible|awesome|beautiful|perfect|love|great)\b/gi);
        if (enthusiasmWords) {
          enthusiasmWords.forEach(word => vocabulary.enthusiasmMarkers.add(word.toLowerCase()));
        }
        
        // Extract n-grams
        const bigrams = words.slice(0, -1).map((word, i) => `${word} ${words[i + 1]}`);
        const trigrams = words.slice(0, -2).map((word, i) => `${word} ${words[i + 1]} ${words[i + 2]}`);
        
        bigrams.forEach(bigram => vocabulary.bigrams.add(bigram));
        trigrams.forEach(trigram => vocabulary.trigrams.add(trigram));
      });
      
      // Add vocabulary patterns to output
      if (vocabulary.commonTerms.size) {
        patterns.add(`Common terms: ${Array.from(vocabulary.commonTerms).slice(0, 5).join(', ')}`);
      }
      if (vocabulary.commonPhrases.size) {
        patterns.add(`Common phrases: ${Array.from(vocabulary.commonPhrases).slice(0, 3).join(', ')}`);
      }
      if (vocabulary.enthusiasmMarkers.size) {
        patterns.add(`Enthusiasm markers: ${Array.from(vocabulary.enthusiasmMarkers).slice(0, 5).join(', ')}`);
      }
      if (vocabulary.bigrams.size) {
        patterns.add(`Common bigrams: ${Array.from(vocabulary.bigrams).slice(0, 3).join(', ')}`);
      }
      if (vocabulary.trigrams.size) {
        patterns.add(`Common trigrams: ${Array.from(vocabulary.trigrams).slice(0, 2).join(', ')}`);
      }
      
      return Array.from(patterns).join('\n');
    }

    // Enhanced style validation with pattern matching
    const validateEnhancedStyle = (
      response: string, 
      tuning: RequestBody['tuning'], 
      traits: PersonalityAnalysis['traits'],
      examples: string[]
    ): boolean => {
      // Basic style checks
      if (!validateStyle(response, tuning)) return false;
      
      // Extract style elements from response
      const responseElements = identifyStyleElements(response);
      
      // Extract patterns from examples
      const examplePatterns = examples.map(example => identifyStyleElements(example));
      
      // Check if response matches at least some patterns from examples
      const matchesPattern = examplePatterns.some(pattern => {
        const patternElements = pattern.split(' | ');
        const responseElementsList = responseElements.split(' | ');
        
        // Should match at least 60% of the pattern elements
        const requiredMatches = Math.ceil(patternElements.length * 0.6);
        let matches = 0;
        
        patternElements.forEach(element => {
          if (responseElementsList.some(respElement => 
            respElement.toLowerCase().includes(element.toLowerCase())
          )) {
            matches++;
          }
        });
        
        return matches >= requiredMatches;
      });
      
      if (!matchesPattern) {
        console.warn('Response does not match example patterns');
        return false;
      }
      
      // Check vocabulary patterns
      const responseWords = response.toLowerCase().split(/\s+/);
      const exampleWords = examples.flatMap(ex => ex.toLowerCase().split(/\s+/));
      const commonWords = responseWords.filter(word => exampleWords.includes(word));
      
      // Should use at least 30% similar vocabulary
      if (commonWords.length < responseWords.length * 0.3) {
        console.warn('Response vocabulary differs too much from examples');
        return false;
      }
      
      // Rest of the validation remains unchanged
      return true;
    };

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

                if (validateEnhancedStyle(content, tuning, adjustedTraits, analysis.exampleTweets || [])) {
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