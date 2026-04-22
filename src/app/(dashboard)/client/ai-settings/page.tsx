"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function toast(message: string, type: "success" | "error" = "success") {
  alert(`${type === "success" ? "✓" : "✗"} ${message}`);
}

export default function AISettingsPage() {
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    async function loadConfig() {
      const { data } = await supabase
        .from("tenants")
        .select("system_prompt")
        .single();

      if (data) setPrompt(data.system_prompt);
    }
    loadConfig();
  }, []);

  const handleSave = async () => {
    const { error } = await supabase
      .from("tenants")
      .update({ system_prompt: prompt })
      .eq("tenant_id", "demo"); // TODO: Get from tenant context

    if (error) toast("Failed to update the brain.", "error");
    else toast("Orpheus has been recalibrated.", "success");
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">
          AI Brain Configuration
        </h1>
        <p className="text-slate-400">
          Define the personality, knowledge, and constraints of your Pod.
        </p>
      </div>

      <div className="bg-[#001A2C] border border-gold-500/20 p-6 rounded-xl space-y-4">
        <label className="text-gold-500 font-medium">System Prompt</label>
        <Textarea
          value={prompt}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setPrompt(e.target.value)
          }
          placeholder="You are Orpheus, a helpful assistant specialized in..."
          className="h-64 bg-black/40 border-slate-700 text-slate-200 focus:border-gold-500"
        />
        <Button
          onClick={handleSave}
          className="bg-gold-600 hover:bg-gold-500 text-black font-bold"
        >
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
