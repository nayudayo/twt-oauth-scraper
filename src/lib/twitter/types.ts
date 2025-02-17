export interface TwitterAPITweet {
  id: string;
  text: string;
  createdAt: string;  // Format: "Tue Dec 10 07:00:30 +0000 2024"
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