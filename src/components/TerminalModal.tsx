'use client'

import { useState, useEffect, useRef } from 'react'
import { REQUIRED_COMMANDS, HELP_MESSAGE } from '@/constants/commands'
import { SYSTEM_MESSAGES } from '@/constants/messages'
import { useSession } from 'next-auth/react'
import { extractReferralResponse, generateReferralCode } from '@/utils/referral'

interface TerminalModalProps {
  onComplete: () => void
}

interface TerminalLine {
  content: string
  isCommand?: boolean
  isError?: boolean
  isSuccess?: boolean
  isSystem?: boolean
}

export function TerminalModal({ onComplete }: TerminalModalProps) {
  const { data: session } = useSession()
  const [input, setInput] = useState('')
  const [lines, setLines] = useState<TerminalLine[]>([{ content: SYSTEM_MESSAGES.BOOT }])
  const [currentCommandIndex, setCurrentCommandIndex] = useState(0)
  const [showCursor, setShowCursor] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [showMainContent, setShowMainContent] = useState(false)
  const [completedCommands, setCompletedCommands] = useState<string[]>([])
  const [commandResponses, setCommandResponses] = useState<{ [key: string]: string }>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)

  // Load saved progress and check completion when component mounts
  useEffect(() => {
    const loadProgress = async () => {
      if (session?.user?.name) {
        try {
          const response = await fetch(`/api/command-progress?userId=${session.user.name}`)
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || 'Failed to load progress')
          }

          const data = await response.json().catch(() => ({}))
          
          // If user has already completed the funnel, skip to main content
          if (data.completion) {
            setShowMainContent(true)
            setTimeout(onComplete, 500)
            return
          }
            
          // Otherwise just set up for the next required command
          if (data.progress) {
            const { current_command_index, completed_commands } = data.progress
            
            setCurrentCommandIndex(current_command_index)
            setCompletedCommands(completed_commands || [])
              
            // Only show boot message and next command prompt
            setLines([
              { content: SYSTEM_MESSAGES.BOOT },
              { 
                content: `\n[SYSTEM] Next required command: ${REQUIRED_COMMANDS[current_command_index].command}`,
                isSystem: true 
              }
            ])
          } else {
            // No progress yet, start from beginning
            setLines([
              { content: SYSTEM_MESSAGES.BOOT },
              { 
                content: `\n[SYSTEM] Next required command: ${REQUIRED_COMMANDS[0].command}`,
                isSystem: true 
              }
            ])
          }
        } catch (error) {
          console.error('Failed to load funnel progress:', error)
          // On error, start from beginning but maintain any existing progress
          setLines([
            { content: SYSTEM_MESSAGES.BOOT },
            { 
              content: `\n[SYSTEM] Next required command: ${REQUIRED_COMMANDS[currentCommandIndex].command}`,
              isSystem: true 
            }
          ])
        }
      }
    }
    loadProgress()
  }, [session?.user?.name, onComplete])

  // Save progress when commands are completed
  const saveProgress = async (commandIndex: number, commands: string[]) => {
    if (session?.user?.name) {
      try {
        const response = await fetch('/api/command-progress', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: session.user.name,
            currentIndex: commandIndex,
            completedCommands: commands
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to save progress')
        }

        // Just check if we can parse the response, but don't store it
        await response.json().catch(() => ({}))
        return true
      } catch (error) {
        console.error('Failed to save funnel progress:', error)
        setLines(prev => [
          ...prev,
          { content: '[ERROR] Failed to save funnel progress. Please try again.', isError: true }
        ])
        return false
      }
    }
    return false
  }

  // Blinking cursor effect
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [lines])

  // Focus input on mount and click
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleCommand = async (command: string) => {
    const normalizedCommand = command.trim().toLowerCase()
    const newLines: TerminalLine[] = [
      ...lines,
      { content: `> ${command}`, isCommand: true }
    ]

    if (normalizedCommand === 'help') {
      newLines.push({ content: HELP_MESSAGE })
    } else if (normalizedCommand === 'clear') {
      setLines([{ content: SYSTEM_MESSAGES.BOOT }])
      return
    } else {
      const currentCommand = REQUIRED_COMMANDS[currentCommandIndex]
      
      if (!currentCommand) {
        newLines.push({ 
          content: SYSTEM_MESSAGES.ERROR.UNKNOWN_COMMAND, 
          isError: true 
        })
      } else if (currentCommand.validation(command)) {
        // Store the user's response
        const updatedResponses = {
          ...commandResponses,
          [currentCommand.command]: currentCommand.command === 'SUBMIT_REFERRAL' ? 
            extractReferralResponse(command) || command : // Fallback to full command if extraction fails
            command
        }
        setCommandResponses(updatedResponses)

        // Add command-specific responses
        if (currentCommand.command === 'REFER') {
          newLines.push({ 
            content: SYSTEM_MESSAGES.COMMAND_RESPONSES.REFERRAL_INFO,
            isSystem: true 
          })
        } else if (currentCommand.command === 'SOL_WALLET') {
          newLines.push({
            content: "[SUCCESS] Wallet address verified and stored successfully",
            isSuccess: true
          })
        } else if (currentCommand.command === 'SUBMIT_REFERRAL') {
          // Validate the referral code with the API
          try {
            const referralCode = extractReferralResponse(command)
            if (!referralCode) {
              throw new Error('Invalid referral code format')
            }

            if (!session?.user?.name) {
              throw new Error('Not authenticated')
            }

            const response = await fetch('/api/validate-referral', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: session.user.name,
                referralCode: referralCode
              }),
              credentials: 'include' // Include cookies for authentication
            })

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              throw new Error(errorData.error || 'Invalid referral code')
            }

            newLines.push({
              content: "[SUCCESS] Command accepted: " + currentCommand.description,
              isSuccess: true
            })
          } catch (error) {
            console.error('Failed to validate referral code:', error)
            newLines.push({
              content: `[ERROR] Invalid input. Please enter a valid referral code or type "NO" if you weren't referred.\nExample: submit_referral PUSH-USER-CODE1\nOr: submit_referral NO`,
              isError: true
            })
            setLines(newLines)
            return
          }
        } else if (currentCommand.command === 'GENERATE_REFERRAL') {
          // Generate referral code based on username and wallet address
          const username = session?.user?.name
          if (!username) {
            newLines.push({
              content: '[ERROR] Not authenticated. Please sign in again.',
              isError: true
            })
            setLines(newLines)
            return
          }

          const walletAddress = commandResponses['SOL_WALLET']?.split(' ')[1] || ''
          const referralCode = generateReferralCode(username, walletAddress)
          
          // Store the referral code in the database
          try {
            const response = await fetch('/api/referral-code', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: username,
                referralCode: referralCode
              }),
              credentials: 'include' // Include cookies for authentication
            })

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              throw new Error(errorData.error || 'Failed to store referral code')
            }

            newLines.push({
              content: `[SUCCESS] Your unique referral code has been generated:\n\n${referralCode}\n\nShare this code with others to earn rewards!`,
              isSuccess: true
            })
          } catch (error) {
            console.error('Failed to store referral code:', error)
            newLines.push({
              content: '[ERROR] Failed to generate referral code. Please try again.',
              isError: true
            })
            setLines(newLines)
            return
          }
        } else {
          newLines.push({ 
            content: "[SUCCESS] Command accepted: " + currentCommand.description,
            isSuccess: true 
          })
        }
        
        const updatedCompletedCommands = [...completedCommands, currentCommand.command]
        setCompletedCommands(updatedCompletedCommands)
        
        if (currentCommandIndex === REQUIRED_COMMANDS.length - 1) {
          newLines.push({ 
            content: SYSTEM_MESSAGES.COMMAND_RESPONSES.SEQUENCE_COMPLETE,
            isSystem: true
          })
          newLines.push({
            content: SYSTEM_MESSAGES.ACCESS_GRANTED,
            isSuccess: true
          })
          
          setLines(newLines)
          setIsLoading(true)
          
          // Save final progress
          await saveProgress(currentCommandIndex + 1, updatedCompletedCommands)
          
          // Mark funnel as completed
          try {
            await fetch('/api/funnel-completion', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: session?.user?.name,
                completionData: {
                  telegram_username: updatedResponses['JOIN_TELEGRAM'] || null,
                  wallet_address: updatedResponses['SOL_WALLET'] || null,
                  referral_code: updatedResponses['SUBMIT_REFERRAL'] || null
                }
              })
            })
          } catch (error) {
            console.error('Failed to mark funnel as completed:', error)
          }
          
          // Simulate loading and transition
          setTimeout(() => {
            setIsLoading(false)
            setShowMainContent(true)
            setTimeout(onComplete, 500) // Give time for fade-in animation
          }, 2000)
          
          return
        } else {
          newLines.push({ 
            content: SYSTEM_MESSAGES.COMMAND_RESPONSES.NEXT_COMMAND(REQUIRED_COMMANDS[currentCommandIndex + 1].command),
            isSystem: true
          })
          const nextIndex = currentCommandIndex + 1
          setCurrentCommandIndex(nextIndex)
          // Save progress after each successful command
          await saveProgress(nextIndex, updatedCompletedCommands)
        }
      } else {
        newLines.push({ 
          content: SYSTEM_MESSAGES.ERROR.INVALID_INPUT(currentCommand.command, currentCommand.expectedInput),
          isError: true 
        })
      }
    }

    setLines(newLines)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim()) {
      handleCommand(input)
      setInput('')
    } else {
      // Handle empty command
      setLines(prev => [
        ...prev,
        { 
          content: `> ${input}`,
          isCommand: true
        },
        {
          content: SYSTEM_MESSAGES.ERROR.UNKNOWN_COMMAND,
          isError: true
        }
      ])
      setInput('')
    }
  }

  return (
    <div className={`fixed inset-0 bg-black flex items-center justify-center z-50 ${showMainContent ? 'animate-fadeOut' : ''}`}>
      {isLoading && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="w-32 h-32 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
        </div>
      )}
      <div className={`relative w-full max-w-4xl h-[85vh] transition-opacity duration-500 ${isLoading ? 'opacity-30' : 'opacity-100'}`}>
        {/* CRT screen effect */}
        <div className="absolute inset-0 pointer-events-none crt">
          <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent opacity-50" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.1),transparent_100%)]" />
        </div>

        {/* Main terminal window */}
        <div className="relative w-full h-full bg-black/40 backdrop-blur-md border border-red-500/20 rounded-lg shadow-2xl p-4 flex flex-col font-['Share_Tech_Mono']">
          {/* Terminal Header */}
          <div className="flex items-center gap-2 pb-4 border-b border-red-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20"></div>
            <span className="text-red-500/70 text-sm tracking-[0.2em] uppercase terminal-text">Neural Terminal v1.0.3</span>
          </div>

          {/* Terminal Output */}
          <div 
            ref={terminalRef}
            className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-1"
          >
            {lines.map((line, i) => (
              <pre 
                key={i}
                className={`font-['Share_Tech_Mono'] whitespace-pre-wrap tracking-wider terminal-text ${
                  line.isError 
                    ? 'text-red-500/90 font-bold' 
                    : line.isSuccess
                      ? 'text-green-500/70'
                      : line.isSystem
                        ? 'text-cyan-500/70'
                        : line.isCommand 
                          ? 'text-red-500/70' 
                          : 'text-red-400/60'
                }`}
              >
                {line.content}
              </pre>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="pt-4 border-t border-red-500/20">
            <div className="flex items-center gap-2">
              <span className="text-red-500/70 tracking-wider terminal-text">{'>'}</span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 bg-transparent text-red-400/90 outline-none font-['Share_Tech_Mono'] tracking-wider terminal-text"
                autoFocus
                spellCheck={false}
              />
              <span 
                className={`w-2 h-5 bg-red-500/70 ${showCursor ? 'opacity-100' : 'opacity-0'}`}
              />
            </div>
          </form>

          {/* Scan effect */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-red-500/5 to-transparent opacity-50 animate-scan" />
        </div>
      </div>
    </div>
  )
} 