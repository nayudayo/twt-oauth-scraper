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
  views: number;
  retweets: number;
  replies: number;
  likes: number;
  quotes: number;
  engagement: number;
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
      // First get the user ID
      console.log('Getting user ID for username:', username);
      const userResult = await this.pool.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (userResult.rows.length === 0) {
        console.log('No user found with username:', username);
        throw new Error('User not found');
      }

      const userId = userResult.rows[0].id;
      console.log('Found user ID:', userId);

      // Then get their tweets with all metrics
      console.log('Fetching tweets for user ID:', userId);
      const result = await this.pool.query(
        `SELECT 
          id,
          text,
          created_at,
          view_count,
          retweet_count,
          reply_count,
          like_count,
          quote_count
        FROM tweets 
        WHERE user_id = $1 
        ORDER BY created_at DESC`,
        [userId]
      );

      const rows = result.rows;
      
      if (rows.length === 0) {
        console.log('No tweets found for user:', username);
      } else {
        console.log(`Found ${rows.length} tweets for user:`, username);
        // Log first tweet metrics for debugging
        console.log('First tweet metrics:', {
          id: rows[0].id,
          text: rows[0].text?.substring(0, 50) + '...',
          view_count: rows[0].view_count,
          retweet_count: rows[0].retweet_count,
          reply_count: rows[0].reply_count,
          like_count: rows[0].like_count,
          quote_count: rows[0].quote_count,
          total_engagement: (
            (rows[0].retweet_count ?? 0) + 
            (rows[0].reply_count ?? 0) + 
            (rows[0].like_count ?? 0) + 
            (rows[0].quote_count ?? 0)
          )
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
    const byTweet = tweets.map(tweet => ({
      id: tweet.id,
      date: tweet.created_at,
      views: tweet.view_count ?? 0,
      retweets: tweet.retweet_count ?? 0,
      replies: tweet.reply_count ?? 0,
      likes: tweet.like_count ?? 0,
      quotes: tweet.quote_count ?? 0,
      engagement: (tweet.retweet_count ?? 0) + (tweet.reply_count ?? 0) + 
                 (tweet.like_count ?? 0) + (tweet.quote_count ?? 0)
    }));

    const totalEngagement = byTweet.reduce((sum, tweet) => sum + tweet.engagement, 0);
    const totalViews = byTweet.reduce((sum, tweet) => sum + tweet.views, 0);

    return {
      byTweet,
      totalEngagement,
      engagementRate: totalViews > 0 ? totalEngagement / totalViews : 0,
      viralityScore: byTweet.reduce((sum, tweet) => {
        const total = tweet.engagement || 1;
        return sum + ((tweet.retweets + tweet.quotes) / total);
      }, 0) / tweets.length,
      interactionRate: totalEngagement > 0 ? 
        byTweet.reduce((sum, tweet) => sum + (tweet.replies + tweet.quotes), 0) / totalEngagement : 0,
      amplificationRatio: byTweet.reduce((sum, tweet) => {
        const total = tweet.likes + 1;
        return sum + (tweet.retweets / total);
      }, 0) / tweets.length,
      discussionRatio: byTweet.reduce((sum, tweet) => {
        const total = tweet.retweets + tweet.likes + tweet.quotes || 1;
        return sum + (tweet.replies / total);
      }, 0) / tweets.length
    };
  }

  // 2. Quality & Influence Metrics
  private calculateQualityMetricsInternal(tweets: Tweet[]): QualityMetrics {
    const byTweet = tweets.map(tweet => ({
      id: tweet.id,
      date: tweet.created_at,
      views: tweet.view_count ?? 0,
      retweets: tweet.retweet_count ?? 0,
      replies: tweet.reply_count ?? 0,
      likes: tweet.like_count ?? 0,
      quotes: tweet.quote_count ?? 0,
      engagement: (tweet.retweet_count ?? 0) + (tweet.reply_count ?? 0) + 
                 (tweet.like_count ?? 0) + (tweet.quote_count ?? 0)
    }));

    const metrics = {
      engagementToRetweetRatio: byTweet.reduce((sum, tweet) => {
        const total = tweet.engagement;
        return sum + (total / (tweet.retweets + 1));
      }, 0) / tweets.length,
      quoteToRetweetRatio: byTweet.reduce((sum, tweet) => 
        sum + (tweet.quotes / (tweet.retweets + 1)), 0) / tweets.length,
      likeToReplyRatio: byTweet.reduce((sum, tweet) => 
        sum + (tweet.likes / (tweet.replies + 1)), 0) / tweets.length,
      conversationDepthScore: byTweet.reduce((sum, tweet) => {
        const total = tweet.engagement || 1;
        return sum + (tweet.replies / total);
      }, 0) / tweets.length,
      shareabilityScore: byTweet.reduce((sum, tweet) => {
        const total = tweet.engagement || 1;
        return sum + ((tweet.retweets + tweet.quotes) / total);
      }, 0) / tweets.length,
      byTweet
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
    const byTweet = tweets.map(tweet => ({
      id: tweet.id,
      date: tweet.created_at,
      views: tweet.view_count ?? 0,
      retweets: tweet.retweet_count ?? 0,
      replies: tweet.reply_count ?? 0,
      likes: tweet.like_count ?? 0,
      quotes: tweet.quote_count ?? 0,
      engagement: (tweet.retweet_count ?? 0) + (tweet.reply_count ?? 0) + 
                 (tweet.like_count ?? 0) + (tweet.quote_count ?? 0)
    }));

    return {
      engagementRate: byTweet.reduce((sum, tweet) => {
        const total = tweet.engagement;
        return sum + ((total / (tweet.views + 1)) * 100);
      }, 0) / tweets.length,
      retweetRate: byTweet.reduce((sum, tweet) => 
        sum + ((tweet.retweets / (tweet.views + 1)) * 100), 0) / tweets.length,
      replyRate: byTweet.reduce((sum, tweet) => 
        sum + ((tweet.replies / (tweet.views + 1)) * 100), 0) / tweets.length,
      likeRate: byTweet.reduce((sum, tweet) => 
        sum + ((tweet.likes / (tweet.views + 1)) * 100), 0) / tweets.length,
      quoteRate: byTweet.reduce((sum, tweet) => 
        sum + ((tweet.quotes / (tweet.views + 1)) * 100), 0) / tweets.length,
      byTweet
    };
  }

  // 4. Virality & Influence Metrics
  private calculateViralityMetricsInternal(tweets: Tweet[]): ViralityMetrics {
    const byTweet = tweets.map(tweet => ({
      id: tweet.id,
      date: tweet.created_at,
      views: tweet.view_count ?? 0,
      retweets: tweet.retweet_count ?? 0,
      replies: tweet.reply_count ?? 0,
      likes: tweet.like_count ?? 0,
      quotes: tweet.quote_count ?? 0,
      engagement: (tweet.retweet_count ?? 0) + (tweet.reply_count ?? 0) + 
                 (tweet.like_count ?? 0) + (tweet.quote_count ?? 0)
    }));

    const totalEngagement = byTweet.reduce((sum, tweet) => sum + tweet.engagement, 0);
    const totalViews = byTweet.reduce((sum, tweet) => sum + tweet.views, 0);

    return {
      amplificationScore: byTweet.reduce((sum, tweet) => {
        const total = tweet.engagement || 1;
        return sum + ((tweet.retweets + tweet.quotes) / total);
      }, 0) / tweets.length,
      conversationScore: byTweet.reduce((sum, tweet) => {
        const total = tweet.engagement || 1;
        return sum + (tweet.replies / total);
      }, 0) / tweets.length,
      engagementPerThousandViews: totalViews > 0 ? (totalEngagement / totalViews) * 1000 : 0,
      shareabilityFactor: totalViews > 0 ? 
        byTweet.reduce((sum, tweet) => sum + tweet.retweets, 0) / totalViews : 0,
      conversionPotential: totalViews > 0 ? 
        byTweet.reduce((sum, tweet) => sum + tweet.likes, 0) / totalViews : 0,
      byTweet
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