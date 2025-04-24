import { PersonalityAnalysis } from '../types';
import { formatTraitText } from './formatting';
import { CommunicationLevel } from '../types';

const defaultSocialBehaviorMetrics: PersonalityAnalysis['socialBehaviorMetrics'] = {
  oversharer: 0,
  replyGuy: 0,
  viralChaser: 0,
  threadMaker: 0,
  retweeter: 0,
  hotTaker: 0,
  joker: 0,
  debater: 0,
  doomPoster: 0,
  earlyAdopter: 0,
  knowledgeDropper: 0,
  hypeBeast: 0
};

export function parseSocialBehaviorMetrics(text: string): Pick<PersonalityAnalysis, 'socialBehaviorMetrics'> {
  try {
    // Find the Social Behavior Metrics section - now includes "Content Sharing Patterns"
    const sections = text.split(/(?:###|####)\s*/);
    const metricsSection = sections.find(section => 
      section.includes('Content Sharing Patterns') ||
      section.includes('Social Behavior Metrics') || 
      section.includes('Varied Social Behavior Metrics')
    );

    if (!metricsSection) {
      return {
        socialBehaviorMetrics: defaultSocialBehaviorMetrics
      };
    }

    // Start with the default metrics
    const metrics: PersonalityAnalysis['socialBehaviorMetrics'] = {
      ...defaultSocialBehaviorMetrics
    };

    function mapMetricNameToKey(name: string, score: number) {
      const normalizedName = name.toLowerCase().replace(/[-\s]/g, '');
      
      // Map the normalized name to our metric keys
      switch (normalizedName) {
        case 'oversharer': metrics.oversharer = score; break;
        case 'replyguy': 
        case 'reply': metrics.replyGuy = score; break;
        case 'viralchaser': 
        case 'viral': metrics.viralChaser = score; break;
        case 'threadmaker': 
        case 'thread': metrics.threadMaker = score; break;
        case 'retweeter': 
        case 'retweet': metrics.retweeter = score; break;
        case 'hottakes': 
        case 'hottaker':
        case 'hot': metrics.hotTaker = score; break;
        case 'joker': 
        case 'joke': metrics.joker = score; break;
        case 'debater': 
        case 'debate': metrics.debater = score; break;
        case 'doomposter':
        case 'doom': metrics.doomPoster = score; break;
        case 'earlyadopter':
        case 'early': metrics.earlyAdopter = score; break;
        case 'knowledgedropper':
        case 'knowledge': metrics.knowledgeDropper = score; break;
        case 'hypebeast':
        case 'hype': metrics.hypeBeast = score; break;
      }
    }

    // First try new format: [Metric Name]: Score [0-100] - [Brief explanation]
    const newFormatPattern = /-\s*([^:]+):\s*Score\s*(\d+)\s*-\s*([^\n]+)/g;
    let match;
    let foundNewFormat = false;

    while ((match = newFormatPattern.exec(metricsSection)) !== null) {
      const [, name, score] = match;
      const scoreNum = parseInt(score, 10);
      if (!isNaN(scoreNum)) {
        mapMetricNameToKey(name, scoreNum);
        foundNewFormat = true;
      }
    }

    // If new format not found, try old formats
    if (!foundNewFormat) {
      const lines = metricsSection.split('\n');
      let currentMetric = '';
      let foundAnyMetrics = false;

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (!trimmedLine || trimmedLine.toLowerCase().includes('patterns:')) {
          continue;
        }

        // Check for lettered metric headers (e.g., "a) Oversharer:")
        const metricHeaderMatch = trimmedLine.match(/^[a-z]\)\s*([^:]+):/i);
        if (metricHeaderMatch) {
          currentMetric = metricHeaderMatch[1].trim();
          continue;
        }

        // Look for score in current metric section
        if (currentMetric) {
          const scoreMatch = trimmedLine.match(/score:\s*(\d+)/i);
          if (scoreMatch) {
            const score = parseInt(scoreMatch[1], 10);
            if (!isNaN(score)) {
              mapMetricNameToKey(currentMetric, score);
              foundAnyMetrics = true;
            }
          }
        }

        // Also try the older formats as fallback
        const patterns = [
          /(?:oversharer|reply guy|viral chaser|thread maker|retweeter|hot taker|joker|debater|doom poster|early adopter|knowledge dropper|hype beast)\s*(?:score)?:\s*(\d+)(?:\s*\/\s*100)?/i,
          /[•\-*]\s*(?:.*?)(?:score)?:\s*(\d+)(?:\s*\/\s*100)?/i,
          /(\w+(?:\s+\w+)*)\s*(?:score)?:\s*(\d+)(?:\s*\/\s*100)?/i
        ];

        for (const pattern of patterns) {
          const match = trimmedLine.match(pattern);
          if (match) {
            const [fullMatch, nameOrScore, scoreForSecondPattern] = match;
            
            if (!scoreForSecondPattern) {
              const score = parseInt(nameOrScore, 10);
              if (!isNaN(score)) {
                const name = fullMatch.split(/\s*(?:score)?:/i)[0];
                mapMetricNameToKey(name, score);
                foundAnyMetrics = true;
              }
            } else {
              const score = parseInt(scoreForSecondPattern, 10);
              if (!isNaN(score)) {
                mapMetricNameToKey(nameOrScore, score);
                foundAnyMetrics = true;
              }
            }
            break;
          }
        }
      }

      if (!foundAnyMetrics) {
        return {
          socialBehaviorMetrics: defaultSocialBehaviorMetrics
        };
      }
    }

    return {
      socialBehaviorMetrics: metrics
    };

  } catch (error) {
    console.error('[Parsing Error] Error parsing social behavior metrics:', error);
    return {
      socialBehaviorMetrics: defaultSocialBehaviorMetrics
    };
  }
}

