import { z } from "zod";
import type { Pool } from "pg";
import { validate } from "@civis/kernel/validation";

const ExampleRowSchema = z.object({
  tenant_id: z.string().min(1),
  example_id: z.string().min(1),
  name: z.string().min(1),
  created_at: z.string().min(1)
});

export type ExampleReadModel = Readonly<{
  tenantId: string;
  exampleId: string;
  name: string;
  createdAt: string;
}>;

export class ExampleReadRepository {
  constructor(private readonly pool: Pool) {}

  async findById(tenantId: string, exampleId: string): Promise<ExampleReadModel | null> {
    const result = await this.pool.query(
      "SELECT tenant_id, example_id, name, created_at FROM example_read_models WHERE tenant_id = $1 AND example_id = $2",
      [tenantId, exampleId]
    );

    const row = result.rows[0];
    if (!row) return null;

    const validated = validate(ExampleRowSchema, row);
    if (!validated.ok) return null;

    return Object.freeze({
      tenantId: validated.value.tenant_id,
      exampleId: validated.value.example_id,
      name: validated.value.name,
      createdAt: validated.value.created_at
    });
  }
}
