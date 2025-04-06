import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';
import { ConversationError } from '@/lib/db/conversation';
import type { ConversationResponse } from '@/types/conversation';

// Helper to generate API response metadata
function generateResponseMetadata() {
  return {
    timestamp: new Date(),
    requestId: crypto.randomUUID()
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const db = await initDB();
    
    // First get the user
    const user = await db.getUserByUsername(session.username);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
          metadata: generateResponseMetadata()
        } as ConversationResponse,
        { status: 404 }
      );
    }

    // Get the conversation
    const conversation = await db.conversation.getConversation(parseInt(params.id), user.id);

    return NextResponse.json({
      success: true,
      data: conversation,
      metadata: generateResponseMetadata()
    } as ConversationResponse);
  } catch (error) {
    console.error('Failed to fetch conversation:', error);
    
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
        error: 'Failed to fetch conversation',
        metadata: generateResponseMetadata()
      } as ConversationResponse,
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const db = await initDB();
    
    // First get the user
    const user = await db.getUserByUsername(session.username);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
          metadata: generateResponseMetadata()
        } as ConversationResponse,
        { status: 404 }
      );
    }

    // Delete the conversation
    await db.conversation.deleteConversation(parseInt(params.id), user.id);

    return NextResponse.json({
      success: true,
      metadata: generateResponseMetadata()
    } as ConversationResponse);
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    
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
        error: 'Failed to delete conversation',
        metadata: generateResponseMetadata()
      } as ConversationResponse,
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const body = await request.json();
    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid title',
          metadata: generateResponseMetadata()
        } as ConversationResponse,
        { status: 400 }
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
        } as ConversationResponse,
        { status: 404 }
      );
    }

    // Update the conversation
    const conversation = await db.conversation.updateConversation(
      parseInt(params.id),
      user.id,
      { title: body.title }
    );

    return NextResponse.json({
      success: true,
      data: conversation,
      metadata: generateResponseMetadata()
    } as ConversationResponse);
  } catch (error) {
    console.error('Failed to update conversation:', error);
    
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
        error: 'Failed to update conversation',
        metadata: generateResponseMetadata()
      } as ConversationResponse,
      { status: 500 }
    );
  }
} 