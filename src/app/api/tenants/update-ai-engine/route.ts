import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

// ──────────────────────────────────────────────
// Request validation schema
// ──────────────────────────────────────────────
const UpdateAIEngineSchema = z.object({
  tenantId: z.string().uuid(),
  initialGreeting: z.string().nullable(),
  voicePersonaTone: z.string().nullable(),
  voiceVocabularyStyle: z.string().nullable(),
  syncedWithBranding: z.boolean(),
});

// ──────────────────────────────────────────────
// POST — Upsert ai_settings for a tenant
// ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = UpdateAIEngineSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request parameters",
          details: validationResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { tenantId, initialGreeting, voicePersonaTone, voiceVocabularyStyle, syncedWithBranding } =
      validationResult.data;

    const now = new Date().toISOString();

    console.log("=== UPDATE AI ENGINE REQUEST ===");
    console.log("tenantId:", tenantId);
    console.log("initialGreeting length:", initialGreeting?.length ?? 0);
    console.log("voicePersonaTone length:", voicePersonaTone?.length ?? 0);
    console.log("voiceVocabularyStyle length:", voiceVocabularyStyle?.length ?? 0);
    console.log("syncedWithBranding:", syncedWithBranding);

    // Try user-session client first, fall back to service-role
    const supabase = await createClient();

    const { error: upsertError } = await supabase
      .from("ai_settings")
      .upsert(
        {
          tenant_id: tenantId,
          initial_greeting: initialGreeting,
          voice_persona_tone: voicePersonaTone,
          voice_vocabulary_style: voiceVocabularyStyle,
          synced_with_branding: syncedWithBranding,
          updated_at: now,
        },
        { onConflict: "tenant_id" },
      );

    if (upsertError) {
      // Fallback with admin client
      const { error: adminError } = await supabaseAdmin
        .from("ai_settings")
        .upsert(
          {
            tenant_id: tenantId,
            initial_greeting: initialGreeting,
            voice_persona_tone: voicePersonaTone,
            voice_vocabulary_style: voiceVocabularyStyle,
            synced_with_branding: syncedWithBranding,
            updated_at: now,
          },
          { onConflict: "tenant_id" },
        );

      if (adminError) {
        console.error("=== UPDATE AI ENGINE ERROR ===");
        console.error("User-session error:", upsertError.message);
        console.error("Admin fallback error:", adminError.message);

        return NextResponse.json(
          { success: false, error: "Database write failed" },
          { status: 500 },
        );
      }
    }

    console.log("=== UPDATE AI ENGINE SUCCESS ===");
    console.log("writtenAt:", now);

    return NextResponse.json({
      success: true,
      writtenAt: now,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("=== UPDATE AI ENGINE UNEXPECTED ERROR ===", errorMessage);
    return NextResponse.json(
      { success: false, error: "Internal server error", details: errorMessage },
      { status: 500 },
    );
  }
}