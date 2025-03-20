import { Pool } from 'pg';

interface TweetEntity {
  hashtags: Array<{ text: string; indices: number[] }>;
  user_mentions: Array<{ 
    name: string; 
    id_str: string; 
    indices: number[]; 
    screen_name: string 
  }>;
}

interface Tweet {
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
  metadata: {
    entities?: TweetEntity;
    conversationId?: string;
    inReplyToId?: string;
    inReplyToUserId?: string;
    inReplyToUsername?: string;
    lang?: string;
  };
  created_in_db: Date;
}

interface TweetMetric {
  id: string;
  date: Date;
  engagement: number;
  views?: number;
  retweets?: number;
  replies?: number;
  quotes?: number;
  likes?: number;
}

interface EngagementMetrics {
  totalEngagement: number;
  engagementRate: number;
  viralityScore: number;
  interactionRate: number;
  amplificationRatio: number;
  discussionRatio: number;
  byTweet: TweetMetric[];
}

interface QualityMetrics {
  engagementToRetweetRatio: number;
  quoteToRetweetRatio: number;
  likeToReplyRatio: number;
  conversationDepthScore: number;
  shareabilityScore: number;
  radarData: {
    labels: string[];
    values: (number | TweetMetric[])[];
  };
  byTweet: TweetMetric[];
}

interface VisibilityMetrics {
  engagementRate: number;
  retweetRate: number;
  replyRate: number;
  likeRate: number;
  quoteRate: number;
  byTweet: TweetMetric[];
}

interface ViralityMetrics {
  amplificationScore: number;
  conversationScore: number;
  engagementPerThousandViews: number;
  shareabilityFactor: number;
  conversionPotential: number;
  byTweet: TweetMetric[];
}

