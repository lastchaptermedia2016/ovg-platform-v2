import Groq from "groq-sdk";

if (!process.env.GROQ_API_KEY) {
  throw new Error("❌ Missing GROQ_API_KEY in environment variables");
}

// Create the Groq client instance (recommended name: groq)
export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Optional: also export as default for flexibility
export default groq;
