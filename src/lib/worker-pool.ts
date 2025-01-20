import { Worker } from 'worker_threads'
import path from 'path'
import { EventEmitter } from 'events'
import type { EventData } from '@/types/scraper'

export interface ScrapingJob {
  id: string
  username: string
  accessToken: string
  onProgress?: (data: EventData) => void
}

export class WorkerPool {
  private workers: Worker[] = []
  private queue: ScrapingJob[] = []
  private activeJobs = new Map<string, { worker: Worker, job: ScrapingJob }>()
  private events = new EventEmitter()
  
  constructor(
    private maxWorkers: number = 3,  // Default to 3 concurrent workers
    private maxQueueSize: number = 10 // Default to 10 queued jobs
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
      console.log(`Job ${job.id} queued. Queue length: ${this.queue.length}`)
    }
  }

  private async startWorker(job: ScrapingJob): Promise<void> {
    // Use absolute path to worker file
    const workerPath = path.join(process.cwd(), 'dist', 'lib', 'worker.js')
    console.log('Starting worker with path:', workerPath)
    
    const worker = new Worker(workerPath, {
      workerData: {
        username: job.username,
        accessToken: job.accessToken
      }
    })

    this.workers.push(worker)
    this.activeJobs.set(job.id, { worker, job })

    // Handle worker messages
    worker.on('message', (message) => {
      if (job.onProgress) {
        job.onProgress(message)
      }
    })

    // Handle worker completion
    worker.on('exit', async (code) => {
      console.log(`Worker for job ${job.id} exited with code ${code}`)
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
        job.onProgress({ error: error.message })
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
  } {
    return {
      activeWorkers: this.workers.length,
      queueLength: this.queue.length,
      activeJobs: Array.from(this.activeJobs.keys())
    }
  }
} 