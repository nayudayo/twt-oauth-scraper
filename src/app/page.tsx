'use client'

import { useState } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'

interface Tweet {
  id: string
  text: string | null
  timestamp: string | null
  isReply: boolean
}

export default function Home() {
  const { data: session } = useSession()
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
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

              if (data.tweets) {
                setTweets(prev => [...prev, ...data.tweets])
              }

              if (data.type === 'complete') {
                setLoading(false)
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
    <main className="container mx-auto p-4">
      <div className="mb-8">
        {session ? (
          <div className="flex items-center gap-4 mb-4">
            <span>@{session.username}</span>
            <button
              onClick={handleScrape}
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
            >
              {loading ? 'Scraping...' : 'Start Scraping'}
            </button>
            <button
              onClick={() => signOut()}
              className="px-4 py-2 border rounded"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn('twitter')}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            Login with Twitter
          </button>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-md border border-red-100">
            Error: {error}
          </div>
        )}

        {loading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white p-6 rounded-lg shadow-xl w-[400px] border border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Scraping Profile</h3>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-600 mt-3">
                {progress < 25 ? 'Preparing...' :
                 progress < 50 ? 'Loading profile data...' :
                 progress < 75 ? 'Collecting tweets...' :
                 progress < 100 ? 'Processing data...' : 'Complete!'}
              </p>
            </div>
          </div>
        )}
      </div>

      {showConsent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white p-6 rounded-lg shadow-xl w-[400px] border border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Consent Required</h3>
            <div className="text-sm text-gray-600 space-y-4">
              <p>
                This tool will collect the following data from your Twitter profile:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Profile information (name, bio, follower counts)</li>
                <li>Recent tweets and their metrics</li>
                <li>Public media from your tweets</li>
              </ul>
              <p>
                The process will take approximately 1-2 minutes. Please keep the window open during the process.
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowConsent(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={startScraping}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                I Agree
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {tweets.map((tweet) => (
          <div key={tweet.id} className="py-2 border-b">
            <p>{tweet.text}</p>
            <div className="text-sm text-gray-500 mt-1">
              {tweet.timestamp && new Date(tweet.timestamp).toLocaleString()}
              {tweet.isReply && ' • Reply'}
            </div>
          </div>
        ))}
      </div>

      {loading && tweets.length === 0 && (
        <p className="text-center text-gray-600">Loading tweets...</p>
      )}
    </main>
  )
}
