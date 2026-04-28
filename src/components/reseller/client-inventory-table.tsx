"use client";

import { ResellerClient } from "@/lib/db/reseller-clients";
import { 
  Users, 
  Activity, 
  Palette, 
  Calendar,
  ArrowRight,
  Copy,
  Check
} from "lucide-react";
import { useState } from "react";

interface ClientInventoryTableProps {
  clients: ResellerClient[];
  primaryColor: string;
  accentColor: string;
}

export function ClientInventoryTable({ 
  clients, 
  primaryColor, 
  accentColor 
}: ClientInventoryTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-transparent">
      {/* Table Header */}
      <div className="border-b border-white/10 bg-white/5 px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Client Inventory
          </h2>
          <span className="text-sm text-white/60">
            {clients.length} {clients.length === 1 ? "client" : "clients"}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Client Name
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                Tenant ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Status
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Branding
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Created
                </div>
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-white/70 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {clients.map((client) => (
              <tr 
                key={client.id} 
                className="hover:bg-white/5 transition-colors"
              >
                {/* Client Name */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
                      style={{ backgroundColor: client.branding_colors?.primary || primaryColor }}
                    >
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-white">
                        {client.name}
                      </p>
                      <p className="text-xs text-white/60">
                        {client.voice_id ? "Voice Enabled" : "Text Only"}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Tenant ID */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-white/80">
                      {client.tenant_id}
                    </code>
                    <button
                      onClick={() => copyToClipboard(client.tenant_id, client.id)}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                      title="Copy Tenant ID"
                    >
                      {copiedId === client.id ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-white/40" />
                      )}
                    </button>
                  </div>
                </td>

                {/* Status */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      client.is_active
                        ? "bg-green-500/20 text-green-400"
                        : "bg-white/10 text-white/60"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                        client.is_active ? "bg-green-400" : "bg-white/40"
                      }`}
                    />
                    {client.is_active ? "Active" : "Inactive"}
                  </span>
                </td>

                {/* Branding Color */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded border border-white/20 shadow-sm"
                      style={{ backgroundColor: client.branding_colors?.primary || primaryColor }}
                      title={client.branding_colors?.primary || primaryColor}
                    />
                    <span className="text-xs text-white/60 font-mono">
                      {client.branding_colors?.primary || primaryColor}
                    </span>
                  </div>
                </td>

                {/* Created Date */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-white/60">
                  {formatDate(client.created_at.toString())}
                </td>

                {/* Actions */}
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <a
                    href={`/widget/${client.tenant_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 hover:shadow-md"
                    style={{ 
                      color: primaryColor,
                      backgroundColor: `${primaryColor}20`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${primaryColor}30`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = `${primaryColor}20`;
                    }}
                  >
                    View Widget
                    <ArrowRight className="w-3 h-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
