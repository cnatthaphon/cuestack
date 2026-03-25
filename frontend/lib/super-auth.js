import { getCurrentUser } from "./auth.js";

/**
 * Guard: requires super_admin. Returns user or throws 401/403.
 */
export async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated", status: 401 };
  if (!user.is_super_admin) return { error: "Forbidden — super admin only", status: 403 };
  return { user };
}
