import type { TwitterAPITweet, TwitterAPIProfile } from './types';
import type { Tweet, TwitterProfile } from '../../types/scraper';
import type { DBUser } from '../db/adapters/types';

export class TwitterDataTransformer {
  /**
   * Parse Twitter's date format: "Tue Dec 10 07:00:30 +0000 2024"
   */
  private static parseTwitterDate(dateStr: string): Date {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    throw new Error(`Invalid Twitter date format: ${dateStr}`);
  }

  /**
   * Transform a TwitterAPITweet to our internal Tweet format
   */
  static toTweet(apiTweet: TwitterAPITweet): Tweet {
    // Parse the tweet's creation date
    let createdAt: Date;
    try {
      if (apiTweet.createdAt) {
        createdAt = this.parseTwitterDate(apiTweet.createdAt);
      } else if (apiTweet.timestamp) {
        createdAt = new Date(apiTweet.timestamp);
      } else {
        console.warn('No createdAt or timestamp found for tweet:', apiTweet.id);
        createdAt = new Date();
      }

      // Additional validation
      if (isNaN(createdAt.getTime()) || createdAt.getFullYear() > new Date().getFullYear()) {
        console.warn('Invalid or future date detected:', apiTweet.createdAt || apiTweet.timestamp);
        createdAt = new Date();
      }
    } catch (error) {
      console.error('Error parsing tweet date:', error);
      createdAt = new Date();
    }

    const timestamp = createdAt.toISOString();

    return {
      id: apiTweet.id,
      text: apiTweet.text,
      url: apiTweet.url,
      createdAt: timestamp,
      timestamp: timestamp,
      metrics: {
        views: apiTweet.viewCount || 0,
        likes: apiTweet.likeCount || 0,
        retweets: apiTweet.retweetCount || 0,
        replies: apiTweet.replyCount || 0,
        quotes: apiTweet.quoteCount || 0
      },
      images: [], // Will be populated if we add media support
      isReply: apiTweet.isReply || false
    };
  }

  /**
   * Transform a TwitterAPIProfile to our internal TwitterProfile format
   */
  static toProfile(apiProfile: TwitterAPIProfile): TwitterProfile {
    return {
      name: apiProfile.name,
      bio: apiProfile.description,
      followersCount: null, // Not available in new API
      followingCount: null, // Not available in new API
      imageUrl: apiProfile.profilePicture
    };
  }

  /**
   * Transform a TwitterAPIProfile to our internal DBUser format
   */
  static toDBUser(apiProfile: TwitterAPIProfile): Partial<DBUser> {
    return {
      username: apiProfile.userName,
      profile_data: {
        bio: apiProfile.description,
        followersCount: undefined,  // Not available in new API
        followingCount: undefined  // Not available in new API
      },
      profile_picture_url: apiProfile.profilePicture,
      created_at: new Date(),
      last_scraped: new Date()
    };
  }

  /**
   * Transform a batch of TwitterAPITweets to our internal Tweet format
   */
  static toTweets(apiTweets: TwitterAPITweet[]): Tweet[] {
    return apiTweets.map(tweet => this.toTweet(tweet));
  }

  /**
   * Transform TwitterAPITweet to database format
   */
  static toDBTweet(apiTweet: TwitterAPITweet, userId: string): {
    id: string;
    user_id: string;
    text: string;
    created_at: Date;
    url: string;
    is_reply: boolean;
    view_count: number;
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    metadata: Record<string, unknown>;
    created_in_db: Date;
  } {
    // Parse the tweet's creation date
    let createdAt: Date;
    try {
      if (apiTweet.createdAt) {
        createdAt = this.parseTwitterDate(apiTweet.createdAt);
      } else if (apiTweet.timestamp) {
        createdAt = new Date(apiTweet.timestamp);
      } else {
        console.warn('No createdAt or timestamp found for tweet:', apiTweet.id);
        createdAt = new Date();
      }

      // Additional validation
      if (isNaN(createdAt.getTime()) || createdAt.getFullYear() > new Date().getFullYear()) {
        console.warn('Invalid or future date detected:', apiTweet.createdAt || apiTweet.timestamp);
        createdAt = new Date();
      }
    } catch (error) {
      console.error('Error parsing tweet date:', error);
      createdAt = new Date();
    }

    const now = new Date();

    return {
      id: apiTweet.id,
      user_id: userId,
      text: apiTweet.text,
      created_at: createdAt,
      url: apiTweet.url,
      is_reply: apiTweet.isReply || false,
      view_count: apiTweet.viewCount || 0,
      retweet_count: apiTweet.retweetCount || 0,
      reply_count: apiTweet.replyCount || 0,
      like_count: apiTweet.likeCount || 0,
      quote_count: apiTweet.quoteCount || 0,
      metadata: {
        conversationId: apiTweet.conversationId,
        inReplyToId: apiTweet.inReplyToId,
        inReplyToUserId: apiTweet.inReplyToUserId,
        inReplyToUsername: apiTweet.inReplyToUsername,
        lang: apiTweet.lang,
        entities: apiTweet.entities || {},
        scraped_at: now.toISOString()
      },
      created_in_db: now
    };
  }

  /**
   * Transform a batch of TwitterAPITweets to database format
   */
  static toDBTweets(apiTweets: TwitterAPITweet[], userId: string): Array<{
    id: string;
    user_id: string;
    text: string;
    created_at: Date;
    url: string;
    is_reply: boolean;
    view_count: number;
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    metadata: Record<string, unknown>;
    created_in_db: Date;
  }> {
    return apiTweets.map(tweet => this.toDBTweet(tweet, userId));
  }
} 