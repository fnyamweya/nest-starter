declare module "jsonwebtoken" {
  export type JwtPayload = Record<string, unknown>;
  export function sign(payload: string | Buffer | object, secret: string): string;
  export function verify(token: string, secret: string): JwtPayload | string;
}
