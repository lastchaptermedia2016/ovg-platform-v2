"use client";

import { useState } from "react";

interface TenantSummary {
  id: string;
  name: string;
  tenant_id: string;
  category: string | null;
}

interface DeploymentStudioProps {
  tenants: TenantSummary[];
}

type SnippetFormat = "html" | "nextjs";

const PLATFORMS = [
  { key: "wordpress" as const, label: "WordPress" },
  { key: "shopify" as const, label: "Shopify" },
  { key: "custom" as const, label: "Custom HTML" },
];

type PlatformKey = (typeof PLATFORMS)[number]["key"];

function generateHtmlSnippet(tid: string): string {
  return [
    `<!-- OVG AI Widget — Paste before closing </body> tag -->`,
    `<script`,
    `  src="https://widget.ovg.co.za/loader.js"`,
    `  data-tenant-id="${tid}"`,
    `  async`,
    `  defer`,
    `></script>`,
  ].join("\n");
}

function generateNextJsSnippet(tid: string): string {
  return [
    `// 1. Install: npm install @ovg/widget-loader`,
    `// 2. Add this to your _app.tsx or layout.tsx`,
    ``,
    `import Script from "next/script";`,
    ``,
    `export default function OvgWidget() {`,
    `  return (`,
    `    <Script`,
    `      src="https://widget.ovg.co.za/loader.js"`,
    `      data-tenant-id="${tid}"`,
    `      strategy="lazyOnload"`,
    `    />`,
    `  );`,
    `}`,
  ].join("\n");
}

