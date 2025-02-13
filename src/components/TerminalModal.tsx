'use client'

import { useState, useEffect, useRef } from 'react'
import { REQUIRED_COMMANDS, HELP_MESSAGE } from '@/constants/commands'
import { SYSTEM_MESSAGES } from '@/constants/messages'
import { useSession } from 'next-auth/react'
import { extractReferralResponse } from '@/utils/referral'
import Image from 'next/image'
import { toPng } from 'html-to-image'

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
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [isLoadingReferral, setIsLoadingReferral] = useState(false)
  const [hasShared, setHasShared] = useState(false)
  const shareModalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)

  // Load saved progress when component mounts
  useEffect(() => {
    const loadProgress = async () => {
      if (session?.username) {
        try {
          const response = await fetch(`/api/command-progress?userId=${session.username}`)
          
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
            const { current_command_index, completed_commands, command_responses } = data.progress
            
            // Set the current state
            setCurrentCommandIndex(current_command_index || 0)
            setCompletedCommands(completed_commands || [])
            setCommandResponses(command_responses || {})
              
            // Only show boot message and next command prompt
            setLines([
              { content: SYSTEM_MESSAGES.BOOT },
              { 
                content: `\n[SYSTEM] Next required command: ${REQUIRED_COMMANDS[current_command_index || 0].command}`,
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
          
          // On error, try to get progress from local state first
          const lastIndex = currentCommandIndex || 0
          const lastCommands = completedCommands || []
          
          // If we have local state, use it
          if (lastCommands.length > 0 || lastIndex > 0) {
            console.log('Restoring from local state:', { lastIndex, lastCommands })
            setLines([
              { content: SYSTEM_MESSAGES.BOOT },
              { 
                content: `\n[SYSTEM] Next required command: ${REQUIRED_COMMANDS[lastIndex].command}`,
                isSystem: true 
              }
            ])
          } else {
            // If no local state, start from beginning
            console.log('Starting from beginning due to error')
            setCurrentCommandIndex(0)
            setCompletedCommands([])
            setCommandResponses({})
            setLines([
              { content: SYSTEM_MESSAGES.BOOT },
              { 
                content: `\n[SYSTEM] Next required command: ${REQUIRED_COMMANDS[0].command}`,
                isSystem: true 
              }
            ])
          }
        }
      }
    }
    loadProgress()
  }, [session?.username, onComplete])

  // Save progress when commands are completed
  const saveProgress = async (commandIndex: number, commands: string[]) => {
    if (session?.username) {
      try {
        console.log('Saving progress:', {
          userId: session.username,
          commandIndex,
          commands,
          responses: commandResponses
        });

        const response = await fetch('/api/command-progress', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: session.username,
            currentIndex: commandIndex,
            completedCommands: commands,
            commandResponses
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to save progress')
        }

        const result = await response.json();
        console.log('Progress saved:', result);
        return true;
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

  // Fetch referral code when share dialog opens
  useEffect(() => {
    const fetchReferralCode = async () => {
      if (showShareDialog && session?.username) {
        setIsLoadingReferral(true);
        try {
          // First try to get from database
          const response = await fetch(`/api/referral-code/get?userId=${session.username}`);
          if (!response.ok) {
            throw new Error('Failed to fetch referral code');
          }
          const data = await response.json();
          
          if (data.referralCode) {
            setReferralCode(data.referralCode);
          } else {
            // If not found in database, use the one from command responses
            setReferralCode(commandResponses['GENERATE_REFERRAL']);
          }
        } catch (error) {
          console.error('Error fetching referral code:', error);
          // Fallback to command responses if database fetch fails
          setReferralCode(commandResponses['GENERATE_REFERRAL']);
        } finally {
          setIsLoadingReferral(false);
        }
      }
    };

    fetchReferralCode();
  }, [showShareDialog, session?.username, commandResponses]);

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
    } else if (normalizedCommand === 'share') {
      setShowShareDialog(true)
      newLines.push({ 
        content: "[SYSTEM] Opening share interface...",
        isSystem: true 
      })
    } else if (normalizedCommand === 'close') {
      if (!hasShared) {
        newLines.push({ 
          content: "[ERROR] You must share your referral code before closing the terminal.",
          isError: true 
        })
      } else {
        newLines.push({ 
          content: "[SUCCESS] Terminal session complete. Closing interface...",
          isSuccess: true 
        })
        
        // Add CLOSE to completed commands
        const updatedCommands = [...completedCommands, 'CLOSE']
        setCompletedCommands(updatedCommands)
        
        // Save final progress
        await saveProgress(currentCommandIndex + 1, updatedCommands)
        
        // Mark funnel as completed
        try {
          await fetch('/api/funnel-completion', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: session?.username,
              completionData: {
                telegram_username: commandResponses['JOIN_TELEGRAM'] || null,
                wallet_address: commandResponses['SOL_WALLET'] || null,
                referral_code: commandResponses['SUBMIT_REFERRAL'] || null
              }
            })
          })
        } catch (error) {
          console.error('Failed to mark funnel as completed:', error)
        }
        
        // Set loading state for visual feedback
        setIsLoading(true)
        
        // Small delay for visual feedback
        setTimeout(() => {
          setShowMainContent(true)
          setTimeout(onComplete, 500)
        }, 1000)
      }
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
            currentCommand.command === 'SOL_WALLET' ?
            command.split(' ').slice(1).join(' ') : // Extract just the wallet address
            command
        }
        
        // Update responses state immediately
        setCommandResponses(updatedResponses)

        // Add command-specific responses
        if (currentCommand.command === 'REFER') {
          newLines.push({ 
            content: SYSTEM_MESSAGES.COMMAND_RESPONSES.REFERRAL_INFO,
            isSystem: true 
          })
        } else if (currentCommand.command === 'JOIN_TELEGRAM') {
          // Try to open Telegram channel
          window.open('https://t.me/+nwdyk8qAM8o1ZTg0', '_blank')
          
          newLines.push({ 
            content: "[SUCCESS] Command accepted: " + currentCommand.description,
            isSuccess: true 
          })
          newLines.push({
            content: "[SYSTEM] If you weren't redirected automatically, please click this link to join: https://t.me/+nwdyk8qAM8o1ZTg0",
            isSystem: true
          })
        } else if (currentCommand.command === 'SOL_WALLET') {
          const walletAddress = command.split(' ').slice(1).join(' ')
          newLines.push({
            content: `[SUCCESS] Wallet address ${walletAddress} verified and stored successfully`,
            isSuccess: true
          })
        } else if (currentCommand.command === 'SUBMIT_REFERRAL') {
          // Validate the referral code with the API
          try {
            const referralCode = extractReferralResponse(command)
            if (!referralCode) {
              throw new Error('Invalid referral code format')
            }

            if (!session?.username) {
              throw new Error('Not authenticated')
            }

            const response = await fetch('/api/validate-referral', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: session.username,
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
          const username = session?.username
          if (!username) {
            newLines.push({
              content: '[ERROR] Not authenticated. Please sign in again.',
              isError: true
            })
            setLines(newLines)
            return
          }

          // Request referral code from the API
          try {
            const response = await fetch('/api/referral-code', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: username
              }),
              credentials: 'include'
            })

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              throw new Error(errorData.error || 'Failed to generate referral code')
            }

            const data = await response.json()
            const generatedCode = data.referralCode

            // Store the generated code in command responses
            const updatedResponses = {
              ...commandResponses,
              'GENERATE_REFERRAL': generatedCode
            }
            setCommandResponses(updatedResponses)

            newLines.push({
              content: `[SUCCESS] Your unique referral code has been generated:\n\n${generatedCode}\n\nShare this code with others to earn rewards!`,
              isSuccess: true
            })
          } catch (error) {
            console.error('Failed to generate referral code:', error)
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
        const nextIndex = currentCommandIndex + 1

        try {
          // Save progress BEFORE updating UI
          await saveProgress(nextIndex, updatedCompletedCommands)
          
          // After successful save, update state and UI
          setCompletedCommands(updatedCompletedCommands)
          setCurrentCommandIndex(nextIndex)

          if (nextIndex >= REQUIRED_COMMANDS.length) {
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
            
            // Mark funnel as completed
            try {
              await fetch('/api/funnel-completion', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  userId: session?.username,
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
            // Show next command using nextIndex directly
            const nextCommand = REQUIRED_COMMANDS[nextIndex]
            newLines.push({ 
              content: SYSTEM_MESSAGES.COMMAND_RESPONSES.NEXT_COMMAND(nextCommand.command),
              isSystem: true
            })
          }
        } catch (error) {
          console.error('Failed to save progress:', error)
          newLines.push({ 
            content: '[ERROR] Failed to save progress. Please try the command again.',
            isError: true 
          })
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

  const handleShareToX = async () => {
    if (!shareModalRef.current) return;

    try {
      // Get modal dimensions
      const modalElement = shareModalRef.current;
      const { width, height } = modalElement.getBoundingClientRect();

      // Generate PNG with better quality
      const dataUrl = await toPng(modalElement, {
        quality: 1.0,
        width: width * 2, // Double the resolution
        height: height * 2,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        style: {
          transform: 'scale(2)',
          transformOrigin: 'top left',
          width: `${width}px`,
          height: `${height}px`
        },
        filter: (node) => {
          // Filter out the close button from the image
          return !node.classList?.contains('close-button');
        }
      });

      // Download image
      const link = document.createElement('a');
      link.download = 'referral-code.png';
      link.href = dataUrl;
      link.click();

      // Create Twitter intent URL
      const tweetText = `come...: ${referralCode || commandResponses['GENERATE_REFERRAL']}`;
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
      
      // Open Twitter intent in new window
      window.open(twitterUrl, '_blank');

      // Mark as shared and update command sequence
      setHasShared(true);
      
      // Add SHARE to completed commands and update current index to CLOSE
      const updatedCommands = [...completedCommands, 'SHARE'];
      setCompletedCommands(updatedCommands);
      const nextIndex = REQUIRED_COMMANDS.findIndex(cmd => cmd.command === 'CLOSE');
      setCurrentCommandIndex(nextIndex);
      
      // Save progress
      await saveProgress(nextIndex, updatedCommands);
      
      // Add system message about next command
      setLines(prev => [
        ...prev,
        { 
          content: "[SUCCESS] Share completed. Type 'CLOSE' to finish the process.",
          isSuccess: true 
        }
      ]);
    } catch (error) {
      console.error('Error sharing to X:', error);
    }
  };

  return (
    <>
      <div className={`fixed inset-0 bg-black flex items-center justify-center z-50 ${showMainContent ? 'animate-fadeOut' : ''}`}>
        {/* Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60]">
            <div className="w-32 h-32 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
          </div>
        )}
        
        {/* Main Terminal Container */}
        <div className="w-full h-full md:h-[85vh] md:max-w-4xl mx-auto p-4 md:p-0 flex items-center">
          <div className={`relative w-full h-full transition-opacity duration-500 ${isLoading ? 'opacity-30' : 'opacity-100'}`}>
            {/* CRT Effects Layer */}
            <div className="absolute inset-0 pointer-events-none crt">
              <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent opacity-50" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.1),transparent_100%)]" />
            </div>

            {/* Terminal Window */}
            <div className="relative w-full h-full bg-black/40 backdrop-blur-md border border-red-500/20 rounded-lg shadow-2xl flex flex-col font-['Share_Tech_Mono'] overflow-hidden">
              {/* Terminal Header */}
              <div className="flex-none px-4 py-3 border-b border-red-500/20 bg-black/20">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20"></div>
                  <span className="text-red-500/70 text-sm tracking-[0.2em] uppercase terminal-text">Neural Terminal v1.0.3</span>
                </div>
              </div>

              {/* Terminal Content Area */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Terminal Output */}
                <div 
                  ref={terminalRef}
                  className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1"
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
                <form onSubmit={handleSubmit} className="flex-none px-4 py-3 border-t border-red-500/20 bg-black/20">
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
              </div>

              {/* Scan effect */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-red-500/5 to-transparent opacity-50 animate-scan" />
            </div>
          </div>
        </div>
      </div>

      {/* Share Dialog */}
      {showShareDialog && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]"
          onClick={() => hasShared && setShowShareDialog(false)}
        >
          <div 
            ref={shareModalRef}
            className="bg-gradient-to-br from-black to-black/95 backdrop-blur-md p-8 rounded-lg shadow-2xl w-[500px] border border-red-500/20 hover-glow float"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(239,68,68,0.05), rgba(0,0,0,0.98) 100%)',
              boxShadow: '0 0 40px rgba(239,68,68,0.1)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 mb-4 border-b border-red-500/20 pb-4 glow-border">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                <h3 className="text-lg font-bold text-red-500/80 tracking-wider glow-text">SHARE INTERFACE</h3>
              </div>
              {hasShared && (
                <button
                  onClick={() => setShowShareDialog(false)}
                  className="close-button text-red-500/70 hover:text-red-500/90 transition-colors hover-text-glow"
                >
                  <span className="sr-only">Close</span>
                  ×
                </button>
              )}
            </div>

            <div className="space-y-6">
              {/* Profile Section */}
              <div className="flex flex-col items-center gap-4">
                {session?.user?.image ? (
                  <div className="w-20 h-20 rounded-full border-2 border-red-500/20 overflow-hidden hover-glow">
                    <Image
                      src={session.user.image}
                      alt={session?.username || 'Profile'}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-red-500/5 border-2 border-red-500/20 flex items-center justify-center">
                    <span className="text-red-500/50 text-2xl">?</span>
                  </div>
                )}
                <div className="text-center">
                  <h4 className="text-red-500/80 font-bold tracking-wider ancient-text">
                    {session?.username || 'Anonymous User'}
                  </h4>
                  {session?.username && (
                    <p className="text-red-400/60 text-sm mt-1 hover-text-glow">
                      @{session.username}
                    </p>
                  )}
                </div>
              </div>

              {/* Referral Code Section */}
              <div className="bg-black/80 rounded-lg p-4 backdrop-blur-sm border border-red-500/20 hover-glow ancient-border">
                <h4 className="text-sm font-bold text-red-500/80 tracking-wider uppercase flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                  <span className="ancient-text">Your Referral Code</span>
                </h4>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/80 text-red-400/80 px-3 py-2 rounded font-mono text-sm hover-text-glow">
                    {isLoadingReferral ? (
                      <span className="text-red-500/70 tracking-wider">FETCHING DATA...</span>
                    ) : (
                      referralCode || commandResponses['GENERATE_REFERRAL'] || 'No referral code found'
                    )}
                  </code>
                  <button
                    onClick={() => {
                      const code = referralCode || commandResponses['GENERATE_REFERRAL']
                      if (code) {
                        navigator.clipboard.writeText(code)
                      }
                    }}
                    className="px-3 py-2 bg-red-500/10 text-red-500/80 border border-red-500/20 rounded hover:bg-red-500/20 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow"
                    disabled={isLoadingReferral || (!referralCode && !commandResponses['GENERATE_REFERRAL'])}
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="text-red-400/60 text-sm space-y-2">
                <p className="hover-text-glow">Share your referral code with others to earn rewards!</p>
                <p className="hover-text-glow">Each successful referral increases your influence in the network.</p>
              </div>

              {/* Share Button */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleShareToX}
                  disabled={isLoadingReferral || (!referralCode && !commandResponses['GENERATE_REFERRAL'])}
                  className="w-full px-4 py-3 bg-red-500/10 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/20 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-sm backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Download and Share to X
                </button>
              </div>

              {!hasShared && (
                <div className="mt-4 text-center text-red-500/60 text-xs tracking-wider">
                 Download the Image and  Share to X to close this interface
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
} 