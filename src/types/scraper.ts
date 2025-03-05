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
  replies?: string | null
  quotes?: string | null
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
    formality: number
    enthusiasm: number
    technicalLevel: number
    emojiUsage: number
    description: string
  }
  topicsAndThemes: string[]
  emotionalTone: string
}

export interface ScrapedData {
  profile: TwitterProfile
  tweets: Tweet[]
}

export interface ScanProgress {
  phase: 'posts' | 'replies' | 'complete'
  count: number
  message?: string
}

export interface EventData {
  type?: 'complete' | 'error' | 'progress'
  error?: string
  tweets?: Tweet[]
  username?: string
  isChunk?: boolean
  chunkIndex?: number
  totalTweets?: number
  isLastBatch?: boolean
  scanProgress?: ScanProgress
  status?: string
}

export interface WorkerMessage {
  type: 'progress' | 'error' | 'complete'
  data: EventData
} 