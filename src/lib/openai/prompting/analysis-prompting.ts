import { PersonalityAnalysis } from '../types';

interface PromptParams {
  profileInfo: string;
  tweetTexts: string;
  tweetExamples?: string;
  prompt?: string;
  context?: string;
  combinedAnalysis?: PersonalityAnalysis;
}

// Define the different chunks we'll split the analysis into
export const ANALYSIS_CHUNKS = {
  BASIC_INFO: 'basic_info',           // Summary and core traits (sections 1-2)
  INTERESTS: 'interests',             // Interests and expertise (section 3)
  SOCIAL_METRICS: 'social_metrics',   // Social behavior patterns (section 4)
  COMMUNICATION: 'communication',     // Communication style (section 5)
  VOCABULARY: 'vocabulary',           // Language patterns (section 6)
  EMOTIONAL: 'emotional',             // Emotional intelligence and expression (sections 7-9)
} as const;

type ChunkType = typeof ANALYSIS_CHUNKS[keyof typeof ANALYSIS_CHUNKS];

// Generate a prompt for a specific chunk of the analysis
export function generateChunkPrompt(
  chunkType: ChunkType,
  { profileInfo, tweetTexts, tweetExamples }: PromptParams
): string {
  const baseContext = `Profile Information:
${profileInfo}

Tweet History:
${tweetTexts}
${tweetExamples ? `\nExample Tweets:\n${tweetExamples}` : ''}`;

  switch (chunkType) {
    case ANALYSIS_CHUNKS.BASIC_INFO:
      return `Analyze the following Twitter profile and tweets to create a summary and identify core personality traits.

${baseContext}

Create a focused analysis of:

1. Summary (2-3 clear sentences):
Capture the essence of their personality, communication style, and key behavioral patterns.

2. Core Personality Traits (3-5 most distinctive):
Format each trait exactly as:
- **[Trait Name]** [Score/10] - [Evidence-based explanation]

Example:
- **Enthusiastic** [8/10] - Shows consistent excitement in posts about new projects
- **Analytical** [7/10] - Frequently breaks down complex topics for followers

3. Primary Interests & Expertise:
Format each interest exactly as:
- [Interest Area]
Example:
- Cryptocurrency Trading
- NFT Collection
- Community Building
- Digital Art

For each interest, provide:
- Expertise Level: [Beginner/Intermediate/Advanced]
- Evidence: Brief explanation with tweet examples`;

    case ANALYSIS_CHUNKS.INTERESTS:
      return `Analyze the following Twitter profile and tweets to identify primary interests and expertise areas.

${baseContext}

3. Primary Interests & Expertise (4-5 areas):
- Group related interests
- Note expertise level in each area
- Include evidence from tweets`;

    case ANALYSIS_CHUNKS.SOCIAL_METRICS:
      return `Analyze the following Twitter profile and tweets to determine social behavior patterns.

${baseContext}

4. Social Behavior Metrics:
Format each metric exactly as:
[Category Name]:
- [Metric Name]: Score [0-100] - [Brief explanation]

Example:
Content Sharing Patterns:
- Oversharer: Score 65 - Frequently shares personal updates
- Reply Guy: Score 45 - Moderate engagement in conversations
- Viral Chaser: Score 80 - Often creates viral-worthy content

Interaction Style:
- Hot Takes: Score 70 - Regular controversial opinions
- Joker: Score 55 - Balanced use of humor

Platform Behavior:
- Early Adopter: Score 90 - Quick to try new features
- Knowledge Dropper: Score 75 - Often shares expertise`;

    case ANALYSIS_CHUNKS.COMMUNICATION:
      return `Analyze the following Twitter profile and tweets to determine communication style patterns.

${baseContext}

5. Communication Style Analysis:
A. Core Metrics (Score 0-100):
- Formality: [Score] - [Explanation]
- Enthusiasm: [Score] - [Explanation]
- Technical Level: [Score] - [Explanation]
- Emoji Usage: [Score] - [Explanation]

B. Writing Patterns:
- Capitalization: [mostly-lowercase/mostly-uppercase/mixed/standard]
- Punctuation: List common patterns (e.g., ..., !, ?)
- Line Breaks: [frequent/moderate/minimal]

C. Message Structure:
Opening Patterns:
- [Common opening 1]
- [Common opening 2]

Framing Patterns:
- [Common framing 1]
- [Common framing 2]

Closing Patterns:
- [Common closing 1]
- [Common closing 2]

D. Contextual Variations:
Business: [Description]
Casual: [Description]
Technical: [Description]
Crisis: [Description]`;

    case ANALYSIS_CHUNKS.VOCABULARY:
      return `Analyze the following tweets to determine vocabulary and language patterns.

${baseContext}

6. Vocabulary Analysis:
Format each section exactly as:

Common Terms:
- [Term] ([Frequency]%)
- [Term] ([Frequency]%)

Common Phrases:
- [Phrase] ([Frequency]%)
- [Phrase] ([Frequency]%)

Enthusiasm Markers:
- [Word/Phrase]
- [Word/Phrase]

Industry Terms:
- [Term]
- [Term]

N-grams:
Bigrams:
- [Two-word phrase] ([Frequency]%)
- [Two-word phrase] ([Frequency]%)

Trigrams:
- [Three-word phrase] ([Frequency]%)
- [Three-word phrase] ([Frequency]%)`;

    case ANALYSIS_CHUNKS.EMOTIONAL:
      return `Analyze the following Twitter profile and tweets to determine emotional intelligence patterns.

${baseContext}

7. Emotional Intelligence:
Format each section exactly as:

Leadership Style: [Description]
Challenge Response: [Description]
Analytical Tone: [Description]

Supportive Patterns:
- [Pattern 1]
- [Pattern 2]

8. Topics and Themes:
Primary Themes:
- [Theme 1]: [Brief explanation]
- [Theme 2]: [Brief explanation]
- [Theme 3]: [Brief explanation]

Theme Interconnections:
[Brief description of how themes relate]

9. Emotional Expression:
Tone Consistency: [Description]
Emotional Range: [Description]
Expression Patterns: [Description]
Response to Others: [Description]`;

    default:
      throw new Error(`Unknown chunk type: ${chunkType}`);
  }
}

