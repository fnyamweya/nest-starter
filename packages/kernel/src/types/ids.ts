import { z } from "zod";

export type TenantId = string & { readonly __brand: "TenantId" };
export type RequestId = string & { readonly __brand: "RequestId" };
export type CorrelationId = string & { readonly __brand: "CorrelationId" };

export const TenantIdSchema = z.string().min(1) as unknown as z.ZodType<TenantId>;
export const RequestIdSchema = z.string().min(1) as unknown as z.ZodType<RequestId>;
export const CorrelationIdSchema = z.string().min(1) as unknown as z.ZodType<CorrelationId>;
