declare module "supertest" {
  import type { Express } from "express";

  export interface Test {
    set(field: string, value: string): Test;
    send(body?: unknown): Test;
    expect(status: number): Test;
    then<TResult1 = any, TResult2 = any>(
      onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
    ): Promise<TResult1 | TResult2>;
  }

  export interface SuperTest {
    get(path: string): Test;
    post(path: string): Test;
    patch(path: string): Test;
    delete(path: string): Test;
  }

  export default function request(app: Express): SuperTest;
}
