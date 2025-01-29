'use client'

import { useState, useEffect, useRef } from 'react'
import { REQUIRED_COMMANDS, HELP_MESSAGE } from '@/constants/commands'
import { SYSTEM_MESSAGES } from '@/constants/messages'

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
  const [input, setInput] = useState('')
  const [lines, setLines] = useState<TerminalLine[]>([{ content: SYSTEM_MESSAGES.BOOT }])
  const [currentCommandIndex, setCurrentCommandIndex] = useState(0)
  const [showCursor, setShowCursor] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)

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

  const handleCommand = (command: string) => {
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
        newLines.push({ 
          content: SYSTEM_MESSAGES.COMMAND_RESPONSES.COMMAND_ACCEPTED(currentCommand.description),
          isSuccess: true
        })
        
        if (currentCommandIndex === REQUIRED_COMMANDS.length - 1) {
          newLines.push({ 
            content: SYSTEM_MESSAGES.COMMAND_RESPONSES.SEQUENCE_COMPLETE,
            isSystem: true
          })
          newLines.push({
            content: SYSTEM_MESSAGES.ACCESS_GRANTED,
            isSuccess: true
          })
          setTimeout(onComplete, 2000)
        } else {
          newLines.push({ 
            content: SYSTEM_MESSAGES.COMMAND_RESPONSES.NEXT_COMMAND(REQUIRED_COMMANDS[currentCommandIndex + 1].command),
            isSystem: true
          })
          setCurrentCommandIndex(prev => prev + 1)
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
    }
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="relative w-full max-w-4xl h-[85vh]">
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