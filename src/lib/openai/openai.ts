import OpenAI from 'openai'
import { Tweet, OpenAITwitterProfile, PersonalityTuning } from '../../types/scraper'
import { PersonalityAnalysis } from './types'
import systemMessage from './prompting/system-prompt'
import { ANALYSIS_CHUNKS, generateChunkPrompt } from './prompting/analysis-prompting'
import { retryWithExponentialBackoff } from './utils/retry'
import { parseAnalysisResponse } from './utils/parsing'
import { logRawResponse } from './utils/logging'
import type { ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from 'openai/resources/chat/completions'
import { initDB } from '../db'
import { AnalysisChunkType, CHUNK_TYPE_TO_NAME } from './types'

export type CommunicationLevel = 'low' | 'medium' | 'high';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const MIN_WORDS = 5 // Minimum words required for a tweet to be analyzed

function countWords(text: string | null): number {
  if (!text) return 0
  return text.trim().split(/\s+/).length
}

// Add helper functions for trait processing
function mergeSimilarTraits(traits: PersonalityAnalysis['traits']): PersonalityAnalysis['traits'] {
  const similarityGroups = new Map<string, {
    traits: typeof traits,
    mainTrait: (typeof traits)[0]
  }>();

  // Helper to check if two traits are similar
  const areSimilar = (a: string, b: string): boolean => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const [na, nb] = [normalize(a), normalize(b)];
    return na.includes(nb) || nb.includes(na) || 
           (na.length > 4 && nb.length > 4 && (na.includes(nb.slice(0, 4)) || nb.includes(na.slice(0, 4))));
  };

  // Group similar traits
  traits.forEach(trait => {
    let foundGroup = false;
    for (const [key, group] of similarityGroups.entries()) {
      if (areSimilar(trait.name, key)) {
        group.traits.push(trait);
        // Update main trait if this one has a higher score
        if (trait.score > group.mainTrait.score) {
          group.mainTrait = trait;
        }
        foundGroup = true;
        break;
      }
    }
    if (!foundGroup) {
      similarityGroups.set(trait.name, {
        traits: [trait],
        mainTrait: trait
      });
    }
  });

  // Merge explanations and return consolidated traits
  return Array.from(similarityGroups.values()).map(group => {
    const { mainTrait, traits } = group;
    const allExplanations = traits.map(t => t.explanation).filter(Boolean);
    
    // Create a summary and detailed explanation
    const summary = allExplanations[0]?.split('.')[0] || '';
    const details = allExplanations
      .filter((exp, i) => i === 0 || !exp.includes(summary))
      .join('. ');

    return {
      name: mainTrait.name,
      score: mainTrait.score,
      explanation: summary,
      details: details,
      relatedTraits: traits.length > 1 ? traits.filter(t => t !== mainTrait).map(t => t.name) : undefined
    };
  }).sort((a, b) => b.score - a.score);
}

function consolidateInterests(interests: string[]): string[] {
  const groups = new Map<string, string[]>();
  
  interests.forEach(interest => {
    let foundGroup = false;
    for (const [key, group] of groups.entries()) {
      if (interest.toLowerCase().includes(key.toLowerCase()) || 
          key.toLowerCase().includes(interest.toLowerCase())) {
        group.push(interest);
        foundGroup = true;
        break;
      }
    }
    if (!foundGroup) {
      groups.set(interest, [interest]);
    }
  });

  return Array.from(groups.values()).map(group => 
    group.reduce((a, b) => a.length > b.length ? a : b)
  );
}

// Add timeout configuration with device-specific settings
const API_TIMEOUT = {
  personality: {
    desktop: 120000,    // 2 minutes for desktop
    mobile: 180000,     // 3 minutes for mobile
    tablet: 180000      // 3 minutes for tablet
  },
  chat: {
    desktop: 60000,     // 1 minute for desktop
    mobile: 90000,      // 1.5 minutes for mobile
    tablet: 90000       // 1.5 minutes for tablet
  },
  base: {
    desktop: 30000,     // 30 seconds for desktop
    mobile: 45000,      // 45 seconds for mobile
    tablet: 45000       // 45 seconds for tablet
  }
};

// Add device detection helper
function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

// Add interface for regeneration tracking
interface RegenerationContext {
  attempts: number;
  previousResponses: string[];
  styleVariation: number;
}

// Fix OpenAIError declaration - use a single exported class
export class OpenAIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'OpenAIError';
  }
}

// Add error types for timeouts
export class ModelUnavailableError extends OpenAIError {
  constructor(message = 'Model temporarily unavailable') {
    super(message, 503);
  }
}

export class TimeoutError extends OpenAIError {
  constructor(message = 'Request timed out due to slow connection') {
    super(message, 408);
    this.name = 'TimeoutError';
  }
}

export class PersonalityAnalysisTimeoutError extends TimeoutError {
  constructor(message = 'Personality analysis timed out - please try again') {
    super(message);
    this.name = 'PersonalityAnalysisTimeoutError';
  }
}

export class ChatResponseTimeoutError extends TimeoutError {
  constructor(message = 'Chat response timed out - please try again') {
    super(message);
    this.name = 'ChatResponseTimeoutError';
  }
}

export class MissingInterestsError extends OpenAIError {
  constructor(message = 'Failed to generate interests') {
    super(message, 422);
  }
}

export class MissingPsychoanalysisError extends OpenAIError {
  constructor(message = 'Failed to generate psychoanalysis') {
    super(message, 422);
  }
}

export class MissingSocialMetricsError extends OpenAIError {
  constructor(message = 'Failed to generate social behavior metrics') {
    super(message, 422);
  }
}

export class MissingEmotionalToneError extends OpenAIError {
  constructor(message = 'Failed to generate emotional tone analysis') {
    super(message, 422);
  }
}

// Add new error types
export class MissingVocabularyPatternsError extends OpenAIError {
  constructor(message = 'Failed to generate vocabulary patterns') {
    super(message, 422);
  }
}

export class MissingCommunicationPatternsError extends OpenAIError {
  constructor(message = 'Failed to generate communication patterns') {
    super(message, 422);
  }
}

// Add fallback configuration
const FALLBACK_CONFIG = {
  maxRetries: 10,
  maxInterestsRetries: 10,
  maxPsychoRetries: 10,
  maxSocialMetricsRetries: 10,
  maxEmotionalToneRetries: 10,
  fallbackModel: 'gpt-4o-mini',
  minTokens: 8000,
  maxTokens: 16000,
  defaultTemperature: 0.25,
  styleVariationStep: 0.1,
  maxStyleVariation: 0.3,
  personalityVariationStep: 0.05,
  maxPersonalityVariation: 0.2,
  minResponseQuality: 0.7,
  maxExampleTweets: 5
};

// Add regeneration context tracking 
const regenerationContexts = new Map<string, RegenerationContext>();

// Add new error class for analysis failures
export class PersonalityAnalysisError extends Error {
  constructor(message: string, public missingFields: string[]) {
    super(message);
    this.name = 'PersonalityAnalysisError';
  }
}

