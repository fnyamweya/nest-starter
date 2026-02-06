import type { RouteDef } from "./route-dsl.js";

export type ResourceKey = string & { readonly __brand: "ResourceKey" };

export type ResourceModule<Deps> = Readonly<{
  resourceKey: ResourceKey;
  routes: readonly RouteDef<any, any, any, any, any, Deps>[];
}>;