export function parseAnalysisResponse(text: string): PersonalityAnalysis {
  console.log('Parsing analysis response...');
  
  // Extract summary (first non-empty paragraph after "Summary:")
  const summaryMatch = text.match(/Summary:[\s\n]*([^\n]+)/);
  const summary = summaryMatch ? summaryMatch[1].trim() : 'Analysis summary not available';
  
  // Extract and parse traits
  const traitsSection = text.match(/Core Personality Traits:([^#]+)/);
  const traits = traitsSection ? parseTraits(traitsSection[1]) : [];
  console.log('Parsed traits:', traits);

  // Extract interests (look in both Interests and Topics/Themes sections)
  const interestsSection = text.match(/Interests:([^-#]+)/);
  const topicsSection = text.match(/Topics\/Themes:([^-#]+)/);
  
  let interests: string[] = [];
  if (interestsSection) {
    const interestMatches = interestsSection[1].match(/[•\-]\s*([^•\n]+)/g);
    if (interestMatches) {
      interests = interestMatches.map(i => 
        i.replace(/[•\-]\s*/, '')
         .replace(/:.+$/, '')
         .trim()
      );
    }
  }
  
  // Add topics if found
  if (topicsSection) {
    const topicMatches = topicsSection[1].match(/[•\-]\s*([^•\n]+)/g);
    if (topicMatches) {
      const topics = topicMatches.map(t => 
        t.replace(/[•\-]\s*/, '')
         .replace(/:.+$/, '')
         .trim()
      );
      interests = [...new Set([...interests, ...topics])];
    }
  }

  // Create the analysis object
  const analysis: PersonalityAnalysis = {
    summary,
    traits,
    interests,
    topicsAndThemes: interests.length > 0 ? interests : ['General themes'],
    socialBehaviorMetrics: parseSocialBehaviorMetrics(text).socialBehaviorMetrics,
    communicationStyle: {
      formality: 'medium',
      enthusiasm: 'medium',
      technicalLevel: 'medium',
      emojiUsage: 'medium',
      verbosity: 'medium',
      description: text.match(/Communication Style Patterns([\s\S]*?)(?=###|$)/)?.[1]?.trim() || 'Communication style analysis not available',
      patterns: {
        capitalization: 'mixed',
        punctuation: [],
        lineBreaks: 'minimal',
        messageStructure: {
          opening: [],
          framing: [],
          closing: []
        }
      },
      contextualVariations: {
        business: 'Standard professional communication',
        casual: 'Relaxed and approachable',
        technical: 'Clear and precise',
        crisis: 'Direct and solution-focused'
      }
    },
    vocabulary: {
      commonTerms: [
        { term: 'general', frequency: 0, percentage: 0 },
        { term: 'standard', frequency: 0, percentage: 0 },
        { term: 'typical', frequency: 0, percentage: 0 }
      ],
      commonPhrases: [],
      enthusiasmMarkers: ['good', 'great', 'nice'],
      industryTerms: [],
      nGrams: {
        bigrams: [],
        trigrams: []
      },
      metrics: {
        sentenceLengths: {
          veryShort: 0,
          short: 0,
          medium: 0,
          long: 0,
          veryLong: 0,
          distribution: {
            veryShort: 0,
            short: 0,
            medium: 0,
            long: 0,
            veryLong: 0
          }
        },
        capitalizationStats: {
          lowercase: 0,
          sentenceCase: 0,
          mixedCase: 0,
          totalMessages: 0
        },
        averageMessageLength: 0,
        uniqueWordsCount: 0,
        totalWordsAnalyzed: 0,
        messageArchitecture: {
          structureTypes: {
            singleWord: 0,
            shortPhrase: 0,
            actionOriented: 0,
            bulletedList: 0,
            streamOfConsciousness: 0
          },
          terminalPunctuation: {
            none: 0,
            period: 0,
            questionMark: 0,
            exclamationMark: 0,
            ellipsis: 0
          },
          characterMetrics: {
            averageLength: 0,
            shortMessages: 0,
            longMessages: 0
          },
          preferences: {
            usesMarkdown: false,
            usesBulletPoints: false,
            usesNumberedLists: false,
            usesCodeBlocks: false,
            preferredListStyle: 'none'
          }
        }
      }
    },
    emotionalIntelligence: {
      leadershipStyle: text.match(/Leadership Style:([\s\S]*?)(?=\n|$)/)?.[1]?.trim() || 'Standard',
      challengeResponse: text.match(/Challenge Response:([\s\S]*?)(?=\n|$)/)?.[1]?.trim() || 'Balanced',
      analyticalTone: text.match(/Analytical Tone:([\s\S]*?)(?=\n|$)/)?.[1]?.trim() || 'Neutral',
      supportivePatterns: []
    },
    emotionalTone: text.match(/Rich Emotional Tone Description([\s\S]*?)(?=###|$)/)?.[1]?.trim() || 'Neutral emotional expression',
    thoughtProcess: {
      initialApproach: '',
      processingStyle: '',
      expressionStyle: ''
    }
  };

  return analysis;
}

// Parse basic info chunk (summary and traits)
export function parseBasicInfoChunk(response: string): Partial<PersonalityAnalysis> {
  const result: Partial<PersonalityAnalysis> = {
    summary: '',
    traits: []
  };

  const sections = response.split('\n\n');
  let foundTraits = false;

  for (const section of sections) {
    if (section.toLowerCase().includes('summary')) {
      result.summary = section.split('\n').slice(1).join(' ').trim();
    }
    else if (section.toLowerCase().includes('personality trait') || section.toLowerCase().includes('core trait')) {
      const traitLines = section.split('\n').slice(1);
      
      for (const line of traitLines) {
        if (!line.trim()) continue;
        
        const traitPatterns = [
          /\d+\.\s+\*\*([^*]+)\*\*\s*\[(\d+)\/10\]\s*-\s*(.+)/, // 1. **Trait** [8/10] - Explanation
          /\*\*([^*]+)\*\*\s*\[(\d+)\/10\]\s*-\s*(.+)/, // **Trait** [8/10] - Explanation
          /([^:]+):\s*(\d+)\/10\s*[-:]\s*(.+)/, // Trait: 8/10 - Explanation
          /([^(]+)\((\d+)\/10\)[:\s-]*(.+)/, // Trait (8/10): Explanation
          /([^-]+)-\s*(\d+)\/10\s*[-:]\s*(.+)/ // Trait - 8/10 - Explanation
        ];

        let matched = false;
        for (const pattern of traitPatterns) {
          const match = line.match(pattern);
          if (match) {
            const [, name, score, explanation] = match;
            const isEnabled = parseInt(score) >= 7;
            
            result.traits!.push({
              name: formatTraitText(name),
              score: isEnabled ? 1 : 0,
              explanation: formatTraitText(explanation)
            });
            matched = true;
            foundTraits = true;
            break;
          }
        }

        if (!matched) {
          // Try to extract trait information from unstructured text
          const words = line.split(' ');
          for (let i = 0; i < words.length; i++) {
            if (words[i].includes('/10')) {
              const score = parseInt(words[i]);
              if (score >= 0 && score <= 10) {
                const name = words.slice(0, i).join(' ').replace(/[*:-]/g, '').trim();
                const explanation = words.slice(i + 1).join(' ').replace(/^[-:]\s*/, '').trim();
                if (name && explanation) {
                  const isEnabled = score >= 7;
                  result.traits!.push({ 
                    name, 
                    score: isEnabled ? 1 : 0,
                    explanation 
                  });
                  foundTraits = true;
                }
              }
            }
          }
        }
      }
    }
  }

  // Set defaults if needed
  if (!result.summary) {
    result.summary = 'Analysis summary not available';
  }
  if (!foundTraits || result.traits!.length === 0) {
    result.traits = [{
      name: 'Neutral',
      score: 5,
      explanation: 'Default trait due to incomplete analysis'
    }];
  }

  return result;
}

// Parse interests chunk
export function parseInterestsChunk(response: string): Partial<PersonalityAnalysis> {
  const result: Partial<PersonalityAnalysis> = {
    interests: [],
    topicsAndThemes: []
  };

  // First try to match the new format with just interest areas
  const interestPattern = /[-•*]\s*([^:\n]+)(?:\n|$)/g;
  let match;
  while ((match = interestPattern.exec(response)) !== null) {
    const interest = match[1].trim();
    if (interest && !interest.toLowerCase().includes('expertise level') && !interest.toLowerCase().includes('evidence')) {
      result.interests?.push(interest);
    }
  }

  // If no interests found, try the old format
  if (!result.interests?.length) {
    const sections = response.split('\n\n');
    for (const section of sections) {
      if (section.toLowerCase().includes('primary interests') || 
          section.toLowerCase().includes('interests & expertise')) {
        const lines = section.split('\n');
        let currentInterest = '';
        let currentEvidence = '';
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          
          if (!trimmedLine || 
              trimmedLine.toLowerCase().includes('primary interests') ||
              trimmedLine.toLowerCase().includes('interests & expertise')) {
            continue;
          }
          
          // Try to match interest with expertise and evidence
          const interestMatch = trimmedLine.match(/^[-•*]\s*([^:]+)(?::\s*(.+))?$/);
          if (interestMatch) {
            if (currentInterest) {
              result.interests?.push(currentInterest);
            }
            currentInterest = interestMatch[1].trim();
          } else if (trimmedLine.toLowerCase().startsWith('evidence:')) {
            currentEvidence = trimmedLine.split(':')[1]?.trim() || '';
          } else if (!trimmedLine.match(/^[-•*]/) && currentInterest) {
            // Additional evidence or description
            currentEvidence = (currentEvidence ? currentEvidence + '; ' : '') + trimmedLine;
          }
        }
        
        // Add the last interest
        if (currentInterest) {
          result.interests?.push(currentInterest);
        }
      }
    }
  }

  // Filter out any remaining noise and duplicates
  if (result.interests) {
    result.interests = [...new Set(result.interests)]
      .filter(interest => 
        interest.length > 0 &&
        !interest.toLowerCase().includes('expertise level') && 
        !interest.toLowerCase().includes('evidence'));

    if (result.interests.length === 0) {
      result.interests = ['General topics'];
    }
  }

  return result;
}

// Parse communication chunk
export function parseCommunicationChunk(response: string): Partial<PersonalityAnalysis> {
  type MessageStructureType = 'opening' | 'framing' | 'closing';
  type SubsectionType = 'metrics' | 'patterns' | 'structure' | 'variations' | MessageStructureType;
  
  const result: Partial<PersonalityAnalysis> = {
    communicationStyle: {
      formality: 'medium',
      enthusiasm: 'medium',
      technicalLevel: 'medium',
      emojiUsage: 'medium',
      verbosity: 'medium',
      description: '',
      patterns: {
        capitalization: 'mixed',
        punctuation: [],
        lineBreaks: 'minimal',
        messageStructure: {
          opening: [],
          framing: [],
          closing: []
        }
      },
      contextualVariations: {
        business: '',
        casual: '',
        technical: '',
        crisis: ''
      }
    }
  };

  const sections = response.split('\n\n');
  
  for (const section of sections) {
    if (section.includes('Communication Style Analysis') || section.includes('Communication Style')) {
      const styleLines = section.split('\n').slice(1);
      const descriptionParts = [];
      let currentSubsection: SubsectionType = 'metrics';
      let currentStructure: MessageStructureType | null = null;
      
      for (const line of styleLines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Parse core metrics section
        if (trimmedLine.toLowerCase().includes('core metrics')) {
          currentSubsection = 'metrics';
          currentStructure = null;
          continue;
        }
        // Parse writing patterns section
        else if (trimmedLine.toLowerCase().includes('writing patterns')) {
          currentSubsection = 'patterns';
          currentStructure = null;
          continue;
        }
        // Parse message structure section
        else if (trimmedLine.toLowerCase().includes('message structure')) {
          currentSubsection = 'structure';
          currentStructure = null;
          continue;
        }
        // Parse contextual variations section
        else if (trimmedLine.toLowerCase().includes('contextual variations')) {
          currentSubsection = 'variations';
          currentStructure = null;
          continue;
        }
        // Parse message structure subsections
        else if (trimmedLine.toLowerCase().includes('opening patterns:')) {
          currentSubsection = 'structure';
          currentStructure = 'opening';
          continue;
        }
        else if (trimmedLine.toLowerCase().includes('framing patterns:')) {
          currentSubsection = 'structure';
          currentStructure = 'framing';
          continue;
        }
        else if (trimmedLine.toLowerCase().includes('closing patterns:')) {
          currentSubsection = 'structure';
          currentStructure = 'closing';
          continue;
        }

        // Handle each section's content
        switch (currentSubsection) {
          case 'metrics': {
            const metricMatch = trimmedLine.match(/^-\s*([^:]+):\s*(\d+)\s*-\s*(.+)$/);
            if (metricMatch) {
              const [, metric, score, explanation] = metricMatch;
              const value = parseInt(score);
              const level: CommunicationLevel = value >= 70 ? 'high' : value <= 30 ? 'low' : 'medium';
              
              switch (metric.toLowerCase().trim()) {
                case 'formality':
                  result.communicationStyle!.formality = level;
                  descriptionParts.push(`Formality level: ${level} - ${explanation}`);
                  break;
                case 'enthusiasm':
                  result.communicationStyle!.enthusiasm = level;
                  descriptionParts.push(`Enthusiasm level: ${level} - ${explanation}`);
                  break;
                case 'technical level':
                  result.communicationStyle!.technicalLevel = level;
                  descriptionParts.push(`Technical level: ${level} - ${explanation}`);
                  break;
                case 'emoji usage':
                  result.communicationStyle!.emojiUsage = level;
                  descriptionParts.push(`Emoji usage: ${level} - ${explanation}`);
                  break;
              }
            }
            break;
          }
          case 'patterns':
            // Parse writing patterns
            if (trimmedLine.startsWith('-')) {
              const [pattern, value] = trimmedLine.substring(1).split(':').map(s => s.trim());
              
              switch (pattern.toLowerCase()) {
                case 'capitalization':
                  if (value.includes('lowercase')) result.communicationStyle!.patterns.capitalization = 'mostly-lowercase';
                  else if (value.includes('uppercase')) result.communicationStyle!.patterns.capitalization = 'mostly-uppercase';
                  else if (value.includes('mixed')) result.communicationStyle!.patterns.capitalization = 'mixed';
                  else result.communicationStyle!.patterns.capitalization = 'standard';
                  break;
                case 'punctuation':
                  const punctMatches = value.match(/[.!?…\-]+/g);
                  if (punctMatches) {
                    result.communicationStyle!.patterns.punctuation = Array.from(new Set(punctMatches));
                  }
                  break;
                case 'line breaks':
                  if (value.includes('frequent')) result.communicationStyle!.patterns.lineBreaks = 'frequent';
                  else if (value.includes('moderate')) result.communicationStyle!.patterns.lineBreaks = 'moderate';
                  else result.communicationStyle!.patterns.lineBreaks = 'minimal';
                  break;
              }
            }
            break;
          case 'structure':
            // Parse message structure patterns
            if (trimmedLine.startsWith('-') && currentStructure) {
              const pattern = trimmedLine.substring(1).trim();
              switch (currentStructure) {
                case 'opening':
                  result.communicationStyle!.patterns.messageStructure.opening.push(pattern);
                  break;
                case 'framing':
                  result.communicationStyle!.patterns.messageStructure.framing.push(pattern);
                  break;
                case 'closing':
                  result.communicationStyle!.patterns.messageStructure.closing.push(pattern);
                  break;
              }
            }
            break;
          case 'variations':
            // Parse contextual variations
            if (trimmedLine.startsWith('-')) {
              const [context, description] = trimmedLine.substring(1).split(':').map(s => s.trim());
              switch (context.toLowerCase()) {
                case 'business':
                  result.communicationStyle!.contextualVariations.business = description;
                  break;
                case 'casual':
                  result.communicationStyle!.contextualVariations.casual = description;
                  break;
                case 'technical':
                  result.communicationStyle!.contextualVariations.technical = description;
                  break;
                case 'crisis':
                  result.communicationStyle!.contextualVariations.crisis = description;
                  break;
              }
            }
            break;
        }
      }
      
      // Combine description parts
      if (descriptionParts.length > 0) {
        result.communicationStyle!.description = descriptionParts.join('. ');
      }
    }
  }

  // Set defaults if needed
  const style = result.communicationStyle!;
  if (!style.patterns.messageStructure.opening.length) {
    style.patterns.messageStructure.opening = ['Standard greeting'];
  }
  if (!style.patterns.messageStructure.closing.length) {
    style.patterns.messageStructure.closing = ['Standard closing'];
  }
  if (!style.contextualVariations.business) {
    style.contextualVariations.business = 'Standard professional communication';
  }
  if (!style.contextualVariations.casual) {
    style.contextualVariations.casual = 'Relaxed and approachable';
  }
  if (!style.contextualVariations.technical) {
    style.contextualVariations.technical = 'Clear and precise';
  }
  if (!style.contextualVariations.crisis) {
    style.contextualVariations.crisis = 'Direct and solution-focused';
  }
  if (!style.description) {
    style.description = 'Communication style analysis not available';
  }

  return result;
}

// Parse vocabulary chunk
export function parseVocabularyChunk(response: string): Partial<PersonalityAnalysis> {
  const result: Partial<PersonalityAnalysis> = {
    vocabulary: {
      commonTerms: [],
      commonPhrases: [],
      enthusiasmMarkers: [],
      industryTerms: [],
      nGrams: {
        bigrams: [],
        trigrams: []
      },
      metrics: {
        sentenceLengths: {
          veryShort: 0,
          short: 0,
          medium: 0,
          long: 0,
          veryLong: 0,
          distribution: {
            veryShort: 0,
            short: 0,
            medium: 0,
            long: 0,
            veryLong: 0
          }
        },
        capitalizationStats: {
          lowercase: 0,
          sentenceCase: 0,
          mixedCase: 0,
          totalMessages: 0
        },
        averageMessageLength: 0,
        uniqueWordsCount: 0,
        totalWordsAnalyzed: 0,
        messageArchitecture: {
          structureTypes: {
            singleWord: 0,
            shortPhrase: 0,
            actionOriented: 0,
            bulletedList: 0,
            streamOfConsciousness: 0
          },
          terminalPunctuation: {
            none: 0,
            period: 0,
            questionMark: 0,
            exclamationMark: 0,
            ellipsis: 0
          },
          characterMetrics: {
            averageLength: 0,
            shortMessages: 0,
            longMessages: 0
          },
          preferences: {
            usesMarkdown: false,
            usesBulletPoints: false,
            usesNumberedLists: false,
            usesCodeBlocks: false,
            preferredListStyle: 'none'
          }
        }
      }
    }
  };

  const sections = response.split('\n\n');
  
  for (const section of sections) {
    if (section.toLowerCase().includes('vocabulary') || section.toLowerCase().includes('language patterns')) {
      const lines = section.split('\n');
      let currentSection = '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Detect sections
        if (trimmedLine.toLowerCase().includes('common terms:')) {
          currentSection = 'terms';
          continue;
        }
        else if (trimmedLine.toLowerCase().includes('common phrases:')) {
          currentSection = 'phrases';
          continue;
        }
        else if (trimmedLine.toLowerCase().includes('enthusiasm markers:')) {
          currentSection = 'enthusiasm';
          continue;
        }
        else if (trimmedLine.toLowerCase().includes('industry terms:')) {
          currentSection = 'industry';
          continue;
        }
        else if (trimmedLine.toLowerCase().includes('sentence length distribution:')) {
          currentSection = 'sentence-length';
          continue;
        }
        else if (trimmedLine.toLowerCase().includes('message architecture:')) {
          currentSection = 'architecture';
          continue;
        }
        else if (trimmedLine.toLowerCase().includes('capitalization stats:')) {
          currentSection = 'capitalization';
          continue;
        }
        else if (trimmedLine.toLowerCase().includes('terminal punctuation:')) {
          currentSection = 'punctuation';
          continue;
        }
        else if (trimmedLine.toLowerCase().includes('character metrics:')) {
          currentSection = 'character-metrics';
          continue;
        }
        else if (trimmedLine.toLowerCase().includes('formatting preferences:')) {
          currentSection = 'preferences';
          continue;
        }

        // Parse section content
        if (trimmedLine.startsWith('-')) {
          const content = trimmedLine.substring(1).trim();
          
          switch (currentSection) {
            case 'terms':
              const termMatch = content.match(/([^(]+)(?:\((\d+)(?:,\s*(\d+)%\))?)?/);
              if (termMatch) {
                const [, term, frequency, percentage] = termMatch;
                result.vocabulary!.commonTerms.push({
                  term: term.trim(),
                  frequency: parseInt(frequency || '0'),
                  percentage: parseInt(percentage || '0')
                });
              }
              break;

            case 'phrases':
              const phraseMatch = content.match(/([^(]+)(?:\((\d+)(?:,\s*(\d+)%\))?)?/);
              if (phraseMatch) {
                const [, phrase, frequency, percentage] = phraseMatch;
                result.vocabulary!.commonPhrases.push({
                  phrase: phrase.trim(),
                  frequency: parseInt(frequency || '0'),
                  percentage: parseInt(percentage || '0')
                });
              }
              break;

            case 'enthusiasm':
              result.vocabulary!.enthusiasmMarkers.push(content);
              break;

            case 'industry':
              result.vocabulary!.industryTerms.push(content);
              break;

            case 'sentence-length':
              const lengthMatch = content.match(/([^:]+):\s*(\d+)%/);
              if (lengthMatch) {
                const [, type, percentage] = lengthMatch;
                const distribution = result.vocabulary!.metrics.sentenceLengths.distribution;
                switch (type.toLowerCase().trim()) {
                  case 'very short (1-5 words)':
                    distribution.veryShort = parseInt(percentage);
                    break;
                  case 'short (6-10 words)':
                    distribution.short = parseInt(percentage);
                    break;
                  case 'medium (11-20 words)':
                    distribution.medium = parseInt(percentage);
                    break;
                  case 'long (21-40 words)':
                    distribution.long = parseInt(percentage);
                    break;
                  case 'very long (41+ words)':
                    distribution.veryLong = parseInt(percentage);
                    break;
                }
              }
              break;

            case 'architecture':
              const structureMatch = content.match(/([^:]+):\s*(\d+)/);
              if (structureMatch) {
                const [, type, count] = structureMatch;
                const structures = result.vocabulary!.metrics.messageArchitecture.structureTypes;
                switch (type.toLowerCase().trim()) {
                  case 'single word':
                    structures.singleWord = parseInt(count);
                    break;
                  case 'short phrase':
                    structures.shortPhrase = parseInt(count);
                    break;
                  case 'action oriented':
                    structures.actionOriented = parseInt(count);
                    break;
                  case 'bulleted list':
                    structures.bulletedList = parseInt(count);
                    break;
                  case 'stream of consciousness':
                    structures.streamOfConsciousness = parseInt(count);
                    break;
                }
              }
              break;

            case 'punctuation':
              const punctMatch = content.match(/([^:]+):\s*(\d+)/);
              if (punctMatch) {
                const [, type, count] = punctMatch;
                const punctuation = result.vocabulary!.metrics.messageArchitecture.terminalPunctuation;
                switch (type.toLowerCase().trim()) {
                  case 'none':
                    punctuation.none = parseInt(count);
                    break;
                  case 'period':
                    punctuation.period = parseInt(count);
                    break;
                  case 'question mark':
                    punctuation.questionMark = parseInt(count);
                    break;
                  case 'exclamation mark':
                    punctuation.exclamationMark = parseInt(count);
                    break;
                  case 'ellipsis':
                    punctuation.ellipsis = parseInt(count);
                    break;
                }
              }
              break;

            case 'character-metrics':
              const metricMatch = content.match(/([^:]+):\s*(\d+)/);
              if (metricMatch) {
                const [, type, value] = metricMatch;
                const metrics = result.vocabulary!.metrics.messageArchitecture.characterMetrics;
                switch (type.toLowerCase().trim()) {
                  case 'average length':
                    metrics.averageLength = parseInt(value);
                    break;
                  case 'short messages':
                    metrics.shortMessages = parseInt(value);
                    break;
                  case 'long messages':
                    metrics.longMessages = parseInt(value);
                    break;
                }
              }
              break;

            case 'preferences':
              const prefMatch = content.match(/([^:]+):\s*(.+)/);
              if (prefMatch) {
                const [, type, value] = prefMatch;
                const prefs = result.vocabulary!.metrics.messageArchitecture.preferences;
                switch (type.toLowerCase().trim()) {
                  case 'uses markdown':
                    prefs.usesMarkdown = value.toLowerCase().includes('true');
                    break;
                  case 'uses bullet points':
                    prefs.usesBulletPoints = value.toLowerCase().includes('true');
                    break;
                  case 'uses numbered lists':
                    prefs.usesNumberedLists = value.toLowerCase().includes('true');
                    break;
                  case 'uses code blocks':
                    prefs.usesCodeBlocks = value.toLowerCase().includes('true');
                    break;
                  case 'preferred list style':
                    const listStyle = value.trim().toLowerCase();
                    prefs.preferredListStyle = (listStyle === 'bullet' || listStyle === 'numbered') ? listStyle : 'none';
                    break;
                }
              }
              break;
          }
        }
        // Parse average message length and word counts
        else if (currentSection === 'architecture') {
          const avgMatch = trimmedLine.match(/average message length:\s*(\d+)/i);
          if (avgMatch) {
            result.vocabulary!.metrics.averageMessageLength = parseInt(avgMatch[1]);
          }
          const uniqueMatch = trimmedLine.match(/unique words:\s*(\d+)/i);
          if (uniqueMatch) {
            result.vocabulary!.metrics.uniqueWordsCount = parseInt(uniqueMatch[1]);
          }
          const totalMatch = trimmedLine.match(/total words analyzed:\s*(\d+)/i);
          if (totalMatch) {
            result.vocabulary!.metrics.totalWordsAnalyzed = parseInt(totalMatch[1]);
          }
        }
      }
    }
  }

  // Set defaults if needed
  if (!result.vocabulary!.commonTerms.length) {
    result.vocabulary!.commonTerms = [{
      term: 'general',
      frequency: 0,
      percentage: 0
    }, {
      term: 'standard',
      frequency: 0,
      percentage: 0
    }, {
      term: 'typical',
      frequency: 0,
      percentage: 0
    }];
  }
  if (!result.vocabulary!.enthusiasmMarkers.length) {
    result.vocabulary!.enthusiasmMarkers = ['good', 'great', 'nice'];
  }

  return result;
}

// Parse emotional chunk
export function parseEmotionalChunk(response: string): Partial<PersonalityAnalysis> {
  const result: Partial<PersonalityAnalysis> = {
    emotionalIntelligence: {
      leadershipStyle: '',
      challengeResponse: '',
      analyticalTone: '',
      supportivePatterns: []
    },
    emotionalTone: '',
    thoughtProcess: {
      initialApproach: '',
      processingStyle: '',
      expressionStyle: ''
    }
  };

  const sections = response.split('\n\n');
  
  for (const section of sections) {
    if (section.toLowerCase().includes('emotional intelligence')) {
      const lines = section.split('\n').slice(1);
      let currentEISection = '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        if (trimmedLine.toLowerCase().includes('leadership style:')) {
          result.emotionalIntelligence!.leadershipStyle = trimmedLine.split(':')[1].trim();
          result.thoughtProcess!.initialApproach = result.emotionalIntelligence!.leadershipStyle;
        }
        else if (trimmedLine.toLowerCase().includes('challenge response:')) {
          result.emotionalIntelligence!.challengeResponse = trimmedLine.split(':')[1].trim();
          result.thoughtProcess!.processingStyle = result.emotionalIntelligence!.challengeResponse;
        }
        else if (trimmedLine.toLowerCase().includes('analytical tone:')) {
          result.emotionalIntelligence!.analyticalTone = trimmedLine.split(':')[1].trim();
          result.thoughtProcess!.expressionStyle = result.emotionalIntelligence!.analyticalTone;
        }
        else if (trimmedLine.toLowerCase().includes('supportive patterns:')) {
          currentEISection = 'supportive';
        }
        else if (currentEISection === 'supportive' && (trimmedLine.startsWith('-') || trimmedLine.startsWith('•'))) {
          const pattern = trimmedLine.replace(/^[-•]\s*/, '').trim();
          result.emotionalIntelligence!.supportivePatterns.push(pattern);
        }
      }
    }
    else if (section.toLowerCase().includes('emotion')) {
      const lines = section.split('\n').slice(1);
      result.emotionalTone = lines
        .filter(line => line.trim())
        .join(' ')
        .trim();
    }
  }

  // Set defaults if needed
  if (!result.emotionalIntelligence!.leadershipStyle) {
    result.emotionalIntelligence!.leadershipStyle = 'Balanced and professional';
    result.thoughtProcess!.initialApproach = 'Balanced and professional';
  }
  if (!result.emotionalIntelligence!.challengeResponse) {
    result.emotionalIntelligence!.challengeResponse = 'Solution-oriented';
    result.thoughtProcess!.processingStyle = 'Solution-oriented';
  }
  if (!result.emotionalIntelligence!.analyticalTone) {
    result.emotionalIntelligence!.analyticalTone = 'Neutral and objective';
    result.thoughtProcess!.expressionStyle = 'Neutral and objective';
  }
  if (!result.emotionalIntelligence!.supportivePatterns.length) {
    result.emotionalIntelligence!.supportivePatterns = ['Positive acknowledgment'];
  }
  if (!result.emotionalTone) {
    result.emotionalTone = 'Neutral emotional expression';
  }

  return result;
}

// Combine all chunk parsers to create a complete analysis
export function parseChunkedAnalysis(chunks: { [key: string]: string }): PersonalityAnalysis {
  const basicInfo = parseBasicInfoChunk(chunks.basic || '');
  const interests = parseInterestsChunk(chunks.interests || '');
  const communication = parseCommunicationChunk(chunks.communication || '');
  const vocabulary = parseVocabularyChunk(chunks.vocabulary || '');
  const emotional = parseEmotionalChunk(chunks.emotional || '');
  const social = parseSocialBehaviorMetrics(chunks.social || '');

  return {
    ...basicInfo,
    ...interests,
    ...communication,
    ...vocabulary,
    ...emotional,
    ...social,
    // Ensure all required fields have defaults
    summary: basicInfo.summary || 'No summary available',
    traits: basicInfo.traits || [],
    interests: interests.interests || [],
    topicsAndThemes: interests.topicsAndThemes || [],
    socialBehaviorMetrics: social.socialBehaviorMetrics,
    communicationStyle: communication.communicationStyle || {
      formality: 'medium',
      enthusiasm: 'medium',
      technicalLevel: 'medium',
      emojiUsage: 'medium',
      verbosity: 'medium',
      description: 'Default communication style',
      patterns: {
        capitalization: 'mixed',
        punctuation: [],
        lineBreaks: 'minimal',
        messageStructure: {
          opening: ['Standard greeting'],
          framing: [],
          closing: ['Standard closing']
        }
      },
      contextualVariations: {
        business: 'Standard professional communication',
        casual: 'Relaxed and approachable',
        technical: 'Clear and precise',
        crisis: 'Direct and solution-focused'
      }
    },
    vocabulary: vocabulary.vocabulary || {
      commonTerms: [],
      commonPhrases: [],
      enthusiasmMarkers: [],
      industryTerms: [],
      nGrams: {
        bigrams: [],
        trigrams: []
      },
      metrics: {
        sentenceLengths: {
          veryShort: 0,
          short: 0,
          medium: 0,
          long: 0,
          veryLong: 0,
          distribution: {
            veryShort: 0,
            short: 0,
            medium: 0,
            long: 0,
            veryLong: 0
          }
        },
        capitalizationStats: {
          lowercase: 0,
          sentenceCase: 0,
          mixedCase: 0,
          totalMessages: 0
        },
        averageMessageLength: 0,
        uniqueWordsCount: 0,
        totalWordsAnalyzed: 0,
        messageArchitecture: {
          structureTypes: {
            singleWord: 0,
            shortPhrase: 0,
            actionOriented: 0,
            bulletedList: 0,
            streamOfConsciousness: 0
          },
          terminalPunctuation: {
            none: 0,
            period: 0,
            questionMark: 0,
            exclamationMark: 0,
            ellipsis: 0
          },
          characterMetrics: {
            averageLength: 0,
            shortMessages: 0,
            longMessages: 0
          },
          preferences: {
            usesMarkdown: false,
            usesBulletPoints: false,
            usesNumberedLists: false,
            usesCodeBlocks: false,
            preferredListStyle: 'none'
          }
        }
      }
    },
    emotionalIntelligence: emotional.emotionalIntelligence || {
      leadershipStyle: 'Balanced and professional',
      challengeResponse: 'Solution-oriented',
      analyticalTone: 'Neutral and objective',
      supportivePatterns: ['Positive acknowledgment']
    },
    emotionalTone: emotional.emotionalTone || 'Neutral emotional expression',
    thoughtProcess: emotional.thoughtProcess || {
      initialApproach: 'Balanced and professional',
      processingStyle: 'Solution-oriented',
      expressionStyle: 'Neutral and objective'
    }
  };
}

function parseTraits(text: string): PersonalityAnalysis['traits'] {
  const traits: PersonalityAnalysis['traits'] = [];
  
  // Match traits in format: - **[Trait Name]** [Score/10] - [Evidence-based explanation]
  const traitPatterns = [
    // New format with markdown
    /[-•*]\s*\*\*([^*]+)\*\*\s*\[(\d+)\/10\]\s*-\s*([^\n]+)/g,
    // Old format with markdown
    /[-•*]*\s*\*\*([\w\s-]+)\*\*\s*\[(\d+)\/10\][\s\n]*(?:[-:]?\s*((?:[^*\n]|\*[^*]|\*\*[^*])*?)(?=\n|$|\*\*))?/g,
    // Fallback without markdown
    /[-•*]\s*([^[\n]+)\s*\[(\d+)\/10\]\s*-\s*([^\n]+)/g
  ];

  for (const pattern of traitPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [, name, score, explanation] = match;
      if (name && score) {
        traits.push({
          name: name.trim(),
          score: parseInt(score, 10),
          explanation: explanation ? explanation.trim() : name.trim()
        });
      }
    }
    if (traits.length > 0) break; // Stop if we found traits with current pattern
  }

  // Sort traits by score in descending order
  return traits.sort((a, b) => b.score - a.score);
}

export function parseInterests(text: string): string[] {
  const interests: string[] = [];
  
  // Look for interests in various sections
  const interestSections = [
    // New format
    text.match(/###\s*Summary of Interests:[\s\S]*?(?=###|$)/)?.[0],
    // Old format
    text.match(/(?:Primary Interests & Expertise Areas|Multiple Distinct Topics\/Themes)([\s\S]*?)(?=###|$)/)?.[0],
    // Backup format
    text.match(/###\s*\d+\.\s*(?:Interests|Areas of Interest|Key Interests)([\s\S]*?)(?=###|$)/)?.[0]
  ].filter((section): section is string => section !== undefined);

  if (!interestSections.length) return interests;

  for (const section of interestSections) {
    // Extract interests from numbered or bulleted lists and markdown bold
    const patterns = [
      /(?:\d+\.|•|\*)\s*\*\*([^*]+)\*\*/g,  // Numbered/bullet with markdown: 1. **Interest**
      /(?:\d+\.|•|\*)\s*([^*\n]+?)(?=\n|$)/g,  // Regular numbered/bullet: 1. Interest
      /\*\*([^*]+)\*\*/g  // Just markdown: **Interest**
    ];

    for (const pattern of patterns) {
      const matches = section.matchAll(pattern);
      for (const match of matches) {
        const interest = match[1].trim();
        if (interest && 
            !interest.includes('Expertise Level') && 
            !interest.includes('Evidence:') &&
            interest.length > 3) {
          interests.push(interest);
        }
      }
    }
  }

  // Remove duplicates and filter out any remaining noise
  return [...new Set(interests)]
    .filter(interest => 
      !interest.toLowerCase().includes('evidence') && 
      !interest.toLowerCase().includes('expertise level'));
}