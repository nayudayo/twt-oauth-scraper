import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { WorkerPool } from '@/lib/worker-pool';
import type { WorkerMessage } from '@/lib/twitter/types';
import { initDB } from '@/lib/db';

// Debug logging for environment variables
const debugEnvVars = {
  hasTwitterApiKey: Boolean(process.env.TWITTER_API_KEY),
  twitterApiKey: process.env.TWITTER_API_KEY?.substring(0, 4) + '...',
  hasNextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET),
  hasTwitterClientId: Boolean(process.env.TWITTER_CLIENT_ID)
};

// Create a singleton instance
const workerPool = new WorkerPool();

export async function POST() {
  try {
    // Debug logging
    console.log('Environment variables check:', debugEnvVars);

    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Initialize database and get/create user
    const db = await initDB();
    let user = await db.getUserByUsername(session.username);
    if (!user) {
      user = await db.createUser({
        username: session.username,
        twitter_username: session.username,
        created_at: new Date()
      });
    }

    // Create stream for SSE
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    let streamClosed = false;

    // Create a job and add it to the worker pool
    const job = {
      id: Date.now().toString(),
      username: session.username,
      onProgress: async (message: WorkerMessage) => {
        try {
          // Don't try to write to a closed stream
          if (streamClosed) {
            console.log('Stream already closed, skipping message:', message);
            return;
          }

          console.log('Writing message to stream:', {
            type: message.type,
            phase: message.phase,
            progress: message.progress,
            error: message.error
          });

          await writer.write(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
          
          // Close the stream if we're done or there's an error
          if (message.type === 'complete' || message.type === 'error') {
            console.log('Closing stream due to:', message.type);
            streamClosed = true;
            await writer.close();
          }
        } catch (error) {
          console.error('Error writing to stream:', error);
          // Only try to send error if stream isn't already closed
          if (!streamClosed) {
            try {
              await writer.write(encoder.encode(`data: ${JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : 'Error writing to stream'
              })}\n\n`));
            } finally {
              streamClosed = true;
              await writer.close();
            }
          }
        }
      }
    };

    try {
      // Add job to pool
      await workerPool.addJob(job);
    } catch (error) {
      // Handle worker pool errors
      console.error('Worker pool error:', error);
      if (!streamClosed) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Failed to start scraping job'
        })}\n\n`));
        streamClosed = true;
        await writer.close();
      }
      throw error;
    }

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('Critical error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Add an endpoint to get worker pool status
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.username) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get pool status
    const status = workerPool.getStatus();
    
    // Check if there's an active job for this user by looking at the job IDs
    const hasActiveJob = status.activeJobs.length > 0;

    return NextResponse.json({
      status: hasActiveJob ? 'active' : 'inactive',
      activeWorkers: status.activeWorkers,
      queueLength: status.queueLength
    });
  } catch (error) {
    console.error('Error getting worker pool status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get worker pool status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 