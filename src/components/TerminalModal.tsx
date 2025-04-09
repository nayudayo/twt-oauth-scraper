'use client'

import { useState, useEffect, useRef } from 'react'
import { REQUIRED_COMMANDS, HELP_MESSAGE } from '@/constants/commands'
import { SYSTEM_MESSAGES } from '@/constants/messages'
import { useSession } from 'next-auth/react'
import { extractReferralResponse } from '@/utils/referral'
import { toPng } from 'html-to-image'
import Image from 'next/image'

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
  const [lines, setLines] = useState<TerminalLine[]>([
    { content: SYSTEM_MESSAGES.BOOT },
    { 
      content: `\n[SYSTEM] Next required command: ${REQUIRED_COMMANDS[0].command}`,
      isSystem: true 
    }
  ])
  const [currentCommandIndex, setCurrentCommandIndex] = useState(0)
  const [showCursor, setShowCursor] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [showMainContent, setShowMainContent] = useState(false)
  const [completedCommands, setCompletedCommands] = useState<string[]>([])
  const [commandResponses, setCommandResponses] = useState<{ [key: string]: string }>({})
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [isLoadingReferral, setIsLoadingReferral] = useState(false)
  const [hasShared, setHasShared] = useState(false)
  const shareModalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const [isLoadingProgress, setIsLoadingProgress] = useState(false)

  // Load saved progress when component mounts
  useEffect(() => {
    const loadProgress = async () => {
      if (!session?.username || isLoadingProgress) return;
      
      setIsLoadingProgress(true);
      try {
        const response = await fetch(`/api/command-progress?userId=${session.username}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to load progress');
        }

        const data = await response.json();
        
        // If user has already completed the funnel, skip to main content
        if (data.completion) {
          setShowMainContent(true);
          setTimeout(onComplete, 500);
          return;
        }
            
        // Otherwise just set up for the next required command
        if (data.progress) {
          const { current_command_index, completed_commands, command_responses } = data.progress;
          
          // Set the current state
          setCurrentCommandIndex(current_command_index || 0);
          setCompletedCommands(completed_commands || []);
          setCommandResponses(command_responses || {});
              
          // Only show boot message and next command prompt
          setLines([
            { content: SYSTEM_MESSAGES.BOOT },
            { 
              content: `\n[SYSTEM] Next required command: ${REQUIRED_COMMANDS[current_command_index || 0].command}`,
              isSystem: true 
            }
          ]);
        }
      } catch (error) {
        console.error('Failed to load funnel progress:', error);
        // On error, start from beginning
        setCurrentCommandIndex(0);
        setCompletedCommands([]);
        setCommandResponses({});
        setLines([
          { content: SYSTEM_MESSAGES.BOOT },
          { 
            content: `\n[SYSTEM] Next required command: ${REQUIRED_COMMANDS[0].command}`,
            isSystem: true 
          }
        ]);
      } finally {
        setIsLoadingProgress(false);
      }
    };

    // Only load progress if we have a session and aren't already loading
    if (session?.username && !isLoadingProgress) {
      loadProgress();
    }
  }, [session?.username]); // Remove polling-causing dependencies

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
          
          // 1. Original wallet success message
          newLines.push({
            content: `[SUCCESS] Wallet address ${walletAddress} verified and stored successfully`,
            isSuccess: true
          })
          
          // 2. Automatically show referral info
          newLines.push({ 
            content: SYSTEM_MESSAGES.COMMAND_RESPONSES.REFERRAL_INFO,
            isSystem: true 
          })
          
          // 3. Update command responses to include both
          const updatedResponses = {
            ...commandResponses,
            'SOL_WALLET': walletAddress,
            'REFER': 'auto_completed'  // Mark as auto-completed
          }
          setCommandResponses(updatedResponses)
          
          // 4. Update completed commands to include both SOL_WALLET and REFER
          const updatedCompletedCommands = [
            ...completedCommands, 
            currentCommand.command,
            'REFER'  // Add REFER as completed
          ]
          
          try {
            // 5. Save progress with both commands completed
            await saveProgress(currentCommandIndex + 2, updatedCompletedCommands)
            
            // 6. Update state to skip REFER command
            setCompletedCommands(updatedCompletedCommands)
            setCurrentCommandIndex(currentCommandIndex + 2)
            
            // 7. Show next command prompt
            newLines.push({ 
              content: `\n[SYSTEM] Next required command: ${REQUIRED_COMMANDS[currentCommandIndex + 2].command}`,
              isSystem: true 
            })
          } catch (error) {
            console.error('Failed to save progress:', error)
            // On error, still show success but don't update progress
            newLines.push({ 
              content: `\n[SYSTEM] Next required command: ${REQUIRED_COMMANDS[currentCommandIndex + 1].command}`,
              isSystem: true 
            })
          }
        } else if (currentCommand.command === 'SUBMIT_REFERRAL') {
          try {
            // 1. Validate the referral code with the API
            const referralCode = extractReferralResponse(command)
            if (!referralCode) {
              throw new Error('Invalid referral code format')
            }

            if (!session?.username) {
              throw new Error('Not authenticated')
            }

            // 2. Validate submitted referral code
            const validationResponse = await fetch('/api/validate-referral', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: session.username,
                referralCode: referralCode
              }),
              credentials: 'include'
            })

            if (!validationResponse.ok) {
              const errorData = await validationResponse.json().catch(() => ({}))
              throw new Error(errorData.error || 'Invalid referral code')
            }

            // 3. Show success message for referral submission
            newLines.push({
              content: "[SUCCESS] Referral code accepted",
              isSuccess: true
            })

            // 4. Automatically generate new referral code
            const generationResponse = await fetch('/api/referral-code', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: session.username
              }),
              credentials: 'include'
            })

            if (!generationResponse.ok) {
              const errorData = await generationResponse.json().catch(() => ({}))
              throw new Error(errorData.error || 'Failed to generate referral code')
            }

            const data = await generationResponse.json()
            const generatedCode = data.referralCode

            // 5. Store both responses in command responses
            const updatedResponses = {
              ...commandResponses,
              'SUBMIT_REFERRAL': referralCode,
              'GENERATE_REFERRAL': generatedCode
            }
            setCommandResponses(updatedResponses)

            // 6. Show generated code message
            newLines.push({
              content: `[SUCCESS] Your unique referral code has been generated:\n\n${generatedCode}\n\nShare this code with others to earn rewards!`,
              isSuccess: true
            })

            // 7. Update completed commands and move to SHARE
            const updatedCompletedCommands = [
              ...completedCommands,
              currentCommand.command
            ]

            try {
              // 8. Save progress and show SHARE as next command
              await saveProgress(currentCommandIndex + 1, updatedCompletedCommands)
              setCompletedCommands(updatedCompletedCommands)
              setCurrentCommandIndex(currentCommandIndex + 1)
              
              // 9. Show next command prompt (only once)
              newLines.push({ 
                content: `\n[SYSTEM] Next required command: SHARE`,
                isSystem: true 
              })
            } catch (error) {
              console.error('Failed to save progress:', error)
              // Don't show the command prompt again on error since it's already in newLines
            }

            // Set the lines and return to prevent duplicate processing
            setLines(newLines)
            return
          } catch (error) {
            console.error('Failed to process referral:', error)
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

    // Show confirmation dialog first
    setShowDownloadConfirm(true);
  };

  const handleConfirmedShare = async (shouldDownload: boolean) => {
    setShowDownloadConfirm(false);
    
    try {
      if (shouldDownload) {
        // Get modal dimensions
        const modalElement = shareModalRef.current;
        if (!modalElement) return;

        const { width, height } = modalElement.getBoundingClientRect();

        // Generate PNG with better quality
        const dataUrl = await toPng(modalElement, {
          quality: 1.0,
          width: width * 2,
          height: height * 2,
          backgroundColor: 'rgba(0, 0, 0, 0)',
          style: {
            transform: 'scale(2)',
            transformOrigin: 'top left',
            width: `${width}px`,
            height: `${height}px`
          },
          filter: (node) => {
            return !node.classList?.contains('close-button');
          }
        });

        // Download image
        const link = document.createElement('a');
        link.download = 'referral-code.png';
        link.href = dataUrl;
        link.click();
      }

      // Tweet text options
      const tweetOptions = [
        `"We all fake it till we make it, but what if we didn't have to?\n\n${referralCode || commandResponses['GENERATE_REFERRAL']}\n\n https://pushthebutton.ai @pushthebuttonlol"`,
        `"Be the love u've never encountered\n\n${referralCode || commandResponses['GENERATE_REFERRAL']}\n\n https://pushthebutton.ai @pushthebuttonlol"`,
        `"The best way to level up? Bring your people with you. Let's get it.\n\n${referralCode || commandResponses['GENERATE_REFERRAL']}\n\n https://pushthebutton.ai @pushthebuttonlol"`,
        `"Good things multiply—wealth, knowledge, and referrals. Get your share.\n\n${referralCode || commandResponses['GENERATE_REFERRAL']}\n\n https://pushthebutton.ai @pushthebuttonlol"`
      ];

      // Randomly select a tweet text
      const randomIndex = Math.floor(Math.random() * tweetOptions.length);
      const tweetText = tweetOptions[randomIndex];
      
      // Create Twitter intent URL with randomly selected text
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
        <div className="w-full h-full md:h-[90vh] lg:h-[85vh] md:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 flex items-center">
          <div className={`relative w-full h-[96vh] sm:h-[94vh] md:h-full transition-opacity duration-500 ${isLoading ? 'opacity-30' : 'opacity-100'}`}>
            {/* CRT Effects Layer */}
            <div className="absolute inset-0 pointer-events-none crt">
              <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent opacity-50" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.1),transparent_100%)]" />
            </div>

            {/* Terminal Window */}
            <div className="relative w-full h-full bg-black/40 backdrop-blur-md border border-red-500/20 rounded-lg shadow-2xl flex flex-col font-['Share_Tech_Mono'] overflow-hidden">
              {/* Terminal Header */}
              <div className="flex-none px-3 py-2 md:px-4 md:py-3 border-b border-red-500/20 bg-black/20">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20"></div>
                  <span className="text-red-500/70 uppercase terminal-header">Neural Terminal v1.0.3</span>
                </div>
              </div>

              {/* Terminal Content Area */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Terminal Output */}
                <div 
                  ref={terminalRef}
                  className="flex-1 overflow-y-auto custom-scrollbar p-2 sm:p-4 md:p-4 space-y-1 w-full"
                >
                  {lines.map((line, i) => {
                    const isAsciiLogo = line.content.includes('PTB') || 
                                       line.content.includes('███████████') || 
                                       line.content.includes('░░███░░░░░███');
                    
                    return (
                      <div key={i} className={`${isAsciiLogo ? 'pl-0 sm:pl-1 md:pl-2' : ''}`}>
                        <pre 
                          className={`font-['Share_Tech_Mono'] whitespace-pre-wrap tracking-wider terminal-text ${
                            isAsciiLogo 
                              ? 'ascii-logo' 
                              : line.isError 
                                ? 'text-red-500/90 font-bold' 
                                : line.isSuccess
                                  ? 'text-green-500/70'
                                  : line.isSystem
                                    ? 'text-yellow-500/70'
                                    : line.isCommand 
                                      ? 'text-red-500/70' 
                                      : 'text-red-400/60'
                          }`}
                        >
                          {line.content}
                        </pre>
                      </div>
                    )
                  })}
                </div>

                {/* Input Form */}
                <form onSubmit={handleSubmit} className="flex-none px-3 sm:px-3 md:px-4 py-2 md:py-3 border-t border-red-500/20 bg-black/20">
                  <div className="flex items-center gap-2">
                    <span className="text-red-500/70 terminal-text">{'>'}</span>
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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 md:p-6 lg:p-8"
          onClick={() => hasShared && setShowShareDialog(false)}
        >
          {/* Confirmation Dialog */}
          {showDownloadConfirm && (
            <div 
              className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-black/95 border border-red-500/20 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl hover-glow">
                <h3 className="text-red-500/80 text-lg font-bold mb-4 tracking-wider">Download Image?</h3>
                <p className="text-red-400/60 text-sm mb-6">Would you like to download the referral code image before sharing to X?</p>
                <div className="flex gap-4 justify-end">
                  <button
                    onClick={() => handleConfirmedShare(false)}
                    className="px-4 py-2 text-red-500/70 hover:text-red-500/90 transition-colors text-sm"
                  >
                    Skip Download
                  </button>
                  <button
                    onClick={() => handleConfirmedShare(true)}
                    className="px-4 py-2 bg-red-500/10 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/20 transition-all duration-300 text-sm hover-glow"
                  >
                    Download & Share
                  </button>
                </div>
              </div>
            </div>
          )}
          <div 
            ref={shareModalRef}
            className="bg-gradient-to-br from-black to-black/95 backdrop-blur-md p-4 md:p-6 lg:p-8 rounded-lg shadow-2xl w-full max-w-[500px] border border-red-500/20 hover-glow float"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(239,68,68,0.05), rgba(0,0,0,0.98) 100%)',
              boxShadow: '0 0 40px rgba(239,68,68,0.1)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 mb-4 border-b border-red-500/20 pb-4 glow-border">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                <h3 className="text-base md:text-lg font-bold text-red-500/80 tracking-wider glow-text">SHARE INTERFACE</h3>
              </div>
              {hasShared && (
                <button
                  onClick={() => setShowShareDialog(false)}
                  className="close-button text-red-500/70 hover:text-red-500/90 transition-colors hover-text-glow p-2"
                  aria-label="Close dialog"
                >
                  ×
                </button>
              )}
            </div>

            <div className="space-y-4 md:space-y-6">
              {/* Profile Section - Made more compact on mobile */}
              <div className="flex flex-col items-center gap-3 md:gap-4">
                {session?.user?.image ? (
                  <div className="w-16 md:w-20 h-16 md:h-20 rounded-full border-2 border-red-500/20 overflow-hidden hover-glow">
                    <Image
                      src={session.user.image}
                      alt={session?.username || 'Profile'}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-16 md:w-20 h-16 md:h-20 rounded-full bg-red-500/5 border-2 border-red-500/20 flex items-center justify-center">
                    <span className="text-red-500/50 text-xl md:text-2xl">?</span>
                  </div>
                )}
                <div className="text-center">
                  <h4 className="text-sm md:text-base text-red-500/80 font-bold tracking-wider ancient-text">
                    {session?.username || 'Anonymous User'}
                  </h4>
                  {session?.username && (
                    <p className="text-xs md:text-sm text-red-400/60 mt-0.5 md:mt-1 hover-text-glow">
                      @{session.username}
                    </p>
                  )}
                </div>
              </div>

              {/* Referral Code Section - Improved mobile layout */}
              <div className="bg-black/80 rounded-lg p-3 md:p-4 backdrop-blur-sm border border-red-500/20 hover-glow ancient-border">
                <h4 className="text-xs md:text-sm font-bold text-red-500/80 tracking-wider uppercase flex items-center gap-2 mb-2 md:mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                  <span className="ancient-text">Your Referral Code</span>
                </h4>
                <div className="flex flex-col md:flex-row gap-2">
                  <code className="flex-1 bg-black/80 text-red-400/80 px-3 py-2 rounded font-mono text-xs md:text-sm hover-text-glow break-all">
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
                    className="px-3 py-2 bg-red-500/10 text-red-500/80 border border-red-500/20 rounded hover:bg-red-500/20 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow whitespace-nowrap"
                    disabled={isLoadingReferral || (!referralCode && !commandResponses['GENERATE_REFERRAL'])}
                  >
                    Copy Code
                  </button>
                </div>
              </div>

              {/* Instructions - Adjusted for mobile */}
              <div className="text-xs md:text-sm text-red-400/60 space-y-1 md:space-y-2">
                <p className="hover-text-glow">Share your referral code with others to earn rewards!</p>
                <p className="hover-text-glow">Each successful referral increases your influence in the network.</p>
              </div>

              {/* Share Button - Full width on mobile */}
              <div className="mt-4 md:mt-6">
                <button
                  onClick={handleShareToX}
                  disabled={isLoadingReferral || (!referralCode && !commandResponses['GENERATE_REFERRAL'])}
                  className="w-full px-4 py-2.5 md:py-3 bg-red-500/10 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/20 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs md:text-sm backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Download Image and Share to X
                </button>
              </div>

              {!hasShared && (
                <div className="mt-2 md:mt-4 text-center text-red-500/60 text-[10px] md:text-xs tracking-wider px-2">
                  Download the Referral Code Image and Share to X to close this interface
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
} 