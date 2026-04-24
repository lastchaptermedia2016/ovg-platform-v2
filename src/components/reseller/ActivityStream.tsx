'use client';

import { Users, Activity, Heart, Car } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'client' | 'lead' | 'system';
  title: string;
  description: string;
  time: string;
  icon: typeof Users;
}

export function ActivityStream() {
  const activities: ActivityItem[] = [
    {
      id: '1',
      type: 'client',
      title: 'New Client Added',
      description: 'Apex Motors joined the platform',
      time: '2 min ago',
      icon: Users,
    },
    {
      id: '2',
      type: 'lead',
      title: 'Car Lead Captured',
      description: 'John Smith interested in 2024 Tesla Model 3',
      time: '15 min ago',
      icon: Car,
    },
    {
      id: '3',
      type: 'system',
      title: 'System Health Check',
      description: 'All services operational',
      time: '1 hr ago',
      icon: Heart,
    },
    {
      id: '4',
      type: 'lead',
      title: 'Test Drive Scheduled',
      description: 'Sarah Johnson for BMW X5',
      time: '2 hrs ago',
      icon: Activity,
    },
    {
      id: '5',
      type: 'client',
      title: 'Brand Kit Updated',
      description: 'Premier Auto Group uploaded new logo',
      time: '3 hrs ago',
      icon: Users,
    },
  ];

  const getIconColor = (type: string) => {
    switch (type) {
      case 'client': return '#0097b2';
      case 'lead': return '#d4af37';
      case 'system': return '#22c55e';
      default: return '#0097b2';
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-lg h-[500px] overflow-hidden flex flex-col select-none">
      <div className="p-4 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white tracking-tight">Activity Stream</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {activities.map((activity) => {
          const Icon = activity.icon;
          return (
            <div key={activity.id} className="flex items-start gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
              <div
                className="p-2 rounded-lg bg-white/10"
                style={{ color: getIconColor(activity.type) }}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white">{activity.title}</p>
                <p className="text-[10px] text-white/50 mt-0.5 truncate">{activity.description}</p>
                <p className="text-[10px] text-white/30 mt-1">{activity.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
