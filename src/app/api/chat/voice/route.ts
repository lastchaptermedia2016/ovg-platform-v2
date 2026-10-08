import { NextRequest } from "next/server";
import { processUserMessage } from "@/core/widget/actions/chat";
import { getTenantId } from "@/core/tenant/tenant";
import { getTenantKnowledgeContext, type KnowledgeItem } from "@/lib/reseller/tenant-knowledge-engine";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { KnowledgeEntry } from "@/lib/ai/system-prompt-builder";

export async function POST(request: NextRequest) {
  try {
    const { message, tenantId } = await request.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
      });
    }

    // Resolve tenant ID
    const resolvedTenantId = getTenantId(tenantId);
    if (!resolvedTenantId) {
      return new Response(
        JSON.stringify({ error: "Tenant ID is required" }),
        { status: 400 }
      );
    }

    // Fetch knowledge entries for the widget surface
    let knowledgeEntries: KnowledgeEntry[] = [];
    try {
      const { items: kbItems, error: kbError } = await getTenantKnowledgeContext(
        resolvedTenantId,
        supabaseAdmin
      );

      if (!kbError && kbItems && kbItems.length > 0) {
        knowledgeEntries = kbItems.map((item: KnowledgeItem): KnowledgeEntry => ({
          title: item.title,
          content: item.content,
          category: item.category ?? null,
        }));
      }
    } catch {
      // Knowledge base is optional; continue without it
      knowledgeEntries = [];
    }

    let fullText = "";
    let audioBase64 = "";
    const voiceUsed = "hannah";

    for await (const chunk of processUserMessage(
      message,
      resolvedTenantId,
      knowledgeEntries
    )) {
      if (chunk.type === "text") {
        fullText += chunk.content;
      }
      if (chunk.type === "audio") {
        audioBase64 = chunk.audioBase64;
      }
      if (chunk.type === "error") {
        return new Response(
          JSON.stringify({ success: false, message: chunk.message }),
          { status: 500 }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        text: fullText,
        response: fullText,
        audioBase64: audioBase64,
        voiceUsed: voiceUsed,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: "Failed to process request" }),
      { status: 500 }
    );
  }
}
