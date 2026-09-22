import Groq from 'groq-sdk';
import { z } from 'zod';

// ─── Request Contract ─────────────────────────────────────────────────────────

/**
 * Request schema for vibe → widget-config generation.
 * Shared by the HTTP route (for 400 validation) and by server modules
 * that invoke `applyVibe` directly in-process.
 */
export const ApplyVibeRequestSchema = z.object({
  vibe: z.string().min(1).max(500),
  tenantId: z.string().uuid().optional(),
  websiteUrl: z.string().url().optional(),
  industry: z.string().optional(),
});

export type ApplyVibeRequest = z.infer<typeof ApplyVibeRequestSchema>;

// ─── Response Contract ────────────────────────────────────────────────────────

/** Response schema for AI widget config */
export const WidgetConfigSchema = z.object({
  branding: z.object({
    headerBackground: z.string(),
    headerBackgroundType: z.enum(['solid', 'gradient', 'image']),
    headerGradientStart: z.string(),
    headerGradientEnd: z.string(),
    headerImage: z.string(),
    headerOpacity: z.number().min(0).max(1),
    footerBackground: z.string(),
    footerBackgroundType: z.enum(['solid', 'gradient', 'image']),
    footerGradientStart: z.string(),
    footerGradientEnd: z.string(),
    footerImage: z.string(),
    footerOpacity: z.number().min(0).max(1),
    logoUrl: z.string().optional(),
  }),
  features: z.object({
    aiInsightBadge: z.boolean(),
    aiDesignMirror: z.boolean(),
    customCss: z.boolean(),
  }),
  vibeName: z.string(),
  vibeDescription: z.string(),
});

export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;

export interface ApplyVibeResult {
  widgetConfig: WidgetConfig;
  metadata: {
    vibe: string;
    tenantId?: string;
    processedAt: string;
    model: string;
  };
}

const VIBE_MODEL = 'openai/gpt-oss-20b';


const VIBE_SYSTEM_PROMPT = `You are an AI Branding Vibe Generator for OVG Platform.

Your task is to interpret a natural language "vibe" description and generate a complete widget configuration.

The output must be a valid JSON object matching this exact schema:
{
  "branding": {
    "headerBackground": "#hexcolor",
    "headerBackgroundType": "solid|gradient|image",
    "headerGradientStart": "#hexcolor",
    "headerGradientEnd": "#hexcolor",
    "headerImage": "image URL or description",
    "headerOpacity": 0.75,
    "footerBackground": "#hexcolor",
    "footerBackgroundType": "solid|gradient|image",
    "footerGradientStart": "#hexcolor",
    "footerGradientEnd": "#hexcolor",
    "footerImage": "image URL or description",
    "footerOpacity": 0.75,
    "logoUrl": "optional logo URL"
  },
  "features": {
    "aiInsightBadge": true,
    "aiDesignMirror": false,
    "customCss": false
  },
  "vibeName": "short name for this vibe",
  "vibeDescription": "brief description of the aesthetic"
}

Rules:
1. Interpret "vibe" creatively - translate abstract concepts into colors and styles
2. For "cyberpunk" → neon purples/cyans, dark backgrounds, high contrast
3. For "minimalist" → clean whites/grays, subtle accents, high opacity
4. For "luxury" → gold/black/deep colors, elegant gradients
5. For "playful" → bright colors, rounded elements, cheerful gradients
6. Use Electric Blue #0097b2 and Gold #FFD700 as accent fallbacks
7. Suggest header/footer images that match the vibe (use placeholder descriptions)
8. Set opacity based on background intensity (0.6-0.95 range)
9. Enable aiInsightBadge by default, others based on vibe sophistication
10. Output ONLY valid JSON, no markdown or explanations`;

/**
 * Generate a widget configuration from a natural-language vibe description.
 *
 * Runs entirely in-process — server routes import and invoke this directly
 * instead of firing an internal HTTP request over `NEXT_PUBLIC_APP_URL`.
 *
 * @param request - Validated {@link ApplyVibeRequest}.
 * @returns The validated widget config plus response metadata.
 * @throws Error when GROQ_API_KEY is missing, the model returns
 *         nothing/malformed JSON, or the response fails schema validation.
 *         Callers decide whether the failure is fatal.
 */
export async function applyVibe(request: ApplyVibeRequest): Promise<ApplyVibeResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('AI service not configured');
  }

  const { vibe, tenantId, websiteUrl, industry } = request;
  const groq = new Groq({ apiKey });

  const contextPrompt = websiteUrl
    ? `Website: ${websiteUrl}\nIndustry: ${industry || 'General'}\n`
    : industry
      ? `Industry: ${industry}\n`
      : '';

  const userPrompt = `${contextPrompt}Vibe Description: "${vibe}"

Generate a complete widget configuration that captures this aesthetic. Be creative with colors, gradients, and styling choices that embody this vibe.`;

  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: VIBE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    model: VIBE_MODEL,
    temperature: 0.4,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  });

  const aiContent = completion.choices[0]?.message?.content;
  if (!aiContent) {
    throw new Error('AI returned empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(aiContent);
  } catch (parseError) {
    console.error('Parse error:', parseError);
    throw new Error('AI returned malformed JSON');
  }

  const validation = WidgetConfigSchema.safeParse(parsed);
  if (!validation.success) {
    console.error('Schema validation failed:', validation.error);
    throw new Error('AI response does not match required schema');
  }
  const widgetConfig = validation.data;

  // Clamp opacity values
  widgetConfig.branding.headerOpacity = Math.max(0.6, Math.min(0.95, widgetConfig.branding.headerOpacity));
  widgetConfig.branding.footerOpacity = Math.max(0.6, Math.min(0.95, widgetConfig.branding.footerOpacity));

  console.log('✨ AI Vibe applied:', {
    vibe: widgetConfig.vibeName,
    tenantId: tenantId || 'new tenant',
    headerType: widgetConfig.branding.headerBackgroundType,
  });

  return {
    widgetConfig,
    metadata: {
      vibe,
      tenantId,
      processedAt: new Date().toISOString(),
      model: VIBE_MODEL,
    },
  };
}
