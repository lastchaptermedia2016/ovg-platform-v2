"use client";

import { useState } from "react";
import type { SuggestedAction } from "@/lib/schemas/tenant-config.canonical";

interface SuggestedActionsEditorProps {
  value: SuggestedAction[];
  onChange: (next: SuggestedAction[]) => void;
  isReadOnly?: boolean;
}

type DraftAction = Omit<SuggestedAction, "label" | "payload"> & {
  label: string;
  payload: string;
};

function emptyDraft(): DraftAction {
  return { label: "", actionType: "message", payload: "" };
}

export function SuggestedActionsEditor({
  value,
  onChange,
  isReadOnly = false,
}: SuggestedActionsEditorProps) {
  const [draft, setDraft] = useState<DraftAction | null>(null);

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const add = () => {
    if (!draft) return;
    if (!draft.label.trim() || !draft.payload.trim()) return;
    onChange([...value, { label: draft.label.trim(), actionType: draft.actionType, payload: draft.payload.trim() }]);
    setDraft(null);
  };

  const disabled = isReadOnly;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/15 backdrop-blur-xl p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-white mb-1 font-agrandir">
        Quick Action Pills
      </h3>
      <p className="text-xs text-zinc-500 mb-4">
        These suggestions appear above the chat input when a conversation starts.{" "}
        <span className="text-zinc-400">message</span> pills send text to the assistant;{" "}
        <span className="text-zinc-400">link</span> pills open a URL in a new tab.
      </p>

      <div className="space-y-3">
        {value.length === 0 && (
          <p className="text-xs text-zinc-600 italic">
            No quick actions configured yet.
          </p>
        )}

        {value.map((action, index) => (
          <div
            key={`${action.label}-${index}`}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 p-3"
          >
            <span className="text-xs font-medium text-cyan-300 uppercase tracking-wide">
              {action.actionType}
            </span>
            <span className="text-sm text-white flex-1 min-w-[8rem]">{action.label}</span>
            <span className="text-xs text-zinc-400 truncate max-w-[12rem]">
              {action.payload}
            </span>
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={disabled}
              className="px-2 py-1 rounded-md border border-white/10 text-zinc-300 hover:border-red-500/50 hover:text-red-300 transition-colors text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={`Remove ${action.label}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {!disabled && (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-slate-900/40 p-3">
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-[10px] font-medium text-zinc-400 mb-1 uppercase tracking-wide">
              Label
            </label>
            <input
              type="text"
              value={draft?.label ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({ ...(prev ?? emptyDraft()), label: e.target.value }))
              }
              placeholder="e.g. Book a treatment"
              className="w-full px-2 py-1.5 rounded-md bg-slate-800 text-white border border-white/10 focus:border-cyan-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1 uppercase tracking-wide">
              Type
            </label>
            <select
              value={draft?.actionType ?? "message"}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...(prev ?? emptyDraft()),
                  actionType: e.target.value as SuggestedAction["actionType"],
                }))
              }
              className="px-2 py-1.5 rounded-md bg-slate-800 text-white border border-white/10 focus:border-cyan-500 outline-none text-sm"
            >
              <option value="message">message</option>
              <option value="link">link</option>
            </select>
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-[10px] font-medium text-zinc-400 mb-1 uppercase tracking-wide">
              {draft?.actionType === "link" ? "URL" : "Message text"}
            </label>
            <input
              type="text"
              value={draft?.payload ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({ ...(prev ?? emptyDraft()), payload: e.target.value }))
              }
              placeholder={draft?.actionType === "link" ? "https://..." : "Text to send"}
              className="w-full px-2 py-1.5 rounded-md bg-slate-800 text-white border border-white/10 focus:border-cyan-500 outline-none text-sm"
            />
          </div>
          <button
            type="button"
            onClick={add}
            className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors"
          >
            Add
          </button>
        </div>
      )}

      {disabled && (
        <p className="mt-3 text-xs text-amber-400/80">
          Read-only. Unlock client configuration management to edit.
        </p>
      )}
    </div>
  );
}

export default SuggestedActionsEditor;
