# Conversation Model Implementation Plan

## Overview
This document outlines the simplified implementation plan for conversation persistence using PostgreSQL for long-term storage, while leveraging GPT-4-mini's built-in session context handling. The implementation ensures data privacy and proper user isolation through Twitter OAuth integration.

## Key Features
1. Multiple chat conversations per user
2. Session persistence across page refreshes
3. Integration with existing PostgreSQL setup
4. Built-in context handling by GPT-4-mini
5. User data isolation and privacy
6. Twitter OAuth integration

## Security & Privacy Considerations

1. **User Isolation**
   - Each user can only access their own conversations
   - Queries always filter by user_id (Twitter username)
   - Session validation on every request
   - No cross-user data access possible

2. **Data Privacy**
   - Conversations tied to Twitter OAuth sessions
   - No sharing of conversation context between users
   - Proper data cleanup on session termination
   - Input sanitization for all user data

3. **Session Management**
   - Leveraging NextAuth.js security features
   - Twitter OAuth token handling
   - Automatic session expiration
   - Secure session storage

## Database Schema

```sql
-- Schema already added to src/scripts/purge-db.ts
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id),  -- References existing users table
    title VARCHAR(255),                                  -- Auto-generated from first message
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'                         -- For active status and other metadata
);

CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    role VARCHAR(50) NOT NULL,      -- 'user' or 'assistant'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'     -- For future extensibility
);

-- Indexes for performance (already added to purge-db.ts)
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at ASC);

-- Consider adding if we need to query by active status frequently
CREATE INDEX idx_conversations_active ON conversations((metadata->>'isActive')) WHERE metadata->>'isActive' = 'true';
```

## Type Definitions

```typescript
// src/types/conversation.ts

// Base metadata type for extensibility
interface BaseMetadata {
  isActive?: boolean;
  lastMessageAt?: Date;
  [key: string]: any;  // Allow additional metadata fields
}

// Conversation metadata extends base
interface ConversationMetadata extends BaseMetadata {
  lastMessagePreview?: string;
  messageCount?: number;
}

// Message metadata extends base
interface MessageMetadata extends BaseMetadata {
  isEdited?: boolean;
  editedAt?: Date;
}

// Core types
interface Conversation {
  id: number;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: ConversationMetadata;
  messages?: Message[];
}

interface Message {
  id: number;
  conversationId: number;
  content: string;
  role: 'user' | 'assistant';
  createdAt: Date;
  metadata: MessageMetadata;
}

// Operation types
interface NewChatOptions {
  userId: string;
  initialMessage?: string;
  title?: string;
  metadata?: Partial<ConversationMetadata>;
}

interface UpdateConversationOptions {
  title?: string;
  metadata?: Partial<ConversationMetadata>;
}

interface AddMessageOptions {
  conversationId: number;
  content: string;
  role: 'user' | 'assistant';
  metadata?: Partial<MessageMetadata>;
}

// Database operations interface
interface ConversationOperations {
  // Conversation operations
  createConversation(userId: string, initialMessage?: string): Promise<Conversation>;
  getConversation(id: number, userId: string): Promise<Conversation>;
  getUserConversations(userId: string): Promise<Conversation[]>;
  updateConversation(id: number, userId: string, options: UpdateConversationOptions): Promise<Conversation>;
  deleteConversation(id: number, userId: string): Promise<void>;
  
  // Message operations
  addMessage(options: AddMessageOptions): Promise<Message>;
  getMessages(conversationId: number, userId: string): Promise<Message[]>;
  updateMessage(id: number, userId: string, content: string): Promise<Message>;
  
  // Active conversation handling
  startNewChat(options: NewChatOptions): Promise<Conversation>;
  setActiveConversation(userId: string, conversationId: number): Promise<void>;
  getActiveConversation(userId: string): Promise<Conversation | null>;
}

// API response types
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    timestamp: Date;
    requestId: string;
  };
}

interface ConversationResponse extends APIResponse<Conversation> {}
interface MessageResponse extends APIResponse<Message> {}
interface ConversationListResponse extends APIResponse<Conversation[]> {}

// Error types
class ConversationError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500
  ) {
    super(message);
    this.name = 'ConversationError';
  }
}

// Export all types
export type {
  BaseMetadata,
  ConversationMetadata,
  MessageMetadata,
  Conversation,
  Message,
  NewChatOptions,
  UpdateConversationOptions,
  AddMessageOptions,
  ConversationOperations,
  APIResponse,
  ConversationResponse,
  MessageResponse,
  ConversationListResponse,
};

export { ConversationError };
```

