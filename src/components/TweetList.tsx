import { useCallback, useState, useEffect } from 'react';
import { useTweets } from '@/hooks/useTweets';
import { Spinner } from './ui/spinner';
import '../styles/glow.css';
import { Tweet } from '@/types/scraper';

interface TweetListProps {
  username: string;
  includeReplies?: boolean;
  className?: string;
  isScrapingActive?: boolean;
  scrapingProgress?: {
    phase: string;
    count: number;
    total?: number;
    message?: string;
  } | null;
}

export function TweetList({ 
  username, 
  includeReplies = false, 
  className = '',
  isScrapingActive = false,
  scrapingProgress = null
}: TweetListProps) {
  // Track accumulated tweets during scraping
  const [accumulatedTweets, setAccumulatedTweets] = useState<Tweet[]>([]);
  const [displayedCount, setDisplayedCount] = useState(0);

  // Get tweets with our custom hook
  const {
    tweets,
    error,
    isLoading,
    isFetching,
    fetchNextPage
  } = useTweets({
    username,
    includeReplies
  });

  // Update displayed count based on scraping status or fetched tweets
  useEffect(() => {
    if (isScrapingActive && scrapingProgress) {
      setDisplayedCount(scrapingProgress.count);
    } else if (!isScrapingActive && tweets.length > 0) {
      setDisplayedCount(tweets.length);
    }
  }, [isScrapingActive, scrapingProgress, tweets.length]);

  // Reset accumulated tweets when scraping starts
  useEffect(() => {
    if (isScrapingActive) {
      setAccumulatedTweets([]);
    }
  }, [isScrapingActive]);

  // Error retry handler
  const handleRetry = useCallback(() => {
    if (error) {
      fetchNextPage();
    }
  }, [error, fetchNextPage]);

  // Show loading state during initial load
  if (isLoading && !isScrapingActive) {
    return (
      <div className="flex items-center justify-center p-4 text-red-500/90">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  // Show error state (but not during active scraping)
  if (error && !isScrapingActive) {
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

  // Determine which tweets to display
  const tweetsToDisplay = isScrapingActive ? accumulatedTweets : tweets;

  return (
    <div
      className={`relative overflow-y-auto ancient-scrollbar dynamic-bg ${className}`}
      style={{ maxHeight: 'calc(100vh - 200px)' }}
    >
      {/* Status indicators */}
      <div className="absolute top-2 right-2 flex flex-col gap-2">
        {/* Scraping progress */}
        {isScrapingActive && scrapingProgress && (
          <div className="bg-black/80 text-red-500/90 px-2 py-1 rounded text-sm border border-red-500/20">
            {scrapingProgress.message || `Scanning: ${displayedCount} tweets`}
          </div>
        )}
        
        {/* Cache refresh indicator */}
        {isFetching && !isScrapingActive && (
          <div className="bg-black/80 text-red-500/90 px-2 py-1 rounded text-sm border border-red-500/20">
            Refreshing...
          </div>
        )}
      </div>

      {/* Tweet list */}
      <div className="space-y-2 p-4">
        {tweetsToDisplay.length === 0 ? (
          <div className="text-red-500/60 italic text-center">
            {isScrapingActive ? 'Collecting tweets...' : 'No tweets found'}
          </div>
        ) : (
          tweetsToDisplay.map((tweet) => (
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
                  Reply to @{'inReplyToUsername' in tweet ? tweet.inReplyToUsername : null}
                </div>
              )}
            </div>
          ))
        )}

        {/* Collection Stats */}
        <div className="mt-6 pt-4 border-t border-red-500/10 text-red-500/60 backdrop-blur-sm glow-border">
          {'>'} Collection Stats: {displayedCount} {scrapingProgress?.total ? `/ ${scrapingProgress.total}` : ''} posts
          {isScrapingActive && (
            <span className="ml-2 text-red-500/40">(Scanning in progress...)</span>
          )}
        </div>
      </div>
    </div>
  );
} 