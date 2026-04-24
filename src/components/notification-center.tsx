"use client";

import { useEffect, useState, useCallback } from "react";
import { 
  subscribeToResellerAlerts, 
  getRecentAlerts, 
  acknowledgeAlert,
  AlertPayload 
} from "@/lib/realtime-alerts";
import { 
  Bell, 
  AlertTriangle, 
  DollarSign, 
  User, 
  Flame, 
  X,
  ExternalLink,
  CheckCircle2,
  Clock
} from "lucide-react";

interface NotificationCenterProps {
  resellerId: string;
  primaryColor?: string;
}

export function NotificationCenter({ 
  resellerId, 
  primaryColor = "#0097b2" 
}: NotificationCenterProps) {
  const [alerts, setAlerts] = useState<AlertPayload[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
    loadInitialAlerts();
  }, [resellerId]);

  // Subscribe to realtime alerts
  useEffect(() => {
    if (!resellerId) return;

    const unsubscribe = subscribeToResellerAlerts(resellerId, (newAlert) => {
      setAlerts((prev) => [newAlert, ...prev]);
      setPendingCount((prev) => prev + 1);
      
      // Show browser notification if permitted
      if (Notification.permission === "granted" && newAlert.severity === "critical") {
        new Notification("🚨 Hot Lead Alert!", {
          body: `User asking about "${newAlert.trigger_word}" - Click to jump in`,
          icon: "/logo.png",
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [resellerId]);

  const loadInitialAlerts = async () => {
    const recent = await getRecentAlerts(resellerId, 10, "pending");
    setAlerts(recent);
    setPendingCount(recent.length);
  };

  const handleAcknowledge = async (alertId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await acknowledgeAlert(alertId, resellerId);
    if (success) {
      setAlerts((prev) => prev.filter((a) => a.conversation_id !== alertId));
      setPendingCount((prev) => Math.max(0, prev - 1));
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Flame className="w-5 h-5 text-red-500" />;
      case "high":
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case "medium":
        return <DollarSign className="w-5 h-5 text-yellow-500" />;
      default:
        return <Bell className="w-5 h-5 text-blue-500" />;
    }
  };

  const getIntentLabel = (type: string) => {
    const labels: Record<string, string> = {
      pricing: "💰 Pricing Query",
      frustration: "😤 Frustrated User",
      human_request: "👤 Human Requested",
      sales_opportunity: "🎯 Hot Lead",
      complaint: "⚠️ Complaint",
      urgent: "🚨 Urgent",
    };
    return labels[type] || type;
  };

  if (!mounted) return null;

  return (
    <div className="relative">
      {/* Bell Icon with Badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-6 h-6" style={{ color: primaryColor }} />
        {pendingCount > 0 && (
          <span 
            className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center text-xs font-bold text-white rounded-full animate-pulse"
            style={{ backgroundColor: "#ef4444" }}
          >
            {pendingCount > 9 ? "9+" : pendingCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
          {/* Header */}
          <div 
            className="px-4 py-3 border-b flex items-center justify-between"
            style={{ borderColor: `${primaryColor}20` }}
          >
            <h3 className="font-semibold text-gray-900">Hot Leads & Alerts</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Alert List */}
          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 text-sm">No active alerts</p>
                <p className="text-gray-400 text-xs mt-1">
                  Intent detection alerts will appear here
                </p>
              </div>
            ) : (
              alerts.map((alert, index) => (
                <div
                  key={alert.conversation_id + index}
                  className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer group"
                  onClick={() => {
                    window.open(alert.deep_link, "_blank");
                    setIsOpen(false);
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Severity Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {getSeverityIcon(alert.severity)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100">
                          {getIntentLabel(alert.intent_type)}
                        </span>
                        <span className="text-xs text-gray-400">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <p className="text-sm text-gray-900 font-medium mb-1">
                        Trigger: &quot;{alert.trigger_word}&quot;
                      </p>

                      <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                        {alert.message_preview}
                      </p>

                      {/* Action Bar */}
                      <div className="flex items-center gap-2">
                        <span 
                          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600"
                        >
                          Confidence: {Math.round(alert.confidence * 100)}%
                        </span>

                        <button
                          onClick={(e) => handleAcknowledge(alert.conversation_id, e)}
                          className="ml-auto text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
                          title="Acknowledge alert"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Ack
                        </button>

                        <a
                          href={alert.deep_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs flex items-center gap-1 px-2 py-1 rounded font-medium text-white hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Jump In
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {alerts.length > 0 && (
            <div className="px-4 py-2 border-t bg-gray-50 text-center">
              <button
                onClick={() => {
                  setIsOpen(false);
                  window.open(`/dashboard/reseller/${resellerId}/alerts`, "_blank");
                }}
                className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                View all alerts →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Toast notification for critical alerts
 */
export function AlertToast({ 
  alert, 
  onDismiss, 
  onJumpIn,
  primaryColor = "#0097b2"
}: { 
  alert: AlertPayload; 
  onDismiss: () => void;
  onJumpIn: () => void;
  primaryColor?: string;
}) {
  return (
    <div className="fixed top-4 right-4 w-96 bg-white rounded-xl shadow-2xl border-2 border-red-500 p-4 z-50 animate-in slide-in-from-right">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
          <Flame className="w-5 h-5 text-red-500" />
        </div>
        
        <div className="flex-1">
          <h4 className="font-bold text-gray-900 mb-1">
            🚨 Hot Lead Alert!
          </h4>
          <p className="text-sm text-gray-700 mb-2">
            User is asking about &quot;{alert.trigger_word}&quot;
          </p>
          <p className="text-xs text-gray-500 mb-3">
            {alert.message_preview}
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={onJumpIn}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: primaryColor }}
            >
              Click to Jump In →
            </button>
            <button
              onClick={onDismiss}
              className="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
