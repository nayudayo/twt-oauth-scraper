import OpenAI from 'openai';

// Initialize OpenAI client on server side only
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default openai; 