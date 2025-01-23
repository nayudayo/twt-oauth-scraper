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
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [showConsent, setShowConsent] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [scrapedData, setScrapedData] = useState<ScrapedData | null>(null)
  const [scanId] = useState(() => Math.random().toString(36).substring(7))

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
    setShowComplete(false)
    // Clean up progress data
    localStorage.removeItem(`scan_progress_${scanId}`)
  }

  const startScraping = async () => {
    setShowConsent(false)
    setLoading(true)
    setError(null)
    setTweets([]) // Clear existing tweets before new scrape
    setShowComplete(false)

    // Create new AbortController for this scraping session
    const controller = new AbortController()
    setAbortController(controller)

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'X-Scan-ID': scanId
        },
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
                // Store progress with unique scan ID
                const progressKey = `scan_progress_${scanId}`
                const currentProgress = JSON.parse(localStorage.getItem(progressKey) || '{}')
                const newProgress = {
                  ...currentProgress,
                  phase: data.phase,
                  count: data.scanCount
                }
                localStorage.setItem(progressKey, JSON.stringify(newProgress))
                
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

  // Add cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up progress data when component unmounts
      localStorage.removeItem(`scan_progress_${scanId}`)
    }
  }, [scanId])

  // Add cleanup when scraping completes
  useEffect(() => {
    if (showComplete) {
      // Clean up progress data when scraping completes
      localStorage.removeItem(`scan_progress_${scanId}`)
    }
  }, [showComplete, scanId])

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-red-950/20 to-black text-red-500 font-mono flex">
      <div className="flex-1 flex items-center justify-center p-3">
        <div className="w-full max-w-4xl h-[96vh] backdrop-blur-md bg-black/40 border border-red-500/10 rounded-lg shadow-2xl hover-glow">
          <div className="flex flex-col h-full bg-transparent">
            <div className="flex items-center justify-between px-6 py-4 bg-black/40 backdrop-blur-sm border-b border-red-500/10 rounded-t-lg glow-border">
              {/* Left side */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                  <h3 className="text-sm font-bold text-red-500/90 tracking-wider glow-text">TERMINAL SESSION</h3>
                </div>

                {session && (
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                    <span className="text-xs text-red-500/80 hover-text-glow">@{session.username}</span>
                  </div>
                )}

                {/* Progress Status - Always present container */}
                <div className="h-6 flex items-center gap-2 text-red-500/60 min-w-[200px]">
                  {loading && (
                    <>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20 glow-box"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-100 shadow-lg shadow-red-500/20 glow-box"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-200 shadow-lg shadow-red-500/20 glow-box"></div>
                      </div>
                      {scanProgress && (
                        <span className="uppercase tracking-wider text-xs glow-text">
                          {scanProgress.phase === 'posts' ? 'SCANNING POSTS' : 'SCANNING REPLIES'}: {scanProgress.count}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Right side - Action Buttons */}
              <div className="flex items-center gap-2">
                {session ? (
                  <>
                    <button
                      onClick={loading ? handleCancelScraping : handleScrape}
                      className="px-3 py-1.5 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
                    >
                      {loading ? 'CANCEL' : 'INITIATE SCRAPE'}
                    </button>

                    {tweets.length > 0 && (
                      <button
                        onClick={handleClearData}
                        className="px-3 py-1.5 border border-red-500/20 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs hover-glow"
                      >
                        CLEAR DATA
                      </button>
                    )}

                    <button
                      onClick={() => signOut()}
                      className="px-3 py-1.5 border border-red-500/20 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs hover-glow"
                    >
                      TERMINATE SESSION
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => signIn('twitter')}
                    className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
                  >
                    ESTABLISH CONNECTION
                  </button>
                )}
              </div>
            </div>
            
            {/* Terminal Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar backdrop-blur-sm bg-black/20 dynamic-bg">
              <div className="space-y-2">
                {tweets.length === 0 && !loading && (
                  <div className="text-red-500/50 italic glow-text">
                    {'>'} Awaiting data collection initialization...
                  </div>
                )}

                {loading && tweets.length === 0 && (
                  <div className="text-red-500/60 flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20 glow-box"></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-100 shadow-lg shadow-red-500/20 glow-box"></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-200 shadow-lg shadow-red-500/20 glow-box"></div>
                    </div>
                    <span className="glow-text">Initializing Data Stream...</span>
                  </div>
                )}

                {tweets.map((tweet, index) => (
                  <div 
                    key={tweet.id} 
                    className="text-red-400/80 flex gap-3 hover:bg-red-500/5 transition-all duration-300 py-2 px-3 rounded backdrop-blur-sm border border-transparent hover:border-red-500/10 hover-glow float"
                  >
                    <div className="text-red-500/50 select-none font-bold glow-text">[{String(index + 1).padStart(4, '0')}]</div>
                    
                    <div className="flex-1">
                      <div className="text-red-300/90 hover-text-glow">{tweet.text}</div>
                      <div className="text-red-500/40 text-xs flex items-center gap-2 mt-1.5">
                        <span>{tweet.timestamp && new Date(tweet.timestamp).toLocaleString()}</span>
                        {tweet.isReply && (
                          <>
                            <div className="w-1 h-1 rounded-full bg-red-500/20 glow-box"></div>
                            <span className="glow-text">REPLY</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {tweets.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-red-500/10 text-red-500/60 backdrop-blur-sm glow-border">
                    {'>'} Collection Stats: {tweets.filter(t => !t.isReply).length} posts, {tweets.filter(t => t.isReply).length} replies
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="absolute bottom-0 left-0 right-0 backdrop-blur-md bg-black/40 border-t border-red-500/20 rounded-b-lg overflow-hidden glow-border">
              <div className="p-3 bg-red-500/5">
                <div className="flex items-center gap-2">
                  <div className="animate-pulse w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                  <span className="text-red-500/90 uppercase tracking-wider text-xs glow-text">ERROR</span>
                </div>
                <div className="mt-1 text-red-400/90 font-normal text-sm hover-text-glow">
                  {error}
                </div>
              </div>
            </div>
          )}

          {showComplete && !loading && (
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center"
              onClick={handleCloseModal}
            >
              <div 
                className="bg-black/40 backdrop-blur-md p-8 rounded-lg shadow-2xl w-[500px] border border-red-500/20 hover-glow float"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4 border-b border-red-500/20 pb-4 glow-border">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                    <h3 className="text-lg font-bold tracking-wider text-red-500/90 glow-text">OPERATION COMPLETE</h3>
                  </div>
                  <button
                    onClick={handleCloseModal}
                    className="text-red-500/70 hover:text-red-500/90 transition-colors hover-text-glow"
                  >
                    <span className="sr-only">Close</span>
                    ×
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="text-red-400/90">
                    <p className="uppercase tracking-wider mb-2 glow-text">Data Collection Summary:</p>
                    <ul className="list-disc pl-5 space-y-1 text-red-300/80">
                      <li className="hover-text-glow">{tweets.filter(t => !t.isReply).length} posts collected</li>
                      <li className="hover-text-glow">{tweets.filter(t => t.isReply).length} replies collected</li>
                      <li className="hover-text-glow">Total items: {tweets.length}</li>
                    </ul>
                  </div>
                  
                  <div className="flex justify-end">
                    <button
                      onClick={handleCloseModal}
                      className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
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
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center"
              onClick={() => {
                setShowConsent(false)
                if (loading) handleCancelScraping()
              }}
            >
              <div 
                className="bg-black/40 backdrop-blur-md p-8 rounded-lg shadow-2xl w-[500px] border border-red-500/20 hover-glow float"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-4 border-b border-red-500/20 pb-4 glow-border">
                  <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                  <h3 className="text-lg font-bold text-red-500/90 tracking-wider glow-text">SYSTEM AUTHORIZATION REQUIRED</h3>
                </div>
                <div className="space-y-4 text-red-400/90">
                  <p className="uppercase tracking-wider glow-text">
                    This operation will collect the following data:
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-red-300/80">
                    <li className="hover-text-glow">Profile metrics and identifiers</li>
                    <li className="hover-text-glow">Recent transmission logs</li>
                    <li className="hover-text-glow">Associated media content</li>
                  </ul>
                  <p className="text-red-300/80 hover-text-glow">
                    Estimated operation time: 1-2 minutes. Maintain connection stability during the process.
                  </p>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowConsent(false)}
                    className="px-4 py-2 border border-red-500/20 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs hover-glow"
                  >
                    Abort
                  </button>
                  <button
                    onClick={startScraping}
                    className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
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
