import { User } from "@supabase/supabase-js";

export type UserRole = "reseller" | "client" | "admin";

export async function getUserRole(user: User): Promise<UserRole> {
  const userMetadata = user.user_metadata;
  return userMetadata.role || "client";
}

export async function isReseller(user: User): Promise<boolean> {
  const role = await getUserRole(user);
  return role === "reseller" || role === "admin";
}

export async function isClient(user: User): Promise<boolean> {
  const role = await getUserRole(user);
  return role === "client";
}

export async function isAdmin(user: User): Promise<boolean> {
  const role = await getUserRole(user);
  return role === "admin";
}
