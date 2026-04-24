'use client';

import { useState } from 'react';
import { DollarSign, CreditCard, TrendingUp, ArrowRight, CheckCircle } from 'lucide-react';

interface PaymentsTabProps {
  isOnboarded: boolean;
  stripeConnectId: string | null;
  resellerId: string;
  onConnectStripe?: () => void;
}

export default function PaymentsTab({
  isOnboarded,
  stripeConnectId,
  resellerId,
  onConnectStripe,
}: PaymentsTabProps) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showPricingEditor, setShowPricingEditor] = useState(false);
  const [tierPricing, setTierPricing] = useState({
    basic: 99,
    pro: 199,
    enterprise: 499,
  });

  const handleConnectStripe = async () => {
    setLoading(true);
    try {
      // Call API to get onboarding link
      const response = await fetch('/api/stripe/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resellerId }),
      });

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Failed to connect Stripe:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManageStripe = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stripe/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeConnectId }),
      });

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Failed to open Stripe dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPricing = async () => {
    if (!stripeConnectId) {
      console.error('No Stripe Connect ID found');
      return;
    }

    setSyncing(true);
    try {
      const response = await fetch('/api/stripe/sync-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resellerId,
          stripeConnectId,
          tierPricing,
        }),
      });

      const { success, priceIds } = await response.json();
      if (success) {
        console.log('Pricing synced successfully:', priceIds);
        setShowPricingEditor(false);
      }
    } catch (error) {
      console.error('Failed to sync pricing:', error);
    } finally {
      setSyncing(false);
    }
  };

  // State 1: Unboarded
  if (!isOnboarded) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-[#0097b2] to-[#226683] rounded-2xl p-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="w-8 h-8" />
            <h2 className="text-2xl font-bold">Start Earning</h2>
          </div>
          <p className="text-white/90 mb-6 max-w-lg">
            Connect your Stripe account to start receiving payments from your clients. 
            Set up your bank information and start earning revenue today.
          </p>
          <button
            onClick={handleConnectStripe}
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#0097b2] font-semibold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#0097b2]" />
                Connecting...
              </>
            ) : (
              <>
                Connect Stripe
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <CreditCard className="w-6 h-6 text-[#0097b2] mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">Secure Payments</h3>
            <p className="text-sm text-gray-600">Industry-standard security for all transactions</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <TrendingUp className="w-6 h-6 text-[#0097b2] mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">Instant Payouts</h3>
            <p className="text-sm text-gray-600">Get paid quickly with flexible payout options</p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200">
            <CheckCircle className="w-6 h-6 text-[#0097b2] mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">Easy Setup</h3>
            <p className="text-sm text-gray-600">Onboard in minutes with guided setup</p>
          </div>
        </div>
      </div>
    );
  }

  // State 2: Onboarded
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Payouts Dashboard</h2>
        <button
          onClick={handleManageStripe}
          disabled={loading}
          className="px-4 py-2 bg-[#0097b2] text-white rounded-lg font-medium hover:bg-[#007a8f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Manage Stripe'}
        </button>
      </div>

      {/* Payout Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">Total Revenue</p>
          <p className="text-3xl font-bold text-gray-900">$12,450</p>
          <p className="text-sm text-green-600 mt-2">+15% from last month</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">Pending Payouts</p>
          <p className="text-3xl font-bold text-gray-900">$2,340</p>
          <p className="text-sm text-gray-500 mt-2">Next payout in 2 days</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">Active Subscriptions</p>
          <p className="text-3xl font-bold text-gray-900">8</p>
          <p className="text-sm text-gray-500 mt-2">Across all tiers</p>
        </div>
      </div>

      {/* Edit Pricing Tiers */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">Pricing Tiers</h3>
          <button
            onClick={() => setShowPricingEditor(!showPricingEditor)}
            className="text-sm text-[#0097b2] hover:text-[#007a8f] transition-colors"
          >
            {showPricingEditor ? 'Cancel' : 'Edit Pricing'}
          </button>
        </div>

        {showPricingEditor && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['basic', 'pro', 'enterprise'] as const).map((tier) => (
                <div key={tier} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 capitalize">
                    {tier}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      value={tierPricing[tier]}
                      onChange={(e) => setTierPricing({ ...tierPricing, [tier]: Number(e.target.value) })}
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent"
                      placeholder="99"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleSyncPricing}
                disabled={syncing}
                className="px-4 py-2 bg-[#0097b2] text-white rounded-lg font-medium hover:bg-[#007a8f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {syncing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Syncing...
                  </>
                ) : (
                  'Sync to Stripe'
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Subscriptions */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Active Subscriptions</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Plan
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                Acme Corp
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                Enterprise
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                $499/mo
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                  Active
                </span>
              </td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                Beta Inc
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                Pro
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                $199/mo
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                  Active
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
