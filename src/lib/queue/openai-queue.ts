import OpenAI from 'openai'
import { analyzePersonality } from '@/lib/openai/openai'
import { retryWithExponentialBackoff } from '@/lib/openai/utils/retry'
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
  userId: string
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

  private constructor() {
    console.log('[OpenAI Queue] Initializing OpenAI client with config:', {
      baseURL: process.env.OPENAI_BASE_URL,
      maxRetries: 3,
      timeout: this.networkTimeoutMs
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 3,
      timeout: this.networkTimeoutMs,
      baseURL: process.env.OPENAI_BASE_URL,
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

  private loadQueueState() {
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const savedState = sessionStorage.getItem('openai_queue_state');
        if (savedState) {
          const state = JSON.parse(savedState);
          // Only restore if state is less than 5 minutes old
          const stateAge = Date.now() - state.timestamp;
          if (stateAge < 5 * 60 * 1000) {
            this.queue = state.queue;
            this.activeRequests = state.activeRequests;
            return;
          }
        }
      }
      // If no valid state or not in browser, initialize fresh
      this.queue = [];
      this.activeRequests = 0;
    } catch (error) {
      console.warn('Failed to load queue state:', error);
      // Initialize fresh state on error
      this.queue = [];
      this.activeRequests = 0;
    }
  }

  private saveQueueState() {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const state = {
          queue: this.queue,
          activeRequests: this.activeRequests,
          timestamp: Date.now()
        };
        sessionStorage.setItem('openai_queue_state', JSON.stringify(state));
      }
    } catch (error) {
      console.warn('Failed to save queue state:', error);
    }
  }

  private async checkSessionValidity() {
    try {
      const response = await fetch('/api/auth/session');
      if (!response.ok) {
        throw new Error('Failed to validate session');
      }
      const session = await response.json();
      
      // Check if session exists and is not expired
      if (!session || !session.user || !session.expires) {
        throw new Error('Invalid session');
      }

      // Check if session is expired or about to expire (within 5 minutes)
      const expiresAt = new Date(session.expires).getTime();
      const now = Date.now();
      if (expiresAt - now < 5 * 60 * 1000) {
        throw new Error('Session expired or about to expire');
      }

      return true;
    } catch (error) {
      console.error('Session validation failed:', error);
      // Notify the user about session expiry
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('session-expired', {
          detail: {
            message: 'Your session has expired. Please reconnect your Twitter account.',
            error: error instanceof Error ? error.message : 'Session validation failed'
          }
        }));
      }
      return false;
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
      onError(error instanceof Error ? error : new Error(String(error)));
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
        if (item.type === 'chat') {
          result = await retryWithExponentialBackoff(() => 
            this.processChatRequest(item.data as ChatRequest, controller.signal)
          );
        } else if (item.type === 'analyze') {
          const analyzeData = item.data as AnalyzeRequest;
          
          // Use retryWithExponentialBackoff for analyze requests too
          result = await retryWithExponentialBackoff(async () => {
            const analysisResult = await analyzePersonality(
              analyzeData.tweets,
              convertProfile(analyzeData.profile),
              analyzeData.prompt,
              analyzeData.context,
              undefined, // systemPrompt
              item.attempts,
              0.7, // temperature
              0.6, // presencePenalty
              0.5, // frequencyPenalty
              1000, // maxTokens
              0.9, // topP
              1, // bestOf
              analyzeData.currentTuning, // Pass the entire PersonalityTuning object
              undefined, // customInstructions
              controller.signal,
              analyzeData.userId // Pass the userId here
            );

            // Validate the result has required fields
            if (!analysisResult || typeof analysisResult !== 'object') {
              throw new Error('Invalid analysis result format');
            }

            const requiredFields = [
              'traits',
              'interests',
              'communicationStyle',
              'vocabulary',
              'vocabularyMetrics',
              'messageArchitecture',
              'emotionalTone',
              'topicsAndThemes',
              'thoughtProcess',
              'socialBehaviorMetrics'
            ];

            const missingFields = requiredFields.filter(field => 
              !analysisResult[field as keyof typeof analysisResult]
            );

            if (missingFields.length > 0) {
              console.error('Missing fields in analysis result:', missingFields);
              console.error('Analysis result:', analysisResult);
              throw new Error(`Missing required fields in analysis result: ${missingFields.join(', ')}`);
            }

            return analysisResult;
          });
        } else {
          throw new Error(`Unknown request type: ${item.type}`);
        }

        item.onComplete(result);
      } finally {
        this.removeCleanupHandler(() => controller.abort('Operation cancelled'));
      }
    } catch (error) {
      console.error(`Error processing ${item.type} request:`, error);
      
      // Enhanced error logging
      if (error instanceof Error) {
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
          cause: error.cause
        });
      }
      
      item.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async processChatRequest(data: ChatRequest, signal?: AbortSignal): Promise<ChatCompletionMessage> {
    const { messages, tuning } = data;
    
    console.log('[OpenAI Queue] Making chat request with config:', {
      model: "gpt-4o-mini",
      temperature: tuning?.temperature ?? 0.7,
      max_tokens: tuning?.maxTokens ?? 500,
      messageCount: messages.length
    });

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: tuning?.temperature ?? 0.7,
      max_tokens: tuning?.maxTokens ?? 500,
      presence_penalty: tuning?.presencePenalty ?? 0.6,
      frequency_penalty: tuning?.frequencyPenalty ?? 0.5,
      top_p: 0.9
    }, { signal });

    console.log('[OpenAI Queue] Received chat response:', {
      status: 'success',
      responseLength: response.choices[0].message.content?.length || 0,
      finishReason: response.choices[0].finish_reason
    });

    return response.choices[0].message;
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