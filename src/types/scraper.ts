export interface TwitterProfile {
  name: string | null
  bio: string | null
  followersCount: number | null
  followingCount: number | null
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
  url: string
  text: string
  createdAt: string
  isReply?: boolean
  timestamp?: string
  metrics?: TweetMetrics
  images?: string[]
  mentions?: string[]
  hashtags?: string[]
  quoted?: boolean
  retweeted?: boolean
  [key: string]: string | string[] | boolean | TweetMetrics | null | undefined
}

export interface ScrapedData {
  profile: TwitterProfile
  tweets: Tweet[]
}

export interface EventData {
  error?: string
  progress?: number
  status?: string
  data?: ScrapedData
}

export interface WorkerMessage {
  type: 'progress' | 'error' | 'complete'
  data: EventData
} 