"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterDataTransformer = void 0;
class TwitterDataTransformer {
    /**
     * Parse Twitter's date format: "Tue Dec 10 07:00:30 +0000 2024"
     */
    static parseTwitterDate(dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
        throw new Error(`Invalid Twitter date format: ${dateStr}`);
    }
    /**
     * Transform a TwitterAPITweet to our internal Tweet format
     */
    static toTweet(apiTweet) {
        // Parse the tweet's creation date
        let createdAt;
        try {
            if (apiTweet.createdAt) {
                createdAt = this.parseTwitterDate(apiTweet.createdAt);
            }
            else if (apiTweet.timestamp) {
                createdAt = new Date(apiTweet.timestamp);
            }
            else {
                console.warn('No createdAt or timestamp found for tweet:', apiTweet.id);
                createdAt = new Date();
            }
            // Additional validation
            if (isNaN(createdAt.getTime()) || createdAt.getFullYear() > new Date().getFullYear()) {
                console.warn('Invalid or future date detected:', apiTweet.createdAt || apiTweet.timestamp);
                createdAt = new Date();
            }
        }
        catch (error) {
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
                likes: null, // Not available in new API
                retweets: null // Not available in new API
            },
            images: [], // Will be populated if we add media support
            isReply: apiTweet.isReply || false
        };
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
        // Parse the tweet's creation date
        let createdAt;
        try {
            if (apiTweet.createdAt) {
                createdAt = this.parseTwitterDate(apiTweet.createdAt);
            }
            else if (apiTweet.timestamp) {
                createdAt = new Date(apiTweet.timestamp);
            }
            else {
                console.warn('No createdAt or timestamp found for tweet:', apiTweet.id);
                createdAt = new Date();
            }
            // Additional validation
            if (isNaN(createdAt.getTime()) || createdAt.getFullYear() > new Date().getFullYear()) {
                console.warn('Invalid or future date detected:', apiTweet.createdAt || apiTweet.timestamp);
                createdAt = new Date();
            }
        }
        catch (error) {
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
            metadata: {
                viewCount: apiTweet.viewCount || 0,
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
    static toDBTweets(apiTweets, userId) {
        return apiTweets.map(tweet => this.toDBTweet(tweet, userId));
    }
}
exports.TwitterDataTransformer = TwitterDataTransformer;
