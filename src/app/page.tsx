'use client'

import { useState } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'

interface Tweet {
  id: string
  text: string | null
  timestamp: string | null
  isReply: boolean
}

interface ScanProgress {
  phase: 'posts' | 'replies'
  count: number
}

export default function Home() {
  const { data: session } = useSession()
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [showConsent, setShowConsent] = useState(false)

  const handleScrape = async () => {
    setShowConsent(true)
  }

  const startScraping = async () => {
    setShowConsent(false)
    setLoading(true)
    setError(null)
    setProgress(0)
    setTweets([])

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
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
                setTweets(prev => [...prev, ...data.tweets])
              }

              if (data.type === 'complete') {
                setLoading(false)
                setScanProgress(null)
              }
            } catch (e) {
              console.error('Failed to parse:', line, e)
            }
          }
        }
      }
    } catch (error) {
      console.error('Scraping error:', error)
      setError(error instanceof Error ? error.message : 'Failed to start scraping')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-black text-red-500 font-mono p-8">
      <div className="container mx-auto">
        <div className="mb-8 border-b border-red-500/30 pb-4">
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

        <div className="space-y-4">
          {tweets.map((tweet) => (
            <div key={tweet.id} className="p-4 border border-red-500/30 rounded-sm hover:bg-red-500/5 transition-colors">
              <p className="text-red-300">{tweet.text}</p>
              <div className="text-sm text-red-500/70 mt-2 flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-red-500/70"></div>
                {tweet.timestamp && new Date(tweet.timestamp).toLocaleString()}
                {tweet.isReply && (
                  <>
                    <div className="w-1 h-1 rounded-full bg-red-500/70"></div>
                    <span>REPLY</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {loading && tweets.length === 0 && (
          <div className="text-center text-red-500/70 uppercase tracking-wider">
            Initializing Data Stream...
          </div>
        )}

        {loading && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-black/90 p-8 rounded-sm shadow-2xl w-[500px] border-2 border-red-500 font-mono text-red-500">
              <div className="flex items-center gap-2 mb-4 border-b border-red-500/30 pb-4">
                <div className="animate-pulse w-3 h-3 rounded-full bg-red-500"></div>
                <h3 className="text-lg font-bold tracking-wider">SCRAPING IN PROGRESS</h3>
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
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full"></div>
                      <span className="uppercase tracking-wider">
                        {progress < 25 ? 'Initializing System' :
                         progress < 50 ? 'Loading Profile Data' :
                         progress < 75 ? 'Collecting Content' :
                         progress < 100 ? 'Processing Data' : 'Complete'}
                      </span>
                    </div>
                    <div className="w-full bg-red-500/20 h-1">
                      <div 
                        className="bg-red-500 h-1 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showConsent && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-black/90 p-8 rounded-sm shadow-2xl w-[500px] border-2 border-red-500">
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
    </main>
  )
}
