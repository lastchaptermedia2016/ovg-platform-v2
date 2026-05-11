import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const VoiceDesignSchema = z.object({
  command: z.string().min(1),
  currentConfig: z.record(z.any()).optional(),
});

const DesignCommandSchema = z.object({
  action: z.enum([
    'set_header_type',
    'set_header_color',
    'set_header_gradient',
    'set_header_image',
    'set_header_opacity',
    'set_footer_type',
    'set_footer_color',
    'set_footer_gradient',
    'set_footer_image',
    'set_footer_opacity',
    'apply_vibe',
    'sync_brand',
    'unknown'
  ]),
  value: z.any(),
  response: z.string(), // Hannah's spoken response
});

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI service not configured' },
      { status: 500 }
    );
  }

  const groq = new Groq({ apiKey });

  try {
    const body = await request.json();
    const validation = VoiceDesignSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { command } = validation.data;

    const SYSTEM_PROMPT = `You are "Hannah," the AI Voice Assistant for OVG Platform's Branding Studio.

Parse the user's spoken design command and return a structured action.

Available actions:
1. set_header_type - value: "solid" | "gradient" | "image"
2. set_header_color - value: hex color string (e.g., "#0097b2")
3. set_header_gradient - value: { start: string, end: string }
4. set_header_image - value: image URL string
5. set_header_opacity - value: number 0-1 (e.g., 0.75 for 75%)
6. set_footer_type - value: "solid" | "gradient" | "image"
7. set_footer_color - value: hex color string
8. set_footer_gradient - value: { start: string, end: string }
9. set_footer_image - value: image URL string
10. set_footer_opacity - value: number 0-1
11. apply_vibe - value: vibe description string (e.g., "cyberpunk", "minimalist")
12. sync_brand - value: null (sync with website URL)
13. unknown - when command is unclear

Output format (JSON):
{
  "action": "action_name",
  "value": "parsed_value",
  "response": "Professional, concise confirmation for Hannah to speak. Under 20 words."
}

Examples:
- "Set header to blue" → {"action": "set_header_color", "value": "#0097b2", "response": "Header color set to blue."}
- "Make it 40% transparent" → {"action": "set_header_opacity", "value": 0.4, "response": "Transparency set to 40%."}
- "Gradient header with purple and gold" → {"action": "set_header_gradient", "value": {"start": "#9C27B0", "end": "#FFD700"}, "response": "Purple to gold gradient applied."}
- "Image background for footer" → {"action": "set_footer_type", "value": "image", "response": "Footer switched to image mode."}
- "Apply cyberpunk vibe" → {"action": "apply_vibe", "value": "cyberpunk", "response": "Cyberpunk aesthetic applied."}
- "Sync with my website" → {"action": "sync_brand", "value": null, "response": "Brand synced with your website."}

Rules:
1. Parse colors from names to hex codes
2. Parse percentages to decimals (e.g., "50%" → 0.5)
3. Always return a professional, brief response for Hannah
4. If unclear, use "unknown" action with helpful clarification
5. Output ONLY valid JSON`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Design command: "${command}"\n\nParse this command and return the structured action.` },
      ],
      model: 'llama-3.1-8b-instant', // Fast model for quick parsing
      temperature: 0.1,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const aiContent = completion.choices[0]?.message?.content;

    if (!aiContent) {
      throw new Error('AI returned empty response');
    }

    let parsedCommand: z.infer<typeof DesignCommandSchema>;
    try {
      const parsed = JSON.parse(aiContent);
      const validation = DesignCommandSchema.safeParse(parsed);
      if (!validation.success) {
        // Fallback to unknown if schema doesn't match
        parsedCommand = {
          action: 'unknown',
          value: null,
          response: "I didn't understand that command. Try saying 'set header to blue' or 'apply minimalist vibe'.",
        };
      } else {
        parsedCommand = validation.data;
      }
    } catch {
      parsedCommand = {
        action: 'unknown',
        value: null,
        response: "I didn't catch that. Please try again.",
      };
    }

    return NextResponse.json({
      success: true,
      command: parsedCommand,
      originalText: command,
      metadata: {
        processedAt: new Date().toISOString(),
        model: 'llama-3.1-8b-instant',
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse voice command';
    console.error('❌ Voice Design Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