// Add validation function
function validateAnalysis(analysis: PersonalityAnalysis): { 
  isValid: boolean; 
  missingFields: string[];
  missingInterests: boolean;
  missingPsycho: boolean;
  missingSocialMetrics: boolean;
  missingEmotionalTone: boolean;
  missingVocabularyPatterns: boolean;
  missingCommunicationPatterns: boolean;
} {
  console.log('[Validation Debug] Starting analysis validation with fields:', Object.keys(analysis));
  
  const missingFields: string[] = [];
  let missingInterests = false;
  let missingPsycho = false;
  let missingSocialMetrics = false;
  let missingEmotionalTone = false;
  let missingVocabularyPatterns = false;
  let missingCommunicationPatterns = false;
  
  // Check required fields
  if (!analysis.summary || analysis.summary === 'Analysis summary not available') {
    console.log('[Validation Debug] Missing or invalid summary:', analysis.summary);
    missingFields.push('summary');
  }

  // Traits validation
  if (!analysis.traits || analysis.traits.length === 0 || 
      analysis.traits.every(t => !t.explanation)) {
    console.log('[Validation Debug] Missing or invalid traits:', analysis.traits);
    missingFields.push('traits');
  }

  // Interests validation
  if (!analysis.interests || analysis.interests.length === 0 || 
      (analysis.interests.length === 1 && analysis.interests[0] === 'General topics')) {
    console.log('[Validation Debug] Missing or invalid interests:', analysis.interests);
    missingFields.push('interests');
    missingInterests = true;
  }

  // Communication style validation
  const style = analysis.communicationStyle;
  if (!style.description || 
      style.description === 'Default communication style due to parsing error' ||
      !style.patterns.messageStructure.opening.length ||
      !style.patterns.messageStructure.framing.length ||
      !style.patterns.messageStructure.closing.length ||
      !style.contextualVariations.business ||
      !style.contextualVariations.casual ||
      !style.contextualVariations.technical ||
      !style.contextualVariations.crisis) {
    console.log('[Validation Debug] Missing or invalid communication style:', style);
    missingFields.push('communicationStyle');
    missingCommunicationPatterns = true;
  }

  // Vocabulary validation
  const vocab = analysis.vocabulary;
  if (!vocab.commonTerms || vocab.commonTerms.length === 0 ||
      !vocab.commonPhrases || vocab.commonPhrases.length === 0 ||
      !vocab.enthusiasmMarkers || vocab.enthusiasmMarkers.length === 0 ||
      !vocab.industryTerms || vocab.industryTerms.length === 0 ||
      !vocab.nGrams.bigrams || vocab.nGrams.bigrams.length === 0 ||
      !vocab.nGrams.trigrams || vocab.nGrams.trigrams.length === 0) {
    console.log('[Validation Debug] Missing or invalid vocabulary:', vocab);
    missingFields.push('vocabulary');
    missingVocabularyPatterns = true;
  }

  // Metrics validation
  if (!vocab.metrics || 
      !vocab.metrics.sentenceLengths ||
      !vocab.metrics.capitalizationStats ||
      vocab.metrics.averageMessageLength === 0 ||
      vocab.metrics.uniqueWordsCount === 0) {
    console.log('[Validation Debug] Missing or invalid vocabulary metrics:', vocab?.metrics);
    missingFields.push('vocabularyMetrics');
  }

  // Message architecture validation
  const architecture = vocab.metrics.messageArchitecture;
  if (!architecture ||
      Object.values(architecture.structureTypes).every(v => v === 0) ||
      Object.values(architecture.terminalPunctuation).every(v => v === 0) ||
      Object.values(architecture.characterMetrics).every(v => v === 0)) {
    console.log('[Validation Debug] Missing or invalid message architecture:', architecture);
    missingFields.push('messageArchitecture');
  }

  // Emotional tone validation
  if (!analysis.emotionalTone || 
      analysis.emotionalTone === 'Neutral' || 
      analysis.emotionalTone === 'Neutral emotional expression') {
    console.log('[Validation Debug] Missing or invalid emotional tone:', analysis.emotionalTone);
    missingFields.push('emotionalTone');
    missingEmotionalTone = true;
  }

  // Topics and themes validation
  if (!analysis.topicsAndThemes || analysis.topicsAndThemes.length === 0 || 
      (analysis.topicsAndThemes.length === 1 && analysis.topicsAndThemes[0] === 'General themes')) {
    console.log('[Validation Debug] Missing or invalid topics and themes:', analysis.topicsAndThemes);
    missingFields.push('topicsAndThemes');
  }

  // Emotional intelligence validation
  const ei = analysis.emotionalIntelligence;
  if (!ei.leadershipStyle || 
      !ei.challengeResponse || 
      !ei.analyticalTone ||
      !ei.supportivePatterns || ei.supportivePatterns.length === 0 ||
      ei.leadershipStyle === 'Standard' ||
      ei.challengeResponse === 'Balanced' ||
      ei.analyticalTone === 'Neutral') {
    console.log('[Validation Debug] Missing or invalid emotional intelligence:', ei);
    missingFields.push('thoughtProcess');
    missingPsycho = true;
  }

  // Thought process validation
  const tp = analysis.thoughtProcess;
  if (!tp.initialApproach ||
      !tp.processingStyle ||
      !tp.expressionStyle) {
    console.log('[Validation Debug] Missing or invalid thought process:', tp);
    missingFields.push('thoughtProcessDetails');
  }

  // Social behavior metrics validation
  const metrics = analysis.socialBehaviorMetrics;
  const allZero = Object.values(metrics).every(value => value === 0);
  if (allZero) {
    console.log('[Validation Debug] Missing or invalid social behavior metrics:', metrics);
    missingFields.push('socialBehaviorMetrics');
    missingSocialMetrics = true;
  }

  console.log('[Validation Debug] Validation complete. Missing fields:', missingFields);

  return {
    isValid: missingFields.length === 0,
    missingFields,
    missingInterests,
    missingPsycho,
    missingSocialMetrics,
    missingEmotionalTone,
    missingVocabularyPatterns,
    missingCommunicationPatterns
  };
}

// Update system message to remove word count requirements

