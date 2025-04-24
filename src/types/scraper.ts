import { CommunicationLevel } from '../lib/openai/openai';

export interface TwitterProfile {
  name: string | null
  bio: string | null
  followersCount: number | null
  followingCount: number | null
  imageUrl: string | null
}

export interface OpenAITwitterProfile {
  name: string | null
  bio: string | null
  followersCount: string | null
  followingCount: string | null
}

export function convertProfileForOpenAI(profile: TwitterProfile): OpenAITwitterProfile {
  return {
    ...profile,
    followersCount: profile.followersCount?.toString() ?? null,
    followingCount: profile.followingCount?.toString() ?? null
  };
}

export interface TweetMetrics {
  likes: string | null
  retweets: string | null
  views: string | null
  replies: string | null
  quotes: string | null
}

export interface Tweet {
  id: string
  text: string
  url: string
  createdAt: string
  timestamp: string
  metrics: {
    likes: number
    retweets: number
    views: number
    replies: number
    quotes: number
  }
  images: string[]
  isReply: boolean
}

export interface PersonalityAnalysis {
  summary: string
  traits: Array<{
    name: string
    score: number
    explanation: string
  }>
  interests: string[]
  communicationStyle: {
    formality: CommunicationLevel
    enthusiasm: CommunicationLevel
    technicalLevel: CommunicationLevel
    emojiUsage: CommunicationLevel
    verbosity: CommunicationLevel
    description: string
  }
  topicsAndThemes: string[]
  emotionalTone: string
}

export interface PersonalityTuning {
  traitModifiers: { [key: string]: number }  // trait name -> adjustment (-2 to +2)
  interestWeights: { [key: string]: number } // interest -> weight (0 to 100)
  customInterests: string[]
  communicationStyle: {
    formality: CommunicationLevel
    enthusiasm: CommunicationLevel
    technicalLevel: CommunicationLevel
    emojiUsage: CommunicationLevel
    verbosity: CommunicationLevel
  }
}

export interface ScrapedData {
  profile: TwitterProfile
  tweets: Tweet[]
}

export interface ScanProgress {
  phase: 'posts' | 'replies' | 'complete' | 'ready'
  count: number
  total?: number
  currentBatch?: number
  totalBatches?: number
  message?: string
}

export interface EventData {
  type?: 'complete' | 'error' | 'progress' | 'warning'
  error?: string
  tweets?: Tweet[]
  username?: string
  isChunk?: boolean
  chunkIndex?: number
  totalTweets?: number
  isLastBatch?: boolean
  scanProgress?: ScanProgress
  status?: string
  message?: string
  reset?: number
}

export interface WorkerMessage {
  type: 'progress' | 'error' | 'complete'
  data: EventData
} 