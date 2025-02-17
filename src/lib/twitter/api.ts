import { getServerSession } from 'next-auth';
import { createTwitterClient } from './client';
import { authOptions } from '../auth/config';

export async function getTwitterClient() {
  const session = await getServerSession(authOptions);
  
  // Debug log environment variable
  console.log('Environment check:', {
    hasTwitterApiKey: Boolean(process.env.TWITTER_API_KEY),
    keyPrefix: process.env.TWITTER_API_KEY ? process.env.TWITTER_API_KEY.substring(0, 4) : 'undefined'
  });

  if (!process.env.TWITTER_API_KEY) {
    throw new Error('TWITTER_API_KEY environment variable is not set');
  }

  // Only pass the session if it exists
  return createTwitterClient(
    process.env.TWITTER_API_KEY,
    session || undefined
  );
}

// Helper for API routes that require authentication
export async function getAuthenticatedTwitterClient() {
  const client = await getTwitterClient();
  const session = await getServerSession(authOptions);

  if (!session?.username) {
    throw new Error('This endpoint requires authentication');
  }

  return client;
} 