export function DeploymentStudio({ tenants }: DeploymentStudioProps) {
  const [selectedTenantId, setSelectedTenantId] = useState(tenants[0]?.id ?? "");
  const [format, setFormat] = useState<SnippetFormat>("html");
  const [activePlatform, setActivePlatform] = useState<PlatformKey>("custom");
  const [copied, setCopied] = useState(false);
  const [sandboxVisible, setSandboxVisible] = useState(false);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId) ?? null;

  const snippetCode = selectedTenant
    ? format === "html"
      ? generateHtmlSnippet(selectedTenant.tenant_id || selectedTenant.id)
      : generateNextJsSnippet(selectedTenant.tenant_id || selectedTenant.id)
    : "<!-- Select a client to generate a snippet -->";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippetCode);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = snippetCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight uppercase">
          Deployment Studio
        </h1>
        <p className="text-sm text-white/50 mt-1">
          Extract script tags, select platform instructions, and preview deployment.
        </p>
      </div>

      {/* ── Tenant Selector + Format Switcher ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 p-4">
          <label className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium mb-2 block">
            Select Client
          </label>
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm tracking-wide outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2]/50 transition-all appearance-none cursor-pointer"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                {t.name} {t.category ? `(${t.category})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 p-4">
          <label className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium mb-2 block">
            Snippet Format
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormat("html")}
              className={`flex-1 px-4 py-2.5 rounded-lg border text-xs font-medium tracking-wider uppercase transition-all duration-200 ${
                format === "html"
                  ? "border-[#0097b2] bg-[#0097b2]/20 text-[#00e5ff] shadow-[0_0_10px_rgba(0,151,178,0.3)]"
                  : "border-white/20 bg-white/5 text-white/50 hover:bg-white/10"
              }`}
            >
              HTML Script
            </button>
            <button
              type="button"
              onClick={() => setFormat("nextjs")}
              className={`flex-1 px-4 py-2.5 rounded-lg border text-xs font-medium tracking-wider uppercase transition-all duration-200 ${
                format === "nextjs"
                  ? "border-[#0097b2] bg-[#0097b2]/20 text-[#00e5ff] shadow-[0_0_10px_rgba(0,151,178,0.3)]"
                  : "border-white/20 bg-white/5 text-white/50 hover:bg-white/10"
              }`}
            >
              Next.js
            </button>
          </div>
        </div>
      </div>

      {/* ── Code Snippet Card ── */}
      <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-[#0097b2]" />
            <span className="text-[10px] tracking-[0.2em] uppercase text-white/50 font-medium">
              {format === "html" ? "HTML Script Tag" : "Next.js Component"}{" "}
              &mdash; {selectedTenant?.name ?? "No client selected"}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg border text-[11px] font-medium tracking-wider uppercase transition-all duration-200 ${
              copied
                ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                : "border-[#0097b2]/50 bg-[#0097b2]/10 text-[#00e5ff] hover:bg-[#0097b2]/20 hover:shadow-[0_0_12px_rgba(0,151,178,0.3)]"
            }`}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="px-5 py-4">
          <pre className="font-mono text-xs text-emerald-400 whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
            {snippetCode}
          </pre>
        </div>
      </div>

      {/* ── Platform Instructions ── */}
      <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 p-5 space-y-3">
        <p className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium">
          Platform Setup Instructions
        </p>

        <div className="flex gap-2 mb-3">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setActivePlatform(p.key)}
              className={`px-4 py-1.5 rounded-lg border text-[11px] font-medium tracking-wider uppercase transition-all duration-200 ${
                activePlatform === p.key
                  ? "border-[#0097b2] bg-[#0097b2]/15 text-[#00e5ff]"
                  : "border-white/15 bg-white/5 text-white/50 hover:bg-white/10"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 text-xs text-white/70 leading-relaxed">
          {activePlatform === "wordpress" && (
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Log in to your WordPress admin dashboard.</li>
              <li>Navigate to <span className="text-white/90 font-medium">{"Appearance > Theme File Editor"}</span>.</li>
              <li>Open the <span className="text-white/90 font-medium">footer.php</span> template.</li>
              <li>Paste the snippet above just before the closing <code className="text-[#00e5ff]">{"</body>"}</code> tag.</li>
              <li>Save changes and clear any caching plugin.</li>
            </ol>
          )}

          {activePlatform === "shopify" && (
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Log in to your Shopify admin panel.</li>
              <li>Navigate to <span className="text-white/90 font-medium">{"Online Store > Themes > Edit code"}</span>.</li>
              <li>Open <span className="text-white/90 font-medium">theme.liquid</span> under Layout.</li>
              <li>Paste the snippet above just before the closing <code className="text-[#00e5ff]">{"</body>"}</code> tag.</li>
              <li>Click <span className="text-white/90 font-medium">Save</span> and preview your store.</li>
            </ol>
          )}

          {activePlatform === "custom" && (
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Open the HTML file where you want to install the widget.</li>
              <li>Locate the <code className="text-[#00e5ff]">{"</body>"}</code> closing tag.</li>
              <li>Paste the snippet directly above it.</li>
              <li>Deploy your site and verify the widget loads.</li>
              <li>Check the browser console for any loading errors.</li>
            </ol>
          )}
        </div>
      </div>

      {/* ── Preview Sandbox ── */}
      <div className="rounded-xl backdrop-blur-md bg-white/5 border border-white/10 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] tracking-[0.2em] uppercase text-white/40 font-medium">
            Deployment Preview
          </p>
          <button
            type="button"
            onClick={() => setSandboxVisible((v) => !v)}
            className={`px-4 py-1.5 rounded-lg border text-[11px] font-medium tracking-wider uppercase transition-all duration-200 ${
              sandboxVisible
                ? "border-[#0097b2] bg-[#0097b2]/15 text-[#00e5ff]"
                : "border-white/15 bg-white/5 text-white/50 hover:bg-white/10"
            }`}
          >
            {sandboxVisible ? "Hide Preview" : "Show Preview"}
          </button>
        </div>

        {sandboxVisible && (
          <div className="rounded-lg bg-slate-950 border border-white/10 overflow-hidden">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/10">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
              <div className="ml-3 flex-1 px-3 py-1 rounded bg-white/10 text-[10px] text-white/40 font-mono truncate">
                {selectedTenant
                  ? `https://${(selectedTenant.tenant_id || selectedTenant.id).slice(0, 12)}.ovg.co.za`
                  : "https://your-site.example.com"}
              </div>
            </div>
            {/* Content */}
            <div className="px-6 py-10 text-center">
              <p className="text-white/30 text-sm font-medium tracking-widest uppercase">
                Widget Sandbox
              </p>
              <p className="text-white/20 text-xs mt-2 max-w-md mx-auto">
                This preview frame simulates a live deployment. The AI widget would render
                at the bottom-right corner of this frame in a production environment.
              </p>
              <div className="mt-6 inline-block px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-mono text-[#0097b2]">
                tenant_id: {selectedTenant?.tenant_id || selectedTenant?.id || "none"}
              </div>
            </div>
          </div>
        )}

        {!sandboxVisible && (
          <p className="text-[10px] text-white/30">
            Click &ldquo;Show Preview&rdquo; to visualize the deployment sandbox.
          </p>
        )}
      </div>

      {/* ── Empty State ── */}
      {tenants.length === 0 && (
        <div className="flex items-center justify-center min-h-[200px] rounded-xl backdrop-blur-md bg-white/5 border border-white/10">
          <div className="text-center space-y-2">
            <p className="text-white/40 text-sm font-medium tracking-widest uppercase">
              No clients found
            </p>
            <p className="text-white/20 text-xs">
              Add a client first to generate deployment snippets.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}