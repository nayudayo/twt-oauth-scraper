import { Tweet } from '../../types/scraper';

// Core interfaces
export interface StyleElements {
  writing: {
    capitalization: 'mostly-lowercase' | 'mostly-uppercase' | 'mixed' | 'standard';
    punctuation: string[];
    lineBreaks: 'frequent' | 'moderate' | 'minimal';
    emojiUsage: {
      frequency: number;
      commonEmojis: string[];
    };
  };
  vocabulary: {
    commonTerms: string[];
    phrases: string[];
    technicalLevel: number;
    enthusiasmMarkers: string[];
    industryTerms: string[];
    nGrams: {
      bigrams: string[];
      trigrams: string[];
    };
  };
  structure: {
    openings: string[];
    closings: string[];
    framing: string[];
    averageLength: number;
  };
  metrics: {
    formality: number;
    enthusiasm: number;
    technicalLevel: number;
    emojiUsage: number;
  };
}

export interface StyleAnalysis {
  elements: StyleElements;
  examples: {
    tweet: string;
    analysis: StyleElements;
  }[];
  summary: string;
}

// Core analysis functions
export function analyzeStyle(tweets: Tweet[]): StyleAnalysis {
  // Filter valid tweets
  const validTweets = tweets.filter((t): t is Tweet & { text: string } => 
    typeof t.text === 'string' && 
    t.text.length > 0 && 
    t.text.length < 280 && 
    !t.text.startsWith('RT ') && 
    !t.text.startsWith('@')
  );

  // Analyze each tweet's style elements
  const tweetAnalyses = validTweets.map(tweet => ({
    tweet: tweet.text,
    analysis: analyzeTweetStyle(tweet.text)
  }));

  // Combine analyses into overall style
  const combinedElements = combineStyleElements(tweetAnalyses.map(t => t.analysis));

  // Select representative examples
  const examples = selectRepresentativeExamples(tweetAnalyses);

  return {
    elements: combinedElements,
    examples,
    summary: generateStyleSummary(combinedElements)
  };
}

function analyzeTweetStyle(text: string): StyleElements {
  return {
    writing: analyzeWritingStyle(text),
    vocabulary: analyzeVocabulary(text),
    structure: analyzeStructure(text),
    metrics: analyzeMetrics(text)
  };
}

function analyzeWritingStyle(text: string): StyleElements['writing'] {
  // Analyze capitalization
  const upperCaseCount = (text.match(/[A-Z]/g) || []).length;
  const lowerCaseCount = (text.match(/[a-z]/g) || []).length;
  const capitalization = 
    upperCaseCount > lowerCaseCount ? 'mostly-uppercase' :
    upperCaseCount < lowerCaseCount ? 'mostly-lowercase' : 'mixed';

  // Analyze punctuation
  const punctuation = Array.from(new Set(text.match(/[.!?…-]+/g) || []));

  // Analyze line breaks
  const lineBreaks = (text.match(/\n/g) || []).length;
  const lineBreakStyle = 
    lineBreaks > 2 ? 'frequent' :
    lineBreaks > 0 ? 'moderate' : 'minimal';

  // Analyze emoji usage
  const emojis = text.match(/[\p{Emoji}]/gu) || [];
  
  return {
    capitalization,
    punctuation,
    lineBreaks: lineBreakStyle,
    emojiUsage: {
      frequency: (emojis.length / text.length) * 100,
      commonEmojis: emojis
    }
  };
}

function analyzeVocabulary(text: string): StyleElements['vocabulary'] {
  const words = text.toLowerCase().split(/\s+/);
  
  // Extract common terms
  const commonTerms = words
    .filter(word => word.length > 3)
    .slice(0, 5);

  // Extract phrases
  const phrases = text.match(/\b\w+\s+\w+\s+\w+\b/g) || [];

  // Extract technical terms
  const technicalTerms = text.match(
    /\b(?:algorithm|framework|implementation|api|function|data|code|system)\b/gi
  ) || [];

  // Extract enthusiasm markers
  const enthusiasmMarkers = text.match(
    /\b(?:wow|omg|lol|amazing|incredible|awesome)\b/gi
  ) || [];

  // Extract n-grams
  const bigrams = words
    .slice(0, -1)
    .map((word, i) => `${word} ${words[i + 1]}`)
    .slice(0, 3);

  const trigrams = words
    .slice(0, -2)
    .map((word, i) => `${word} ${words[i + 1]} ${words[i + 2]}`)
    .slice(0, 2);

  return {
    commonTerms,
    phrases: phrases.slice(0, 3),
    technicalLevel: technicalTerms.length * 20, // 0-100 scale
    enthusiasmMarkers,
    industryTerms: technicalTerms,
    nGrams: { bigrams, trigrams }
  };
}

