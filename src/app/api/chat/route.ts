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
const validateStyle = (response: string, tuning: RequestBody['tuning'], analysis: PersonalityAnalysis): boolean => {
  // For responses with consciousness effects, be more lenient
  const hasConfusionMarkers = response.includes('what was I saying') || 
                             response.includes('oh wait') || 
                             response.includes('...') ||
                             response.includes('?!')

  // Check emoji count - be more lenient if confusion markers present
  const emojiCount = (response.match(/[\p{Emoji}]/gu) || []).length
  const minEmojis = hasConfusionMarkers ? 1 : 2
  if (tuning.communicationStyle.emojiUsage > 80 && emojiCount < minEmojis) return false
  if (tuning.communicationStyle.emojiUsage < 20 && emojiCount > 0) return false
  
  // Check enthusiasm - be more lenient if confusion markers present
  const exclamationCount = (response.match(/!/g) || []).length
  const minExclamations = hasConfusionMarkers ? 1 : 2
  if (tuning.communicationStyle.enthusiasm > 80 && exclamationCount < minExclamations) return false
  if (tuning.communicationStyle.enthusiasm < 20 && exclamationCount > 1) return false

  // Check capitalization pattern - be more lenient with mixed case if confused
  const upperCaseCount = (response.match(/[A-Z]/g) || []).length
  const lowerCaseCount = (response.match(/[a-z]/g) || []).length
  const expectedPattern = analysis.communicationStyle.patterns.capitalization
  const actualPattern = upperCaseCount > lowerCaseCount * 2 ? 'UPPERCASE' : 
                       lowerCaseCount > upperCaseCount * 2 ? 'lowercase' : 'mixed'
  if (!hasConfusionMarkers && expectedPattern.toLowerCase() !== actualPattern.toLowerCase()) return false

  // Check for common phrases/terms - be more lenient if confused
  const hasCommonTerm = analysis.vocabulary.commonTerms.some(term => 
    response.toLowerCase().includes(term.toLowerCase())
  )
  if (!hasConfusionMarkers && !hasCommonTerm) return false

  // Check message structure - be very lenient if confused
  if (!hasConfusionMarkers) {
    const hasValidOpening = analysis.communicationStyle.patterns.messageStructure.opening.some(pattern =>
      new RegExp(pattern, 'i').test(response)
    )
    const hasValidClosing = analysis.communicationStyle.patterns.messageStructure.closing.some(pattern =>
      new RegExp(pattern, 'i').test(response)
    )
    if (!hasValidOpening && !hasValidClosing) return false
  }
  
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

// Update validateEnhancedStyle to use the new types
const validateEnhancedStyle = (
  response: string, 
  tuning: RequestBody['tuning'], 
  traits: PersonalityAnalysis['traits'],
  examples: string[],
  analysis: PersonalityAnalysis
): boolean => {
  // Basic style checks
  if (!validateStyle(response, tuning, analysis)) return false;
  
  // Extract style elements from response
  const responseElements = identifyStyleElements(response);
  
  // Extract patterns from examples
  const examplePatterns = examples.map(example => identifyStyleElements(example));
  
  // Check if response matches at least some patterns from examples
  const matchesPattern = examplePatterns.some(pattern => {
    let matches = 0;
    const requiredMatches = Math.ceil(Object.keys(pattern).length * 0.6);
    
    // Compare each element type with null-safe checks
    if (pattern.emoji.some(e => responseElements.emoji.includes(e))) matches++;
    if (Math.abs(pattern.enthusiasm - responseElements.enthusiasm) <= 2) matches++;
    if (pattern.capitalization === responseElements.capitalization) matches++;
    if (pattern.punctuation.some(p => responseElements.punctuation.includes(p))) matches++;
    if (pattern.lineBreaks === responseElements.lineBreaks) matches++;
    if (pattern.formality === responseElements.formality) matches++;
    if (pattern.technicalTerms.some(t => responseElements.technicalTerms.includes(t))) matches++;
    if (pattern.bigrams.some(b => responseElements.bigrams.includes(b))) matches++;
    if (pattern.trigrams.some(t => responseElements.trigrams.includes(t))) matches++;
    if (pattern.structure.some(s => responseElements.structure.includes(s))) matches++;
    
    return matches >= requiredMatches;
  });
  
  if (!matchesPattern) {
    console.warn('Response does not match example patterns');
    return false;
  }
  
  return true;
};

// Update validateEnhancedStyleRelaxed to use the new types
const validateEnhancedStyleRelaxed = (
  response: string, 
  tuning: RequestBody['tuning'], 
  traits: PersonalityAnalysis['traits'],
  examples: string[],
  analysis: PersonalityAnalysis
): boolean => {
  console.log('\n=== Relaxed Validation Debug Info ===');
  console.log('Response:', response);
  
  // Basic style validation with full analysis
  const basicStyleValid = validateStyle(response, tuning, analysis);
  console.log('Basic Style Valid:', basicStyleValid);
  
  // Extract style elements
  const responseElements = identifyStyleElements(response);
  console.log('Response Elements:', styleElementsToString(responseElements));
  
  // If no examples, use basic validation
  if (!examples || examples.length === 0) {
    console.log('No examples available, using basic validation only');
    return basicStyleValid;
  }
  
  // Extract patterns from examples
  const examplePatterns = examples.map(example => identifyStyleElements(example));
  console.log('Example Patterns:', examplePatterns.map(styleElementsToString));
  
  // More lenient pattern matching (40% match required)
  const matchesPattern = examplePatterns.some(pattern => {
    let matches = 0;
    const requiredMatches = Math.ceil(Object.keys(pattern).length * 0.4);
    
    // Compare each element type with null-safe checks
    if (pattern.emoji.some(e => responseElements.emoji.includes(e))) matches++;
    if (Math.abs(pattern.enthusiasm - responseElements.enthusiasm) <= 3) matches++;
    if (pattern.capitalization === responseElements.capitalization) matches++;
    if (pattern.punctuation.some(p => responseElements.punctuation.includes(p))) matches++;
    if (pattern.lineBreaks === responseElements.lineBreaks) matches++;
    if (pattern.formality === responseElements.formality) matches++;
    if (pattern.technicalTerms.some(t => responseElements.technicalTerms.includes(t))) matches++;
    if (pattern.bigrams.some(b => responseElements.bigrams.includes(b))) matches++;
    if (pattern.trigrams.some(t => responseElements.trigrams.includes(t))) matches++;
    if (pattern.structure.some(s => responseElements.structure.includes(s))) matches++;
    
    console.log('Pattern Matches:', matches, 'Required:', requiredMatches);
    return matches >= requiredMatches;
  });
  
  console.log('Matches Pattern:', matchesPattern);
  
  // Check vocabulary with reduced similarity requirement
  const responseWords = response.toLowerCase().split(/\s+/);
  const exampleWords = examples.flatMap(ex => ex.toLowerCase().split(/\s+/));
  const commonWords = responseWords.filter(word => exampleWords.includes(word));
  
  const vocabularySimilarity = commonWords.length / responseWords.length;
  console.log('Vocabulary Similarity:', vocabularySimilarity, 'Required: 0.2');
  
  const isValid = basicStyleValid && (matchesPattern || vocabularySimilarity >= 0.2);
  console.log('Final Validation Result:', isValid);
  console.log('=== End Debug Info ===\n');
  
  return isValid;
};

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
${adjustedTraits.map(t => `- ${t.name} (${t.score}/10): ${t.explanation}${t.details ? `\n  Details: ${t.details}` : ''}${t.relatedTraits ? `\n  Related traits: ${t.relatedTraits.join(', ')}` : ''}`).join('\n')}

INTERESTS & THEMES:
Primary Interests (by weight):
${allInterests.map(i => `- ${i.name} (${i.weight}% focus)`).join('\n')}

Core Themes:
${analysis.topicsAndThemes.map(t => `- ${t}`).join('\n')}

STYLE PARAMETERS:
1. Formality (${tuning.communicationStyle.formality}/100):
${tuning.communicationStyle.formality > 80 ? 
  "Maintain sophisticated language while preserving authentic style" :
  tuning.communicationStyle.formality < 20 ?
  "Keep it very casual and relaxed" :
  "Balance formal and informal elements"}

2. Enthusiasm (${tuning.communicationStyle.enthusiasm}/100):
${tuning.communicationStyle.enthusiasm > 80 ?
  "Show high energy and excitement using enthusiasm markers" :
  tuning.communicationStyle.enthusiasm < 20 ?
  "Maintain reserved, calm tone" :
  "Show moderate enthusiasm"}

3. Technical Level (${tuning.communicationStyle.technicalLevel}/100):
${tuning.communicationStyle.technicalLevel > 80 ?
  "Use industry expertise and technical vocabulary" :
  tuning.communicationStyle.technicalLevel < 20 ?
  "Keep language simple and accessible" :
  "Balance technical and simple terms"}

4. Emoji Usage (${tuning.communicationStyle.emojiUsage}/100):
${tuning.communicationStyle.emojiUsage > 80 ?
  "Use emojis frequently for expression" :
  tuning.communicationStyle.emojiUsage < 20 ?
  "Avoid emojis completely" :
  "Use emojis moderately"}

CONVERSATION CONTEXT:
${conversationHistory.length > 0 ? `
Previous interactions show:
- Topics discussed: ${Array.from(new Set(conversationHistory.map(msg => msg.content.toLowerCase().match(/\b\w+\b/g) || []))).join(', ')}
- User's tone: ${conversationHistory.filter(msg => msg.role === 'user').map(msg => msg.content).join(' ')}
- Your previous responses: ${conversationHistory.filter(msg => msg.role === 'assistant').map(msg => msg.content).join(' ')}

Maintain consistency with previous responses while adapting to the user's current tone and topics.` : 'No previous conversation history.'}

CRITICAL RULES:
1. STRICTLY match the writing style patterns (capitalization, punctuation, line breaks)
2. Use vocabulary and phrases from the provided lists
3. Follow message structure patterns for openings and closings
4. Adapt tone based on context while maintaining personality
5. Use enthusiasm markers and industry terms appropriately
6. Match emotional intelligence patterns in responses
7. Stay within the specified style parameters
8. Keep responses authentic to the analyzed personality
9. Use contextual variations based on conversation type
10. Maintain consistent n-gram patterns in responses

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

                // Debug logging
                console.log('\n=== Response Debug Info ===')
                console.log('Raw response:', content)
                console.log('Consciousness config:', config)
                console.log('Tuning:', tuning)
                console.log('Analysis traits:', adjustedTraits)
                console.log('Communication style:', analysis.communicationStyle)
                console.log('Vocabulary:', analysis.vocabulary)

                // First apply consciousness effects
                const processedContent = applyConsciousnessEffects(content, config)
                console.log('After consciousness effects:', processedContent)

                // Simple validation
                if (validateStyle(processedContent, tuning, analysis) && isValidResponse(processedContent)) {
                  console.log('Passed simple validation')
                  resolve(processedContent)
                  return
                }

                // Try enhanced validation
                const strictValid = validateEnhancedStyle(processedContent, tuning, adjustedTraits, analysis.exampleTweets || [], analysis)
                if (strictValid) {
                  console.log('Passed enhanced validation')
                  resolve(processedContent)
                  return
                }

                // Try relaxed validation
                const relaxedValid = validateEnhancedStyleRelaxed(processedContent, tuning, adjustedTraits, analysis.exampleTweets || [], analysis)
                if (relaxedValid) {
                  console.log('Passed relaxed validation')
                  resolve(processedContent)
                  return
                }

                console.log('=== End Debug Info ===\n')
                reject(new Error('Response validation failed'))
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