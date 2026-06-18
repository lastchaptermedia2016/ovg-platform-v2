// Session management for authentication
// ⚠️ SERVER-SIDE getSession() REMOVED — migrating to getAuthenticatedUser() in src/lib/auth/server.ts
// Client-side utilities remain untouched.

export interface User {
  id: string;
  email: string;
  user_metadata?: {
    reseller_id?: string;
    reseller_slug?: string;
  };
}

export interface GetUserResult {
  user: User | null;
  error?: Error;
}

// Server-side getUser now delegates to the centralized auth utility.
// This ensures getUser() and getSession() are never mixed on the server.
export async function getUser(): Promise<User | null> {
  try {
    const { getAuthenticatedUser } = await import('./server');
    const result = await getAuthenticatedUser();
    if (result.error || !result.user) {
      return null;
    }
    return result.user as User;
  } catch {
    return null;
  }
}