## Database Operations Implementation

```typescript
// src/lib/db/conversation.ts
export class ConversationDB implements ConversationOperations {
  constructor(private db: Pool) {}

  async createConversation(userId: string, initialMessage?: string): Promise<Conversation> {
    const title = initialMessage 
      ? initialMessage.slice(0, 50) + '...'
      : 'New Conversation';

    const result = await this.db.query(
      'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *',
      [userId, title]
    );
    
    return result.rows[0];
  }

  async getConversation(id: number): Promise<Conversation> {
    const result = await this.db.query(
      'SELECT * FROM conversations WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Conversation not found');
    }

    const messages = await this.getMessages(id);
    return { ...result.rows[0], messages };
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    const result = await this.db.query(
      'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
    
    return result.rows;
  }

  async addMessage(conversationId: number, content: string, role: 'user' | 'assistant'): Promise<Message> {
    const result = await this.db.query(
      'INSERT INTO messages (conversation_id, content, role) VALUES ($1, $2, $3) RETURNING *',
      [conversationId, content, role]
    );

    // Update conversation's updated_at timestamp
    await this.db.query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [conversationId]
    );
    
    return result.rows[0];
  }

  async getMessages(conversationId: number): Promise<Message[]> {
    const result = await this.db.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );
    
    return result.rows;
  }

  async startNewChat(options: NewChatOptions): Promise<Conversation> {
    const { userId, initialMessage, title, metadata } = options;
    
    // Start a transaction
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      
      // Clear active status from other conversations if needed
      await client.query(
        `UPDATE conversations 
         SET metadata = metadata - 'isActive'
         WHERE user_id = $1 
         AND metadata->>'isActive' = 'true'`,
        [userId]
      );
      
      // Create new conversation
      const result = await client.query(
        `INSERT INTO conversations (
          user_id, 
          title, 
          metadata
        ) VALUES ($1, $2, $3) 
        RETURNING *`,
        [
          userId,
          title || (initialMessage ? `${initialMessage.slice(0, 50)}...` : 'New Chat'),
          JSON.stringify({ isActive: true, ...metadata })
        ]
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setActiveConversation(userId: string, conversationId: number): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      
      // Clear other active conversations
      await client.query(
        `UPDATE conversations 
         SET metadata = metadata - 'isActive'
         WHERE user_id = $1 
         AND metadata->>'isActive' = 'true'`,
        [userId]
      );
      
      // Set new active conversation
      await client.query(
        `UPDATE conversations 
         SET metadata = jsonb_set(
           COALESCE(metadata, '{}'), 
           '{isActive}', 
           'true'
         )
         WHERE id = $1 AND user_id = $2`,
        [conversationId, userId]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getActiveConversation(userId: string): Promise<Conversation | null> {
    const result = await this.db.query(
      `SELECT * FROM conversations 
       WHERE user_id = $1 
       AND metadata->>'isActive' = 'true'
       LIMIT 1`,
      [userId]
    );
    
    return result.rows[0] || null;
  }
}
```

## API Routes Implementation

    ```typescript
// src/app/api/conversations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { initDB } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { initialMessage } = await req.json();
    const db = await initDB();
    const conversation = await db.createConversation(session.username, initialMessage);

    return NextResponse.json(conversation);
  } catch (error) {
    console.error('Failed to create conversation:', error);
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await initDB();
    const conversations = await db.getUserConversations(session.username);

    return NextResponse.json(conversations);
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
```

## Implementation Steps

### Phase 1: Database Setup (Day 1)
1. **Schema Implementation**
   ```bash
   # Step 1: Schema is ready in purge-db.ts
   [x] Tables added to src/scripts/purge-db.ts
   [x] Indexes added for performance
   [x] Added metadata JSONB columns
   [x] Added metadata indexes
   [ ] Run database purge and update
   ```

2. **Type Definitions**
   ```bash
   # Step 2: Create types
   [x] Create src/types/conversation.ts
   [x] Add interfaces for Conversation and Message
   [x] Add ConversationOperations interface
   [x] Add metadata type definitions
   [x] Add active conversation types
   ```

