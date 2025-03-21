import { useState, useEffect } from 'react';
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
    currentBatch?: number;
    totalBatches?: number;
    rateLimitReset?: number;
    isRateLimited?: boolean;
  } | null;
  tweets?: Tweet[];
}

export function TweetList({ 
  username, 
  includeReplies = false, 
  className = '',
  isScrapingActive = false,
  scrapingProgress = null,
  tweets: parentTweets = []
}: TweetListProps) {
  const [displayedCount, setDisplayedCount] = useState(0);
  const [localTweets, setLocalTweets] = useState<Tweet[]>([]);

  // Get tweets with our custom hook for non-scraping state
  const {
    tweets: fetchedTweets,
    isFetching
  } = useTweets({
    username,
    includeReplies
  });

  // Update local tweets when parent tweets change
  useEffect(() => {
    if (parentTweets.length > 0) {
      setLocalTweets(parentTweets);
    }
  }, [parentTweets]);

  // Update displayed count based on scraping status or fetched tweets
  useEffect(() => {
    if (isScrapingActive && scrapingProgress) {
      setDisplayedCount(scrapingProgress.count);
    } else if (!isScrapingActive && localTweets.length > 0) {
      setDisplayedCount(localTweets.length);
    } else if (!isScrapingActive && fetchedTweets.length > 0) {
      setDisplayedCount(fetchedTweets.length);
    }
  }, [isScrapingActive, scrapingProgress, localTweets.length, fetchedTweets.length]);

  // Determine which tweets to display and deduplicate them
  const tweetsToDisplay = (() => {
    // Use local tweets if available, otherwise fall back to fetched tweets
    const tweets = localTweets.length > 0 ? localTweets : fetchedTweets;
    const uniqueTweets = new Map();
    tweets.forEach(tweet => {
      if (!uniqueTweets.has(tweet.id)) {
        uniqueTweets.set(tweet.id, tweet);
      }
    });
    return Array.from(uniqueTweets.values());
  })();

  return (
    <div
      className={`relative overflow-y-auto ancient-scrollbar dynamic-bg ${className}`}
      style={{ maxHeight: 'calc(100vh - 200px)' }}
    >
      {/* Status indicators */}
      <div className="absolute top-2 right-2 flex flex-col gap-2">
        {/* Scraping progress with loading animation */}
        {isScrapingActive && (
          <div className="bg-black/80 text-red-500/90 px-3 py-2 rounded text-sm border border-red-500/20 flex items-center gap-2">
            <Spinner size="sm" />
            <span>
              {scrapingProgress?.message || `Scanning: ${displayedCount} tweets`}
            </span>
          </div>
        )}
        
        {/* Cache refresh indicator */}
        {isFetching && !isScrapingActive && (
          <div className="bg-black/80 text-red-500/90 px-3 py-2 rounded text-sm border border-red-500/20 flex items-center gap-2">
            <Spinner size="sm" />
            <span>Refreshing...</span>
          </div>
        )}
      </div>

      {/* Progress Status */}
      {isScrapingActive && (
        <div className="p-3 bg-black/20 border-b border-red-500/10 backdrop-blur-sm">
          <div className="flex flex-col gap-2 text-red-500/60">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-none">
                <Spinner size="sm" />
              </div>
              <span className="uppercase tracking-wider text-xs glow-text truncate">
                {scrapingProgress?.message || 'Collecting tweets...'}
              </span>
            </div>
            {scrapingProgress && (
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between">
                  <span>Total Collected: {displayedCount}</span>
                  {scrapingProgress.total && (
                    <span>Target: {scrapingProgress.total}</span>
                  )}
                </div>
                {scrapingProgress.currentBatch && scrapingProgress.totalBatches && (
                  <div className="flex items-center justify-between">
                    <span>Batch Progress: {scrapingProgress.currentBatch}/{scrapingProgress.totalBatches}</span>
                  </div>
                )}
                {scrapingProgress.isRateLimited && (
                  <div className="text-yellow-500/80">
                    Rate limit reached. Resuming in {Math.ceil((scrapingProgress.rateLimitReset || 0) / 1000)}s...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tweet list */}
      <div className="space-y-2 p-4">
        {tweetsToDisplay.length === 0 ? (
          <div className="text-red-500/60 italic text-center">
            {isScrapingActive ? (
              <div className="flex flex-col items-center gap-2">
                <Spinner size="sm" />
                <span>Initializing collection...</span>
              </div>
            ) : (
              'No tweets found'
            )}
          </div>
        ) : (
          <>
            {tweetsToDisplay.map((tweet, index) => (
              <div
                key={`${tweet.id}-${tweet.createdAt}`}
                className={`p-3 bg-black/40 rounded border border-red-500/20 hover:bg-red-500/5 
                         transition-colors duration-200 cursor-pointer group ${isScrapingActive ? 'opacity-50' : ''}`}
              >
                <div className="text-xs text-red-500/60 mb-2 font-mono">
                  Tweet #{index + 1}
                </div>
                <p className="text-red-500/90 text-sm ancient-text">{tweet.text}</p>
                {tweet.isReply && (
                  <div className="mt-2 text-xs text-red-500/50 font-mono">
                    Reply to @{'inReplyToUsername' in tweet ? tweet.inReplyToUsername : null}
                  </div>
                )}
              </div>
            ))}

            {/* Collection Stats */}
            <div className="mt-6 pt-4 border-t border-red-500/10 text-red-500/60 backdrop-blur-sm glow-border">
              {'>'} Collection Stats: {displayedCount} {scrapingProgress?.total ? `/ ${scrapingProgress.total}` : ''} posts
              {isScrapingActive && (
                <div className="flex items-center gap-2 mt-2">
                  <Spinner size="sm" />
                  <span className="text-red-500/40">
                    {scrapingProgress?.message || 'Scanning in progress...'}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
} 