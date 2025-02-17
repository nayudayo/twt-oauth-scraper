import type { TwitterAPITweet, TwitterAPIProfile } from './types';
import { Session } from 'next-auth';
import { TwitterAPIMonitor } from './monitoring';

// Extend Session type to include our custom properties
declare module 'next-auth' {
  interface Session {
    username?: string;
  }
}

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export class TwitterAPIClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.twitterapi.io/twitter';  // Changed back to twitterapi.io
  private readonly session?: Session;
  private rateLimits: Map<string, RateLimitInfo> = new Map();
  private readonly defaultRetryAttempts = 3;
  private readonly defaultRetryDelay = 1000; // 1 second
  private readonly monitor = TwitterAPIMonitor.getInstance();

  constructor(apiKey: string, session?: Session) {
    this.apiKey = apiKey;
    this.session = session;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();
    
    // Debug log API key
    console.log('Using API Key:', this.apiKey ? `${this.apiKey.substring(0, 4)}...` : 'undefined');
    
    // Check rate limits before making request
    await this.checkRateLimit(endpoint);

    try {
      // Debug log full request details
      console.log('Making request:', {
        url,
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey ? `${this.apiKey.substring(0, 4)}...` : 'undefined',
          'Content-Type': 'application/json'
        }
      });

      const response = await fetch(url, {
        ...options,
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      // Debug log the request
      console.log('Twitter API Request:', {
        url,
        method: options.method || 'GET',
        status: response.status,
        statusText: response.statusText
      });

      const endTime = Date.now();
      this.monitor.recordRequest(endpoint, endTime - startTime);

      // Update rate limit info from headers
      this.updateRateLimits(endpoint, response.headers);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Twitter API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorBody
        });
        throw new Error(`Twitter API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = await response.json();
      
      // Debug log the response data
      console.log('Twitter API Response Data:', {
        endpoint,
        keys: Object.keys(data),
        dataPreview: JSON.stringify(data).substring(0, 200) + '...'
      });

      return data;
    } catch (error) {
      // Record error in monitoring
      this.monitor.recordError(endpoint, error instanceof Error ? error : new Error('Unknown error'));

      // Handle rate limit errors
      if (error instanceof Error && error.message.includes('429')) {
        const rateLimitInfo = this.rateLimits.get(endpoint);
        if (rateLimitInfo) {
          const waitTime = (rateLimitInfo.reset * 1000) - Date.now();
          await this.wait(waitTime);
          return this.fetch<T>(endpoint, options);
        }
      }
      throw error;
    }
  }

  private async checkRateLimit(endpoint: string): Promise<void> {
    const rateLimitInfo = this.rateLimits.get(endpoint);
    if (rateLimitInfo) {
      if (rateLimitInfo.remaining === 0) {
        const waitTime = (rateLimitInfo.reset * 1000) - Date.now();
        if (waitTime > 0) {
          await this.wait(waitTime);
        }
      }
    }
  }

  private updateRateLimits(endpoint: string, headers: Headers): void {
    const limit = headers.get('x-rate-limit-limit');
    const remaining = headers.get('x-rate-limit-remaining');
    const reset = headers.get('x-rate-limit-reset');

    if (limit && remaining && reset) {
      const limits = {
        limit: parseInt(limit),
        remaining: parseInt(remaining),
        reset: parseInt(reset)
      };
      this.rateLimits.set(endpoint, limits);
      this.monitor.recordRateLimit(endpoint, limits);
    }
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxAttempts: number = this.defaultRetryAttempts,
    initialDelay: number = this.defaultRetryDelay
  ): Promise<T> {
    let attempts = 0;
    let delay = initialDelay;

    while (attempts < maxAttempts) {
      try {
        return await operation();
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) {
          throw error;
        }

        // Exponential backoff
        await this.wait(delay);
        delay *= 2;
      }
    }

    throw new Error('Max retry attempts reached');
  }

  async getCurrentUserTweets(params: {
    includeReplies?: boolean;
    cursor?: string;
    maxRetries?: number;
  } = {}): Promise<{
    tweets: TwitterAPITweet[];
    hasNextPage: boolean;
    nextCursor?: string;
  }> {
    if (!this.session?.username) {
      throw new Error('No authenticated user found');
    }

    return this.retryWithBackoff(
      () => this.getUserTweets({
        userName: this.session!.username,
        ...params
      }),
      params.maxRetries
    );
  }

  async getCurrentUserProfile(params: { maxRetries?: number } = {}): Promise<TwitterAPIProfile> {
    if (!this.session?.username) {
      throw new Error('No authenticated user found');
    }

    return this.retryWithBackoff(
      () => this.getUserProfile({
        userName: this.session!.username
      }),
      params.maxRetries
    );
  }

  async getUserTweets(params: {
    userId?: string;
    userName?: string;
    includeReplies?: boolean;
    cursor?: string;
    maxRetries?: number;
  }): Promise<{
    tweets: TwitterAPITweet[];
    hasNextPage: boolean;
    nextCursor?: string;
  }> {
    if (!params.userId && !params.userName) {
      throw new Error('Either userId or userName must be provided');
    }

    const queryParams = new URLSearchParams();
    
    if (params.userId) queryParams.set('userId', params.userId);
    if (params.userName) queryParams.set('userName', params.userName);
    if (params.includeReplies !== undefined) queryParams.set('includeReplies', params.includeReplies.toString());
    if (params.cursor) {
      console.log('Using pagination cursor:', params.cursor);
      queryParams.set('cursor', params.cursor);
    }

    // Debug log the final URL
    console.log('Requesting tweets with URL:', `${this.baseUrl}/user/last_tweets?${queryParams.toString()}`);

    return this.retryWithBackoff(
      async () => {
        // Define the tweet type to avoid repetition
        type TweetData = {
          id: string;
          text: string;
          timestamp: string;  // Changed from created_at to timestamp
          url: string;
          is_reply: boolean;
          conversation_id?: string;
          in_reply_to_id?: string;
          in_reply_to_user_id?: string;
          in_reply_to_username?: string;
          view_count: number;
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
        };

        const response = await this.fetch<{
          status: string;
          code: number;
          msg: string;
          data: {
            pin_tweet: TweetData | null;
            tweets: TweetData[];
          };
          has_next_page: boolean;
          next_cursor?: string;
        }>(`/user/last_tweets?${queryParams.toString()}`);

        // Debug log pagination info
        console.log('Pagination Info:', {
          receivedTweets: response.data.tweets?.length || 0,
          hasNextPage: response.has_next_page,
          nextCursor: response.next_cursor,
          firstTweetId: response.data.tweets?.[0]?.id,
          lastTweetId: response.data.tweets?.[response.data.tweets.length - 1]?.id
        });

        // Debug log the response
        console.log('Raw API Response:', JSON.stringify(response, null, 2).substring(0, 500) + '...');

        // Transform the response to match our expected format
        const tweets: TwitterAPITweet[] = (response.data.tweets || []).map(tweet => {
          // Parse and format the date properly
          let createdAt: string;
          try {
            // Try to parse the date and format it consistently
            const date = new Date(tweet.timestamp);  // Use timestamp instead of created_at
            if (isNaN(date.getTime())) {
              // If invalid date, use current time as fallback
              createdAt = new Date().toISOString();
              console.warn('Invalid date format received:', tweet.timestamp);
            } else {
              createdAt = date.toISOString();
            }
          } catch (error) {
            console.error('Error parsing tweet date:', error);
            createdAt = new Date().toISOString();
          }

          return {
            id: tweet.id,
            text: tweet.text,
            createdAt,
            url: tweet.url,
            isReply: tweet.is_reply,
            viewCount: tweet.view_count,
            conversationId: tweet.conversation_id,
            inReplyToUserId: tweet.in_reply_to_user_id,
            entities: tweet.entities
          };
        });

        // Log transformed tweets summary
        console.log('Transformed Tweets Summary:', {
          count: tweets.length,
          firstTweet: tweets[0] ? {
            id: tweets[0].id,
            createdAt: tweets[0].createdAt
          } : null,
          lastTweet: tweets[tweets.length - 1] ? {
            id: tweets[tweets.length - 1].id,
            createdAt: tweets[tweets.length - 1].createdAt
          } : null
        });

        // Only continue pagination if we actually received tweets
        const shouldContinue = response.has_next_page && response.data.tweets && response.data.tweets.length > 0;

        return {
          tweets,
          hasNextPage: shouldContinue,
          nextCursor: shouldContinue ? response.next_cursor : undefined
        };
      },
      params.maxRetries
    );
  }

  async getUserProfile(params: {
    userId?: string;
    userName?: string;
    maxRetries?: number;
  }): Promise<TwitterAPIProfile> {
    if (!params.userId && !params.userName) {
      throw new Error('Either userId or userName must be provided');
    }

    const queryParams = new URLSearchParams();
    
    if (params.userId) queryParams.set('userId', params.userId);
    if (params.userName) queryParams.set('userName', params.userName);

    return this.retryWithBackoff(
      async () => {
        // Using the correct endpoint for twitterapi.io
        const response = await this.fetch<{
          name: string;
          username: string;
          description: string;
          profile_image_url: string;
          created_at: string;
        }>(`/user/info?${queryParams.toString()}`);

        return {
          id: params.userId || '',
          name: response.name,
          userName: response.username,
          description: response.description,
          profilePicture: response.profile_image_url,
          createdAt: response.created_at
        };
      },
      params.maxRetries
    );
  }

  // Helper method to get current rate limit status
  getRateLimitInfo(endpoint: string): RateLimitInfo | undefined {
    return this.rateLimits.get(endpoint);
  }

  // Add monitoring methods
  getMetrics(endpoint?: string): {
    requestCount: number;
    errorCount: number;
    averageLatency: number;
    errorRate: number;
    rateLimitHits: number;
    rateLimitStatus?: { remaining: number; reset: Date } | null;
  } {
    if (endpoint) {
      return {
        ...this.monitor.getEndpointMetrics(endpoint)!,
        averageLatency: this.monitor.getAverageLatency(endpoint),
        errorRate: this.monitor.getErrorRate(endpoint),
        rateLimitStatus: this.monitor.getRateLimitStatus(endpoint)
      };
    }

    return {
      ...this.monitor.getGlobalMetrics(),
      averageLatency: this.monitor.getAverageLatency(),
      errorRate: this.monitor.getErrorRate()
    };
  }

  getAllMetrics(): ReturnType<typeof TwitterAPIMonitor.prototype.getSummary> {
    return this.monitor.getSummary();
  }

  async getAllUserTweets(params: {
    userId?: string;
    userName?: string;
    includeReplies?: boolean;
    maxRetries?: number;
    onProgress?: (progress: { collected: number, hasMore: boolean }) => void;
  }): Promise<TwitterAPITweet[]> {
    const allTweets: TwitterAPITweet[] = [];
    let hasNextPage = true;
    let nextCursor: string | undefined;
    let totalCollected = 0;

    console.log('Starting tweet collection for:', params.userName || params.userId);

    while (hasNextPage) {
      const response = await this.getUserTweets({
        ...params,
        cursor: nextCursor
      });

      allTweets.push(...response.tweets);
      totalCollected += response.tweets.length;

      console.log('Collection progress:', {
        batchSize: response.tweets.length,
        totalCollected,
        hasMore: response.hasNextPage,
        nextCursor: response.nextCursor
      });

      // Update progress if callback provided
      if (params.onProgress) {
        params.onProgress({
          collected: totalCollected,
          hasMore: response.hasNextPage
        });
      }

      // Update pagination state
      hasNextPage = response.hasNextPage;
      nextCursor = response.nextCursor;

      // Optional: Add a small delay between requests to be nice to the API
      await this.wait(1000);
    }

    console.log('Tweet collection completed:', {
      totalTweets: allTweets.length,
      firstTweetDate: allTweets[0]?.createdAt,
      lastTweetDate: allTweets[allTweets.length - 1]?.createdAt
    });

    return allTweets;
  }
}

// Export factory function instead of singleton
export function createTwitterClient(apiKey: string, session?: Session): TwitterAPIClient {
  return new TwitterAPIClient(apiKey, session);
} 