function analyzeStructure(text: string): StyleElements['structure'] {
  // Analyze openings
  const openings: string[] = [];
  if (/^(?:gm|hey|ok|alright|just|thinking)/i.test(text)) {
    openings.push('Standard opening');
  }

  // Analyze closings
  const closings: string[] = [];
  if (/(?:lfg|stay locked|big love|beautiful|great work)/i.test(text)) {
    closings.push('Standard closing');
  }

  // Analyze framing
  const framing: string[] = [];
  if (text.includes('because') || text.includes('therefore')) {
    framing.push('Logical framing');
  } else if (text.includes('I think') || text.includes('In my opinion')) {
    framing.push('Opinion framing');
  }

  return {
    openings,
    closings,
    framing,
    averageLength: text.split(/\s+/).length
  };
}

function analyzeMetrics(text: string): StyleElements['metrics'] {
  // Analyze formality
  const hasSlang = /(?:gonna|wanna|gotta|idk|tbh|imo)/i.test(text);
  const formality = hasSlang ? 30 : 70;

  // Analyze enthusiasm
  const exclamations = (text.match(/!/g) || []).length;
  const enthusiasm = Math.min(exclamations * 20, 100);

  // Analyze technical level
  const technicalTerms = text.match(
    /\b(?:algorithm|framework|implementation|api|function|data|code|system)\b/gi
  ) || [];
  const technicalLevel = Math.min(technicalTerms.length * 20, 100);

  // Analyze emoji usage
  const emojis = text.match(/[\p{Emoji}]/gu) || [];
  const emojiUsage = Math.min((emojis.length / text.length) * 1000, 100);

  return {
    formality,
    enthusiasm,
    technicalLevel,
    emojiUsage
  };
}

