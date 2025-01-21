'use client'

import { useState, useEffect } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import ChatBox from '@/components/ChatBox'
import { Tweet, TwitterProfile } from '@/types/scraper'

interface ScanProgress {
  phase: 'posts' | 'replies'
  count: number
}

interface ScrapedData {
  profile: TwitterProfile
  tweets: Tweet[]
}

export default function Home() {
  const { data: session } = useSession()
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [showConsent, setShowConsent] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [scrapedData, setScrapedData] = useState<ScrapedData | null>(null)

  // Load tweets from localStorage on mount
  useEffect(() => {
    if (session?.username) {
      const storedTweets = localStorage.getItem(`tweets_${session.username}`)
      if (storedTweets) {
        try {
          setTweets(JSON.parse(storedTweets))
        } catch (e) {
          console.error('Failed to parse stored tweets:', e)
        }
      }
    }
  }, [session?.username])

  // Save tweets to localStorage whenever they change
  useEffect(() => {
    if (session?.username && tweets.length > 0) {
      localStorage.setItem(`tweets_${session.username}`, JSON.stringify(tweets))
    }
  }, [tweets, session?.username])

  // Add escape key handler for modals
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showComplete) {
          setShowComplete(false)
          if (loading) handleCancelScraping()
        }
        if (showConsent) {
          setShowConsent(false)
          if (loading) handleCancelScraping()
        }
        if (loading) handleCancelScraping()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showComplete, showConsent, loading])

  const handleScrape = async () => {
    setShowConsent(true)
  }

  const handleCancelScraping = async () => {
    if (abortController) {
      console.log('Aborting scraping process...')
      abortController.abort()
      setAbortController(null)
    }
    setLoading(false)
    setScanProgress(null)
    setProgress(0)
    setShowComplete(false)
  }

  const startScraping = async () => {
    setShowConsent(false)
    setLoading(true)
    setError(null)
    setProgress(0)
    setTweets([]) // Clear existing tweets before new scrape
    setShowComplete(false)

    // Create new AbortController for this scraping session
    const controller = new AbortController()
    setAbortController(controller)

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        signal: controller.signal
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Failed to start scraping')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Parse the SSE data
        const text = new TextDecoder().decode(value)
        const lines = text.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              console.log('Received:', data)

              if (data.error) {
                setError(data.error)
                setLoading(false)
                setAbortController(null)
                return
              }

              if (data.progress) {
                setProgress(data.progress)
              }

              if (data.scanCount !== undefined) {
                setScanProgress({
                  phase: data.phase,
                  count: data.scanCount
                })
              }

              if (data.tweets) {
                console.log('Received tweets:', data.tweets.length)
                setTweets(prev => {
                  // Filter out duplicates based on tweet ID
                  const newTweets = data.tweets.filter(
                    (newTweet: Tweet) => !prev.some(existingTweet => existingTweet.id === newTweet.id)
                  )
                  return [...prev, ...newTweets]
                })
              }

              // Handle completion
              if (data.type === 'complete' || (data.progress === 100 && data.status === 'Complete')) {
                console.log('Scraping complete, showing completion modal')
                if (data.data) {
                  console.log('Setting final data:', data.data)
                  setScrapedData(data.data)
                  setTweets(data.data.tweets)
                }
                setLoading(false)
                setScanProgress(null)
                setShowComplete(true)
              }
            } catch (e) {
              console.error('Failed to parse:', line, e)
            }
          }
        }
      }
    } catch (error: unknown) {
      console.error('Scraping error:', error)
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        setError('Scraping cancelled by user')
      } else {
        setError(error instanceof Error ? error.message : 'Failed to start scraping')
      }
      setLoading(false)
      setAbortController(null)
    }
  }

  // Add clear data function
  const handleClearData = () => {
    if (session?.username) {
      localStorage.removeItem(`tweets_${session.username}`)
      setTweets([])
    }
  }

  const handleCloseModal = () => {
    if (loading) {
      console.log('Closing modal and cancelling scraping...')
      handleCancelScraping()
    }
    setShowComplete(false)
  }

  return (
    <main className="min-h-screen bg-black text-red-500 font-mono flex">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl border-2 border-red-500/30 rounded-sm p-6 bg-black/90 shadow-2xl backdrop-blur-sm">
          <div className="mb-6 border-b border-red-500/30 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <h3 className="text-lg font-bold text-red-500 tracking-wider">TERMINAL SESSION</h3>
            </div>
            
            {session ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-red-500">@{session.username}</span>
                </div>
                <button
                  onClick={handleScrape}
                  disabled={loading}
                  className="px-4 py-2 bg-red-500/10 text-red-500 border border-red-500 rounded-sm hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors uppercase tracking-wider text-sm"
                >
                  {loading ? 'SCRAPING...' : 'INITIATE SCRAPE'}
                </button>
                {tweets.length > 0 && (
                  <>
                    <button
                      onClick={handleClearData}
                      className="px-4 py-2 border border-red-500/50 text-red-500/70 rounded-sm hover:bg-red-500/10 transition-colors uppercase tracking-wider text-sm"
                    >
                      CLEAR DATA
                    </button>
                  </>
                )}
                <button
                  onClick={() => signOut()}
                  className="px-4 py-2 border border-red-500/50 text-red-500/70 rounded-sm hover:bg-red-500/10 transition-colors uppercase tracking-wider text-sm"
                >
                  TERMINATE SESSION
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn('twitter')}
                className="px-4 py-2 bg-red-500/10 text-red-500 border border-red-500 rounded-sm hover:bg-red-500/20 transition-colors uppercase tracking-wider text-sm"
              >
                ESTABLISH CONNECTION
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500 rounded-sm">
              <div className="flex items-center gap-2">
                <div className="animate-pulse w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-red-500 uppercase tracking-wider">ERROR</span>
              </div>
              <div className="mt-2 text-red-400 font-normal">
                {error}
              </div>
            </div>
          )}

          <div className="space-y-1 font-mono text-sm max-h-[78vh] overflow-y-auto custom-scrollbar p-4 bg-black/50 border border-red-500/20 rounded-sm">
            {tweets.length === 0 && !loading && (
              <div className="text-red-500/70 italic">
                {'>'} Awaiting data collection initialization...
              </div>
            )}

            {loading && tweets.length === 0 && (
              <div className="text-red-500/70 flex items-center gap-2">
                <div className="animate-spin w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full"></div>
                <span>Initializing Data Stream...</span>
              </div>
            )}

            {tweets.map((tweet, index) => (
              <div 
                key={tweet.id} 
                className="text-red-400/90 flex gap-3 hover:bg-red-500/5 transition-colors py-1 px-2 rounded-sm"
              >
                <div className="text-red-500/70 select-none font-bold">[{String(index + 1).padStart(4, '0')}]</div>
                
                <div className="flex-1">
                  <div className="text-red-300">{tweet.text}</div>
                  <div className="text-red-500/50 text-xs flex items-center gap-2 mt-1">
                    <span>{tweet.timestamp && new Date(tweet.timestamp).toLocaleString()}</span>
                    {tweet.isReply && (
                      <>
                        <div className="w-1 h-1 rounded-full bg-red-500/30"></div>
                        <span>REPLY</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {tweets.length > 0 && (
              <div className="mt-4 pt-4 border-t border-red-500/20 text-red-500/70">
                {'>'} Collection Stats: {tweets.filter(t => !t.isReply).length} posts, {tweets.filter(t => t.isReply).length} replies
              </div>
            )}
          </div>

          {loading && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm">
              <div className="bg-black/90 p-8 rounded-sm shadow-2xl w-[500px] border-2 border-red-500 font-mono text-red-500">
                <div className="flex items-center justify-between mb-4 border-b border-red-500/30 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="animate-pulse w-3 h-3 rounded-full bg-red-500"></div>
                    <h3 className="text-lg font-bold tracking-wider">SCRAPING IN PROGRESS</h3>
                  </div>
                  <button
                    onClick={handleCancelScraping}
                    className="px-3 py-1 border border-red-500/50 text-red-500/70 rounded-sm hover:bg-red-500/10 transition-colors uppercase tracking-wider text-xs"
                  >
                    Cancel
                  </button>
                </div>
                
                <div className="space-y-2">
                  {scanProgress ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="animate-spin w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full"></div>
                        <span className="uppercase tracking-wider">
                          {scanProgress.phase === 'posts' ? 'Scanning Posts' : 'Scanning Replies'}
                        </span>
                      </div>
                      <div className="font-bold text-red-400">
                        Found {scanProgress.count} {scanProgress.phase}...
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full"></div>
                      <span className="uppercase tracking-wider">
                        {progress < 25 ? 'Initializing System' :
                         progress < 50 ? 'Loading Profile Data' :
                         progress < 75 ? 'Collecting Content' :
                         progress < 100 ? 'Processing Data' : 'Complete'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {showComplete && !loading && (
            <div 
              className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm"
              onClick={handleCloseModal}
            >
              <div 
                className="bg-black/90 p-8 rounded-sm shadow-2xl w-[500px] border-2 border-red-500 font-mono text-red-500"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4 border-b border-red-500/30 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <h3 className="text-lg font-bold tracking-wider">OPERATION COMPLETE</h3>
                  </div>
                  <button
                    onClick={handleCloseModal}
                    className="px-2 py-1 text-red-500/70 hover:text-red-500 transition-colors"
                  >
                    ×
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div className="text-red-400">
                    <p className="uppercase tracking-wider mb-2">Data Collection Summary:</p>
                    <ul className="list-disc pl-5 space-y-1 text-red-300">
                      <li>{tweets.filter(t => !t.isReply).length} posts collected</li>
                      <li>{tweets.filter(t => t.isReply).length} replies collected</li>
                      <li>Total items: {tweets.length}</li>
                    </ul>
                  </div>
                  
                  <div className="flex justify-end">
                    <button
                      onClick={handleCloseModal}
                      className="px-4 py-2 bg-red-500/10 text-red-500 border border-red-500 rounded-sm hover:bg-red-500/20 transition-colors uppercase tracking-wider text-sm"
                    >
                      Close Terminal
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showConsent && (
            <div 
              className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm"
              onClick={() => {
                setShowConsent(false)
                if (loading) handleCancelScraping()
              }}
            >
              <div 
                className="bg-black/90 p-8 rounded-sm shadow-2xl w-[500px] border-2 border-red-500"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-4 border-b border-red-500/30 pb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <h3 className="text-lg font-bold text-red-500 tracking-wider">SYSTEM AUTHORIZATION REQUIRED</h3>
                </div>
                <div className="space-y-4 text-red-400">
                  <p className="uppercase tracking-wider">
                    This operation will collect the following data:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-red-300">
                    <li>Profile metrics and identifiers</li>
                    <li>Recent transmission logs</li>
                    <li>Associated media content</li>
                  </ul>
                  <p className="text-red-300">
                    Estimated operation time: 1-2 minutes. Maintain connection stability during the process.
                  </p>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowConsent(false)}
                    className="px-4 py-2 border border-red-500/50 text-red-500 rounded-sm hover:bg-red-500/10 transition-colors uppercase tracking-wider text-sm"
                  >
                    Abort
                  </button>
                  <button
                    onClick={startScraping}
                    className="px-4 py-2 bg-red-500/10 text-red-500 border border-red-500 rounded-sm hover:bg-red-500/20 transition-colors uppercase tracking-wider text-sm"
                  >
                    Authorize
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ChatBox
        tweets={tweets}
        profile={scrapedData?.profile || {
          name: session?.username || null,
          bio: null,
          followersCount: null,
          followingCount: null
        }}
        onClose={() => {}}
      />
    </main>
  )
}
