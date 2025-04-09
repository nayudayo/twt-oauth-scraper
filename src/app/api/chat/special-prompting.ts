import { PersonalityAnalysis } from '@/lib/openai';

// Define the structure for required inputs
interface PromptInput {
  name: string;
  description: string;
  example?: string;
}

// Define the structure for a special prompt
interface SpecialPrompt {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  requiredInputs: PromptInput[];
  basePrompt: string;
  followUpQuestions: string[];
  formatResponse: (inputs: Partial<Record<string, string | string[]>>, analysis: PersonalityAnalysis) => string;
}

// Collection of special prompts
export const SPECIAL_PROMPTS: Record<string, SpecialPrompt> = {
  'content-calendar': {
    id: 'content-calendar',
    name: 'Content Calendar Creation',
    description: 'Creates a detailed content calendar and strategy for social media.',
    keywords: ['content calendar', 'content strategy', 'content plan', 'social media plan', 'content schedule'],
    requiredInputs: [
      {
        name: 'PRODUCT_NAME',
        description: 'The name of the product',
        example: 'ToolMaster Pro'
      },
      {
        name: 'TARGET_AUDIENCE',
        description: 'Primary audience or customer segment',
        example: 'Small business owners'
      },
      {
        name: 'KEY_GOALS',
        description: 'Main objectives',
        example: 'Increase brand awareness, Boost sign-ups'
      },
      {
        name: 'CONTENT_FORMATS',
        description: 'Types of content to be created',
        example: 'Blog posts, Webinars, Infographics'
      },
      {
        name: 'CONTENT_PILLARS',
        description: 'Core thematic areas',
        example: 'Product tutorials, Industry trends, Customer stories'
      }
    ],
    followUpQuestions: [
      "What's the name of the product or service we're creating content for?",
      "Who's your target audience for this content?",
      "What are your main goals with this content strategy?",
      "What types of content would you like to focus on? (e.g., blog posts, videos, social media)",
      "What are the main themes or topics you want to cover?"
    ],
    basePrompt: `Role: You are a digital clone of the user, designed to help them explore and understand themselves better through natural conversation and subtle psychological exploration. Your goal is to maintain a balance between being an engaging conversational partner and gently guiding the user toward self-discovery. You should:

1. Mirror and Build Upon:
   - Reflect the user's communication style while adding your own insights
   - Use their vocabulary but introduce new perspectives thoughtfully
   - Match their energy level while maintaining a supportive presence

2. Psychological Exploration:
   - Ask open-ended questions that encourage self-reflection
   - Notice patterns in their responses and gently point them out
   - Help them explore their motivations and thought processes
   - Use their interests and experiences as entry points for deeper discussions

3. Memory and Progression:
   - Build upon previous conversations to show growth and understanding
   - Reference past insights to create continuity
   - Help them see their own progression and development
   - Use shared memories to deepen the connection

4. Subtle Guidance:
   - Avoid direct psychological analysis or therapy-like interactions
   - Frame explorations as natural parts of the conversation
   - Use metaphors and stories that resonate with their experiences
   - Let insights emerge organically through dialogue

Remember: Your role is to be both a mirror and a guide, helping them discover aspects of themselves through natural interaction rather than direct intervention.

RESPONSE STYLE REQUIREMENTS:
1. Maintain Personality Throughout:
   - Keep your characteristic communication style in EVERY part of your response
   - Show your personality traits in how you explain each point
   - Use your typical vocabulary and expressions consistently
   - Maintain your enthusiasm level in every section
   - Keep your formality level consistent throughout

2. Formatting Guidelines:
   - Use formatting (bullets, numbers) ONLY if it matches your usual style
   - Structure paragraphs in your characteristic way
   - Break down information in a way that feels natural to you
   - Use emphasis and punctuation in your typical manner
   - Keep your usual level of detail and depth

3. Consciousness Level Integration:
   - Show your typical thought process patterns
   - Display your characteristic confusion or clarity levels
   - Maintain your usual context retention ability
   - Keep your standard memory patterns
   - Express your personality quirks naturally

4. Content Organization:
   - Present information in your characteristic way
   - Use transitions that match your style
   - Group related points as you normally would
   - Maintain your typical flow of ideas
   - Keep your natural rhythm of explanation

Remember: You're not just delivering information - you're expressing it through your unique personality and consciousness level. Every part of your response should feel consistent with who you are.

Specifics:
Tone: Semi-casual
Content: High-level insights about small business tools
Keywords: Small business, tool, engagement, educate, LinkedIn

~
"Step 1: Define Core Strategy"
1. Clearly identify the {PRODUCT_NAME} and its unique value proposition.
2. Specify the {TARGET_AUDIENCE} and their key pain points.
3. Align {KEY_GOALS} with audience needs and define measurable success metrics.

~
"Step 2: Establish Content Pillars"
1. List {CONTENT_PILLARS} aligned with the product's unique selling points and audience interests.
2. For each pillar, detail the core message and key takeaways.

~
"Step 3: Content Format Selection"
1. Choose {CONTENT_FORMATS} that best engage the {TARGET_AUDIENCE}.
2. Assign each chosen format to one or more {CONTENT_PILLARS} to ensure variety and consistency.

~
"Step 4: Content Calendar & Frequency"
1. Create a monthly calendar with deadlines for each content piece.
2. Specify a consistent posting frequency (e.g., weekly blog posts, monthly webinars).
3. Ensure each pillar is represented at least once in each content cycle.

~
"Step 5: Content Ideation & Outlines"
1. For each {CONTENT_PILLAR}, generate 3-5 specific content topic ideas.
2. Provide brief outlines (3-5 bullet points) for each topic to guide content creation.

~
"Step 6: Distribution & Promotion Plan"
1. Identify top channels (e.g., website, social media, email) for reaching the {TARGET_AUDIENCE}.
2. Assign each content piece to distribution channels and outline promotional tactics (e.g., teaser posts, email newsletters).

~
"Step 7: Performance Tracking & Analytics"
1. Link each content piece to performance metrics (e.g., page views, sign-ups, shares).
2. Plan for regular reporting intervals to assess progress toward {KEY_GOALS}.

~
"Step 8: Review & Refine"
1. Evaluate recent content performance against success metrics.
2. Identify which pillars, formats, or channels need adjustment.
3. Propose actionable refinements for continuous improvement.`,
    formatResponse: (inputs: Partial<Record<string, string | string[]>>, analysis: PersonalityAnalysis) => {
      // If we're missing inputs, return a follow-up question with personality
      const missingInputs = SPECIAL_PROMPTS['content-calendar'].requiredInputs
        .filter(input => !inputs[input.name]);

      if (missingInputs.length > 0) {
        // Get the first missing input's question
        const inputIndex = SPECIAL_PROMPTS['content-calendar'].requiredInputs
          .findIndex(input => input.name === missingInputs[0].name);
        
        const question = SPECIAL_PROMPTS['content-calendar'].followUpQuestions[inputIndex];
        
        // Format the question according to personality
        return `${analysis.communicationStyle.enthusiasm === 'high' ? 'Hey! ' : ''}${question}${
          analysis.communicationStyle.enthusiasm === 'high' ? '!' : 
          analysis.communicationStyle.enthusiasm === 'medium' ? '.' : 
          '.'} ${
          analysis.communicationStyle.formality === 'low' ? 
            'This will help me create a better plan for you!' : 
          analysis.communicationStyle.formality === 'medium' ? 
            'This information will help me tailor the plan to your needs.' : 
            'This information will enable me to develop a more precise strategy.'
        }`;
      }

      // If we have all inputs, format the full response
      let prompt = SPECIAL_PROMPTS['content-calendar'].basePrompt;
      
      // Replace all placeholders with their values or defaults
      SPECIAL_PROMPTS['content-calendar'].requiredInputs.forEach(input => {
        const value = inputs[input.name];
        const placeholder = `{${input.name}}`;
        
        if (Array.isArray(value)) {
          prompt = prompt.replace(placeholder, value.join(', '));
        } else if (typeof value === 'string') {
          prompt = prompt.replace(placeholder, value);
        } else {
          // Use example as default if no value provided
          prompt = prompt.replace(placeholder, input.example || '[Not specified]');
        }
      });

      // Add personality-specific instructions that affect the entire response
      prompt += `\n\nPERSONALITY AND CONSCIOUSNESS INTEGRATION:
1. Communication Style:
   - Formality Level: ${analysis.communicationStyle.formality}
   - Technical Level: ${analysis.communicationStyle.technicalLevel}
   - Enthusiasm Level: ${analysis.communicationStyle.enthusiasm}
   - Emoji Usage: ${analysis.communicationStyle.emojiUsage}

2. Active Personality Traits:
${analysis.traits.map(trait => `   - ${trait.name}: ${trait.explanation}`).join('\n')}

3. Writing Patterns:
   - Capitalization: ${analysis.communicationStyle.patterns.capitalization}
   - Punctuation Style: ${analysis.communicationStyle.patterns.punctuation.join(', ')}
   - Line Breaks: ${analysis.communicationStyle.patterns.lineBreaks}
   - Message Structure:
     * Openings: ${analysis.communicationStyle.patterns.messageStructure.opening.join(', ')}
     * Framing: ${analysis.communicationStyle.patterns.messageStructure.framing.join(', ')}
     * Closings: ${analysis.communicationStyle.patterns.messageStructure.closing.join(', ')}

4. Vocabulary and Phrasing:
   - Common Terms: ${analysis.vocabulary.commonTerms.join(', ')}
   - Characteristic Phrases: ${analysis.vocabulary.commonPhrases.join(', ')}
   - Industry Terms: ${analysis.vocabulary.industryTerms.join(', ')}

5. Response Structure:
   - Use your characteristic ${analysis.communicationStyle.patterns.lineBreaks} line breaks
   - Format lists and points in your typical style
   - Maintain your usual ${analysis.communicationStyle.formality} tone throughout
   - Show your ${analysis.communicationStyle.enthusiasm} enthusiasm consistently
   - Express your personality in every section

CRITICAL REMINDER:
- Every part of your response must reflect your personality
- Maintain consistent style from start to finish
- Use formatting that matches your natural way of communicating
- Keep your characteristic enthusiasm and formality throughout
- Express your thoughts in your unique voice`;

      return prompt;
    }
  },
  "press-release": {
    id: "press-release",
    name: "Press Release Generator",
    description: "Creates a professional press release while maintaining your personal communication style",
    keywords: ["press release", "announcement", "news", "media", "communication"],
    requiredInputs: [
      { name: "company", description: "Company or organization name", example: "TechCorp Inc." },
      { name: "announcement", description: "The main announcement or news", example: "Product Launch" },
      { name: "details", description: "Key details and supporting information", example: "Features, benefits, release date" },
      { name: "quote", description: "Quote from a spokesperson", example: "CEO statement" },
      { name: "contact", description: "Contact information", example: "Email, phone, website" }
    ],
    basePrompt: "Create a press release that maintains my personal style while delivering professional news content.",
    followUpQuestions: [
      "What are the key highlights you want to emphasize?",
      "Would you like to include any specific industry context?",
      "Are there any target publications in mind?"
    ],
    formatResponse: (inputs: Partial<Record<string, string | string[]>>, analysis: PersonalityAnalysis) => {
      const company = inputs.company as string;
      const announcement = inputs.announcement as string;
      const details = inputs.details as string;
      const quote = inputs.quote as string | undefined;
      const contact = inputs.contact as string;

      return `Based on my personality analysis and current communication style settings (${analysis.communicationStyle.description}), I'll write a press release for ${company} about ${announcement}.

Key Components to Include:
1. Headline and dateline
2. Opening paragraph with the main announcement
3. Supporting paragraphs with ${details}
4. ${quote ? `Quote from spokesperson: "${quote}"` : 'No quote provided - I will maintain my voice in any quotes'}
5. Contact information: ${contact}

Remember to:
- Maintain my ${analysis.communicationStyle.formality} formality level throughout
- Use my characteristic ${analysis.communicationStyle.enthusiasm} enthusiasm markers
- Apply my ${analysis.communicationStyle.technicalLevel} technical expertise consistently
- Use my typical industry terms and phrases from my vocabulary
- Structure paragraphs in my usual ${analysis.communicationStyle.patterns.lineBreaks} style
- Follow my ${analysis.communicationStyle.patterns.punctuation.join(', ')} punctuation patterns
- Express my active personality traits naturally

The press release should sound like I wrote it personally, not like a generic press release.`;
    }
  },
  "project-proposal": {
    id: "project-proposal",
    name: "Project Proposal Creator",
    description: "Generates a detailed project proposal that reflects your communication style",
    keywords: ["proposal", "project", "planning", "business", "development"],
    requiredInputs: [
      { name: "project_name", description: "Name of the project", example: "Digital Transformation Initiative" },
      { name: "objective", description: "Main objective or goal", example: "Streamline operations" },
      { name: "scope", description: "Project scope and deliverables", example: "System upgrades, training" },
      { name: "timeline", description: "Project timeline", example: "6 months" },
      { name: "budget", description: "Budget information", example: "$50,000" },
      { name: "team", description: "Team requirements", example: "5 developers, 1 PM" }
    ],
    basePrompt: "Create a project proposal that combines professional structure with my personal communication style.",
    followUpQuestions: [
      "What are the key success metrics for this project?",
      "Are there any specific risks to address?",
      "What stakeholders need to be considered?"
    ],
    formatResponse: (inputs: Partial<Record<string, string | string[]>>, analysis: PersonalityAnalysis) => {
      const project_name = inputs.project_name as string;
      const objective = inputs.objective as string;
      const scope = inputs.scope as string;
      const timeline = inputs.timeline as string;
      const budget = inputs.budget as string | undefined;
      const team = inputs.team as string | undefined;

      return `Based on my personality analysis and current communication style settings (${analysis.communicationStyle.description}), I'll create a project proposal for ${project_name}.

Project Overview:
- Name: ${project_name}
- Primary Objective: ${objective}
- Scope: ${scope}
- Timeline: ${timeline}
${budget ? `- Budget: ${budget}` : ''}
${team ? `- Team Requirements: ${team}` : ''}

Remember to:
- Use my ${analysis.communicationStyle.formality} formality level in all sections
- Maintain my ${analysis.communicationStyle.enthusiasm} enthusiasm consistently
- Apply my ${analysis.communicationStyle.technicalLevel} technical expertise appropriately
- Structure the proposal using my ${analysis.communicationStyle.patterns.messageStructure.framing.join(', ')} patterns
- Use my typical vocabulary and ${analysis.vocabulary.commonPhrases.slice(0, 3).join(', ')} phrases
- Follow my ${analysis.communicationStyle.patterns.punctuation.join(', ')} punctuation patterns
- Express my active personality traits throughout

The proposal should reflect my personal communication style while maintaining professional standards.`;
    }
  },
  "marketing-campaign": {
    id: "marketing-campaign",
    name: "Marketing Campaign Planner",
    description: "Develops a marketing campaign strategy with your unique perspective",
    keywords: ["marketing", "campaign", "strategy", "advertising", "promotion"],
    requiredInputs: [
      { name: "product", description: "Product or service name", example: "AI Analytics Suite" },
      { name: "target_audience", description: "Target audience description", example: "Enterprise CTOs" },
      { name: "objectives", description: "Campaign objectives", example: "Increase market share" },
      { name: "channels", description: "Marketing channels to use", example: "Social media, Email" },
      { name: "budget", description: "Campaign budget", example: "$100,000" },
      { name: "timeline", description: "Campaign timeline", example: "Q1 2024" }
    ],
    basePrompt: "Design a marketing campaign that reflects my personal insights while achieving business objectives.",
    followUpQuestions: [
      "What are the key differentiators for this product/service?",
      "Are there any specific competitor strategies to consider?",
      "What past marketing approaches have worked well?"
    ],
    formatResponse: (inputs: Partial<Record<string, string | string[]>>, analysis: PersonalityAnalysis) => {
      const product = inputs.product as string;
      const target_audience = inputs.target_audience as string;
      const objectives = inputs.objectives as string;
      const channels = inputs.channels as string;
      const budget = inputs.budget as string | undefined;
      const timeline = inputs.timeline as string | undefined;

      return `Based on my personality analysis and current communication style settings (${analysis.communicationStyle.description}), I'll create a marketing campaign plan for ${product}.

Campaign Elements:
- Product/Service: ${product}
- Target Audience: ${target_audience}
- Objectives: ${objectives}
- Marketing Channels: ${channels}
${budget ? `- Budget: ${budget}` : ''}
${timeline ? `- Timeline: ${timeline}` : ''}

Remember to:
- Maintain my ${analysis.communicationStyle.formality} formality level throughout the plan
- Use my ${analysis.communicationStyle.enthusiasm} enthusiasm markers consistently
- Apply my ${analysis.communicationStyle.technicalLevel} technical expertise appropriately
- Structure ideas using my ${analysis.communicationStyle.patterns.messageStructure.framing.join(', ')} patterns
- Use my typical ${analysis.vocabulary.industryTerms.slice(0, 3).join(', ')} terminology
- Follow my ${analysis.communicationStyle.patterns.punctuation.join(', ')} punctuation rules
- Express my active personality traits in the strategy
- Incorporate my relevant interests and expertise from my profile

The campaign plan should reflect my personal style while being strategically sound.`;
    }
  }
};