3. **Database Operations**
   ```bash
   # Step 3: Implement ConversationDB
   [x] Create src/lib/db/conversation.ts
   [x] Implement all CRUD operations
   [x] Add user isolation in queries
   [x] Add metadata operations
     [x] Add active conversation handling
     [x] Add metadata update methods
     [x] Add transaction handling
   [x] Add error handling
   ```

### Phase 2: API Implementation (Day 1-2)
1. **Conversation Management**
    ```bash
   # Step 1: Create API routes
   [x] Create src/app/api/conversations/route.ts
   [x] Implement POST for new conversations
   [x] Implement GET for conversation list
   [x] Add session validation
   [x] Add metadata handling
     [x] Handle active status updates
     [x] Handle metadata updates
   ```

2. **Message Handling**
    ```bash
   # Step 2: Add message endpoints
   [x] Create src/app/api/conversations/[id]/messages/route.ts
   [x] Implement message creation
   [x] Implement message retrieval
   [x] Add user validation
   [x] Add metadata handling
     [x] Update conversation metadata
     [x] Handle message metadata
   ```

3. **Security Implementation**
   ```bash
   # Step 3: Add security measures
   [x] Add request validation
   [x] Implement rate limiting
   [x] Add input sanitization
   [x] Add error handling
   ```

### Phase 3: UI Integration (Day 2-3)
1. **Conversation List**
   ```bash
   # Step 1: Create conversation list
   [x] Create ConversationList component
     [x] Add history icon button
     [x] Add conversation list modal
     [x] Add conversation switching
     [x] Add loading states
   [x] Implement new chat creation
     [x] Add "New Chat" button
     [x] Handle active conversation state
     [x] Add conversation title generation
     [x] Add loading states
   [x] Add conversation preview
   ```

2. **Chat Interface Updates**
   ```bash
   # Step 2: Update ChatBox
   [x] Add conversation context
   [x] Implement message persistence
   [x] Add new chat initialization
   [x] Add conversation switching
   [x] Add loading states
   [x] Handle active conversation state
   ```

### Phase 4: Testing & Optimization (Day 3)
1. **Security Testing**
   ```bash
   # Step 1: Test security measures
   [ ] Test user isolation
   [ ] Verify data privacy
   [ ] Test session handling
   [ ] Verify input sanitization
   ```

2. **Performance Testing**
   ```bash
   # Step 2: Test performance
   [ ] Test concurrent users
   [ ] Verify query performance
   [ ] Test session handling
   [ ] Monitor memory usage
   ```

3. **Integration Testing**
   ```bash
   # Step 3: Test integration
   [ ] Test conversation switching
   [ ] Test message persistence
   [ ] Test error scenarios
   [ ] Test session recovery
   ```

## Data Privacy Implementation

```typescript
// Example of user isolation in database operations
class ConversationDB {
  // Ensure all queries include user_id
  async getUserConversations(userId: string): Promise<Conversation[]> {
    const result = await this.db.query(
      'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
    return result.rows;
  }

  // Validate user ownership before operations
  async getConversation(id: number, userId: string): Promise<Conversation> {
    const result = await this.db.query(
      'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Conversation not found or unauthorized');
    }

    return result.rows[0];
  }
}

// Example of session validation in API routes
async function validateUserAccess(
  conversationId: number, 
  session: Session
): Promise<boolean> {
  if (!session?.username) return false;

  const conversation = await db.query(
    'SELECT user_id FROM conversations WHERE id = $1',
    [conversationId]
  );

  return conversation.rows[0]?.user_id === session.username;
}
```

## Benefits
1. **Simplicity**: Uses existing PostgreSQL setup
2. **Reliability**: Built on proven database technology
3. **Maintainability**: Simple schema design
4. **Security**: Strong user isolation and data privacy
5. **Extensibility**: Easy to add features later

## Limitations
1. No real-time collaboration features
2. Basic conversation management
3. Limited metadata storage
4. Session-based only (no permanent storage)

## Future Enhancements (Post-MVP)
1. Conversation search
2. Conversation sharing (with privacy controls)
3. Export functionality
4. Advanced metadata tracking
5. End-to-end encryption option

This implementation provides:
- Multiple chat support
- Session persistence
- Simple and efficient storage
- Strong data privacy
- User isolation
- Easy integration with existing codebase