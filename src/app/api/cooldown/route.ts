import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';

export async function GET(request: Request) {
  try {
    // Get user session
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get operation type from query params
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation') as 'scrape' | 'analyze';
    
    if (!operation || !['scrape', 'analyze'].includes(operation)) {
      return NextResponse.json(
        { error: 'Invalid operation type' },
        { status: 400 }
      );
    }

    // Initialize database and get user
    const db = await initDB();
    const user = await db.getUserByUsername(session.username);
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check cooldown status
    const cooldownStatus = await db.getCooldownStatus(user.id, operation);

    return NextResponse.json(cooldownStatus);
  } catch (error) {
    console.error('Cooldown check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 