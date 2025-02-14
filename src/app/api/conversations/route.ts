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
    
    const conversation = await db.conversation.startNewChat({
      userId: session.username,
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
    const conversations = await db.conversation.getUserConversations(session.username);

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