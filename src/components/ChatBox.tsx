import { useState } from 'react'
import { Tweet, TwitterProfile } from '@/types/scraper'
import { PersonalityAnalysis } from '@/lib/openai'
import ReactMarkdown from 'react-markdown'

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

  return (
    <>
      {/* Fine Tuning Panel - Left Side */}
      <div className="fixed top-0 left-0 h-screen w-[500px] bg-black/40 backdrop-blur-md border-r border-red-500/10 shadow-2xl flex flex-col">
        <div className="border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
            <h3 className="text-sm font-bold text-red-500/90 tracking-wider">PERSONALITY FINE-TUNING</h3>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 backdrop-blur-sm bg-black/20">
          {analysis ? (
            <>
              {/* Trait Adjustments */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                  Personality Traits
                </h4>
                <div className="space-y-3">
                  {analysis.traits.map((trait: { name: string; score: number }) => (
                    <div key={trait.name} className="space-y-1">
                      <div className="flex justify-between text-xs text-red-400/70">
                        <span>{trait.name}</span>
                        <span>
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
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
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
                        <span>
                          {tuning.interestWeights[interest] === 0 ? 'Disabled' :
                           tuning.interestWeights[interest] <= 25 ? 'Low' :
                           tuning.interestWeights[interest] <= 50 ? 'Medium' :
                           tuning.interestWeights[interest] <= 75 ? 'High' :
                           'Very High'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={Math.round(tuning.interestWeights[interest] / 25) * 25}
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
                        <span>
                          {tuning.interestWeights[interest] === 0 ? 'Disabled' :
                           tuning.interestWeights[interest] <= 25 ? 'Low' :
                           tuning.interestWeights[interest] <= 50 ? 'Medium' :
                           tuning.interestWeights[interest] <= 75 ? 'High' :
                           'Very High'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={Math.round(tuning.interestWeights[interest] / 25) * 25}
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
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                  Communication Style
                </h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-red-400/70">
                      <span>Formality</span>
                      <span>
                        {tuning.communicationStyle.formality < 21 ? 'Very Casual' :
                         tuning.communicationStyle.formality < 41 ? 'Casual' :
                         tuning.communicationStyle.formality < 61 ? 'Balanced' :
                         tuning.communicationStyle.formality < 81 ? 'Professional' :
                         'Highly Formal'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      step="20"
                      value={tuning.communicationStyle.formality}
                      onChange={(e) => handleStyleAdjustment('formality', parseInt(e.target.value))}
                      className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-red-400/70">
                      <span>Enthusiasm</span>
                      <span>
                        {tuning.communicationStyle.enthusiasm < 21 ? 'Minimal' :
                         tuning.communicationStyle.enthusiasm < 41 ? 'Mild' :
                         tuning.communicationStyle.enthusiasm < 61 ? 'Moderate' :
                         tuning.communicationStyle.enthusiasm < 81 ? 'High' :
                         'Extreme'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      step="20"
                      value={tuning.communicationStyle.enthusiasm}
                      onChange={(e) => handleStyleAdjustment('enthusiasm', parseInt(e.target.value))}
                      className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-red-400/70">
                      <span>Technical Level</span>
                      <span>
                        {tuning.communicationStyle.technicalLevel < 21 ? 'Simple' :
                         tuning.communicationStyle.technicalLevel < 41 ? 'Basic' :
                         tuning.communicationStyle.technicalLevel < 61 ? 'Mixed' :
                         tuning.communicationStyle.technicalLevel < 81 ? 'Detailed' :
                         'Expert'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      step="20"
                      value={tuning.communicationStyle.technicalLevel}
                      onChange={(e) => handleStyleAdjustment('technicalLevel', parseInt(e.target.value))}
                      className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-red-400/70">
                      <span>Emoji Usage</span>
                      <span>
                        {tuning.communicationStyle.emojiUsage < 21 ? 'None' :
                         tuning.communicationStyle.emojiUsage < 41 ? 'Minimal (1)' :
                         tuning.communicationStyle.emojiUsage < 61 ? 'Moderate (1-2)' :
                         tuning.communicationStyle.emojiUsage < 81 ? 'High (2-3)' :
                         'Very High (3+)'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      step="20"
                      value={tuning.communicationStyle.emojiUsage}
                      onChange={(e) => handleStyleAdjustment('emojiUsage', parseInt(e.target.value))}
                      className="w-full accent-red-500/50 bg-red-500/10 rounded h-1"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-red-500/70 italic text-center">
              Run personality analysis to enable fine-tuning
            </div>
          )}
        </div>
      </div>

      {/* Main Chat and Analysis - Right Side */}
      <div className="fixed top-0 right-0 h-screen w-[500px] grid grid-rows-2">
        {/* Chat Interface */}
        <div className="row-span-1 bg-black/40 backdrop-blur-md border-l border-red-500/10 shadow-2xl flex flex-col">
          <div className="border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider">CHAT INTERFACE</h3>
              </div>
              <button
                onClick={onClose}
                className="text-red-500/70 hover:text-red-500/90"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 backdrop-blur-sm bg-black/20">
            {!analysis ? (
              <div className="text-red-500/70 italic text-center">
                Start personality analysis to begin chat interaction
              </div>
            ) : (
              messages.map((msg, i) => (
                <div 
                  key={i}
                  className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[80%] rounded backdrop-blur-sm border border-red-500/10 shadow-lg
                      ${msg.isUser 
                        ? 'bg-red-500/5 text-red-400/90' 
                        : 'bg-black/40 text-red-300/90'
                      } px-4 py-2 text-sm`}
                  >
                    <p className="text-red-500/90">{msg.text}</p>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded px-4 py-2 text-red-400/70 border border-red-500/10">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/20"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-100 shadow-lg shadow-red-500/20"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse delay-200 shadow-lg shadow-red-500/20"></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-red-500/10 p-4 bg-black/40 backdrop-blur-sm">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={analysis ? "Chat with the analyzed personality..." : "Run analysis first..."}
                disabled={!analysis || loading}
                className="flex-1 bg-black/40 text-red-400/90 placeholder-red-500/30 px-4 py-2 rounded border border-red-500/20 focus:border-red-500/40 focus:outline-none focus:ring-1 focus:ring-red-500/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!analysis || loading}
                className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </form>
        </div>

        {/* Personality Analysis */}
        <div className="row-span-1 bg-black/40 backdrop-blur-md border-l border-t border-red-500/10 shadow-2xl flex flex-col">
          <div className="border-b border-red-500/10 p-4 bg-black/40 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                <h3 className="text-sm font-bold text-red-500/90 tracking-wider">PERSONALITY ANALYSIS</h3>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 backdrop-blur-sm bg-black/20">
            {!analysis ? (
              <div className="text-center">
                <p className="text-red-500/70 mb-4">
                  Ready to analyze {tweets.length} tweets for personality insights
                </p>
                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="px-4 py-2 bg-red-500/5 text-red-500/90 border border-red-500/20 rounded hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-300 uppercase tracking-wider text-xs backdrop-blur-sm shadow-lg shadow-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'ANALYZING...' : 'START ANALYSIS'}
                </button>
              </div>
            ) : (
              <div className="space-y-6 text-red-400/90">
                <div>
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    Summary
                  </h4>
                  <ReactMarkdown className="prose prose-red prose-invert">
                    {analysis.summary}
                  </ReactMarkdown>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    Key Traits
                  </h4>
                  <div className="space-y-2">
                    {analysis.traits.map((trait: { name: string; score: number; explanation: string }, i: number) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex justify-between mb-1 text-xs text-red-400/70">
                            <span>{trait.name}</span>
                            <span>{trait.score}/10</span>
                          </div>
                          <div className="h-1 bg-red-500/10 rounded overflow-hidden">
                            <div 
                              className="h-full bg-red-500/50"
                              style={{ width: `${trait.score * 10}%` }}
                            />
                          </div>
                          <ReactMarkdown className="text-sm mt-1 text-red-400/70 prose prose-red prose-invert">
                            {trait.explanation}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    Interests
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {analysis.interests.map((interest: string, i: number) => (
                      <span 
                        key={i}
                        className="px-2 py-1 bg-red-500/5 border border-red-500/20 rounded text-xs backdrop-blur-sm"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    Communication Style
                  </h4>
                  <ReactMarkdown className="prose prose-red prose-invert">
                    {analysis.communicationStyle}
                  </ReactMarkdown>
                </div>
                
                <div>
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    Topics & Themes
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-red-400/70">
                    {analysis.topicsAndThemes.map((topic: string, i: number) => (
                      <li key={i}>{topic}</li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    Emotional Tone
                  </h4>
                  <ReactMarkdown className="prose prose-red prose-invert">
                    {analysis.emotionalTone}
                  </ReactMarkdown>
                </div>
                
                <div>
                  <h4 className="text-sm font-bold text-red-500/90 tracking-wider uppercase flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20"></div>
                    Recommendations
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-red-400/70">
                    {analysis.recommendations.map((rec: string, i: number) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
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