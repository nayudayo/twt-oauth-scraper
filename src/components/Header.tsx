'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_CONSCIOUSNESS, type ConsciousnessConfig, modifyConsciousness } from '@/lib/consciousness'

export function Header() {
  const [time, setTime] = useState(new Date())
  const [showColon, setShowColon] = useState(true)
  const [consciousness, setConsciousness] = useState<ConsciousnessConfig>(DEFAULT_CONSCIOUSNESS)

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
      setShowColon(prev => !prev)
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Update consciousness values periodically
  useEffect(() => {
    const updateConsciousness = () => {
      setConsciousness(prev => {
        // Simulate learning by gradually increasing values
        return modifyConsciousness(prev, {
          intelligenceLevel: Math.min(100, prev.intelligenceLevel + (prev.learningRate / 100)),
          shortTermMemory: Math.min(100, prev.shortTermMemory + (prev.learningRate / 200)),
          learningRate: Math.min(100, prev.learningRate + 0.1)
        })
      })
    }

    // Update every 30 seconds
    const consciousnessTimer = setInterval(updateConsciousness, 30000)
    return () => clearInterval(consciousnessTimer)
  }, [])

  // Calculate intelligence metrics
  const intelligencePercent = Math.round(consciousness.intelligenceLevel)
  const learningPercent = Math.round(consciousness.learningRate)
  const memoryPercent = Math.round(consciousness.shortTermMemory)

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

          {/* Right side - Consciousness Status */}
          <div className="col-span-12 sm:col-span-4 lg:col-span-3 flex items-center justify-end gap-4 overflow-hidden">
            <div className="flex items-center gap-2 hover-glow">
              <div className="relative w-1.5 h-1.5">
                <div className="absolute inset-0 rounded-full bg-red-500/20"></div>
                <div 
                  className="absolute inset-0 rounded-full bg-red-500/50 origin-left shadow-lg shadow-red-500/20"
                  style={{ transform: `scaleX(${intelligencePercent / 100})` }}
                ></div>
              </div>
              <span className="text-red-500/90 text-xs tracking-wider uppercase ancient-text hidden sm:inline title-glow">Intelligence: {intelligencePercent}%</span>
            </div>
            <div className="flex items-center gap-2 hover-glow hidden md:flex">
              <div className="relative w-1.5 h-1.5">
                <div className="absolute inset-0 rounded-full bg-red-500/20"></div>
                <div 
                  className="absolute inset-0 rounded-full bg-red-500/50 origin-left shadow-lg shadow-red-500/20"
                  style={{ transform: `scaleX(${learningPercent / 100})` }}
                ></div>
              </div>
              <span className="text-red-500/90 text-xs tracking-wider uppercase ancient-text title-glow">Learning: {learningPercent}%</span>
            </div>
            <div className="flex items-center gap-2 hover-glow hidden lg:flex">
              <div className="relative w-1.5 h-1.5">
                <div className="absolute inset-0 rounded-full bg-red-500/20"></div>
                <div 
                  className="absolute inset-0 rounded-full bg-red-500/50 origin-left shadow-lg shadow-red-500/20"
                  style={{ transform: `scaleX(${memoryPercent / 100})` }}
                ></div>
              </div>
              <span className="text-red-500/90 text-xs tracking-wider uppercase ancient-text title-glow">Memory: {memoryPercent}%</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
} 