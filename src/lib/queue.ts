import { initDB } from './db'

interface Tweet {
  id: string;
  text: string;
  timestamp: string;
  url?: string;
  isReply?: boolean;
  metadata?: Record<string, unknown>;
}

interface QueueItem {
  id: string;
  username: string;
  sessionId: string;
  tweets: Tweet[];
  attempts: number;
  lastAttempt: number;
}

class DatabaseQueue {
  private queue: QueueItem[] = [];
  private processing: boolean = false;
  private maxConcurrent: number = 3;
  private activeProcesses: number = 0;
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // Base delay in ms

  private static instance: DatabaseQueue;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): DatabaseQueue {
    if (!DatabaseQueue.instance) {
      DatabaseQueue.instance = new DatabaseQueue();
    }
    return DatabaseQueue.instance;
  }

  public async addToQueue(username: string, sessionId: string, tweets: Tweet[]): Promise<void> {
    const item: QueueItem = {
      id: `${sessionId}_${Date.now()}`,
      username,
      sessionId,
      tweets,
      attempts: 0,
      lastAttempt: 0
    };

    this.queue.push(item);
    console.log(`Added to queue: ${item.id}, Queue size: ${this.queue.length}`);
    
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0 || this.activeProcesses >= this.maxConcurrent) {
      return;
    }

    this.processing = true;
    
    try {
      while (this.queue.length > 0 && this.activeProcesses < this.maxConcurrent) {
        const item = this.queue[0];
        
        // Skip if too soon for retry
        if (item.attempts > 0 && Date.now() - item.lastAttempt < this.getRetryDelay(item.attempts)) {
          break;
        }

        this.activeProcesses++;
        this.queue.shift(); // Remove from queue

        this.processItem(item).finally(() => {
          this.activeProcesses--;
          this.processQueue(); // Continue processing queue
        });
      }
    } finally {
      this.processing = false;
    }
  }

  private async processItem(item: QueueItem): Promise<void> {
    try {
      console.log(`Processing item ${item.id}, attempt ${item.attempts + 1}`);
      
      const db = await initDB();
      
      // Get user ID first
      const user = await db.get('SELECT id FROM users WHERE username = ?', item.username);
      
      if (!user) {
        throw new Error('User not found');
      }

      // Start transaction
      await db.run('BEGIN TRANSACTION');

      try {
        const stmt = await db.prepare(`
          INSERT OR REPLACE INTO tweets (
            id,
            user_id,
            text,
            created_at,
            url,
            is_reply,
            metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const tweet of item.tweets) {
          await stmt.run([
            tweet.id,
            user.id,
            tweet.text,
            tweet.timestamp,
            tweet.url || null,
            tweet.isReply || false,
            tweet.metadata ? JSON.stringify(tweet.metadata) : null
          ]);
        }

        await stmt.finalize();
        await db.run('COMMIT');
        
        console.log(`Successfully processed item ${item.id}`);
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error(`Error processing item ${item.id}:`, error);
      
      item.attempts++;
      item.lastAttempt = Date.now();
      
      if (item.attempts < this.maxRetries) {
        console.log(`Requeueing item ${item.id}, attempt ${item.attempts}`);
        this.queue.push(item);
      } else {
        console.error(`Failed to process item ${item.id} after ${this.maxRetries} attempts`);
      }
    }
  }

  private getRetryDelay(attempts: number): number {
    // Exponential backoff with jitter
    return Math.min(
      this.retryDelay * Math.pow(2, attempts - 1) + Math.random() * 1000,
      30000 // Max 30 seconds
    );
  }
}

export const dbQueue = DatabaseQueue.getInstance(); 