// ChromaDB client interfaces
export interface IChromaClient {
  createCollection(name: string, metadata?: Record<string, unknown>): Promise<IChromaCollection>;
  getCollection(name: string): Promise<IChromaCollection>;
  deleteCollection(name: string): Promise<void>;
  listCollections(): Promise<string[]>;
}

export interface IChromaCollection {
  name: string;
  metadata: Record<string, unknown>;
  add(documents: string[], metadatas?: Record<string, unknown>[], ids?: string[]): Promise<void>;
  query(queryTexts: string[], nResults?: number, where?: Record<string, unknown>): Promise<{
    ids: string[][];
    distances: number[][];
    metadatas: Record<string, unknown>[][];
    documents: string[][];
  }>;
}

// Chroma configuration
export interface ChromaConfig {
  // Connection
  host: string
  port: number
  
  // Collection settings
  collectionPrefix: string
  maxResults: number
  
  // Embedding settings
  embeddingModel: string
  embeddingDimension: number
  
  // Performance settings
  batchSize: number
  maxRetries: number
  timeout: number
}

// Chroma message structure
export interface ChromaMessage {
  id: string
  userId: string
  content: string
  embedding: number[]
  metadata: {
    timestamp: string
    type: string
    conversationId: string
    topics: string  // JSON stringified array
    sentiment: number
    activityLevel: string
  }
}

// Chroma collection options
export interface ChromaCollectionOptions {
  name: string
  metadata?: {
    userId: string
    created: string
    lastActive: string
    messageCount: number
  }
}

// Query options
export interface ChromaQueryOptions {
  nResults?: number
  where?: Record<string, unknown>
  whereDocument?: Record<string, unknown>
  include?: Array<'embeddings' | 'metadatas' | 'documents'>
}

// Operation result
export interface ChromaOperationResult<T> {
  success: boolean
  data?: T
  error?: Error
  timestamp: number
}

// Collection management
export interface ChromaCollectionManager {
  getCollection(name: string): Promise<IChromaCollection>
  createCollection(options: ChromaCollectionOptions): Promise<IChromaCollection>
  deleteCollection(name: string): Promise<boolean>
  listCollections(): Promise<string[]>
}

// Chroma client type
export type ChromaDBClient = IChromaClient

// Default configuration
export const DEFAULT_CHROMA_CONFIG: ChromaConfig = {
  host: 'localhost',
  port: 8000,
  collectionPrefix: 'user_',
  maxResults: 5,
  embeddingModel: 'all-MiniLM-L6-v2',
  embeddingDimension: 384,
  batchSize: 100,
  maxRetries: 3,
  timeout: 30000
}

// Key patterns for collection names
export const CHROMA_KEYS = {
  userCollection: (userId: string) => `${DEFAULT_CHROMA_CONFIG.collectionPrefix}${userId}`,
  conversationCollection: (userId: string, conversationId: string) => 
    `${DEFAULT_CHROMA_CONFIG.collectionPrefix}${userId}_${conversationId}`
} as const
