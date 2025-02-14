import type { Conversation, Message, ConversationMetadata, MessageMetadata } from './conversation';

// Database row types (raw data from PostgreSQL)
export interface ConversationRow {
  id: number;
  user_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  metadata: ConversationMetadata;
}

export interface MessageRow {
  id: number;
  conversation_id: number;
  content: string;
  role: 'user' | 'assistant';
  created_at: Date;
  metadata: MessageMetadata;
}

// Type guards and conversion utilities
export function isConversationRow(row: unknown): row is ConversationRow {
  return (
    typeof row === 'object' &&
    row !== null &&
    'id' in row &&
    'user_id' in row &&
    'title' in row &&
    'created_at' in row &&
    'updated_at' in row &&
    'metadata' in row
  );
}

export function isMessageRow(row: unknown): row is MessageRow {
  return (
    typeof row === 'object' &&
    row !== null &&
    'id' in row &&
    'conversation_id' in row &&
    'content' in row &&
    'role' in row &&
    'created_at' in row &&
    'metadata' in row
  );
}

// Conversion functions
export function conversationRowToModel(row: ConversationRow): Conversation {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata
  };
}

export function messageRowToModel(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    content: row.content,
    role: row.role,
    createdAt: row.created_at,
    metadata: row.metadata
  };
}

// Query result types
export interface ConversationWithMessages extends ConversationRow {
  messages: MessageRow[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Database error types
export interface DBError {
  code: string;
  message: string;
  detail?: string;
  table?: string;
  constraint?: string;
}

export function isDBError(error: unknown): error is DBError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
} 