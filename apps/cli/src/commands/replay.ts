import { Pool } from "pg";
import type { Env } from "@civis/platform/config";

export async function replay(env: Env, args: readonly string[]): Promise<void> {
  const tenantId = args[0];
  if (!tenantId) throw new Error("tenantId required");

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  await pool.query(
    "DELETE FROM projection_checkpoints WHERE tenant_id = $1",
    [tenantId]
  );
  await pool.end();
}
