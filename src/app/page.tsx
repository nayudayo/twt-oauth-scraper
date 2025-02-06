'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import ChatBox from '@/components/ChatBox'
import { TerminalModal } from '@/components/TerminalModal'
import { Tweet } from '@/types/scraper'

export default function Home() {
  const { data: session, status } = useSession()
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [terminalComplete, setTerminalComplete] = useState(false)
  const [showContent, setShowContent] = useState(false)

  // Fetch tweets when session is available
  useEffect(() => {
    const fetchTweets = async () => {
      if (session?.username) {
        try {
          // First try to get from localStorage
          const cachedTweets = localStorage.getItem(`tweets_${session.username}`)
          if (cachedTweets) {
            const parsedTweets = JSON.parse(cachedTweets)
            if (Array.isArray(parsedTweets) && parsedTweets.length > 0) {
              console.log('Using cached tweets:', {
                count: parsedTweets.length,
                source: 'localStorage'
              })
              setTweets(parsedTweets)
              return
            }
          }

          // If no cache, fetch from API
          const response = await fetch(`/api/tweets?username=${session.username}`)
          if (!response.ok) throw new Error('Failed to fetch tweets')
          const data = await response.json()
          if (data.tweets?.length > 0) {
            console.log('Fetched tweets from API:', {
              count: data.tweets.length,
              source: 'database'
            })
          setTweets(data.tweets)
            // Update cache
            try {
              localStorage.setItem(`tweets_${session.username}`, JSON.stringify(data.tweets))
            } catch (err) {
              console.warn('Failed to cache tweets:', err)
            }
          }
        } catch (error) {
          console.error('Error fetching tweets:', error)
        }
      }
    }

    fetchTweets()
  }, [session?.username])

  // Reset terminal state when session changes
  useEffect(() => {
    if (!session) {
      setTerminalComplete(false)
      setShowContent(false)
    }
  }, [session])

  // Handle terminal completion
  const handleTerminalComplete = () => {
    setTerminalComplete(true)
    // Small delay to ensure terminal fade out starts first
    setTimeout(() => setShowContent(true), 100)
  }

  // Handle tweet updates
  const handleTweetsUpdate = (newTweets: Tweet[]) => {
    console.log('Updating tweets in parent:', {
      oldCount: tweets.length,
      newCount: newTweets.length
    })
    setTweets(newTweets)
    // Update cache
    if (session?.username) {
      try {
        localStorage.setItem(`tweets_${session.username}`, JSON.stringify(newTweets))
      } catch (err) {
        console.warn('Failed to cache updated tweets:', err)
      }
    }
  }

  // Show loading state while checking session
  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-black via-red-950/20 to-black text-red-500 font-mono flex">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-32 h-32 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
        </div>
      </main>
    )
  }

  // Show sign in button if not authenticated
  if (!session) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-black via-red-950/20 to-black text-red-500 font-mono flex">
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => signIn('twitter')}
            className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
          >
            ESTABLISH CONNECTION
          </button>
        </div>
      </main>
    )
  }

  // Show terminal if authenticated but not completed
  if (!terminalComplete) {
    return <TerminalModal onComplete={handleTerminalComplete} />
  }

  // Show main content after terminal completion
  return (
    <main className={`min-h-screen bg-gradient-to-br from-black via-red-950/20 to-black text-red-500 font-mono flex ${showContent ? 'animate-fadeIn' : 'opacity-0'}`}>
      <div className="flex-1 flex items-center justify-center p-3">
        <ChatBox
          tweets={tweets}
          profile={{
            name: session.username || null,
            bio: null,
            followersCount: null,
            followingCount: null,
            imageUrl: session.user?.image || null
          }}
          onClose={() => signIn('twitter')}
          onTweetsUpdate={handleTweetsUpdate}
        />
      </div>
    </main>
  )
}
