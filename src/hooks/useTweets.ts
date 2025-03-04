import { useInfiniteQuery } from '@tanstack/react-query';
import { TweetPaginationResult } from '@/lib/db/tweets';

interface UseTweetsOptions {
  username: string;
  limit?: number;
  includeReplies?: boolean;
}

async function fetchTweetsPage({ 
  username, 
  cursor, 
  limit, 
  includeReplies 
}: UseTweetsOptions & { cursor?: string }): Promise<TweetPaginationResult> {
  const params = new URLSearchParams({
    username,
    ...(cursor && { cursor }),
    ...(limit && { limit: limit.toString() }),
    ...(includeReplies && { includeReplies: 'true' })
  });

  const response = await fetch(`/api/tweets/paginated?${params}`);
  
  if (!response.ok) {
    // Get the error details from the response
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch tweets');
  }

  return response.json();
}

export function useTweets({ 
  username, 
  limit = 20, 
  includeReplies = false 
}: UseTweetsOptions) {
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery<
    TweetPaginationResult,
    Error,
    { pages: TweetPaginationResult[]; pageParams: (string | undefined)[] }
  >({
    queryKey: ['tweets', username, limit, includeReplies],
    queryFn: ({ pageParam }) => fetchTweetsPage({
      username,
      cursor: pageParam as string | undefined,
      limit,
      includeReplies
    }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage: TweetPaginationResult) => lastPage.nextCursor,
    // Cache tweets for 5 minutes (matching server-side cache)
    gcTime: 5 * 60 * 1000,
    // Retry failed requests 3 times
    retry: 3,
    // Refetch when window is focused
    refetchOnWindowFocus: true,
  });

  // Flatten pages of tweets into a single array and ensure uniqueness by ID
  const tweets = data?.pages.reduce((allTweets, page) => {
    // Create a map of existing tweet IDs
    const existingIds = new Set(allTweets.map(t => t.id));
    
    // Only add tweets that don't already exist
    const newTweets = page.tweets.filter(tweet => !existingIds.has(tweet.id));
    
    return [...allTweets, ...newTweets];
  }, [] as TweetPaginationResult['tweets']) ?? [];
  
  // Calculate total tweets from the latest page
  const totalTweets = data?.pages[data.pages.length - 1]?.totalCount ?? 0;

  return {
    tweets,
    totalTweets,
    error,
    isLoading: status === 'pending',
    isFetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  };
} 