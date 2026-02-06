import { Pool } from "pg";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { Env } from "@civis/platform/config";

export async function migrate(env: Env): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const dir = new URL("../migrations", import.meta.url).pathname;
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    await pool.query(sql);
  }

  await pool.end();
}
