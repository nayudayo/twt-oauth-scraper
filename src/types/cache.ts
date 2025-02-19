/**
 * Represents a cached personality analysis
 */
export interface PersonalityCache {
  /** Unique identifier for the cache entry */
  id: number;
  
  /** User ID this cache belongs to */
  userId: string;
  
  /** The cached personality analysis data */
  analysisData: Record<string, unknown>;
  
  /** When the cache was created */
  createdAt: Date;
  
  /** When the cache was last updated */
  updatedAt: Date;
  
  /** Cache version number */
  version: number;
  
  /** Whether the cache is stale and needs refresh */
  isStale: boolean;
}

/**
 * Error thrown when there are issues with personality cache operations
 */
export class PersonalityCacheError extends Error {
  constructor(
    message: string,
    public code: 'STALE_CACHE' | 'INVALID_DATA' | 'VERSION_MISMATCH',
    public status: number = 400
  ) {
    super(message);
    this.name = 'PersonalityCacheError';
  }
} 