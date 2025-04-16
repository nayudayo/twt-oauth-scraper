'use client'

import React from 'react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'

export const ShareCard = () => {
  const { data: session } = useSession()

  return (
    <div className="relative w-[800px] h-[400px] bg-black/90 overflow-hidden">
      {/* Outer border */}
      <div className="absolute inset-[12px] border-[3px] border-red-900/80 rounded-lg">
        {/* Inner border */}
        <div className="absolute inset-[3px] border border-red-900/60 rounded-md">
          {/* Content container */}
          <div className="absolute inset-0 bg-gradient-to-br from-red-950/20 to-red-900/10">
            {/* Header */}
            <div className="w-full px-6 py-3 border-b border-red-900/30">
              <h1 className="text-3xl font-bold tracking-wider text-red-600/90 font-mono">
                AI CLONE CARD
              </h1>
            </div>

            {/* Main content grid */}
            <div className="grid grid-cols-3 gap-4 p-4 h-[calc(100%-60px)]">
              {/* Avatar section */}
              <div className="bg-red-950/30 rounded-lg p-2">
                <div className="w-full aspect-square bg-red-950/50 rounded-lg border border-red-900/60 overflow-hidden">
                  {session?.user?.image ? (
                    <Image
                      src={session.user.image}
                      alt={session?.username || 'AI Clone'}
                      width={400}
                      height={400}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-24 h-24 bg-red-800/50 rounded-lg flex flex-col items-center justify-center">
                        <div className="w-4 h-4 bg-red-600 rounded-full mb-2"></div>
                        <div className="w-8 h-1 bg-red-600"></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 