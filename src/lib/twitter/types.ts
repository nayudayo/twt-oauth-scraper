export interface TwitterAPITweet {
  id: string;
  text: string;
  /** Twitter date format: "Day Mon DD HH:mm:ss +0000 YYYY" (e.g. "Mon Dec 23 11:27:55 +0000 2024") */
  createdAt: string;
  /** ISO format timestamp (legacy field, may not be present) */
  timestamp?: string;
  url: string;
  isReply: boolean;
  conversationId?: string;
  inReplyToId?: string;
  inReplyToUserId?: string;
  inReplyToUsername?: string;
  lang?: string;
  
  // Metrics
  viewCount: number;

  // Rich content
  entities: {
    hashtags: Array<{ text: string; indices: number[] }>;
    urls: Array<{
      display_url: string;
      expanded_url: string;
      url: string;
      indices: number[];
    }>;
    user_mentions: Array<{
      id_str: string;
      name: string;
      screen_name: string;
      indices: number[];
    }>;
  };
}

export interface TwitterAPIProfile {
  id: string;
  name: string;
  userName: string;
  description: string;
  profilePicture: string;
  coverPicture?: string;
  createdAt: string;
}

export interface WorkerData {
  username: string;
  sessionId: string;
  batchSize?: number;
  maxTweets?: number;
} 