# Twitter API Migration Plan

## Current vs New Implementation

### Data Structure Changes

```typescript
// Current Apify Tweet Structure
interface ApifyTweet {
  id: string;
  text: string;
  timestamp: string | number;
  url?: string;
  isReply: boolean;
  metrics?: {
    likes?: number;
    retweets?: number;
    replies?: number;
  };
  images?: string[];
}

// New Twitter API Structure
interface TwitterAPITweet {
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
  
  // Enhanced metrics
  bookmarkCount: number;
  likeCount: number;
  quoteCount: number;
  replyCount: number;
  retweetCount: number;
  viewCount: number;

  // Rich content
  entities: {
    hashtags: Array<{ text: string; indices: number[] }>;
    urls: Array<any>;
    user_mentions: Array<any>;
  };
  
  // Nested content
  quoted_tweet?: TwitterAPITweet;
  retweeted_tweet?: TwitterAPITweet;
}
```

### Profile Data Changes
```typescript
// Current Apify Profile
interface TwitterProfile {
  name: string | null;
  bio: string | null;
  followersCount: number | null;
  followingCount: number | null;
  imageUrl: string | null;
}

// New Twitter API Profile
interface TwitterAPIProfile {
  id: string;
  name: string;
  userName: string;
  description: string;
  profilePicture: string;
  coverPicture?: string;
  createdAt: string;
  
  // Enhanced metrics
  followers: number;
  following: number;
  statusesCount: number;
  mediaCount: number;
  favouritesCount: number;
  
  // Additional fields
  location?: string;
  isBlueVerified: boolean;
  hasCustomTimelines: boolean;
  pinnedTweetIds: string[];
}
```

## Required Changes

1. **API Client Setup**
   - Replace Apify client with Twitter API client
   - Update environment variables
   - Implement rate limiting according to Twitter API limits
   - Add proper error handling for Twitter API responses

2. **Tweet Fetching Logic**
   ```typescript
   // New implementation structure
   class TwitterAPIClient {
     async getUserTweets(username: string, options?: {
       limit?: number;
       cursor?: string;
       includeReplies?: boolean;
     }): Promise<{
       tweets: TwitterAPITweet[];
       hasNextPage: boolean;
       nextCursor?: string;
     }>;
     
     async getUserProfile(username: string): Promise<TwitterAPIProfile>;
   }
   ```

3. **Data Transformation Layer**
   ```typescript
   interface TweetTransformer {
     // Convert Twitter API response to our DB format
     toDBTweet(tweet: TwitterAPITweet): DBTweet;
     toDBProfile(profile: TwitterAPIProfile): DBUser;
   }
   ```

4. **Pagination Handling**
   - Replace Apify's offset-based pagination with Twitter's cursor-based pagination
   - Implement proper cursor handling for continuous fetching
   - Add cursor storage for resuming fetches

## Migration Steps

1. **Phase 1: Setup & Infrastructure**
   - [ ] Create TwitterAPIClient class
   - [ ] Add Twitter API authentication
   - [ ] Implement rate limiting
   - [ ] Add error handling

2. **Phase 2: Core Functionality**
   - [ ] Implement getUserTweets
   - [ ] Implement getUserProfile
   - [ ] Create data transformers
   - [ ] Add pagination handling

3. **Phase 3: Enhanced Features**
   - [ ] Add support for quoted tweets
   - [ ] Add support for retweets
   - [ ] Implement media handling
   - [ ] Add entity parsing (hashtags, mentions)

4. **Phase 4: Testing & Validation**
   - [ ] Test rate limiting
   - [ ] Validate data consistency
   - [ ] Test pagination
   - [ ] Compare results with Apify

## Advantages of Migration

1. **Direct Access**
   - No third-party dependency
   - Real-time data access
   - More reliable service

2. **Enhanced Data**
   - More detailed metrics
   - Better conversation threading
   - Rich media information
   - Entity parsing

3. **Better Control**
   - Custom rate limiting
   - Error handling
   - Retry strategies

## Implementation Example

```typescript
// src/lib/twitter/client.ts
export class TwitterAPIClient {
  constructor(private readonly config: {
    apiKey: string;
    apiSecret: string;
    // ... other config
  }) {}

  async getUserTweets(username: string, options?: {
    limit?: number;
    cursor?: string;
  }): Promise<{
    tweets: TwitterAPITweet[];
    hasNextPage: boolean;
    nextCursor?: string;
  }> {
    // Implementation
  }

  async getUserProfile(username: string): Promise<TwitterAPIProfile> {
    // Implementation
  }

  private async handleRateLimit(): Promise<void> {
    // Rate limit handling
  }

  private async handleError(error: any): Promise<never> {
    // Error handling
  }
}
```

## Success Criteria

1. **Functionality**
   - [ ] All current features working
   - [ ] No data loss in migration
   - [ ] Enhanced data collection

2. **Performance**
   - [ ] Respects rate limits
   - [ ] Efficient pagination
   - [ ] Fast response times

3. **Reliability**
   - [ ] Proper error handling
   - [ ] Retry mechanisms
   - [ ] Data validation

4. **Monitoring**
   - [ ] Rate limit tracking
   - [ ] Error logging
   - [ ] Performance metrics 