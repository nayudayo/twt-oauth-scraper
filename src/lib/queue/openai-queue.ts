import OpenAI from 'openai'
import { analyzePersonality } from '@/lib/openai'
import { Tweet, TwitterProfile, PersonalityTuning } from '@/types/scraper'
import type { ChatCompletionMessage } from 'openai/resources/chat/completions'
import { RateLimiter } from './rate-limiter'

// Queue Item Types
type QueueItemType = 'chat' | 'analyze'

// Custom error types
export class NetworkError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class QueueTerminationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueTerminationError';
  }
}

export class RetryableError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'RetryableError';
  }
}

// Define OpenAITwitterProfile type
interface OpenAITwitterProfile extends Omit<TwitterProfile, 'followersCount' | 'followingCount'> {
  followersCount: string | null;
  followingCount: string | null;
}

// Convert TwitterProfile to OpenAITwitterProfile format
function convertProfile(profile: TwitterProfile): OpenAITwitterProfile {
  return {
    ...profile,
    followersCount: profile.followersCount?.toString() ?? null,
    followingCount: profile.followingCount?.toString() ?? null
  }
}

interface QueueItem {
  id: string
  type: QueueItemType
  data: ChatRequest | AnalyzeRequest
  userId: string
  attempts: number
  lastAttempt?: Date
  createdAt: Date
  onComplete: (result: unknown) => void
  onError: (error: Error) => void
}

interface ChatRequest {
  messages: ChatCompletionMessage[]
  tuning?: {
    temperature?: number
    maxTokens?: number
    presencePenalty?: number
    frequencyPenalty?: number
  }
  consciousness?: {
    state?: string
    effects?: string[]
  }
}

interface AnalyzeRequest {
  tweets: Tweet[]
  profile: TwitterProfile
  prompt?: string
  context?: string
  currentTuning?: PersonalityTuning
}

export class OpenAIQueueManager {
  private static instance: OpenAIQueueManager
  private queue: QueueItem[] = []
  private processing: boolean = false
  private maxConcurrent: number = 5
  private activeRequests: number = 0
  private openai: OpenAI
  private rateLimiter: RateLimiter
  private abortController: AbortController | null = null
  private cleanupHandlers: Set<() => void> = new Set()
  private networkTimeoutMs: number = 30000 // 30 second timeout
  private maxRetries: number = 3
  private retryDelayMs: number = 1000 // Base delay of 1 second

