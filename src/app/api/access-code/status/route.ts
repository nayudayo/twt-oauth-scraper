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

interface StatusResponse {
  success: boolean;
  isVerified: boolean;
  error?: string;
  metadata: {
    timestamp: Date;
    requestId: string;
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        {
          success: false,
          isVerified: false,
          error: 'Unauthorized',
          metadata: generateResponseMetadata()
        } as StatusResponse,
        { status: 401 }
      );
    }

    const db = await initDB();
    
    // Get user
    const user = await db.getUserByUsername(session.username);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          isVerified: false,
          error: 'User not found',
          metadata: generateResponseMetadata()
        } as StatusResponse,
        { status: 404 }
      );
    }

    // Check if user has a valid access code
    const accessCode = await db.access.getUserAccessCode(user.id);
    
    return NextResponse.json({
      success: true,
      isVerified: Boolean(accessCode?.isActive),
      metadata: generateResponseMetadata()
    } as StatusResponse);
    
  } catch (error) {
    console.error('Access code status check error:', error);
    return NextResponse.json(
      {
        success: false,
        isVerified: false,
        error: 'Internal server error',
        metadata: generateResponseMetadata()
      } as StatusResponse,
      { status: 500 }
    );
  }
} 