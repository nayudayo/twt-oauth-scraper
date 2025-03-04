"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterAPIClient = void 0;
exports.createTwitterClient = createTwitterClient;
const monitoring_1 = require("./monitoring");
class TwitterAPIClient {
    constructor(apiKey, session) {
        this.baseUrl = 'https://api.twitterapi.io/twitter'; // Changed back to twitterapi.io
        this.rateLimits = new Map();
        this.defaultRetryAttempts = 3;
        this.defaultRetryDelay = 1000; // 1 second
        this.monitor = monitoring_1.TwitterAPIMonitor.getInstance();
        this.apiKey = apiKey;
        this.session = session;
    }
    async fetch(endpoint, options = {}) {
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
            const response = await fetch(url, Object.assign(Object.assign({}, options), { method: 'GET', headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json',
                } }));
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
        }
        catch (error) {
            // Record error in monitoring
            this.monitor.recordError(endpoint, error instanceof Error ? error : new Error('Unknown error'));
            // Handle rate limit errors
            if (error instanceof Error && error.message.includes('429')) {
                const rateLimitInfo = this.rateLimits.get(endpoint);
                if (rateLimitInfo) {
                    const waitTime = (rateLimitInfo.reset * 1000) - Date.now();
                    await this.wait(waitTime);
                    return this.fetch(endpoint, options);
                }
            }
            throw error;
        }
    }
    async checkRateLimit(endpoint) {
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
    updateRateLimits(endpoint, headers) {
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
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async retryWithBackoff(operation, maxAttempts = this.defaultRetryAttempts, initialDelay = this.defaultRetryDelay) {
        let attempts = 0;
        let delay = initialDelay;
        while (attempts < maxAttempts) {
            try {
                return await operation();
            }
            catch (error) {
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
    async getCurrentUserTweets(params = {}) {
        var _a;
        if (!((_a = this.session) === null || _a === void 0 ? void 0 : _a.username)) {
            throw new Error('No authenticated user found');
        }
        return this.retryWithBackoff(() => this.getUserTweets(Object.assign({ userName: this.session.username }, params)), params.maxRetries);
    }
    async getCurrentUserProfile(params = {}) {
        var _a;
        if (!((_a = this.session) === null || _a === void 0 ? void 0 : _a.username)) {
            throw new Error('No authenticated user found');
        }
        return this.retryWithBackoff(() => this.getUserProfile({
            userName: this.session.username
        }), params.maxRetries);
    }
    async getUserTweets(params) {
        if (!params.userId && !params.userName) {
            throw new Error('Either userId or userName must be provided');
        }
        const queryParams = new URLSearchParams();
        if (params.userId)
            queryParams.set('userId', params.userId);
        if (params.userName)
            queryParams.set('userName', params.userName);
        if (params.includeReplies !== undefined)
            queryParams.set('includeReplies', params.includeReplies.toString());
        if (params.cursor) {
            console.log('Using pagination cursor:', params.cursor);
            queryParams.set('cursor', params.cursor);
        }
        // Debug log the final URL
        console.log('Requesting tweets with URL:', `${this.baseUrl}/user/last_tweets?${queryParams.toString()}`);
        return this.retryWithBackoff(async () => {
            var _a, _b, _c, _d, _e;
            const response = await this.fetch(`/user/last_tweets?${queryParams.toString()}`);
            // Debug log pagination info
            console.log('Pagination Info:', {
                receivedTweets: ((_a = response.data.tweets) === null || _a === void 0 ? void 0 : _a.length) || 0,
                hasNextPage: response.has_next_page,
                nextCursor: response.next_cursor,
                firstTweetId: (_c = (_b = response.data.tweets) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.id,
                lastTweetId: (_e = (_d = response.data.tweets) === null || _d === void 0 ? void 0 : _d[response.data.tweets.length - 1]) === null || _e === void 0 ? void 0 : _e.id
            });
            // Debug log the response
            console.log('Raw API Response:', JSON.stringify(response, null, 2).substring(0, 500) + '...');
            // Transform the response to match our expected format
            const tweets = (response.data.tweets || []).map(tweet => {
                // Parse and format the date properly
                let createdAt;
                try {
                    // Try to parse the date and format it consistently
                    const date = new Date(tweet.timestamp); // Use timestamp instead of created_at
                    if (isNaN(date.getTime())) {
                        // If invalid date, use current time as fallback
                        createdAt = new Date().toISOString();
                        console.warn('Invalid date format received:', tweet.timestamp);
                    }
                    else {
                        createdAt = date.toISOString();
                    }
                }
                catch (error) {
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
        }, params.maxRetries);
    }
    async getUserProfile(params) {
        if (!params.userId && !params.userName) {
            throw new Error('Either userId or userName must be provided');
        }
        const queryParams = new URLSearchParams();
        if (params.userId)
            queryParams.set('userId', params.userId);
        if (params.userName)
            queryParams.set('userName', params.userName);
        return this.retryWithBackoff(async () => {
            // Using the correct endpoint for twitterapi.io
            const response = await this.fetch(`/user/info?${queryParams.toString()}`);
            return {
                id: params.userId || '',
                name: response.name,
                userName: response.username,
                description: response.description,
                profilePicture: response.profile_image_url,
                createdAt: response.created_at
            };
        }, params.maxRetries);
    }
    // Helper method to get current rate limit status
    getRateLimitInfo(endpoint) {
        return this.rateLimits.get(endpoint);
    }
    // Add monitoring methods
    getMetrics(endpoint) {
        if (endpoint) {
            return Object.assign(Object.assign({}, this.monitor.getEndpointMetrics(endpoint)), { averageLatency: this.monitor.getAverageLatency(endpoint), errorRate: this.monitor.getErrorRate(endpoint), rateLimitStatus: this.monitor.getRateLimitStatus(endpoint) });
        }
        return Object.assign(Object.assign({}, this.monitor.getGlobalMetrics()), { averageLatency: this.monitor.getAverageLatency(), errorRate: this.monitor.getErrorRate() });
    }
    getAllMetrics() {
        return this.monitor.getSummary();
    }
    async getAllUserTweets(params) {
        var _a, _b;
        const allTweets = [];
        let hasNextPage = true;
        let nextCursor;
        let totalCollected = 0;
        const tweetLimit = params.maxTweets || 500; // Default to 500 tweets if not specified
        let reachedEndOfTweets = false;
        console.log('Starting tweet collection for:', params.userName || params.userId, 'with limit:', tweetLimit);
        while (hasNextPage && totalCollected < tweetLimit) {
            const response = await this.getUserTweets(Object.assign(Object.assign({}, params), { cursor: nextCursor }));
            // Check if we've reached the end of available tweets
            if (!response.hasNextPage || response.tweets.length === 0) {
                reachedEndOfTweets = true;
            }
            // Calculate how many tweets we can still add without exceeding the limit
            const remainingQuota = tweetLimit - totalCollected;
            const tweetsToAdd = response.tweets.slice(0, remainingQuota);
            allTweets.push(...tweetsToAdd);
            totalCollected += tweetsToAdd.length;
            console.log('Collection progress:', {
                batchSize: tweetsToAdd.length,
                totalCollected,
                remainingQuota: tweetLimit - totalCollected,
                hasMore: response.hasNextPage && totalCollected < tweetLimit,
                nextCursor: response.nextCursor,
                reachedEndOfTweets: !response.hasNextPage || response.tweets.length === 0
            });
            // Update progress if callback provided
            if (params.onProgress) {
                params.onProgress({
                    collected: totalCollected,
                    hasMore: response.hasNextPage && totalCollected < tweetLimit,
                    remainingQuota: tweetLimit - totalCollected
                });
            }
            // Update pagination state
            hasNextPage = response.hasNextPage && totalCollected < tweetLimit;
            nextCursor = response.nextCursor;
            // If we got fewer tweets than expected in a batch, we've likely reached the end
            if (response.tweets.length < 20) {
                console.log('Received partial batch:', {
                    expectedBatchSize: 20,
                    actualBatchSize: response.tweets.length,
                    totalCollected
                });
                reachedEndOfTweets = true;
            }
            // Optional: Add a small delay between requests to be nice to the API
            await this.wait(1000);
        }
        const completionStatus = reachedEndOfTweets
            ? `Reached end of available tweets at ${totalCollected} tweets`
            : `Reached tweet limit of ${tweetLimit}`;
        console.log('Tweet collection completed:', {
            totalTweets: allTweets.length,
            firstTweetDate: (_a = allTweets[0]) === null || _a === void 0 ? void 0 : _a.createdAt,
            lastTweetDate: (_b = allTweets[allTweets.length - 1]) === null || _b === void 0 ? void 0 : _b.createdAt,
            reachedLimit: totalCollected >= tweetLimit,
            reachedEndOfTweets,
            completionReason: completionStatus,
            expectedBatches: Math.ceil(tweetLimit / 20),
            actualBatches: Math.ceil(totalCollected / 20)
        });
        return allTweets;
    }
}
exports.TwitterAPIClient = TwitterAPIClient;
// Export factory function instead of singleton
function createTwitterClient(apiKey, session) {
    return new TwitterAPIClient(apiKey, session);
}
