'use client'

import { useState, useEffect, Dispatch, SetStateAction } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
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
          // Fetch from API using the correct endpoint
          const response = await fetch(`/api/tweets/${session.username}/all`)
          if (!response.ok) throw new Error('Failed to fetch tweets')
          const data = await response.json()
          if (Array.isArray(data) && data.length > 0) {
            console.log('Fetched tweets from API:', {
              count: data.length,
              source: 'database'
            })
            setTweets(data)
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

  // Handle session termination
  const handleTerminateSession = async () => {
    await signOut({ redirect: false })
    setTerminalComplete(false)
    setShowContent(false)
    setTweets([])
  }

  // Handle tweet updates
  const handleTweetsUpdate: Dispatch<SetStateAction<Tweet[]>> = (updater) => {
    // Always treat as a function update since we're streaming
    const newTweets = typeof updater === 'function' ? updater(tweets) : updater
    
    // Log the update for debugging
    console.log('Tweet update:', {
      type: typeof updater === 'function' ? 'function' : 'direct',
      oldCount: tweets.length,
      newCount: newTweets.length,
      hasNulls: newTweets.some(t => t === null),
      firstTweet: newTweets[0]?.id,
      lastTweet: newTweets[newTweets.length - 1]?.id
    })
    
    // Update state
    setTweets(newTweets)
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

  // Show main content
  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-red-950/20 to-black text-red-500 font-mono">
      {showContent && (
        <ChatBox
          tweets={tweets}
          profile={{
            name: session?.user?.name || null,
            imageUrl: session?.user?.image || null,
            bio: null,
            followersCount: null,
            followingCount: null
          }}
          onClose={handleTerminateSession}
          onTweetsUpdate={handleTweetsUpdate}
        />
      )}
    </main>
  )
}
