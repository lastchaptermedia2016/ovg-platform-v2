import Groq from "groq-sdk";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { context, field, value } = await req.json();

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // LLM-Driven Response Generation: Generate natural response for Hannah to speak
    const systemPrompt = `You are Hannah, a friendly and professional AI assistant helping a user create a client profile.
Generate a brief, natural, and conversational response (1-2 sentences) based on the context.
Be warm and encouraging. Use a professional but approachable tone.
Do not include any explanatory text or formatting - just the response text.`;

    const userPrompt = `Context: ${context}. Field: ${field}. Value: ${value || 'not provided'}. Generate a natural response to acknowledge this input.`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 100,
    });

    const response = completion.choices[0]?.message?.content || 'Got it.';

    return NextResponse.json({ response }, { status: 200 });
  } catch (error: any) {
    console.error("❌ [Response Generation Error]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
