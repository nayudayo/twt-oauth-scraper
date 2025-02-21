"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterDataTransformer = void 0;
class TwitterDataTransformer {
    /**
     * Transform a TwitterAPITweet to our internal Tweet format
     */
    static toTweet(apiTweet) {
        // Get timestamp from createdAt or estimate from ID
        const tweetTimestamp = apiTweet.createdAt || this.getTimestampFromId(apiTweet.id);
        return {
            id: apiTweet.id,
            text: apiTweet.text,
            url: apiTweet.url,
            createdAt: tweetTimestamp,
            timestamp: tweetTimestamp,
            metrics: {
                views: apiTweet.viewCount || null,
                likes: null, // Not available in new API
                retweets: null // Not available in new API
            },
            images: [], // Will be populated if we add media support
            isReply: apiTweet.isReply || false
        };
    }
    /**
     * Convert a Twitter snowflake ID to a timestamp
     * Twitter IDs are 64-bit integers where the first 41 bits are a timestamp
     * with an epoch of 1288834974657 (Nov 04 2010 01:42:54 UTC)
     */
    static getTimestampFromId(id) {
        try {
            // Twitter's epoch (Nov 04 2010 01:42:54 UTC)
            const TWITTER_EPOCH = 1288834974657;
            // Convert ID to BigInt without using literal
            const tweetId = BigInt(id);
            const timestampBits = BigInt(22);
            const timestamp = Number(tweetId >> timestampBits) + TWITTER_EPOCH;
            // Create Date object and return ISO string
            return new Date(timestamp).toISOString();
        }
        catch (error) {
            console.warn('Error converting tweet ID to timestamp:', error);
            // Return current time as fallback
            return new Date().toISOString();
        }
    }
    /**
     * Transform a TwitterAPIProfile to our internal TwitterProfile format
     */
    static toProfile(apiProfile) {
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
    static toDBUser(apiProfile) {
        return {
            username: apiProfile.userName,
            profile_data: {
                bio: apiProfile.description,
                followersCount: undefined, // Not available in new API
                followingCount: undefined // Not available in new API
            },
            profile_picture_url: apiProfile.profilePicture,
            created_at: new Date(),
            last_scraped: new Date()
        };
    }
    /**
     * Transform a batch of TwitterAPITweets to our internal Tweet format
     */
    static toTweets(apiTweets) {
        return apiTweets.map(tweet => this.toTweet(tweet));
    }
    /**
     * Transform TwitterAPITweet to database format
     */
    static toDBTweet(apiTweet, userId) {
        // Get timestamp from createdAt or estimate from ID
        const tweetTimestamp = apiTweet.createdAt || this.getTimestampFromId(apiTweet.id);
        return {
            id: apiTweet.id,
            user_id: userId,
            text: apiTweet.text,
            created_at: new Date(tweetTimestamp),
            url: apiTweet.url,
            is_reply: apiTweet.isReply || false,
            metadata: {
                viewCount: apiTweet.viewCount,
                conversationId: apiTweet.conversationId,
                inReplyToId: apiTweet.inReplyToId,
                inReplyToUserId: apiTweet.inReplyToUserId,
                inReplyToUsername: apiTweet.inReplyToUsername,
                entities: apiTweet.entities
            },
            created_in_db: new Date()
        };
    }
    /**
     * Transform a batch of TwitterAPITweets to database format
     */
    static toDBTweets(apiTweets, userId) {
        return apiTweets.map(tweet => this.toDBTweet(tweet, userId));
    }
}
exports.TwitterDataTransformer = TwitterDataTransformer;
