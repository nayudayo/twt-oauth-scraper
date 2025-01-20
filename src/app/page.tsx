'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useState } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import type { ScrapedData } from '@/types/scraper'

export default function Home() {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ScrapedData | null>(null)
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

              if (data.data) {
                setData(data.data)
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
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <Card className="w-[600px] border-gray-200 shadow-lg">
        <CardHeader className="border-b border-gray-100 bg-white">
          <CardTitle className="text-2xl font-bold text-gray-900">Twitter Profile Scraper</CardTitle>
          <CardDescription className="text-gray-600">
            {session ? 'Click the button below to start scraping' : 'Login with Twitter to start scraping'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6 bg-white">
          {session ? (
            <>
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-700">
                  Logged in as: <span className="font-semibold text-gray-900">@{session.username}</span>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => signOut()}
                  className="text-sm border-gray-300 hover:bg-gray-50"
                >
                  Logout
                </Button>
              </div>

              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleScrape}
                disabled={loading}
              >
                {loading ? 'Scraping...' : 'Start Scraping'}
              </Button>
            </>
          ) : (
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => signIn('twitter')}
            >
              Login with Twitter
            </Button>
          )}
          
          {error && (
            <div className="text-red-600 text-sm p-4 bg-red-50 rounded-md border border-red-100">
              Error: {error}
            </div>
          )}

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
                  <Button
                    variant="outline"
                    onClick={() => setShowConsent(false)}
                    className="border-gray-300 hover:bg-gray-50"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={startScraping}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    I Agree
                  </Button>
                </div>
              </div>
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

          {data && (
            <div className="mt-6 space-y-6">
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Profile</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Name:</span>{' '}
                    <span className="text-gray-900">{data.profile.name}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Followers:</span>{' '}
                    <span className="text-gray-900">{data.profile.followersCount}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Following:</span>{' '}
                    <span className="text-gray-900">{data.profile.followingCount}</span>
                  </div>
                  {data.profile.bio && (
                    <div className="col-span-2">
                      <span className="font-medium text-gray-700">Bio:</span>{' '}
                      <span className="text-gray-900">{data.profile.bio}</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Recent Tweets</h3>
                <div className="max-h-[400px] overflow-y-auto space-y-4">
                  {data.tweets.map((tweet, index) => (
                    <div 
                      key={tweet.id || index} 
                      className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-100"
                    >
                      <p className="text-sm text-gray-900 mb-3">{tweet.text}</p>
                      {tweet.images && tweet.images.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {tweet.images.map((src, i) => (
                            <img 
                              key={i} 
                              src={src || ''} 
                              alt="Tweet media" 
                              className="rounded-md w-full border border-gray-200"
                            />
                          ))}
                        </div>
                      )}
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>{new Date(tweet.timestamp || '').toLocaleDateString()}</span>
                        <span>❤️ {tweet.metrics?.likes || '0'}</span>
                        <span>🔄 {tweet.metrics?.retweets || '0'}</span>
                        {tweet.metrics?.views && <span>👁️ {tweet.metrics.views}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
