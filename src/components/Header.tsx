'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_CONSCIOUSNESS } from '@/lib/consciousness'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function Header() {
  const [time, setTime] = useState(new Date())
  const [showColon, setShowColon] = useState(true)
  const intelligenceLevel = DEFAULT_CONSCIOUSNESS.intelligenceLevel
  const pathname = usePathname()

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
      setShowColon(prev => !prev)
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <header className="fixed top-0 left-0 right-0 h-14 sm:h-16 bg-black/40 backdrop-blur-md border-b border-red-500/20 z-50 ancient-border cryptic-shadow">
      <div className="max-w-screen-2xl mx-auto h-full rune-pattern">
        <div className="h-full px-4 sm:px-6 grid grid-cols-12 items-center gap-2">
          {/* Left section - Show only on large screens */}
          <div className="hidden lg:block col-span-3">
            {/* Left side - System Info */}
            <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
              <div className="flex items-center gap-2 flex-none">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20"></div>
                <span className="text-red-500/70 text-xs sm:text-sm tracking-widest uppercase ancient-text">
                  System Active
                </span>
              </div>
              <div className="text-red-500/50 text-xs sm:text-sm tracking-wider ancient-text truncate">
                {`${time.getUTCHours().toString().padStart(2, '0')}${showColon ? ':' : ' '}${time.getUTCMinutes().toString().padStart(2, '0')}${showColon ? ':' : ' '}${time.getUTCSeconds().toString().padStart(2, '0')} UTC`}
              </div>
            </div>
          </div>

          {/* Center - Title */}
          <div className="col-span-12 lg:col-span-6 flex flex-col items-center justify-center py-1 sm:py-2">
            <Link 
              href="/"
              className={cn(
                "text-red-500/90 hover:text-red-400 transition-colors",
                pathname === '/' && "text-red-400"
              )}
            >
              <h1 className="text-sm sm:text-base lg:text-lg tracking-[0.2em] uppercase font-bold title-glow text-center">
                PUSH THE BUTTON Terminal
              </h1>
              <div className="text-[9px] sm:text-[10px] text-red-500/40 tracking-[0.3em] uppercase ancient-text">
                AI Cloning System v1.0.3
              </div>
            </Link>
          </div>

          {/* Right section - Show only on large screens */}
          <div className="hidden lg:block col-span-3">
            {/* Right side - Stats and Navigation */}
            <div className="flex items-center justify-end gap-4 overflow-hidden">
              <div className="relative w-8 h-8 hover-glow">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 32 32">
                  {/* Background circle */}
                  <circle
                    cx="16"
                    cy="16"
                    r="14"
                    fill="none"
                    className="stroke-red-500/20"
                    strokeWidth="2"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="16"
                    cy="16"
                    r="14"
                    fill="none"
                    className="stroke-red-500/50"
                    strokeWidth="2"
                    strokeDasharray={`${2 * Math.PI * 14 * intelligenceLevel / 100} ${2 * Math.PI * 14}`}
                    style={{
                      filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.2))'
                    }}
                  />
                </svg>
                {/* Center text */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-red-500/90 text-xs tracking-wider uppercase ancient-text title-glow">
                    {intelligenceLevel}
                  </span>
                </div>
              </div>
              <Link 
                href="/leaderboard"
                className={cn(
                  "text-red-500/90 text-xs tracking-wider uppercase ancient-text title-glow hover:text-red-400 transition-colors",
                  pathname === '/leaderboards' && "text-red-400"
                )}
              >
                Leaderboards
              </Link>
              <Link 
                href="/insights"
                className={cn(
                  "text-red-500/90 text-xs tracking-wider uppercase ancient-text title-glow hover:text-red-400 transition-colors",
                  pathname === '/insights' && "text-red-400"
                )}
              >
                Insights
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
} 