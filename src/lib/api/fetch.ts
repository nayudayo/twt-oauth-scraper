import { throttler } from './throttle';

export async function throttledFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return throttler.throttle(() => fetch(input, init));
}

// Helper to handle common fetch errors
export async function safeFetch<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await throttledFetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    if (error instanceof Error && error.message.includes('ERR_INSUFFICIENT_RESOURCES')) {
      console.warn('Resource limit reached, request will not be retried');
    }
    throw error;
  }
} 