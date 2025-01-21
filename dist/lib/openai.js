"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzePersonality = analyzePersonality;
const openai_1 = __importDefault(require("openai"));
function ensureString(value, defaultValue = 'Not provided') {
    if (!value)
        return defaultValue;
    return value;
}
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY
});
async function analyzePersonality(tweets, profile, prompt, context) {
    // Prepare the content for analysis
    const validTweets = tweets.filter((t) => typeof t.text === 'string' && t.text.length > 0);
    const tweetTexts = validTweets.map(t => t.text).join('\n');
    const profileInfo = `Name: ${ensureString(profile.name)}
Bio: ${ensureString(profile.bio)}
Followers: ${ensureString(profile.followersCount)}
Following: ${ensureString(profile.followingCount)}`;
    // If it's a custom prompt, use a different format
    const promptText = prompt && context ?
        `Based on the following Twitter profile and tweets, ${prompt.toLowerCase()}
    
Context: ${context}

Profile Information:
${profileInfo}

Tweet History:
${tweetTexts}

Provide a detailed analysis focusing specifically on this aspect of their personality.` :
        `Analyze the following Twitter profile and tweets to create a detailed personality analysis. 
Profile Information:
${profileInfo}

Tweet History:
${tweetTexts}

Create a personality analysis in the following format:
1. A brief summary of the person
2. Key personality traits (with scores 1-10 and brief explanations)
3. Main interests and topics they engage with
4. Communication style analysis
5. Recurring topics and themes
6. Overall emotional tone
7. Personalized recommendations for engagement

Focus on being insightful but respectful. Avoid making assumptions about personal details not evident in the data.`;
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are an expert personality analyst specializing in social media behavior analysis. Provide detailed, professional, and respectful insights."
                },
                {
                    role: "user",
                    content: promptText
                }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });
        const response = completion.choices[0].message.content;
        if (!response) {
            throw new Error('OpenAI returned empty response');
        }
        // If it's a custom prompt, return just the response
        if (prompt && context) {
            return { response };
        }
        // Otherwise parse the response into structured format
        const analysis = parseAnalysisResponse(response);
        return analysis;
    }
    catch (error) {
        console.error('Error analyzing personality:', error);
        throw error;
    }
}
function parseAnalysisResponse(response) {
    // Default structure
    const analysis = {
        summary: '',
        traits: [],
        interests: [],
        communicationStyle: '',
        topicsAndThemes: [],
        emotionalTone: '',
        recommendations: []
    };
    try {
        // Split response into sections
        const sections = response.split('\n\n');
        sections.forEach(section => {
            var _a, _b, _c;
            if (section.includes('summary') || section.includes('Summary')) {
                analysis.summary = ((_a = section.split(':')[1]) === null || _a === void 0 ? void 0 : _a.trim()) || '';
            }
            else if (section.toLowerCase().includes('personality traits')) {
                const traits = section.split('\n').slice(1);
                traits.forEach(trait => {
                    const match = trait.match(/(\w+).*?(\d+).*?-\s*(.*)/);
                    if (match) {
                        analysis.traits.push({
                            name: match[1],
                            score: parseInt(match[2]),
                            explanation: match[3].trim()
                        });
                    }
                });
            }
            else if (section.toLowerCase().includes('interests')) {
                analysis.interests = section.split('\n')
                    .slice(1)
                    .map(i => i.replace(/^[•-]\s*/, '').trim())
                    .filter(Boolean);
            }
            else if (section.toLowerCase().includes('communication style')) {
                analysis.communicationStyle = ((_b = section.split(':')[1]) === null || _b === void 0 ? void 0 : _b.trim()) || '';
            }
            else if (section.toLowerCase().includes('topics and themes')) {
                analysis.topicsAndThemes = section.split('\n')
                    .slice(1)
                    .map(t => t.replace(/^[•-]\s*/, '').trim())
                    .filter(Boolean);
            }
            else if (section.toLowerCase().includes('emotional tone')) {
                analysis.emotionalTone = ((_c = section.split(':')[1]) === null || _c === void 0 ? void 0 : _c.trim()) || '';
            }
            else if (section.toLowerCase().includes('recommendations')) {
                analysis.recommendations = section.split('\n')
                    .slice(1)
                    .map(r => r.replace(/^[•-]\s*/, '').trim())
                    .filter(Boolean);
            }
        });
        return analysis;
    }
    catch (error) {
        console.error('Error parsing analysis response:', error);
        return analysis;
    }
}
