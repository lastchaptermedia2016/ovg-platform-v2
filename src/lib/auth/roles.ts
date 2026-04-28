// User role management
// Replace with your actual implementation

export type UserRole = "admin" | "reseller" | "client" | "user";

export interface User {
  id: string;
  email: string;
  role?: UserRole;
  user_metadata?: {
    role?: UserRole;
    reseller_id?: string;
    reseller_slug?: string;
  };
}

export async function getUserRole(user: User): Promise<UserRole> {
  // Check user metadata for role
  const role = user.user_metadata?.role || user.role || "user";
  return role as UserRole;
}

export function hasRole(user: User | null, allowedRoles: UserRole[]): boolean {
  if (!user) return false;
  const userRole = user.user_metadata?.role || user.role || "user";
  return allowedRoles.includes(userRole as UserRole);
}

export function isAdmin(user: User | null): boolean {
  return hasRole(user, ["admin"]);
}

export function isReseller(user: User | null): boolean {
  return hasRole(user, ["reseller", "admin"]);
}
