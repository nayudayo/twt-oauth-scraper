import { getToken } from 'next-auth/jwt'
import { NextRequest } from 'next/server'
import type { EventData } from '@/types/scraper'
import { WorkerPool } from '@/lib/worker-pool'

// Create a single worker pool instance with 16 concurrent workers
const workerPool = new WorkerPool(16, 100) // 16 concurrent workers, 100 max queued jobs

// Helper function to chunk large data
function chunkEventData(data: EventData): EventData[] {
  // If data contains tweets, split them into smaller chunks
  if ('tweets' in data && Array.isArray(data.tweets) && data.tweets.length > 5) {
    const chunks: EventData[] = []
    const chunkSize = 5
    const baseProgress = typeof data.progress === 'number' ? data.progress : 0
    
    // Split tweets into chunks
    for (let i = 0; i < data.tweets.length; i += chunkSize) {
      const chunk = {
        ...data,
        tweets: data.tweets.slice(i, i + chunkSize),
        progress: Math.min(80 + Math.floor((i + chunkSize) / data.tweets.length * 20), baseProgress),
        isChunk: true,
        chunkIndex: Math.floor(i / chunkSize),
        totalChunks: Math.ceil(data.tweets.length / chunkSize)
      }
      chunks.push(chunk)
    }
    return chunks
  }
  
  return [data]
}

export async function POST(req: NextRequest) {
  // Create the stream first
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  // Start the response immediately
  const response = new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })

  // Helper function to send events
  let isStreamClosed = false

  const send = async (data: EventData) => {
    try {
      if (!isStreamClosed) {
        // Split large data into chunks
        const chunks = chunkEventData(data)
        
        // Send each chunk
        for (const chunk of chunks) {
          const eventData = JSON.stringify(chunk)
          await writer.write(encoder.encode(`data: ${eventData}\n\n`))
          // Small delay between chunks to prevent overwhelming the client
          if (chunks.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }
      }
    } catch (error) {
      console.error('Error sending event:', error)
      isStreamClosed = true
    }
  }

  let jobId: string | undefined;

  try {
    console.log('🔑 Getting auth token...')
    const token = await getToken({ req })
    if (!token?.accessToken || !token?.username) {
      console.error('❌ No access token or username found')
      await send({ error: 'No access token or username found', progress: 0 })
      await writer.close()
      return response
    }
    console.log('✅ Token found for user:', token.username)

    // Create a unique job ID
    jobId = `${token.username}-${Date.now()}`

    // Handle request abortion
    req.signal.addEventListener('abort', async () => {
      console.log('Request aborted, cleaning up job:', jobId)
      if (jobId) {
        await workerPool.terminateJob(jobId)
      }
      await send({ error: 'Operation cancelled by user', progress: 0 })
      await writer.close()
    })

    // Add the job to the worker pool
    await workerPool.addJob({
      id: jobId,
      username: token.username,
      accessToken: token.accessToken,
      onProgress: async (data: EventData) => {
        await send(data)
        if (data.progress === 100 || data.error) {
          await writer.close()
        }
      }
    })

  } catch (error) {
    console.error('❌ Error:', error)
    if (jobId) {
      await workerPool.terminateJob(jobId)
    }
    await send({ 
      error: error instanceof Error ? error.message : 'Failed to start scraping',
      progress: 0
    })
    await writer.close()
  }

  return response
}

// Add an endpoint to get worker pool status
export async function GET() {
  return Response.json(workerPool.getStatus())
} 