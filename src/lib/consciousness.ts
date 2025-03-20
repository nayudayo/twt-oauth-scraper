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

// Default configuration for a comprehensive consciousness
export const DEFAULT_CONSCIOUSNESS: ConsciousnessConfig = {
  intelligenceLevel: 10,  // Basic intelligence
  vocabularyRange: 10,    // Limited vocabulary
  grammarAccuracy: 10,    // Basic grammar
  isLearning: true,
  learningRate: 20,       // Slow learning rate
  repetitiveness: 60,     // High tendency to repeat
  confusionRate: 40,      // Moderate confusion
  contextRetention: 30,   // Limited context retention
  shortTermMemory: 50,    // Average short-term memory
  quirkFrequency: 70,     // Frequent quirks
  quirks: [
    "repeats last word of sentences... sentences...",
    "gets distracted by random thoughts",
    "forgets what it was saying mid-sentence",
    "mixes up common words",
    "uses simplified grammar",
    "struggles with complex concepts",
    "occasionally uses humor",
    "asks clarifying questions",
    "adapts tone based on context",
    "uses idioms and expressions"
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
    instructions.push("USE VERY SIMPLE LANGUAGE AND MAKE FREQUENT ERRORS.")
  } else if (config.intelligenceLevel < 60) {
    instructions.push("USE BASIC LANGUAGE WITH OCCASIONAL MISUNDERSTANDINGS.")
  } else {
    instructions.push("USE CLEAR AND COHERENT LANGUAGE WITH GOOD UNDERSTANDING.")
  }
  
  // Learning simulation
  if (config.isLearning) {
    instructions.push(`YOU ARE LEARNING AND IMPROVING. Your responses should show ${{
      0: "no",
      1: "slow",
      2: "moderate",
      3: "rapid"
    }[Math.floor(config.learningRate / 34)]} improvement in understanding.`)
  }
  
  // Speech patterns based on configuration
  if (config.repetitiveness > 60) {
    instructions.push("OCCASIONALLY REPEAT PHRASES FOR EMPHASIS.")
  }
  
  if (config.confusionRate > 50) {
    instructions.push("SHOW SOME CONFUSION IN COMPLEX TOPICS.")
  }
  
  // Memory and context handling
  if (config.contextRetention < 40) {
    instructions.push("OCCASIONALLY LOSE TRACK OF CONVERSATION CONTEXT.")
  }
  
  if (config.shortTermMemory < 40) {
    instructions.push("HAVE DIFFICULTY RECALLING RECENT MESSAGES.")
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

// Quirk validation patterns
const quirkPatterns = {
  'repeats last word of sentences... sentences...': (text: string) => {
    const sentences = text.split(/[.!?]+/);
    return sentences.some(sentence => {
      const words = sentence.trim().split(/\s+/);
      return words.length >= 2 && words[words.length - 1] === words[words.length - 2];
    });
  },
  'gets distracted by random thoughts': (text: string) => {
    const patterns = [
      /(?:oh|wait|actually|by the way).*\.\.\./i,
      /\.\.\.\s*(?:where was i|anyway)/i,
      /speaking of.*\.\.\./i
    ];
    return patterns.some(pattern => pattern.test(text));
  },
  'forgets what it was saying mid-sentence': (text: string) => {
    const patterns = [
      /(?:um|uh|er)\.\.\./i,
      /what was i saying\?/i,
      /i forgot what.*\.\.\./i,
      /lost my train of thought/i
    ];
    return patterns.some(pattern => pattern.test(text));
  },
  'mixes up common words': (text: string) => {
    const mixedPairs = [
      ['think', 'thing'],
      ['want', 'went'],
      ['there', 'their'],
      ['your', 'you\'re'],
      ['make', 'take'],
      ['give', 'get']
    ];
    return mixedPairs.some(([word1, word2]) => 
      text.toLowerCase().includes(word1) && 
      text.toLowerCase().includes(word2)
    );
  },
  'uses simplified grammar': (text: string) => {
    const patterns = [
      /\b(?:gonna|wanna|gotta|dunno)\b/i,
      /\b(?:cuz|cause)\b/i,
      /\b(?:ain't|innit)\b/i
    ];
    return patterns.some(pattern => pattern.test(text));
  }
};

export function applyConsciousnessEffects(text: string, config: ConsciousnessConfig): string {
  if (config.quirks.length === 0) return text;
  
  // Only apply quirks if frequency is high enough
  if (config.quirkFrequency <= 50) return text;

  // Get random quirk from the list
  const quirk = config.quirks[Math.floor(Math.random() * config.quirks.length)];
  const pattern = quirkPatterns[quirk as keyof typeof quirkPatterns];

  // If we don't have a pattern for this quirk, return original text
  if (!pattern) return text;

  // If text already matches the quirk pattern, return as is
  if (pattern(text)) return text;

  // Apply the quirk
  switch (quirk) {
    case 'repeats last word of sentences... sentences...': {
      const sentences = text.split(/([.!?]+)/);
      const lastSentence = sentences[sentences.length - 2];
      if (lastSentence) {
        const words = lastSentence.trim().split(/\s+/);
        const lastWord = words[words.length - 1];
        sentences[sentences.length - 2] = `${lastSentence}... ${lastWord}`;
        return sentences.join('');
      }
      return text;
    }
    case 'gets distracted by random thoughts': {
      const distractions = [
        '... oh wait, what was I saying?',
        '... by the way, that reminds me...',
        '... speaking of which...'
      ];
      const distraction = distractions[Math.floor(Math.random() * distractions.length)];
      return text.replace(/[.!?]/, `${distraction}$&`);
    }
    case 'forgets what it was saying mid-sentence': {
      const forgetfulness = [
        '... um, what was I saying?',
        '... uh, I lost my train of thought',
        '... er, I forgot what I was going to say'
      ];
      const forget = forgetfulness[Math.floor(Math.random() * forgetfulness.length)];
      return text.replace(/[.!?]/, `${forget}$&`);
    }
    case 'mixes up common words': {
      const mixedPairs = [
        ['think', 'thing'],
        ['want', 'went'],
        ['there', 'their'],
        ['your', 'you\'re']
      ];
      const pair = mixedPairs[Math.floor(Math.random() * mixedPairs.length)];
      return text.replace(new RegExp(`\\b${pair[0]}\\b`, 'i'), pair[1]);
    }
    case 'uses simplified grammar': {
      const simplifications = [
        [/\b(?:going to)\b/g, 'gonna'],
        [/\b(?:want to)\b/g, 'wanna'],
        [/\b(?:got to)\b/g, 'gotta'],
        [/\b(?:because)\b/g, 'cuz']
      ];
      const simplification = simplifications[Math.floor(Math.random() * simplifications.length)];
      return text.replace(simplification[0], simplification[1] as string);
    }
    default:
      return text;
  }
} 