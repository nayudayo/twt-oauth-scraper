import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { AnalyticsService } from '@/lib/analytics';

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

interface MetricResults {
  engagement?: EngagementMetrics;
  quality?: QualityMetrics;
  visibility?: VisibilityMetrics;
  virality?: ViralityMetrics;
}

type MetricType = 'engagement' | 'quality' | 'visibility' | 'virality';

// Initialize the PostgreSQL pool
const pool = new Pool({
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  port: parseInt(process.env.PG_PORT || '5432')
});

const analyticsService = new AnalyticsService(pool);

async function getCachedMetrics(username: string, metricType: MetricType | 'all') {
  // First get the user's ID
  const userResult = await pool.query(
    'SELECT id FROM users WHERE username = $1',
    [username]
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  const userId = userResult.rows[0].id;

  // Then get the analytics results
  const result = await pool.query(
    'SELECT data FROM analytics_results WHERE user_id = $1 AND metric_type = $2',
    [userId, metricType]
  );
  return result.rows[0]?.data;
}

async function updateCachedMetrics(
  username: string, 
  metricType: MetricType | 'all', 
  data: MetricResults | EngagementMetrics | QualityMetrics | VisibilityMetrics | ViralityMetrics
) {
  // First get the user's ID
  const userResult = await pool.query(
    'SELECT id FROM users WHERE username = $1',
    [username]
  );

  if (userResult.rows.length === 0) {
    throw new Error('User not found');
  }

  const userId = userResult.rows[0].id;

  // Then update the analytics results
  await pool.query(
    `INSERT INTO analytics_results (user_id, metric_type, data)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, metric_type)
     DO UPDATE SET data = $3, updated_at = CURRENT_TIMESTAMP`,
    [userId, metricType, data]
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, metrics: requestedMetrics, refresh = false, chartData = false } = body;

    if (!username || !requestedMetrics || !Array.isArray(requestedMetrics)) {
      return NextResponse.json(
        { error: 'username and metrics array are required' },
        { status: 400 }
      );
    }

    // Try to get cached results first
    if (!refresh) {
      const cachedMetrics = await getCachedMetrics(username, 'all');
      if (cachedMetrics) {
        // Filter only requested metrics
        const filteredMetrics: MetricResults = Object.fromEntries(
          Object.entries(cachedMetrics).filter(([key]) => requestedMetrics.includes(key as MetricType))
        );

        if (chartData) {
          // Format response with chart data for requested metrics
          const chartDataMetrics = Object.fromEntries(
            Object.entries(filteredMetrics).map(([key, value]) => [
              key,
              {
                ...value,
                chartData: {
                  type: key === 'engagement' ? 'line' :
                        key === 'quality' ? 'radar' :
                        key === 'visibility' ? 'bar' : 'scatter',
                  data: value
                }
              }
            ])
          ) as MetricResults;
          return NextResponse.json({
            username,
            ...chartDataMetrics
          });
        }
        return NextResponse.json({
          username,
          ...filteredMetrics
        });
      }
    }

    // Calculate fresh metrics
    const allMetrics = await analyticsService.getAllMetrics(username);
    
    // Cache all metrics
    await updateCachedMetrics(username, 'all', allMetrics);
    
    // Filter only requested metrics
    const filteredMetrics: MetricResults = Object.fromEntries(
      Object.entries(allMetrics).filter(([key]) => requestedMetrics.includes(key as MetricType))
    );

    if (chartData) {
      // Format response with chart data for requested metrics
      const chartDataMetrics = Object.fromEntries(
        Object.entries(filteredMetrics).map(([key, value]) => [
          key,
          {
            ...value,
            chartData: {
              type: key === 'engagement' ? 'line' :
                    key === 'quality' ? 'radar' :
                    key === 'visibility' ? 'bar' : 'scatter',
              data: value
            }
          }
        ])
      ) as MetricResults;
      return NextResponse.json({
        username,
        ...chartDataMetrics
      });
    }
    
    return NextResponse.json({
      username,
      ...filteredMetrics
    });
  } catch (error) {
    console.error('Analytics API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
} 