function combineStyleElements(analyses: StyleElements[]): StyleElements {
  // Combine all analyses into a single style profile
  const combined: StyleElements = {
    writing: {
      capitalization: 'mixed',
      punctuation: [],
      lineBreaks: 'minimal',
      emojiUsage: {
        frequency: 0,
        commonEmojis: []
      }
    },
    vocabulary: {
      commonTerms: [],
      phrases: [],
      technicalLevel: 0,
      enthusiasmMarkers: [],
      industryTerms: [],
      nGrams: {
        bigrams: [],
        trigrams: []
      }
    },
    structure: {
      openings: [],
      closings: [],
      framing: [],
      averageLength: 0
    },
    metrics: {
      formality: 50,
      enthusiasm: 50,
      technicalLevel: 50,
      emojiUsage: 50
    }
  };

  if (analyses.length === 0) return combined;

  // Combine writing styles
  const capitalizationCounts = analyses.reduce((acc, curr) => {
    acc[curr.writing.capitalization] = (acc[curr.writing.capitalization] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  combined.writing.capitalization = Object.entries(capitalizationCounts)
    .sort((a, b) => b[1] - a[1])[0][0] as StyleElements['writing']['capitalization'];

  combined.writing.punctuation = Array.from(new Set(
    analyses.flatMap(a => a.writing.punctuation)
  ));

  const lineBreakCounts = analyses.reduce((acc, curr) => {
    acc[curr.writing.lineBreaks] = (acc[curr.writing.lineBreaks] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  combined.writing.lineBreaks = Object.entries(lineBreakCounts)
    .sort((a, b) => b[1] - a[1])[0][0] as StyleElements['writing']['lineBreaks'];

  combined.writing.emojiUsage = {
    frequency: analyses.reduce((sum, curr) => sum + curr.writing.emojiUsage.frequency, 0) / analyses.length,
    commonEmojis: Array.from(new Set(analyses.flatMap(a => a.writing.emojiUsage.commonEmojis)))
  };

  // Combine vocabulary
  combined.vocabulary = {
    commonTerms: Array.from(new Set(analyses.flatMap(a => a.vocabulary.commonTerms))),
    phrases: Array.from(new Set(analyses.flatMap(a => a.vocabulary.phrases))),
    technicalLevel: analyses.reduce((sum, curr) => sum + curr.vocabulary.technicalLevel, 0) / analyses.length,
    enthusiasmMarkers: Array.from(new Set(analyses.flatMap(a => a.vocabulary.enthusiasmMarkers))),
    industryTerms: Array.from(new Set(analyses.flatMap(a => a.vocabulary.industryTerms))),
    nGrams: {
      bigrams: Array.from(new Set(analyses.flatMap(a => a.vocabulary.nGrams.bigrams))),
      trigrams: Array.from(new Set(analyses.flatMap(a => a.vocabulary.nGrams.trigrams)))
    }
  };

  // Combine structure
  combined.structure = {
    openings: Array.from(new Set(analyses.flatMap(a => a.structure.openings))),
    closings: Array.from(new Set(analyses.flatMap(a => a.structure.closings))),
    framing: Array.from(new Set(analyses.flatMap(a => a.structure.framing))),
    averageLength: analyses.reduce((sum, curr) => sum + curr.structure.averageLength, 0) / analyses.length
  };

  // Combine metrics
  combined.metrics = {
    formality: analyses.reduce((sum, curr) => sum + curr.metrics.formality, 0) / analyses.length,
    enthusiasm: analyses.reduce((sum, curr) => sum + curr.metrics.enthusiasm, 0) / analyses.length,
    technicalLevel: analyses.reduce((sum, curr) => sum + curr.metrics.technicalLevel, 0) / analyses.length,
    emojiUsage: analyses.reduce((sum, curr) => sum + curr.metrics.emojiUsage, 0) / analyses.length
  };

  return combined;
}

function selectRepresentativeExamples(
  analyses: Array<{ tweet: string; analysis: StyleElements }>
): StyleAnalysis['examples'] {
  // Score each tweet based on how well it represents the overall style
  const scoredTweets = analyses.map(({ tweet, analysis }) => {
    let score = 0;

    // Score based on metrics being close to averages
    const avgMetrics = analyses.reduce(
      (acc, curr) => ({
        formality: acc.formality + curr.analysis.metrics.formality,
        enthusiasm: acc.enthusiasm + curr.analysis.metrics.enthusiasm,
        technicalLevel: acc.technicalLevel + curr.analysis.metrics.technicalLevel,
        emojiUsage: acc.emojiUsage + curr.analysis.metrics.emojiUsage
      }),
      { formality: 0, enthusiasm: 0, technicalLevel: 0, emojiUsage: 0 }
    );

    Object.keys(avgMetrics).forEach(key => {
      avgMetrics[key as keyof typeof avgMetrics] /= analyses.length;
      const diff = Math.abs(analysis.metrics[key as keyof typeof analysis.metrics] - 
                          avgMetrics[key as keyof typeof avgMetrics]);
      score += (100 - diff) / 25; // 0-4 points per metric
    });

    // Score based on vocabulary richness
    score += analysis.vocabulary.commonTerms.length * 0.5;
    score += analysis.vocabulary.phrases.length;
    score += analysis.vocabulary.enthusiasmMarkers.length * 0.5;

    // Score based on structure completeness
    if (analysis.structure.openings.length > 0) score += 2;
    if (analysis.structure.closings.length > 0) score += 2;
    if (analysis.structure.framing.length > 0) score += 2;

    return { tweet, analysis, score };
  });

  // Return top 3 most representative tweets
  return scoredTweets
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ tweet, analysis }) => ({ tweet, analysis }));
}

function generateStyleSummary(style: StyleElements): string {
  const parts: string[] = [];

  // Summarize writing style
  parts.push(`Writing style is predominantly ${style.writing.capitalization} with ${style.writing.lineBreaks} line breaks.`);
  
  if (style.writing.emojiUsage.frequency > 0) {
    parts.push(`Uses emojis ${style.writing.emojiUsage.frequency > 50 ? 'frequently' : 'occasionally'}.`);
  }

  // Summarize metrics
  parts.push(
    `Communication is ${style.metrics.formality > 70 ? 'highly formal' : 
                       style.metrics.formality > 50 ? 'moderately formal' : 
                       style.metrics.formality > 30 ? 'casual' : 'very casual'} ` +
    `with ${style.metrics.enthusiasm > 70 ? 'high' :
           style.metrics.enthusiasm > 50 ? 'moderate' :
           style.metrics.enthusiasm > 30 ? 'low' : 'minimal'} enthusiasm.`
  );

  // Summarize vocabulary
  if (style.vocabulary.technicalLevel > 70) {
    parts.push('Uses sophisticated technical language.');
  } else if (style.vocabulary.technicalLevel > 50) {
    parts.push('Balances technical and general language.');
  } else {
    parts.push('Favors accessible, non-technical language.');
  }

  return parts.join(' ');
} 