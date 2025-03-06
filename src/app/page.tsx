'use client'

import { useState, useEffect, Dispatch, SetStateAction } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import ChatBox from '@/components/ChatBox'
import { TerminalModal } from '@/components/TerminalModal'
import { AccessCodeModal } from '@/components/AccessCodeModal'
import { Tweet } from '@/types/scraper'

export default function Home() {
  const { data: session, status } = useSession()
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [terminalComplete, setTerminalComplete] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const [accessVerified, setAccessVerified] = useState(false)
  const [isCheckingAccess, setIsCheckingAccess] = useState(true)

  // Check access code status when session is available
  useEffect(() => {
    const checkAccessStatus = async () => {
      if (session?.username) {
        try {
          setIsCheckingAccess(true)
          const response = await fetch('/api/access-code/status')
          const data = await response.json()
          
          if (data.success && data.isVerified) {
            setAccessVerified(true)
          }
        } catch (error) {
          console.error('Error checking access status:', error)
        } finally {
          setIsCheckingAccess(false)
        }
      } else {
        setIsCheckingAccess(false)
      }
    }

    checkAccessStatus()
  }, [session?.username])

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

  // Reset states when session changes
  useEffect(() => {
    if (!session) {
      setTerminalComplete(false)
      setShowContent(false)
      setAccessVerified(false)
      setTweets([])
      // Clear any cached data
      localStorage.removeItem('twitter-oauth-state')
      sessionStorage.clear()
    }
  }, [session])

  // Handle terminal completion
  const handleTerminalComplete = () => {
    setTerminalComplete(true)
    // Small delay to ensure terminal fade out starts first
    setTimeout(() => setShowContent(true), 100)
  }

  // Handle access code verification
  const handleAccessVerified = () => {
    setAccessVerified(true)
  }

  // Handle tweet updates with detailed logging
  const handleTweetsUpdate: Dispatch<SetStateAction<Tweet[]>> = (updater) => {
    // Always treat as a function update since we're streaming
    const newTweets = typeof updater === 'function' ? updater(tweets) : updater
    
    // Skip update if tweets are the same
    if (newTweets === tweets || 
        (newTweets.length === tweets.length && 
         newTweets.every((t, i) => t.id === tweets[i].id))) {
      return;
    }
    
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

  // Handle session termination with cleanup
  const handleTerminateSession = async () => {
    try {
      // First revoke the Twitter OAuth token
      await fetch('/api/auth/revoke', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('Failed to revoke token:', error)
      // Continue with logout even if revocation fails
    }

    // Sign out from NextAuth
    await signOut({ redirect: false })
    
    // Clear local state
    setTerminalComplete(false)
    setShowContent(false)
    setAccessVerified(false)
    setTweets([])

    // Clear any cached data
    localStorage.removeItem('twitter-oauth-state')
    sessionStorage.clear()
  }

  // Show loading state while checking session or access status
  if (status === 'loading' || isCheckingAccess) {
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

  // Show access code modal if authenticated but not verified
  if (!accessVerified) {
    return <AccessCodeModal onValidated={handleAccessVerified} />
  }

  // Show terminal if verified but not completed
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
            name: session?.username || null,
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
