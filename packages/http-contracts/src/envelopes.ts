export type ErrorEnvelope = Readonly<{
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}>;

export type SuccessEnvelope<T> = T;