// Generate a prompt text for either a custom analysis or a full analysis
export function generatePromptText({
  prompt,
  context,
  profileInfo,
  combinedAnalysis,
  tweetExamples,
  tweetTexts
}: PromptParams): string {
  // If it's a custom prompt with context and analysis, use the original format
  if (prompt && context && combinedAnalysis) {
    return `Based on the following Twitter profile and personality analysis, ${prompt.toLowerCase()}

Context: ${context}

Profile Information:
${profileInfo}

Personality Analysis:
1. Summary:
${combinedAnalysis.summary}

2. Core Personality Traits:
${combinedAnalysis.traits.map((trait: { name: string; score: number; explanation: string }) => 
  `- ${trait.name} (${trait.score}/10): ${trait.explanation}`
).join('\n')}

3. Primary Interests:
${combinedAnalysis.interests.join('\n')}

4. Communication Style:
- Formality Level: ${combinedAnalysis.communicationStyle.formality}
- Enthusiasm Level: ${combinedAnalysis.communicationStyle.enthusiasm}
- Technical Level: ${combinedAnalysis.communicationStyle.technicalLevel}
- Emoji Usage: ${combinedAnalysis.communicationStyle.emojiUsage}
${combinedAnalysis.communicationStyle.description}

5. Writing Patterns:
- Capitalization: ${combinedAnalysis.communicationStyle.patterns.capitalization}
- Common Punctuation: ${combinedAnalysis.communicationStyle.patterns.punctuation.join(', ')}
- Line Breaks: ${combinedAnalysis.communicationStyle.patterns.lineBreaks}
- Opening Patterns: ${combinedAnalysis.communicationStyle.patterns.messageStructure.opening.join(', ')}
- Closing Patterns: ${combinedAnalysis.communicationStyle.patterns.messageStructure.closing.join(', ')}

6. Contextual Adaptations:
- Business: ${combinedAnalysis.communicationStyle.contextualVariations.business}
- Casual: ${combinedAnalysis.communicationStyle.contextualVariations.casual}
- Technical: ${combinedAnalysis.communicationStyle.contextualVariations.technical}
- Crisis: ${combinedAnalysis.communicationStyle.contextualVariations.crisis}

7. Emotional Intelligence:
- Leadership Style: ${combinedAnalysis.emotionalIntelligence.leadershipStyle}
- Challenge Response: ${combinedAnalysis.emotionalIntelligence.challengeResponse}
- Analytical Tone: ${combinedAnalysis.emotionalIntelligence.analyticalTone}

8. Common Language Patterns:
- Terms: ${combinedAnalysis.vocabulary.commonTerms.join(', ')}
- Phrases: ${combinedAnalysis.vocabulary.commonPhrases.join(', ')}
- Enthusiasm Markers: ${combinedAnalysis.vocabulary.enthusiasmMarkers.join(', ')}

9. Topics & Themes:
${combinedAnalysis.topicsAndThemes.join('\n')}

10. Emotional Expression:
${combinedAnalysis.emotionalTone}

EXAMPLE TWEETS (for style reference):
${tweetExamples}

Tweet History:
${tweetTexts}

Important Guidelines:
1. Base your response on the provided personality analysis and maintain consistent character traits
2. Match the communication style metrics and patterns identified above
3. Use appropriate vocabulary and enthusiasm markers from the analysis
4. Adapt tone based on the contextual variations described
5. If the question is unrelated to the personality, redirect to relevant personality insights
6. Keep responses natural and authentic to the analyzed personality

Respond in a way that authentically reflects this personality profile.`;
  }
  
  // For a new analysis, return all chunks combined
  return Object.values(ANALYSIS_CHUNKS)
    .map(chunk => generateChunkPrompt(chunk, { profileInfo, tweetTexts, tweetExamples }))
    .join('\n\nFocus on quality over quantity. Provide specific examples from tweets where possible. Ensure all patterns identified are clearly evidenced in the provided tweets.\n\n');
}