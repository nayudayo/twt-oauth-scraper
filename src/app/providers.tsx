'use client'

import { SessionProvider } from 'next-auth/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useState } from 'react';

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Global query configuration
            staleTime: 1000 * 60 * 5, // Data becomes stale after 5 minutes
            gcTime: 1000 * 60 * 10, // Cache is garbage collected after 10 minutes
            retry: 3, // Retry failed requests 3 times
            refetchOnWindowFocus: true, // Refetch when window is focused
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        {children}
      </SessionProvider>
    </QueryClientProvider>
  );
} 