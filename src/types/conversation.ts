// Base metadata type for extensibility
interface BaseMetadata {
  isActive?: boolean;
  lastMessageAt?: Date;
  [key: string]: boolean | Date | string | number | null | undefined;  // More specific than any
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

interface ConversationResponse extends APIResponse<Conversation> {
  metadata: {
    timestamp: Date;
    requestId: string;
    totalConversations?: number;
  };
}

interface MessageResponse extends APIResponse<Message> {
  metadata: {
    timestamp: Date;
    requestId: string;
    conversationId: number;
  };
}

interface MessageListResponse extends APIResponse<Message[]> {
  metadata: {
    timestamp: Date;
    requestId: string;
    conversationId: number;
  };
}

interface ConversationListResponse extends APIResponse<Conversation[]> {
  metadata: {
    timestamp: Date;
    requestId: string;
    totalCount: number;
    page?: number;
    pageSize?: number;
  };
}

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
  MessageListResponse,
  ConversationListResponse,
};

export { ConversationError }; 