// Add new helper function for message architecture analysis
function analyzeMessageArchitecture(tweets: Tweet[]) {
  const architecture = {
    structureTypes: {
      singleWord: 0,
      shortPhrase: 0,
      actionOriented: 0,
      bulletedList: 0,
      streamOfConsciousness: 0
    },
    terminalPunctuation: {
      none: 0,
      period: 0,
      questionMark: 0,
      exclamationMark: 0,
      ellipsis: 0
    },
    characterMetrics: {
      averageLength: 0,
      shortMessages: 0,
      longMessages: 0
    },
    preferences: {
      usesMarkdown: false,
      usesBulletPoints: false,
      usesNumberedLists: false,
      usesCodeBlocks: false,
      preferredListStyle: 'none' as 'bullet' | 'numbered' | 'none'
    }
  };

  let totalCharacters = 0;
  const LONG_MESSAGE_THRESHOLD = 280; // Twitter's max length
  const SHORT_MESSAGE_THRESHOLD = 50;  // Arbitrary threshold for short messages

  tweets.forEach(tweet => {
    const text = tweet.text;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const charLength = text.length;
    totalCharacters += charLength;

    // Structure type analysis
    if (words.length === 1) {
      architecture.structureTypes.singleWord++;
    } else if (words.length <= 3) {
      architecture.structureTypes.shortPhrase++;
    }
    
    // Action-oriented detection (starts with verb)
    if (/^[A-Za-z]+(?:ed|ing|s|)\b/.test(text)) {
      architecture.structureTypes.actionOriented++;
    }

    // Bullet point detection
    if (text.includes('\n-') || text.includes('\n•')) {
      architecture.structureTypes.bulletedList++;
      architecture.preferences.usesBulletPoints = true;
    }

    // Numbered list detection
    if (/\n\d+\./.test(text)) {
      architecture.preferences.usesNumberedLists = true;
    }

    // Code block detection
    if (text.includes('```') || text.includes('`')) {
      architecture.preferences.usesCodeBlocks = true;
    }

    // Stream of consciousness (long messages with few punctuation marks)
    if (charLength > LONG_MESSAGE_THRESHOLD && text.split(/[.!?]+/).length <= 2) {
      architecture.structureTypes.streamOfConsciousness++;
    }

    // Terminal punctuation analysis
    if (!/[.!?…]$/.test(text.trim())) {
      architecture.terminalPunctuation.none++;
    } else {
      const lastChar = text.trim().slice(-1);
      if (lastChar === '.') architecture.terminalPunctuation.period++;
      else if (lastChar === '?') architecture.terminalPunctuation.questionMark++;
      else if (lastChar === '!') architecture.terminalPunctuation.exclamationMark++;
      else if (lastChar === '…' || text.endsWith('...')) architecture.terminalPunctuation.ellipsis++;
    }

    // Character-based metrics
    if (charLength < SHORT_MESSAGE_THRESHOLD) {
      architecture.characterMetrics.shortMessages++;
    }
    if (charLength > LONG_MESSAGE_THRESHOLD) {
      architecture.characterMetrics.longMessages++;
    }
  });

  // Calculate percentages
  const total = tweets.length;
  architecture.structureTypes.singleWord = (architecture.structureTypes.singleWord / total) * 100;
  architecture.structureTypes.shortPhrase = (architecture.structureTypes.shortPhrase / total) * 100;
  architecture.structureTypes.actionOriented = (architecture.structureTypes.actionOriented / total) * 100;
  architecture.structureTypes.bulletedList = (architecture.structureTypes.bulletedList / total) * 100;
  architecture.structureTypes.streamOfConsciousness = (architecture.structureTypes.streamOfConsciousness / total) * 100;

  architecture.terminalPunctuation.none = (architecture.terminalPunctuation.none / total) * 100;
  architecture.terminalPunctuation.period = (architecture.terminalPunctuation.period / total) * 100;
  architecture.terminalPunctuation.questionMark = (architecture.terminalPunctuation.questionMark / total) * 100;
  architecture.terminalPunctuation.exclamationMark = (architecture.terminalPunctuation.exclamationMark / total) * 100;
  architecture.terminalPunctuation.ellipsis = (architecture.terminalPunctuation.ellipsis / total) * 100;

  architecture.characterMetrics.averageLength = totalCharacters / total;
  architecture.characterMetrics.shortMessages = (architecture.characterMetrics.shortMessages / total) * 100;
  architecture.characterMetrics.longMessages = (architecture.characterMetrics.longMessages / total) * 100;

  // Determine preferred list style
  if (architecture.preferences.usesBulletPoints && !architecture.preferences.usesNumberedLists) {
    architecture.preferences.preferredListStyle = 'bullet';
  } else if (!architecture.preferences.usesBulletPoints && architecture.preferences.usesNumberedLists) {
    architecture.preferences.preferredListStyle = 'numbered';
  }

  return architecture;
}

function categorizeWord(word: string): 'pronoun' | 'modal' | 'adjective' | 'verb' | 'noun' | 'other' {
  const pronouns = ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'];
  const modals = ['can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must'];
  const commonAdjectives = ['good', 'great', 'nice', 'bad', 'best', 'better', 'worse', 'worst'];
  const commonVerbs = ['is', 'are', 'was', 'were', 'be', 'have', 'has', 'had', 'do', 'does', 'did'];
  
  word = word.toLowerCase();
  
  if (pronouns.includes(word)) return 'pronoun';
  if (modals.includes(word)) return 'modal';
  if (commonAdjectives.includes(word)) return 'adjective';
  if (commonVerbs.includes(word)) return 'verb';
  // Basic noun detection (this is simplified)
  if (word.match(/^[a-z]+[^s]s$/)) return 'noun';  // Plural nouns
  
  return 'other';
}

// Update the analyzeLinguisticMetrics function to include message architecture
function analyzeLinguisticMetrics(tweets: Tweet[]) {
  const wordMap = new Map<string, number>();
  const sentenceLengths = {
    veryShort: 0,
    short: 0,
    medium: 0,
    long: 0,
    veryLong: 0,
    total: 0
  };
  const capStats = {
    lowercase: 0,
    sentenceCase: 0,
    mixedCase: 0,
    totalMessages: tweets.length
  };
  let totalWords = 0;
  const uniqueWords = new Set<string>();

  // Analyze each tweet
  tweets.forEach(tweet => {
    const text = tweet.text;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    totalWords += wordCount;

    // Word frequency and unique words
    words.forEach(word => {
      const normalized = word.toLowerCase();
      uniqueWords.add(normalized);
      wordMap.set(normalized, (wordMap.get(normalized) || 0) + 1);
    });

    // Sentence length categorization
    if (wordCount <= 5) sentenceLengths.veryShort++;
    else if (wordCount <= 10) sentenceLengths.short++;
    else if (wordCount <= 20) sentenceLengths.medium++;
    else if (wordCount <= 40) sentenceLengths.long++;
    else sentenceLengths.veryLong++;
    sentenceLengths.total++;

    // Capitalization analysis
    if (text === text.toLowerCase()) capStats.lowercase++;
    else if (text === text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()) capStats.sentenceCase++;
    else capStats.mixedCase++;
  });

  // Calculate distributions
  const distribution = {
    veryShort: (sentenceLengths.veryShort / sentenceLengths.total) * 100,
    short: (sentenceLengths.short / sentenceLengths.total) * 100,
    medium: (sentenceLengths.medium / sentenceLengths.total) * 100,
    long: (sentenceLengths.long / sentenceLengths.total) * 100,
    veryLong: (sentenceLengths.veryLong / sentenceLengths.total) * 100
  };

  // Calculate capitalization percentages
  const capPercentages = {
    lowercase: (capStats.lowercase / capStats.totalMessages) * 100,
    sentenceCase: (capStats.sentenceCase / capStats.totalMessages) * 100,
    mixedCase: (capStats.mixedCase / capStats.totalMessages) * 100,
    totalMessages: capStats.totalMessages
  };

  // Sort words by frequency and convert to array with percentages
  const sortedTerms = Array.from(wordMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)  // Keep top 20 most frequent terms
    .map(([term, frequency]) => ({
      term,
      frequency,
      percentage: (frequency / totalWords) * 100,
      category: categorizeWord(term)
    }));

  const architecture = analyzeMessageArchitecture(tweets);
  
  return {
    commonTerms: sortedTerms,
    metrics: {
      sentenceLengths: {
        ...sentenceLengths,
        distribution
      },
      capitalizationStats: capPercentages,
      averageMessageLength: totalWords / tweets.length,
      uniqueWordsCount: uniqueWords.size,
      totalWordsAnalyzed: totalWords,
      messageArchitecture: architecture
    }
  };
}

