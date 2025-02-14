import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';
import { ConversationError } from '@/lib/db/conversation';
import type { ConversationResponse, ConversationListResponse } from '@/types/conversation';

// Helper to generate API response metadata
function generateResponseMetadata() {
  return {
    timestamp: new Date(),
    requestId: crypto.randomUUID()
  };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Unauthorized',
          metadata: generateResponseMetadata()
        } as ConversationResponse, 
        { status: 401 }
      );
    }

    const { initialMessage, title, metadata } = await req.json();
    const db = await initDB();
    
    // First, ensure the user exists
    let user = await db.getUserByUsername(session.username);
    if (!user) {
      // Create the user if they don't exist
      user = await db.createUser({
        username: session.username,
        twitter_username: session.username,
        created_at: new Date()
      });
    }
    
    // Then create the conversation using the user's ID
    const conversation = await db.conversation.startNewChat({
      userId: user.id,
      initialMessage,
      title,
      metadata
    });

    return NextResponse.json({
      success: true,
      data: conversation,
      metadata: generateResponseMetadata()
    } as ConversationResponse);
  } catch (error) {
    console.error('Failed to create conversation:', error);
    
    if (error instanceof ConversationError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          metadata: generateResponseMetadata()
        } as ConversationResponse,
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create conversation',
        metadata: generateResponseMetadata()
      } as ConversationResponse,
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          metadata: generateResponseMetadata()
        } as ConversationListResponse,
        { status: 401 }
      );
    }

    const db = await initDB();
    
    // First get the user
    const user = await db.getUserByUsername(session.username);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
          metadata: generateResponseMetadata()
        } as ConversationListResponse,
        { status: 404 }
      );
    }
    
    // Then get their conversations
    const conversations = await db.conversation.getUserConversations(user.id);

    return NextResponse.json({
      success: true,
      data: conversations,
      metadata: {
        ...generateResponseMetadata(),
        totalCount: conversations.length
      }
    } as ConversationListResponse);
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    
    if (error instanceof ConversationError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          metadata: generateResponseMetadata()
        } as ConversationListResponse,
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch conversations',
        metadata: generateResponseMetadata()
      } as ConversationListResponse,
      { status: 500 }
    );
  }
} 