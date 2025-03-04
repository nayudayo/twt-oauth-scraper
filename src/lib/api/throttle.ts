import { sleep } from '@/lib/utils';

class RequestThrottler {
  private static instance: RequestThrottler;
  private activeRequests: number = 0;
  private maxConcurrent: number = 3;
  private queue: Array<() => Promise<void>> = [];
  private processing: boolean = false;

  private constructor() {}

  static getInstance(): RequestThrottler {
    if (!RequestThrottler.instance) {
      RequestThrottler.instance = new RequestThrottler();
    }
    return RequestThrottler.instance;
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeRequests >= this.maxConcurrent) {
      // Queue the request
      return new Promise((resolve, reject) => {
        this.queue.push(async () => {
          try {
            const result = await this.executeRequest(fn);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
        this.processQueue();
      });
    }

    return this.executeRequest(fn);
  }

  private async executeRequest<T>(fn: () => Promise<T>): Promise<T> {
    this.activeRequests++;
    try {
      return await fn();
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) {
        await next();
        // Add small delay between requests
        await sleep(100);
      }
    }
    this.processing = false;
  }
}

export const throttler = RequestThrottler.getInstance(); 