// Add constants
const MAX_ANALYSIS_RETRIES = 10; // Increased from 3 to 10 for better network error handling
let globalAbortController: AbortController | null = null;

// Add interfaces
interface AnalysisResult {
  success: boolean;
  data?: Partial<PersonalityAnalysis>;
  error?: Error;
}

// Add type for ProgressiveLoadingState
interface ProgressiveLoadingState {
  stage: 'initial' | 'traits' | 'interests' | 'social' | 'communication' | 'complete' | 'analyzing';
  progress: number;
}

// Add cleanup function
function cleanup() {
  if (globalAbortController) {
    globalAbortController.abort('Operation cancelled');
    globalAbortController = null;
  }
}

// Add event listeners at the module level
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('unload', cleanup);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      cleanup();
    }
  });
}

// Update the analysis flow
async function processTweetAnalysis(
  tweets: Tweet[],
  profile: OpenAITwitterProfile,
  analysisType: keyof typeof ANALYSIS_CHUNKS,
  params: {
    regenerationKey?: string;
    signal?: AbortSignal;
    onProgress?: (state: ProgressiveLoadingState) => void;
    isMobileOrTablet?: boolean;
    customPrompt?: {
      prompt: string;
      context: string;
    };
    currentTuning?: PersonalityTuning;
  }
): Promise<AnalysisResult> {
  try {
    console.log(`[Analysis Debug] Starting analysis for ${analysisType} with ${tweets.length} tweets`);

    // For vocabulary analysis, first analyze linguistic metrics
    let initialData: Partial<PersonalityAnalysis> = {};
    if (analysisType === 'VOCABULARY') {
      const { commonTerms, metrics } = analyzeLinguisticMetrics(tweets);
      initialData = {
        vocabulary: {
          commonTerms,
          commonPhrases: [],
          enthusiasmMarkers: [],
          industryTerms: [],
          nGrams: {
            bigrams: [],
            trigrams: []
          },
          metrics
        }
      };
    }

    const tweetTexts = tweets.map(t => t.text).join('\n');
    const exampleTweets = selectRepresentativeTweets(tweets, {} as PersonalityAnalysis);
    const tweetExamples = exampleTweets.map(t => t.text).join('\n\n');

    const result = await analyzeChunk(analysisType, {
      profile,
      tweetTexts,
      tweetExamples,
      retryCount: 0,
      ...params
    });

    if (result.success && result.data) {
      console.log(`[Analysis Debug] Successfully analyzed ${analysisType}:`, {
        resultKeys: Object.keys(result.data)
      });

      // Merge with initial data if any
      if (Object.keys(initialData).length > 0) {
        result.data = {
          ...result.data,
          ...initialData
        };
      }
      
      // Update progress
      if (params.onProgress) {
        const progressMap: Record<keyof typeof ANALYSIS_CHUNKS, number> = {
          BASIC_INFO: 20,
          INTERESTS: 40,
          SOCIAL_METRICS: 60,
          COMMUNICATION: 80,
          VOCABULARY: 90,
          EMOTIONAL: 100
        };
        
        params.onProgress({
          stage: analysisType.toLowerCase() as ProgressiveLoadingState['stage'],
          progress: progressMap[analysisType] || 0
        });
      }
    }

    return result;

  } catch (error) {
    // Let ChunkAbortedError propagate up
    if (error instanceof ChunkAbortedError) {
      throw error;
    }

    console.error(`[Analysis Debug] Error processing ${analysisType}:`, error);
    return {
      success: false,
      error: error as Error
    };
  }
}

// Helper function to get relevant fields for each chunk type
function getRelevantFields(chunkType: keyof typeof ANALYSIS_CHUNKS): string[] {
  switch (chunkType) {
    case 'BASIC_INFO':
      return ['summary', 'traits'];
    case 'INTERESTS':
      return ['interests'];
    case 'SOCIAL_METRICS':
      return ['socialBehaviorMetrics'];
    case 'COMMUNICATION':
      return ['communicationStyle'];
    case 'VOCABULARY':
      return ['vocabulary', 'vocabularyMetrics'];
    case 'EMOTIONAL':
      return ['emotionalIntelligence', 'emotionalTone', 'thoughtProcess'];
    default:
      return [];
  }
}
            
// Helper function to throw appropriate error based on missing fields
function throwAppropriateError(missingFields: string[]): never {
  if (missingFields.includes('interests')) {
    throw new MissingInterestsError();
  }
  if (missingFields.includes('psychoanalysis') || missingFields.includes('thoughtProcess')) {
    throw new MissingPsychoanalysisError();
  }
  if (missingFields.includes('socialBehaviorMetrics')) {
    throw new MissingSocialMetricsError();
  }
  if (missingFields.includes('emotionalTone')) {
    throw new MissingEmotionalToneError();
  }
  if (missingFields.includes('vocabulary') || missingFields.includes('vocabularyMetrics')) {
    throw new MissingVocabularyPatternsError();
  }
  if (missingFields.includes('communicationStyle')) {
    throw new MissingCommunicationPatternsError();
  }
            
  throw new PersonalityAnalysisError(
    'Failed to generate complete chunk analysis after multiple attempts',
    missingFields
  );
}
            

// Add helper to determine if an error is critical
function isCriticalError(error: Error): boolean {
  return !(error instanceof MissingInterestsError ||
          error instanceof MissingPsychoanalysisError ||
          error instanceof MissingSocialMetricsError ||
          error instanceof MissingEmotionalToneError ||
          error instanceof MissingVocabularyPatternsError ||
          error instanceof MissingCommunicationPatternsError);
}

// Add interface for job type
interface AnalysisJobStatus {
  status: string;
  progress: number;
  error?: string;
  processed_chunks: number;
}

// Helper function to get retry count for a specific chunk type
function getChunkRetryCount(
  chunkType: AnalysisChunkType,
  retries: {
    retryCount: number;
    interestsRetryCount: number;
    psychoRetryCount: number;
    socialMetricsRetryCount: number;
    emotionalToneRetryCount: number;
    vocabularyPatternsRetryCount: number;
    communicationPatternsRetryCount: number;
  }
): number {
  const chunkName = CHUNK_TYPE_TO_NAME[chunkType];
  switch (chunkName) {
    case 'INTERESTS':
      return retries.interestsRetryCount;
    case 'SOCIAL_METRICS':
      return retries.socialMetricsRetryCount;
    case 'EMOTIONAL':
      return retries.emotionalToneRetryCount;
    case 'VOCABULARY':
      return retries.vocabularyPatternsRetryCount;
    case 'COMMUNICATION':
      return retries.communicationPatternsRetryCount;
    default:
      return retries.retryCount;
  }
}

