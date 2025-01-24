'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import ChatBox from '@/components/ChatBox'
import { Tweet } from '@/types/scraper'

export default function Home() {
  const { data: session } = useSession()
  const [tweets, setTweets] = useState<Tweet[]>([])

  // Fetch tweets when session is available
  useEffect(() => {
    const fetchTweets = async () => {
      if (session?.username) {
        try {
          const response = await fetch(`/api/tweets?username=${session.username}`)
          if (!response.ok) throw new Error('Failed to fetch tweets')
          const data = await response.json()
          setTweets(data.tweets)
        } catch (error) {
          console.error('Error fetching tweets:', error)
        }
      }
    }

    fetchTweets()
  }, [session?.username])

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-red-950/20 to-black text-red-500 font-mono flex">
      <div className="flex-1 flex items-center justify-center p-3">
        {session ? (
          <ChatBox
            tweets={tweets}
            profile={{
              name: session.username || null,
              bio: null,
              followersCount: null,
              followingCount: null
            }}
            onClose={() => signIn('twitter')}
            onTweetsUpdate={setTweets}
          />
        ) : (
          <button
            onClick={() => signIn('twitter')}
            className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
          >
            ESTABLISH CONNECTION
          </button>
        )}
      </div>
    </main>
  )
}
