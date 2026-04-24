'use client';

import { useState } from 'react';
import { BrandKit } from '@/components/reseller/BrandKit';
import { ClientPolicyManager } from '@/components/reseller/ClientPolicyManager';
import { ActivityStream } from '@/components/reseller/ActivityStream';
import { TrendChart } from '@/components/reseller/TrendChart';
import { TopPerformers } from '@/components/reseller/TopPerformers';
import { ActivityMap } from '@/components/reseller/ActivityMap';
import { AIInsight } from '@/components/reseller/AIInsight';
import { LivePreview } from '@/components/reseller/LivePreview';
import { ColorPicker } from '@/components/reseller/ColorPicker';
import { BrandKitProvider, useBrandKit } from '@/contexts/BrandKitContext';
import { ResellerClient } from '@/lib/db/reseller-clients';
import { Users, Activity, Heart, Settings, X, Car } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  icon: typeof Users;
  color: string;
}

function ClientRow({ client, onManage, isDealership, onToggleDealership }: { client: ResellerClient; onManage: (client: ResellerClient) => void; isDealership: boolean; onToggleDealership: (clientId: string) => void }) {
  const getIndustryBadge = () => {
    if (isDealership) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#226683]/20 text-[#226683] border border-[#226683]/30 shadow-[0_0_8px_rgba(34,102,131,0.3)]">
          AUTO
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#0097b2]/20 text-[#0097b2] border border-[#0097b2]/30 shadow-[0_0_8px_rgba(0,151,178,0.3)]">
        SaaS
      </span>
    );
  };

  return (
    <tr className="hover:bg-white/10 transition-colors backdrop-blur-xl hover:shadow-[0_0_15px_rgba(0,151,178,0.2)]">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-white">{client.name}</div>
          {getIndustryBadge()}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-white/20 text-white">
          {client.pricing_tier_key || 'N/A'}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="group relative inline-flex items-center gap-2">
          <span
            className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
              client.is_active
                ? 'bg-green-500/20 text-green-300'
                : 'bg-red-500/20 text-red-300'
            }`}
          >
            {client.is_active ? 'Active' : 'Inactive'}
          </span>
          {client.is_active && (
            <>
              <div className="relative flex items-center justify-center">
                <span className="absolute inline-flex h-2 w-2 rounded-full bg-[#0097b2] opacity-75 animate-ping duration-[3000ms]" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0097b2]" />
              </div>
              {/* Tooltip */}
              <div className="absolute left-0 top-full mt-2 px-2 py-1 bg-black/80 backdrop-blur-sm rounded text-[10px] text-white/80 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                System Health: 100%
              </div>
            </>
          )}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={isDealership}
              onChange={() => onToggleDealership(client.id)}
              className="sr-only"
            />
            <div className={`w-10 h-5 rounded-full transition-colors ${isDealership ? 'bg-[#0097b2]' : 'bg-white/20'}`}>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isDealership ? 'translate-x-5' : ''}`} />
            </div>
          </div>
          <span className="text-xs text-white/60">Dealership</span>
        </label>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <button
          onClick={() => onManage(client)}
          className="text-[#0097b2] hover:text-[#007a8f] transition-colors"
        >
          Manage
        </button>
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 mb-6">
        <Users className="w-10 h-10 text-white/30" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-3 tracking-tight">No clients yet</h3>
      <p className="text-sm text-white/50 max-w-sm mx-auto">Initialize your client portfolio by adding your first client to begin tracking performance.</p>
    </div>
  );
}

