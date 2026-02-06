import type { RequestContext } from "@civis/http-contracts";

declare global {
  namespace Express {
    interface Request {
      ctx?: RequestContext;
      requestId?: string;
      correlationId?: string;
    }
  }
}

export {};
