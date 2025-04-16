import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';

export async function POST() {
  try {
    // Validate session
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Initialize database
    const db = await initDB();

    // Get user
    const user = await db.getUserByUsername(session.username);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update last analysis time
    await db.updateLastOperationTime(user.id, 'analyze');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update analysis time:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 