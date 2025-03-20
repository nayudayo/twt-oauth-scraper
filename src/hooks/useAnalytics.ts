import { useQuery } from '@tanstack/react-query';

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

interface MetricBase {
  byTweet: TweetMetric[];
}

interface EngagementMetrics extends MetricBase {
  totalEngagement: number;
  engagementRate: number;
  viralityScore: number;
  interactionRate: number;
  amplificationRatio: number;
  discussionRatio: number;
}

interface QualityMetrics extends MetricBase {
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

interface VisibilityMetrics extends MetricBase {
  engagementRate: number;
  retweetRate: number;
  replyRate: number;
  likeRate: number;
  quoteRate: number;
}

interface ViralityMetrics extends MetricBase {
  amplificationScore: number;
  conversationScore: number;
  engagementPerThousandViews: number;
  shareabilityFactor: number;
  conversionPotential: number;
}

interface AnalyticsData {
  engagement?: EngagementMetrics;
  quality?: QualityMetrics;
  visibility?: VisibilityMetrics;
  virality?: ViralityMetrics;
}

async function fetchAnalytics(username: string, refresh?: boolean, chartData?: boolean): Promise<AnalyticsData> {
  if (!username) {
    throw new Error('Username is required');
  }

  const params = new URLSearchParams({
    username,
    ...(refresh && { refresh: 'true' }),
    ...(chartData && { chartData: 'true' })
  });

  const response = await fetch(`/api/analytics?${params}`);
  
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
    queryFn: () => fetchAnalytics(username, options?.refresh, options?.chartData),
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

// Export types for use in components
export type {
  TweetMetric,
  EngagementMetrics,
  QualityMetrics,
  VisibilityMetrics,
  ViralityMetrics,
  AnalyticsData
}; 