import Groq from "groq-sdk";

// Client-side safe export - API calls proxied through /api/ai/* routes
// Server-side routes access GROQ_API_KEY securely
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || 'dummy-key-for-types',
});

export { groq };
export default groq;
