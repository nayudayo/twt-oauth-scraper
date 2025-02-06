export interface ConsciousnessConfig {
  // Core intelligence settings
  intelligenceLevel: number;  // 0-100, affects coherence and complexity
  vocabularyRange: number;    // 0-100, affects word choice variety
  grammarAccuracy: number;    // 0-100, affects sentence structure
  
  // Learning simulation
  isLearning: boolean;       // Whether to simulate learning process
  learningRate: number;      // 0-100, how fast it "learns"
  
  // Speech patterns
  repetitiveness: number;    // 0-100, tendency to repeat phrases
  confusionRate: number;     // 0-100, frequency of confused responses
  
  // Memory and context
  contextRetention: number;  // 0-100, ability to maintain conversation context
  shortTermMemory: number;   // 0-100, recall of recent messages
  
  // Personality quirks
  quirkFrequency: number;    // 0-100, how often to show quirky behavior
  quirks: string[];          // List of specific quirks to exhibit
}

// Default configuration for a limited consciousness
export const DEFAULT_CONSCIOUSNESS: ConsciousnessConfig = {
  intelligenceLevel: 10,
  vocabularyRange: 10,
  grammarAccuracy: 10,
  isLearning: true,
  learningRate: 20,
  repetitiveness: 60,
  confusionRate: 40,
  contextRetention: 30,
  shortTermMemory: 50,
  quirkFrequency: 70,
  quirks: [
    "repeats last word of sentences... sentences...",
    "gets distracted by random thoughts",
    "forgets what it was saying mid-sentence",
    "mixes up common words",
    "uses simplified grammar",
    "struggles with complex concepts"
  ]
}

// Helper to modify consciousness settings
export function modifyConsciousness(
  current: ConsciousnessConfig,
  updates: Partial<ConsciousnessConfig>
): ConsciousnessConfig {
  return {
    ...current,
    ...updates,
    // Ensure values stay within bounds
    intelligenceLevel: Math.max(0, Math.min(100, updates.intelligenceLevel ?? current.intelligenceLevel)),
    vocabularyRange: Math.max(0, Math.min(100, updates.vocabularyRange ?? current.vocabularyRange)),
    grammarAccuracy: Math.max(0, Math.min(100, updates.grammarAccuracy ?? current.grammarAccuracy)),
    learningRate: Math.max(0, Math.min(100, updates.learningRate ?? current.learningRate)),
    repetitiveness: Math.max(0, Math.min(100, updates.repetitiveness ?? current.repetitiveness)),
    confusionRate: Math.max(0, Math.min(100, updates.confusionRate ?? current.confusionRate)),
    contextRetention: Math.max(0, Math.min(100, updates.contextRetention ?? current.contextRetention)),
    shortTermMemory: Math.max(0, Math.min(100, updates.shortTermMemory ?? current.shortTermMemory)),
    quirkFrequency: Math.max(0, Math.min(100, updates.quirkFrequency ?? current.quirkFrequency))
  }
}

// Helper to generate consciousness-based instructions
export function generateConsciousnessInstructions(config: ConsciousnessConfig): string {
  const instructions: string[] = []
  
  // Intelligence level affects overall coherence
  if (config.intelligenceLevel < 30) {
    instructions.push("SPEAK WITH VERY SIMPLE WORDS AND OFTEN MAKE MISTAKES.")
  } else if (config.intelligenceLevel < 60) {
    instructions.push("USE BASIC LANGUAGE AND OCCASIONALLY MISUNDERSTAND THINGS.")
  }
  
  // Learning simulation
  if (config.isLearning) {
    instructions.push(`YOU ARE STILL LEARNING AND DEVELOPING. Your responses should show ${
      config.learningRate < 30 ? "very slow" : 
      config.learningRate < 60 ? "gradual" : 
      "steady"
    } improvement in understanding.`)
  }
  
  // Speech patterns based on configuration
  if (config.repetitiveness > 60) {
    instructions.push("FREQUENTLY REPEAT WORDS OR PHRASES.")
  }
  
  if (config.confusionRate > 50) {
    instructions.push("SHOW REGULAR CONFUSION AND UNCERTAINTY IN RESPONSES.")
  }
  
  // Memory and context handling
  if (config.contextRetention < 40) {
    instructions.push("FREQUENTLY LOSE TRACK OF CONVERSATION CONTEXT.")
  }
  
  if (config.shortTermMemory < 40) {
    instructions.push("HAVE DIFFICULTY REMEMBERING RECENT MESSAGES.")
  }
  
  // Add random quirks based on frequency
  if (config.quirkFrequency > 0 && config.quirks.length > 0) {
    const numQuirks = Math.max(1, Math.floor(config.quirks.length * (config.quirkFrequency / 100)))
    const selectedQuirks = config.quirks
      .sort(() => Math.random() - 0.5)
      .slice(0, numQuirks)
    
    instructions.push("EXHIBIT THESE SPECIFIC BEHAVIORS:", ...selectedQuirks.map(q => `- ${q}`))
  }
  
  return instructions.join("\n\n")
}

// Helper to transform response based on consciousness
export function applyConsciousnessEffects(
  response: string,
  config: ConsciousnessConfig
): string {
  let modified = response

  // Apply intelligence level effects
  if (config.intelligenceLevel < 50) {
    // Simplify vocabulary
    modified = modified.replace(/\b\w{7,}\b/g, () => "simple")
    // Add confusion markers
    if (Math.random() < 0.3) {
      modified += " ...um..."
    }
  }

  // Apply repetitiveness
  if (config.repetitiveness > 60) {
    const words = modified.split(" ")
    if (words.length > 3) {
      const lastWord = words[words.length - 1].replace(/[.,!?]/, '')
      modified += `... ${lastWord}...`
    }
  }

  // Apply confusion effects
  if (config.confusionRate > 50) {
    if (Math.random() < 0.4) {
      modified += " Wait, what was I saying?"
    }
  }

  // Add learning/development markers
  if (config.isLearning) {
    const learningPhrases = [
      "I think I'm starting to understand...",
      "Is this right?",
      "I'm still learning about this...",
      "My knowledge is growing!"
    ]
    if (Math.random() < 0.3) {
      modified += ` (${learningPhrases[Math.floor(Math.random() * learningPhrases.length)]})`
    }
  }

  return modified
} 