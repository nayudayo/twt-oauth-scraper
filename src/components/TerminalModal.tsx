'use client'

import { useState, useEffect, useRef } from 'react'
import { REQUIRED_COMMANDS, WELCOME_MESSAGE, HELP_MESSAGE } from '@/constants/commands'

interface TerminalModalProps {
  onComplete: () => void
}

interface TerminalLine {
  content: string
  isCommand?: boolean
  isError?: boolean
}

export function TerminalModal({ onComplete }: TerminalModalProps) {
  const [input, setInput] = useState('')
  const [lines, setLines] = useState<TerminalLine[]>([{ content: WELCOME_MESSAGE }])
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
      setLines([{ content: WELCOME_MESSAGE }])
      return
    } else {
      const currentCommand = REQUIRED_COMMANDS[currentCommandIndex]
      
      if (!currentCommand) {
        newLines.push({ 
          content: 'ERROR: Unknown command sequence', 
          isError: true 
        })
      } else if (currentCommand.validation(command)) {
        newLines.push({ 
          content: `Command accepted: ${currentCommand.description}` 
        })
        
        if (currentCommandIndex === REQUIRED_COMMANDS.length - 1) {
          newLines.push({ 
            content: '\nAll security protocols verified.\nInitializing main interface...' 
          })
          setTimeout(onComplete, 1500)
        } else {
          newLines.push({ 
            content: `\nNext command required: ${REQUIRED_COMMANDS[currentCommandIndex + 1].command}` 
          })
          setCurrentCommandIndex(prev => prev + 1)
        }
      } else {
        newLines.push({ 
          content: `ERROR: Invalid input for ${currentCommand.command}. Expected: ${currentCommand.expectedInput}`,
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
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50 font-mono">
      <div className="w-full max-w-3xl h-[80vh] bg-black/40 backdrop-blur-md border border-red-500/20 rounded-lg shadow-2xl p-4 flex flex-col">
        {/* Terminal Header */}
        <div className="flex items-center gap-2 pb-4 border-b border-red-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20"></div>
          <span className="text-red-500/70 text-sm tracking-widest uppercase">Terminal Access Required</span>
        </div>

        {/* Terminal Output */}
        <div 
          ref={terminalRef}
          className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-1"
        >
          {lines.map((line, i) => (
            <pre 
              key={i}
              className={`font-mono whitespace-pre-wrap ${
                line.isError 
                  ? 'text-red-500/90' 
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
            <span className="text-red-500/70">{'>'}</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-transparent text-red-400/90 outline-none"
              autoFocus
              spellCheck={false}
            />
            <span 
              className={`w-2 h-5 bg-red-500/70 ${showCursor ? 'opacity-100' : 'opacity-0'}`}
            />
          </div>
        </form>
      </div>
    </div>
  )
} 