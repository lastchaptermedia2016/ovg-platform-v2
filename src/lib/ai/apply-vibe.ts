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

/**
 * Strip markdown code-fence wrappers (```json ... ```) and stray leading
 * BOM/whitespace that LLMs frequently emit despite `response_format:
 * json_object`, so the payload is safe to hand to `JSON.parse`.
 */
function sanitizeAiJson(raw: string): string {
  let text = raw.trim();

  // Remove a leading UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // Peel off an opening fence (```, ```json, ```JSON, ...) and its closing ```.
  const fenceMatch = text.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  return text;
}

/**
 * Neutral, schema-valid widget config returned as a graceful fallback when the
 * model response cannot be parsed or fails validation. Returning this (instead
 * of throwing) keeps non-blocking branding flows — e.g. create-client
 * auto-branding — from corrupting the surrounding booking payload and dropping
 * fields (such as phone numbers) that live-curl integration tests assert on.
 */
export const EMPTY_WIDGET_CONFIG: WidgetConfig = {
  branding: {
    headerBackground: '#0097b2',
    headerBackgroundType: 'solid',
    headerGradientStart: '#0097b2',
    headerGradientEnd: '#0097b2',
    headerImage: '',
    headerOpacity: 0.75,
    footerBackground: '#0a1a1f',
    footerBackgroundType: 'solid',
    footerGradientStart: '#0a1a1f',
    footerGradientEnd: '#0a1a1f',
    footerImage: '',
    footerOpacity: 0.75,
  },
  features: {
    aiInsightBadge: false,
    aiDesignMirror: false,
    customCss: false,
  },
  vibeName: 'Default',
  vibeDescription: 'Default widget configuration.',
};

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
 * @returns The validated widget config plus response metadata. When the model
 *          returns unparseable or schema-invalid JSON, a neutral
 *          {@link EMPTY_WIDGET_CONFIG} fallback is returned instead of throwing,
 *          so non-blocking branding flows never drop surrounding payload data.
 * @throws Error only when GROQ_API_KEY is missing or the model returns no
 *         content. Callers decide whether those failures are fatal.
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

  // Parse + validate defensively. LLMs routinely wrap valid JSON in markdown
  // code fences or emit prose despite `json_object` mode, so a parse or schema
  // failure must never throw past this point — doing so aborts the surrounding
  // booking flow and drops payload fields (e.g. phone numbers) that downstream
  // live-curl tests assert on. Fall back to a neutral config instead.
  try {
    const parsed: unknown = JSON.parse(sanitizeAiJson(aiContent));
    const validation = WidgetConfigSchema.safeParse(parsed);

    if (!validation.success) {
      console.error(
        `[applyVibe] Schema validation failed for vibe "${vibe}" ` +
          `(raw ${aiContent.length} chars): ${aiContent.slice(0, 200)} | ` +
          `issues: ${JSON.stringify(validation.error.issues)}`,
      );
      return {
        widgetConfig: structuredClone(EMPTY_WIDGET_CONFIG),
        metadata: { vibe, tenantId, processedAt: new Date().toISOString(), model: VIBE_MODEL },
      };
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
      metadata: { vibe, tenantId, processedAt: new Date().toISOString(), model: VIBE_MODEL },
    };
  } catch (parseError) {
    console.error(
      `[applyVibe] JSON.parse failed for vibe "${vibe}" ` +
        `(raw ${aiContent.length} chars): ${aiContent.slice(0, 200)} | ` +
        `error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
    );
    return {
      widgetConfig: structuredClone(EMPTY_WIDGET_CONFIG),
      metadata: { vibe, tenantId, processedAt: new Date().toISOString(), model: VIBE_MODEL },
    };
  }
}
