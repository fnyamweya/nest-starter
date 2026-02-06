import type { Request, Response, NextFunction } from "express";
import type { Env } from "@civis/platform/config";
import { createRequire } from "module";
import { z } from "zod";

const JwtClaimsSchema = z.object({
  tenantId: z.string().min(1),
  sub: z.string().min(1),
  actorType: z.enum(["user", "system", "api_key"]).default("user"),
  permissions: z.array(z.string().min(1)).optional(),
  scope: z.string().optional()
});

type ApiKeyEntry = Readonly<{
  key: string;
  tenantId: string;
  actorId: string;
  actorType: "user" | "system" | "api_key";
  permissions: readonly string[];
}>;

export function authMiddleware(env: Env) {
  const require = createRequire(import.meta.url);
  const jwt = require("jsonwebtoken") as typeof import("jsonwebtoken");
  const apiKeys = parseApiKeys(env.API_KEYS ?? "");
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.requestId ?? "missing";
    const correlationId = req.correlationId ?? requestId;
    const authHeader = String(req.headers["authorization"] ?? "");
    const apiKeyHeader = String(req.headers["x-api-key"] ?? "");
    const apiKeyAuth = authHeader.startsWith("ApiKey ")
      ? authHeader.slice("ApiKey ".length).trim()
      : "";

    if (!authHeader && !apiKeyHeader) {
      delete req.ctx;
      return next();
    }

    const apiKey = apiKeyHeader || apiKeyAuth;
    if (apiKey) {
      const entry = apiKeys.get(apiKey);
      if (!entry) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Invalid API key", requestId }
        });
      }

      req.ctx = Object.freeze({
        tenantId: entry.tenantId,
        requestId,
        correlationId,
        actor: Object.freeze({ type: entry.actorType, id: entry.actorId }),
        permissions: entry.permissions
      });

      return next();
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Invalid authorization header", requestId }
      });
    }

    if (!env.JWT_SECRET) {
      throw new Error("JWT_SECRET is required for bearer token authentication");
    }

    try {
      const token = authHeader.slice("Bearer ".length).trim();
      const decoded = jwt.verify(token, env.JWT_SECRET);
      const parsed = JwtClaimsSchema.safeParse(decoded);
      if (!parsed.success) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Invalid token claims", requestId }
        });
      }

      const scopePermissions = parsed.data.scope
        ? parsed.data.scope.split(" ").filter((p) => p.length > 0)
        : [];
      const permissions = Object.freeze([...(parsed.data.permissions ?? []), ...scopePermissions]);

      req.ctx = Object.freeze({
        tenantId: parsed.data.tenantId,
        requestId,
        correlationId,
        actor: Object.freeze({ type: parsed.data.actorType, id: parsed.data.sub }),
        permissions
      });

      return next();
    } catch {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Invalid token", requestId }
      });
    }
  };
}

function parseApiKeys(raw: string): Map<string, ApiKeyEntry> {
  const map = new Map<string, ApiKeyEntry>();
  const entries = raw.split(";").map((value) => value.trim()).filter(Boolean);

  for (const entry of entries) {
    const [key, tenantId, actorId, actorTypeRaw, permissionsRaw] = entry.split("|");
    if (!key || !tenantId || !actorId || !actorTypeRaw) continue;
    const actorType = actorTypeRaw as ApiKeyEntry["actorType"];
    if (!isActorType(actorType)) continue;
    const permissions = permissionsRaw
      ? permissionsRaw.split(",").map((p) => p.trim()).filter(Boolean)
      : [];

    map.set(key, Object.freeze({
      key,
      tenantId,
      actorId,
      actorType,
      permissions: Object.freeze(permissions)
    }));
  }

  return map;
}

function isActorType(value: string): value is ApiKeyEntry["actorType"] {
  return value === "user" || value === "system" || value === "api_key";
}
