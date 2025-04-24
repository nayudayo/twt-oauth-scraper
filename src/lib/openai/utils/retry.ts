import { API_TIMEOUT } from '../openai';
import { TimeoutError } from '../openai';
import { getDeviceType } from '../openai';

export type TimeoutType = keyof typeof API_TIMEOUT;

export async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  timeoutType: TimeoutType = 'base'
): Promise<T> {
  let lastError: Error | null = null;
  const deviceType = getDeviceType();
  const timeout = API_TIMEOUT[timeoutType][deviceType];
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<T>((_, reject) => {
        setTimeout(() => reject(new TimeoutError()), timeout);
      });

      // Race between the operation and timeout
      const result = await Promise.race([
        operation(),
        timeoutPromise
      ]);
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`Attempt ${attempt + 1} failed:`, lastError.message);
      
      // Let the caller handle aborted requests
      if (error instanceof Error && 
          (error.name === 'AbortError' || error.message.includes('aborted'))) {
        throw error;
      }
      
      if (attempt < maxRetries - 1) {
        // Increase delay for timeout errors and mobile/tablet
        const isTimeout = error instanceof TimeoutError;
        const mobileMultiplier = deviceType !== 'desktop' ? 1.5 : 1;
        const delay = baseDelay * Math.pow(2, attempt) * mobileMultiplier + (isTimeout ? 5000 : Math.random() * 1000);
        console.log(`Retrying in ${Math.round(delay / 1000)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}