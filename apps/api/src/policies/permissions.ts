import type { RequestContext } from "@civis/http-contracts";

export interface PermissionChecker {
  hasPermission(ctx: RequestContext, permission: string): Promise<boolean>;
}
