import type { TwitterAPITweet, TwitterAPIProfile } from './types';
import type { Tweet, TwitterProfile } from '../../types/scraper';
import type { DBUser } from '../db/adapters/types';

export class TwitterDataTransformer {
  /**
   * Transform a TwitterAPITweet to our internal Tweet format
   */
  static toTweet(apiTweet: TwitterAPITweet): Tweet {
    return {
      id: apiTweet.id,
      text: apiTweet.text,
      url: apiTweet.url,
      createdAt: apiTweet.createdAt,
      timestamp: apiTweet.createdAt,
      metrics: {
        views: apiTweet.viewCount,
        likes: null,  // Not available in new API
        retweets: null  // Not available in new API
      },
      images: [], // Will be populated if we add media support
      isReply: apiTweet.isReply
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
    metadata: Record<string, unknown>;
    created_in_db: Date;
  } {
    return {
      id: apiTweet.id,
      user_id: userId,
      text: apiTweet.text,
      created_at: new Date(apiTweet.createdAt),
      url: apiTweet.url,
      is_reply: apiTweet.isReply,
      metadata: {
        viewCount: apiTweet.viewCount,
        conversationId: apiTweet.conversationId,
        inReplyToId: apiTweet.inReplyToId,
        inReplyToUserId: apiTweet.inReplyToUserId,
        inReplyToUsername: apiTweet.inReplyToUsername,
        lang: apiTweet.lang,
        entities: apiTweet.entities
      },
      created_in_db: new Date()
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
    metadata: Record<string, unknown>;
    created_in_db: Date;
  }> {
    return apiTweets.map(tweet => this.toDBTweet(tweet, userId));
  }
} 