export interface TwitterProfile {
  name: string | null
  bio: string | null
  followersCount: string | null
  followingCount: string | null
}

export interface TweetMetrics {
  likes: string | null
  retweets: string | null
  views: string | null
}

export interface Tweet {
  id: string | null
  text: string | null
  timestamp: string | null
  metrics: TweetMetrics
  images: (string | null)[]
}

export interface ScrapedData {
  profile: TwitterProfile
  tweets: Tweet[]
} 