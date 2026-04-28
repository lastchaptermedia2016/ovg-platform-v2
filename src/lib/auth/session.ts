// Session management for authentication
// Replace with your actual implementation

import { createClient } from "@/lib/supabase/server";

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

export async function getUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }
    
    return user as User;
  } catch {
    return null;
  }
}

export async function getSession() {
  try {
    const supabase = await createClient();
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      return null;
    }
    
    return session;
  } catch {
    return null;
  }
}
