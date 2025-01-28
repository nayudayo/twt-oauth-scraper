import { useState, useEffect } from 'react'
import { Tweet } from '@/types/scraper'
import { Spinner } from '@/components/ui/spinner'
import { signIn } from 'next-auth/react'

interface ScrapeProgressProps {
  onComplete: (tweets: Tweet[]) => void
  onError: (error: string) => void
}

export function ScrapeProgress({ onComplete, onError }: ScrapeProgressProps) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [phase, setPhase] = useState<string>('initializing')

  useEffect(() => {
    const eventSource = new EventSource('/api/scrape')
    let accumulatedTweets: Tweet[] = []

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // Handle session expiry
        if (data.error?.toLowerCase().includes('session expired') || 
            data.error?.toLowerCase().includes('no access token')) {
          eventSource.close()
          // Redirect to auth
          signIn('twitter', { callbackUrl: window.location.href })
          return
        }
        
        // Update progress and status
        if (data.progress) setProgress(data.progress)
        if (data.status) setStatus(data.status)
        if (data.phase) setPhase(data.phase)
        
        // Handle chunked tweet data
        if (data.tweets) {
          if (data.isChunk) {
            // Accumulate tweets from chunks
            accumulatedTweets = [...accumulatedTweets, ...data.tweets]
            
            // If this is the last chunk, process all accumulated tweets
            if (data.chunkIndex === data.totalChunks - 1) {
              setTweets(accumulatedTweets)
              if (data.type === 'complete') {
                onComplete(accumulatedTweets)
                eventSource.close()
              }
            }
          } else {
            // Handle non-chunked tweet data
            setTweets(data.tweets)
            if (data.type === 'complete') {
              onComplete(data.tweets)
              eventSource.close()
            }
          }
        }

        // Handle errors
        if (data.error) {
          setError(data.error)
          onError(data.error)
          eventSource.close()
        }
      } catch (err) {
        console.error('Failed to parse event:', err)
        setError('Failed to parse server response')
        onError('Failed to parse server response')
        eventSource.close()
      }
    }

    eventSource.onerror = () => {
      setError('Connection error')
      onError('Connection error')
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [onComplete, onError])

  return (
    <div className="space-y-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" label={status || 'Processing...'} />
        <div className="w-full max-w-xs bg-red-500/10 rounded-full h-1.5 overflow-hidden">
          <div 
            className="h-full bg-red-500/50 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-xs text-red-500/70">
          {phase === 'posts' && tweets.length > 0 && (
            <span>Found {tweets.length} tweets</span>
          )}
          {phase === 'analysis' && tweets.length > 0 && (
            <span>Ready to analyze {tweets.length} tweets for personality insights</span>
          )}
        </div>
      </div>

      {error && !error.toLowerCase().includes('session expired') && (
        <div className="text-red-500/90 text-sm">
          {error}
        </div>
      )}
    </div>
  )
} 