export interface TwitterProfile {
  name: string | null
  imageUrl?: string
  description?: string
}

export interface TwitterAPITweet {
  id: string;
  text: string;
  url: string;
  twitterUrl: string;
  timestamp: string;
} 