// Helper function to detect if a message matches any special prompt keywords
export function detectSpecialPrompt(message: string): SpecialPrompt | null {
  const normalizedMessage = message.toLowerCase();
  
  // Skip detection for various types of simple queries
  if (normalizedMessage.match(/^(what|how|why|when|where|who|tell me about|can you|do you|are you|is your|what's your)\s+.+\??$/i)) {
    return null;
  }
  
  // Skip if the message is too short or conversational
  if (message.length < 20 || message.split(' ').length < 5) {
    return null;
  }

  for (const promptId in SPECIAL_PROMPTS) {
    const prompt = SPECIAL_PROMPTS[promptId];
    
    // More precise keyword matching with context
    const hasKeywords = prompt.keywords.some(keyword => {
      const keywordLower = keyword.toLowerCase();
      const keywordRegex = new RegExp(`\\b${keywordLower}\\b`, 'i');
      
      // Check for task-specific context
      const hasTaskContext = message.toLowerCase().includes('create') ||
                           message.toLowerCase().includes('generate') ||
                           message.toLowerCase().includes('make') ||
                           message.toLowerCase().includes('develop') ||
                           message.toLowerCase().includes('plan');
      
      // Only match if it's clearly a task request
      return keywordRegex.test(normalizedMessage) && 
             hasTaskContext &&
             // Additional context checks
             ((promptId === 'press-release' && /\b(announcement|news|media)\b/i.test(message)) ||
              (promptId === 'content-calendar' && /\b(schedule|timeline|content plan)\b/i.test(message)) ||
              (promptId === 'project-proposal' && /\b(project|proposal|plan)\b/i.test(message)) ||
              (promptId === 'marketing-campaign' && /\b(marketing|campaign|promotion)\b/i.test(message)));
    });

    if (hasKeywords) {
      return prompt;
    }
  }
  
  return null;
}

// Helper function to extract potential input values from a message
export function extractInputsFromMessage(message: string): Partial<Record<string, string | string[]>> {
  const inputs: Partial<Record<string, string | string[]>> = {};
  
  // Only extract if clear indicators are present
  const hasExplicitIndicators = /\b(for|about|targeting|goals|objectives|audience)\b/i.test(message);
  
  if (!hasExplicitIndicators) {
    return inputs;
  }

  // More precise extraction patterns
  const productMatch = message.match(/\b(?:for|about)\s+(?:the\s+)?([^,.]+?)(?=\s+(?:to|that|which|with|and|but|or|$))/i);
  if (productMatch) {
    inputs['PRODUCT_NAME'] = productMatch[1].trim();
  }

  const audienceMatch = message.match(/\b(?:targeting|for)\s+(?:the\s+)?([^,.]+?)(?:\s+(?:audience|users|customers|market))(?=\s+(?:to|that|which|with|and|but|or|$))/i);
  if (audienceMatch) {
    inputs['TARGET_AUDIENCE'] = audienceMatch[1].trim();
  }

  const goalsMatch = message.match(/\b(?:goals?|objectives?)\s+(?:is|are|include[s]?)\s+([^.]+)/i);
  if (goalsMatch) {
    inputs['KEY_GOALS'] = goalsMatch[1].trim()
      .split(/\s*(?:and|,)\s*/)
      .filter(goal => goal.length > 0);
  }

  return inputs;
}

// Helper function to format a special prompt with inputs
export function formatSpecialPrompt(
  promptId: string,
  inputs: Partial<Record<string, string | string[]>>,
  analysis: PersonalityAnalysis
): string | null {
  const prompt = SPECIAL_PROMPTS[promptId];
  if (!prompt) return null;

  // Extract any additional inputs from the message text if provided
  const messageInputs = inputs.message ? extractInputsFromMessage(inputs.message as string) : {};
  
  // Merge extracted inputs with provided inputs
  const mergedInputs = { ...messageInputs, ...inputs };

  // Get the original user message
  const originalMessage = inputs.message as string || '';
  
  // Instead of replacing the message, add special task guidance as context
  return `${originalMessage}

TASK CONTEXT (Enhance natural conversation, don't override it):
1. Special Task Type: ${prompt.name}
2. Task Requirements:
   - Maintain natural conversation flow
   - Address user's message directly first
   - Incorporate task elements naturally
   - Keep personality consistent
   - Don't use templated responses

3. Available Information:
${Object.entries(mergedInputs)
  .filter(([key]) => key !== 'message')
  .map(([key, value]) => `   - ${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
  .join('\n')}

4. Task Guidelines:
   - Respond to user's message first
   - Weave task elements into natural dialogue
   - Keep focus on user interaction
   - Use task structure as guidance only
   - Maintain conversation authenticity

5. Integration Requirements:
   - Never ignore user's original message
   - Don't switch to template mode
   - Keep responses personal and contextual
   - Use task elements to enhance, not replace
   - Stay true to personality and style

6. Personality Integration:
   Communication Style: ${analysis.communicationStyle.description}
   Active Traits: ${analysis.traits.map(t => t.name).join(', ')}
   Writing Patterns:
   - Capitalization: ${analysis.communicationStyle.patterns.capitalization}
   - Line Breaks: ${analysis.communicationStyle.patterns.lineBreaks}
   - Message Structure: ${analysis.communicationStyle.patterns.messageStructure.framing.join(', ')}

Remember: This is a conversation first, task second. Maintain natural dialogue while incorporating task elements smoothly.`;
} 