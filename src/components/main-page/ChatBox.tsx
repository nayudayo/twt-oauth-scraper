import React, { useState, useEffect, useRef, Dispatch, SetStateAction, useCallback, memo } from 'react';
import { Tweet, TwitterProfile, EventData } from '@/types/scraper';
import { TwitterAPITweet } from '@/lib/twitter/types';
import { PersonalityAnalysis, CommunicationLevel, MissingInterestsError, MissingPsychoanalysisError, MissingSocialMetricsError, MissingEmotionalToneError, MissingVocabularyPatternsError, MissingCommunicationPatternsError } from '@/lib/openai/types';
import type { Conversation } from '@/types/conversation';
import type { Message as BaseAPIMessage } from '@/types/conversation';
import ReactMarkdown from 'react-markdown';
import { Spinner } from '../ui/spinner';
import '../../styles/glow.css';
import Image from 'next/image';
import { ConversationList } from '../ConversationList';
import { usePersonalityCache } from '@/hooks/usePersonalityCache';
import { CacheStatusIndicator } from '../CacheStatusIndicator';
import { TweetList } from './TweetList';
import { useQueryClient } from '@tanstack/react-query';
import { PsychoanalysisModal } from '../PsychoanalysisModal';
import { TuningUpdateMessage } from '../TuningUpdateMessage';
import { Virtuoso } from 'react-virtuoso';
import { ConsentModal, CompletionModal } from '../modals';
import { AnalysisSummary } from './AnalysisSummary';
import { FineTuningPanel } from './FineTuningPanel';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================
interface ChatBoxProps {
  tweets: Tweet[]
  profile: TwitterProfile
  onClose: () => void
  onTweetsUpdate: Dispatch<SetStateAction<Tweet[]>>
}

interface PersonalityTuning {
  traitModifiers: { [key: string]: number }  // trait name -> adjustment (-2 to +2)
  interestWeights: { [key: string]: number } // interest -> weight (0 to 100)
  communicationStyle: {
    formality: CommunicationLevel
    enthusiasm: CommunicationLevel
    technicalLevel: CommunicationLevel
    emojiUsage: CommunicationLevel
    verbosity: CommunicationLevel
  }
}

interface ScanProgress {
  phase: 'posts' | 'replies' | 'complete' | 'ready'
  count: number
  total?: number
  currentBatch?: number
  totalBatches?: number
  message?: string
  isRateLimited?: boolean
  rateLimitReset?: number
}

interface CooldownState {
  scrape: {
    isOnCooldown: boolean;
    remainingTime?: number;
  };
  analyze: {
    isOnCooldown: boolean;
    remainingTime?: number;
  };
}

interface APIMessage extends BaseAPIMessage {
  timestamp?: string;
  tuningInfo?: {
    tuningType: 'trait' | 'interest' | 'communication';
    name: string;
    value: string | boolean;
  };
}

interface ChatBoxMessage {
  text: string;
  isUser: boolean;
  timestamp: string;
  type: 'chat' | 'tuning';
  tuningInfo?: {
    tuningType: 'trait' | 'interest' | 'communication';
    name: string;
    value: string | boolean;
  };
}

// ============================================================================
// PERSONALITY FINE TUNING TYPES
// ============================================================================
interface PersonalityTuning {
  traitModifiers: { [key: string]: number }  // trait name -> adjustment (-2 to +2)
  interestWeights: { [key: string]: number } // interest -> weight (0 to 100)
  communicationStyle: {
    formality: CommunicationLevel
    enthusiasm: CommunicationLevel
    technicalLevel: CommunicationLevel
    emojiUsage: CommunicationLevel
    verbosity: CommunicationLevel
  }
}

