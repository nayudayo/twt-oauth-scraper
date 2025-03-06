import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';
import { PersonalityCacheError } from '@/types/cache';
import { getRedis } from '@/lib/redis';

const CACHE_TTL = 5 * 60; // 5 minutes

// Helper to generate API response metadata
function generateResponseMetadata() {
  return {
    timestamp: new Date(),
    requestId: crypto.randomUUID()
  };
}

interface CacheResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  metadata: {
    timestamp: Date;
    requestId: string;
  };
}

export async function GET(
  request: NextRequest,
) {
  try {
    // Validate session
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: 401 }
      );
    }

    // Extract username from URL using URL parsing
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const username = pathParts[pathParts.indexOf('personality') + 1];

    if (!username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Username is required',
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: 400 }
      );
    }

    // Try Redis cache first
    const redis = await getRedis();
    const cacheKey = `personality:${username}:cache`;
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      return NextResponse.json({
        success: true,
        data: parsed,
        metadata: generateResponseMetadata()
      } as CacheResponse, {
        headers: {
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
          'X-Cache': 'HIT'
        }
      });
    }

    // Initialize database
    const db = await initDB();

    // Get user
    const user = await db.getUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: 404 }
      );
    }

    // Get cache from database
    const cache = await db.personality.getPersonalityCache(user.id);
    if (!cache) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cache not found',
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: 404 }
      );
    }

    // Store in Redis for future requests
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(cache.analysisData));

    return NextResponse.json({
      success: true,
      data: cache.analysisData,
      metadata: generateResponseMetadata()
    } as CacheResponse, {
      headers: {
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-Cache': 'MISS'
      }
    });

  } catch (error) {
    console.error('Error fetching personality cache:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        metadata: generateResponseMetadata()
      } as CacheResponse,
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    // Validate session
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: 401 }
      );
    }

    // Extract username from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const username = pathParts[pathParts.indexOf('personality') + 1];

    if (!username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Username is required',
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: 400 }
      );
    }

    // Parse request body
    const { analysisData, version } = await request.json();
    if (!analysisData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Analysis data is required',
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: 400 }
      );
    }

    // Initialize database
    const db = await initDB();

    // Get user
    const user = await db.getUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: 404 }
      );
    }

    // Save to database
    await db.personality.savePersonalityCache(user.id, analysisData, version);

    // Update Redis cache
    const redis = await getRedis();
    const cacheKey = `personality:${username}:cache`;
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(analysisData));

    return NextResponse.json({
      success: true,
      metadata: generateResponseMetadata()
    } as CacheResponse);

  } catch (error) {
    console.error('Error saving personality cache:', error);

    if (error instanceof PersonalityCacheError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        metadata: generateResponseMetadata()
      } as CacheResponse,
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
) {
  try {
    // Validate session
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: 401 }
      );
    }

    // Extract username from URL
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const username = pathParts[pathParts.indexOf('personality') + 1];

    if (!username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Username is required',
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: 400 }
      );
    }

    // Initialize database
    const db = await initDB();

    // Get user
    const user = await db.getUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
          metadata: generateResponseMetadata()
        } as CacheResponse,
        { status: 404 }
      );
    }

    // Invalidate database cache
    await db.personality.invalidateCache(user.id);

    // Remove Redis cache
    const redis = await getRedis();
    const cacheKey = `personality:${username}:cache`;
    await redis.del(cacheKey);

    return NextResponse.json({
      success: true,
      metadata: generateResponseMetadata()
    } as CacheResponse);

  } catch (error) {
    console.error('Error invalidating personality cache:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        metadata: generateResponseMetadata()
      } as CacheResponse,
      { status: 500 }
    );
  }
} 