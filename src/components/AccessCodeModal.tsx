'use client'

import { useState, useRef } from 'react'

interface AccessCodeModalProps {
  onValidated: () => void
}

export function AccessCodeModal({ onValidated }: AccessCodeModalProps) {
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Basic rate limiting
  const MAX_ATTEMPTS = 5
  const COOLDOWN_MINUTES = 15
  const [cooldownUntil, setCooldownUntil] = useState<Date | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Check cooldown
    if (cooldownUntil && new Date() < cooldownUntil) {
      const minutesLeft = Math.ceil((cooldownUntil.getTime() - Date.now()) / (1000 * 60))
      setError(`Too many attempts. Please wait ${minutesLeft} minutes.`)
      return
    }

    if (!code.trim()) {
      setError('Please enter an access code')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/access-code/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to validate code')
      }

      if (data.success) {
        if (data.alreadyValidated) {
          onValidated()
          return
        }
        onValidated()
      } else {
        // Track failed attempt
        const newAttempts = attempts + 1
        setAttempts(newAttempts)

        // Set cooldown if max attempts reached
        if (newAttempts >= MAX_ATTEMPTS) {
          const cooldown = new Date()
          cooldown.setMinutes(cooldown.getMinutes() + COOLDOWN_MINUTES)
          setCooldownUntil(cooldown)
          setAttempts(0)
        }

        throw new Error('Invalid access code')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
      setCode('')
    }
  }

  const isDisabled = isLoading || Boolean(cooldownUntil && new Date() < cooldownUntil)

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      {/* CRT Effects Layer */}
      <div className="absolute inset-0 pointer-events-none crt">
        <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.1),transparent_100%)]" />
      </div>

      {/* Modal Container */}
      <div className="w-full max-w-md mx-4">
        <div className="bg-black/40 backdrop-blur-md border border-red-500/20 rounded-lg shadow-2xl hover-glow ancient-border">
          {/* Header */}
          <div className="px-4 py-3 border-b border-red-500/20 bg-black/20">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20"></div>
              <span className="text-red-500/70 text-sm tracking-[0.2em] uppercase terminal-text">Neural Access Verification</span>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            <div className="text-red-500/70 space-y-2">
              <p className="text-sm tracking-wider uppercase ancient-text">Security Protocol Active</p>
              <p className="text-xs">Enter your neural access code to proceed.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  ref={inputRef}
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="NEURAL-XXXX-XXXX"
                  className="w-full bg-black/20 text-red-400/90 border border-red-500/20 rounded px-3 py-2 text-sm placeholder:text-red-500/30 focus:outline-none focus:border-red-500/40 hover-glow"
                  disabled={isDisabled}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {error && (
                <div className="text-red-500/90 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isDisabled}
                className="w-full px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-red-500/20 border-t-red-500/90 rounded-full animate-spin" />
                    <span>Verifying</span>
                  </div>
                ) : (
                  'Verify Access'
                )}
              </button>
            </form>

            {/* Attempt Counter */}
            {attempts > 0 && attempts < MAX_ATTEMPTS && (
              <div className="text-red-500/50 text-xs text-center">
                {MAX_ATTEMPTS - attempts} attempts remaining
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 