export class AnalyticsService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private async getUserTweets(username: string): Promise<Tweet[]> {
    try {
      // First get the user's ID
      const userQuery = 'SELECT id FROM users WHERE username = $1';
      const userResult = await this.pool.query(userQuery, [username]);
      
      if (userResult.rows.length === 0) {
        console.log('No user found with username:', username);
        return [];
      }

      const userId = userResult.rows[0].id;

      // Then get their tweets with all metric columns
      const tweetsQuery = `
        SELECT 
          id,
          user_id,
          text,
          created_at,
          url,
          is_reply,
          view_count,
          retweet_count,
          reply_count,
          like_count,
          quote_count,
          metadata,
          created_in_db
        FROM tweets
        WHERE user_id = $1
        ORDER BY created_at ASC
      `;
      
      const { rows } = await this.pool.query(tweetsQuery, [userId]);
      
      if (rows.length === 0) {
        console.log('No tweets found for user:', username);
      } else {
        console.log(`Found ${rows.length} tweets for user:`, username);
        // Log first tweet metrics for debugging
        console.log('First tweet metrics sample:', {
          id: rows[0].id,
          views: rows[0].view_count,
          retweets: rows[0].retweet_count,
          replies: rows[0].reply_count,
          likes: rows[0].like_count,
          quotes: rows[0].quote_count
        });
      }
      
      return rows;
    } catch (error) {
      console.error('Error in getUserTweets:', error);
      throw error;
    }
  }

  // 1. Engagement & Popularity Metrics
  private calculateEngagementMetricsInternal(tweets: Tweet[]): EngagementMetrics {
    const totalEngagement = tweets.reduce((sum, tweet) => 
      sum + tweet.retweet_count + tweet.reply_count + tweet.like_count + tweet.quote_count, 0);

    const totalViews = tweets.reduce((sum, tweet) => sum + tweet.view_count, 0);

    return {
      totalEngagement,
      engagementRate: totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0,
      viralityScore: tweets.reduce((sum, tweet) => 
        sum + (tweet.retweet_count + tweet.quote_count) / (tweet.like_count + 1), 0) / tweets.length,
      interactionRate: totalEngagement > 0 ? 
        tweets.reduce((sum, tweet) => sum + (tweet.reply_count + tweet.quote_count), 0) / totalEngagement : 0,
      amplificationRatio: tweets.reduce((sum, tweet) => 
        sum + (tweet.retweet_count / (tweet.like_count + 1)), 0) / tweets.length,
      discussionRatio: tweets.reduce((sum, tweet) => {
        const total = tweet.retweet_count + tweet.like_count + tweet.quote_count;
        return sum + (tweet.reply_count / (total || 1));
      }, 0) / tweets.length,
      byTweet: tweets.map(tweet => ({
        id: tweet.id,
        date: tweet.created_at,
        engagement: tweet.retweet_count + tweet.reply_count + tweet.like_count + tweet.quote_count,
        views: tweet.view_count
      }))
    };
  }

  // 2. Quality & Influence Metrics
  private calculateQualityMetricsInternal(tweets: Tweet[]): QualityMetrics {
    const metrics = {
      engagementToRetweetRatio: tweets.reduce((sum, tweet) => {
        const total = tweet.retweet_count + tweet.reply_count + tweet.like_count + tweet.quote_count;
        return sum + (total / (tweet.retweet_count + 1));
      }, 0) / tweets.length,
      quoteToRetweetRatio: tweets.reduce((sum, tweet) => 
        sum + (tweet.quote_count / (tweet.retweet_count + 1)), 0) / tweets.length,
      likeToReplyRatio: tweets.reduce((sum, tweet) => 
        sum + (tweet.like_count / (tweet.reply_count + 1)), 0) / tweets.length,
      conversationDepthScore: tweets.reduce((sum, tweet) => {
        const total = tweet.retweet_count + tweet.reply_count + tweet.like_count + tweet.quote_count;
        return sum + (tweet.reply_count / (total || 1));
      }, 0) / tweets.length,
      shareabilityScore: tweets.reduce((sum, tweet) => {
        const total = tweet.retweet_count + tweet.reply_count + tweet.like_count + tweet.quote_count;
        return sum + ((tweet.retweet_count + tweet.quote_count) / (total || 1));
      }, 0) / tweets.length,
      byTweet: tweets.map(tweet => ({
        id: tweet.id,
        date: tweet.created_at,
        engagement: tweet.retweet_count + tweet.reply_count + tweet.like_count + tweet.quote_count,
        retweets: tweet.retweet_count,
        quotes: tweet.quote_count
      }))
    };

    return {
      ...metrics,
      radarData: {
        labels: Object.keys(metrics).filter(k => k !== 'byTweet'),
        values: Object.entries(metrics)
          .filter(([k]) => k !== 'byTweet')
          .map(([, v]) => v)
      }
    };
  }

  // 3. Visibility-Adjusted Metrics
  private calculateVisibilityMetricsInternal(tweets: Tweet[]): VisibilityMetrics {
    return {
      engagementRate: tweets.reduce((sum, tweet) => {
        const total = tweet.retweet_count + tweet.reply_count + tweet.like_count + tweet.quote_count;
        return sum + ((total / (tweet.view_count + 1)) * 100);
      }, 0) / tweets.length,
      retweetRate: tweets.reduce((sum, tweet) => 
        sum + ((tweet.retweet_count / (tweet.view_count + 1)) * 100), 0) / tweets.length,
      replyRate: tweets.reduce((sum, tweet) => 
        sum + ((tweet.reply_count / (tweet.view_count + 1)) * 100), 0) / tweets.length,
      likeRate: tweets.reduce((sum, tweet) => 
        sum + ((tweet.like_count / (tweet.view_count + 1)) * 100), 0) / tweets.length,
      quoteRate: tweets.reduce((sum, tweet) => 
        sum + ((tweet.quote_count / (tweet.view_count + 1)) * 100), 0) / tweets.length,
      byTweet: tweets.map(tweet => {
        const total = tweet.retweet_count + tweet.reply_count + tweet.like_count + tweet.quote_count;
        return {
          id: tweet.id,
          date: tweet.created_at,
          engagement: (total / (tweet.view_count + 1)) * 100,
          retweets: (tweet.retweet_count / (tweet.view_count + 1)) * 100,
          replies: (tweet.reply_count / (tweet.view_count + 1)) * 100,
          likes: (tweet.like_count / (tweet.view_count + 1)) * 100,
          quotes: (tweet.quote_count / (tweet.view_count + 1)) * 100
        };
      })
    };
  }

  // 4. Virality & Influence Metrics
  private calculateViralityMetricsInternal(tweets: Tweet[]): ViralityMetrics {
    return {
      amplificationScore: tweets.reduce((sum, tweet) => 
        sum + ((tweet.retweet_count + tweet.quote_count) / (tweet.view_count + 1)), 0) / tweets.length,
      conversationScore: tweets.reduce((sum, tweet) => 
        sum + (tweet.reply_count / (tweet.view_count + 1)), 0) / tweets.length,
      engagementPerThousandViews: tweets.reduce((sum, tweet) => {
        const total = tweet.retweet_count + tweet.reply_count + tweet.like_count + tweet.quote_count;
        return sum + ((total / (tweet.view_count + 1)) * 1000);
      }, 0) / tweets.length,
      shareabilityFactor: tweets.reduce((sum, tweet) => 
        sum + ((tweet.retweet_count + tweet.quote_count) / (tweet.like_count + 1)), 0) / tweets.length,
      conversionPotential: tweets.reduce((sum, tweet) => {
        const total = tweet.retweet_count + tweet.reply_count + tweet.like_count + tweet.quote_count;
        return sum + (total / (tweet.retweet_count + 1));
      }, 0) / tweets.length,
      byTweet: tweets.map(tweet => ({
        id: tweet.id,
        date: tweet.created_at,
        views: tweet.view_count,
        engagement: tweet.retweet_count + tweet.reply_count + tweet.like_count + tweet.quote_count,
        retweets: tweet.retweet_count,
        quotes: tweet.quote_count,
        likes: tweet.like_count
      }))
    };
  }

  // Get all metrics in one call
  async getAllMetrics(username: string) {
    const tweets = await this.getUserTweets(username);
    return {
      engagement: this.calculateEngagementMetricsInternal(tweets),
      quality: this.calculateQualityMetricsInternal(tweets),
      visibility: this.calculateVisibilityMetricsInternal(tweets),
      virality: this.calculateViralityMetricsInternal(tweets)
    };
  }

  // Public methods for individual metric calculations
  async calculateEngagementMetrics(username: string): Promise<EngagementMetrics> {
    const tweets = await this.getUserTweets(username);
    return this.calculateEngagementMetricsInternal(tweets);
  }

  async calculateQualityMetrics(username: string): Promise<QualityMetrics> {
    const tweets = await this.getUserTweets(username);
    return this.calculateQualityMetricsInternal(tweets);
  }

  async calculateVisibilityMetrics(username: string): Promise<VisibilityMetrics> {
    const tweets = await this.getUserTweets(username);
    return this.calculateVisibilityMetricsInternal(tweets);
  }

  async calculateViralityMetrics(username: string): Promise<ViralityMetrics> {
    const tweets = await this.getUserTweets(username);
    return this.calculateViralityMetricsInternal(tweets);
  }
} 