import Groq from "groq-sdk";

if (!process.env.GROQ_API_KEY) {
  throw new Error(
    "❌ Missing GROQ_API_KEY environment variable. Add it to .env.local",
  );
}

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Optional: Export as default too
export default groq;
