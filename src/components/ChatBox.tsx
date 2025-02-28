import { useState, useEffect, useRef, Dispatch, SetStateAction, useCallback } from 'react'
import { Tweet, TwitterProfile } from '@/types/scraper'
import { PersonalityAnalysis } from '@/lib/openai'
import type { Conversation, Message } from '@/types/conversation'
import ReactMarkdown from 'react-markdown'
import { Spinner } from '../components/ui/spinner'
import '../styles/glow.css'
import Image from 'next/image'
import { ConversationList } from './ConversationList'
import { usePersonalityCache } from '@/hooks/usePersonalityCache';
import { CacheStatusIndicator } from './CacheStatusIndicator';

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
  phase: 'posts' | 'replies' | 'complete'
  count: number
  message?: string
}

export default function ChatBox({ tweets, profile, onClose, onTweetsUpdate }: ChatBoxProps) {
  const [messages, setMessages] = useState<Array<{text: string, isUser: boolean}>>([])
  const [input, setInput] = useState('')
  const [analysis, setAnalysis] = useState<PersonalityAnalysis | null>(null)
  const [loading, setLoading] = useState(false) // For data fetching
  const [isChatLoading, setIsChatLoading] = useState(false) // For chat responses
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number>();
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  // Add cache hook
  const personalityCache = usePersonalityCache({
    username: profile.name || ''
  });

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

  const handleTraitAdjustment = async (traitName: string, score: number) => {
    // Convert UI score (0-100) to analysis score (0-10)
    const analysisScore = Math.round((score / 100) * 10);
    
    setTuning(prev => ({
      ...prev,
      traitModifiers: {
        ...prev.traitModifiers,
        [traitName]: score
      }
    }));

    // Save updated tuning to cache if we have analysis
    if (analysis) {
      // Find existing trait to preserve explanation
      const existingTrait = analysis.traits.find(t => t.name === traitName);
      if (!existingTrait) return;

      await personalityCache.saveToCache({
        ...analysis,
        traits: analysis.traits.map(trait => 
          trait.name === traitName 
            ? { ...trait, score: analysisScore }
            : trait
        )
      });
    }
  }

  const handleInterestWeight = async (interest: string, weight: number) => {
    setTuning(prev => ({
      ...prev,
      interestWeights: {
        ...prev.interestWeights,
        [interest]: weight
      }
    }));

    // Save updated interests to cache if we have analysis
    if (analysis) {
      await personalityCache.saveToCache({
        ...analysis,
        interests: Object.entries({
          ...tuning.interestWeights,
          [interest]: weight
        })
          .filter(([, weight]) => weight > 0)
          .map(([interest]) => interest)
      });
    }
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

  const handleStyleAdjustment = async (aspect: keyof PersonalityTuning['communicationStyle'], value: number) => {
    setTuning(prev => ({
      ...prev,
      communicationStyle: {
        ...prev.communicationStyle,
        [aspect]: value
      }
    }));

    // Save updated communication style to cache if we have analysis
    if (analysis) {
      await personalityCache.saveToCache({
        ...analysis,
        communicationStyle: {
          ...analysis.communicationStyle,
          [aspect]: value
        }
      });
    }
  }

  const generatePersonalityResponse = async (userMessage: string) => {
    setIsChatLoading(true) // Use chat-specific loading state
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
          conversationHistory,
          conversationId: activeConversationId
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to get response')
      }
      
      const data = await response.json()
      
      // Update active conversation ID if this is a new conversation
      if (data.conversationId && !activeConversationId) {
        setActiveConversationId(data.conversationId)
        // Fetch updated conversation list
        const convsResponse = await fetch('/api/conversations')
        if (convsResponse.ok) {
          const convsData = await convsResponse.json()
          if (convsData.success && Array.isArray(convsData.data)) {
            setConversations(convsData.data)
          }
        }
      }

      setIsTyping(false)
      return data.response
    } catch (err) {
      setIsTyping(false)
      setError(err instanceof Error ? err.message : 'Failed to get response')
      return null
    } finally {
      setIsChatLoading(false) // Clear chat loading state
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isChatLoading) return // Use chat loading state here

    const userMessage = input.trim()
    setInput('')

    // Only proceed if we have personality analysis
    if (analysis) {
      // Add user message to UI immediately
      setMessages(prev => [...prev, { text: userMessage, isUser: true }])
      
      // Generate and add AI response
      const response = await generatePersonalityResponse(userMessage)
      if (response) {
        setMessages(prev => [...prev, { text: response, isUser: false }])
      }

      // If we have an active conversation ID and the messages might be out of sync,
      // fetch the latest messages from the server
      if (activeConversationId) {
        try {
          const response = await fetch('/api/conversations/' + activeConversationId + '/messages')
          if (response.ok) {
            const data = await response.json()
            if (data.success && Array.isArray(data.data)) {
              setMessages(data.data.map((msg: Message) => ({
                text: msg.content,
                isUser: msg.role === 'user'
              })))
            }
          }
        } catch (error) {
          console.error('Error syncing messages:', error)
        }
      }
    }
  }

  // Update handleAnalyze to use cache
  const handleAnalyze = async () => {
    if (!tweets || tweets.length === 0) {
      setError('No tweets available for analysis');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisStartTime(Date.now());

    try {
      // Check cache first
      const cachedData = await personalityCache.fetchCache();
      
      if (cachedData) {
        // Load tuning parameters from cache
        if (cachedData.communicationStyle) {
          setTuning(prev => ({
            ...prev,
            communicationStyle: {
              formality: cachedData.communicationStyle.formality ?? prev.communicationStyle.formality,
              enthusiasm: cachedData.communicationStyle.enthusiasm ?? prev.communicationStyle.enthusiasm,
              technicalLevel: cachedData.communicationStyle.technicalLevel ?? prev.communicationStyle.technicalLevel,
              emojiUsage: cachedData.communicationStyle.emojiUsage ?? prev.communicationStyle.emojiUsage
            }
          }));
        }
        
        if (cachedData.traits) {
          const traitModifiers = cachedData.traits.reduce((acc: Record<string, number>, trait: { name: string; score: number }) => ({
            ...acc,
            // Convert analysis score (0-10) to UI score (0-100)
            [trait.name]: Math.round(trait.score * 10)
          }), {});
          
          setTuning(prev => ({
            ...prev,
            traitModifiers: {
              ...prev.traitModifiers,
              ...traitModifiers
            }
          }));
        }
        
        if (cachedData.interests) {
          const interestWeights = cachedData.interests.reduce((acc: Record<string, number>, interest: string) => ({
            ...acc,
            [interest]: tuning.interestWeights[interest] ?? 50 // Keep existing weight or use default
          }), {});
          
          setTuning(prev => ({
            ...prev,
            interestWeights: {
              ...prev.interestWeights,
              ...interestWeights
            }
          }));
        }

        setAnalysis(cachedData);
        setIsAnalyzing(false);
        setAnalysisStartTime(null);
        return;
      }

      // No cache, perform new analysis
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tweets,
          profile
        })
      });

      if (!response.ok) {
        throw new Error('Failed to analyze personality');
      }

      const newAnalysis = await response.json();
      
      // Update tuning with new analysis values
      const newTraitModifiers = newAnalysis.traits.reduce((acc: Record<string, number>, trait: { name: string; score: number }) => ({
        ...acc,
        // Convert analysis score (0-10) to UI score (0-100)
        [trait.name]: Math.round(trait.score * 10)
      }), {});

      const newInterestWeights = newAnalysis.interests.reduce((acc: Record<string, number>, interest: string) => ({
        ...acc,
        [interest]: tuning.interestWeights[interest] ?? 50 // Keep existing weight or use default
      }), {});

      setTuning(prev => ({
        ...prev,
        traitModifiers: {
          ...prev.traitModifiers,
          ...newTraitModifiers
        },
        interestWeights: {
          ...prev.interestWeights,
          ...newInterestWeights
        },
        communicationStyle: {
          formality: newAnalysis.communicationStyle.formality ?? prev.communicationStyle.formality,
          enthusiasm: newAnalysis.communicationStyle.enthusiasm ?? prev.communicationStyle.enthusiasm,
          technicalLevel: newAnalysis.communicationStyle.technicalLevel ?? prev.communicationStyle.technicalLevel,
          emojiUsage: newAnalysis.communicationStyle.emojiUsage ?? prev.communicationStyle.emojiUsage
        }
      }));

      setAnalysis(newAnalysis);

      // Save new analysis and tuning to cache
      await personalityCache.saveToCache({
        ...newAnalysis,
        traits: (Object.entries(newTraitModifiers) as [string, number][]).map(([name, score]) => ({
          name,
          // Convert UI score (0-100) back to analysis score (0-10) for storage
          score: Math.round(score / 10),
          explanation: newAnalysis.traits.find((t: { name: string }) => t.name === name)?.explanation
        })),
        interests: Object.keys(newInterestWeights),
        communicationStyle: {
          ...newAnalysis.communicationStyle,
          formality: newAnalysis.communicationStyle.formality,
          enthusiasm: newAnalysis.communicationStyle.enthusiasm,
          technicalLevel: newAnalysis.communicationStyle.technicalLevel,
          emojiUsage: newAnalysis.communicationStyle.emojiUsage
        }
      });

    } catch (error) {
      console.error('Analysis error:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze personality');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStartTime(null);
    }
  };

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
    // Show consent modal first
    setShowConsent(true)
  }

  // Handle tweet updates from scraping
  const handleTweetUpdate = (newTweets: Tweet[]) => {
    console.log('handleTweetUpdate called with tweets:', newTweets.length)
    if (Array.isArray(newTweets)) {
      const validTweets = newTweets.filter((t: unknown): t is Tweet => Boolean(t))
      console.log('Updating tweets in UI with valid tweets:', validTweets.length)
      
      // Ensure state updates are processed in order
      Promise.resolve().then(() => {
        onTweetsUpdate(validTweets)
        setScanProgress(prev => {
          const newProgress = {
            phase: prev?.phase || 'posts',
            count: validTweets.length
          }
          console.log('Updating scan progress:', newProgress)
          return newProgress
        })
      })
    }
  }

  const startScraping = async () => {
    if (!profile.name) {
      setError('Profile name is required');
      return;
    }

    setShowConsent(false);
    setLoading(true);
    setError(null);
    setShowComplete(false);
    setShowAnalysisPrompt(false);
    setScrapingStartTime(Date.now());

    // Create new AbortController for this scraping session
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Include session ID and user identifier in request
      const sessionId = `${profile.name}_${Date.now()}`;
      const response = await fetch('/api/scrape', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          username: profile.name,
          sessionId,
          timestamp: Date.now()
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to start scraping');

      while (true) {
        const { done, value } = await reader.read();
        
        if (controller.signal.aborted) {
          // Include session cleanup on abort
          try {
            await fetch(`/api/scrape/abort`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, username: profile.name })
            });
          } catch (error) {
            console.error('Error cleaning up session:', error);
          }
          console.log('Scraping aborted, cleaning up...');
          reader.cancel();
          break;
        }
        
        if (done) {
          console.log('Stream complete')
          try {
            // Fetch final tweets after stream completes
            console.log(`Making final API call to /api/tweets/${profile.name}/all`);
            const fetchTweetsResponse = await fetch(`/api/tweets/${profile.name}/all`, {
              credentials: 'include'
            });
            
            if (!fetchTweetsResponse.ok) {
              throw new Error(`Failed to fetch tweets: ${fetchTweetsResponse.status}`);
            }

            const finalTweets = await fetchTweetsResponse.json();
            console.log(`Successfully fetched ${finalTweets.length} tweets`);
            
            if (Array.isArray(finalTweets) && finalTweets.length > 0) {
              // Update tweets in UI first
              handleTweetUpdate(finalTweets);
              console.log('Successfully updated tweets in UI');
              
              // Then set completion states
              setScanProgress({
                phase: 'complete',
                count: finalTweets.length,
                message: `Collection complete! ${finalTweets.length} tweets collected.`
              });
              setLoading(false);
              setShowComplete(true);
              setShowAnalysisPrompt(true);
              setScrapingStartTime(null);
              setAbortController(null);
              console.log('Set completion states:', { 
                loading: false, 
                showComplete: true, 
                scanProgress: 'complete', 
                tweetCount: finalTweets.length 
              });
            }
          } catch (error) {
            console.error('Error in completion flow:', error);
            setError(error instanceof Error ? error.message : 'Failed to complete processing');
            setLoading(false);
            setAbortController(null);
            setScrapingStartTime(null);
          }
          return;
        }

        // Parse the SSE data
        const text = new TextDecoder().decode(value);
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('Received:', data);

              if (data.error) {
                setError(data.error);
                setLoading(false);
                setAbortController(null);
                setScrapingStartTime(null);
                setScanProgress(null);
                reader.cancel();
                return;
              }

              // Handle progress updates
              if (data.scanProgress) {
                setScanProgress({
                  phase: data.scanProgress.phase,
                  count: data.scanProgress.count,
                  message: data.scanProgress.message
                });
              }

              // Update the data processing to maintain user isolation
              if (data.tweets && data.username === profile.name) {
                // Only update progress during scraping
                if (data.isChunk) {
                  console.log('Processing chunk for user:', profile.name, {
                    chunkIndex: data.chunkIndex,
                    totalTweets: data.totalTweets,
                    chunkSize: data.tweets.length,
                    isLastBatch: data.isLastBatch
                  });

                  // Update scan progress with total tweets
                  if (data.scanProgress) {
                    setScanProgress({
                      phase: data.scanProgress.phase,
                      count: data.totalTweets || data.scanProgress.count,
                      message: data.scanProgress.message
                    });
                  }

                  // For ongoing scraping, batch save tweets and update progress
                  try {
                    // Save current batch
                    const saveBatchResponse = await fetch('/api/tweets/save', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        username: profile.name,
                        sessionId,
                        tweets: data.tweets 
                      })
                    });

                    if (!saveBatchResponse.ok) {
                      console.warn('Failed to save batch to database');
                    }

                    // Immediately fetch and update UI after each batch save
                    const fetchResponse = await fetch(`/api/tweets/${profile.name}/all`, {
                      credentials: 'include'
                    });
                    if (!fetchResponse.ok) {
                      throw new Error('Failed to fetch tweets');
                    }

                    const allTweets = await fetchResponse.json();
                    if (Array.isArray(allTweets)) {
                      console.log('Fetched updated tweets from database:', allTweets.length);
                      handleTweetUpdate(allTweets);
                      console.log('Updated frontend with latest tweets:', allTweets.length);
                    }
                  } catch (error) {
                    console.error('Error updating frontend during scraping:', error);
                  }
                }
              }

              // Handle explicit completion signal if received
              if (data.type === 'complete' && data.username === profile.name) {
                console.log('Received explicit completion signal');
                
                // Fetch final tweets one last time
                try {
                  const finalResponse = await fetch(`/api/tweets/${profile.name}/all`, {
                    credentials: 'include'
                  });
                  if (!finalResponse.ok) {
                    throw new Error('Failed to fetch final tweets');
                  }

                  const finalTweets = await finalResponse.json();
                  if (Array.isArray(finalTweets)) {
                    handleTweetUpdate(finalTweets);
                    console.log('Final tweet update complete:', finalTweets.length);
                  }
                } catch (error) {
                  console.error('Error fetching final tweets:', error);
                }

                setLoading(false);
                setShowComplete(true);
                setShowAnalysisPrompt(true);
                setScrapingStartTime(null);
                setAbortController(null);
                
                // Ensure we have the final tweet count
                setScanProgress({
                  phase: 'complete',
                  count: data.totalTweets || scanProgress?.count || 0,
                  message: `Collection complete! ${data.totalTweets || scanProgress?.count || 0} tweets collected.`
                });
                
                reader.cancel();
                break;
              }
            } catch (err) {
              console.error('Failed to parse:', line, err);
            }
          }
        }
      }
    } catch (error: unknown) {
      console.error('Scraping error:', error);
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        setError('Scraping cancelled by user');
      } else {
        setError(error instanceof Error ? error.message : 'Failed to start scraping');
      }
      setLoading(false);
      setAbortController(null);
      setScrapingStartTime(null);
      setScanProgress(null);
    }
  }

  // Replace with a more focused effect for handling completion
  useEffect(() => {
    if (showComplete) {
      console.log('Completion modal shown - current states:', { loading, showComplete, scanProgress })
    }
  }, [showComplete, loading, scanProgress])

  // Handle modal close
  const handleCloseModal = () => {
    setShowComplete(false)
  }

  // Add auto-scroll effect
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  const handleCancelScraping = useCallback(async () => {
    if (abortController) {
      console.log('Aborting scraping process...')
      try {
      abortController.abort()
      setAbortController(null)
    setLoading(false)
    setScanProgress(null)
    setShowComplete(false)
        setScrapingStartTime(null)
        // Only set error if this was a user-initiated cancellation
        if (!abortController.signal.aborted) {
        setError('Operation cancelled by user')
        }
      } catch (error) {
        console.error('Error during abort:', error)
        setError('Failed to cancel operation')
      }
    }
  }, [abortController])

  const handleClearData = async () => {
    if (!profile.name) {
      setError('Profile name is required');
      return;
    }

    try {
      const response = await fetch('/api/tweets/clear', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username: profile.name,
          timestamp: Date.now() 
        })
      });

      if (!response.ok) {
        throw new Error('Failed to clear tweets from database');
      }

      // Only clear tweets from state, don't close the chat box
      onTweetsUpdate([]); 
      setAnalysis(null);
      setScanProgress(null);
      setShowAnalysisPrompt(false);
      
      // Show success message
      setError('Tweet data cleared successfully');
    } catch (error) {
      console.error('Error clearing tweets:', error);
      setError(error instanceof Error ? error.message : 'Failed to clear tweet data');
    }
  }



  useEffect(() => {
    // Load existing tweets for this user when component mounts
    const loadExistingTweets = async () => {
      if (!profile.name) return;
      
      try {
        const response = await fetch(`/api/tweets/${profile.name}/all`);
        if (!response.ok) {
          throw new Error('Failed to fetch existing tweets');
        }
        
        const existingTweets = await response.json();
        if (Array.isArray(existingTweets)) {
          const validTweets = existingTweets.filter((t: unknown): t is Tweet => Boolean(t));
          onTweetsUpdate(validTweets);
          
          if (validTweets.length > 0) {
            setScanProgress({
              phase: 'complete',
              count: validTweets.length,
              message: `${validTweets.length} tweets loaded from database`
            });
          }
        }
      } catch (error) {
        console.error('Error loading existing tweets:', error);
        setError(error instanceof Error ? error.message : 'Failed to load existing tweets');
      }
    };

    loadExistingTweets();
  }, [profile.name]); // Reload when profile changes

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
    // Invalidate the cache first
    await personalityCache.invalidateCache();
    
    // Reset the analysis state and start a new analysis
    setAnalysis(null);
    await handleAnalyze();
  };

  // Load conversations and personality cache on mount
  useEffect(() => {
    const loadInitialData = async () => {
      if (!profile.name) return;
      
      try {
        setLoading(true);
        
        // Load personality cache first
        const cachedAnalysis = await personalityCache.fetchCache();
        if (cachedAnalysis) {
          setAnalysis(cachedAnalysis);
          // Initialize tuning from cache
          const communicationStyle = cachedAnalysis.communicationStyle || {
            formality: 50,
            enthusiasm: 50,
            technicalLevel: 50,
            emojiUsage: 50
          };
          
          // Extract interests and their weights
          const interestWeights: Record<string, number> = {};
          cachedAnalysis.interests.forEach((interest: string) => {
            interestWeights[interest] = 50; // Default weight if not specified
          });

          setTuning(prev => ({
            ...prev,
            communicationStyle,
            interestWeights
          }));
        }

        // Load conversations
        const response = await fetch('/api/conversations');
        if (!response.ok) {
          throw new Error('Failed to fetch conversations');
        }
        
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          setConversations(data.data);
          // Set active conversation if exists
          const activeConv = data.data.find((c: Conversation) => c.metadata.isActive);
          if (activeConv) {
            setActiveConversationId(activeConv.id);
            // Load messages for active conversation
            const messagesResponse = await fetch('/api/conversations/' + activeConv.id + '/messages');
            if (messagesResponse.ok) {
              const messagesData = await messagesResponse.json();
              if (messagesData.success && Array.isArray(messagesData.data)) {
                setMessages(messagesData.data.map((msg: Message) => ({
                  text: msg.content,
                  isUser: msg.role === 'user'
                })));
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
        setError(error instanceof Error ? error.message : 'Failed to load initial data');
      } finally {
        setLoading(false);
        setIsLoadingConversations(false);
      }
    };

    loadInitialData();
  }, [profile.name]); // Remove personalityCache from dependencies

  // Remove the old separate loading effects
  // ... existing code ...

  // Handle conversation selection
  const handleSelectConversation = async (conversation: Conversation) => {
    try {
      setLoading(true);
      const response = await fetch('/api/conversations/' + conversation.id + '/messages');
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      
      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        setMessages(data.data.map((msg: Message) => ({
          text: msg.content,
          isUser: msg.role === 'user'
        })));
        setActiveConversationId(conversation.id);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      setError(error instanceof Error ? error.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  // Handle new chat creation
  const handleNewChat = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error('Failed to create new chat');
      }

      const data = await response.json();
      if (data.success && data.data) {
        setConversations(prev => [data.data, ...prev]);
        setActiveConversationId(data.data.id);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
      setError(error instanceof Error ? error.message : 'Failed to create new chat');
    } finally {
      setLoading(false);
    }
  };

  // Handle conversation deletion
  const handleDeleteConversation = async (conversationId: number) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }

      // Remove conversation from state
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      
      // If this was the active conversation, clear messages and active ID
      if (conversationId === activeConversationId) {
        setMessages([]);
        setActiveConversationId(undefined);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete conversation');
    }
  };

  return (
    <>
      {/* Main Container - Mobile First Layout */}
      <div className="flex flex-col w-full min-h-screen pt-5 sm:pt-9 md:pt-9 lg:pt-16 px-2 sm:px-5 pb-6 gap-4 sm:gap-6 md:gap-8 mobile-layout relative z-0 overflow-x-hidden">
        {/* Chat Interface */}
        <div className="w-full backdrop-blur-md bg-black/40 border border-red-500/10 rounded-lg shadow-2xl hover-glow ancient-border rune-pattern overflow-hidden relative z-10 mb-4 sm:mb-6 md:mb-8">
          <div className="flex flex-col h-[85vh] sm:h-[80vh] md:h-[75vh]">
            {/* Chat Header */}
            <div className="flex-none flex items-center justify-between px-3 sm:px-4 py-5 sm:py-5 bg-black/40 backdrop-blur-sm border-b border-red-500/10 rounded-t-lg cryptic-shadow relative z-20">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">NEURAL INTERFACE</h3>
              </div>
              <ConversationList
                conversations={conversations}
                activeConversationId={activeConversationId}
                onSelectConversation={handleSelectConversation}
                onNewChat={handleNewChat}
                onDeleteConversation={handleDeleteConversation}
                isLoading={isLoadingConversations}
              />
            </div>

            {/* Chat Messages Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 sm:p-3 md:p-4 space-y-2 sm:space-y-3 md:space-y-4 backdrop-blur-sm bg-black/20 ancient-scroll">
              {!analysis ? (
                <div className="text-red-500/70 italic text-center glow-text">
                  Start personality analysis to begin chat interaction
                </div>
              ) : (
                <>
                  {/* Profile Picture Section */}
                  <div className="flex flex-col items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8 p-3 sm:p-4 bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg hover-glow ancient-border">
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
              <div className="flex-none p-2 sm:p-3 md:p-4 border-t border-red-500/10 bg-black/40 backdrop-blur-sm cryptic-shadow">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter your message... (Shift+Enter for new line)"
                    disabled={isChatLoading}
                    rows={1}
                    className="flex-1 bg-black/20 text-red-400/90 border border-red-500/20 rounded px-2 md:px-3 py-1.5 text-sm placeholder:text-red-500/30 focus:outline-none focus:border-red-500/40 hover-glow disabled:opacity-50 resize-none min-h-[38px] max-h-[200px] overflow-y-auto custom-scrollbar"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isChatLoading}
                    className="px-2 md:px-3 py-1.5 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow min-w-[60px] md:min-w-[80px] h-[38px]"
                  >
                    {isChatLoading ? (
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
        <div className="w-full bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern mb-4 sm:mb-6 md:mb-8">
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
        <div className="w-full bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern mb-4 sm:mb-6 md:mb-8">
          <div className="flex-none border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm cryptic-shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">PERSONALITY FINE-TUNING</h3>
              </div>
              {analysis && (
                <CacheStatusIndicator
                  isFresh={personalityCache.isFresh}
                  lastUpdated={personalityCache.lastUpdated}
                  isLoading={personalityCache.isLoading}
                  onRefresh={handleAnalyze}
                  className="ml-4"
                />
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 backdrop-blur-sm bg-black/20 dynamic-bg max-h-[60vh] sm:max-h-[50vh] md:max-h-[40vh] relative">
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
                          <div className="flex justify-between items-center">
                            <span className="text-red-400/90 text-[14px] tracking-wide capitalize">{trait.name}</span>
                            <span className="text-red-500/80 font-mono text-sm bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">
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
                            className="w-full accent-red-500/50 bg-red-500/10 rounded h-1.5"
                          />
                          <div className="text-[14px] leading-relaxed text-red-300/80 pl-2 border-l border-red-500/10">
                            {trait.explanation}
                          </div>
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
                  <div className="space-y-3 bg-black/20 rounded-lg p-4">
                    {analysis.interests.map((interest: string, index: number) => {
                      return (
                        <div key={`interest-${index}-${interest}`} className="space-y-2 hover-glow">
                          <div className="flex justify-between items-center text-red-400/90">
                            <div className="flex-1">
                              <span className={`text-[14px] tracking-wide ${tuning.interestWeights[interest] === 0 ? 'line-through opacity-50' : ''}`}>
                                {interest.replace(/\*\*/g, '')}
                                <button
                                  onClick={() => handleInterestWeight(interest, 0)}
                                  className="ml-2 text-red-500/50 hover:text-red-500/70 transition-colors duration-200"
                                  title="Disable interest"
                                >
                                  ×
                                </button>
                              </span>
                            </div>
                            <div className="text-red-500/80 font-mono text-sm bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">
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
                            className={`w-full accent-red-500/50 bg-red-500/10 rounded h-1.5 ${
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
                              {interest.replace(/\*\*/g, '')}
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
                <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text text-base">Communication Style</span>
                  </h4>
                  <div className="space-y-4 bg-black/20 rounded-lg p-4">
                    <div className="space-y-2 hover-glow">
                      <div className="flex justify-between text-red-400/90">
                        <span className="text-[14px] tracking-wide">Formality</span>
                        <span className="text-red-500/80 font-mono text-sm bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">
                          {tuning.communicationStyle.formality === 0 ? 'Very Casual' :
                           tuning.communicationStyle.formality <= 25 ? 'Casual' :
                           tuning.communicationStyle.formality <= 50 ? 'Balanced' :
                           tuning.communicationStyle.formality <= 75 ? 'Professional' :
                           'Very Formal'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={tuning.communicationStyle.formality}
                        onChange={(e) => handleStyleAdjustment('formality', parseInt(e.target.value))}
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1.5"
                      />
                    </div>

                    <div className="space-y-2 hover-glow">
                      <div className="flex justify-between text-red-400/90">
                        <span className="text-[14px] tracking-wide">Enthusiasm</span>
                        <span className="text-red-500/80 font-mono text-sm bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">
                          {tuning.communicationStyle.enthusiasm === 0 ? 'Reserved' :
                           tuning.communicationStyle.enthusiasm <= 25 ? 'Mild' :
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
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1.5"
                      />
                    </div>

                    <div className="space-y-2 hover-glow">
                      <div className="flex justify-between text-red-400/90">
                        <span className="text-[14px] tracking-wide">Technical Level</span>
                        <span className="text-red-500/80 font-mono text-sm bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">
                          {tuning.communicationStyle.technicalLevel === 0 ? 'Basic' :
                           tuning.communicationStyle.technicalLevel <= 25 ? 'Simple' :
                           tuning.communicationStyle.technicalLevel <= 50 ? 'Moderate' :
                           tuning.communicationStyle.technicalLevel <= 75 ? 'Advanced' :
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
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1.5"
                      />
                    </div>

                    <div className="space-y-2 hover-glow">
                      <div className="flex justify-between text-red-400/90">
                        <span className="text-[14px] tracking-wide">Emoji Usage</span>
                        <span className="text-red-500/80 font-mono text-sm bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">
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
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1.5"
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
        <div className="w-full bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern mb-4 sm:mb-6 md:mb-8">
          <div className="flex-none border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm cryptic-shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">PERSONALITY ANALYSIS</h3>
              </div>
              {analysis && (
                <CacheStatusIndicator
                  isFresh={personalityCache.isFresh}
                  lastUpdated={personalityCache.lastUpdated}
                  isLoading={personalityCache.isLoading}
                  onRefresh={handleAnalyze}
                  className="ml-4"
                />
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 space-y-6 backdrop-blur-sm bg-black/20 dynamic-bg max-h-[60vh] sm:max-h-[50vh] md:max-h-[40vh] relative touch-action-pan-y">
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
                <div className="bg-black/20 text-justify rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text text-base">Summary</span>
                  </h4>
                  <div className="prose prose-red prose-invert max-w-none hover-text-glow prose-p:text-red-300/90 prose-p:leading-relaxed prose-p:text-[15px]">
                    <ReactMarkdown>{analysis.summary}</ReactMarkdown>
                  </div>
                </div>

                {/* Key Traits Section */}
                <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text text-base">Key Traits</span>
                  </h4>
                  <div className="space-y-6">
                    {analysis.traits.map((trait: { name: string; score: number; explanation: string }, index: number) => (
                      <div key={`trait-${index}-${trait.name}`} className="hover-glow">
                        <div className="flex justify-between mb-2 items-center">
                          <span className="text-red-400/90 font-medium tracking-wide text-[15px] capitalize">{trait.name}</span>
                          <span className="text-red-500/80 font-mono text-sm bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">{trait.score}/10</span>
                        </div>
                        <div className="h-1.5 bg-red-500/10 rounded-full overflow-hidden glow-box mb-3">
                          <div 
                            className="h-full bg-red-500/50 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${trait.score * 10}%` }}
                          />
                        </div>
                        <div className="text-[14px] leading-relaxed text-red-300/80 prose prose-red prose-invert max-w-none hover-text-glow pl-2 border-l border-red-500/10">
                          <ReactMarkdown>{trait.explanation}</ReactMarkdown>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Communication Style Section */}
                <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text text-base">Communication Style</span>
                  </h4>
                  <div className="prose prose-red prose-invert max-w-none hover-text-glow prose-p:text-red-300/90 prose-p:leading-relaxed prose-p:text-[15px] mb-6">
                    <ReactMarkdown>{analysis.communicationStyle.description}</ReactMarkdown>
                  </div>
                  <div className="space-y-4 bg-black/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                      <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                        {analysis.communicationStyle.formality < 41 ? 'Prefers casual, relaxed communication with natural language patterns' :
                         analysis.communicationStyle.formality < 61 ? 'Balances casual and professional tones appropriately' :
                         analysis.communicationStyle.formality < 81 ? 'Maintains professional and structured communication' :
                         'Employs highly formal and sophisticated language'}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                      <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                        {analysis.communicationStyle.enthusiasm < 41 ? 'Expresses thoughts in a reserved and measured manner' :
                         analysis.communicationStyle.enthusiasm < 61 ? 'Shows balanced enthusiasm in communications' :
                         analysis.communicationStyle.enthusiasm < 81 ? 'Demonstrates clear passion and energy in expression' :
                         'Exhibits intense enthusiasm and excitement in communication'}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                      <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                        {analysis.communicationStyle.technicalLevel < 41 ? 'Uses accessible language with minimal technical terms' :
                         analysis.communicationStyle.technicalLevel < 61 ? 'Balances technical and general language effectively' :
                         analysis.communicationStyle.technicalLevel < 81 ? 'Frequently incorporates technical terminology' :
                         'Employs sophisticated technical discourse consistently'}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                      <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                        {analysis.communicationStyle.emojiUsage < 41 ? 'Rarely uses emojis or emotional indicators' :
                         analysis.communicationStyle.emojiUsage < 61 ? 'Moderately incorporates emojis for emphasis' :
                         analysis.communicationStyle.emojiUsage < 81 ? 'Frequently enhances messages with emojis' :
                         'Extensively uses emojis to convey emotion and tone'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interests Section */}
                <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text text-base">Interests</span>
                  </h4>
                  <div className="flex flex-wrap gap-2.5">
                    {analysis.interests.map((interest: string) => (
                      <span 
                        key={interest}
                        className="px-3 py-1.5 bg-red-500/5 border border-red-500/20 rounded-md text-red-300/90 text-[14px] tracking-wide hover:bg-red-500/10 hover:border-red-500/30 transition-colors duration-200 hover-glow"
                      >
                        {interest.replace(/\*\*/g, '')}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Topics & Themes Section */}
                <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text text-base">Topics & Themes</span>
                  </h4>
                  <ul className="list-none space-y-3 bg-black/20 rounded-lg p-4">
                    {analysis.topicsAndThemes.map((topic: string, i: number) => (
                      <li key={i} className="flex items-center gap-3 text-red-300/90 hover-text-glow group">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/30 group-hover:bg-red-500/50 transition-colors duration-200"></div>
                        <span className="text-[14px] leading-relaxed tracking-wide">
                          {topic.replace(/\*\*/g, '')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Emotional Tone Section */}
                <div className="bg-black/20 text-justify rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text text-base">Emotional Tone</span>
                  </h4>
                  <div className="prose prose-red prose-invert max-w-none hover-text-glow prose-p:text-red-300/90 prose-p:leading-relaxed prose-p:text-[15px] bg-black/20 rounded-lg p-4">
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
        <div className="w-full bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern overflow-hidden touch-action-none">
          <div className="flex-none flex items-center px-4 sm:px-6 py-3 sm:py-4 bg-black/40 backdrop-blur-sm border-b border-red-500/10 cryptic-shadow">
            <div className="flex items-center gap-2 sm:gap-4 w-full overflow-x-auto custom-scrollbar no-scrollbar">
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
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 backdrop-blur-sm bg-black/20 dynamic-bg max-h-[50vh] sm:max-h-[45vh] md:max-h-[40vh] relative touch-action-pan-y">
            <div className="space-y-2 w-full">
              {/* Progress Status - Moved here */}
              {loading && (
                <div className="mb-4 p-3 bg-black/20 border border-red-500/10 rounded-lg backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-red-500/60">
                    <div className="flex items-center gap-1 flex-none">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20 glow-box" />
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-100 shadow-lg shadow-red-500/20 glow-box" />
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-200 shadow-lg shadow-red-500/20 glow-box" />
                    </div>
                    {scanProgress && (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="uppercase tracking-wider text-xs glow-text truncate">
                          {scanProgress.message || `${scanProgress.phase === 'posts' ? 'SCANNING POSTS' : 'SCANNING REPLIES'}: ${scanProgress.count} TWEETS COLLECTED`}
                        </span>
                        {scrapingElapsedTime && (
                          <span className="text-xs text-red-500/40 glow-text truncate flex-none">
                            [{scrapingElapsedTime}]
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

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

        {/* Mobile Consent Modal */}
        {showConsent && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 lg:hidden"
            onClick={() => {
              setShowConsent(false)
              if (loading) handleCancelScraping()
            }}
          >
            <div 
              className="bg-black/40 backdrop-blur-md px-6 py-4 rounded-lg shadow-2xl w-full max-w-md border border-red-500/20 hover-glow float max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-4 border-b border-red-500/20 pb-4 glow-border">
                <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                <h3 className="text-lg font-bold text-red-500/90 tracking-wider glow-text">
                  SYSTEM AUTHORIZATION REQUIRED
                </h3>
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

        {/* Mobile Completion Modal */}
        {showComplete && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 lg:hidden"
            onClick={handleCloseModal}
          >
            <div 
              className="bg-black/40 backdrop-blur-md px-6 py-4 rounded-lg shadow-2xl w-full max-w-md border border-red-500/20 hover-glow float max-h-[90vh] overflow-y-auto"
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

      {/* Desktop Layout - Preserve Existing */}
      <div className="hidden lg:block desktop-layout">
        {/* Left Side Panels Container */}
        <div className="fixed top-20 left-0 md:left-6 lg:left-8 flex flex-col gap-6 h-[calc(100vh-104px)] w-[26vw] lg:w-[22vw] xl:w-[20vw] min-w-[280px] max-w-[400px] px-4 md:px-0 overflow-y-auto md:overflow-visible transition-all duration-300">
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
                                {interest.replace(/\*\*/g, '')}
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
                              {interest.replace(/\*\*/g, '')}
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
        <div className="fixed top-20 right-0 md:right-6 lg:right-8 h-[calc(100vh-104px)] w-[26vw] lg:w-[22vw] xl:w-[20vw] min-w-[280px] max-w-[400px] flex flex-col gap-6 px-4 md:px-0 overflow-y-auto md:overflow-visible transition-all duration-300">
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
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 backdrop-blur-sm bg-black/20 dynamic-bg max-h-[50vh] sm:max-h-[45vh] md:max-h-[40vh] relative touch-action-pan-y">
              <div className="space-y-2 w-full">
                {/* Progress Status - Moved here */}
                {loading && (
                  <div className="mb-4 p-3 bg-black/20 border border-red-500/10 rounded-lg backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-red-500/60">
                      <div className="flex items-center gap-1 flex-none">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20 glow-box" />
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-100 shadow-lg shadow-red-500/20 glow-box" />
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-200 shadow-lg shadow-red-500/20 glow-box" />
                      </div>
                      {scanProgress && (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="uppercase tracking-wider text-xs glow-text truncate">
                            {scanProgress.message || `${scanProgress.phase === 'posts' ? 'SCANNING POSTS' : 'SCANNING REPLIES'}: ${scanProgress.count} TWEETS COLLECTED`}
                          </span>
                          {scrapingElapsedTime && (
                            <span className="text-xs text-red-500/40 glow-text truncate flex-none">
                              [{scrapingElapsedTime}]
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tweets.length === 0 ? (
                  <div className="text-red-500/50 italic glow-text">
                    {'>'} {loading ? 'Fetching data...' : 'Awaiting data collection initialization...'}
                  </div>
                ) : (
                  <>
                    {tweets.map((tweet, index) => (
                      <div 
                        key={`${tweet.id}-${index}`}
                        className="text-red-400/80 flex gap-3 hover:bg-red-500/5 transition-all duration-300 py-2 px-3 rounded backdrop-blur-sm border border-transparent hover:border-red-500/10 hover-glow float"
                      >
                        <div className="text-red-500/50 select-none font-bold glow-text">
                          [{String(index + 1).padStart(4, '0')}]
                        </div>
                  
                        <div className="flex-1">
                          <div className="text-red-300/90 hover-text-glow break-words">
                            {tweet.text}
                          </div>
                          <div className="text-red-500/40 text-xs flex items-center gap-2 mt-1.5">
                            <span>
                              {tweet.timestamp && new Date(tweet.timestamp).toLocaleString()}
                            </span>
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

                    <div className="mt-6 pt-4 border-t border-red-500/10 text-red-500/60 backdrop-blur-sm glow-border">
                      {'>'} Collection Stats: {tweets.length} posts
                    </div>
                  </>
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

            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 backdrop-blur-sm bg-black/20 dynamic-bg max-h-[50vh] sm:max-h-[45vh] md:max-h-[40vh] relative touch-action-pan-y">
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
                  <div className="bg-black/20 text-justify rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                    <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                      <span className="ancient-text">Summary</span>
                    </h4>
                    <div className="prose prose-red prose-invert max-w-none hover-text-glow">
                      <ReactMarkdown>{analysis.summary}</ReactMarkdown>
                    </div>
                  </div>

                  {/* Key Traits Section */}
                  <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                    <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                      <span className="ancient-text text-base">Key Traits</span>
                    </h4>
                    <div className="space-y-6">
                      {analysis.traits.map((trait: { name: string; score: number; explanation: string }, index: number) => (
                        <div key={`trait-${index}-${trait.name}`} className="hover-glow">
                          <div className="flex justify-between mb-2 items-center">
                            <span className="text-red-400/90 font-medium tracking-wide text-[15px] capitalize">{trait.name}</span>
                            <span className="text-red-500/80 font-mono text-sm bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">{trait.score}/10</span>
                          </div>
                          <div className="h-1.5 bg-red-500/10 rounded-full overflow-hidden glow-box mb-3">
                            <div 
                              className="h-full bg-red-500/50 rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${trait.score * 10}%` }}
                            />
                          </div>
                          <div className="text-[14px] leading-relaxed text-red-300/80 prose prose-red prose-invert max-w-none hover-text-glow pl-2 border-l border-red-500/10">
                            <ReactMarkdown>{trait.explanation}</ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Communication Style Section */}
                  <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                    <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                      <span className="ancient-text text-base">Communication Style</span>
                    </h4>
                    <div className="prose prose-red prose-invert max-w-none hover-text-glow prose-p:text-red-300/90 prose-p:leading-relaxed prose-p:text-[15px] mb-6">
                      <ReactMarkdown>{analysis.communicationStyle.description}</ReactMarkdown>
                    </div>
                    <div className="space-y-4 bg-black/20 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                        <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                          {analysis.communicationStyle.formality < 41 ? 'Prefers casual, relaxed communication with natural language patterns' :
                           analysis.communicationStyle.formality < 61 ? 'Balances casual and professional tones appropriately' :
                           analysis.communicationStyle.formality < 81 ? 'Maintains professional and structured communication' :
                           'Employs highly formal and sophisticated language'}
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                        <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                          {analysis.communicationStyle.enthusiasm < 41 ? 'Expresses thoughts in a reserved and measured manner' :
                           analysis.communicationStyle.enthusiasm < 61 ? 'Shows balanced enthusiasm in communications' :
                           analysis.communicationStyle.enthusiasm < 81 ? 'Demonstrates clear passion and energy in expression' :
                           'Exhibits intense enthusiasm and excitement in communication'}
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                        <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                          {analysis.communicationStyle.technicalLevel < 41 ? 'Uses accessible language with minimal technical terms' :
                           analysis.communicationStyle.technicalLevel < 61 ? 'Balances technical and general language effectively' :
                           analysis.communicationStyle.technicalLevel < 81 ? 'Frequently incorporates technical terminology' :
                           'Employs sophisticated technical discourse consistently'}
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                        <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                          {analysis.communicationStyle.emojiUsage < 41 ? 'Rarely uses emojis or emotional indicators' :
                           analysis.communicationStyle.emojiUsage < 61 ? 'Moderately incorporates emojis for emphasis' :
                           analysis.communicationStyle.emojiUsage < 81 ? 'Frequently enhances messages with emojis' :
                           'Extensively uses emojis to convey emotion and tone'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Interests Section */}
                  <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                    <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                      <span className="ancient-text text-base">Interests</span>
                    </h4>
                    <div className="flex flex-wrap gap-2.5">
                      {analysis.interests.map((interest: string) => (
                        <span 
                          key={interest}
                          className="px-3 py-1.5 bg-red-500/5 border border-red-500/20 rounded-md text-red-300/90 text-[14px] tracking-wide hover:bg-red-500/10 hover:border-red-500/30 transition-colors duration-200 hover-glow"
                        >
                          {interest.replace(/\*\*/g, '')}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Topics & Themes Section */}
                  <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                    <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                      <span className="ancient-text text-base">Topics & Themes</span>
                    </h4>
                    <ul className="list-none space-y-3 bg-black/20 rounded-lg p-4">
                      {analysis.topicsAndThemes.map((topic: string, i: number) => (
                        <li key={i} className="flex items-center gap-3 text-red-300/90 hover-text-glow group">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500/30 group-hover:bg-red-500/50 transition-colors duration-200"></div>
                          <span className="text-[14px] leading-relaxed tracking-wide">
                            {topic.replace(/\*\*/g, '')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Emotional Tone Section */}
                  <div className="bg-black/20 text-justify rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
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

        {/* Main Center Chat Interface Container - Desktop Only */}
        <div className="hidden lg:fixed lg:inset-0 lg:flex lg:items-center lg:justify-center lg:pointer-events-none lg:pt-20 lg:pb-6">
          <div className="w-[40vw] lg:w-[48vw] xl:w-[54vw] min-w-[380px] max-w-[1200px] h-[calc(100vh-104px)] mx-auto backdrop-blur-md bg-black/40 border border-red-500/10 rounded-lg shadow-2xl hover-glow pointer-events-auto z-1 ancient-border rune-pattern overflow-hidden transition-all duration-300 md:mx-6 lg:mx-8">
            <div className="flex flex-col h-full min-h-0">
              {/* Chat Header */}
              <div className="flex-none flex items-center justify-between px-4 md:px-6 py-4 bg-black/40 backdrop-blur-sm border-b border-red-500/10 rounded-t-lg cryptic-shadow relative z-40">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                  <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">NEURAL INTERFACE</h3>
                </div>
                <ConversationList
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  onSelectConversation={handleSelectConversation}
                  onNewChat={handleNewChat}
                  onDeleteConversation={handleDeleteConversation}
                  isLoading={isLoadingConversations}
                />
              </div>

              {/* Chat Messages Container */}
              <div className="flex-1 overflow-y-auto custom-scrollbar backdrop-blur-sm bg-black/20 ancient-scroll min-h-0 relative z-30">
                {!analysis ? (
                  <div className="text-red-500/70 italic text-center glow-text p-4">
                    Start personality analysis to begin chat interaction
                  </div>
                ) : (
                  <>
                    {/* Sticky Profile Section */}
                    <div className="sticky top-0 z-35 p-4 bg-black/40 backdrop-blur-md">
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
                    <div className="p-4 space-y-4 relative z-30">
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
                <div className="flex-none p-3 md:p-4 border-t border-red-500/10 bg-black/40 backdrop-blur-sm cryptic-shadow relative z-40">
                  <form onSubmit={handleSubmit} className="flex gap-2">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Enter your message... (Shift+Enter for new line)"
                      disabled={isChatLoading}
                      rows={1}
                      className="flex-1 bg-black/20 text-red-400/90 border border-red-500/20 rounded px-2 md:px-3 py-1.5 text-sm placeholder:text-red-500/30 focus:outline-none focus:border-red-500/40 hover-glow disabled:opacity-50 resize-none min-h-[38px] max-h-[200px] overflow-y-auto custom-scrollbar"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || isChatLoading}
                      className="px-2 md:px-3 py-1.5 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow min-w-[60px] md:min-w-[80px] h-[38px]"
                    >
                      {isChatLoading ? (
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => {
              setShowConsent(false)
              if (loading) handleCancelScraping()
            }}
          >
            <div 
              className="bg-black/40 backdrop-blur-md px-6 py-4 rounded-lg shadow-2xl w-full max-w-md border border-red-500/20 hover-glow float max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-4 border-b border-red-500/20 pb-4 glow-border">
                <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                <h3 className="text-lg font-bold text-red-500/90 tracking-wider glow-text">
                  SYSTEM AUTHORIZATION REQUIRED
                </h3>
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
        {showComplete && (
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