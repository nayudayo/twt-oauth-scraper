import { Worker } from 'worker_threads'
import path from 'path'
import { EventEmitter } from 'events'
import type { WorkerMessage } from '@/lib/twitter/types'

export interface ScrapingJob {
  id: string
  username: string
  onProgress?: (data: WorkerMessage) => void
}

export class WorkerPool {
  private workers: Worker[] = []
  private queue: ScrapingJob[] = []
  private activeJobs = new Map<string, { worker: Worker, job: ScrapingJob }>()
  private events = new EventEmitter()
  
  constructor(
    private maxWorkers: number = 16,  // Maximum 16 concurrent workers
    private maxQueueSize: number = 100 // Queue size for additional requests
  ) {}

  public async addJob(job: ScrapingJob): Promise<void> {
    // Check if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('Queue is full. Please try again later.')
    }

    // Check if job is already running or queued
    if (this.isJobActive(job.id) || this.queue.some(j => j.id === job.id)) {
      throw new Error('A job for this user is already in progress.')
    }

    if (this.workers.length < this.maxWorkers && this.queue.length === 0) {
      // Start the job immediately if we have capacity
      await this.startWorker(job)
    } else {
      // Queue the job
      this.queue.push(job)
      console.log(`Job ${job.id} queued. Queue length: ${this.queue.length}/${this.maxQueueSize}`)
    }
  }

  private async startWorker(job: ScrapingJob): Promise<void> {
    // Check for API key
    if (!process.env.TWITTER_API_KEY) {
      throw new Error('TWITTER_API_KEY environment variable is not set');
    }

    // Use absolute path to worker file
    const workerPath = path.join(process.cwd(), 'dist', 'lib', 'twitter', 'worker.js')
    console.log('Starting worker with path:', workerPath)
    
    const worker = new Worker(workerPath, {
      workerData: {
        username: job.username,
        apiKey: process.env.TWITTER_API_KEY
      },
      env: process.env // Pass environment variables to worker
    })

    this.workers.push(worker)
    this.activeJobs.set(job.id, { worker, job })

    // Handle worker messages
    worker.on('message', (message) => {
      console.log(`Worker message received for job ${job.id}:`, {
        type: message.type,
        phase: message.phase,
        progress: message.progress,
        error: message.error
      });

      if (job.onProgress) {
        try {
          job.onProgress(message)
        } catch (error) {
          console.error(`Error in onProgress handler for job ${job.id}:`, error);
          // Try to send error through worker
          worker.postMessage({ 
            type: 'error',
            error: 'Error processing worker message'
          });
        }
      }
    })

    // Handle worker completion
    worker.on('exit', async (code) => {
      console.log(`Worker for job ${job.id} exited with code ${code}`)
      
      // If worker exited with non-zero code and we haven't sent an error yet, send one
      if (code !== 0 && job.onProgress) {
        try {
          job.onProgress({
            type: 'error',
            error: `Worker exited with code ${code}`,
            progress: 0
          });
        } catch (error) {
          console.error(`Error sending exit error for job ${job.id}:`, error);
        }
      }

      this.workers = this.workers.filter(w => w !== worker)
      this.activeJobs.delete(job.id)

      // Start next job if any in queue
      if (this.queue.length > 0) {
        const nextJob = this.queue.shift()!
        await this.startWorker(nextJob)
      }
    })

    // Handle worker errors
    worker.on('error', (error) => {
      console.error(`Worker error for job ${job.id}:`, error)
      if (job.onProgress) {
        try {
          job.onProgress({ 
            type: 'error',
            error: error.message,
            progress: 0
          })
        } catch (err) {
          console.error(`Error sending error message for job ${job.id}:`, err);
        }
      }
    })
  }

  private isJobActive(jobId: string): boolean {
    return this.activeJobs.has(jobId)
  }

  public async shutdown(): Promise<void> {
    // Terminate all workers
    const terminations = this.workers.map(worker => worker.terminate())
    await Promise.all(terminations)
    
    this.workers = []
    this.queue = []
    this.activeJobs.clear()
  }

  public getStatus(): {
    activeWorkers: number
    queueLength: number
    activeJobs: string[]
    maxWorkers: number
    maxQueueSize: number
  } {
    return {
      activeWorkers: this.workers.length,
      queueLength: this.queue.length,
      activeJobs: Array.from(this.activeJobs.keys()),
      maxWorkers: this.maxWorkers,
      maxQueueSize: this.maxQueueSize
    }
  }

  public async terminateJob(jobId: string): Promise<void> {
    // Find the active job
    const activeJob = this.activeJobs.get(jobId)
    if (activeJob) {
      console.log(`Terminating job ${jobId}`)
      const { worker, job } = activeJob
      
      try {
        // Send termination signal to worker
        worker.postMessage({ type: 'terminate' })
        
        // Wait for worker to cleanup and terminate
        await Promise.race([
          worker.terminate(),
          new Promise(resolve => setTimeout(resolve, 5000)) // 5s timeout
        ])
        
        // Clean up
        this.workers = this.workers.filter(w => w !== worker)
        this.activeJobs.delete(jobId)
        
        // Remove from queue if present
        this.queue = this.queue.filter(j => j.id !== jobId)
        
        // Notify progress handler of termination
        if (job.onProgress) {
          job.onProgress({
            error: 'Operation cancelled by user',
            progress: 0
          })
        }
        
        console.log(`Job ${jobId} terminated`)
      } catch (error) {
        console.error(`Error terminating job ${jobId}:`, error)
        throw error
      }
    } else {
      // If job is in queue, remove it
      this.queue = this.queue.filter(job => job.id !== jobId)
      console.log(`Job ${jobId} not found in active jobs or queue`)
    }
  }
}