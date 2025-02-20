import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';

// Helper to generate API response metadata
function generateResponseMetadata() {
  return {
    timestamp: new Date(),
    requestId: crypto.randomUUID()
  };
}

interface LeaderboardResponse {
  success: boolean;
  data?: Array<{
    username: string;
    referralCode: string;
    totalReferrals: number;
    lastUsed?: Date;
  }>;
  error?: string;
  metadata: {
    timestamp: Date;
    requestId: string;
  };
}

export async function GET() {
  try {
    // Validate session
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          metadata: generateResponseMetadata()
        } as LeaderboardResponse,
        { status: 401 }
      );
    }

    // Initialize database
    const db = await initDB();

    // Get top referrers with details
    const topReferrers = await db.access.getTopReferrers(50); // Get top 50 referrers

    // Get detailed user info for each referrer
    const leaderboardData = await Promise.all(
      topReferrers.map(async (referrer) => {
        const user = await db.getUserById(referrer.userId);
        const referralStats = await db.access.getReferralStats(referrer.userId);
        
        return {
          username: user?.username || 'Unknown',
          referralCode: referralStats.codes[0]?.code || 'N/A',
          totalReferrals: referrer.totalReferrals,
          lastUsed: referralStats.usages[0]?.used_at
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: leaderboardData,
      metadata: generateResponseMetadata()
    } as LeaderboardResponse);

  } catch (error) {
    console.error('Failed to fetch leaderboard:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch leaderboard data',
        metadata: generateResponseMetadata()
      } as LeaderboardResponse,
      { status: 500 }
    );
  }
} 