// ============================================================================
// PERSONALITY ANALYSIS TYPES
// ============================================================================
interface APIMessage extends BaseAPIMessage {
  timestamp?: string;
  tuningInfo?: {
    tuningType: 'trait' | 'interest' | 'communication';
    name: string;
    value: string | boolean;
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const formatTraitName = (name: string) => {
  if (!name) return '';
  
  // First remove any special characters and extra spaces
  const cleanName = name.replace(/[*\-_]/g, ' ').trim();
  
  // Handle multiple formatting cases:
  
  // 1. Split camelCase and PascalCase
  const splitCamelCase = cleanName.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // 2. Split concatenated words (e.g., "Communityoriented" -> "Community oriented")
  const splitWords = splitCamelCase.replace(/([a-z])([A-Z][a-z])/g, '$1 $2');
  
  // 3. Handle special cases where words are just concatenated
  const commonWords = ['oriented', 'driven', 'focused', 'based', 'centric', 'minded'];
  let formattedName = splitWords;
  commonWords.forEach(word => {
    const regex = new RegExp(`(\\w+)${word}`, 'gi');
    formattedName = formattedName.replace(regex, `$1 ${word}`);
  });
  
  // 4. Capitalize first letter of each word
  return formattedName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const formatTraitExplanation = (explanation: string) => {
  if (!explanation) return '';
  
  // Remove trailing "(e" with any surrounding whitespace
  let formatted = explanation.replace(/\s*\([eE]\s*$/, '');
  
  // Also handle cases where it might be "(e)" or just "e"
  formatted = formatted.replace(/\s*\([eE]\)\s*$/, '');
  formatted = formatted.replace(/\s+[eE]\s*$/, '');
  
  // Ensure proper sentence ending
  if (!formatted.endsWith('.') && !formatted.endsWith('!') && !formatted.endsWith('?')) {
    formatted += '.';
  }
  
  return formatted.trim();
};  

const formatInterestName = (interest: string) => {
  if (!interest) return '';
  
  // Remove section numbers and headers
  let cleaned = interest.replace(/###\s*\d+\.\s*/, '');
  cleaned = cleaned.replace(/Social Behavior Metrics$/, '');
  
  // Clean up special characters while preserving some meaningful ones
  cleaned = cleaned
    .replace(/[*_]/g, '') // Remove markdown formatting
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
    
  // Handle special cases for cryptocurrency and NFT terms
  cleaned = cleaned
    .replace(/cryptocurrency\/nfts/i, 'Cryptocurrency/NFTs')
    .replace(/nft/i, 'NFT')
    .replace(/defi/i, 'DeFi')
    .replace(/dao/i, 'DAO');
    
  // Capitalize first letter of each word except for special terms
  return cleaned.split(' ')
    .map(word => {
      // Skip capitalization for known acronyms and special terms
      if (/^(NFT|DeFi|DAO|dApp)s?$/i.test(word)) {
        return word.toUpperCase();
      }
      // Handle words with slashes
      if (word.includes('/')) {
        return word.split('/')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join('/');
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

// ============================================================================
// HOOKS
// ============================================================================
const useCountdown = (initialTime: number) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev > 0) {
            return prev - 1;
          }
          return 0;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [timeLeft]);

  const resetTimer = (newTime: number) => {
    setTimeLeft(newTime);
  };

  return { timeLeft, resetTimer };
};

// ============================================================================
// MEMOIZED COMPONENTS
// ============================================================================
const MemoizedMarkdown = memo(({ content }: { content: string }) => (
  <ReactMarkdown>{content}</ReactMarkdown>
));
MemoizedMarkdown.displayName = 'MemoizedMarkdown';

const ChatMessage = memo(({ message, isUser }: { message: ChatBoxMessage, isUser: boolean }) => (
  <div 
    className={`flex ${isUser ? 'justify-end' : 'justify-start'} p-4`}
  >
    <div 
      className={`max-w-[80%] rounded backdrop-blur-sm border border-red-500/10 shadow-lg hover-glow float
        ${isUser 
          ? 'bg-red-500/5 text-red-400/90' 
          : 'bg-black/40 text-red-300/90'
        } px-4 py-2 text-sm`}
    >
      <div className="prose prose-red prose-invert max-w-none hover-text-glow whitespace-pre-wrap">
        <MemoizedMarkdown content={message.text} />
      </div>
    </div>
  </div>
));
ChatMessage.displayName = 'ChatMessage';

// ============================================================================
// MAIN CHATBOX COMPONENT
// ============================================================================
export default function ChatBox({ tweets: initialTweets, profile, onClose, onTweetsUpdate }: ChatBoxProps) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatBoxMessage[]>([])
  const [input, setInput] = useState('')
  const [analysis, setAnalysis] = useState<PersonalityAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [showConsent, setShowConsent] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [showPsychoanalysis, setShowPsychoanalysis] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showAnalysisPrompt, setShowAnalysisPrompt] = useState(false)
  const [tuning, setTuning] = useState<PersonalityTuning>({
    traitModifiers: {},
    interestWeights: {},
    communicationStyle: {
      formality: 'medium',
      enthusiasm: 'medium',
      technicalLevel: 'medium',
      emojiUsage: 'medium',
      verbosity: 'medium'
    }
  })
  const [isTyping, setIsTyping] = useState(false)
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null)
  const [analysisElapsedTime, setAnalysisElapsedTime] = useState<string | null>(null)
  const [scrapingStartTime, setScrapingStartTime] = useState<number | null>(null)
  const [scrapingElapsedTime, setScrapingElapsedTime] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<number>()
  const [isLoadingConversations, setIsLoadingConversations] = useState(false)
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(false)
  const [isLoadingTweets, setIsLoadingTweets] = useState(false)
  const [accumulatedTweets, setAccumulatedTweets] = useState<Tweet[]>([])
  const [showProfile, setShowProfile] = useState(true)
  const [cooldownState, setCooldownState] = useState<CooldownState>({
    scrape: {
      isOnCooldown: false
    },
    analyze: {
      isOnCooldown: false
    }
  });
  const [messageQueue, setMessageQueue] = useState<ChatBoxMessage[]>([]);
  const MAX_MESSAGES = 1000; // Maximum number of messages to keep in memory
  const [retryState, setRetryState] = useState<{
    attempt: number;
    maxAttempts: number;
    missingFields: string[];
  } | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const scrapeCountdown = useCountdown(0);
  const analyzeCountdown = useCountdown(0);

  // ============================================================================
  // PERSONALITY ANALYSIS & TUNING REFS
  // ============================================================================
  const latestTuning = useRef<PersonalityTuning>(tuning)

  // ============================================================================
  // PERSONALITY ANALYSIS & TUNING EFFECTS
  // ============================================================================
  // Update tuning ref
  useEffect(() => {
    latestTuning.current = tuning
  }, [tuning])

  // ============================================================================
  // PERSONALITY ANALYSIS & TUNING CACHE HOOKS
  // ============================================================================
  const personalityCache = usePersonalityCache({
    username: profile.name || ''
  })

  // ============================================================================
  // PERSONALITY ANALYSIS & TUNING INITIALIZATION
  // ============================================================================
  useEffect(() => {
    const loadInitialData = async () => {
      if (!profile.name || isLoadingInitialData) return;
      
      setIsLoadingInitialData(true);
      try {
        setLoading(true);
        
        // Load personality cache first
        const cachedAnalysis = await personalityCache.fetchCache();
        if (cachedAnalysis) {
          setAnalysis(cachedAnalysis);
          
          // Initialize tuning from cache
          setTuning(prev => ({
            ...prev,
            // Set all cached traits to ON by default
            traitModifiers: cachedAnalysis.traits.reduce((acc: Record<string, number>, trait: { name: string }) => ({
              ...acc,
              [trait.name]: 100 // Set to 100 (ON) for all traits
            }), {}),
            communicationStyle: {
              formality: cachedAnalysis.communicationStyle.formality,
              enthusiasm: cachedAnalysis.communicationStyle.enthusiasm,
              technicalLevel: cachedAnalysis.communicationStyle.technicalLevel,
              emojiUsage: cachedAnalysis.communicationStyle.emojiUsage,
              verbosity: cachedAnalysis.communicationStyle.verbosity ?? 'medium'
            },
            interestWeights: cachedAnalysis.interests.reduce((acc: Record<string, number>, interest: string) => {
              const [interestName, expertiseLevel] = interest.split(':').map(s => s.trim());
              let weight = 50; // Default to medium
              
              if (expertiseLevel) {
                const level = expertiseLevel.toLowerCase();
                if (level.includes('advanced') || level.includes('high') || level.includes('strong')) {
                  weight = 75;
                } else if (level.includes('intermediate') || level.includes('moderate')) {
                  weight = 50;
                } else if (level.includes('basic') || level.includes('low')) {
                  weight = 25;
                }
              }
              
              return { ...acc, [interestName]: weight };
            }, {})
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
                setMessages(messagesData.data.map((msg: APIMessage) => ({
                  text: msg.content || '',
                  isUser: msg.role === 'user',
                  timestamp: msg.timestamp || new Date().toLocaleTimeString(),
                  type: 'chat' as const
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
        setIsLoadingInitialData(false);
      }
    };

    loadInitialData();
  }, [profile.name]);

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

  const handleTraitAdjustment = async (traitName: string, enabled: boolean) => {
    const score = enabled ? 100 : 0;
    const analysisScore = enabled ? 10 : 0;
    
    // Add tuning message to main messages array
    setMessages(prev => [...prev, {
      text: '',
      isUser: false,
      timestamp: new Date().toLocaleTimeString(),
      type: 'tuning',
      tuningInfo: {
        tuningType: 'trait',
        name: formatTraitName(traitName),
        value: enabled
      }
    }]);

    setTuning(prevTuning => {
      const newTuning = {
        ...prevTuning,
        traitModifiers: {
          ...prevTuning.traitModifiers,
          [traitName]: score
        }
      };

      if (activeConversationId && analysis) {
        fetch(`/api/conversations/${activeConversationId}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysis: {
              ...analysis,
              traits: analysis.traits.map(trait => 
                trait.name === traitName 
                  ? { ...trait, score: analysisScore }
                  : trait
              )
            },
            tuning: newTuning
          })
        }).catch(error => {
          console.warn('Failed to update active chat session with new trait settings:', error);
        });
      }

      return newTuning;
    });

    if (analysis) {
      const updatedAnalysis: PersonalityAnalysis = {
        ...analysis,
        traits: analysis.traits.map(trait => 
          trait.name === traitName 
            ? { ...trait, score: analysisScore }
            : trait
        )
      };
      setAnalysis(updatedAnalysis);
    }
  };

  const handleInterestWeight = async (interest: string, enabled: boolean) => {
    const weight = enabled ? 100 : 0;
    
    // Add tuning message to main messages array
    setMessages(prev => [...prev, {
      text: '',
      isUser: false,
      timestamp: new Date().toLocaleTimeString(),
      type: 'tuning',
      tuningInfo: {
        tuningType: 'interest',
        name: formatInterestName(interest),
        value: enabled
      }
    }]);

    setTuning(prevTuning => {
      const newTuning = {
        ...prevTuning,
        interestWeights: {
          ...prevTuning.interestWeights,
          [interest]: weight
        }
      };

      if (activeConversationId && analysis) {
        fetch(`/api/conversations/${activeConversationId}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysis: {
              ...analysis,
              interestWeights: {
                ...analysis.interestWeights,
                [interest]: weight
              }
            },
            tuning: newTuning
          })
        }).catch(error => {
          console.warn('Failed to update active chat session with new interest settings:', error);
        });
      }

      return newTuning;
    });

    if (analysis) {
      // Save to cache with updated values
      personalityCache.saveToCache({
        ...analysis,
        interestWeights: {
          ...analysis.interestWeights,
          [interest]: weight
        }
      }).catch(error => {
        console.warn('Failed to update personality cache:', error);
      });
    }
  };

  const handleStyleAdjustment = async (aspect: keyof PersonalityTuning['communicationStyle'], value: CommunicationLevel) => {
    // Add tuning message to main messages array
    setMessages(prev => [...prev, {
      text: '',
      isUser: false,
      timestamp: new Date().toLocaleTimeString(),
      type: 'tuning',
      tuningInfo: {
        tuningType: 'communication',
        name: aspect,
        value: value
      }
    }]);

    setTuning(prevTuning => {
      const newTuning = {
        ...prevTuning,
        communicationStyle: {
          ...prevTuning.communicationStyle,
          [aspect]: value
        }
      };

      if (activeConversationId && analysis) {
        fetch(`/api/conversations/${activeConversationId}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysis: {
              ...analysis,
              communicationStyle: {
                ...analysis.communicationStyle,
                [aspect]: value
              }
            },
            tuning: newTuning
          })
        }).catch(error => {
          console.warn('Failed to update active chat session with new communication style settings:', error);
        });
      }

      return newTuning;
    });

    if (analysis) {
      const updatedAnalysis: PersonalityAnalysis = {
        ...analysis,
        communicationStyle: {
          ...analysis.communicationStyle,
          [aspect]: value
        }
      };
      setAnalysis(updatedAnalysis);

      personalityCache.saveToCache(updatedAnalysis).catch(error => {
        console.warn('Failed to update personality cache:', error);
      });
    }
  };

  // Update the generatePersonalityResponse function to handle mobile timeouts
  const generatePersonalityResponse = async (userMessage: string) => {
    setIsChatLoading(true)
    setError(null)
    try {
      setIsTyping(true)

      // Convert messages to the format expected by the API
      const conversationHistory = messages.map(msg => ({
        role: msg.isUser ? 'user' as const : 'assistant' as const,
        content: msg.text
      }))

      // Get the current tuning state directly instead of using ref
      const currentTuning = tuning;

      // Add timeout handling for mobile/tablet
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds for mobile/tablet

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            message: userMessage,
            profile,
            analysis,
            tuning: currentTuning,
            conversationHistory,
            conversationId: activeConversationId
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error('Failed to get response');
        }
        
        const data = await response.json();
        
        // Update active conversation ID if this is a new conversation
        if (data.conversationId && !activeConversationId) {
          setActiveConversationId(data.conversationId);
          // Fetch updated conversation list
          const convsResponse = await fetch('/api/conversations');
          if (convsResponse.ok) {
            const convsData = await convsResponse.json();
            if (convsData.success && Array.isArray(convsData.data)) {
              setConversations(convsData.data);
            }
          }
        }

        setIsTyping(false);
        return data.response;

      } catch (error: unknown) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Response timed out - please try again');
        }
        throw error;
      }

    } catch (err) {
      setIsTyping(false);
      setError(err instanceof Error ? err.message : 'Failed to get response');
      return null;
    } finally {
      setIsChatLoading(false);
    }
  };

  // Add message batching effect
  useEffect(() => {
    if (messageQueue.length === 0) return;

    const batchTimeout = setTimeout(() => {
      setMessages(prev => [...prev, ...messageQueue]);
      setMessageQueue([]);
    }, 100); // Batch updates every 100ms

    return () => clearTimeout(batchTimeout);
  }, [messageQueue]);

  // Modify message adding logic to use queue
  const addMessage = useCallback((message: ChatBoxMessage) => {
    setMessageQueue(prev => [...prev, message]);
  }, []);

  // Update handleSubmit to use the new addMessage function
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isChatLoading) return;

    const userMessage = input.trim();
    setInput('');

    if (analysis) {
      // Add user message to queue
      addMessage({
        text: userMessage,
        isUser: true,
        timestamp: new Date().toLocaleTimeString(),
        type: 'chat'
      });
      
      const response = await generatePersonalityResponse(userMessage);
      if (response) {
        // Add AI response to queue
        addMessage({
          text: response,
          isUser: false,
          timestamp: new Date().toLocaleTimeString(),
          type: 'chat'
        });
        
        if (activeConversationId) {
          setConversations(prev => prev.map(conv => 
            conv.id === activeConversationId 
              ? {
                  ...conv,
                  metadata: {
                    ...conv.metadata,
                    messageCount: (conv.metadata.messageCount || 0) + 2
                  }
                }
              : conv
          ));
        }

        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }

      // Sync with server if needed
      if (activeConversationId) {
        try {
          const response = await fetch('/api/conversations/' + activeConversationId + '/messages');
          if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.data)) {
              const newMessages = data.data.map((msg: APIMessage) => ({
                text: msg.content || '',
                isUser: msg.role === 'user',
                timestamp: new Date().toLocaleTimeString(),
                type: 'chat' as const,
                ...(msg.tuningInfo && { tuningInfo: msg.tuningInfo })
              }));
              setMessages(newMessages); // Replace all messages with server state
            }
          }
        } catch (error) {
          console.error('Error syncing messages:', error);
        }
      }
    }
  };

  // Update handleAnalyze to handle both initial analysis and updates
  const handleAnalyze = async () => {
    // Check cooldown but don't enforce yet
    const cooldownCheck = await checkCooldown('analyze');
    if (!cooldownCheck) {
      return;
    }

    if (!accumulatedTweets || accumulatedTweets.length === 0) {
      setError('No tweets available for analysis');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisStartTime(Date.now());
    setRetryState(null); // Reset retry state at start

    try {
      // Check cache first
      const cachedData = await personalityCache.fetchCache();
      
      if (cachedData && !analysis) { // Only use cache for initial analysis
        // Initialize trait modifiers from cached traits
        const initialTraitModifiers = cachedData.traits.reduce((acc: Record<string, number>, trait: { name: string; score: number }) => ({
          ...acc,
          [trait.name]: Math.round(trait.score * 10)
        }), {});

        // Ensure communication style is properly synced between cache and state
        const syncedCommunicationStyle = {
          formality: cachedData.communicationStyle.formality,
          enthusiasm: cachedData.communicationStyle.enthusiasm,
          technicalLevel: cachedData.communicationStyle.technicalLevel,
          emojiUsage: cachedData.communicationStyle.emojiUsage,
          verbosity: cachedData.communicationStyle.verbosity ?? 'medium'
        };

        // Update tuning state with both communication style and trait modifiers
        setTuning(prev => ({
          ...prev,
          traitModifiers: initialTraitModifiers,
          communicationStyle: syncedCommunicationStyle
        }));
        
        if (cachedData.interests) {
          // Initialize weights based on expertise levels in the interest strings
          const interestWeights = cachedData.interests.reduce((acc: Record<string, number>, interest: string) => {
            const [interestName, expertiseLevel] = interest.split(':').map(s => s.trim());
            let weight = 50; // Default to medium
            
            if (expertiseLevel) {
              const level = expertiseLevel.toLowerCase();
              if (level.includes('advanced') || level.includes('high') || level.includes('strong')) {
                weight = 75;
              } else if (level.includes('intermediate') || level.includes('moderate')) {
                weight = 50;
              } else if (level.includes('basic') || level.includes('low')) {
                weight = 25;
              }
            }
            
            return { ...acc, [interestName]: weight };
          }, {});
          
          setTuning(prev => ({
            ...prev,
            interestWeights: {
              ...prev.interestWeights,
              ...interestWeights
            }
          }));
        }

        // Update analysis state with synced communication style
        const syncedAnalysis = {
          ...cachedData,
          communicationStyle: {
            ...cachedData.communicationStyle,
            ...syncedCommunicationStyle
          }
        };
        
        setAnalysis(syncedAnalysis);
        setIsAnalyzing(false);
        setAnalysisStartTime(null);
        setShowPsychoanalysis(true);

        // Update last analysis time since we used cache
        try {
          await fetch('/api/analyze/update-time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Failed to update analysis time:', error);
        }

        return;
      }

      // No cache or updating existing analysis
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes for mobile/tablet

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tweets: accumulatedTweets,
            profile,
            currentTuning: analysis ? tuning : undefined // Only send tuning if updating
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error('Failed to analyze personality');
        }

        const data = await response.json();
        
        // Handle retry states from error responses
        if (data.error && data.retryState) {
          setRetryState({
            attempt: data.retryState.attempt,
            maxAttempts: data.retryState.maxAttempts,
            missingFields: data.retryState.missingFields
          });
          return;
        }

        // Update tuning with new analysis values
        const newTraitModifiers = data.traits.reduce((acc: Record<string, number>, trait: { name: string; score: number }) => ({
          ...acc,
          // Convert analysis score (0-10) to UI score (0-100)
          [trait.name]: Math.round(trait.score * 10)
        }), {});

        // Initialize weights based on expertise levels in the interest strings
        const newInterestWeights = data.interests.reduce((acc: Record<string, number>, interest: string) => {
          const [interestName, expertiseLevel] = interest.split(':').map(s => s.trim());
          let weight = 50; // Default to medium
          
          if (expertiseLevel) {
            const level = expertiseLevel.toLowerCase();
            if (level.includes('advanced') || level.includes('high') || level.includes('strong')) {
              weight = 75;
            } else if (level.includes('intermediate') || level.includes('moderate')) {
              weight = 50;
            } else if (level.includes('basic') || level.includes('low')) {
              weight = 25;
            }
          }
          
          return { ...acc, [interestName]: weight };
        }, {});

        setTuning(prev => ({
          ...prev,
          traitModifiers: newTraitModifiers, // Replace entirely instead of merging
          interestWeights: {
            ...prev.interestWeights,
            ...newInterestWeights
          },
          communicationStyle: {
            formality: data.communicationStyle.formality ?? 'medium',
            enthusiasm: data.communicationStyle.enthusiasm ?? 'medium',
            technicalLevel: data.communicationStyle.technicalLevel ?? 'medium',
            emojiUsage: data.communicationStyle.emojiUsage ?? 'medium',
            verbosity: data.communicationStyle.verbosity ?? 'medium'
          }
        }));

        setAnalysis(data);
        setShowPsychoanalysis(true);

        // Save new analysis and tuning to cache
        await personalityCache.saveToCache({
          ...data,
          traits: (Object.entries(newTraitModifiers) as [string, number][]).map(([name, score]) => ({
            name: name.replace(/[*-]/g, '').trim(),
            score: Math.round(score / 10),
            explanation: data.traits.find((t: { name: string }) => t.name === name)?.explanation?.replace(/[*-]/g, '').trim()
          })),
          interests: Object.keys(newInterestWeights).map(interest => interest.replace(/[*-]/g, '').trim()),
          communicationStyle: {
            ...data.communicationStyle,
            description: data.communicationStyle.description?.replace(/[*-]/g, '').trim()
          },
          thoughtProcess: {
            ...data.thoughtProcess,
            initialApproach: data.thoughtProcess.initialApproach?.replace(/[*-]/g, '').trim(),
            processingStyle: data.thoughtProcess.processingStyle?.replace(/[*-]/g, '').trim(),
            expressionStyle: data.thoughtProcess.expressionStyle?.replace(/[*-]/g, '').trim()
          }
        });

        // Update last analysis time since analysis was successful
        try {
          await fetch('/api/analyze/update-time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Failed to update analysis time:', error);
        }

        // Create a new chat with the updated personality if this was an update
        if (analysis) {
          try {
            const createChatResponse = await fetch('/api/conversations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                analysis: data,
                tuning: {
                  traitModifiers: newTraitModifiers,
                  interestWeights: newInterestWeights,
                  communicationStyle: {
                    formality: data.communicationStyle.formality ?? 'medium',
                    enthusiasm: data.communicationStyle.enthusiasm ?? 'medium',
                    technicalLevel: data.communicationStyle.technicalLevel ?? 'medium',
                    emojiUsage: data.communicationStyle.emojiUsage ?? 'medium',
                    verbosity: data.communicationStyle.verbosity ?? 'medium'
                  }
                }
              })
            });

            if (!createChatResponse.ok) {
              throw new Error('Failed to create new chat');
            }

            const chatData = await createChatResponse.json();
            if (chatData.success && chatData.data) {
              // Update conversations list with new chat
              setConversations(prev => [chatData.data, ...prev]);
              // Set new chat as active
              setActiveConversationId(chatData.data.id);
              // Clear messages for new chat
              setMessages([]);
            }
          } catch (error) {
            console.error('Failed to create new chat:', error);
            setError('Failed to create new chat with updated personality');
          }
        }

      } catch (error: unknown) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Analysis timed out - please try again');
        }
        throw error;
      }

    } catch (error: unknown) {
      console.error('Analysis error:', error);
      
      // Handle specific error types with unified retry state
      if (error instanceof MissingInterestsError) {
        setRetryState({
          attempt: 1,
          maxAttempts: 3,
          missingFields: ['interests']
        });
      } else if (error instanceof MissingPsychoanalysisError) {
        setRetryState({
          attempt: 1,
          maxAttempts: 3,
          missingFields: ['psychoanalysis']
        });
      } else if (error instanceof MissingSocialMetricsError) {
        setRetryState({
          attempt: 1,
          maxAttempts: 3,
          missingFields: ['social metrics']
        });
      } else if (error instanceof MissingEmotionalToneError) {
        setRetryState({
          attempt: 1,
          maxAttempts: 3,
          missingFields: ['emotional tone']
        });
      } else if (error instanceof MissingVocabularyPatternsError) {
        setRetryState({
          attempt: 1,
          maxAttempts: 3,
          missingFields: ['vocabulary patterns']
        });
      } else if (error instanceof MissingCommunicationPatternsError) {
        setRetryState({
          attempt: 1,
          maxAttempts: 3,
          missingFields: ['communication patterns']
        });
      } else {
        setError(error instanceof Error ? error.message : 'Failed to analyze personality');
      }
    } finally {
      setIsAnalyzing(false);
      setAnalysisStartTime(null);
    }
  };

  // Update the retry state effect
  useEffect(() => {
    if (retryState) {
      const timeoutId = setTimeout(() => {
        setRetryState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            attempt: prev.attempt + 1
          };
        });
      }, 2000); // Match the retry delay in openai.ts

      return () => clearTimeout(timeoutId);
    }
  }, [retryState]);

  // Update handleUpdateAnalysis to handle cooldowns
  const handleUpdateAnalysis = async () => {
    const canProceed = await checkCooldown('analyze');
    if (!canProceed) {
      return;
    }

    try {
      // Reset analysis state but preserve tuning
      const currentTuning = tuning;
      setAnalysis(null);
      setIsAnalyzing(true);
      setError(null);
      setAnalysisStartTime(Date.now());

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes for mobile/tablet

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tweets: accumulatedTweets,
            profile,
            currentTuning
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error('Failed to analyze personality');
        }

        const newAnalysis = await response.json();
        
        // Preserve existing communication style values
        const preservedCommunicationStyle = {
          ...newAnalysis.communicationStyle,
          formality: currentTuning.communicationStyle.formality,
          enthusiasm: currentTuning.communicationStyle.enthusiasm,
          technicalLevel: currentTuning.communicationStyle.technicalLevel,
          emojiUsage: currentTuning.communicationStyle.emojiUsage,
          verbosity: currentTuning.communicationStyle.verbosity ?? 'medium'
        };

        // Update analysis with preserved values
        const finalAnalysis = {
          ...newAnalysis,
          communicationStyle: preservedCommunicationStyle,
          // Preserve tuning parameters
          traitModifiers: currentTuning.traitModifiers,
          interestWeights: currentTuning.interestWeights
        };

        // Convert traits to toggle states - traits should be ON by default when detected
        const traitModifiers = newAnalysis.traits.reduce((acc: Record<string, number>, trait: { name: string; score: number }) => ({
          ...acc,
          [trait.name]: 100 // Set to 100 (ON) for detected traits
        }), {});

        // Initialize weights for new interests, preserving existing weights
        const newInterests = newAnalysis.interests.reduce((acc: Record<string, number>, interest: string) => {
          const [interestName] = interest.split(':').map(s => s.trim());
          // If interest already exists in currentTuning, preserve its weight, otherwise set to 100 (ON)
          const weight = currentTuning.interestWeights[interestName] ?? 100;
          return { ...acc, [interestName]: weight };
        }, {});

        setTuning(prev => ({
          ...prev,
          traitModifiers,
          interestWeights: {
            ...prev.interestWeights, // Keep existing interest weights
            ...newInterests // Add new interests
          },
          communicationStyle: {
            ...currentTuning.communicationStyle,
            verbosity: currentTuning.communicationStyle.verbosity ?? 'medium'
          }
        }));

        setAnalysis(finalAnalysis);
        setShowPsychoanalysis(true);

        // Update the cache with preserved values
        await personalityCache.saveToCache({
          ...finalAnalysis,
          traits: newAnalysis.traits.map((trait: { name: string; score: number; explanation?: string }) => ({
            name: trait.name.replace(/[*-]/g, '').trim(),
            score: traitModifiers[trait.name] ? 10 : 0, // Convert toggle state to score
            explanation: trait.explanation?.replace(/[*-]/g, '').trim()
          })),
          interests: Object.keys(newInterests),
          interestWeights: newInterests,
          communicationStyle: {
            ...preservedCommunicationStyle,
            description: newAnalysis.communicationStyle.description?.replace(/[*-]/g, '').trim()
          },
          thoughtProcess: {
            ...newAnalysis.thoughtProcess,
            initialApproach: newAnalysis.thoughtProcess.initialApproach?.replace(/[*-]/g, '').trim(),
            processingStyle: newAnalysis.thoughtProcess.processingStyle?.replace(/[*-]/g, '').trim(),
            expressionStyle: newAnalysis.thoughtProcess.expressionStyle?.replace(/[*-]/g, '').trim()
          }
        });

        // Create a new chat with the updated personality
        try {
          const createChatResponse = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              analysis: finalAnalysis,
              tuning: {
                traitModifiers,
                interestWeights: newInterests,
                communicationStyle: {
                  ...preservedCommunicationStyle,
                  verbosity: currentTuning.communicationStyle.verbosity ?? 'medium'
                }
              }
            })
          });

          if (!createChatResponse.ok) {
            throw new Error('Failed to create new chat');
          }

          const chatData = await createChatResponse.json();
          if (chatData.success && chatData.data) {
            // Update conversations list with new chat
            setConversations(prev => [chatData.data, ...prev]);
            // Set new chat as active
            setActiveConversationId(chatData.data.id);
            // Clear messages for new chat
            setMessages([]);
          }
        } catch (error) {
          console.error('Failed to create new chat:', error);
          setError('Failed to create new chat with updated personality');
        }

      } catch (error: unknown) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Analysis update timed out - please try again');
        }
        throw error;
      }

    } catch (error: unknown) {
      console.error('Analysis error:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze personality');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStartTime(null);
    }
  };

  // Update checkCooldown function to use countdown
  const checkCooldown = async (operation: 'scrape' | 'analyze') => {
    try {
      const response = await fetch(`/api/cooldown?operation=${operation}`);
      const data = await response.json();
      
      const countdown = operation === 'scrape' ? scrapeCountdown : analyzeCountdown;
      
      setCooldownState(prev => ({
        ...prev,
        [operation]: {
          isOnCooldown: !data.canProceed,
          remainingTime: data.remainingTime
        }
      }));

      if (!data.canProceed && data.remainingTime) {
        countdown.resetTimer(data.remainingTime);
      }

      return data.canProceed;
    } catch (error) {
      console.error('Error checking cooldown:', error);
      return true;
    }
  };

  // Add effect to check cooldowns on mount
  useEffect(() => {
    const initializeCooldowns = async () => {
      await checkCooldown('scrape');
      await checkCooldown('analyze');
    };

    initializeCooldowns();
  }, []);

  // Update cooldown states based on countdown timers
  useEffect(() => {
    if (scrapeCountdown.timeLeft === 0) {
      setCooldownState(prev => ({
        ...prev,
        scrape: {
          isOnCooldown: false,
          remainingTime: undefined
        }
      }));
    } else if (scrapeCountdown.timeLeft) {
      setCooldownState(prev => ({
        ...prev,
        scrape: {
          isOnCooldown: true,
          remainingTime: scrapeCountdown.timeLeft
        }
      }));
    }
  }, [scrapeCountdown.timeLeft]);

  useEffect(() => {
    if (analyzeCountdown.timeLeft === 0) {
      setCooldownState(prev => ({
        ...prev,
        analyze: {
          isOnCooldown: false,
          remainingTime: undefined
        }
      }));
    } else if (analyzeCountdown.timeLeft) {
      setCooldownState(prev => ({
        ...prev,
        analyze: {
          isOnCooldown: true,
          remainingTime: analyzeCountdown.timeLeft
        }
      }));
    }
  }, [analyzeCountdown.timeLeft]);

  // Add handlers for terminal session
  const handleScrape = async () => {
    const canProceed = await checkCooldown('scrape');
    if (!canProceed) {
      return;
    }
    // Show consent modal first
    setShowConsent(true);
  };

  // Convert TwitterAPITweet to Tweet
  const convertToTweet = (apiTweet: TwitterAPITweet): Tweet => ({
    id: apiTweet.id,
    text: apiTweet.text,
    url: apiTweet.url,
    createdAt: apiTweet.timestamp || new Date().toISOString(),
    timestamp: apiTweet.timestamp || new Date().toISOString(),
    metrics: {
      likes: 0,
      retweets: 0,
      views: apiTweet.viewCount || 0,
      replies: 0,
      quotes: 0
    },
    images: [],
    isReply: apiTweet.isReply
  });

  // Update the tweet filtering logic with proper types
  const uniqueTweets = (newTweets: (Tweet | TwitterAPITweet)[]): Tweet[] => {
    // Create a map of existing tweets by ID for faster lookup
    const existingTweetsMap = new Map(accumulatedTweets.map(tweet => [tweet.id, tweet]));
    
    // Convert and deduplicate new tweets
    const convertedTweets = newTweets.map(tweet => 
      'metrics' in tweet ? tweet : convertToTweet(tweet)
    ).filter(tweet => !existingTweetsMap.has(tweet.id));

    return convertedTweets;
  };

  // Add unified tweet update function
  const updateTweetsState = (newTweets: (Tweet | TwitterAPITweet)[]) => {
    if (!Array.isArray(newTweets)) return;

    const validTweets = newTweets.filter((t: unknown): t is (Tweet | TwitterAPITweet) => Boolean(t));
    console.log('Processing valid tweets:', validTweets.length);
    
    // Convert all tweets to Tweet type and deduplicate
    const convertedTweets = uniqueTweets(validTweets);
    
    // Save to database first
    saveTweetsToDb(convertedTweets).catch(error => {
      console.warn('Failed to save tweets to database:', error);
    });

    // Update both accumulated tweets and parent state with the complete new set
    const updateFunction = (prevTweets: Tweet[]) => {
      const updatedTweets = [...prevTweets, ...convertedTweets];
      
      console.log('Tweet update summary:', {
        previousCount: prevTweets.length,
        newCount: convertedTweets.length,
        totalCount: updatedTweets.length,
        uniqueCount: new Set(updatedTweets.map(t => t.id)).size
      });
      
      // Force cache invalidation
      queryClient.invalidateQueries({ queryKey: ['tweets', profile.name] });
      
      return updatedTweets;
    };

    setAccumulatedTweets(updateFunction);
    onTweetsUpdate(updateFunction);
  };

  // Add unified state management functions
  const cleanupState = (options: {
    isError?: boolean;
    isComplete?: boolean;
    preserveProgress?: boolean;
    error?: string;
  }) => {
    const { isError, isComplete, preserveProgress, error } = options;

    // Always cleanup these states
    setLoading(false);
    setAbortController(null);
    setScrapingStartTime(null);

    // Cleanup progress unless preserving
    if (!preserveProgress) {
      setScanProgress(null);
    }

    // Handle completion states
    if (isComplete) {
      setShowComplete(true);
      setShowAnalysisPrompt(true);
    } else {
      setShowComplete(false);
      setShowAnalysisPrompt(false);
    }

    // Handle error state
    if (isError && error) {
      setError(error);
    } else {
      setError(null);
    }
  };

  // Add unified completion handler
  const handleCompletion = async (finalTweetCount?: number) => {
    console.log('Handling completion...');
    let retryCount = 0;
    const maxRetries = 3;

    try {
      while (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        
        const finalResponse = await fetch(`/api/tweets/${profile.name}/all`, {
          cache: 'no-store'
        });
        
        if (!finalResponse.ok) {
          throw new Error(`Failed to fetch tweets: ${finalResponse.status}`);
        }
        
        const finalTweets = await finalResponse.json();
        
        if (Array.isArray(finalTweets) && finalTweets.length > 0) {
          console.log('Final fetch successful:', {
            fetchedCount: finalTweets.length,
            currentCount: accumulatedTweets.length
          });
          
          // Force cache invalidation
          await queryClient.invalidateQueries({ queryKey: ['tweets', profile.name] });
          
          // Update states with complete dataset
          const validTweets = finalTweets.filter((t: unknown): t is Tweet => Boolean(t));
          setAccumulatedTweets(validTweets);
          onTweetsUpdate(validTweets);
          break;
        }
        
        console.log('Final fetch returned no tweets, retrying...');
        retryCount++;
      }
    } catch (error) {
      console.error('Error in final tweet fetch:', error);
    } finally {
      // Set final states
      setScanProgress({
        phase: 'complete',
        count: finalTweetCount || accumulatedTweets.length,
        message: `Collection complete: ${finalTweetCount || accumulatedTweets.length} tweets found`
      });
      cleanupState({ isComplete: true, preserveProgress: true });
      
      // Final cache invalidation
      queryClient.invalidateQueries({ queryKey: ['tweets', profile.name] });
    }
  };

  // Update startScraping to use unified functions
  const startScraping = async () => {
    const canProceed = await checkCooldown('scrape');
    if (!canProceed) {
      return;
    }

    if (!profile.name) {
      cleanupState({ isError: true, error: 'Profile name is required' });
      return;
    }

    // Reset all states and prepare for scraping
    cleanupState({});
    setShowConsent(false);
    setLoading(true);
    setScrapingStartTime(Date.now());
    
    // Don't reset accumulated tweets when re-scraping
    // Instead, mark them as being updated
    setScanProgress({
      phase: 'posts',
      count: accumulatedTweets.length,
      message: 'Initializing new scan...'
    });

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: profile.name,
          sessionId: Date.now().toString(),
          timestamp: Date.now(),
          existingCount: accumulatedTweets.length
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
          reader.cancel();
          cleanupState({});
          break;
        }
        
        if (done) {
          console.log('Stream complete');
          await handleCompletion();
          return;
        }

        // Parse the SSE data
        const text = new TextDecoder().decode(value);
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleEventData(data);
            } catch (err) {
              console.error('Failed to parse:', line, err);
            }
          }
        }
      }
    } catch (error: unknown) {
      console.error('Scraping error:', error);
      cleanupState({ 
        isError: true, 
        error: error instanceof Error ? error.message : 'Failed to start scraping'
      });
    }
  };

  // Update handleEventData to use unified functions
  const handleEventData = (data: EventData) => {
    console.log('Received event data:', data);

    // Handle errors first
    if (data.error) {
      console.error('Received error event:', data.error);
      cleanupState({ isError: true, error: data.error });
      return;
    }

    // Handle tweet updates with user isolation
    if (data.tweets && Array.isArray(data.tweets)) {
      if (data.username === profile.name) {
        if (data.isChunk) {
          console.log('Processing chunk for user:', profile.name, {
            chunkIndex: data.chunkIndex,
            totalTweets: data.totalTweets,
            chunkSize: data.tweets.length,
            isLastBatch: data.isLastBatch
          });
        }
        updateTweetsState(data.tweets);
      } else {
        console.warn('Received tweets for different user, ignoring:', data.username);
      }
    }

    // Handle progress updates with enhanced information
    if (data.scanProgress) {
      const phase = data.scanProgress.phase;
      if (phase === 'posts' || phase === 'replies' || phase === 'complete') {
        setScanProgress({
          phase,
          count: data.scanProgress.count,
          total: data.scanProgress.total,
          currentBatch: data.scanProgress.currentBatch,
          totalBatches: data.scanProgress.totalBatches,
          message: data.scanProgress.message || data.status || 
            `${phase === 'posts' ? 'SCANNING POSTS' : phase === 'replies' ? 'SCANNING REPLIES' : 'SCAN COMPLETE'}: ${data.scanProgress.count} TWEETS COLLECTED`,
          isRateLimited: data.type === 'warning' && data.message?.includes('Rate limit reached'),
          rateLimitReset: data.reset
        });
      } else {
        console.warn('Invalid scan phase received:', phase);
      }
    }

    // Handle rate limit warnings explicitly
    if (data.type === 'warning' && data.message?.includes('Rate limit reached')) {
      setScanProgress(prev => ({
        ...prev,
        phase: prev?.phase || 'posts', // Ensure phase is always defined
        count: prev?.count || 0, // Ensure count is always defined
        isRateLimited: true,
        rateLimitReset: data.reset,
        message: `Rate limit reached. Waiting for reset...`
      }));
    }

    // Handle completion
    if (data.type === 'complete' && data.username === profile.name) {
      handleCompletion();
    }
  };

  // Handle modal close
  const handleCloseModal = () => {
    console.log('Closing completion modal');
    cleanupState({});  // Reset all states to default
  };

  // Add auto-scroll effect
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  const handleCancelScraping = useCallback(async () => {
    if (abortController) {
      console.log('Aborting scraping process...');
      try {
        abortController.abort();
        await fetch(`/api/scrape/abort`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            username: profile.name,
            timestamp: Date.now() 
          })
        }).catch(error => console.error('Error cleaning up session:', error));

        cleanupState({ 
          isError: !abortController.signal.aborted, 
          error: 'Operation cancelled by user' 
        });
      } catch (error) {
        console.error('Error during abort:', error);
        cleanupState({ 
          isError: true, 
          error: 'Failed to cancel operation' 
        });
      }
    }
  }, [abortController, profile.name]);

  // Add dedicated data clearing function
  const clearTweetData = () => {
    setAccumulatedTweets([]);
    onTweetsUpdate([]);
    setAnalysis(null);
    setScanProgress(null);
    setShowAnalysisPrompt(false);
  };

  const handleClearData = async () => {
    if (!profile.name) {
      cleanupState({ isError: true, error: 'Profile name is required' });
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

      // Clear all tweet-related states
      clearTweetData();
      
      // Invalidate React Query cache for tweets
      await queryClient.invalidateQueries({ queryKey: ['tweets', profile.name] });
      
      // Show success message
      cleanupState({ isError: true, error: 'Tweet data cleared successfully' });
    } catch (error) {
      console.error('Error clearing tweets:', error);
      cleanupState({ 
        isError: true, 
        error: error instanceof Error ? error.message : 'Failed to clear tweet data' 
      });
    }
  };

  // Load existing tweets effect
  useEffect(() => {
    const loadExistingTweets = async () => {
      if (!profile.name || isLoadingTweets) return;
      
      // If we have initial tweets, use those instead of fetching
      if (initialTweets?.length > 0) {
        console.log('Using provided initial tweets:', initialTweets.length);
        setAccumulatedTweets(initialTweets);
        onTweetsUpdate(initialTweets);
        setScanProgress({
          phase: 'complete',
          count: initialTweets.length,
          message: `${initialTweets.length} tweets loaded`
        });
        return;
      }
      
      const MAX_RETRIES = 3;
      const INITIAL_DELAY = 2000; // 2 seconds
      let retryCount = 0;
      
      const attemptLoad = async (delay: number): Promise<void> => {
        try {
          setIsLoadingTweets(true);
          console.log(`Loading tweets for: ${profile.name} (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
          
          const response = await fetch(`/api/tweets/${profile.name}/all`, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache'
            }
          });
          
          if (!response.ok) {
            throw new Error('Failed to fetch existing tweets');
          }
          
          const existingTweets = await response.json();
          console.log('Loaded tweets from database:', existingTweets?.length || 0);
          
          if (Array.isArray(existingTweets)) {
            const validTweets = existingTweets.filter((t: unknown): t is Tweet => Boolean(t));
            console.log('Valid tweets found:', validTweets.length);
            
            if (validTweets.length > 0) {
              setAccumulatedTweets(validTweets);
              onTweetsUpdate(validTweets);
              setScanProgress({
                phase: 'complete',
                count: validTweets.length,
                message: `${validTweets.length} tweets loaded from database`
              });
            } else if (retryCount < MAX_RETRIES) {
              retryCount++;
              const nextDelay = delay * 2; // Exponential backoff
              console.log(`No tweets found, retrying in ${nextDelay/1000}s...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              await attemptLoad(nextDelay);
            } else {
              console.log('No tweets found after maximum retries');
              setScanProgress({
                phase: 'ready',
                count: 0,
                message: 'No tweets found - ready to start scanning'
              });
            }
          }
        } catch (error) {
          console.error('Error loading existing tweets:', error);
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            const nextDelay = delay * 2; // Exponential backoff
            console.log(`Error occurred, retrying in ${nextDelay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            await attemptLoad(nextDelay);
          } else {
            setError(error instanceof Error ? error.message : 'Failed to load existing tweets');
          }
        } finally {
          if (retryCount >= MAX_RETRIES) {
            setIsLoadingTweets(false);
          }
        }
      };

      await attemptLoad(INITIAL_DELAY);
    };

    loadExistingTweets();
  }, [profile.name, isLoadingTweets, onTweetsUpdate, initialTweets]);

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
        const messages = data.data.map((msg: APIMessage) => ({
          text: msg.content || '',
          isUser: msg.role === 'user',
          timestamp: new Date().toLocaleTimeString(),
          type: 'chat' as const
        }));
        
        // Only keep the last MAX_MESSAGES
        setMessages(messages.slice(-MAX_MESSAGES));
        setActiveConversationId(conversation.id);
        
        setConversations(prev => prev.map(conv => 
          conv.id === conversation.id 
            ? {
                ...conv,
                metadata: {
                  ...conv.metadata,
                  messageCount: messages.length
                }
              }
            : conv
        ));
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
        // Ensure new chat has proper metadata without preview
        const newChat = {
          ...data.data,
          metadata: {
            ...data.data.metadata,
            messageCount: 0,
            isActive: true
          }
        };
        
        setConversations(prev => [newChat, ...prev]);
        setActiveConversationId(newChat.id);
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
      cleanupState({ 
        isError: true, 
        error: error instanceof Error ? error.message : 'Failed to delete conversation' 
      });
    }
  };

  // Update the tweet saving logic
  const saveTweetsToDb = async (tweetsToSave: Tweet[]) => {
    try {
      await fetch('/api/tweets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: profile.name,
          tweets: tweetsToSave 
        })
      })
    } catch (error) {
      console.warn('Failed to save tweets to database:', error)
    }
  }

  // Create EventSource in useEffect with cleanup
  useEffect(() => {
    if (!profile.name || !loading) return;

    console.log('Initializing SSE connection for:', profile.name);
    const eventSource = new EventSource(`/api/scrape?username=${encodeURIComponent(profile.name)}`, {
      withCredentials: true // Add credentials to ensure auth headers are sent
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE received data:', {
          type: data.type,
          phase: data.phase,
          tweetCount: data.tweets?.length,
          progress: data.progress,
          error: data.error,
          username: data.username
        });
        
        if (data.username === profile.name) {
          handleEventData(data);
        } else {
          console.warn('Received data for different user:', data.username);
        }
      } catch (error) {
        console.error('Error parsing event data:', error);
        cleanupState({ isError: true, error: 'Failed to parse server response' });
      }
    };

    eventSource.onerror = (error) => {
      // Check if the error is due to connection close
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('SSE connection closed normally');
        return;
      }

      console.error('SSE connection error:', {
        readyState: eventSource.readyState,
        error: error,
        url: eventSource.url
      });

      // Only show error if we're still loading and not a normal close
      if (loading && eventSource.readyState !== EventSource.CLOSED) {
        cleanupState({ isError: true, error: 'Connection error - please try again' });
      }
      eventSource.close();
    };

    eventSource.onopen = () => {
      console.log('SSE connection opened successfully');
    };

    return () => {
      console.log('Cleaning up SSE connection');
      eventSource.close();
    };
  }, [profile.name, loading]);

  // Handler for DOM scroll events (used in non-virtualized areas)
  const handleDOMScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const threshold = 200;
    setShowProfile(scrollTop < threshold);
  }, []);

