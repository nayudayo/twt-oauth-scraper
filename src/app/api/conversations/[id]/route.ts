import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';
import { ConversationError } from '@/lib/db/conversation';

// Helper to generate API response metadata
function generateResponseMetadata(conversationId: number) {
  return {
    timestamp: new Date(),
    requestId: crypto.randomUUID(),
    conversationId
  };
}

export async function DELETE(request: NextRequest) {
  try {
    // Extract ID from URL using URL parsing
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const id = pathParts[pathParts.indexOf('conversations') + 1];
    
    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid conversation ID',
          metadata: generateResponseMetadata(0)
        },
        { status: 400 }
      );
    }

    const conversationId = parseInt(id);
    if (isNaN(conversationId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid conversation ID',
          metadata: generateResponseMetadata(0)
        },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          metadata: generateResponseMetadata(conversationId)
        },
        { status: 401 }
      );
    }

    const db = await initDB();
    
    // Get user first
    const user = await db.getUserByUsername(session.username);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
          metadata: generateResponseMetadata(conversationId)
        },
        { status: 404 }
      );
    }
    
    // Delete conversation using user ID
    await db.conversation.deleteConversation(conversationId, user.id);

    return NextResponse.json({
      success: true,
      metadata: generateResponseMetadata(conversationId)
    });
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    
    if (error instanceof ConversationError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          metadata: generateResponseMetadata(0)
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete conversation',
        metadata: generateResponseMetadata(0)
      },
      { status: 500 }
    );
  }
} 