function LeadActivityFeed() {
  const mockLeads = [
    { name: 'John Smith', vehicle: '2024 Tesla Model 3', sentiment: 'positive', time: '2 min ago' },
    { name: 'Sarah Johnson', vehicle: '2023 BMW X5', sentiment: 'neutral', time: '15 min ago' },
    { name: 'Mike Davis', vehicle: '2024 Ford F-150', sentiment: 'positive', time: '1 hr ago' },
    { name: 'Emily Chen', vehicle: '2023 Mercedes C-Class', sentiment: 'negative', time: '2 hrs ago' },
  ];

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '#d4af37'; // Gold
      case 'negative': return '#ef4444'; // Red
      default: return '#0097b2'; // Electric Blue
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-white mb-4 tracking-tight flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        Active Leads
      </h3>
      <div className="space-y-2">
        {mockLeads.map((lead, index) => (
          <div key={index} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getSentimentColor(lead.sentiment) }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate">{lead.name}</p>
              <p className="text-[10px] text-white/50 truncate">{lead.vehicle}</p>
            </div>
            <span className="text-[10px] text-white/40 whitespace-nowrap">{lead.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color }: MetricCardProps) {
  return (
    <div
      className="p-6 rounded-xl border border-white/10 shadow-2xl transition-all duration-200 hover:shadow-2xl bg-white/5"
      style={{ backdropFilter: 'blur(12px)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className="p-3 rounded-lg bg-white/20"
        >
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-white/70">{title}</p>
    </div>
  );
}

interface DashboardClientProps {
  initialClients: ResellerClient[];
  initialMetrics: {
    totalClients: string;
    activeSubscriptions: string;
    systemHealth: string;
  };
  resellerId: string;
}

function DashboardClientContent({ initialClients, initialMetrics, resellerId }: DashboardClientProps) {
  const { template, setTemplate, botPersonality, setBotPersonality, primaryColor, setPrimaryColor, secondaryColor, setSecondaryColor, customDirectives, setCustomDirectives } = useBrandKit();
  const [siteUrl, setSiteUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [unreadTickets, setUnreadTickets] = useState(3); // Mock unread count
  const [urgentTicketType, setUrgentTicketType] = useState<'tech' | 'marketing'>('tech'); // Mock highest priority type

  // Auto-select bot personality based on template
  const handleTemplateChange = (newTemplate: 'general' | 'automotive') => {
    setTemplate(newTemplate);
    if (newTemplate === 'automotive') {
      setBotPersonality('aggressive');
    } else {
      setBotPersonality('professional');
    }
  };

  // Mock brand extraction logic
  const handleFetchColors = async () => {
    if (!siteUrl) return;
    
    setIsExtracting(true);
    setExtractionStatus('idle');

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock extraction - in production, this would call a backend scraper
    // For now, we'll extract some colors based on the URL hash
    const mockColors = {
      primary: '#0097b2',
      secondary: '#226683',
    };

    setPrimaryColor(mockColors.primary);
    setSecondaryColor(mockColors.secondary);
    setExtractionStatus('success');
    setIsExtracting(false);
  };
  const [activeTab, setActiveTab] = useState<'overview' | 'clients' | 'brand-kit' | 'service-desk'>('overview');
  const [selectedClient, setSelectedClient] = useState<ResellerClient | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addClientModalOpen, setAddClientModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientSubdomain, setNewClientSubdomain] = useState('');
  const [newClientPricingTier, setNewClientPricingTier] = useState('basic');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientMobile, setNewClientMobile] = useState('');
  const [newClientWebsite, setNewClientWebsite] = useState('');
  const [newClientIndustry, setNewClientIndustry] = useState('');
  const [dealershipMode, setDealershipMode] = useState<Record<string, boolean>>({
    'client-1': true,  // Apex Motors
    'client-3': true,  // Premier Auto Group
  });
  const [carLeads, setCarLeads] = useState(0);
  const [offlineAdjustments, setOfflineAdjustments] = useState<Record<string, number>>({});
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  const industries = [
    "Automotive / Dealership",
    "Real Estate",
    "Retail / E-commerce",
    "Medical / Healthcare",
    "Professional Services",
    "Technology / SaaS"
  ];

  // Mock client data for demonstration
  const mockClients: ResellerClient[] = [
    {
      id: 'client-1',
      tenant_id: 'tenant-1',
      name: 'Apex Motors',
      reseller_id: resellerId,
      pricing_tier_key: 'enterprise',
      is_active: true,
      custom_assets: null,
      branding_colors: null,
      show_ovg_branding: false,
      voice_id: null,
      system_prompt: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'client-2',
      tenant_id: 'tenant-2',
      name: 'TechFlow SaaS',
      reseller_id: resellerId,
      pricing_tier_key: 'pro',
      is_active: true,
      custom_assets: null,
      branding_colors: null,
      show_ovg_branding: false,
      voice_id: null,
      system_prompt: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'client-3',
      tenant_id: 'tenant-3',
      name: 'Premier Auto Group',
      reseller_id: resellerId,
      pricing_tier_key: 'enterprise',
      is_active: true,
      custom_assets: null,
      branding_colors: null,
      show_ovg_branding: false,
      voice_id: null,
      system_prompt: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const [clients, setClients] = useState(initialClients.length > 0 ? initialClients : mockClients);
  const [metrics, setMetrics] = useState(initialMetrics);

  const handleManageClient = (client: ResellerClient) => {
    setSelectedClient(client);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedClient(null);
  };

  const handlePolicyUpdate = () => {
    // Refetch client data to update table
    // In production, this would trigger a server action or revalidation
    setClients([...clients]);
  };

  const handleToggleDealership = (clientId: string) => {
    setDealershipMode(prev => ({
      ...prev,
      [clientId]: !prev[clientId]
    }));
  };

  const handleAddClient = () => {
    if (!newClientName || !newClientSubdomain) return;

    const newClient: ResellerClient = {
      id: `client-${Date.now()}`,
      tenant_id: `tenant-${Date.now()}`,
      name: newClientName,
      reseller_id: resellerId,
      pricing_tier_key: newClientPricingTier,
      is_active: true,
      custom_assets: null,
      branding_colors: null,
      show_ovg_branding: false,
      voice_id: null,
      system_prompt: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Store industry-specific metadata
    const metadata: Record<string, any> = {
      industry: newClientIndustry,
      email: newClientEmail,
      mobile: newClientMobile,
      website: newClientWebsite,
    };

    // If dealership, add dealership-specific template settings
    if (newClientIndustry === 'Automotive / Dealership') {
      metadata.template = 'sales-lead';
      metadata.inventory_url = '';
      metadata.lead_capture_enabled = true;
      setCarLeads(prev => prev + 1);
    }

    setClients([...clients, newClient]);
    setNewClientName('');
    setNewClientSubdomain('');
    setNewClientPricingTier('basic');
    setNewClientEmail('');
    setNewClientMobile('');
    setNewClientWebsite('');
    setNewClientIndustry('');
    setAddClientModalOpen(false);
  };

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'clients' as const, label: 'Clients' },
    { id: 'brand-kit' as const, label: 'Brand Kit' },
    { id: 'service-desk' as const, label: 'Service Desk' },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-white/10 border-b border-white/20 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-baseline space-x-6">
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-black tracking-tighter text-white">PULSE</span>
                <span className="text-2xl font-black text-[#d4af37] animate-pulse-gold">AI</span>
              </div>

              {/* The Separator Line */}
              <div className="h-6 w-[1px] bg-white/20 mx-2" />

              <span className="text-lg font-light tracking-[0.2em] text-white/60 uppercase">
                Reseller Dashboard
              </span>
            </div>
            <button className="p-2 rounded-lg hover:bg-white/20 transition-colors hover:text-[#d4af37]">
              <Settings className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white/10 border-b border-white/20 backdrop-blur-xl sticky top-16 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'service-desk') {
                    setUnreadTickets(0); // Auto-clear on click
                  }
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors relative ${
                  activeTab === tab.id
                    ? 'border-[#0097b2] text-[#0097b2]'
                    : 'border-transparent text-white/70 hover:text-white hover:border-white/30'
                }`}
              >
                {tab.label}
                {tab.id === 'service-desk' && unreadTickets > 0 && (
                  <div className="absolute -top-1 -right-2">
                    <span 
                      className="absolute inline-flex h-3 w-3 rounded-full opacity-75 animate-ping"
                      style={{ backgroundColor: urgentTicketType === 'tech' ? '#ef4444' : '#d4af37' }}
                    />
                    <span 
                      className="relative inline-flex rounded-full h-3 w-3 text-[9px] text-white items-center justify-center font-bold"
                      style={{ backgroundColor: urgentTicketType === 'tech' ? '#ef4444' : '#d4af37' }}
                    >
                      {unreadTickets}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6 mt-20">
            <h2 className="text-lg font-semibold text-white">Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <MetricCard
                title="Total Clients"
                value={metrics.totalClients}
                icon={Users}
                color="#0097b2"
              />
              <MetricCard
                title="Active Subscriptions"
                value={metrics.activeSubscriptions}
                icon={Activity}
                color="#0097b2"
              />
              <MetricCard
                title="Active Car Leads"
                value={carLeads.toString()}
                icon={Car}
                color="#0097b2"
              />
              <MetricCard
                title="System Health"
                value={metrics.systemHealth}
                icon={Heart}
                color="#0097b2"
              />
            </div>

            {/* Client Portfolio Section */}
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-semibold tracking-tight text-white">Client Portfolio</h2>
              <button onClick={() => setAddClientModalOpen(true)} className="px-6 py-2 border-2 border-[#0097b2] text-white font-bold rounded-full hover:bg-[#0097b2]/20 transition-all shadow-[0_0_15px_rgba(0,151,178,0.3)]">
                + Add Client
              </button>
            </div>

            {/* Client List and Activity Stream Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Client Portfolio - Left (8 columns) */}
              <div className="lg:col-span-8">
                <div className="bg-black/10 backdrop-blur-xl rounded-lg border border-white/10 shadow-2xl overflow-hidden">
                  {clients.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <table className="min-w-full divide-y divide-white/10">
                      <thead className="bg-white/10">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                            Pricing Tier
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                            Dealership
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-white/70 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white/5 divide-y divide-white/10">
                        {clients.map((client) => (
                          <ClientRow key={client.id} client={client} onManage={handleManageClient} isDealership={dealershipMode[client.id] || false} onToggleDealership={handleToggleDealership} />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Activity Stream - Right (4 columns) */}
              <div className="lg:col-span-4 space-y-6">
                <AIInsight />
                <ActivityStream />
                <TopPerformers />
                <ActivityMap />
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-white mb-4 tracking-tight">Growth Pulse</h3>
                  <TrendChart
                    data={[
                      { name: 'Mon', mrr: 15000, leads: 12 },
                      { name: 'Tue', mrr: 24000, leads: 19 },
                      { name: 'Wed', mrr: 18000, leads: 15 },
                      { name: 'Thu', mrr: 32000, leads: 25 },
                      { name: 'Fri', mrr: 28000, leads: 22 },
                      { name: 'Sat', mrr: 38000, leads: 30 },
                      { name: 'Sun', mrr: 35000, leads: 28 },
                    ]}
                  />
                  <div className="flex items-center justify-center gap-6 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#0097b2', filter: 'drop-shadow(0 0 4px #0097b2)' }} />
                      <span className="text-xs text-white/60">MRR</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#226683', filter: 'drop-shadow(0 0 4px #226683)' }} />
                      <span className="text-xs text-white/60">Leads</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Client Portfolio</h2>
              <button onClick={() => setAddClientModalOpen(true)} className="px-6 py-2 border-2 border-[#0097b2] text-white font-bold rounded-full hover:bg-[#0097b2]/20 transition-all shadow-[0_0_15px_rgba(0,151,178,0.3)]">
                + Add Client
              </button>
            </div>
            <div className="bg-black/10 backdrop-blur-xl rounded-lg border border-white/10 shadow-2xl overflow-hidden">
              {clients.length === 0 ? (
                <EmptyState />
              ) : (
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-white/10">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                        Pricing Tier
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                        Dealership
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-white/70 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-slate-950/30 divide-y divide-white/10">
                    {clients.map((client) => (
                      <ClientRow key={client.id} client={client} onManage={handleManageClient} isDealership={dealershipMode[client.id] || false} onToggleDealership={handleToggleDealership} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'service-desk' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Service Desk</h2>
              <div className="flex gap-2">
                <select className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0097b2]">
                  <option value="all">All Categories</option>
                  <option value="seo">SEO</option>
                  <option value="dev">Dev</option>
                  <option value="marketing">Marketing</option>
                  <option value="widget">Widget</option>
                </select>
                <select className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0097b2]">
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="in-progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </div>

            {/* Request Cards */}
            <div className="space-y-4">
              {[
                { id: 1, client: 'Apex Motors', category: 'Dev', status: 'Open', urgency: 'high', timestamp: '2 hours ago', description: 'Widget not loading on mobile devices' },
                { id: 2, client: 'Premier Auto Group', category: 'Marketing', status: 'In Progress', urgency: 'medium', timestamp: '5 hours ago', description: 'Need updated lead tracking integration' },
                { id: 3, client: 'TechFlow SaaS', category: 'SEO', status: 'Resolved', urgency: 'low', timestamp: '1 day ago', description: 'Meta tags not updating correctly' },
                { id: 4, client: 'Apex Motors', category: 'Widget', status: 'Open', urgency: 'high', timestamp: '3 hours ago', description: 'Chat widget positioning issue on homepage' },
              ].map((request) => (
                <div
                  key={request.id}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-5 hover:bg-white/10 transition-colors"
                  style={{
                    boxShadow: request.urgency === 'high' ? '0 0 15px rgba(0,151,178,0.2)' : 
                              request.urgency === 'medium' ? '0 0 15px rgba(212,175,55,0.2)' : 'none'
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-[10px] font-medium ${
                        request.category === 'Dev' ? 'bg-[#0097b2]/20 text-[#0097b2]' :
                        request.category === 'Marketing' ? 'bg-[#d4af37]/20 text-[#d4af37]' :
                        request.category === 'SEO' ? 'bg-[#226683]/20 text-[#226683]' :
                        'bg-white/20 text-white'
                      }`}>
                        {request.category}
                      </span>
                      <span className={`px-2 py-1 rounded text-[10px] font-medium ${
                        request.status === 'Open' ? 'bg-red-500/20 text-red-300' :
                        request.status === 'In Progress' ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-green-500/20 text-green-300'
                      }`}>
                        {request.status}
                      </span>
                    </div>
                    <span className="text-xs text-white/50">{request.timestamp}</span>
                  </div>
                  <div className="mb-2">
                    <p className="text-sm font-medium text-white">{request.client}</p>
                    <p className="text-xs text-white/70 mt-1">{request.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'brand-kit' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white">Brand Kit</h2>
            
            {/* Auto-Sync Site Identity */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white mb-4 tracking-tight">Auto-Sync Site Identity</h3>
              <div className="flex gap-3">
                <input
                  type="url"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder="https://your-dealership.com"
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#0097b2]"
                />
                <button
                  onClick={handleFetchColors}
                  disabled={isExtracting || !siteUrl}
                  className="px-6 py-3 bg-[#0097b2]/20 border border-[#0097b2] rounded-lg text-[#0097b2] font-medium hover:bg-[#0097b2]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExtracting ? 'Extracting...' : 'Fetch Colors'}
                </button>
              </div>
              {extractionStatus === 'success' && (
                <div className="mt-3 flex items-center gap-2 text-xs text-green-400">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  Identity Extracted Successfully
                </div>
              )}
            </div>

            <BrandKit
              resellerId={resellerId}
              initialHeaderUrl={null}
              initialFooterUrl={null}
            />
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white mb-4 tracking-tight">Color Theme</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ColorPicker
                  label="Primary Brand Color"
                  value={primaryColor}
                  onChange={setPrimaryColor}
                />
                <ColorPicker
                  label="Secondary Accent"
                  value={secondaryColor}
                  onChange={setSecondaryColor}
                />
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white mb-4 tracking-tight">Template Selector</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <button
                  onClick={() => handleTemplateChange('general')}
                  className={`p-4 border rounded-lg transition-colors text-left ${
                    template === 'general'
                      ? 'bg-[#0097b2]/20 border-[#0097b2] text-white'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <p className="text-sm font-medium">General</p>
                  <p className="text-xs text-white/50 mt-1">Universal AI assistant</p>
                </button>
                <button
                  onClick={() => handleTemplateChange('automotive')}
                  className={`p-4 border rounded-lg transition-colors text-left ${
                    template === 'automotive'
                      ? 'bg-[#226683]/20 border-[#226683] text-white'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <p className="text-sm font-medium">Automotive</p>
                  <p className="text-xs text-white/50 mt-1">Inventory & trade-in focus</p>
                </button>
              </div>
              {template === 'automotive' && (
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <p className="text-xs text-white/70 mb-2">Default Bot Greeting:</p>
                  <p className="text-sm text-white italic">
                    "Welcome! I can help you browse our inventory, schedule test drives, and discuss trade-in options. What vehicle are you interested in today?"
                  </p>
                </div>
              )}
            </div>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white mb-4 tracking-tight">Bot Personality</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setBotPersonality('professional')}
                  className={`p-4 border rounded-lg transition-colors text-left ${
                    botPersonality === 'professional'
                      ? 'bg-[#0097b2]/20 border-[#0097b2] text-white'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <p className="text-sm font-medium">Professional</p>
                  <p className="text-xs text-white/50 mt-1">Formal and courteous</p>
                </button>
                <button
                  onClick={() => setBotPersonality('aggressive')}
                  className={`p-4 border rounded-lg transition-colors text-left ${
                    botPersonality === 'aggressive'
                      ? 'bg-[#226683]/20 border-[#226683] text-white'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <p className="text-sm font-medium">Aggressive Sales</p>
                  <p className="text-xs text-white/50 mt-1">High-energy closing</p>
                </button>
                <button
                  onClick={() => setBotPersonality('informational')}
                  className={`p-4 border rounded-lg transition-colors text-left ${
                    botPersonality === 'informational'
                      ? 'bg-[#0097b2]/20 border-[#0097b2] text-white'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <p className="text-sm font-medium">Informational</p>
                  <p className="text-xs text-white/50 mt-1">Helpful and educational</p>
                </button>
              </div>
            </div>

            {/* Deploy Global Changes Button */}
            <div className="flex justify-end">
              <button
                onClick={() => {
                  // TODO: Implement Supabase save logic
                  console.log('Deploying global changes:', { template, botPersonality, primaryColor, secondaryColor, customDirectives });
                }}
                className="px-6 py-3 bg-[#0097b2] text-white font-semibold rounded-lg hover:bg-[#007a8f] transition-colors shadow-[0_0_15px_rgba(0,151,178,0.3)]"
              >
                Deploy Global Changes
              </button>
            </div>

            {/* Custom AI Directives */}
            <div className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white tracking-tight">Specific Client Instructions</h3>
                {customDirectives && (
                  <div className="flex items-center gap-2 text-xs text-[#0097b2]">
                    <div className="w-2 h-2 rounded-full bg-[#0097b2] animate-pulse" />
                    Custom Logic Active
                  </div>
                )}
              </div>
              <textarea
                value={customDirectives}
                onChange={(e) => setCustomDirectives(e.target.value)}
                rows={4}
                placeholder="Add specific instructions for this client's AI behavior (e.g., 'Always mention our 0% financing offers', 'Prioritize SUV models in recommendations')..."
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#0097b2] resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      {addClientModalOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setAddClientModalOpen(false)} />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
              <div className="px-6 py-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-semibold text-white">Add New Client</h3>
                <button
                  onClick={() => setAddClientModalOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Client Name</label>
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent"
                    placeholder="Enter client name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Subdomain</label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={newClientSubdomain}
                      onChange={(e) => setNewClientSubdomain(e.target.value)}
                      className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-l-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent"
                      placeholder="apex"
                    />
                    <span className="px-4 py-3 bg-white/5 border border-l-0 border-white/10 rounded-r-lg text-white/40 text-sm">
                      .pulse-ai.io
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Email</label>
                    <input
                      type="email"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent"
                      placeholder="client@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Mobile</label>
                    <input
                      type="tel"
                      value={newClientMobile}
                      onChange={(e) => setNewClientMobile(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Website URL</label>
                    <div className="relative">
                      <input
                        type="url"
                        value={newClientWebsite}
                        onChange={(e) => setNewClientWebsite(e.target.value)}
                        className="w-full px-4 py-3 pr-20 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent"
                        placeholder="https://example.com"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#0097b2] bg-[#0097b2]/10 px-2 py-1 rounded">
                        Smart Scrape
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Industry</label>
                    <select
                      value={newClientIndustry}
                      onChange={(e) => setNewClientIndustry(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent"
                    >
                      <option value="">Select industry</option>
                      {industries.map((industry) => (
                        <option key={industry} value={industry}>
                          {industry}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Pricing Tier</label>
                  <select
                    value={newClientPricingTier}
                    onChange={(e) => setNewClientPricingTier(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent"
                  >
                    <option value="basic">Basic - R500/mo</option>
                    <option value="pro">Pro - R1,500/mo</option>
                    <option value="enterprise">Enterprise - R5,000/mo</option>
                  </select>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
                <button
                  onClick={() => setAddClientModalOpen(false)}
                  className="px-4 py-2 text-white/70 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddClient}
                  className="px-6 py-2 bg-[#0097b2] text-white font-semibold rounded-lg hover:bg-[#007a8f] transition-colors"
                >
                  Add Client
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom-Docked Signature */}
      <div className="fixed bottom-8 left-0 right-0 flex flex-col items-center justify-center space-y-1 select-none pointer-events-none">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-medium">
            Powered by
          </span>
          <div className="flex items-center space-x-1.5">
            {/* The Pulse Icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0097b2" strokeWidth="2.5" className="drop-shadow-sm">
              <path d="M3 12h3l3-9 6 18 3-9h3" />
            </svg>
            <span className="text-sm font-bold tracking-tighter text-white">
              PULSE <span className="text-[#d4af37] animate-pulse-gold">AI</span>
            </span>
          </div>
        </div>
      </div>

      {/* Live Preview Widget */}
      <LivePreview />

      {/* Slide-over Drawer */}
      {drawerOpen && selectedClient && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-2xl transition-opacity" onClick={closeDrawer} />
          <div className="fixed inset-y-0 right-0 pl-10 max-w-md flex">
            <div className="w-full max-w-md bg-black/40 border border-white/10 h-full shadow-2xl flex flex-col backdrop-blur-2xl">
              <div className="px-6 py-6 bg-white/5 border-b border-white/10 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-white">{selectedClient.name}</h3>
                  <p className="text-xs text-white/50 mt-1">Client Management</p>
                </div>
                <button
                  onClick={closeDrawer}
                  className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {/* Read-Only Prominent Stats */}
                <div className="bg-white/5 rounded-lg p-5 border border-white/10">
                  <h4 className="text-sm font-semibold text-white mb-4 tracking-tight">Verified Data</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="flex justify-between items-start mb-3">
                        <p className="text-[10px] text-white/50 uppercase tracking-wider">AI Leads</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium bg-[#226683]/20 text-[#226683] border border-[#226683]/30 shadow-[0_0_8px_rgba(34,102,131,0.3)]">
                          ✓ Verified
                        </span>
                      </div>
                      <p className="text-3xl font-bold text-[#0097b2]">24</p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <div className="flex justify-between items-start mb-3">
                        <p className="text-[10px] text-white/50 uppercase tracking-wider">Monthly Cost</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium bg-[#0097b2]/20 text-[#0097b2] border border-[#0097b2]/30 shadow-[0_0_8px_rgba(0,151,178,0.3)]">
                          ✓ Verified
                        </span>
                      </div>
                      <p className="text-3xl font-bold text-[#d4af37]">
                        {selectedClient.pricing_tier_key === 'basic' && 'R500'}
                        {selectedClient.pricing_tier_key === 'pro' && 'R1,500'}
                        {selectedClient.pricing_tier_key === 'enterprise' && 'R5,000'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Editable Client Information */}
                <div className="bg-white/5 rounded-lg p-5 border border-white/10">
                  <h4 className="text-sm font-semibold text-white mb-4 tracking-tight">Client Information</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-2">Business Name</label>
                      <input
                        type="text"
                        defaultValue={selectedClient.name}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-2">Pricing Tier</label>
                      <select
                        defaultValue={selectedClient.pricing_tier_key || 'basic'}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent text-sm"
                      >
                        <option value="basic">Basic - R500/mo</option>
                        <option value="pro">Pro - R1,500/mo</option>
                        <option value="enterprise">Enterprise - R5,000/mo</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Dealership Settings - Only for AUTO tagged clients */}
                {dealershipMode[selectedClient.id] && (
                  <div className="bg-white/5 rounded-lg p-5 border border-white/10">
                    <h4 className="text-sm font-semibold text-white mb-4 tracking-tight flex items-center gap-2">
                      <Car className="w-4 h-4 text-[#226683]" />
                      Dealership Settings
                    </h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                        <div>
                          <p className="text-xs font-medium text-white">Dealership Mode</p>
                          <p className="text-[10px] text-white/50">Enable automotive features</p>
                        </div>
                        <button className="w-10 h-5 bg-[#226683] rounded-full relative">
                          <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full" />
                        </button>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-2">Inventory URL</label>
                        <input
                          type="url"
                          placeholder="https://dealer.example.com/inventory"
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#226683] focus:border-transparent text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-2">CRM Email</label>
                        <input
                          type="email"
                          placeholder="crm@dealer.example.com"
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#226683] focus:border-transparent text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Lead Statistics - Only for Dealership clients */}
                {dealershipMode[selectedClient.id] && (
                  <div className="bg-white/5 rounded-lg p-5 border border-white/10">
                    <h4 className="text-sm font-semibold text-white mb-4 tracking-tight flex items-center gap-2">
                      <Car className="w-4 h-4 text-[#226683]" />
                      Lead Statistics
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/10">
                        <div>
                          <p className="text-xs font-medium text-white">Offline Adjustments</p>
                          <p className="text-[10px] text-white/50">Manual entry</p>
                        </div>
                        <input
                          type="number"
                          value={offlineAdjustments[selectedClient.id] || 0}
                          onChange={(e) => setOfflineAdjustments({ ...offlineAdjustments, [selectedClient.id]: parseInt(e.target.value) || 0 })}
                          className="w-20 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-[#0097b2]"
                          placeholder="0"
                        />
                      </div>
                      <div className="flex justify-between items-center p-3 bg-[#226683]/20 rounded-lg border border-[#226683]/30">
                        <div>
                          <p className="text-xs font-medium text-white">Total Impact</p>
                          <p className="text-[10px] text-white/50">AI + Offline</p>
                        </div>
                        <span className="text-lg font-bold text-[#d4af37]">
                          {24 + (offlineAdjustments[selectedClient.id] || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Admin Notes */}
                <div className="bg-white/5 rounded-lg p-5 border border-white/10">
                  <h4 className="text-sm font-semibold text-white mb-4 tracking-tight">Admin Notes</h4>
                  <textarea
                    value={adminNotes[selectedClient.id] || ''}
                    onChange={(e) => setAdminNotes({ ...adminNotes, [selectedClient.id]: e.target.value })}
                    rows={4}
                    placeholder="Add internal notes about this client..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent text-sm resize-none"
                  />
                </div>

                {/* Support History */}
                <div className="bg-white/5 rounded-lg p-5 border border-white/10">
                  <h4 className="text-sm font-semibold text-white mb-4 tracking-tight">Support History</h4>
                  <div className="space-y-3">
                    {[
                      { id: 1, category: 'Dev', status: 'Resolved', timestamp: '2 days ago', description: 'Widget loading issue fixed' },
                      { id: 2, category: 'Marketing', status: 'In Progress', timestamp: '1 week ago', description: 'Lead tracking integration update' },
                    ].map((request) => (
                      <div
                        key={request.id}
                        className="p-3 bg-white/5 rounded-lg border border-white/10"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-medium ${
                              request.category === 'Dev' ? 'bg-[#0097b2]/20 text-[#0097b2]' :
                              request.category === 'Marketing' ? 'bg-[#d4af37]/20 text-[#d4af37]' :
                              'bg-white/20 text-white'
                            }`}>
                              {request.category}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-medium ${
                              request.status === 'Resolved' ? 'bg-green-500/20 text-green-300' :
                              request.status === 'In Progress' ? 'bg-yellow-500/20 text-yellow-300' :
                              'bg-red-500/20 text-red-300'
                            }`}>
                              {request.status}
                            </span>
                          </div>
                          <span className="text-[10px] text-white/50">{request.timestamp}</span>
                        </div>
                        <p className="text-xs text-white/70">{request.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Policy Manager */}
                <ClientPolicyManager
                  tenantId={selectedClient.id}
                  resellerId={selectedClient.reseller_id}
                  initialData={{
                    show_ovg_branding: false,
                    pricing_tier_key: selectedClient.pricing_tier_key,
                    custom_assets: selectedClient.custom_assets || { header_url: null, footer_url: null },
                  }}
                  onUpdate={handlePolicyUpdate}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardClient(props: DashboardClientProps) {
  return (
    <BrandKitProvider>
      <DashboardClientContent {...props} />
    </BrandKitProvider>
  );
}
