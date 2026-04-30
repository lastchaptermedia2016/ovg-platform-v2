"use client";

import { Sparkles, ArrowRight, Zap, Bot, BarChart3, AlertCircle } from "lucide-react";

interface EmptyStateProps {
  primaryColor: string;
  accentColor: string;
  resellerSlug: string;
  type?: "no-clients" | "tenant-not-found";
}

export function EmptyState({ 
  primaryColor, 
  accentColor,
  resellerSlug,
  type = "no-clients"
}: EmptyStateProps) {
  if (type === "tenant-not-found") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        {/* Icon */}
        <div className="relative mb-8">
          <div 
            className="w-24 h-24 rounded-3xl flex items-center justify-center"
            style={{ 
              background: `linear-gradient(135deg, ${primaryColor}20, ${accentColor}20)`,
              border: `2px solid ${primaryColor}30`
            }}
          >
            <AlertCircle 
              className="w-12 h-12"
              style={{ color: primaryColor }}
            />
          </div>
        </div>

        {/* Text Content */}
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-3">
          Tenant Not Found
        </h2>
        <p className="text-gray-500 text-center max-w-md mb-8 leading-relaxed">
          The reseller "{resellerSlug}" could not be found or may not be active.
          Please check the URL and try again.
        </p>

        {/* Primary CTA */}
        <a
          href="/dashboard"
          className="group inline-flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-white transition-all duration-300 hover:shadow-xl hover:scale-105 active:scale-95"
          style={{ 
            background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`
          }}
        >
          <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          Return to Dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-10 blur-3xl"
          style={{ backgroundColor: primaryColor }}
        />
        <div 
          className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full opacity-10 blur-3xl"
          style={{ backgroundColor: accentColor }}
        />
      </div>

      {/* Icon */}
      <div className="relative mb-8">
        <div 
          className="w-24 h-24 rounded-3xl flex items-center justify-center"
          style={{ 
            background: `linear-gradient(135deg, ${primaryColor}20, ${accentColor}20)`,
            border: `2px solid ${primaryColor}30`
          }}
        >
          <Sparkles 
            className="w-12 h-12"
            style={{ color: primaryColor }}
          />
        </div>
        
        {/* Floating decoration */}
        <div 
          className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: accentColor }}
        >
          <Zap className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Text Content */}
      <h2 className="text-3xl font-bold text-gray-900 text-center mb-3">
        No Clients Yet
      </h2>
      <p className="text-gray-500 text-center max-w-md mb-8 leading-relaxed">
        Your reseller dashboard is ready. Create your first AI agent to start
        serving businesses with intelligent voice and chat solutions.
      </p>

      {/* Features Preview */}
      <div className="grid grid-cols-3 gap-4 mb-8 max-w-lg">
        <FeaturePreview 
          icon={Bot}
          label="AI Agents"
          color={primaryColor}
        />
        <FeaturePreview 
          icon={BarChart3}
          label="Analytics"
          color={primaryColor}
        />
        <FeaturePreview 
          icon={Zap}
          label="Voice AI"
          color={accentColor}
        />
      </div>

      {/* Primary CTA */}
      <a
        href={`/reseller/${resellerSlug}/clients/new`}
        className="group inline-flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-white transition-all duration-300 hover:shadow-xl hover:scale-105 active:scale-95"
        style={{ 
          background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`
        }}
      >
        <Sparkles className="w-5 h-5" />
        Create Your First Agent
        <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
      </a>

      {/* Secondary Link */}
      <p className="mt-6 text-sm text-gray-400">
        Need help getting started?{" "}
        <a 
          href="#" 
          className="hover:underline transition-colors"
          style={{ color: primaryColor }}
        >
          View documentation
        </a>
      </p>
    </div>
  );
}

function FeaturePreview({ 
  icon: Icon, 
  label, 
  color 
}: { 
  icon: typeof Bot; 
  label: string; 
  color: string;
}) {
  return (
    <div 
      className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200 hover:scale-105"
      style={{ backgroundColor: `${color}10` }}
    >
      <Icon 
        className="w-6 h-6"
        style={{ color }}
      />
      <span className="text-xs font-medium text-gray-600">
        {label}
      </span>
    </div>
  );
}
