import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { AnalyticsService } from '@/lib/analytics';

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

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const username = searchParams.get('username');
    const forceRefresh = searchParams.get('refresh') === 'true';
    const chartData = searchParams.get('chartData') === 'true';

    if (!username) {
      return NextResponse.json(
        { error: 'username is required' },
        { status: 400 }
      );
    }

    // Try to get cached results first
    if (!forceRefresh) {
      const cachedMetrics = await getCachedMetrics(username, 'all');
      if (cachedMetrics) {
        if (chartData) {
          // Format response with chart data
          return NextResponse.json({
            username,
            metrics: {
              engagement: {
                ...cachedMetrics.engagement,
                chartData: {
                  type: 'line',
                  data: cachedMetrics.engagement
                }
              },
              quality: {
                ...cachedMetrics.quality,
                chartData: {
                  type: 'radar',
                  data: cachedMetrics.quality
                }
              },
              visibility: {
                ...cachedMetrics.visibility,
                chartData: {
                  type: 'bar',
                  data: cachedMetrics.visibility
                }
              },
              virality: {
                ...cachedMetrics.virality,
                chartData: {
                  type: 'scatter',
                  data: cachedMetrics.virality
                }
              }
            }
          });
        }
        return NextResponse.json(cachedMetrics);
      }
    }

    // Calculate fresh metrics
    const metrics = await analyticsService.getAllMetrics(username);
    
    // Cache the results
    await updateCachedMetrics(username, 'all', metrics);
    
    if (chartData) {
      // Format response with chart data
      return NextResponse.json({
        username,
        metrics: {
          engagement: {
            ...metrics.engagement,
            chartData: {
              type: 'line',
              data: metrics.engagement
            }
          },
          quality: {
            ...metrics.quality,
            chartData: {
              type: 'radar',
              data: metrics.quality
            }
          },
          visibility: {
            ...metrics.visibility,
            chartData: {
              type: 'bar',
              data: metrics.visibility
            }
          },
          virality: {
            ...metrics.virality,
            chartData: {
              type: 'scatter',
              data: metrics.virality
            }
          }
        }
      });
    }
    
    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Analytics API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, metrics: requestedMetrics, refresh = false } = body;

    if (!username || !requestedMetrics || !Array.isArray(requestedMetrics)) {
      return NextResponse.json(
        { error: 'username and metrics array are required' },
        { status: 400 }
      );
    }

    const results: MetricResults = {};

    for (const metric of requestedMetrics as MetricType[]) {
      // Try to get cached results first
      if (!refresh) {
        const cachedMetric = await getCachedMetrics(username, metric);
        if (cachedMetric) {
          results[metric] = cachedMetric;
          continue;
        }
      }

      // Calculate fresh metrics if no cache or refresh requested
      switch (metric) {
        case 'engagement':
          results.engagement = await analyticsService.calculateEngagementMetrics(username);
          await updateCachedMetrics(username, 'engagement', results.engagement);
          break;
        case 'quality':
          results.quality = await analyticsService.calculateQualityMetrics(username);
          await updateCachedMetrics(username, 'quality', results.quality);
          break;
        case 'visibility':
          results.visibility = await analyticsService.calculateVisibilityMetrics(username);
          await updateCachedMetrics(username, 'visibility', results.visibility);
          break;
        case 'virality':
          results.virality = await analyticsService.calculateViralityMetrics(username);
          await updateCachedMetrics(username, 'virality', results.virality);
          break;
        default:
          console.warn(`Unknown metric type: ${metric}`);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Analytics API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
} 