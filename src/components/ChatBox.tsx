import { useState, useEffect, useRef, Dispatch, SetStateAction } from 'react'
import { Tweet, TwitterProfile } from '@/types/scraper'
import { PersonalityAnalysis } from '@/lib/openai'
import ReactMarkdown from 'react-markdown'
import { Spinner } from '@/components/ui/spinner'
import '@/styles/glow.css'
import Image from 'next/image'

interface ChatBoxProps {
  tweets: Tweet[]
  profile: TwitterProfile
  onClose: () => void
  onTweetsUpdate: Dispatch<SetStateAction<Tweet[]>>
}

interface PersonalityTuning {
  traitModifiers: { [key: string]: number }  // trait name -> adjustment (-2 to +2)
  interestWeights: { [key: string]: number } // interest -> weight (0 to 100)
  customInterests: string[]
  communicationStyle: {
    formality: number      // 0-100
    enthusiasm: number     // 0-100
    technicalLevel: number // 0-100
    emojiUsage: number     // 0-100
  }
}

interface ScanProgress {
  phase: 'posts' | 'replies'
  count: number
}

export default function ChatBox({ tweets, profile, onClose, onTweetsUpdate }: ChatBoxProps) {
  const [messages, setMessages] = useState<Array<{text: string, isUser: boolean}>>([])
  const [input, setInput] = useState('')
  const [analysis, setAnalysis] = useState<PersonalityAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [showConsent, setShowConsent] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showAnalysisPrompt, setShowAnalysisPrompt] = useState(false)
  const [tuning, setTuning] = useState<PersonalityTuning>({
    traitModifiers: {},
    interestWeights: {},
    customInterests: [],
    communicationStyle: {
      formality: 50,
      enthusiasm: 50,
      technicalLevel: 50,
      emojiUsage: 50
    }
  })
  const [newInterest, setNewInterest] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  // Add elapsed time states
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null)
  const [analysisElapsedTime, setAnalysisElapsedTime] = useState<string | null>(null)
  const [scrapingStartTime, setScrapingStartTime] = useState<number | null>(null)
  const [scrapingElapsedTime, setScrapingElapsedTime] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Add escape key handler for modals
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showComplete) {
          setShowComplete(false)
          if (loading) handleCancelScraping()
        }
        if (showConsent) {
          setShowConsent(false)
          if (loading) handleCancelScraping()
        }
        if (loading) handleCancelScraping()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showComplete, showConsent, loading])

  // Add mouse tracking for dynamic glow
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const elements = document.getElementsByClassName('dynamic-bg');
      Array.from(elements).forEach((element) => {
        const rect = (element as HTMLElement).getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        (element as HTMLElement).style.setProperty('--mouse-x', `${x}%`);
        (element as HTMLElement).style.setProperty('--mouse-y', `${y}%`);
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Add useEffect for tracking elapsed time
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (isAnalyzing && analysisStartTime) {
      timer = setInterval(() => {
        const elapsed = Date.now() - analysisStartTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        setAnalysisElapsedTime(`${minutes}:${(seconds % 60).toString().padStart(2, '0')}`);
      }, 1000);
    }

    if (loading && scrapingStartTime) {
      timer = setInterval(() => {
        const elapsed = Date.now() - scrapingStartTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        setScrapingElapsedTime(`${minutes}:${(seconds % 60).toString().padStart(2, '0')}`);
      }, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isAnalyzing, loading, analysisStartTime, scrapingStartTime]);

  const handleTraitAdjustment = (traitName: string, score: number) => {
    setTuning(prev => ({
      ...prev,
      traitModifiers: {
        ...prev.traitModifiers,
        [traitName]: score
      }
    }))
  }

  const handleInterestWeight = (interest: string, weight: number) => {
    setTuning(prev => ({
      ...prev,
      interestWeights: {
        ...prev.interestWeights,
        [interest]: weight
      }
    }))
  }

  const handleAddCustomInterest = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newInterest.trim()) return
    
    setTuning(prev => ({
      ...prev,
      customInterests: [...prev.customInterests, newInterest.trim()],
      interestWeights: {
        ...prev.interestWeights,
        [newInterest.trim()]: 50 // default weight
      }
    }))
    setNewInterest('')
  }

  const handleRemoveCustomInterest = (interest: string) => {
    setTuning(prev => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [interest]: _, ...remainingWeights } = prev.interestWeights
      return {
        ...prev,
        customInterests: prev.customInterests.filter(i => i !== interest),
        interestWeights: remainingWeights
      }
    })
  }

  const handleStyleAdjustment = (aspect: keyof PersonalityTuning['communicationStyle'], value: number) => {
    setTuning(prev => ({
      ...prev,
      communicationStyle: {
        ...prev.communicationStyle,
        [aspect]: value
      }
    }))
  }

  const generatePersonalityResponse = async (userMessage: string) => {
    setLoading(true)
    setError(null)
    try {
      setIsTyping(true)

      // Convert messages to the format expected by the API
      const conversationHistory = messages.map(msg => ({
        role: msg.isUser ? 'user' as const : 'assistant' as const,
        content: msg.text
      }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: userMessage,
          profile,
          analysis,
          tuning,
          conversationHistory
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to get response')
      }
      
      const data = await response.json()
      setIsTyping(false)
      return data.response
    } catch (err) {
      setIsTyping(false)
      setError(err instanceof Error ? err.message : 'Failed to get response')
      return null
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { text: userMessage, isUser: true }])

    // Only generate response if we have personality analysis
    if (analysis) {
      const response = await generatePersonalityResponse(userMessage)
      
      if (response) {
        setMessages(prev => [...prev, { text: response, isUser: false }])
      }
    }
  }

  const handleAnalyze = async () => {
    if (!tweets || tweets.length === 0) {
      setError('No tweets available for analysis')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setAnalysisStartTime(Date.now())
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tweets, profile }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to analyze personality')
      }
      
      const data = await response.json()
      
      // Initialize tuning with the analysis values
      const initialTuning: PersonalityTuning = {
        traitModifiers: Object.fromEntries(data.traits.map((trait: { name: string; score: number }) => 
          // Convert trait score (0-10) to slider range (0-100)
          [trait.name, trait.score * 10]
        )),
        interestWeights: {},
        customInterests: [],
        communicationStyle: {
          formality: data.communicationStyle.formality,
          enthusiasm: data.communicationStyle.enthusiasm,
          technicalLevel: data.communicationStyle.technicalLevel,
          emojiUsage: data.communicationStyle.emojiUsage
        }
      }

      // Initialize interest weights with values based on presence in topics and themes
      const initialWeights: { [key: string]: number } = {}
      const allTopics = [...data.interests, ...data.topicsAndThemes]
      const uniqueTopics = Array.from(new Set(allTopics))
      
      uniqueTopics.forEach((topic: string) => {
        // If a topic appears in both interests and themes, give it a higher weight
        const weight = data.interests.includes(topic) && data.topicsAndThemes.includes(topic) ? 75 : 50
        initialWeights[topic] = weight
      })

      initialTuning.interestWeights = initialWeights

      setTuning(initialTuning)
      setAnalysis(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsAnalyzing(false)
      setAnalysisStartTime(null)
    }
  }

  // Helper functions for trait labels
  const getTraitLabel = (score: number) => {
    if (score === 0) return 'None'
    if (score <= 25) return 'Very Low'
    if (score <= 50) return 'Low'
    if (score <= 75) return 'High'
    return 'Very High'
  }

  const getWeightLabel = (weight: number) => {
    if (weight === 0) return 'Disabled'
    if (weight <= 25) return 'Low'
    if (weight <= 50) return 'Medium'
    if (weight <= 75) return 'High'
    return 'Very High'
  }

  // Add handlers for terminal session
  const handleScrape = async () => {
    setShowConsent(true)
  }

  const handleCancelScraping = async () => {
    if (abortController) {
      console.log('Aborting scraping process...')
      try {
      abortController.abort()
      setAbortController(null)
    setLoading(false)
    setScanProgress(null)
    setShowComplete(false)
        setScrapingStartTime(null)
        setError('Operation cancelled by user')
      } catch (error) {
        console.error('Error during abort:', error)
        setError('Failed to cancel operation')
      }
    }
  }

  const handleClearData = () => {
    if (profile.name) {
      localStorage.removeItem(`tweets_${profile.name}`)
      onTweetsUpdate([]) // Clear tweets in parent component
      onClose() // Close the interface after clearing data
    }
  }

  const handleCloseModal = () => {
    if (loading) {
      console.log('Closing modal and cancelling scraping...')
      handleCancelScraping()
    }
    setShowComplete(false)
  }

  const startScraping = async () => {
    setShowConsent(false)
    setLoading(true)
    setError(null)
    setShowComplete(false)
    setShowAnalysisPrompt(false)
    setScrapingStartTime(Date.now())

    // Create new AbortController for this scraping session
    const controller = new AbortController()
    setAbortController(controller)

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Failed to start scraping')

      while (true) {
        const { done, value } = await reader.read()
        
        // Check if aborted before processing
        if (controller.signal.aborted) {
          console.log('Scraping aborted, cleaning up...')
          reader.cancel()
          break
        }
        
        if (done) {
          console.log('Stream complete')
          setLoading(false)
          setScanProgress(null)
          setShowComplete(true)
          setShowAnalysisPrompt(true)
          setScrapingStartTime(null)
          setAbortController(null)
          break
        }

        // Parse the SSE data
        const text = new TextDecoder().decode(value)
        const lines = text.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              console.log('Received:', data)

              if (data.error) {
                setError(data.error)
                setLoading(false)
                setAbortController(null)
                setScrapingStartTime(null)
                setScanProgress(null)
                reader.cancel()
                return
              }

              if (data.progress) {
                setScanProgress({
                  phase: data.phase || 'posts',
                  count: data.scanProgress?.count || 0
                })
              }

              // Update tweets when new data is received
              if (data.tweets) {
                if (data.isChunk) {
                  // For chunks, append tweets based on chunk index
                  onTweetsUpdate((prevTweets: Tweet[]) => {
                    console.log('Processing chunk with data:', {
                      chunkIndex: data.chunkIndex,
                      totalTweets: data.totalTweets,
                      chunkSize: data.tweets.length,
                      currentTweets: prevTweets.length
                    });

                    // Initialize array with correct size if needed
                    let newTweets = [...prevTweets]
                    if (data.totalTweets && newTweets.length < data.totalTweets) {
                      newTweets = new Array(data.totalTweets).fill(null)
                      // Copy over any existing tweets
                      prevTweets.forEach((t, i) => {
                        if (t) newTweets[i] = t
                      })
                    }
                    
                    // Calculate start index for this chunk
                    const startIndex = data.chunkIndex * 50
                    // Replace or add tweets at the correct position
                    for (let i = 0; i < data.tweets.length; i++) {
                      if (data.tweets[i]) { // Only add valid tweets
                        newTweets[startIndex + i] = data.tweets[i]
                      }
                    }
                    
                    // Update scan progress
                    if (data.scanProgress) {
                      setScanProgress({
                        phase: data.scanProgress.phase,
                        count: data.totalTweets || data.scanProgress.count
                      })
                    }
                    
                    // Filter out nulls and return
                    const validTweets = newTweets.filter((t: unknown): t is Tweet => Boolean(t))
                    console.log(`Processed chunk ${data.chunkIndex}, valid tweets: ${validTweets.length}/${newTweets.length}`)
                    return validTweets
                  })
                } else {
                  // For non-chunked data, filter and update
                  const validTweets = data.tweets.filter((t: unknown): t is Tweet => Boolean(t))
                  console.log(`Processing non-chunked data, valid tweets: ${validTweets.length}`)
                  onTweetsUpdate(validTweets)
                  
                  // Update scan progress for non-chunked data
                  if (data.scanProgress) {
                    setScanProgress({
                      phase: data.scanProgress.phase,
                      count: validTweets.length
                    })
                  }
                }
              }

              // Handle completion
              if (data.type === 'complete' || data.type === 'done' || (data.progress === 100 && data.status === 'Complete')) {
                console.log('Scraping complete, showing completion modal', data)
                
                let finalTweets: Tweet[] = []
                
                if (data.data?.tweets) {
                  // Ensure we update with the complete tweet set
                  finalTweets = data.data.tweets.filter((t: unknown): t is Tweet => Boolean(t))
                  console.log(`Updating with ${finalTweets.length} final tweets from data.data`)
                } else if (data.tweets) {
                  // Fallback to data.tweets if data.data.tweets is not available
                  finalTweets = data.tweets.filter((t: unknown): t is Tweet => Boolean(t))
                  console.log(`Updating with ${finalTweets.length} tweets from direct data`)
                }

                if (finalTweets.length > 0) {
                  console.log('Final tweet update:', {
                    count: finalTweets.length,
                    firstTweet: finalTweets[0],
                    lastTweet: finalTweets[finalTweets.length - 1]
                  })

                  // Update local state first
                  onTweetsUpdate(finalTweets)
                  
                  // Save to localStorage as backup
                  if (profile.name) {
                    try {
                      localStorage.setItem(`tweets_${profile.name}`, JSON.stringify(finalTweets))
                    } catch (err) {
                      console.warn('Failed to save tweets to localStorage:', err)
                    }
                  }
                  
                  setScanProgress(prev => prev ? {
                    ...prev,
                    count: finalTweets.length
                  } : null)
                } else {
                  console.warn('No tweets found in completion data')
                }

                // Trigger a final fetch from the database to ensure UI is in sync
                if (profile.name) {
                  try {
                    const response = await fetch(`/api/tweets?username=${profile.name}`)
                    if (response.ok) {
                      const data = await response.json()
                      if (data.tweets?.length > 0) {
                        console.log('Final database sync:', {
                          count: data.tweets.length,
                          source: 'database'
                        })
                        onTweetsUpdate(data.tweets)
                      }
                    }
                  } catch (err) {
                    console.warn('Failed to sync with database:', err)
                  }
                }

                setLoading(false)
                setShowComplete(true)
                setShowAnalysisPrompt(true)
                setScrapingStartTime(null)
                setAbortController(null)
                reader.cancel()
                break
              }
            } catch (err) {
              console.error('Failed to parse:', line, err)
            }
          }
        }
      }
    } catch (error: unknown) {
      console.error('Scraping error:', error)
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        setError('Scraping cancelled by user')
      } else {
        setError(error instanceof Error ? error.message : 'Failed to start scraping')
      }
      setLoading(false)
      setAbortController(null)
      setScrapingStartTime(null)
      setScanProgress(null)
    }
  }

  useEffect(() => {
    return () => {
      if (abortController) {
        console.log('Cleanup: cancelling any active scraping...')
      handleCancelScraping()
    }
    }
  }, []) // Empty dependency array since we want this only on unmount

  // Add auto-scroll effect
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  // Handle text input with Shift+Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  useEffect(() => {
    adjustTextareaHeight()
  }, [input])

  const handleUpdateAnalysis = async () => {
    // Reset the analysis state and start a new analysis
    setAnalysis(null)
    await handleAnalyze()
  }

  return (
    <>
      {/* Main Container - Mobile First Layout */}
      <div className="flex flex-col md:hidden w-full min-h-screen pt-16 px-4 pb-4 gap-4">
        {/* Chat Interface */}
        <div className="w-full backdrop-blur-md bg-black/40 border border-red-500/10 rounded-lg shadow-2xl hover-glow ancient-border rune-pattern overflow-hidden">
          <div className="flex flex-col min-h-[50vh]">
            {/* Chat Header */}
            <div className="flex-none flex items-center justify-between px-4 py-4 bg-black/40 backdrop-blur-sm border-b border-red-500/10 rounded-t-lg cryptic-shadow">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">NEURAL INTERFACE</h3>
              </div>
              <button
                onClick={onClose}
                className="text-red-500/70 hover:text-red-500/90 ancient-text"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>

            {/* Chat Messages Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4 backdrop-blur-sm bg-black/20 ancient-scroll">
              {!analysis ? (
                <div className="text-red-500/70 italic text-center glow-text">
                  Start personality analysis to begin chat interaction
                </div>
              ) : (
                <>
                  {/* Profile Picture Section */}
                  <div className="flex flex-col items-center gap-4 mb-8 p-4 bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg hover-glow ancient-border">
                    <div className="w-20 h-20 rounded-full border-2 border-red-500/20 overflow-hidden hover-glow">
                      {profile.imageUrl ? (
                        <Image
                          src={profile.imageUrl}
                          alt={profile.name || 'Profile'}
                          className="w-full h-full object-cover"
                          width={80}
                          height={80}
                        />
                      ) : (
                        <div className="w-full h-full bg-red-500/5 flex items-center justify-center">
                          <span className="text-red-500/50 text-2xl">?</span>
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <h4 className="text-red-500/90 font-bold tracking-wider ancient-text">
                        {profile.name ? `@${profile.name}` : 'Anonymous User'}
                      </h4>
                      {profile.bio && (
                        <p className="text-red-400/70 text-sm mt-1 hover-text-glow max-w-md">
                          {profile.bio}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  {messages.map((msg, i) => (
                    <div 
                      key={i}
                      className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`max-w-[80%] rounded backdrop-blur-sm border border-red-500/10 shadow-lg hover-glow float
                          ${msg.isUser 
                            ? 'bg-red-500/5 text-red-400/90' 
                            : 'bg-black/40 text-red-300/90'
                          } px-4 py-2 text-sm`}
                      >
                        <div className="prose prose-red prose-invert max-w-none hover-text-glow whitespace-pre-wrap">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg p-3 bg-red-500/5 text-red-500/80">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-red-500/50 animate-bounce [animation-delay:-0.3s]" />
                          <div className="w-2 h-2 rounded-full bg-red-500/50 animate-bounce [animation-delay:-0.15s]" />
                          <div className="w-2 h-2 rounded-full bg-red-500/50 animate-bounce" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Chat Input */}
            {analysis && (
              <div className="flex-none p-3 md:p-4 border-t border-red-500/10 bg-black/40 backdrop-blur-sm cryptic-shadow">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter your message... (Shift+Enter for new line)"
                    disabled={loading}
                    rows={1}
                    className="flex-1 bg-black/20 text-red-400/90 border border-red-500/20 rounded px-2 md:px-3 py-1.5 text-sm placeholder:text-red-500/30 focus:outline-none focus:border-red-500/40 hover-glow disabled:opacity-50 resize-none min-h-[38px] max-h-[200px] overflow-y-auto custom-scrollbar"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    className="px-2 md:px-3 py-1.5 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow min-w-[60px] md:min-w-[80px] h-[38px]"
                  >
                    {loading ? (
                      <Spinner size="sm" />
                    ) : (
                      'Send'
                    )}
                  </button>
                </form>
                <div className="mt-1 text-xs text-red-500/40">
                  Supports Markdown: **bold**, *italic*, - bullets, etc.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* System Controls Panel */}
        <div className="w-full bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern">
          <div className="flex-none border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm cryptic-shadow">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
              <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">SYSTEM CONTROLS</h3>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={loading ? handleCancelScraping : handleScrape}
                className={`w-full px-3 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 ancient-text ${!loading && !analysis ? 'pulse-action' : ''}`}
              >
                {loading ? 'ABORT SEQUENCE' : 'EXECUTE DATA EXTRACTION'}
              </button>
              {analysis && !isAnalyzing && (
                <button
                  onClick={handleUpdateAnalysis}
                  className="w-full px-3 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 ancient-text"
                >
                  UPDATE ANALYSIS
                </button>
              )}
              {tweets.length > 0 && (
                <button
                  onClick={handleClearData}
                  className="w-full px-3 py-2 border border-red-500/20 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs ancient-text"
                >
                  CLEAR DATA
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full px-3 py-2 border border-red-500/20 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs ancient-text"
              >
                TERMINATE SESSION
              </button>
            </div>
          </div>
        </div>

        {/* Personality Fine-Tuning Panel */}
        <div className="w-full bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern">
          <div className="flex-none border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm cryptic-shadow">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
              <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">PERSONALITY FINE-TUNING</h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 backdrop-blur-sm bg-black/20 dynamic-bg max-h-[60vh]">
            {analysis ? (
              <div className="space-y-6">
                {/* Personality Traits */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box" />
                    <span className="glow-text">Key Traits</span>
                  </h4>
                  <div className="space-y-4">
                    {analysis.traits.map((trait: { name: string; score: number; explanation: string }, index: number) => {
                      return (
                        <div key={`trait-${index}-${trait.name}`} className="space-y-2 hover-glow">
                          <div className="flex justify-between text-xs text-red-400/70">
                            <span className="hover-text-glow capitalize">{trait.name}</span>
                            <span className="hover-text-glow">
                              {getTraitLabel(tuning.traitModifiers[trait.name])}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="25"
                            value={tuning.traitModifiers[trait.name]}
                            onChange={(e) => handleTraitAdjustment(trait.name, parseInt(e.target.value))}
                            className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                          />
                          <p className="text-xs text-red-400/50 mt-1 hover-text-glow">
                            {trait.explanation}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Interest Weights */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box" />
                    <span className="glow-text">Interests & Topics</span>
                  </h4>
                  <div className="space-y-3">
                    {analysis.interests.map((interest: string, index: number) => {
                      return (
                        <div key={`interest-${index}-${interest}`} className="space-y-1">
                          <div className="flex justify-between items-center text-xs text-red-400/70">
                            <div className="flex-1">
                              <span className={tuning.interestWeights[interest] === 0 ? 'line-through opacity-50' : ''}>
                                {interest}
                                <button
                                  onClick={() => handleInterestWeight(interest, 0)}
                                  className="ml-2 text-red-500/50 hover:text-red-500/70"
                                  title="Disable interest"
                                >
                                  ×
                                </button>
                              </span>
                            </div>
                            <div className="w-20 text-right">
                              {getWeightLabel(tuning.interestWeights[interest] || 0)}
                            </div>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="25"
                            value={Math.round((tuning.interestWeights[interest] || 0) / 25) * 25}
                            onChange={(e) => handleInterestWeight(interest, parseInt(e.target.value))}
                            className={`w-full accent-red-500/50 bg-red-500/10 rounded h-1 ${
                              tuning.interestWeights[interest] === 0 ? 'opacity-50' : ''
                            }`}
                          />
                        </div>
                      );
                    })}

                    {/* Custom Interests */}
                    {tuning.customInterests.map((interest: string, index: number) => (
                      <div key={`custom-interest-${index}-${interest}`} className="space-y-1">
                        <div className="flex justify-between items-center text-xs text-red-400/70">
                          <div className="flex-1">
                            <span className={tuning.interestWeights[interest] === 0 ? 'line-through opacity-50' : ''}>
                              {interest}
                              <button
                                onClick={() => handleRemoveCustomInterest(interest)}
                                className="ml-2 text-red-500/50 hover:text-red-500/70"
                                title="Remove custom interest"
                              >
                                ×
                              </button>
                            </span>
                          </div>
                          <div className="w-20 text-right">
                            {getWeightLabel(tuning.interestWeights[interest] || 0)}
                          </div>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="25"
                          value={Math.round((tuning.interestWeights[interest] || 0) / 25) * 25}
                          onChange={(e) => handleInterestWeight(interest, parseInt(e.target.value))}
                          className={`w-full accent-red-500/50 bg-red-500/10 rounded h-1 ${
                            tuning.interestWeights[interest] === 0 ? 'opacity-50' : ''
                          }`}
                        />
                      </div>
                    ))}

                    {/* Custom Interests Form */}
                    <div className="space-y-2">
                      <form onSubmit={handleAddCustomInterest} className="flex gap-2">
                        <input
                          type="text"
                          value={newInterest}
                          onChange={(e) => setNewInterest(e.target.value)}
                          placeholder="Add custom interest..."
                          className="flex-1 bg-black/20 text-red-400/90 border border-red-500/20 rounded px-3 py-1.5 text-sm placeholder:text-red-500/30 focus:outline-none focus:border-red-500/40 hover-glow"
                        />
                        <button
                          type="submit"
                          disabled={!newInterest.trim()}
                          className="px-3 py-1.5 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow"
                        >
                          Add
                        </button>
                      </form>
                    </div>
                  </div>
                </div>

                {/* Communication Style */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                    <span className="glow-text">Communication Style</span>
                  </h4>
                  <div className="space-y-3">
                    <div className="space-y-1 hover-glow">
                      <div className="flex justify-between text-xs text-red-400/70">
                        <span className="hover-text-glow">Formality</span>
                        <span className="hover-text-glow">
                          {tuning.communicationStyle.formality === 0 ? 'None' :
                           tuning.communicationStyle.formality < 41 ? 'Very Casual' :
                           tuning.communicationStyle.formality < 61 ? 'Casual' :
                           tuning.communicationStyle.formality < 81 ? 'Professional' :
                           'Highly Formal'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={tuning.communicationStyle.formality}
                        onChange={(e) => handleStyleAdjustment('formality', parseInt(e.target.value))}
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                      />
                    </div>

                    <div className="space-y-1 hover-glow">
                      <div className="flex justify-between text-xs text-red-400/70">
                        <span className="hover-text-glow">Technical Level</span>
                        <span className="hover-text-glow">
                          {tuning.communicationStyle.technicalLevel === 0 ? 'None' :
                           tuning.communicationStyle.technicalLevel <= 25 ? 'Basic' :
                           tuning.communicationStyle.technicalLevel <= 50 ? 'Mixed' :
                           tuning.communicationStyle.technicalLevel <= 75 ? 'Detailed' :
                           'Expert'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={tuning.communicationStyle.technicalLevel}
                        onChange={(e) => handleStyleAdjustment('technicalLevel', parseInt(e.target.value))}
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                      />
                    </div>

                    <div className="space-y-1 hover-glow">
                      <div className="flex justify-between text-xs text-red-400/70">
                        <span className="hover-text-glow">Enthusiasm</span>
                        <span className="hover-text-glow">
                          {tuning.communicationStyle.enthusiasm === 0 ? 'None' :
                           tuning.communicationStyle.enthusiasm <= 25 ? 'Reserved' :
                           tuning.communicationStyle.enthusiasm <= 50 ? 'Moderate' :
                           tuning.communicationStyle.enthusiasm <= 75 ? 'High' :
                           'Very High'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={tuning.communicationStyle.enthusiasm}
                        onChange={(e) => handleStyleAdjustment('enthusiasm', parseInt(e.target.value))}
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                      />
                    </div>

                    <div className="space-y-1 hover-glow">
                      <div className="flex justify-between text-xs text-red-400/70">
                        <span className="hover-text-glow">Emoji Usage</span>
                        <span className="hover-text-glow">
                          {tuning.communicationStyle.emojiUsage === 0 ? 'None' :
                           tuning.communicationStyle.emojiUsage <= 25 ? 'Minimal' :
                           tuning.communicationStyle.emojiUsage <= 50 ? 'Moderate' :
                           tuning.communicationStyle.emojiUsage <= 75 ? 'Frequent' :
                           'Very Frequent'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={tuning.communicationStyle.emojiUsage}
                        onChange={(e) => handleStyleAdjustment('emojiUsage', parseInt(e.target.value))}
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-red-500/70 italic text-center glow-text">
                Run personality analysis to enable fine-tuning
              </div>
            )}
          </div>
        </div>

        {/* Personality Analysis Panel */}
        <div className="w-full bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern">
          <div className="flex-none border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm cryptic-shadow">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
              <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">PERSONALITY ANALYSIS</h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 backdrop-blur-sm bg-black/20 dynamic-bg max-h-[60vh]">
            {!analysis ? (
              <div className="text-center">
                {isAnalyzing && (
                  <div className="mb-4 text-red-500/90 tracking-wider uppercase glow-text flex items-center justify-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20" />
                    <span>ANALYZING PERSONALITY</span>
                    {analysisElapsedTime && (
                      <span className="text-red-500/70">[{analysisElapsedTime}]</span>
                    )}
                  </div>
                )}
                <p className="text-red-500/70 mb-4 glow-text">
                  Ready to analyze {tweets.length} tweets for personality insights
                </p>
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className={`px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow ${showAnalysisPrompt && !isAnalyzing ? 'pulse-action' : ''}`}
                >
                  {isAnalyzing ? (
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      <span>ANALYZING</span>
                    </div>
                  ) : (
                    'START ANALYSIS'
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Summary</span>
                  </h4>
                  <div className="prose prose-red prose-invert max-w-none hover-text-glow">
                    <ReactMarkdown>{analysis.summary}</ReactMarkdown>
                  </div>
                </div>

                {/* Key Traits Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Key Traits</span>
                  </h4>
                  <div className="space-y-2">
                    {analysis.traits.map((trait: { name: string; score: number; explanation: string }, index: number) => (
                      <div key={`trait-${index}-${trait.name}`} className="hover-glow">
                        <div className="flex justify-between mb-1 text-xs text-red-400/70">
                          <span className="hover-text-glow font-medium">{trait.name}</span>
                          <span className="hover-text-glow">{trait.score}/10</span>
                        </div>
                        <div className="h-1.5 bg-red-500/10 rounded-full overflow-hidden glow-box mb-2">
                          <div 
                            className="h-full bg-red-500/50 rounded-full"
                            style={{ width: `${trait.score * 10}%` }}
                          />
                        </div>
                        <div className="text-sm text-red-400/70 prose prose-red prose-invert max-w-none hover-text-glow">
                          <ReactMarkdown>{trait.explanation}</ReactMarkdown>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Communication Style Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Communication Style</span>
                  </h4>
                  <div className="prose prose-red prose-invert max-w-none hover-text-glow mb-4">
                    <ReactMarkdown>{analysis.communicationStyle.description}</ReactMarkdown>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-red-500/20 glow-box"></div>
                      <span className="text-red-300/80 hover-text-glow">
                        {analysis.communicationStyle.formality < 41 ? 'Prefers casual, relaxed communication with natural language patterns' :
                         analysis.communicationStyle.formality < 61 ? 'Balances casual and professional tones appropriately' :
                         analysis.communicationStyle.formality < 81 ? 'Maintains professional and structured communication' :
                         'Employs highly formal and sophisticated language'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-red-500/20 glow-box"></div>
                      <span className="text-red-300/80 hover-text-glow">
                        {analysis.communicationStyle.enthusiasm < 41 ? 'Expresses thoughts in a reserved and measured manner' :
                         analysis.communicationStyle.enthusiasm < 61 ? 'Shows balanced enthusiasm in communications' :
                         analysis.communicationStyle.enthusiasm < 81 ? 'Demonstrates clear passion and energy in expression' :
                         'Exhibits intense enthusiasm and excitement in communication'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-red-500/20 glow-box"></div>
                      <span className="text-red-300/80 hover-text-glow">
                        {analysis.communicationStyle.technicalLevel < 41 ? 'Uses accessible language with minimal technical terms' :
                         analysis.communicationStyle.technicalLevel < 61 ? 'Balances technical and general language effectively' :
                         analysis.communicationStyle.technicalLevel < 81 ? 'Frequently incorporates technical terminology' :
                         'Employs sophisticated technical discourse consistently'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-red-500/20 glow-box"></div>
                      <span className="text-red-300/80 hover-text-glow">
                        {analysis.communicationStyle.emojiUsage < 41 ? 'Rarely uses emojis or emotional indicators' :
                         analysis.communicationStyle.emojiUsage < 61 ? 'Moderately incorporates emojis for emphasis' :
                         analysis.communicationStyle.emojiUsage < 81 ? 'Frequently enhances messages with emojis' :
                         'Extensively uses emojis to convey emotion and tone'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interests Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Interests</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {analysis.interests.map((interest: string) => (
                      <span 
                        key={interest}
                        className="px-2 py-1 bg-red-500/5 border border-red-500/20 rounded text-red-300/80 text-sm hover-glow"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Topics & Themes Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Topics & Themes</span>
                  </h4>
                  <ul className="list-none space-y-2">
                    {analysis.topicsAndThemes.map((topic: string, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-red-400/70 hover-text-glow">
                        <div className="w-1 h-1 rounded-full bg-red-500/50"></div>
                        {topic}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Emotional Tone Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Emotional Tone</span>
                  </h4>
                  <div className="prose prose-red prose-invert max-w-none hover-text-glow">
                    <ReactMarkdown>{analysis.emotionalTone}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
            
            {error && (
              <div className="mt-4 p-4 bg-red-500/5 border border-red-500/20 rounded backdrop-blur-sm text-red-400/90">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Archives Panel */}
        <div className="w-full bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern">
          <div className="flex-none flex items-center px-4 py-4 bg-black/40 backdrop-blur-sm border-b border-red-500/10 cryptic-shadow">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
                  <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">ARCHIVES</h3>
                </div>

                {profile.name && (
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box" />
                    <span className="text-xs text-red-500/80 hover-text-glow truncate">@{profile.name}</span>
                  </div>
                )}

                {/* Progress Status */}
                <div className="h-6 flex items-center gap-2 text-red-500/60 overflow-hidden">
                  {loading && (
                    <>
                      <div className="flex items-center gap-1 flex-none">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20 glow-box" />
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-100 shadow-lg shadow-red-500/20 glow-box" />
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-200 shadow-lg shadow-red-500/20 glow-box" />
                      </div>
                      {scanProgress && (
                        <div className="flex items-center gap-2">
                          <span className="uppercase tracking-wider text-xs glow-text truncate">
                            {scanProgress.phase === 'posts' ? 'SCANNING POSTS' : 'SCANNING REPLIES'}: {scanProgress.count}
                          </span>
                          {scrapingElapsedTime && (
                            <span className="text-xs text-red-500/40 glow-text truncate">
                              [{scrapingElapsedTime}]
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 backdrop-blur-sm bg-black/20 dynamic-bg max-h-[60vh]">
            <div className="space-y-2">
              {tweets.length === 0 && (
                <div className="text-red-500/50 italic glow-text">
                  {'>'} Awaiting data collection initialization...
                </div>
              )}

              {tweets.map((tweet, index) => (
                <div 
                  key={tweet.id} 
                  className="text-red-400/80 flex gap-3 hover:bg-red-500/5 transition-all duration-300 py-2 px-3 rounded backdrop-blur-sm border border-transparent hover:border-red-500/10 hover-glow float"
                >
                  <div className="text-red-500/50 select-none font-bold glow-text">[{String(index + 1).padStart(4, '0')}]</div>
                  
                  <div className="flex-1">
                    <div className="text-red-300/90 hover-text-glow">{tweet.text}</div>
                    <div className="text-red-500/40 text-xs flex items-center gap-2 mt-1.5">
                      <span>{tweet.timestamp && new Date(tweet.timestamp).toLocaleString()}</span>
                      {tweet.isReply && (
                        <>
                          <div className="w-1 h-1 rounded-full bg-red-500/20 glow-box" />
                          <span className="glow-text">REPLY</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {tweets.length > 0 && (
                <div className="mt-6 pt-4 border-t border-red-500/10 text-red-500/60 backdrop-blur-sm glow-border">
                  {'>'} Collection Stats: {tweets.length} posts
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout - Preserve Existing */}
      <div className="hidden md:block">
      {/* Left Side Panels Container */}
        <div className="fixed top-16 left-0 md:left-4 flex flex-col gap-4 h-[calc(100vh-84px)] w-[480px] px-4 md:px-0 overflow-y-auto md:overflow-visible transition-all duration-300">
        {/* System Controls Panel */}
          <div className="w-full bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern">
            <div className="flex-none border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm cryptic-shadow">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
              <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">SYSTEM CONTROLS</h3>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={loading ? handleCancelScraping : handleScrape}
                className={`w-full px-3 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 ancient-text ${!loading && !analysis ? 'pulse-action' : ''}`}
              >
                {loading ? 'ABORT SEQUENCE' : 'EXECUTE DATA EXTRACTION'}
              </button>
                {analysis && !isAnalyzing && (
                  <button
                    onClick={handleUpdateAnalysis}
                    className="w-full px-3 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 ancient-text"
                  >
                    UPDATE ANALYSIS
                  </button>
                )}
              {tweets.length > 0 && (
                <button
                  onClick={handleClearData}
                  className="w-full px-3 py-2 border border-red-500/20 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs ancient-text"
                >
                  CLEAR DATA
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full px-3 py-2 border border-red-500/20 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs ancient-text"
              >
                TERMINATE SESSION
              </button>
            </div>
          </div>
        </div>

        {/* Personality Fine-Tuning Panel */}
          <div className="w-full flex-1 bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern overflow-hidden min-h-0">
            <div className="flex-none border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm cryptic-shadow">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
              <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">PERSONALITY FINE-TUNING</h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 backdrop-blur-sm bg-black/20 dynamic-bg">
            {analysis ? (
              <div className="space-y-6">
                {/* Personality Traits */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box" />
                    <span className="glow-text">Key Traits</span>
                  </h4>
                  <div className="space-y-4">
                    {analysis.traits.map((trait: { name: string; score: number; explanation: string }, index: number) => {
                      return (
                        <div key={`trait-${index}-${trait.name}`} className="space-y-2 hover-glow">
                          <div className="flex justify-between text-xs text-red-400/70">
                            <span className="hover-text-glow capitalize">{trait.name}</span>
                            <span className="hover-text-glow">
                              {getTraitLabel(tuning.traitModifiers[trait.name])}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="25"
                            value={tuning.traitModifiers[trait.name]}
                            onChange={(e) => handleTraitAdjustment(trait.name, parseInt(e.target.value))}
                            className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                          />
                          <p className="text-xs text-red-400/50 mt-1 hover-text-glow">
                            {trait.explanation}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Interest Weights */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box" />
                    <span className="glow-text">Interests & Topics</span>
                  </h4>
                  <div className="space-y-3">
                    {analysis.interests.map((interest: string, index: number) => {
                      return (
                        <div key={`interest-${index}-${interest}`} className="space-y-1">
                          <div className="flex justify-between items-center text-xs text-red-400/70">
                            <div className="flex-1">
                              <span className={tuning.interestWeights[interest] === 0 ? 'line-through opacity-50' : ''}>
                                {interest}
                                <button
                                  onClick={() => handleInterestWeight(interest, 0)}
                                  className="ml-2 text-red-500/50 hover:text-red-500/70"
                                  title="Disable interest"
                                >
                                  ×
                                </button>
                              </span>
                            </div>
                            <div className="w-20 text-right">
                              {getWeightLabel(tuning.interestWeights[interest] || 0)}
                            </div>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="25"
                            value={Math.round((tuning.interestWeights[interest] || 0) / 25) * 25}
                            onChange={(e) => handleInterestWeight(interest, parseInt(e.target.value))}
                            className={`w-full accent-red-500/50 bg-red-500/10 rounded h-1 ${
                              tuning.interestWeights[interest] === 0 ? 'opacity-50' : ''
                            }`}
                          />
                        </div>
                      );
                    })}

                    {/* Custom Interests */}
                    {tuning.customInterests.map((interest: string, index: number) => (
                      <div key={`custom-interest-${index}-${interest}`} className="space-y-1">
                        <div className="flex justify-between items-center text-xs text-red-400/70">
                          <div className="flex-1">
                            <span className={tuning.interestWeights[interest] === 0 ? 'line-through opacity-50' : ''}>
                              {interest}
                              <button
                                onClick={() => handleRemoveCustomInterest(interest)}
                                className="ml-2 text-red-500/50 hover:text-red-500/70"
                                title="Remove custom interest"
                              >
                                ×
                              </button>
                            </span>
                          </div>
                          <div className="w-20 text-right">
                            {getWeightLabel(tuning.interestWeights[interest] || 0)}
                          </div>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="25"
                          value={Math.round((tuning.interestWeights[interest] || 0) / 25) * 25}
                          onChange={(e) => handleInterestWeight(interest, parseInt(e.target.value))}
                          className={`w-full accent-red-500/50 bg-red-500/10 rounded h-1 ${
                            tuning.interestWeights[interest] === 0 ? 'opacity-50' : ''
                          }`}
                        />
                      </div>
                    ))}

                    {/* Custom Interests Form */}
                    <div className="space-y-2">
                      <form onSubmit={handleAddCustomInterest} className="flex gap-2">
                        <input
                          type="text"
                          value={newInterest}
                          onChange={(e) => setNewInterest(e.target.value)}
                          placeholder="Add custom interest..."
                          className="flex-1 bg-black/20 text-red-400/90 border border-red-500/20 rounded px-3 py-1.5 text-sm placeholder:text-red-500/30 focus:outline-none focus:border-red-500/40 hover-glow"
                        />
                        <button
                          type="submit"
                          disabled={!newInterest.trim()}
                          className="px-3 py-1.5 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow"
                        >
                          Add
                        </button>
                      </form>
                    </div>
                  </div>
                </div>

                {/* Communication Style */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                    <span className="glow-text">Communication Style</span>
                  </h4>
                  <div className="space-y-3">
                    <div className="space-y-1 hover-glow">
                      <div className="flex justify-between text-xs text-red-400/70">
                        <span className="hover-text-glow">Formality</span>
                        <span className="hover-text-glow">
                          {tuning.communicationStyle.formality === 0 ? 'None' :
                           tuning.communicationStyle.formality < 41 ? 'Very Casual' :
                           tuning.communicationStyle.formality < 61 ? 'Casual' :
                           tuning.communicationStyle.formality < 81 ? 'Professional' :
                           'Highly Formal'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={tuning.communicationStyle.formality}
                        onChange={(e) => handleStyleAdjustment('formality', parseInt(e.target.value))}
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                      />
                    </div>

                    <div className="space-y-1 hover-glow">
                      <div className="flex justify-between text-xs text-red-400/70">
                        <span className="hover-text-glow">Technical Level</span>
                        <span className="hover-text-glow">
                          {tuning.communicationStyle.technicalLevel === 0 ? 'None' :
                           tuning.communicationStyle.technicalLevel <= 25 ? 'Basic' :
                           tuning.communicationStyle.technicalLevel <= 50 ? 'Mixed' :
                           tuning.communicationStyle.technicalLevel <= 75 ? 'Detailed' :
                           'Expert'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={tuning.communicationStyle.technicalLevel}
                        onChange={(e) => handleStyleAdjustment('technicalLevel', parseInt(e.target.value))}
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                      />
                    </div>

                    <div className="space-y-1 hover-glow">
                      <div className="flex justify-between text-xs text-red-400/70">
                        <span className="hover-text-glow">Enthusiasm</span>
                        <span className="hover-text-glow">
                          {tuning.communicationStyle.enthusiasm === 0 ? 'None' :
                           tuning.communicationStyle.enthusiasm <= 25 ? 'Reserved' :
                           tuning.communicationStyle.enthusiasm <= 50 ? 'Moderate' :
                           tuning.communicationStyle.enthusiasm <= 75 ? 'High' :
                           'Very High'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={tuning.communicationStyle.enthusiasm}
                        onChange={(e) => handleStyleAdjustment('enthusiasm', parseInt(e.target.value))}
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                      />
                    </div>

                    <div className="space-y-1 hover-glow">
                      <div className="flex justify-between text-xs text-red-400/70">
                        <span className="hover-text-glow">Emoji Usage</span>
                        <span className="hover-text-glow">
                          {tuning.communicationStyle.emojiUsage === 0 ? 'None' :
                           tuning.communicationStyle.emojiUsage <= 25 ? 'Minimal' :
                           tuning.communicationStyle.emojiUsage <= 50 ? 'Moderate' :
                           tuning.communicationStyle.emojiUsage <= 75 ? 'Frequent' :
                           'Very Frequent'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={tuning.communicationStyle.emojiUsage}
                        onChange={(e) => handleStyleAdjustment('emojiUsage', parseInt(e.target.value))}
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-red-500/70 italic text-center glow-text">
                Run personality analysis to enable fine-tuning
              </div>
            )}
          </div>
        </div>
      </div>

        {/* Right Side Panels Container */}
        <div className="fixed top-16 right-0 md:right-4 h-[calc(100vh-84px)] w-[480px] flex flex-col gap-4 px-4 md:px-0 overflow-y-auto md:overflow-visible transition-all duration-300">
          {/* Archives Panel - Top Half */}
          <div className="h-[calc(50%-2px)] min-h-[300px] bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern">
            <div className="flex-none flex items-center px-6 py-4 bg-black/40 backdrop-blur-sm border-b border-red-500/10 cryptic-shadow">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">ARCHIVES</h3>
              </div>

              {profile.name && (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box" />
                    <span className="text-xs text-red-500/80 hover-text-glow truncate">@{profile.name}</span>
                </div>
              )}

              {/* Progress Status */}
                <div className="h-6 flex items-center gap-2 text-red-500/60 overflow-hidden">
                {loading && (
                  <>
                      <div className="flex items-center gap-1 flex-none">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20 glow-box" />
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-100 shadow-lg shadow-red-500/20 glow-box" />
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-200 shadow-lg shadow-red-500/20 glow-box" />
                    </div>
                    {scanProgress && (
                        <div className="flex items-center gap-2">
                          <span className="uppercase tracking-wider text-xs glow-text truncate">
                        {scanProgress.phase === 'posts' ? 'SCANNING POSTS' : 'SCANNING REPLIES'}: {scanProgress.count}
                          </span>
                          {scrapingElapsedTime && (
                            <span className="text-xs text-red-500/40 glow-text truncate">
                              [{scrapingElapsedTime}]
                      </span>
                          )}
                        </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 backdrop-blur-sm bg-black/20 dynamic-bg">
            <div className="space-y-2">
              {tweets.length === 0 && (
                <div className="text-red-500/50 italic glow-text">
                  {'>'} Awaiting data collection initialization...
                </div>
              )}

              {tweets.map((tweet, index) => (
                <div 
                  key={tweet.id} 
                  className="text-red-400/80 flex gap-3 hover:bg-red-500/5 transition-all duration-300 py-2 px-3 rounded backdrop-blur-sm border border-transparent hover:border-red-500/10 hover-glow float"
                >
                  <div className="text-red-500/50 select-none font-bold glow-text">[{String(index + 1).padStart(4, '0')}]</div>
                  
                  <div className="flex-1">
                    <div className="text-red-300/90 hover-text-glow">{tweet.text}</div>
                    <div className="text-red-500/40 text-xs flex items-center gap-2 mt-1.5">
                      <span>{tweet.timestamp && new Date(tweet.timestamp).toLocaleString()}</span>
                      {tweet.isReply && (
                        <>
                          <div className="w-1 h-1 rounded-full bg-red-500/20 glow-box" />
                          <span className="glow-text">REPLY</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {tweets.length > 0 && (
                <div className="mt-6 pt-4 border-t border-red-500/10 text-red-500/60 backdrop-blur-sm glow-border">
                  {'>'} Collection Stats: {tweets.length} posts
                </div>
              )}
            </div>
          </div>
        </div>

          {/* Personality Analysis Panel - Bottom Half */}
          <div className="h-[calc(50%-2px)] min-h-[300px] bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern">
            <div className="flex-none border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm cryptic-shadow">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
              <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">PERSONALITY ANALYSIS</h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 backdrop-blur-sm bg-black/20 dynamic-bg">
            {!analysis ? (
              <div className="text-center">
                  {isAnalyzing && (
                    <div className="mb-4 text-red-500/90 tracking-wider uppercase glow-text flex items-center justify-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20" />
                      <span>ANALYZING PERSONALITY</span>
                      {analysisElapsedTime && (
                        <span className="text-red-500/70">[{analysisElapsedTime}]</span>
                      )}
                    </div>
                  )}
                <p className="text-red-500/70 mb-4 glow-text">
                  Ready to analyze {tweets.length} tweets for personality insights
                </p>
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className={`px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow ${showAnalysisPrompt && !isAnalyzing ? 'pulse-action' : ''}`}
                >
                  {isAnalyzing ? (
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                        <span>ANALYZING</span>
                    </div>
                  ) : (
                    'START ANALYSIS'
                  )}
                </button>
              </div>
            ) : (
                <div className="space-y-4">
                  {/* Summary Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Summary</span>
                  </h4>
                  <div className="prose prose-red prose-invert max-w-none hover-text-glow">
                    <ReactMarkdown>{analysis.summary}</ReactMarkdown>
                  </div>
                </div>

                  {/* Key Traits Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Key Traits</span>
                  </h4>
                  <div className="space-y-2">
                    {analysis.traits.map((trait: { name: string; score: number; explanation: string }, index: number) => (
                      <div key={`trait-${index}-${trait.name}`} className="hover-glow">
                        <div className="flex justify-between mb-1 text-xs text-red-400/70">
                          <span className="hover-text-glow font-medium">{trait.name}</span>
                          <span className="hover-text-glow">{trait.score}/10</span>
                        </div>
                        <div className="h-1.5 bg-red-500/10 rounded-full overflow-hidden glow-box mb-2">
                          <div 
                            className="h-full bg-red-500/50 rounded-full"
                            style={{ width: `${trait.score * 10}%` }}
                          />
                        </div>
                        <div className="text-sm text-red-400/70 prose prose-red prose-invert max-w-none hover-text-glow">
                          <ReactMarkdown>{trait.explanation}</ReactMarkdown>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                  {/* Communication Style Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Communication Style</span>
                  </h4>
                  <div className="prose prose-red prose-invert max-w-none hover-text-glow mb-4">
                    <ReactMarkdown>{analysis.communicationStyle.description}</ReactMarkdown>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-red-500/20 glow-box"></div>
                      <span className="text-red-300/80 hover-text-glow">
                        {analysis.communicationStyle.formality < 41 ? 'Prefers casual, relaxed communication with natural language patterns' :
                         analysis.communicationStyle.formality < 61 ? 'Balances casual and professional tones appropriately' :
                         analysis.communicationStyle.formality < 81 ? 'Maintains professional and structured communication' :
                         'Employs highly formal and sophisticated language'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-red-500/20 glow-box"></div>
                      <span className="text-red-300/80 hover-text-glow">
                        {analysis.communicationStyle.enthusiasm < 41 ? 'Expresses thoughts in a reserved and measured manner' :
                         analysis.communicationStyle.enthusiasm < 61 ? 'Shows balanced enthusiasm in communications' :
                         analysis.communicationStyle.enthusiasm < 81 ? 'Demonstrates clear passion and energy in expression' :
                         'Exhibits intense enthusiasm and excitement in communication'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-red-500/20 glow-box"></div>
                      <span className="text-red-300/80 hover-text-glow">
                        {analysis.communicationStyle.technicalLevel < 41 ? 'Uses accessible language with minimal technical terms' :
                         analysis.communicationStyle.technicalLevel < 61 ? 'Balances technical and general language effectively' :
                         analysis.communicationStyle.technicalLevel < 81 ? 'Frequently incorporates technical terminology' :
                         'Employs sophisticated technical discourse consistently'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-red-500/20 glow-box"></div>
                      <span className="text-red-300/80 hover-text-glow">
                        {analysis.communicationStyle.emojiUsage < 41 ? 'Rarely uses emojis or emotional indicators' :
                         analysis.communicationStyle.emojiUsage < 61 ? 'Moderately incorporates emojis for emphasis' :
                         analysis.communicationStyle.emojiUsage < 81 ? 'Frequently enhances messages with emojis' :
                         'Extensively uses emojis to convey emotion and tone'}
                      </span>
                    </div>
                  </div>
                </div>
                
                  {/* Interests Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Interests</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {analysis.interests.map((interest: string) => (
                      <span 
                        key={interest}
                        className="px-2 py-1 bg-red-500/5 border border-red-500/20 rounded text-red-300/80 text-sm hover-glow"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
                
                  {/* Topics & Themes Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Topics & Themes</span>
                  </h4>
                  <ul className="list-none space-y-2">
                    {analysis.topicsAndThemes.map((topic: string, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-red-400/70 hover-text-glow">
                        <div className="w-1 h-1 rounded-full bg-red-500/50"></div>
                        {topic}
                      </li>
                    ))}
                  </ul>
                </div>
                
                  {/* Emotional Tone Section */}
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text">Emotional Tone</span>
                  </h4>
                  <div className="prose prose-red prose-invert max-w-none hover-text-glow">
                    <ReactMarkdown>{analysis.emotionalTone}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
            
            {error && (
              <div className="mt-4 p-4 bg-red-500/5 border border-red-500/20 rounded backdrop-blur-sm text-red-400/90">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>

        {/* Main Chat Interface Container */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none pt-16">
          <div className="w-[calc(100%-1040px)] min-w-[400px] max-w-[1040px] h-[calc(100vh-84px)] mx-auto mb-4 backdrop-blur-md bg-black/40 border border-red-500/10 rounded-lg shadow-2xl hover-glow pointer-events-auto z-10 ancient-border rune-pattern overflow-hidden transition-all duration-300">
            <div className="flex flex-col h-full min-h-0">
            {/* Chat Header */}
              <div className="flex-none flex items-center justify-between px-4 md:px-6 py-4 bg-black/40 backdrop-blur-sm border-b border-red-500/10 rounded-t-lg cryptic-shadow">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">NEURAL INTERFACE</h3>
              </div>
              <button
                onClick={onClose}
                className="text-red-500/70 hover:text-red-500/90 ancient-text"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>

              {/* Chat Messages Container */}
              <div className="flex-1 overflow-y-auto custom-scrollbar backdrop-blur-sm bg-black/20 ancient-scroll min-h-0">
              {!analysis ? (
                  <div className="text-red-500/70 italic text-center glow-text p-4">
                  Start personality analysis to begin chat interaction
                </div>
              ) : (
                <>
                    {/* Sticky Profile Section */}
                    <div className="sticky top-0 z-10 p-4 bg-black/40 backdrop-blur-md">
                      <div className="flex flex-col items-center gap-4 border border-red-500/10 rounded-lg hover-glow ancient-border p-4">
                    <div className="w-20 h-20 rounded-full border-2 border-red-500/20 overflow-hidden hover-glow">
                      {profile.imageUrl ? (
                        <Image
                          src={profile.imageUrl}
                          alt={profile.name || 'Profile'}
                          className="w-full h-full object-cover"
                          width={80}
                          height={80}
                        />
                      ) : (
                        <div className="w-full h-full bg-red-500/5 flex items-center justify-center">
                          <span className="text-red-500/50 text-2xl">?</span>
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <h4 className="text-red-500/90 font-bold tracking-wider ancient-text">
                        {profile.name ? `@${profile.name}` : 'Anonymous User'}
                      </h4>
                      {profile.bio && (
                        <p className="text-red-400/70 text-sm mt-1 hover-text-glow max-w-md">
                          {profile.bio}
                        </p>
                      )}
                        </div>
                    </div>
                  </div>

                    {/* Messages Section with padding to account for sticky header */}
                    <div className="p-4 space-y-4">
                  {messages.map((msg, i) => (
                    <div 
                      key={i}
                      className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`max-w-[80%] rounded backdrop-blur-sm border border-red-500/10 shadow-lg hover-glow float
                          ${msg.isUser 
                            ? 'bg-red-500/5 text-red-400/90' 
                            : 'bg-black/40 text-red-300/90'
                          } px-4 py-2 text-sm`}
                      >
                            <div className="prose prose-red prose-invert max-w-none hover-text-glow whitespace-pre-wrap">
                              <ReactMarkdown>{msg.text}</ReactMarkdown>
                            </div>
                      </div>
                    </div>
                  ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg p-3 bg-red-500/5 text-red-500/80">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500/50 animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-2 h-2 rounded-full bg-red-500/50 animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2 h-2 rounded-full bg-red-500/50 animate-bounce" />
                    </div>
                  </div>
                </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </>
              )}
            </div>

            {/* Chat Input */}
            {analysis && (
                <div className="flex-none p-3 md:p-4 border-t border-red-500/10 bg-black/40 backdrop-blur-sm cryptic-shadow">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <textarea
                      ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Enter your message... (Shift+Enter for new line)"
                    disabled={loading}
                      rows={1}
                      className="flex-1 bg-black/20 text-red-400/90 border border-red-500/20 rounded px-2 md:px-3 py-1.5 text-sm placeholder:text-red-500/30 focus:outline-none focus:border-red-500/40 hover-glow disabled:opacity-50 resize-none min-h-[38px] max-h-[200px] overflow-y-auto custom-scrollbar"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                      className="px-2 md:px-3 py-1.5 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow min-w-[60px] md:min-w-[80px] h-[38px]"
                  >
                    {loading ? (
                      <Spinner size="sm" />
                    ) : (
                      'Send'
                    )}
                  </button>
                </form>
                  <div className="mt-1 text-xs text-red-500/40">
                    Supports Markdown: **bold**, *italic*, - bullets, etc.
                  </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Consent Modal */}
      {showConsent && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => {
            setShowConsent(false)
            if (loading) handleCancelScraping()
          }}
        >
          <div 
            className="bg-black/40 backdrop-blur-md p-8 rounded-lg shadow-2xl w-[500px] border border-red-500/20 hover-glow float"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4 border-b border-red-500/20 pb-4 glow-border">
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
              <h3 className="text-lg font-bold text-red-500/90 tracking-wider glow-text">SYSTEM AUTHORIZATION REQUIRED</h3>
            </div>
            <div className="space-y-4 text-red-400/90">
              <p className="uppercase tracking-wider glow-text">
                This operation will collect the following data:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-red-300/80">
                <li className="hover-text-glow">Profile metrics and identifiers</li>
                <li className="hover-text-glow">Recent transmission logs</li>
                <li className="hover-text-glow">Associated media content</li>
              </ul>
              <p className="text-red-300/80 hover-text-glow">
                Estimated operation time: 1-2 minutes. Maintain connection stability during the process.
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowConsent(false)}
                className="px-4 py-2 border border-red-500/20 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs hover-glow"
              >
                Abort
              </button>
              <button
                onClick={startScraping}
                className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
              >
                Authorize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {showComplete && !loading && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={handleCloseModal}
        >
          <div 
            className="bg-black/40 backdrop-blur-md p-8 rounded-lg shadow-2xl w-[500px] border border-red-500/20 hover-glow float"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 border-b border-red-500/20 pb-4 glow-border">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                <h3 className="text-lg font-bold tracking-wider text-red-500/90 glow-text">OPERATION COMPLETE</h3>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-red-500/70 hover:text-red-500/90 transition-colors hover-text-glow"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-red-400/90">
                <p className="uppercase tracking-wider mb-2 glow-text">Data Collection Summary:</p>
                <ul className="list-disc pl-5 space-y-1 text-red-300/80">
                  <li className="hover-text-glow">{tweets.length} posts collected</li>
                </ul>
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 hover-glow"
                >
                  Close Terminal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
} 