  private constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
    this.rateLimiter = new RateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 50,
      maxConcurrent: 3
    })

    // Setup cleanup handlers
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handlePageUnload.bind(this))
      window.addEventListener('unload', this.handlePageUnload.bind(this))
      window.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this))
    }
  }

  private handlePageUnload() {
    this.cleanup('Page is being unloaded');
  }

  private handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      // Save queue state for potential recovery
      this.saveQueueState();
    }
  }

  private saveQueueState() {
    try {
      const state = {
        queue: this.queue,
        activeRequests: this.activeRequests,
        timestamp: Date.now()
      };
      sessionStorage.setItem('openai_queue_state', JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save queue state:', error);
    }
  }

  private loadQueueState() {
    try {
      const savedState = sessionStorage.getItem('openai_queue_state');
      if (savedState) {
        const state = JSON.parse(savedState);
        // Only restore if state is less than 5 minutes old
        if (Date.now() - state.timestamp < 5 * 60 * 1000) {
          this.queue = state.queue;
          console.log('Restored queue state with', this.queue.length, 'items');
        }
        sessionStorage.removeItem('openai_queue_state');
      }
    } catch (error) {
      console.error('Failed to load queue state:', error);
    }
  }

  private cleanup(reason: string) {
    // Cancel ongoing requests
    if (this.abortController) {
      this.abortController.abort(reason);
    }

    // Execute all cleanup handlers
    for (const handler of this.cleanupHandlers) {
      try {
        handler();
      } catch (error) {
        console.error('Cleanup handler failed:', error);
      }
    }

    // Save current state
    this.saveQueueState();

    // Reset instance state
    this.processing = false;
    this.activeRequests = 0;
    this.cleanupHandlers.clear();
  }

  public addCleanupHandler(handler: () => void): void {
    this.cleanupHandlers.add(handler);
  }

  public removeCleanupHandler(handler: () => void): void {
    this.cleanupHandlers.delete(handler);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.networkTimeoutMs): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new NetworkError('Request timed out')), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private async withRetry<T>(operation: () => Promise<T>, retryCount: number = 0): Promise<T> {
    try {
      return await this.withTimeout(operation());
    } catch (error) {
      const isRetryable = this.isRetryableError(error);
      
      if (isRetryable && retryCount < this.maxRetries) {
        const delay = this.calculateRetryDelay(retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(operation, retryCount + 1);
      }
      
      throw this.normalizeError(error);
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof NetworkError) return true;
    if (error instanceof Error) {
      // Check for common network error patterns
      const errorMessage = error.message.toLowerCase();
      return (
        errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('econnreset') ||
        errorMessage.includes('socket hang up') ||
        errorMessage.includes('429') // Rate limit
      );
    }
    return false;
  }

  private calculateRetryDelay(retryCount: number): number {
    // Exponential backoff with jitter
    const baseDelay = this.retryDelayMs;
    const maxDelay = 30000; // 30 seconds
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    const jitter = Math.random() * 1000; // Add up to 1 second of random jitter
    return exponentialDelay + jitter;
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      if (this.isRetryableError(error)) {
        return new RetryableError(error.message, error);
      }
      return error;
    }
    return new Error(String(error));
  }

  public static getInstance(): OpenAIQueueManager {
    if (!OpenAIQueueManager.instance) {
      OpenAIQueueManager.instance = new OpenAIQueueManager();
      // Load saved state when creating instance
      OpenAIQueueManager.instance.loadQueueState();
    }
    return OpenAIQueueManager.instance;
  }

  public async enqueueRequest(
    type: QueueItemType,
    data: ChatRequest | AnalyzeRequest,
    userId: string,
    onComplete: (result: unknown) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      // Check rate limit before enqueueing
      if (!this.rateLimiter.isAllowed(userId)) {
        const timeUntilReset = this.rateLimiter.getTimeUntilReset(userId);
        throw new Error(`Rate limit exceeded. Please try again in ${Math.ceil(timeUntilReset / 1000)} seconds`);
      }

      const item: QueueItem = {
        id: `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        type,
        data,
        userId,
        attempts: 0,
        createdAt: new Date(),
        onComplete,
        onError
      };

      this.queue.push(item);
      console.log(`Added ${type} request to queue. Queue length: ${this.queue.length}`);

      if (!this.processing) {
        this.processQueue();
      }
    } catch (error) {
      onError(this.normalizeError(error));
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0 || this.activeRequests >= this.maxConcurrent) {
      return;
    }

    this.processing = true;
    this.abortController = new AbortController();

    try {
      while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
        const item = this.queue.shift();
        if (!item) continue;

        // Add to rate limiter and increment active requests
        this.rateLimiter.addRequest(item.userId);
        this.activeRequests++;
        console.log(`Processing ${item.type} request. Active requests: ${this.activeRequests}`);

        this.processItem(item).finally(() => {
          // Remove from rate limiter and decrement active requests
          this.rateLimiter.removeRequest(item.userId);
          this.activeRequests--;
          console.log(`Completed ${item.type} request. Active requests: ${this.activeRequests}`);
        });
      }
    } catch (error) {
      console.error('Error in queue processing:', error);
    } finally {
      this.processing = false;
      this.abortController = null;
      
      // If there are more items and we're not at max capacity, continue processing
      if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
        this.processQueue();
      }
    }
  }

  private async processItem(item: QueueItem): Promise<void> {
    try {
      let result: unknown;

      // Create a signal for this specific request
      const controller = new AbortController();
      this.addCleanupHandler(() => controller.abort('Operation cancelled'));

      try {
        switch (item.type) {
          case 'chat':
            result = await this.withRetry(() => 
              this.processChatRequest(item.data as ChatRequest, controller.signal)
            );
            break;
          case 'analyze':
            result = await this.withRetry(() => 
              this.processAnalyzeRequest(item.data as AnalyzeRequest, controller.signal)
            );
            break;
          default:
            throw new Error(`Unknown request type: ${item.type}`);
        }

        item.onComplete(result);
      } finally {
        this.removeCleanupHandler(() => controller.abort('Operation cancelled'));
      }
    } catch (error) {
      console.error(`Error processing ${item.type} request:`, error);
      const normalizedError = this.normalizeError(error);
      
      // Check if we should retry
      if (this.isRetryableError(normalizedError) && item.attempts < this.maxRetries) {
        item.attempts++;
        item.lastAttempt = new Date();
        const delay = this.calculateRetryDelay(item.attempts - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        this.queue.push(item);
        console.log(`Requeued ${item.type} request. Attempt ${item.attempts}/${this.maxRetries}`);
      } else {
        item.onError(normalizedError);
      }
    }
  }

  private async processChatRequest(data: ChatRequest, signal?: AbortSignal): Promise<ChatCompletionMessage> {
    const { messages, tuning } = data;
    
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: tuning?.temperature ?? 0.7,
      max_completion_tokens: tuning?.maxTokens ?? 500,
      presence_penalty: tuning?.presencePenalty ?? 0.6,
      frequency_penalty: tuning?.frequencyPenalty ?? 0.5,
      top_p: 0.9
    }, { signal });

    return response.choices[0].message;
  }

  private async processAnalyzeRequest(data: AnalyzeRequest, signal?: AbortSignal): Promise<unknown> {
    const { tweets, profile, prompt, context, currentTuning } = data;
    // Convert profile to expected format
    const convertedProfile = convertProfile(profile);
    return await analyzePersonality(tweets, convertedProfile, prompt, context, undefined, 0, 0, 0, 0, 0, 0, 0, currentTuning, undefined, signal);
  }

  // Utility methods
  public getQueueLength(): number {
    return this.queue.length
  }

  public getActiveRequests(): number {
    return this.activeRequests
  }

  public clearQueue(): void {
    this.queue = []
  }

  public getRemainingRequests(userId: string): number {
    return this.rateLimiter.getRemainingRequests(userId)
  }

  public getTimeUntilReset(userId: string): number {
    return this.rateLimiter.getTimeUntilReset(userId)
  }
} 