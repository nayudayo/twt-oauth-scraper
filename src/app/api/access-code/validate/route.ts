import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';
import { AccessCodeError } from '@/types/access';

// Helper to generate API response metadata
function generateResponseMetadata() {
  return {
    timestamp: new Date(),
    requestId: crypto.randomUUID()
  };
}

interface ValidationResponse {
  success: boolean;
  alreadyValidated?: boolean;
  error?: string;
  metadata: {
    timestamp: Date;
    requestId: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    // Validate session
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          metadata: generateResponseMetadata()
        } as ValidationResponse,
        { status: 401 }
      );
    }

    // Parse request body
    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request: code is required',
          metadata: generateResponseMetadata()
        } as ValidationResponse,
        { status: 400 }
      );
    }

    // Initialize database
    const db = await initDB();

    // First ensure user exists
    let user = await db.getUserByUsername(session.username);
    if (!user) {
      user = await db.createUser({
        username: session.username,
        twitter_username: session.username,
        created_at: new Date()
      });
    }

    // Check if user already has a code
    const existingCode = await db.access.getUserAccessCode(user.id);
    if (existingCode) {
      return NextResponse.json({
        success: true,
        alreadyValidated: true,
        metadata: generateResponseMetadata()
      } as ValidationResponse);
    }

    // Validate and link code
    try {
      const isValid = await db.access.validateCode(code);
      if (!isValid) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid access code',
            metadata: generateResponseMetadata()
          } as ValidationResponse,
          { status: 400 }
        );
      }

      await db.access.linkCodeToUser(code, user.id);
      
      return NextResponse.json({
        success: true,
        metadata: generateResponseMetadata()
      } as ValidationResponse);
    } catch (error) {
      if (error instanceof AccessCodeError) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            metadata: generateResponseMetadata()
          } as ValidationResponse,
          { status: error.status }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('Access code validation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        metadata: generateResponseMetadata()
      } as ValidationResponse,
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const db = await initDB();
    
    // Get user
    const user = await db.getUserByUsername(session.username);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user has a valid access code
    const accessCode = await db.access.getUserAccessCode(user.id);
    
    // If they have a valid code, return success
    if (accessCode?.isActive) {
      return NextResponse.json({
        success: true,
        alreadyValidated: true
      });
    }

    return NextResponse.json({
      success: false,
      error: 'No valid access code found'
    }, { status: 403 });
    
  } catch (error) {
    console.error('Access code verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 