// Add new error type
export class ChunkAbortedError extends Error {
  constructor(
    message: string,
    public chunkType: AnalysisChunkType,
    public completedChunks: Set<AnalysisChunkType>
  ) {
    super(message);
    this.name = 'ChunkAbortedError';
  }
}

export async function analyzePersonality(
  tweets: Tweet[],
  profile: OpenAITwitterProfile,
  prompt?: string,
  context?: string,
  regenerationKey?: string,
  retryCount: number = 0,
  interestsRetryCount: number = 0,
  psychoRetryCount: number = 0,
  socialMetricsRetryCount: number = 0,
  emotionalToneRetryCount: number = 0,
  vocabularyPatternsRetryCount: number = 0,
  communicationPatternsRetryCount: number = 0,
  currentTuning?: PersonalityTuning,
  onProgress?: (state: ProgressiveLoadingState) => void,
  signal?: AbortSignal,
  userId?: string,
  startFromChunk: AnalysisChunkType = AnalysisChunkType.BASIC_INFO
): Promise<PersonalityAnalysis | { response: string }> {
  // Create new abort controller for this analysis
  if (globalAbortController) {
    cleanup();
  }
  globalAbortController = new AbortController();

  // Combine the global abort signal with any provided signal
  const abortSignal = signal 
    ? AbortSignal.any([signal, globalAbortController.signal])
    : globalAbortController.signal;

  const deviceType = getDeviceType();
  const isMobileOrTablet = deviceType !== 'desktop';

  // Initialize database if userId is provided
  const db = userId ? await initDB() : null;
  let jobId: number | null = null;

  try {
    // Create analysis job in database if userId is provided
    if (db && userId) {
      jobId = await db.createAnalysisJob(userId, Object.keys(ANALYSIS_CHUNKS).length);
      console.log(`[Analysis Debug] Created analysis job ${jobId} for user ${userId}`);
    }

    // Update progress
    const updateProgress = (stage: ProgressiveLoadingState['stage'], progress: number) => {
      onProgress?.({ stage, progress });
    };

    updateProgress('initial', 0);

    // Filter valid tweets with minimum word count
    const validTweets = tweets.filter((t): t is Tweet & { text: string } => 
      typeof t.text === 'string' && 
      t.text.length > 0 && 
      countWords(t.text) >= MIN_WORDS
    );

    // If it's a custom prompt with context, use a single analysis
    if (prompt && context) {
      const result = await analyzeChunk(
        'BASIC_INFO',
        {
          profile,
          tweetTexts: validTweets.map(t => t.text).join('\n'),
          tweetExamples: selectRepresentativeTweets(tweets, {} as PersonalityAnalysis).map(t => t.text).join('\n\n'),
          retryCount,
          regenerationKey,
          signal: abortSignal,
          onProgress,
          isMobileOrTablet,
          customPrompt: {
            prompt,
            context
          }
        }
      );

      if (!result.success) {
        throw result.error;
      }

      return { response: result.data?.summary || 'Analysis failed' };
    }

    // Get current chunk from database if job exists, otherwise use startFromChunk
    let currentChunkType = startFromChunk;
    if (jobId && db) {
      const job = await db.getAnalysisJob(jobId) as AnalysisJobStatus | null;
      if (job && 'processed_chunks' in job) {
        // Get the next chunk to process based on processed_chunks
        currentChunkType = (job.processed_chunks + 1) as AnalysisChunkType;
        console.log(`[Analysis Debug] Resuming from chunk type ${currentChunkType} (${CHUNK_TYPE_TO_NAME[currentChunkType]})`);
      }
    }

    const analysisResults: Partial<PersonalityAnalysis> = {};
    const errors: Array<{ type: keyof typeof ANALYSIS_CHUNKS; error: Error }> = [];
    const completedChunks = new Set<AnalysisChunkType>();

    // Process each analysis type sequentially starting from current chunk
    while (currentChunkType <= AnalysisChunkType.EMOTIONAL) {
      // Skip if we've already completed this chunk
      if (completedChunks.has(currentChunkType)) {
        currentChunkType++;
        continue;
      }

      const chunkName = CHUNK_TYPE_TO_NAME[currentChunkType];
      console.log(`[Analysis Debug] Processing chunk ${chunkName} (${currentChunkType})`);

      try {
        // Add delay between analysis types to avoid rate limiting
        if (Object.keys(analysisResults).length > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Update job status if we have a jobId
        if (db && jobId) {
          await db.updateAnalysisStatus(jobId, 'processing');
        }

        const result = await processTweetAnalysis(
          validTweets,
          profile,
          chunkName,
          {
            regenerationKey,
            signal: abortSignal,
            onProgress,
            isMobileOrTablet,
            customPrompt: prompt && context ? { prompt, context } : undefined,
            currentTuning
          }
        );

        if (result.success && result.data) {
          Object.assign(analysisResults, result.data);
          completedChunks.add(currentChunkType);

          // Store chunk result in database using enum as index
          if (db && jobId) {
            await db.saveAnalysisChunk(jobId, {
              index: currentChunkType,
              result: result.data,
              tweetCount: validTweets.length
            });
            await db.incrementProcessedChunks(jobId);
            console.log(`[Analysis Debug] Saved chunk ${currentChunkType} (${chunkName}) to database`);
          }

          // Move to next chunk
          currentChunkType++;
          onProgress?.({
            stage: 'analyzing',
            progress: (currentChunkType / Object.keys(ANALYSIS_CHUNKS).length) * 100
          });
          continue;
        }

        if (result.error) {
          // Handle ChunkAbortedError specially
          if (result.error instanceof ChunkAbortedError) {
            result.error.completedChunks = completedChunks;
            throw result.error;
          }

          // Get retry count for this chunk type
          const chunkRetryCount = getChunkRetryCount(currentChunkType, {
            retryCount,
            interestsRetryCount,
            psychoRetryCount,
            socialMetricsRetryCount,
            emotionalToneRetryCount,
            vocabularyPatternsRetryCount,
            communicationPatternsRetryCount
          });

          // Only throw if we've exceeded retries
          if (chunkRetryCount >= MAX_ANALYSIS_RETRIES) {
            throw result.error;
          }

          // Otherwise retry this chunk
          console.log(`[Analysis Debug] Retrying chunk ${currentChunkType} (${chunkName}) (attempt ${chunkRetryCount + 1}/${MAX_ANALYSIS_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, chunkRetryCount) * 1000));
          
          // Update the appropriate retry count based on chunk type
          switch (chunkName) {
            case 'INTERESTS':
              interestsRetryCount++;
              break;
            case 'SOCIAL_METRICS':
              socialMetricsRetryCount++;
              break;
            case 'EMOTIONAL':
              emotionalToneRetryCount++;
              break;
            case 'VOCABULARY':
              vocabularyPatternsRetryCount++;
              break;
            case 'COMMUNICATION':
              communicationPatternsRetryCount++;
              break;
            default:
              retryCount++;
          }
          
          continue; // Retry the same chunk
        }

        // Check for abort signal after each analysis type
        if (abortSignal.aborted) {
          if (db && jobId) {
            await db.updateAnalysisStatus(
              jobId,
              'failed',
              'Analysis aborted: ' + abortSignal.reason
            );
          }
          throw new Error('Analysis aborted: ' + abortSignal.reason);
        }

      } catch (error) {
        if (error instanceof ChunkAbortedError) {
          error.completedChunks = completedChunks;
          throw error;
        }

        errors.push({ type: chunkName, error: error as Error });
        
        // Get retry count for this chunk type
        const chunkRetryCount = getChunkRetryCount(currentChunkType, {
          retryCount,
          interestsRetryCount,
          psychoRetryCount,
          socialMetricsRetryCount,
          emotionalToneRetryCount,
          vocabularyPatternsRetryCount,
          communicationPatternsRetryCount
        });

        // Update job status with error but preserve chunk progress
        if (db && jobId) {
          await db.updateAnalysisStatus(jobId, 'failed', error instanceof Error ? error.message : String(error));
        }

        // Handle abort errors specifically
        if (error instanceof Error && error.message.includes('Analysis aborted')) {
          console.log('Analysis aborted:', error.message);
          throw error;
        }

        // Only throw if we've exceeded retries for this chunk
        if (chunkRetryCount >= MAX_ANALYSIS_RETRIES) {
          console.log(`[Analysis Debug] Max retries (${MAX_ANALYSIS_RETRIES}) exceeded for chunk ${currentChunkType} (${chunkName}), stopping analysis:`, error);
          throw error;
        }

        // Otherwise, retry this chunk with incremented retry count
        console.log(`[Analysis Debug] Retrying chunk ${currentChunkType} (${chunkName}) (attempt ${chunkRetryCount + 1}/${MAX_ANALYSIS_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, chunkRetryCount) * 1000));
        
        // Update the appropriate retry count based on chunk type
        switch (chunkName) {
          case 'INTERESTS':
            interestsRetryCount++;
            break;
          case 'SOCIAL_METRICS':
            socialMetricsRetryCount++;
            break;
          case 'EMOTIONAL':
            emotionalToneRetryCount++;
            break;
          case 'VOCABULARY':
            vocabularyPatternsRetryCount++;
            break;
          case 'COMMUNICATION':
            communicationPatternsRetryCount++;
            break;
          default:
            retryCount++;
        }
        
        continue; // Retry the same chunk
      }
    }

    // Process the valid analysis
    const processedAnalysis: PersonalityAnalysis = {
      ...getDefaultAnalysis(),
      ...analysisResults,
      traits: analysisResults.traits ? mergeSimilarTraits(analysisResults.traits) : [],
      interests: analysisResults.interests ? consolidateInterests(analysisResults.interests) : ['General topics'],
      topicsAndThemes: analysisResults.topicsAndThemes ? consolidateInterests(analysisResults.topicsAndThemes) : ['General themes']
    };

    // Validate the final analysis
    const validation = validateAnalysis(processedAnalysis);
    if (!validation.isValid) {
      console.warn('Final analysis validation failed. Missing fields:', validation.missingFields);
      
      // Update job status with validation error if we have a jobId
      if (db && jobId) {
        await db.updateAnalysisStatus(
          jobId,
          'failed',
          `Validation failed: missing fields ${validation.missingFields.join(', ')}`
        );
      }

      // Throw appropriate error based on missing fields
      throwAppropriateError(validation.missingFields);
    }

    // Mark job as completed if we have a jobId
    if (db && jobId) {
      await db.updateAnalysisStatus(jobId, 'completed');
    }

    return processedAnalysis;

  } catch (error) {
    if (error instanceof ChunkAbortedError) {
      // Resume from the aborted chunk, preserving completed chunks
      return analyzePersonality(
        tweets,
        profile,
        prompt,
        context,
        regenerationKey,
        retryCount,
        interestsRetryCount,
        psychoRetryCount,
        socialMetricsRetryCount,
        emotionalToneRetryCount,
        vocabularyPatternsRetryCount,
        communicationPatternsRetryCount,
        currentTuning,
        onProgress,
        signal,
        userId,
        error.chunkType // Resume from the aborted chunk
      );
    }

    console.error('Error in personality analysis:', error);
    
    // Update job status with error if we have a jobId
    if (db && jobId) {
      await db.updateAnalysisStatus(
        jobId,
        'failed',
        error instanceof Error ? error.message : String(error)
      );
    }

    // Handle mobile/tablet specific error handling
    if (error instanceof PersonalityAnalysisTimeoutError && isMobileOrTablet) {
      console.warn('Mobile/tablet timeout - will retry with increased timeout');
      const currentTimeout = API_TIMEOUT.personality[deviceType];
      API_TIMEOUT.personality[deviceType] = currentTimeout * 1.5;
      return analyzePersonality(
        tweets, 
        profile, 
        prompt, 
        context, 
        regenerationKey, 
        retryCount,
        interestsRetryCount,
        psychoRetryCount,
        socialMetricsRetryCount,
        emotionalToneRetryCount,
        vocabularyPatternsRetryCount,
        communicationPatternsRetryCount,
        currentTuning,
        onProgress,
        abortSignal,
        userId,
        startFromChunk
      );
    }
    
    // If we hit max retries or get a critical error, throw it up
    if (error instanceof PersonalityAnalysisError || 
        retryCount >= MAX_ANALYSIS_RETRIES ||
        (error instanceof Error && isCriticalError(error))) {
      throw error;
    }
    
    // For other errors, retry the analysis but preserve completed chunks
    if (retryCount < MAX_ANALYSIS_RETRIES) {
      console.log(`Retrying personality analysis due to error (attempt ${retryCount + 1}/${MAX_ANALYSIS_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      return analyzePersonality(
        tweets, 
        profile, 
        prompt, 
        context, 
        regenerationKey, 
        retryCount + 1,
        interestsRetryCount,
        psychoRetryCount,
        socialMetricsRetryCount,
        emotionalToneRetryCount,
        vocabularyPatternsRetryCount,
        communicationPatternsRetryCount,
        currentTuning,
        onProgress,
        abortSignal,
        userId,
        startFromChunk
      );
    }
    
    // If all retries fail, return safe default
    return getDefaultAnalysis();
  } finally {
    // Clear the abort controller if this analysis is done
    if (globalAbortController?.signal === abortSignal) {
      cleanup();
    }
  }
}

// Helper function to get default analysis
function getDefaultAnalysis(): PersonalityAnalysis {
  return {
    summary: 'Analysis temporarily unavailable',
    traits: [{
      name: 'Neutral',
      score: 5,
      explanation: 'Default trait due to analysis failure after multiple attempts'
    }],
    interests: ['General topics'],
    socialBehaviorMetrics: {
      oversharer: 0,
      replyGuy: 0,
      viralChaser: 0,
      threadMaker: 0,
      retweeter: 0,
      hotTaker: 0,
      joker: 0,
      debater: 0,
      doomPoster: 0,
      earlyAdopter: 0,
      knowledgeDropper: 0,
      hypeBeast: 0
    },
    communicationStyle: {
      formality: 'low',
      enthusiasm: 'low',
      technicalLevel: 'low',
      emojiUsage: 'low',
      verbosity: 'low',
      description: 'Default communication style due to analysis failure after multiple attempts',
      patterns: {
        capitalization: 'mixed',
        punctuation: [],
        lineBreaks: 'minimal',
        messageStructure: {
          opening: [],
          framing: [],
          closing: []
        }
      },
      contextualVariations: {
        business: 'Standard professional communication',
        casual: 'Relaxed and approachable',
        technical: 'Clear and precise',
        crisis: 'Direct and solution-focused'
      }
    },
    vocabulary: {
      commonTerms: [],
      commonPhrases: [],
      enthusiasmMarkers: [],
      industryTerms: [],
      nGrams: {
        bigrams: [],
        trigrams: []
      },
      metrics: {
        sentenceLengths: {
          veryShort: 0,
          short: 0,
          medium: 0,
          long: 0,
          veryLong: 0,
          distribution: {
            veryShort: 0,
            short: 0,
            medium: 0,
            long: 0,
            veryLong: 0
          }
        },
        capitalizationStats: {
          lowercase: 0,
          sentenceCase: 0,
          mixedCase: 0,
          totalMessages: 0
        },
        averageMessageLength: 0,
        uniqueWordsCount: 0,
        totalWordsAnalyzed: 0,
        messageArchitecture: {
          structureTypes: {
            singleWord: 0,
            shortPhrase: 0,
            actionOriented: 0,
            bulletedList: 0,
            streamOfConsciousness: 0
          },
          terminalPunctuation: {
            none: 0,
            period: 0,
            questionMark: 0,
            exclamationMark: 0,
            ellipsis: 0
          },
          characterMetrics: {
            averageLength: 0,
            shortMessages: 0,
            longMessages: 0
          },
          preferences: {
            usesMarkdown: false,
            usesBulletPoints: false,
            usesNumberedLists: false,
            usesCodeBlocks: false,
            preferredListStyle: 'none'
          }
        }
      }
    },
    emotionalIntelligence: {
      leadershipStyle: 'Standard',
      challengeResponse: 'Balanced',
      analyticalTone: 'Neutral',
      supportivePatterns: []
    },
    topicsAndThemes: ['General themes'],
    emotionalTone: 'Neutral',
    thoughtProcess: {
      initialApproach: 'Standard analytical approach',
      processingStyle: 'Methodical and structured',
      expressionStyle: 'Balanced consideration'
    }
  };
}

function assessResponseQuality(
  response: string,
  previousResponses?: string[]
): number {
  let score = 1.0;

  // Check response length
  if (response.length < 50) score *= 0.8;
  if (response.length > 500) score *= 0.9;

  // Check for repetitive patterns
  const repetitionPenalty = (response.match(/(.{10,})\1/g) || []).length * 0.1;
  score -= repetitionPenalty;

  // Check variation from previous responses
  if (previousResponses?.length) {
    const similarityScores = previousResponses.map(prev => {
      const words = new Set([
        ...response.toLowerCase().split(/\W+/),
        ...prev.toLowerCase().split(/\W+/)
      ]);
      const commonWords = response.toLowerCase().split(/\W+/)
        .filter(word => prev.toLowerCase().includes(word)).length;
      return commonWords / words.size;
    });

    const avgSimilarity = similarityScores.reduce((a, b) => a + b, 0) / similarityScores.length;
    if (avgSimilarity > 0.7) score *= 0.8;
  }

  // Ensure score is between 0 and 1
  return Math.max(0, Math.min(1, score));
}

// Add tweet example selection
function selectRepresentativeTweets(tweets: Tweet[], analysis: Partial<PersonalityAnalysis>): Tweet[] {
  // Filter valid tweets
  const validTweets = tweets.filter((t: Tweet): t is Tweet & { text: string } => 
    typeof t.text === 'string' && 
    t.text.length > 0 && 
    t.text.length < 280 && // Standard tweet length
    !t.text.startsWith('RT ') && // Skip retweets
    !t.text.startsWith('@') // Skip direct replies
  );

  // If no analysis yet, just return a random selection of valid tweets
  if (!analysis || Object.keys(analysis).length === 0) {
    return validTweets
      .sort(() => Math.random() - 0.5)
      .slice(0, FALLBACK_CONFIG.maxExampleTweets);
  }

  // Score tweets based on personality traits and communication style
  const scoredTweets = validTweets.map(tweet => {
    let score = 0;
    
    // Check for trait expressions if available
    if (analysis.traits?.length) {
      analysis.traits.forEach(trait => {
        if (trait.name) {
          const traitRegex = new RegExp(trait.name, 'i');
          if (traitRegex.test(tweet.text)) {
            score += 1;
          }
        }
      });
    }

    // Check communication style if available
    const style = analysis.communicationStyle;
    if (style) {
      const hasEmojis = /[\p{Emoji}]/gu.test(tweet.text);
      
      // Match emoji usage level
      if ((style.emojiUsage === 'high' && hasEmojis) || 
          (style.emojiUsage === 'low' && !hasEmojis) ||
          (style.emojiUsage === 'medium' && hasEmojis && (tweet.text.match(/[\p{Emoji}]/gu)?.length ?? 0) <= 2)) {
        score += 1;
      }

      // Match enthusiasm level
      const exclamationCount = (tweet.text.match(/!/g) || []).length;
      if ((style.enthusiasm === 'high' && exclamationCount > 2) || 
          (style.enthusiasm === 'low' && exclamationCount === 0) ||
          (style.enthusiasm === 'medium' && exclamationCount <= 2)) {
        score += 1;
      }
    }

    // Check for interests if available
    if (analysis.interests?.length) {
      analysis.interests.forEach(interest => {
        if (interest) {
          if (tweet.text.toLowerCase().includes(interest.toLowerCase())) {
            score += 1;
          }
        }
      });
    }

    return { tweet, score };
  });

  // Sort by score and return top examples
  return scoredTweets
    .sort((a, b) => b.score - a.score)
    .slice(0, FALLBACK_CONFIG.maxExampleTweets)
    .map(t => t.tweet);
}

// Export the necessary items for retry.ts
export { 
  API_TIMEOUT, 
  getDeviceType
};

// Add back the analyzeChunk function
async function analyzeChunk(
  chunkType: keyof typeof ANALYSIS_CHUNKS,
  params: {
    profile: OpenAITwitterProfile,
    tweetTexts: string,
    tweetExamples: string,
    retryCount: number,
    regenerationKey?: string,
    signal?: AbortSignal,
    onProgress?: (state: ProgressiveLoadingState) => void;
    isMobileOrTablet?: boolean;
    customPrompt?: {
      prompt: string;
      context: string;
    }
  }
): Promise<AnalysisResult> {
  try {
    console.log(`[OpenAI Debug] Starting analysis for chunk type: ${chunkType}`);
    
    // Update progress for mobile/tablet
    if (params.isMobileOrTablet && params.onProgress) {
      const progressMap: Record<keyof typeof ANALYSIS_CHUNKS, number> = {
        BASIC_INFO: 20,
        INTERESTS: 40,
        SOCIAL_METRICS: 60,
        COMMUNICATION: 80,
        VOCABULARY: 90,
        EMOTIONAL: 100
      };

      const currentProgress = progressMap[chunkType] || 0;
      params.onProgress({
        stage: chunkType.toLowerCase() as ProgressiveLoadingState['stage'],
        progress: currentProgress
      });
      
      // Small delay for UI
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const promptText = params.customPrompt 
      ? `${params.customPrompt.context}\n\n${params.customPrompt.prompt}`
      : generateChunkPrompt(ANALYSIS_CHUNKS[chunkType], {
          profileInfo: `Name: ${params.profile.name || 'Unknown'}
Bio: ${params.profile.bio || 'No bio available'}
Followers: ${params.profile.followersCount?.toString() || 'Unknown'}
Following: ${params.profile.followingCount?.toString() || 'Unknown'}`,
          tweetTexts: params.tweetTexts,
          tweetExamples: params.tweetExamples
      });

    console.log(`[OpenAI Debug] Generated prompt for ${chunkType}:`, {
      promptLength: promptText.length,
      firstLine: promptText.split('\n')[0],
      lastLine: promptText.split('\n').pop()
    });

    const completion = await retryWithExponentialBackoff(async () => {
      console.log(`[OpenAI Debug] Starting retry attempt for ${chunkType}`);
      
      // Get regeneration context if key provided
      let styleVariation = 0;
      if (params.regenerationKey) {
        const regen = regenerationContexts.get(params.regenerationKey) || {
          attempts: 0,
          previousResponses: [],
          styleVariation: 0
        };
        regen.attempts++;
        styleVariation = Math.min(
          FALLBACK_CONFIG.maxStyleVariation,
          regen.attempts * FALLBACK_CONFIG.styleVariationStep
        );
        regenerationContexts.set(params.regenerationKey, regen);
      }

      const abortController = new AbortController();
      const deviceType = getDeviceType();
      const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT.personality[deviceType]);
      
      try {
        const messages: [ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam] = [
          {
            role: "system",
            content: systemMessage
          },
          {
            role: "user",
            content: promptText
          }
        ];

        const requestConfig = {
          model: "gpt-4o-mini",
          messages,
          temperature: 0.7 + styleVariation,
          max_tokens: 1000,
          presence_penalty: 0.6,
          frequency_penalty: 0.5,
          top_p: 0.9
        } as const;

        console.log(`[OpenAI Debug] Making API call for ${chunkType} with config:`, {
          ...requestConfig,
          messages: messages.map(m => ({ 
            role: m.role, 
            contentLength: m.content.length,
            contentPreview: m.content.slice(0, 100) + '...' 
          }))
        });
        
        const result = await openai.chat.completions.create(requestConfig, {
          signal: AbortSignal.any([abortController.signal, params.signal].filter(Boolean) as AbortSignal[])
        }).catch(error => {
          console.error(`[OpenAI Debug] API call failed for ${chunkType}:`, {
            name: error.name,
            message: error.message,
            status: error.status,
            stack: error.stack,
            response: error.response?.data
          });
          throw error;
        });

        console.log(`[OpenAI Debug] Received API response for ${chunkType}:`, {
          status: 'success',
          responseLength: result.choices[0].message.content?.length || 0,
          finishReason: result.choices[0].finish_reason,
          contentPreview: result.choices[0].message.content?.slice(0, 200) + '...',
          usage: result.usage
        });

        clearTimeout(timeoutId);

        if (!result.choices[0].message.content) {
          throw new Error('OpenAI returned empty response');
        }

        // Log raw response to file and console
        logRawResponse(chunkType, result.choices[0].message.content);
        console.log(`[OpenAI Debug] Raw response for ${chunkType}:`, result.choices[0].message.content);

        const responseContent = result.choices[0].message.content;
        const qualityScore = assessResponseQuality(
          responseContent,
          params.regenerationKey ? regenerationContexts.get(params.regenerationKey)?.previousResponses : undefined
        );

        console.log(`[OpenAI Debug] Response quality score for ${chunkType}: ${qualityScore}`);

        if (qualityScore < FALLBACK_CONFIG.minResponseQuality) {
          throw new Error('Response quality below threshold');
        }

        // Store response if regenerating
        if (params.regenerationKey) {
          const regen = regenerationContexts.get(params.regenerationKey)!;
          regen.previousResponses.push(responseContent);
        }

        return result;

      } catch (error: unknown) {
        clearTimeout(timeoutId);
        
        console.error(`[OpenAI Debug] Error in API call for ${chunkType}:`, {
          error,
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          response: error instanceof Error && typeof error === 'object' && 'response' in error ? error.response : undefined
        });
        
        // Handle specific OpenAI errors
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            throw new PersonalityAnalysisTimeoutError();
          }
          if (error instanceof OpenAIError && error.status === 503) {
            throw new ModelUnavailableError();
          }
        }
        throw error;
      }
    }, FALLBACK_CONFIG.maxRetries, 2000, 'personality');

    const responseContent = completion.choices[0].message.content;
    if (!responseContent) {
      throw new Error('OpenAI returned empty response');
    }

    // Add abort check before parsing
    if (params.signal?.aborted) {
      throw new Error('Analysis aborted: ' + params.signal.reason);
    }

    const parsedChunk = parseAnalysisResponse(responseContent);
    
    // Validate chunk based on type
    const validation = validateAnalysis(parsedChunk);
    const relevantFields = getRelevantFields(chunkType);
    const missingRelevantFields = validation.missingFields.filter(field => relevantFields.includes(field));

    if (missingRelevantFields.length > 0) {
      console.warn(`${chunkType} chunk incomplete. Missing fields: ${missingRelevantFields.join(', ')}`);
            
      // Retry chunk if we haven't exceeded max retries
      if (params.retryCount < FALLBACK_CONFIG.maxRetries) {
        console.log(`Retrying ${chunkType} chunk (attempt ${params.retryCount + 1}/${FALLBACK_CONFIG.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, params.retryCount) * 1000));
        return analyzeChunk(chunkType, {
          ...params,
          retryCount: params.retryCount + 1
        });
      }

      // If we've exceeded retries, throw appropriate error
      throwAppropriateError(missingRelevantFields);
    }

    return {
      success: true,
      data: parsedChunk
    };

  } catch (error) {
    // Let ChunkAbortedError propagate up
    if (error instanceof ChunkAbortedError) {
      throw error;
    }

    // Handle timeout errors on mobile/tablet
    if (error instanceof PersonalityAnalysisTimeoutError && params.isMobileOrTablet) {
      console.warn(`Mobile/tablet timeout for ${chunkType} - will retry with increased timeout`);
      const deviceType = getDeviceType();
      const currentTimeout = API_TIMEOUT.personality[deviceType];
      API_TIMEOUT.personality[deviceType] = currentTimeout * 1.5;
      return analyzeChunk(chunkType, params);
    }

    // For chunk-specific retries
    if (params.retryCount < FALLBACK_CONFIG.maxRetries) {
      console.log(`Retrying ${chunkType} chunk analysis (attempt ${params.retryCount + 1}/${FALLBACK_CONFIG.maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, params.retryCount) * 1000));
      return analyzeChunk(chunkType, {
        ...params,
        retryCount: params.retryCount + 1
      });
    }

    return {
      success: false,
      error: error as Error
    };
  }
}