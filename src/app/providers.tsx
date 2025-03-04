'use client'

import { SessionProvider } from 'next-auth/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { PropsWithChildren, useState } from 'react';

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Global query configuration
            staleTime: 1000 * 60 * 5, // Data becomes stale after 5 minutes
            gcTime: 1000 * 60 * 5,    // Reduced from 10 to 5 minutes
            retry: (failureCount, error) => {
              // Only retry network errors, not resource errors
              if (error instanceof Error && error.message.includes('ERR_INSUFFICIENT_RESOURCES')) {
                return false;
              }
              return failureCount < 2; // Max 2 retries
            },
            refetchOnWindowFocus: false, // Disabled to reduce concurrent requests
            refetchOnReconnect: false,   // Disabled to reduce concurrent requests
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        {children}
      </SessionProvider>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
} 