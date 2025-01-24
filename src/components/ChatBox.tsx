import { useState, useEffect } from 'react'
import { Tweet, TwitterProfile } from '@/types/scraper'
import { PersonalityAnalysis } from '@/lib/openai'
import ReactMarkdown from 'react-markdown'
import '@/styles/glow.css'

interface ChatBoxProps {
  tweets: Tweet[]
  profile: TwitterProfile
  onClose: () => void
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

export default function ChatBox({ tweets, profile, onClose }: ChatBoxProps) {
  const [messages, setMessages] = useState<Array<{text: string, isUser: boolean}>>([])
  const [input, setInput] = useState('')
  const [analysis, setAnalysis] = useState<PersonalityAnalysis | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`analysis_${profile.name}`)
      return saved ? JSON.parse(saved) : null
    }
    return null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const handleTraitAdjustment = (traitName: string, adjustment: number) => {
    setTuning(prev => ({
      ...prev,
      traitModifiers: {
        ...prev.traitModifiers,
        [traitName]: adjustment
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
          tuning,
          tweets,
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to get response')
      }
      
      const data = await response.json()
      return data.response
    } catch (err) {
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
    setLoading(true)
    setError(null)
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
        traitModifiers: Object.fromEntries(data.traits.map((trait: { name: string }) => [trait.name, 0])),
        interestWeights: {},
        customInterests: [],
        communicationStyle: {
          formality: data.communicationStyle.formality,
          enthusiasm: data.communicationStyle.enthusiasm,
          technicalLevel: data.communicationStyle.technicalLevel,
          emojiUsage: data.communicationStyle.emojiUsage
        }
      }

      // Initialize interest weights with rounded values
      const initialWeights: { [key: string]: number } = {}
      data.interests.forEach((interest: string) => {
        initialWeights[interest] = 50 // Set default weight to Medium (50)
      })

      initialTuning.interestWeights = initialWeights

      setTuning(initialTuning)
      setAnalysis(data)
      
      // Save to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(`analysis_${profile.name}`, JSON.stringify(data))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Helper function to get weight label
  const getWeightLabel = (weight: number) => {
    const roundedWeight = Math.round(weight / 25) * 25
    if (roundedWeight === 0) return 'Disabled'
    if (roundedWeight <= 25) return 'Low'
    if (roundedWeight <= 50) return 'Medium'
    if (roundedWeight <= 75) return 'High'
    return 'Very High'
  }

  return (
    <>
      {/* Fine Tuning Panel - Left Side */}
      <div className="fixed top-0 left-0 h-screen w-[500px] bg-black/40 backdrop-blur-md border-r border-red-500/10 shadow-2xl flex flex-col hover-glow">
        <div className="border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm glow-border">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
            <h3 className="text-sm font-bold text-red-500/90 tracking-wider glow-text">PERSONALITY FINE-TUNING</h3>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 backdrop-blur-sm bg-black/20 dynamic-bg">
          {analysis ? (
            <>
              {/* Trait Adjustments */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                  <span className="glow-text">Personality Traits</span>
                </h4>
                <div className="space-y-3">
                  {analysis.traits.map((trait: { name: string; score: number }) => (
                    <div key={trait.name} className="space-y-1 hover-glow">
                      <div className="flex justify-between text-xs text-red-400/70">
                        <span className="hover-text-glow">{trait.name}</span>
                        <span className="hover-text-glow">
                          Base: {trait.score}/10 | Adjusted: {Math.max(0, Math.min(10, trait.score + (tuning.traitModifiers[trait.name] || 0)))}/10
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-2"
                        max="2"
                        step="1"
                        value={Math.round(tuning.traitModifiers[trait.name] || 0)}
                        onChange={(e) => handleTraitAdjustment(trait.name, parseInt(e.target.value))}
                        className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Interest Weights */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                  Interests & Topics
                </h4>
                
                {/* Add Custom Interest */}
                <form onSubmit={handleAddCustomInterest} className="flex gap-2">
                  <input
                    type="text"
                    value={newInterest}
                    onChange={(e) => setNewInterest(e.target.value)}
                    placeholder="Add custom interest..."
                    className="flex-1 bg-black/40 text-red-400/90 placeholder-red-500/30 px-3 py-1.5 text-xs rounded border border-red-500/20 focus:border-red-500/40 focus:outline-none focus:ring-1 focus:ring-red-500/20"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded text-xs hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </form>

                <div className="space-y-3">
                  {/* Original Interests */}
                  {analysis.interests.map((interest: string) => (
                    <div key={interest} className="space-y-1">
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
                  ))}
                  
                  {/* Custom Interests */}
                  {tuning.customInterests.map((interest) => (
                    <div key={interest} className="space-y-1">
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
                      <span className="hover-text-glow">Enthusiasm</span>
                      <span className="hover-text-glow">
                        {tuning.communicationStyle.enthusiasm === 0 ? 'None' :
                         tuning.communicationStyle.enthusiasm <= 25 ? 'Minimal' :
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
                      <span className="hover-text-glow">Emoji Usage</span>
                      <span className="hover-text-glow">
                        {tuning.communicationStyle.emojiUsage === 0 ? 'None' :
                         tuning.communicationStyle.emojiUsage <= 25 ? 'Minimal (1)' :
                         tuning.communicationStyle.emojiUsage <= 50 ? 'Moderate (1-2)' :
                         tuning.communicationStyle.emojiUsage <= 75 ? 'High (2-3)' :
                         'Very High (3+)'}
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
            </>
          ) : (
            <div className="text-red-500/70 italic text-center glow-text">
              Run personality analysis to enable fine-tuning
            </div>
          )}
        </div>
      </div>

      {/* Main Chat and Analysis - Right Side */}
      <div className="fixed top-0 right-0 h-screen w-[500px] grid grid-rows-2">
        {/* Chat Interface */}
        <div className="row-span-1 bg-black/40 backdrop-blur-md border-l border-red-500/10 shadow-2xl flex flex-col hover-glow">
          <div className="border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm glow-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider glow-text">CHAT INTERFACE</h3>
              </div>
              <button
                onClick={onClose}
                className="text-red-500/70 hover:text-red-500/90 hover-text-glow"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 backdrop-blur-sm bg-black/20 dynamic-bg">
            {!analysis ? (
              <div className="text-red-500/70 italic text-center glow-text">
                Start personality analysis to begin chat interaction
              </div>
            ) : (
              messages.map((msg, i) => (
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
                    <p className="text-red-500/90 hover-text-glow">{msg.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {analysis && (
            <div className="border-t border-red-500/10 p-4 bg-black/40 backdrop-blur-sm glow-border">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Enter your message..."
                  className="flex-1 bg-black/20 text-red-400/90 border border-red-500/20 rounded px-3 py-1.5 text-sm placeholder:text-red-500/30 focus:outline-none focus:border-red-500/40 hover-glow"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="px-3 py-1.5 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow"
                >
                  Send
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Personality Analysis */}
        <div className="row-span-1 bg-black/40 backdrop-blur-md border-l border-t border-red-500/10 shadow-2xl flex flex-col hover-glow">
          <div className="border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm glow-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider glow-text">PERSONALITY ANALYSIS</h3>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 backdrop-blur-sm bg-black/20 dynamic-bg">
            {!analysis ? (
              <div className="text-center">
                <p className="text-red-500/70 mb-4 glow-text">
                  Ready to analyze {tweets.length} tweets for personality insights
                </p>
                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed hover-glow"
                >
                  {loading ? 'ANALYZING...' : 'START ANALYSIS'}
                </button>
              </div>
            ) : (
              <div className="space-y-6 text-red-400/90">
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                    <span className="glow-text">Summary</span>
                  </h4>
                  <div className="prose prose-red prose-invert max-w-none hover-text-glow">
                    <ReactMarkdown>{analysis.summary}</ReactMarkdown>
                  </div>
                </div>

                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                    <span className="glow-text">Key Traits</span>
                  </h4>
                  <div className="space-y-3">
                    {analysis.traits.map((trait: { name: string; score: number; explanation: string }, i: number) => (
                      <div key={i} className="hover-glow">
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
                
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                    <span className="glow-text">Interests</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {analysis.interests.map((interest: string, i: number) => (
                      <span 
                        key={i}
                        className="px-3 py-1.5 bg-red-500/5 border border-red-500/20 rounded-lg text-sm backdrop-blur-sm hover-glow hover-text-glow"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                    <span className="glow-text">Communication Style</span>
                  </h4>
                  <div className="prose prose-red prose-invert max-w-none hover-text-glow">
                    <ReactMarkdown>{analysis.communicationStyle.description}</ReactMarkdown>
                  </div>
                </div>
                
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                    <span className="glow-text">Topics & Themes</span>
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
                
                <div className="bg-black/20 rounded-lg p-4 backdrop-blur-sm border border-red-500/10 hover-glow">
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20 glow-box"></div>
                    <span className="glow-text">Emotional Tone</span>
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
    </>
  )
} 