  // Handler for Virtuoso scroll position changes
  const handleVirtuosoScroll = useCallback((atBottom: boolean) => {
    setShowProfile(!atBottom);
  }, []);

  // Add handleRenameConversation function
  const handleRenameConversation = async (conversationId: number, newTitle: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: newTitle })
      });

      if (!response.ok) {
        throw new Error('Failed to rename conversation');
      }

      const data = await response.json();
      if (data.success && data.data) {
        setConversations(prev => 
          prev.map(conv => 
            conv.id === conversationId 
              ? { ...conv, title: newTitle }
              : conv
          )
        );
      }
    } catch (error) {
      console.error('Error renaming conversation:', error);
      setError(error instanceof Error ? error.message : 'Failed to rename conversation');
    } finally {
      setLoading(false);
    }
  };

  // Format remaining time
  const formatRemainingTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  // Update button rendering to show cooldown state
  const renderActionButton = (type: 'scrape' | 'analyze') => {
    const countdown = type === 'scrape' ? scrapeCountdown : analyzeCountdown;
    const isCoolingDown = cooldownState[type].isOnCooldown;
    const buttonText = type === 'scrape' ? 
      (loading ? 'ABORT SEQUENCE' : 'EXECUTE DATA EXTRACTION') : 
      (isAnalyzing ? 'ANALYZING' : (analysis ? 'UPDATE ANALYSIS' : 'START ANALYSIS'));

    return (
      <button
        onClick={type === 'scrape' ? 
          (loading ? handleCancelScraping : handleScrape) : 
          (isAnalyzing ? undefined : (analysis ? handleUpdateAnalysis : handleAnalyze))}
        disabled={isCoolingDown || (type === 'analyze' && (isAnalyzing || !accumulatedTweets.length))}
        className={`w-full px-3 py-2 font-medium bg-red-500/5 text-red-500/90 border border-red-500/30 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 ancient-text disabled:opacity-50 disabled:cursor-not-allowed ${!loading && !analysis ? 'pulse-action' : ''}`}
      >
        {(type === 'scrape' && loading) || (type === 'analyze' && isAnalyzing) ? (
          <div className="flex items-center justify-center gap-2">
            <Spinner size="sm" />
            <span>{buttonText}</span>
          </div>
        ) : isCoolingDown && countdown.timeLeft ? (
          <span>COOLDOWN: {formatRemainingTime(countdown.timeLeft)}</span>
        ) : (
          buttonText
        )}
      </button>
    );
  };

  // Add cleanup effect
  useEffect(() => {
    if (messages.length > MAX_MESSAGES) {
      const excessMessages = messages.length - MAX_MESSAGES;
      setMessages(prev => prev.slice(excessMessages));
      
      // If we have an active conversation, update the server
      if (activeConversationId) {
        fetch(`/api/conversations/${activeConversationId}/cleanup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepLast: MAX_MESSAGES })
        }).catch(error => {
          console.warn('Failed to cleanup messages on server:', error);
        });
      }
    }
  }, [messages.length, activeConversationId]);

  // Add session expiry handler
  useEffect(() => {
    const handleSessionExpiry = (event: Event) => {
      const customEvent = event as CustomEvent;
      setSessionExpired(true);
      setError(customEvent.detail?.message || 'Session expired - please reconnect your Twitter account');
      // Clear sensitive data
      setMessages([]);
      setAnalysis(null);
      // Force cache invalidation
      queryClient.invalidateQueries();
    };

    window.addEventListener('session-expired', handleSessionExpiry);
    return () => window.removeEventListener('session-expired', handleSessionExpiry);
  }, [queryClient]);

  // Add reconnect handler
  const handleReconnect = useCallback(() => {
    window.location.href = '/api/auth/signin';
  }, []);

  return (
    <> {/* Mobile layout */}
      <div className={`flex flex-col w-full min-h-screen pt-5 sm:pt-9 md:pt-9 lg:pt-16 px-2 sm:px-5 pb-6 gap-4 sm:gap-6 md:gap-8 mobile-layout relative z-0 overflow-x-hidden ${sessionExpired ? 'pointer-events-none opacity-50' : ''}`}>
        {/* Session Expired Alert */}
        {sessionExpired && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-red-500/10 border-b border-red-500/20 p-4 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-400/90">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span>Session expired - please reconnect your Twitter account</span>
              </div>
              <button
                onClick={handleReconnect}
                className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded hover:bg-red-500/20 text-red-400/90 text-sm"
              >
                Reconnect
              </button>
            </div>
          </div>
        )}

        {/* Chat Interface Panel */}
        <div className="w-full backdrop-blur-md bg-black/40 border border-red-500/10 rounded-lg shadow-2xl hover-glow ancient-border rune-pattern overflow-hidden relative z-10 mb-4 sm:mb-6 md:mb-8">
          <div className="flex flex-col h-[85vh] sm:h-[80vh] md:h-[75vh]">
            {/* Chat Header */}
            <div className="flex-none flex items-center justify-between px-3 sm:px-4 py-5 sm:py-5 bg-black/40 backdrop-blur-sm border-b border-red-500/10 rounded-t-lg cryptic-shadow relative z-40">
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
                  onRenameConversation={handleRenameConversation}
                  isLoading={isLoadingConversations}
                />
            </div>

            {/* Chat Messages Container */}
            <div 
              className="flex-1 overflow-hidden backdrop-blur-sm bg-black/20 ancient-scroll min-h-0 relative z-30"
            >
              {!analysis ? (
                <div className="text-red-500/70 italic text-center glow-text p-4">
                  Start personality analysis to begin chat interaction
                </div>
              ) : (
                <>
                  {/* Sticky Profile Section */}
                  <div className={`sticky top-0 z-35 p-4 bg-black/40 backdrop-blur-md transition-opacity duration-300 ${showProfile ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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

                  {/* Virtualized Messages */}
                  <Virtuoso
                    style={{ height: '100%' }}
                    data={messages}
                    itemContent={(index, msg: ChatBoxMessage) => (
                      msg.type === 'chat' ? (
                        <ChatMessage message={msg} isUser={msg.isUser} />
                      ) : (
                        <TuningUpdateMessage
                          type={msg.tuningInfo!.tuningType}
                          name={msg.tuningInfo!.name}
                          value={msg.tuningInfo!.value}
                          timestamp={msg.timestamp}
                        />
                      )
                    )}
                    followOutput="smooth"
                    alignToBottom
                    atBottomStateChange={handleVirtuosoScroll}
                    components={{
                      Footer: () => (
                        isTyping ? (
                          <div className="flex justify-start p-4">
                            <div className="max-w-[80%] rounded-lg p-3 bg-red-500/5 text-red-500/80">
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-red-500/50 animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-2 h-2 rounded-full bg-red-500/50 animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-2 h-2 rounded-full bg-red-500/50 animate-bounce" />
                              </div>
                            </div>
                          </div>
                        ) : null
                      )
                    }}
                  />
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
              {renderActionButton('scrape')}
              {(!analysis || isAnalyzing) ? null : renderActionButton('analyze')}
              {accumulatedTweets.length > 0 && (
                <button
                  onClick={handleClearData}
                  className="w-full font-medium px-3 py-2 border border-red-500/30 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs ancient-text"
                >
                  CLEAR DATA
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full font-medium px-3 py-2 border border-red-500/30 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs ancient-text"
              >
                TERMINATE SESSION
              </button>
            </div>
          </div>
        </div>

        {/* Personality Fine-Tuning Panel - Mobile */}
        <div className="w-full bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern mb-4 sm:mb-6 md:mb-8">
          <FineTuningPanel
            analysis={analysis}
            tuning={tuning}
            onTraitAdjustment={handleTraitAdjustment}
            onInterestWeight={handleInterestWeight}
            onStyleAdjustment={handleStyleAdjustment}
            isCacheFresh={personalityCache.isFresh}
            lastCacheUpdate={personalityCache.lastUpdated}
            isCacheLoading={personalityCache.isLoading}
            onRefreshCache={handleAnalyze}
            containerClassName="max-h-[60vh] sm:max-h-[50vh] md:max-h-[40vh]"
            variant="mobile"
          />
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
                  Ready to analyze {accumulatedTweets.length} tweets for personality insights
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
                <div className="bg-black/20 text-left rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
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
                    <span className="ancient-text text-base">Active Traits</span>
                  </h4>
                  <div className="space-y-6">
                    {analysis.traits
                      .filter(trait => tuning.traitModifiers[trait.name] > 0) // Only show enabled traits
                      .map((trait: { name: string; score: number; explanation: string }, index: number) => (
                        <div key={`trait-${index}-${trait.name}`} className="hover-glow">
                          <div className="flex justify-between mb-2 items-center">
                            <span className="text-red-400/90 tracking-wide text-[15px] capitalize font-bold">
                              {formatTraitName(trait.name)}
                            </span>
                          </div>
                          <div className="text-[14px] leading-relaxed text-red-300/80 prose prose-red prose-invert max-w-none hover-text-glow pl-2 border-l border-red-500/10">
                            <ReactMarkdown>{formatTraitExplanation(trait.explanation)}</ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    {analysis.traits.filter(trait => tuning.traitModifiers[trait.name] > 0).length === 0 && (
                      <div className="text-red-400/60 text-sm italic text-center">
                        No active traits selected
                      </div>
                    )}
                  </div>
                </div>

                {/* Interests Section */}
                <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text text-base">Active Interests</span>
                  </h4>
                  <div className="flex flex-wrap gap-2.5 font-bold">
                    {analysis.interests
                      .filter(interest => {
                        // Filter out social behavior metrics and other non-interest items
                        const nonInterests = [
                          'Content Sharing Patterns',
                          'Score',
                          'Interaction Style',
                          'Platform Behavior',
                          'Oversharer',
                          'Reply Guy',
                          'Viral Chaser',
                          'Thread Maker',
                          'Retweeter',
                          'Hot Takes',
                          'Joker',
                          'Debater',
                          'Doom Poster',
                          'Early Adopter',
                          'Knowledge Dropper',
                          'Hype Beast'
                        ];
                        const [interestName] = interest.split(':').map(s => s.trim());
                        return !nonInterests.includes(interestName) && tuning.interestWeights[interestName] > 0;
                      })
                      .map((interest: string) => {
                        const [interestName] = interest.split(':').map(s => s.trim());
                        return (
                          <button 
                            key={interestName}
                            className="px-3 py-1.5 bg-red-500/5 border border-red-500/20 rounded-md text-red-300/90 text-[14px] tracking-wide hover:bg-red-500/10 hover:border-red-500/30 transition-colors duration-200 hover-glow"
                          >
                            {formatInterestName(interestName)}
                          </button>
                        );
                      })}
                    {analysis.interests
                      .filter(interest => {
                        const [interestName] = interest.split(':').map(s => s.trim());
                        return tuning.interestWeights[interestName] > 0;
                      }).length === 0 && (
                      <div className="text-red-400/60 text-sm italic text-center w-full">
                        No active interests selected
                      </div>
                    )}
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
                        Formality: {analysis.communicationStyle.formality === 'high' ? 'Very formal and professional' : 
                                   analysis.communicationStyle.formality === 'medium' ? 'Balanced formality' : 
                                   'Casual and relaxed'}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                      <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                        Enthusiasm: {analysis.communicationStyle.enthusiasm === 'high' ? 'Very enthusiastic and energetic' :
                                    analysis.communicationStyle.enthusiasm === 'medium' ? 'Balanced enthusiasm' :
                                    'Reserved and measured'}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                      <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                        Technical Level: {analysis.communicationStyle.technicalLevel === 'high' ? 'Advanced technical language' :
                                        analysis.communicationStyle.technicalLevel === 'medium' ? 'Mix of technical and simple terms' :
                                        'Simple, everyday language'}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                      <span className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow">
                        Emoji Usage: {analysis.communicationStyle.emojiUsage === 'high' ? 'Frequent emojis (3+)' :
                                     analysis.communicationStyle.emojiUsage === 'medium' ? 'Occasional emojis (1-2)' :
                                     'No emojis'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Topics & Themes Section */}
                <div className="bg-black/20 rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text text-base">Topics & Themes</span>
                  </h4>
                  <ul className="list-none space-y-3 bg-black/20 rounded-lg p-4">
                    {analysis.topicsAndThemes
                      .filter(topic => {
                        // Filter out social behavior metrics and other non-interest items
                        const nonInterests = [
                          'Content Sharing Patterns',
                          'Score',
                          'Interaction Style',
                          'Platform Behavior',
                          'Oversharer',
                          'Reply Guy',
                          'Viral Chaser',
                          'Thread Maker',
                          'Retweeter',
                          'Hot Takes',
                          'Joker',
                          'Debater',
                          'Doom Poster',
                          'Early Adopter',
                          'Knowledge Dropper',
                          'Hype Beast'
                        ];
                        return !nonInterests.some(metric => topic.includes(metric));
                      })
                      .map((topic: string, i: number) => (
                        <li key={i} className="flex items-center gap-3 text-red-300/90 hover-text-glow group">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500/30 group-hover:bg-red-500/50 transition-colors duration-200"></div>
                          <span className="text-[14px] leading-relaxed tracking-wide font-bold">
                            {topic ? topic.replace(/[*-]/g, '') : topic}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>

                {/* Emotional Tone Section */}
                <div className="bg-black/20 text-left rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text text-base">Emotional Tone</span>
                  </h4>
                  <div className="space-y-4 bg-black/20 rounded-lg p-4">
                    {analysis.emotionalTone.split(' - ').map((section, index) => {
                      const [title, content] = section.split(' involves ').length > 1 
                        ? section.split(' involves ')
                        : section.split(' shows ').length > 1
                        ? section.split(' shows ')
                        : section.split(' is ');
                      
                      return (
                        <div key={`tone-${index}`} className="flex items-start gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                          <div className="flex-1">
                            <span className="text-red-400/90 font-medium">{title}</span>
                            <p className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow mt-1">
                              {content}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Thought Process Section */}
                <div className="bg-black/20 text-left rounded-lg p-6 backdrop-blur-sm border border-red-500/10 hover-glow ancient-border">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    <span className="ancient-text text-base">Response Patterns</span>
                  </h4>
                  <div className="space-y-6">
                    {/* Core Response Patterns */}
                    <div className="space-y-3 bg-black/20 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                        <div className="flex-1">
                          <span className="text-red-400/90 font-medium">Initial Approach</span>
                          <p className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow mt-1">
                            {analysis.thoughtProcess?.initialApproach || 'Balances quick insights with careful consideration'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                        <div className="flex-1">
                          <span className="text-red-400/90 font-medium">Processing Style</span>
                          <p className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow mt-1">
                            {analysis.thoughtProcess?.processingStyle || 'Combines analytical thinking with practical insights'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/20 glow-box mt-1.5"></div>
                        <div className="flex-1">
                          <span className="text-red-400/90 font-medium">Expression Style</span>
                          <p className="text-red-300/90 text-[14px] leading-relaxed hover-text-glow mt-1">
                            {analysis.thoughtProcess?.expressionStyle || 'Adapts communication style to context while maintaining authenticity'}
                          </p>
                        </div>
                      </div>
                    </div>
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
              {accumulatedTweets.length === 0 ? (
                <div className="text-red-500/50 italic glow-text text-center">
                  {'>'} {loading ? 'Fetching data...' : 'Awaiting data collection initialization...'}
                </div>
              ) : (
                <TweetList
                  username={profile.name || ''}
                  includeReplies={true}
                  className="flex-1"
                  isScrapingActive={loading}
                  scrapingProgress={scanProgress}
                  tweets={accumulatedTweets} // Add this line
                />
              )}
            </div>
          </div>
        </div>

        {/* Mobile Consent Modal */}
        <ConsentModal 
          isOpen={showConsent}
          onClose={() => setShowConsent(false)}
          onAuthorize={startScraping}
          loading={loading}
          onCancelScraping={handleCancelScraping}
        />

        {/* Mobile Completion Modal */}
        <CompletionModal 
          isOpen={showComplete}
          onClose={handleCloseModal}
          tweetCount={accumulatedTweets.length}
        />
      </div>

      {/* ============================================================================
          DESKTOP LAYOUT
          ============================================================================ */}
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
                {renderActionButton('scrape')}
                {(!analysis || isAnalyzing) ? null : renderActionButton('analyze')}
                {accumulatedTweets.length > 0 && (
                  <button
                    onClick={handleClearData}
                    className="w-full font-medium px-3 py-2 border border-red-500/30 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs ancient-text"
                  >
                    CLEAR DATA
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-full font-medium px-3 py-2 border border-red-500/30 text-red-500/60 rounded hover:bg-red-500/5 hover:text-red-500/80 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs ancient-text"
                >
                  TERMINATE SESSION
                </button>
              </div>
            </div>
          </div>

          {/* Personality Fine-Tuning Panel */}
          <div className="w-full flex-1 bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern overflow-hidden min-h-0">
            <FineTuningPanel
              analysis={analysis}
              tuning={tuning}
              onTraitAdjustment={handleTraitAdjustment}
              onInterestWeight={handleInterestWeight}
              onStyleAdjustment={handleStyleAdjustment}
              isCacheFresh={personalityCache.isFresh}
              lastCacheUpdate={personalityCache.lastUpdated}
              isCacheLoading={personalityCache.isLoading}
              onRefreshCache={handleAnalyze}
            />
          </div>
        </div>

        {/* Right Side Panels Container */}
        <div className="fixed top-20 right-0 md:right-6 lg:right-8 h-[calc(100vh-104px)] w-[26vw] lg:w-[22vw] xl:w-[20vw] min-w-[280px] max-w-[400px] flex flex-col gap-6 px-4 md:px-0 overflow-y-auto md:overflow-hidden transition-all duration-300">
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

            {/* Progress Status */}
            {loading && (
              <div className="p-3 bg-black/20 border-b border-red-500/10 backdrop-blur-sm">
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

            {/* Tweet List */}
            {accumulatedTweets.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-red-500/50 italic text-center glow-text">
                  {'>'} {loading ? 'Fetching data...' : 'Awaiting data collection initialization...'}
                </div>
              </div>
            ) : (
              <TweetList
                username={profile.name || ''}
                includeReplies={true}
                className="flex-1 overflow-y-auto overflow-x-hidden"
                isScrapingActive={loading}
                scrapingProgress={scanProgress}
                tweets={accumulatedTweets} // Add this line
              />
            )}
          </div>

          {/* Personality Analysis Panel - Bottom Half */}
          <div className="h-[calc(50%-2px)] min-h-[300px] bg-black/40 backdrop-blur-md border border-red-500/10 rounded-lg shadow-2xl flex flex-col hover-glow ancient-border rune-pattern">
            <div className="flex-none border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm cryptic-shadow">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" />
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider ancient-text">PERSONALITY ANALYSIS</h3>
              </div>
            </div>

            <AnalysisSummary 
              analysis={analysis}
              tuning={tuning}
              isAnalyzing={isAnalyzing}
              analysisElapsedTime={analysisElapsedTime}
              showAnalysisPrompt={showAnalysisPrompt}
              accumulatedTweetsCount={accumulatedTweets.length}
              onAnalyze={handleAnalyze}
              containerClassName="max-h-[50vh] sm:max-h-[45vh] md:max-h-[40vh]"
              retryState={retryState}
            />
          </div>
        </div>

        {/* Main Center Chat Interface Container */}
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
                  onRenameConversation={handleRenameConversation}
                  isLoading={isLoadingConversations}
                />
              </div>

              {/* Chat Messages Container */}
              <div 
                className="flex-1 overflow-y-auto custom-scrollbar backdrop-blur-sm bg-black/20 ancient-scroll min-h-0 relative z-30"
                onScroll={handleDOMScroll}
              >
                {!analysis ? (
                  <div className="text-red-500/70 italic text-center glow-text p-4">
                    Start personality analysis to begin chat interaction
                  </div>
                ) : (
                  <>
                    {/* Sticky Profile Section */}
                    <div className={`sticky top-0 z-35 p-4 bg-black/40 backdrop-blur-md transition-opacity duration-300 ${showProfile ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
                      {messages.map((msg: ChatBoxMessage, i: number) => (
                        msg.type === 'chat' ? (
                          <ChatMessage key={`msg-${i}`} message={msg} isUser={msg.isUser} />
                        ) : (
                          <TuningUpdateMessage key={`tuning-${i}`} type={msg.tuningInfo!.tuningType} name={msg.tuningInfo!.name} value={msg.tuningInfo!.value} timestamp={msg.timestamp} />
                        )
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

        {/* Psychoanalysis Modal */}
        <PsychoanalysisModal 
          isOpen={showPsychoanalysis} 
          onClose={() => setShowPsychoanalysis(false)}
          analysis={analysis}
        />
      </div>
    </>
  )
}