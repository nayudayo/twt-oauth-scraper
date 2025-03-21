import { useQuery } from '@tanstack/react-query';

export interface TweetMetric {
  id: string;
  date: Date;
  views: number;
  retweets: number;
  replies: number;
  likes: number;
  quotes: number;
  engagement: number;  // Required, not optional
}

export interface EngagementMetrics {
  byTweet: TweetMetric[];
  totalEngagement: number;
  engagementRate: number;
  viralityScore: number;
  interactionRate: number;
  amplificationRatio: number;
  discussionRatio: number;
}

export interface ViralityMetrics {
  byTweet: TweetMetric[];
  amplificationScore: number;
  shareabilityFactor: number;
  conversationScore: number;
  engagementPerThousandViews: number;
  conversionPotential: number;
}

export interface QualityMetrics {
  byTweet: TweetMetric[];
  engagementToRetweetRatio: number;
  quoteToRetweetRatio: number;
  likeToReplyRatio: number;
  conversationDepthScore: number;
  shareabilityScore: number;
  radarData: {
    labels: string[];
    values: (number | TweetMetric[])[];
  };
}

export interface VisibilityMetrics {
  byTweet: TweetMetric[];
  engagementRate: number;
  retweetRate: number;
  replyRate: number;
  likeRate: number;
  quoteRate: number;
}

interface AnalyticsData {
  username: string;
  engagement?: EngagementMetrics;
  quality?: QualityMetrics;
  visibility?: VisibilityMetrics;
  virality?: ViralityMetrics;
}

async function fetchAnalytics(username: string, options?: { refresh?: boolean; chartData?: boolean }): Promise<AnalyticsData> {
  if (!username) {
    throw new Error('Username is required');
  }

  const metrics = ['engagement', 'quality', 'visibility', 'virality'];
  
  const response = await fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      metrics,
      refresh: options?.refresh,
      chartData: options?.chartData
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch analytics');
  }
  
  return response.json();
}

async function fetchSpecificMetrics(
  username: string,
  metrics: ('engagement' | 'quality' | 'visibility' | 'virality')[]
): Promise<AnalyticsData> {
  if (!username) {
    throw new Error('Username is required');
  }
  const response = await fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, metrics })
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch specific metrics');
  }
  return response.json();
}

export function useAnalytics(username: string, options?: { refresh?: boolean; chartData?: boolean }) {
  return useQuery({
    queryKey: ['analytics', username, options],
    queryFn: () => fetchAnalytics(username, options),
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    refetchOnWindowFocus: false,
    enabled: !!username // Only run query if we have a username
  });
}

export function useSpecificMetrics(
  username: string,
  metrics: ('engagement' | 'quality' | 'visibility' | 'virality')[]
) {
  return useQuery({
    queryKey: ['analytics', username, metrics],
    queryFn: () => fetchSpecificMetrics(username, metrics),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!username // Only run query if we have a username
  });
}

export function calculateEngagementMetrics(tweets: TweetMetric[]): EngagementMetrics {
  const byTweet = tweets.map(tweet => {
    // Calculate total engagement (likes + retweets + replies + quotes)
    const engagement = tweet.likes + tweet.retweets + tweet.replies + tweet.quotes;
    return {
      ...tweet,
      engagement
    };
  });

  // Calculate total engagement across all tweets
  const totalEngagement = byTweet.reduce((sum, tweet) => sum + tweet.engagement, 0);
  
  // Calculate total views
  const totalViews = byTweet.reduce((sum, tweet) => sum + tweet.views, 0);
  
  // Calculate engagement rate (total engagement / total views)
  const engagementRate = totalViews > 0 ? totalEngagement / totalViews : 0;
  
  // Calculate virality score based on retweets and quotes relative to total engagement
  const viralityScore = byTweet.reduce((sum, tweet) => {
    const tweetTotal = tweet.engagement || 1;
    return sum + (tweet.retweets + tweet.quotes) / tweetTotal;
  }, 0) / tweets.length;

  // Calculate interaction rate (likes relative to total engagement)
  const totalLikes = byTweet.reduce((sum, tweet) => sum + tweet.likes, 0);
  const interactionRate = totalEngagement > 0 ? totalLikes / totalEngagement : 0;

  // Calculate amplification ratio (retweets relative to total engagement)
  const totalRetweets = byTweet.reduce((sum, tweet) => sum + tweet.retweets, 0);
  const amplificationRatio = totalEngagement > 0 ? totalRetweets / totalEngagement : 0;

  // Calculate discussion ratio (replies relative to total engagement)
  const totalReplies = byTweet.reduce((sum, tweet) => sum + tweet.replies, 0);
  const discussionRatio = totalEngagement > 0 ? totalReplies / totalEngagement : 0;

  return {
    byTweet,
    totalEngagement,
    engagementRate,
    viralityScore,
    interactionRate,
    amplificationRatio,
    discussionRatio
  };
}

export function calculateViralityMetrics(tweets: TweetMetric[]): ViralityMetrics {
  const byTweet = tweets.map(tweet => {
    // Calculate total engagement
    const engagement = tweet.likes + tweet.retweets + tweet.replies + tweet.quotes;
    return {
      ...tweet,
      engagement
    };
  });

  // Calculate amplification score (retweets + quotes relative to total engagement)
  const totalEngagement = byTweet.reduce((sum, tweet) => sum + tweet.engagement, 0);
  const totalAmplification = byTweet.reduce((sum, tweet) => sum + tweet.retweets + tweet.quotes, 0);
  const amplificationScore = totalEngagement > 0 ? totalAmplification / totalEngagement : 0;

  // Calculate shareability factor (retweets relative to views)
  const totalViews = byTweet.reduce((sum, tweet) => sum + tweet.views, 0);
  const totalRetweets = byTweet.reduce((sum, tweet) => sum + tweet.retweets, 0);
  const shareabilityFactor = totalViews > 0 ? totalRetweets / totalViews : 0;

  // Calculate conversation score (replies relative to total engagement)
  const totalReplies = byTweet.reduce((sum, tweet) => sum + tweet.replies, 0);
  const conversationScore = totalEngagement > 0 ? totalReplies / totalEngagement : 0;

  // Calculate engagement per thousand views
  const engagementPerThousandViews = totalViews > 0 ? (totalEngagement / totalViews) * 1000 : 0;

  // Calculate conversion potential (likes relative to views)
  const totalLikes = byTweet.reduce((sum, tweet) => sum + tweet.likes, 0);
  const conversionPotential = totalViews > 0 ? totalLikes / totalViews : 0;

  return {
    byTweet,
    amplificationScore,
    shareabilityFactor,
    conversationScore,
    engagementPerThousandViews,
    conversionPotential
  };
}

// Export AnalyticsData type since it's not exported directly
export type { AnalyticsData }; 