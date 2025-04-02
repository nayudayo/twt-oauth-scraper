import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';
import { DatabaseAdapter } from '@/lib/db/adapters/types';
import { DBTransaction } from '@/lib/db/adapters/types';

interface LeaderboardRow {
  username: string;
  referral_code: string;
  total_referrals: string;
  last_used: Date | null;
}

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

    // Use transaction to execute the queries
    const result = await (db as DatabaseAdapter).transaction<{
      leaderboardData: LeaderboardRow[];
      referralCodesCount: number;
      referralTrackingCount: number;
    }>(async (transaction: DBTransaction) => {
      // First check if we have any data in the tables
      const { rows: [referralCodesCount] } = await transaction.client.query(
        'SELECT COUNT(*) as count FROM referral_codes'
      );
      
      const { rows: [referralTrackingCount] } = await transaction.client.query(
        'SELECT COUNT(*) as count FROM referral_tracking'
      );

      // Log counts for debugging
      console.log('Table counts:', {
        referralCodes: parseInt(referralCodesCount.count),
        referralTracking: parseInt(referralTrackingCount.count)
      });

      // If no data, return empty counts
      if (parseInt(referralCodesCount.count) === 0) {
        return {
          leaderboardData: [],
          referralCodesCount: parseInt(referralCodesCount.count),
          referralTrackingCount: parseInt(referralTrackingCount.count)
        };
      }

      // If we have data, run the full query
      const leaderboardQuery = `
        WITH ReferralStats AS (
          SELECT 
            rc.owner_user_id as referrer_user_id,
            rc.code as referral_code,
            COALESCE(rt.tracking_count, 0) as tracking_count,
            rc.usage_count as code_usage_count,
            GREATEST(
              COALESCE(rt.tracking_count, 0),
              COALESCE(rc.usage_count, 0)
            ) as total_referrals,
            GREATEST(
              COALESCE(rt.last_used, '1970-01-01'::timestamp),
              COALESCE(
                (SELECT MAX(used_at) FROM referral_usage_log rul WHERE rul.referral_code = rc.code),
                '1970-01-01'::timestamp
              )
            ) as last_used
          FROM referral_codes rc
          LEFT JOIN (
            SELECT 
              referral_code,
              COUNT(DISTINCT referred_user_id) as tracking_count,
              MAX(used_at) as last_used
            FROM referral_tracking
            GROUP BY referral_code
          ) rt ON rt.referral_code = rc.code
          WHERE rc.code NOT LIKE 'NEURAL%'
          ORDER BY total_referrals DESC, last_used DESC
          LIMIT 50
        )
        SELECT 
          u.username,
          rs.referral_code,
          rs.total_referrals::text,
          rs.last_used
        FROM ReferralStats rs
        JOIN users u ON rs.referrer_user_id = u.id
        ORDER BY rs.total_referrals DESC, rs.last_used DESC
      `;

      const { rows } = await transaction.client.query<LeaderboardRow>(leaderboardQuery);

      // Log some data for debugging
      console.log('Query results:', {
        rowCount: rows.length,
        firstRow: rows[0],
        lastRow: rows[rows.length - 1]
      });

      return {
        leaderboardData: rows,
        referralCodesCount: parseInt(referralCodesCount.count),
        referralTrackingCount: parseInt(referralTrackingCount.count)
      };
    });

    // Log table counts for debugging
    console.log('Table counts:', {
      referralCodes: result.referralCodesCount,
      referralTracking: result.referralTrackingCount
    });

    return NextResponse.json({
      success: true,
      data: result.leaderboardData.map((row: LeaderboardRow) => ({
        username: row.username,
        referralCode: row.referral_code,
        totalReferrals: parseInt(row.total_referrals),
        lastUsed: row.last_used
      })),
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