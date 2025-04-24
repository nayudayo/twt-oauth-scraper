import { ANALYSIS_CHUNKS } from './prompting/analysis-prompting';

export type CommunicationLevel = 'low' | 'medium' | 'high';

export interface Trait {
  name: string;
  score: number;
  explanation: string;
}

export interface Interest {
  name: string;
  expertise?: string;
  evidence?: string;
}

export interface PersonalityAnalysis {
  summary: string;
  traits: Trait[];
  interests: string[];
  interestWeights?: { [key: string]: number };
  socialBehaviorMetrics: {
    oversharer: number;
    replyGuy: number;
    viralChaser: number;
    threadMaker: number;
    retweeter: number;
    hotTaker: number;
    joker: number;
    debater: number;
    doomPoster: number;
    earlyAdopter: number;
    knowledgeDropper: number;
    hypeBeast: number;
  };
  communicationStyle: {
    formality: 'low' | 'medium' | 'high';
    enthusiasm: 'low' | 'medium' | 'high';
    technicalLevel: 'low' | 'medium' | 'high';
    emojiUsage: 'low' | 'medium' | 'high';
    verbosity: 'low' | 'medium' | 'high';
    description: string;
    patterns: {
      capitalization: 'mixed' | 'mostly-lowercase' | 'mostly-uppercase' | 'standard';
      punctuation: string[];
      lineBreaks: 'minimal' | 'moderate' | 'frequent';
      messageStructure: {
        opening: string[];
        framing: string[];
        closing: string[];
      };
    };
    contextualVariations: {
      business: string;
      casual: string;
      technical: string;
      crisis: string;
    };
  };
  vocabulary: {
    commonTerms: Array<{
      term: string;
      frequency: number;
      percentage: number;
      category?: string;
    }>;
    commonPhrases: Array<{
      phrase: string;
      frequency: number;
      percentage: number;
    }>;
    enthusiasmMarkers: string[];
    industryTerms: string[];
    nGrams: {
      bigrams: Array<{
        phrase: string;
        frequency: number;
        percentage: number;
      }>;
      trigrams: Array<{
        phrase: string;
        frequency: number;
        percentage: number;
      }>;
    };
    metrics: {
      sentenceLengths: {
        veryShort: number;
        short: number;
        medium: number;
        long: number;
        veryLong: number;
        distribution: {
          veryShort: number;
          short: number;
          medium: number;
          long: number;
          veryLong: number;
        };
      };
      capitalizationStats: {
        lowercase: number;
        sentenceCase: number;
        mixedCase: number;
        totalMessages: number;
      };
      averageMessageLength: number;
      uniqueWordsCount: number;
      totalWordsAnalyzed: number;
      messageArchitecture: {
        structureTypes: {
          singleWord: number;
          shortPhrase: number;
          actionOriented: number;
          bulletedList: number;
          streamOfConsciousness: number;
        };
        terminalPunctuation: {
          none: number;
          period: number;
          questionMark: number;
          exclamationMark: number;
          ellipsis: number;
        };
        characterMetrics: {
          averageLength: number;
          shortMessages: number;
          longMessages: number;
        };
        preferences: {
          usesMarkdown: boolean;
          usesBulletPoints: boolean;
          usesNumberedLists: boolean;
          usesCodeBlocks: boolean;
          preferredListStyle: 'bullet' | 'numbered' | 'none';
        };
      };
    };
  };
  emotionalIntelligence: {
    leadershipStyle: string;
    challengeResponse: string;
    analyticalTone: string;
    supportivePatterns: string[];
  };
  topicsAndThemes: string[];
  emotionalTone: string;
  thoughtProcess: {
    initialApproach: string;
    processingStyle: string;
    expressionStyle: string;
  };
}

// Error classes
export class OpenAIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'OpenAIError';
  }
}

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

export class PersonalityAnalysisError extends Error {
  constructor(message: string, public missingFields: string[]) {
    super(message);
    this.name = 'PersonalityAnalysisError';
  }
}

export enum AnalysisChunkType {
  BASIC_INFO = 1,
  INTERESTS = 2,
  SOCIAL_METRICS = 3,
  COMMUNICATION = 4,
  VOCABULARY = 5,
  EMOTIONAL = 6
}

// Mapping from chunk type to chunk name
export const CHUNK_TYPE_TO_NAME: Record<AnalysisChunkType, keyof typeof ANALYSIS_CHUNKS> = {
  [AnalysisChunkType.BASIC_INFO]: 'BASIC_INFO',
  [AnalysisChunkType.INTERESTS]: 'INTERESTS',
  [AnalysisChunkType.SOCIAL_METRICS]: 'SOCIAL_METRICS',
  [AnalysisChunkType.COMMUNICATION]: 'COMMUNICATION',
  [AnalysisChunkType.VOCABULARY]: 'VOCABULARY',
  [AnalysisChunkType.EMOTIONAL]: 'EMOTIONAL'
};

// Mapping from chunk name to chunk type
export const CHUNK_NAME_TO_TYPE: Record<keyof typeof ANALYSIS_CHUNKS, AnalysisChunkType> = {
  BASIC_INFO: AnalysisChunkType.BASIC_INFO,
  INTERESTS: AnalysisChunkType.INTERESTS,
  SOCIAL_METRICS: AnalysisChunkType.SOCIAL_METRICS,
  COMMUNICATION: AnalysisChunkType.COMMUNICATION,
  VOCABULARY: AnalysisChunkType.VOCABULARY,
  EMOTIONAL: AnalysisChunkType.EMOTIONAL
}; 