export type ClientStatus = 'online' | 'offline' | 'warning';

export interface ClientStatusInfo {
  status: ClientStatus;
  lastSeenText: string;
}

export const checkClientStatus = (lastSeen?: string): ClientStatusInfo => {
  if (!lastSeen) {
    return {
      status: 'offline',
      lastSeenText: 'Never seen'
    };
  }

  const now = new Date();
  const lastSeenDate = new Date(lastSeen);
  const diffMs = now.getTime() - lastSeenDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let lastSeenText = '';
  if (diffMins < 1) {
    lastSeenText = 'Just now';
  } else if (diffMins < 60) {
    lastSeenText = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    lastSeenText = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else {
    lastSeenText = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }

  // Online if seen within 5 minutes
  if (diffMins < 5) {
    return {
      status: 'online',
      lastSeenText
    };
  }

  // Warning if seen within 1 hour
  if (diffMins < 60) {
    return {
      status: 'warning',
      lastSeenText
    };
  }

  // Offline if seen more than 1 hour ago
  return {
    status: 'offline',
    lastSeenText
  };
};
