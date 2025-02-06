import { getToken } from 'next-auth/jwt'
import { NextRequest } from 'next/server'
import type { EventData } from '@/types/scraper'
import { WorkerPool } from '@/lib/worker-pool'

// Create a single worker pool instance with 16 concurrent workers
const workerPool = new WorkerPool(16, 100) // 16 concurrent workers, 100 max queued jobs

// Helper function to chunk large data
function chunkEventData(data: EventData): EventData[] {
  // If data contains tweets, split them into smaller chunks
  if ('tweets' in data && Array.isArray(data.tweets) && data.tweets.length > 50) {
    const chunks: EventData[] = []
    const chunkSize = 50
    const baseProgress = typeof data.progress === 'number' ? data.progress : 0
    const totalChunks = Math.ceil(data.tweets.length / chunkSize)
    
    // Split tweets into chunks
    for (let i = 0; i < data.tweets.length; i += chunkSize) {
      const chunk = {
        ...data,
        tweets: data.tweets.slice(i, i + chunkSize),
        progress: Math.min(80 + Math.floor((i + chunkSize) / data.tweets.length * 20), baseProgress),
        isChunk: true,
        chunkIndex: Math.floor(i / chunkSize),
        totalChunks,
        totalTweets: data.tweets.length // Add total tweet count to each chunk
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
  let lastChunkSent = false

  const send = async (data: EventData) => {
    try {
      if (!isStreamClosed) {
        // Split large data into chunks
        const chunks = chunkEventData(data)
        
        // Send each chunk
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]
          const isLastChunk = i === chunks.length - 1
          
          // Clean and validate the data before sending
          const validateAndCleanChunk = (chunk: EventData & {
            data?: {
              profile?: {
                name?: string | null;
                bio?: string | null;
                followersCount?: number | null;
                followingCount?: number | null;
                imageUrl?: string | null;
              };
              tweets?: Array<{
                id?: string | number;
                text?: string;
                url?: string;
                createdAt?: string;
                timestamp?: string;
                metrics?: {
                  likes?: number | null;
                  retweets?: number | null;
                  views?: number | null;
                };
                images?: string[];
              }>;
            };
            scanProgress?: {
              phase?: string;
              count?: number;
            };
          }) => {
            try {
              // Helper function to sanitize strings
              const sanitizeString = (str: string | null | undefined): string | null => {
                if (!str) return null;
                return String(str)
                  .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
                  .replace(/\\/g, '\\\\') // Escape backslashes
                  .replace(/"/g, '\\"')   // Escape quotes
                  .replace(/\n/g, ' ')    // Replace newlines with spaces
                  .replace(/\r/g, ' ')    // Replace carriage returns with spaces
                  .replace(/\t/g, ' ')    // Replace tabs with spaces
                  .replace(/[\uD800-\uDFFF]/g, '') // Remove surrogate pairs
                  .replace(/[^\x20-\x7E]/g, '') // Only keep printable ASCII
                  .replace(/\s+/g, ' ')   // Normalize whitespace
                  .trim();
              };

              // Limit chunk size to prevent JSON parsing issues
              const MAX_TWEETS_PER_CHUNK = 25;
              const tweets = Array.isArray(chunk.tweets) ? chunk.tweets.slice(0, MAX_TWEETS_PER_CHUNK) : [];

              // Clean the chunk data
              const cleanChunk = {
                progress: chunk.progress || 0,
                status: sanitizeString(chunk.status) || '',
                phase: sanitizeString(chunk.phase),
                type: sanitizeString(chunk.type),
                error: sanitizeString(chunk.error),
                scanProgress: chunk.scanProgress ? {
                  phase: sanitizeString(chunk.scanProgress.phase) || 'unknown',
                  count: Number(chunk.scanProgress.count) || 0
                } : undefined,
                data: chunk.data ? {
                  profile: chunk.data.profile ? {
                    name: sanitizeString(chunk.data.profile.name),
                    bio: sanitizeString(chunk.data.profile.bio),
                    followersCount: chunk.data.profile.followersCount,
                    followingCount: chunk.data.profile.followingCount,
                    imageUrl: sanitizeString(chunk.data.profile.imageUrl)
                  } : undefined,
                  tweets: tweets.map(tweet => ({
                    id: String(tweet.id || ''),
                    text: sanitizeString(tweet.text) || '',
                    url: sanitizeString(tweet.url),
                    createdAt: sanitizeString(tweet.createdAt),
                    timestamp: sanitizeString(tweet.timestamp) || sanitizeString(tweet.createdAt),
                    metrics: {
                      likes: tweet.metrics?.likes ? Number(tweet.metrics.likes) : null,
                      retweets: tweet.metrics?.retweets ? Number(tweet.metrics.retweets) : null,
                      views: tweet.metrics?.views ? Number(tweet.metrics.views) : null
                    },
                    images: Array.isArray(tweet.images) ? tweet.images.filter(Boolean).map(String) : [],
                    isReply: Boolean(tweet.text?.startsWith('@'))
                  }))
                } : undefined,
                tweets: tweets.map(tweet => ({
                  id: String(tweet.id || ''),
                  text: sanitizeString(tweet.text) || '',
                  url: sanitizeString(tweet.url),
                  createdAt: sanitizeString(tweet.createdAt),
                  timestamp: sanitizeString(tweet.timestamp) || sanitizeString(tweet.createdAt),
                  metrics: {
                    likes: tweet.metrics?.likes ? Number(tweet.metrics.likes) : null,
                    retweets: tweet.metrics?.retweets ? Number(tweet.metrics.retweets) : null,
                    views: tweet.metrics?.views ? Number(tweet.metrics.views) : null
                  },
                  images: Array.isArray(tweet.images) ? tweet.images.filter(Boolean).map(String) : [],
                  isReply: Boolean(tweet.text?.startsWith('@'))
                }))
              };

              // Test stringify the entire chunk
              const testJson = JSON.stringify(cleanChunk);
              JSON.parse(testJson); // Validate the JSON is parseable
              return cleanChunk;
            } catch (error) {
              console.error('Error validating chunk:', error);
              // Return a minimal valid chunk
              return {
                progress: chunk.progress || 0,
                status: 'Error processing data',
                tweets: []
              };
            }
          };

          const cleanChunk = validateAndCleanChunk(chunk);

          try {
            const eventData = JSON.stringify(cleanChunk);
            await writer.write(encoder.encode(`data: ${eventData}\n\n`));
          } catch (jsonError) {
            console.error('Invalid JSON chunk:', jsonError)
            // Send error notification instead of breaking
            await writer.write(
              encoder.encode(`data: ${JSON.stringify({ 
                error: 'Data processing error', 
                progress: chunk.progress || 0 
              })}\n\n`)
            )
          }
          
          // Only close the stream after the final chunk of completion data
          if (isLastChunk && (data.progress === 100 || data.error)) {
            lastChunkSent = true
          }
        }
        
        // Close the stream only after all data is sent and it's the final message
        if (lastChunkSent) {
          isStreamClosed = true
          await writer.close()
        }
      }
    } catch (error) {
      console.error('Error sending event:', error)
      isStreamClosed = true
      try {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ 
            error: 'Stream error', 
            progress: 0 
          })}\n\n`)
        )
        await writer.close()
      } catch (closeError) {
        console.error('Error closing writer:', closeError)
      }
    }
  }

  let jobId: string | undefined;

  try {
    console.log('🔑 Getting auth token...')
    const token = await getToken({ req })
    
    // Check for token expiry
    if (!token) {
      console.error('❌ No token found')
      await send({ error: 'Session expired. Please sign in again.', progress: 0 })
      return response
    }

    if (!token.accessToken) {
      console.error('❌ No access token found')
      await send({ error: 'Session expired. Please sign in again.', progress: 0 })
      return response
    }

    if (!token.username) {
      console.error('❌ No username found in token')
      await send({ error: 'Invalid session. Please sign in again.', progress: 0 })
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
    })

    // Add the job to the worker pool
    await workerPool.addJob({
      id: jobId,
      username: token.username,
      accessToken: token.accessToken,
      onProgress: async (data: EventData) => {
        // Check for Apify API errors that might indicate token issues
        if (data.error?.toLowerCase().includes('unauthorized') || 
            data.error?.toLowerCase().includes('forbidden')) {
          await send({ error: 'Session expired. Please sign in again.', progress: 0 })
          return
        }
        
        await send(data)
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
  }

  return response
}

// Add an endpoint to get worker pool status
export async function GET() {
  return Response.json(workerPool.getStatus())
} 