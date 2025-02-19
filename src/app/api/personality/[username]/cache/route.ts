import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';
import { PersonalityCacheError } from '@/types/cache';

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

    // Get cache
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

    return NextResponse.json({
      success: true,
      data: cache.analysisData,
      metadata: generateResponseMetadata()
    } as CacheResponse);

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

    // Save cache
    await db.personality.savePersonalityCache(user.id, analysisData, version);

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

// Add DELETE endpoint for cache invalidation
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

    // Invalidate cache
    await db.personality.invalidateCache(user.id);

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