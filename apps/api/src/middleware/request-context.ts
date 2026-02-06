import type { Request, Response, NextFunction } from "express";
import type { Env } from "@civis/platform/config";
import { ensureRequestId, ensureCorrelationId } from "@civis/platform/ids";

export function requestContextMiddleware(env: Env) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = ensureRequestId(String(req.headers[env.REQUEST_ID_HEADER] ?? ""));
    const correlationId = ensureCorrelationId(
      String(req.headers[env.CORRELATION_ID_HEADER] ?? ""),
      requestId
    );

    req.requestId = requestId;
    req.correlationId = correlationId;
    res.setHeader("x-request-id", requestId);
    res.setHeader("x-correlation-id", correlationId);

    return next();
  };
}
