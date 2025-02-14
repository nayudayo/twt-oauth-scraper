import OpenAI from 'openai'
import { analyzePersonality } from '@/lib/openai'
import { Tweet, TwitterProfile } from '@/types/scraper'
import type { ChatCompletionMessage } from 'openai/resources/chat/completions'
import { RateLimiter } from './rate-limiter'

// Queue Item Types
type QueueItemType = 'chat' | 'analyze'

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
}

export class OpenAIQueueManager {
  private static instance: OpenAIQueueManager
  private queue: QueueItem[] = []
  private processing: boolean = false
  private maxConcurrent: number = 5
  private activeRequests: number = 0
  private openai: OpenAI
  private rateLimiter: RateLimiter

  private constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
    this.rateLimiter = new RateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 50,
      maxConcurrent: 3
    })
  }

  public static getInstance(): OpenAIQueueManager {
    if (!OpenAIQueueManager.instance) {
      OpenAIQueueManager.instance = new OpenAIQueueManager()
    }
    return OpenAIQueueManager.instance
  }

  public async enqueueRequest(
    type: QueueItemType,
    data: ChatRequest | AnalyzeRequest,
    userId: string,
    onComplete: (result: unknown) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    // Check rate limit before enqueueing
    if (!this.rateLimiter.isAllowed(userId)) {
      const timeUntilReset = this.rateLimiter.getTimeUntilReset(userId)
      onError(new Error(`Rate limit exceeded. Please try again in ${Math.ceil(timeUntilReset / 1000)} seconds`))
      return
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
    }

    this.queue.push(item)
    console.log(`Added ${type} request to queue. Queue length: ${this.queue.length}`)

    if (!this.processing) {
      this.processQueue()
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0 || this.activeRequests >= this.maxConcurrent) {
      return
    }

    this.processing = true

    try {
      while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
        const item = this.queue.shift()
        if (!item) continue

        // Add to rate limiter and increment active requests
        this.rateLimiter.addRequest(item.userId)
        this.activeRequests++
        console.log(`Processing ${item.type} request. Active requests: ${this.activeRequests}`)

        this.processItem(item).finally(() => {
          // Remove from rate limiter and decrement active requests
          this.rateLimiter.removeRequest(item.userId)
          this.activeRequests--
          console.log(`Completed ${item.type} request. Active requests: ${this.activeRequests}`)
        })
      }
    } finally {
      this.processing = false
      
      // If there are more items and we're not at max capacity, continue processing
      if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
        this.processQueue()
      }
    }
  }

  private async processItem(item: QueueItem): Promise<void> {
    try {
      let result: unknown

      switch (item.type) {
        case 'chat':
          result = await this.processChatRequest(item.data as ChatRequest)
          break
        case 'analyze':
          result = await this.processAnalyzeRequest(item.data as AnalyzeRequest)
          break
        default:
          throw new Error(`Unknown request type: ${item.type}`)
      }

      item.onComplete(result)
    } catch (error) {
      console.error(`Error processing ${item.type} request:`, error)
      item.onError(error instanceof Error ? error : new Error('Unknown error'))

      // If we should retry, add back to queue
      if (item.attempts < 3) {
        item.attempts++
        item.lastAttempt = new Date()
        this.queue.push(item)
        console.log(`Requeued ${item.type} request. Attempt ${item.attempts}/3`)
      }
    }
  }

  private async processChatRequest(data: ChatRequest): Promise<ChatCompletionMessage> {
    const { messages, tuning } = data
    
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: tuning?.temperature ?? 0.7,
      max_tokens: tuning?.maxTokens ?? 150,
      presence_penalty: tuning?.presencePenalty ?? 0.6,
      frequency_penalty: tuning?.frequencyPenalty ?? 0.3
    })

    return response.choices[0].message
  }

  private async processAnalyzeRequest(data: AnalyzeRequest): Promise<unknown> {
    const { tweets, profile, prompt, context } = data
    // Convert profile to expected format
    const convertedProfile = convertProfile(profile)
    return await analyzePersonality(tweets, convertedProfile, prompt, context)
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