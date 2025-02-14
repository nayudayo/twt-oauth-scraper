import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';
import { ConversationError } from '@/lib/db/conversation';
import type { MessageResponse, MessageListResponse } from '@/types/conversation';

// Helper to generate API response metadata
function generateResponseMetadata(conversationId: number) {
  return {
    timestamp: new Date(),
    requestId: crypto.randomUUID(),
    conversationId
  };
}

export async function GET(request: NextRequest) {
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
        } as MessageListResponse,
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
        } as MessageListResponse,
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
        } as MessageListResponse,
        { status: 401 }
      );
    }

    // First get the user
    const db = await initDB();
    const user = await db.getUserByUsername(session.username);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
          metadata: generateResponseMetadata(conversationId)
        } as MessageListResponse,
        { status: 404 }
      );
    }

    // Then get the messages using the user's ID
    const messages = await db.conversation.getMessages(conversationId, user.id);

    return NextResponse.json({
      success: true,
      data: messages,
      metadata: generateResponseMetadata(conversationId)
    } as MessageListResponse);
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    
    if (error instanceof ConversationError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          metadata: generateResponseMetadata(0)
        } as MessageListResponse,
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch messages',
        metadata: generateResponseMetadata(0)
      } as MessageListResponse,
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Extract ID from URL
    const id = request.url.split('/').pop();
    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid conversation ID',
          metadata: generateResponseMetadata(0)
        } as MessageResponse,
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
        } as MessageResponse,
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
        } as MessageResponse,
        { status: 401 }
      );
    }

    const { content, role, metadata } = await request.json();
    if (!content || !role || !['user', 'assistant'].includes(role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid message data',
          metadata: generateResponseMetadata(conversationId)
        } as MessageResponse,
        { status: 400 }
      );
    }

    const db = await initDB();
    
    // First verify conversation ownership
    await db.conversation.getConversation(conversationId, session.username);
    
    // Then add the message
    const message = await db.conversation.addMessage({
      conversationId,
      content,
      role,
      metadata
    });

    return NextResponse.json({
      success: true,
      data: message,
      metadata: generateResponseMetadata(conversationId)
    } as MessageResponse);
  } catch (error) {
    console.error('Failed to add message:', error);
    
    if (error instanceof ConversationError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          metadata: generateResponseMetadata(0)
        } as MessageResponse,
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to add message',
        metadata: generateResponseMetadata(0)
      } as MessageResponse,
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Extract ID from URL
    const id = request.url.split('/').pop();
    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid message ID',
          metadata: generateResponseMetadata(0)
        } as MessageResponse,
        { status: 400 }
      );
    }

    const messageId = parseInt(id);
    if (isNaN(messageId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid message ID',
          metadata: generateResponseMetadata(0)
        } as MessageResponse,
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          metadata: generateResponseMetadata(0)
        } as MessageResponse,
        { status: 401 }
      );
    }

    const { content } = await request.json();
    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: 'Content is required',
          metadata: generateResponseMetadata(0)
        } as MessageResponse,
        { status: 400 }
      );
    }

    const db = await initDB();
    const message = await db.conversation.updateMessage(messageId, session.username, content);

    return NextResponse.json({
      success: true,
      data: message,
      metadata: generateResponseMetadata(message.conversationId)
    } as MessageResponse);
  } catch (error) {
    console.error('Failed to update message:', error);
    
    if (error instanceof ConversationError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          metadata: generateResponseMetadata(0)
        } as MessageResponse,
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update message',
        metadata: generateResponseMetadata(0)
      } as MessageResponse,
      { status: 500 }
    );
  }
} 