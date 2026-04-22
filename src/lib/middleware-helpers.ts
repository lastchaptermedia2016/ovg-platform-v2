import { NextRequest } from "next/server";
import { getUser } from "./auth/session";
import { getUserRole, UserRole } from "./auth/roles";

export async function validateTenant(request: NextRequest) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenant");

  if (!tenantId) {
    return null;
  }

  return tenantId;
}

export async function requireAuth() {
  try {
    const user = await getUser();
    if (!user) {
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

export async function requireRole(
  request: NextRequest,
  allowedRoles: UserRole[],
) {
  const user = await requireAuth();
  if (!user) {
    return null;
  }

  const role = await getUserRole(user);
  if (!allowedRoles.includes(role)) {
    return null;
  }

  return user;
}
