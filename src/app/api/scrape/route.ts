import { getToken } from 'next-auth/jwt'
import { NextRequest } from 'next/server'
import type { EventData } from '@/types/scraper'
import { WorkerPool } from '@/lib/worker-pool'

// Create a single worker pool instance
const workerPool = new WorkerPool(3, 10) // 3 concurrent workers, 10 max queued jobs

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
        await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
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