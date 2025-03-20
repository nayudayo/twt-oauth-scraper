import { TwitterAPITweet } from '../twitter/types';
import { getDB } from './index';
import type { DBTweet } from './adapters/types';

export interface TweetPaginationResult {
  tweets: TwitterAPITweet[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

export interface TweetQueryOptions {
  userId: string;
  cursor?: string;
  limit?: number;
  includeReplies?: boolean;
}

export class TweetDB {
  static readonly DEFAULT_PAGE_SIZE = 20;

  /**
   * Convert TwitterAPITweet to DBTweet
   */
  private static toDBTweet(tweet: TwitterAPITweet, userId: string): DBTweet {
    const createdAt = tweet.createdAt ? new Date(tweet.createdAt) : new Date();
    
    return {
      id: tweet.id,
      user_id: userId,
      text: tweet.text,
      created_at: createdAt,
      url: tweet.url,
      is_reply: tweet.isReply,
      view_count: tweet.viewCount || 0,
      retweet_count: tweet.retweetCount || 0,
      reply_count: tweet.replyCount || 0,
      like_count: tweet.likeCount || 0,
      quote_count: tweet.quoteCount || 0,
      metadata: {
        conversationId: tweet.conversationId,
        inReplyToId: tweet.inReplyToId,
        inReplyToUserId: tweet.inReplyToUserId,
        inReplyToUsername: tweet.inReplyToUsername,
        lang: tweet.lang,
        entities: tweet.entities
      },
      created_in_db: new Date()
    };
  }

  /**
   * Convert DBTweet to TwitterAPITweet
   */
  private static toTwitterAPITweet(dbTweet: DBTweet): TwitterAPITweet {
    // Ensure we have the required entities structure
    const defaultEntities = {
      hashtags: [] as Array<{ text: string; indices: number[] }>,
      urls: [] as Array<{
        display_url: string;
        expanded_url: string;
        url: string;
        indices: number[];
      }>,
      user_mentions: [] as Array<{
        id_str: string;
        name: string;
        screen_name: string;
        indices: number[];
      }>
    };

    // Merge with stored entities, ensuring required arrays exist
    const entities = {
      ...defaultEntities,
      ...(dbTweet.metadata.entities || {}),
      // Ensure arrays exist even if they were null/undefined in stored entities
      hashtags: dbTweet.metadata.entities?.hashtags || defaultEntities.hashtags,
      urls: dbTweet.metadata.entities?.urls || defaultEntities.urls,
      user_mentions: dbTweet.metadata.entities?.user_mentions || defaultEntities.user_mentions
    };

    return {
      id: dbTweet.id,
      text: dbTweet.text,
      createdAt: dbTweet.created_at.toISOString(),
      url: dbTweet.url,
      isReply: dbTweet.is_reply,
      viewCount: dbTweet.view_count,
      retweetCount: dbTweet.retweet_count,
      replyCount: dbTweet.reply_count,
      likeCount: dbTweet.like_count,
      quoteCount: dbTweet.quote_count,
      conversationId: dbTweet.metadata.conversationId,
      inReplyToId: dbTweet.metadata.inReplyToId,
      inReplyToUserId: dbTweet.metadata.inReplyToUserId,
      inReplyToUsername: dbTweet.metadata.inReplyToUsername,
      lang: dbTweet.metadata.lang,
      entities
    };
  }

  /**
   * Fetch tweets with cursor-based pagination
   */
  static async getTweets(options: TweetQueryOptions): Promise<TweetPaginationResult> {
    const {
      userId,
      limit = this.DEFAULT_PAGE_SIZE,
      includeReplies = false
    } = options;

    const db = await getDB();

    // Get tweets using the adapter's method
    const dbTweets = await db.getTweetsByUserId(userId, {
      limit: limit + 1, // Get one extra to determine if there are more
      includeReplies
    });

    // Check if there are more results
    const hasMore = dbTweets.length > limit;
    if (hasMore) {
      dbTweets.pop(); // Remove the extra tweet we fetched
    }

    // Convert DB tweets to API format
    const tweets = dbTweets.map(this.toTwitterAPITweet);

    // Get the next cursor
    const nextCursor = hasMore ? tweets[tweets.length - 1].id : null;

    // Get total count
    const totalCount = await db.getTweetCount(userId);

    return {
      tweets,
      nextCursor,
      hasMore,
      totalCount
    };
  }

  /**
   * Store new tweets in the database
   */
  static async storeTweets(tweets: TwitterAPITweet[], userId: string): Promise<void> {
    const db = await getDB();

    // Convert to DB format
    const dbTweets = tweets.map(tweet => this.toDBTweet(tweet, userId));

    // Store tweets using the adapter's method
    await db.saveTweets(userId, dbTweets);
  }
} 