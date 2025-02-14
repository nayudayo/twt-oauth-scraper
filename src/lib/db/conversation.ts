import { Pool, PoolClient } from 'pg';
import type {
  Conversation,
  Message,
  ConversationOperations,
  NewChatOptions,
  UpdateConversationOptions,
  AddMessageOptions,
} from '../../types/conversation';
import {
  ConversationRow,
  MessageRow,
  isConversationRow,
  isMessageRow,
  conversationRowToModel,
  messageRowToModel,
  isDBError,
} from '../../types/db';

export class ConversationError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'ConversationError';
  }
}

export class ConversationDB implements ConversationOperations {
  constructor(private db: Pool) {}

  private async withTransaction<T>(
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (isDBError(error)) {
        throw new ConversationError(
          error.message,
          error.code,
          error.code.startsWith('23') ? 400 : 500,
          error
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  // Conversation operations
  async createConversation(userId: string, initialMessage?: string): Promise<Conversation> {
    try {
      const result = await this.db.query<ConversationRow>(
        `INSERT INTO conversations (
          user_id, 
          title,
          metadata
        ) VALUES ($1, $2, $3) 
        RETURNING *`,
        [
          userId,
          initialMessage ? `${initialMessage.slice(0, 50)}...` : 'New Conversation',
          JSON.stringify({ messageCount: 0, lastMessageAt: new Date() })
        ]
      );

      if (!isConversationRow(result.rows[0])) {
        throw new ConversationError(
          'Invalid conversation data returned from database',
          'INVALID_DATA',
          500
        );
      }

      return conversationRowToModel(result.rows[0]);
    } catch (error) {
      if (isDBError(error)) {
        throw new ConversationError(
          'Failed to create conversation',
          error.code,
          error.code.startsWith('23') ? 400 : 500,
          error
        );
      }
      throw error;
    }
  }

  async getConversation(id: number, userId: string): Promise<Conversation> {
    try {
      // First get the conversation
      const conversationResult = await this.db.query<ConversationRow>(
        'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      if (conversationResult.rows.length === 0) {
        throw new ConversationError(
          'Conversation not found or unauthorized',
          'NOT_FOUND',
          404
        );
      }

      if (!isConversationRow(conversationResult.rows[0])) {
        throw new ConversationError(
          'Invalid conversation data returned from database',
          'INVALID_DATA',
          500
        );
      }

      // Then get its messages
      const messagesResult = await this.db.query<MessageRow>(
        'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [id]
      );

      const conversation = conversationRowToModel(conversationResult.rows[0]);
      conversation.messages = messagesResult.rows
        .filter(isMessageRow)
        .map(messageRowToModel);

      return conversation;
    } catch (error) {
      if (error instanceof ConversationError) throw error;
      if (isDBError(error)) {
        throw new ConversationError(
          'Failed to fetch conversation',
          error.code,
          error.code.startsWith('23') ? 400 : 500,
          error
        );
      }
      throw error;
    }
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    try {
      const result = await this.db.query<ConversationRow>(
        'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
        [userId]
      );

      return result.rows
        .filter(isConversationRow)
        .map(conversationRowToModel);
    } catch (error) {
      if (isDBError(error)) {
        throw new ConversationError(
          'Failed to fetch conversations',
          error.code,
          error.code.startsWith('23') ? 400 : 500,
          error
        );
      }
      throw error;
    }
  }

  async updateConversation(
    id: number,
    userId: string,
    options: UpdateConversationOptions
  ): Promise<Conversation> {
    const updates: string[] = [];
    const values: (number | string | Record<string, unknown>)[] = [id, userId];
    let valueIndex = 3;

    if (options.title) {
      updates.push(`title = $${valueIndex}`);
      values.push(options.title);
      valueIndex++;
    }

    if (options.metadata) {
      updates.push(`metadata = jsonb_set(metadata, '{}', $${valueIndex})`);
      values.push(JSON.stringify(options.metadata));
      valueIndex++;
    }

    if (updates.length === 0) {
      throw new ConversationError(
        'No updates provided',
        'INVALID_INPUT',
        400
      );
    }

    try {
      const result = await this.db.query<ConversationRow>(
        `UPDATE conversations 
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new ConversationError(
          'Conversation not found or unauthorized',
          'NOT_FOUND',
          404
        );
      }

      if (!isConversationRow(result.rows[0])) {
        throw new ConversationError(
          'Invalid conversation data returned from database',
          'INVALID_DATA',
          500
        );
      }

      return conversationRowToModel(result.rows[0]);
    } catch (error) {
      if (error instanceof ConversationError) throw error;
      if (isDBError(error)) {
        throw new ConversationError(
          'Failed to update conversation',
          error.code,
          error.code.startsWith('23') ? 400 : 500,
          error
        );
      }
      throw error;
    }
  }

  async deleteConversation(id: number, userId: string): Promise<void> {
    try {
      const result = await this.db.query(
        'DELETE FROM conversations WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      if (result.rowCount === 0) {
        throw new ConversationError(
          'Conversation not found or unauthorized',
          'NOT_FOUND',
          404
        );
      }
    } catch (error) {
      if (error instanceof ConversationError) throw error;
      if (isDBError(error)) {
        throw new ConversationError(
          'Failed to delete conversation',
          error.code,
          error.code.startsWith('23') ? 400 : 500,
          error
        );
      }
      throw error;
    }
  }

  // Message operations
  async addMessage(options: AddMessageOptions): Promise<Message> {
    return this.withTransaction(async (client) => {
      // First verify conversation ownership
      const conversationResult = await client.query(
        'SELECT user_id FROM conversations WHERE id = $1 FOR UPDATE',
        [options.conversationId]
      );

      if (conversationResult.rows.length === 0) {
        throw new ConversationError(
          'Conversation not found',
          'NOT_FOUND',
          404
        );
      }

      // Insert the message
      const messageResult = await client.query<MessageRow>(
        `INSERT INTO messages (
          conversation_id,
          content,
          role,
          metadata
        ) VALUES ($1, $2, $3, $4)
        RETURNING *`,
        [
          options.conversationId,
          options.content,
          options.role,
          JSON.stringify(options.metadata || {})
        ]
      );

      if (!isMessageRow(messageResult.rows[0])) {
        throw new ConversationError(
          'Invalid message data returned from database',
          'INVALID_DATA',
          500
        );
      }

      // Update conversation metadata
      await client.query(
        `UPDATE conversations 
         SET updated_at = CURRENT_TIMESTAMP,
             metadata = jsonb_set(
               jsonb_set(
                 metadata,
                 '{messageCount}',
                 (COALESCE((metadata->>'messageCount')::int, 0) + 1)::text::jsonb
               ),
               '{lastMessageAt}',
               to_jsonb(CURRENT_TIMESTAMP)
             )
         WHERE id = $1`,
        [options.conversationId]
      );

      return messageRowToModel(messageResult.rows[0]);
    });
  }

  async getMessages(conversationId: number, userId: string): Promise<Message[]> {
    try {
      // First verify conversation ownership
      const conversationResult = await this.db.query(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId]
      );

      if (conversationResult.rows.length === 0) {
        throw new ConversationError(
          'Conversation not found or unauthorized',
          'NOT_FOUND',
          404
        );
      }

      // Then get messages
      const messagesResult = await this.db.query<MessageRow>(
        'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId]
      );

      return messagesResult.rows
        .filter(isMessageRow)
        .map(messageRowToModel);
    } catch (error) {
      if (error instanceof ConversationError) throw error;
      if (isDBError(error)) {
        throw new ConversationError(
          'Failed to fetch messages',
          error.code,
          error.code.startsWith('23') ? 400 : 500,
          error
        );
      }
      throw error;
    }
  }

  async updateMessage(id: number, userId: string, content: string): Promise<Message> {
    return this.withTransaction(async (client) => {
      // First verify message ownership through conversation
      const verifyResult = await client.query(
        `SELECT m.id 
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE m.id = $1 AND c.user_id = $2`,
        [id, userId]
      );

      if (verifyResult.rows.length === 0) {
        throw new ConversationError(
          'Message not found or unauthorized',
          'NOT_FOUND',
          404
        );
      }

      // Update the message
      const result = await client.query<MessageRow>(
        `UPDATE messages 
         SET content = $1,
             metadata = jsonb_set(
               COALESCE(metadata, '{}'),
               '{isEdited}',
               'true'
             )
         WHERE id = $2
         RETURNING *`,
        [content, id]
      );

      if (!isMessageRow(result.rows[0])) {
        throw new ConversationError(
          'Invalid message data returned from database',
          'INVALID_DATA',
          500
        );
      }

      return messageRowToModel(result.rows[0]);
    });
  }

  // Active conversation handling
  async startNewChat(options: NewChatOptions): Promise<Conversation> {
    return this.withTransaction(async (client) => {
      // Clear active status from other conversations
      await client.query(
        `UPDATE conversations 
         SET metadata = metadata - 'isActive'
         WHERE user_id = $1 
         AND metadata->>'isActive' = 'true'`,
        [options.userId]
      );

      // Create new conversation
      const result = await client.query<ConversationRow>(
        `INSERT INTO conversations (
          user_id,
          title,
          metadata
        ) VALUES ($1, $2, $3)
        RETURNING *`,
        [
          options.userId,
          options.title || (options.initialMessage ? `${options.initialMessage.slice(0, 50)}...` : 'New Chat'),
          JSON.stringify({
            isActive: true,
            messageCount: 0,
            lastMessageAt: new Date(),
            ...options.metadata
          })
        ]
      );

      if (!isConversationRow(result.rows[0])) {
        throw new ConversationError(
          'Invalid conversation data returned from database',
          'INVALID_DATA',
          500
        );
      }

      return conversationRowToModel(result.rows[0]);
    });
  }

  async setActiveConversation(userId: string, conversationId: number): Promise<void> {
    return this.withTransaction(async (client) => {
      // Verify conversation ownership
      const verifyResult = await client.query(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId]
      );

      if (verifyResult.rows.length === 0) {
        throw new ConversationError(
          'Conversation not found or unauthorized',
          'NOT_FOUND',
          404
        );
      }

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
         WHERE id = $1`,
        [conversationId]
      );
    });
  }

  async getActiveConversation(userId: string): Promise<Conversation | null> {
    try {
      const result = await this.db.query<ConversationRow>(
        `SELECT * FROM conversations 
         WHERE user_id = $1 
         AND metadata->>'isActive' = 'true'
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      if (!isConversationRow(result.rows[0])) {
        throw new ConversationError(
          'Invalid conversation data returned from database',
          'INVALID_DATA',
          500
        );
      }

      return conversationRowToModel(result.rows[0]);
    } catch (error) {
      if (isDBError(error)) {
        throw new ConversationError(
          'Failed to fetch active conversation',
          error.code,
          error.code.startsWith('23') ? 400 : 500,
          error
        );
      }
      throw error;
    }
  }
} 