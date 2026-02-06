import { z } from "zod";
import type { ResourceModule } from "@civis/http-contracts";
import { Ok } from "@civis/kernel/types";
import { createExample } from "../application/create-example.js";

export function exampleApi(deps: any): ResourceModule<any> {
  return Object.freeze({
    resourceKey: "examples" as any,
    routes: Object.freeze([
      Object.freeze({
        id: "examples.create" as any,
        method: "POST",
        path: "/",
        auth: { required: true, permission: "example:create" },
        idempotency: { mode: "required", ttlSeconds: 86400 },
        rateLimit: { mode: "actor", limit: 50, windowSeconds: 60 },
        schemas: {
          body: z.object({ name: z.string().min(1).max(200) }),
          response: z.object({ id: z.string() })
        },
        handler: async ({ ctx, body, deps }) => {
          const r = await createExample(
            {
              tenantId: ctx.tenantId,
              name: body.name,
              createdBy: ctx.actor.id,
              correlationId: ctx.correlationId,
              requestId: ctx.requestId
            },
            deps
          );
          if (!r.ok) return r;
          return Ok({ id: r.value.exampleId });
        }
      })
    ])
  });
}
