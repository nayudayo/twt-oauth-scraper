'use client'

import { useEffect, useState } from 'react'

export function Header() {
  const [time, setTime] = useState(new Date())
  const [showColon, setShowColon] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
      setShowColon(prev => !prev)
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <header className="fixed top-0 left-0 right-0 h-12 bg-black/40 backdrop-blur-md border-b border-red-500/20 z-50 ancient-border cryptic-shadow">
      <div className="max-w-screen-2xl mx-auto h-full rune-pattern">
        <div className="h-full px-4 grid grid-cols-12 items-center">
          {/* Left side - System Info */}
          <div className="col-span-12 sm:col-span-4 lg:col-span-3 flex items-center gap-4 overflow-hidden">
            <div className="flex items-center gap-2 flex-none">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20"></div>
              <span className="text-red-500/70 text-sm tracking-widest uppercase ancient-text hidden sm:inline">System Active</span>
            </div>
            <div className="text-red-500/50 text-sm tracking-wider ancient-text truncate">
              {`${time.getUTCHours().toString().padStart(2, '0')}${showColon ? ':' : ' '}${time.getUTCMinutes().toString().padStart(2, '0')}${showColon ? ':' : ' '}${time.getUTCSeconds().toString().padStart(2, '0')} UTC`}
            </div>
          </div>

          {/* Center - Title */}
          <div className="col-span-12 sm:col-span-4 lg:col-span-6 flex flex-col items-center justify-center py-2 sm:py-0">
            <h1 className="text-red-500/90 text-base sm:text-lg tracking-[0.2em] uppercase font-bold title-glow text-center truncate">
              PUSH THE BUTTON Terminal
            </h1>
            <div className="text-[10px] text-red-500/40 tracking-[0.3em] uppercase ancient-text hidden sm:block">
              AI Cloning System v1.0.3
            </div>
          </div>

          {/* Right side - Status */}
          <div className="col-span-12 sm:col-span-4 lg:col-span-3 flex items-center justify-end gap-4 overflow-hidden">
            <div className="flex items-center gap-2 hover-glow">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div>
              <span className="text-red-500/50 text-xs tracking-wider uppercase ancient-text hidden sm:inline">Memory: 47%</span>
            </div>
            <div className="flex items-center gap-2 hover-glow hidden md:flex">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div>
              <span className="text-red-500/50 text-xs tracking-wider uppercase ancient-text">CPU: 12%</span>
            </div>
            <div className="flex items-center gap-2 hover-glow hidden lg:flex">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div>
              <span className="text-red-500/50 text-xs tracking-wider uppercase ancient-text">Network: 89%</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
} 