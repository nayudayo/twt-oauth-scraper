import { useCallback } from 'react';
import { useTweets } from '@/hooks/useTweets';
import { Spinner } from './ui/spinner';
import '../styles/glow.css';

interface TweetListProps {
  username: string;
  includeReplies?: boolean;
  className?: string;
}

export function TweetList({ username, includeReplies = false, className = '' }: TweetListProps) {
  // Get tweets with our custom hook
  const {
    tweets,
    totalTweets,
    error,
    isLoading,
    isFetching,
  } = useTweets({
    username,
    includeReplies,
  });

  // Error retry handler
  const handleRetry = useCallback(() => {
    if (error) {
      // Refetch the first page
      window.location.reload();
    }
  }, [error]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 text-red-500/90">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-4 space-y-4">
        <p className="text-red-500/90">Failed to load tweets: {error.message}</p>
        <button
          onClick={handleRetry}
          className="px-4 py-2 text-sm font-medium text-red-500/90 border border-red-500/50 rounded-md 
                   hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500/50
                   transition-colors duration-200 ancient-button"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-y-auto ancient-scrollbar dynamic-bg ${className}`}
      style={{ maxHeight: 'calc(100vh - 200px)' }}
    >
      {/* Cache status indicator */}
      {isFetching && (
        <div className="absolute top-2 right-2 bg-black/80 text-red-500/90 px-2 py-1 rounded text-sm border border-red-500/20">
          Refreshing...
        </div>
      )}

      {/* Tweet list */}
      <div className="space-y-2 p-4">
        {tweets.map((tweet) => (
          <div
            key={tweet.id}
            className="p-3 bg-black/40 rounded border border-red-500/20 hover:bg-red-500/5 
                     transition-colors duration-200 cursor-pointer group"
          >
            <div className="text-xs text-red-500/60 mb-2 font-mono">
              {new Date(tweet.createdAt).toLocaleString()}
            </div>
            <p className="text-red-500/90 text-sm ancient-text">{tweet.text}</p>
            {tweet.isReply && (
              <div className="mt-2 text-xs text-red-500/50 font-mono">
                Reply to @{tweet.inReplyToUsername}
              </div>
            )}
          </div>
        ))}

        {/* Collection Stats */}
        <div className="mt-6 pt-4 border-t border-red-500/10 text-red-500/60 backdrop-blur-sm glow-border">
          {'>'} Collection Stats: {totalTweets} posts
        </div>
      </div>
    </div>
  );
} 