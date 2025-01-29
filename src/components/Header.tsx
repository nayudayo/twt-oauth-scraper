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
    <header className="fixed top-0 left-0 right-0 h-12 bg-black/40 backdrop-blur-md border-b border-red-500/20 z-50">
      <div className="max-w-screen-2xl mx-auto px-4 h-full flex items-center justify-between">
        {/* Left side - System Info */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20"></div>
            <span className="font-mono text-red-500/70 text-sm tracking-widest uppercase">System Active</span>
          </div>
          <div className="font-mono text-red-500/50 text-sm tracking-wider">
            {`${time.getUTCHours().toString().padStart(2, '0')}${showColon ? ':' : ' '}${time.getUTCMinutes().toString().padStart(2, '0')}${showColon ? ':' : ' '}${time.getUTCSeconds().toString().padStart(2, '0')} UTC`}
          </div>
        </div>

        {/* Center - Title */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <h1 className="font-['Share_Tech_Mono'] text-red-500/90 text-lg tracking-[0.2em] uppercase font-bold glitch-text">
            NEXUS-7 Terminal
          </h1>
          <div className="text-[10px] font-mono text-red-500/40 tracking-[0.3em] uppercase">
            AI Cloning System v1.0.3
          </div>
        </div>

        {/* Right side - Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div>
            <span className="font-mono text-red-500/50 text-xs tracking-wider uppercase">Memory: 47%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div>
            <span className="font-mono text-red-500/50 text-xs tracking-wider uppercase">CPU: 12%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div>
            <span className="font-mono text-red-500/50 text-xs tracking-wider uppercase">Network: 89%</span>
          </div>
        </div>
      </div>
    </header>
  )
} 