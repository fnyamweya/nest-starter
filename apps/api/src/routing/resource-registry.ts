import type { ResourceKey } from "@civis/http-contracts";

export type ResourcePath = string & { readonly __brand: "ResourcePath" };

export class ResourceRegistry {
  private readonly map = new Map<ResourceKey, ResourcePath>();

  register(key: ResourceKey, path: ResourcePath): void {
    if (this.map.has(key)) throw new Error(`Duplicate resourceKey: ${key}`);
    this.map.set(key, path);
  }

  pathOf(key: ResourceKey): ResourcePath {
    const p = this.map.get(key);
    if (p === undefined) throw new Error(`Unregistered resourceKey: ${key}`);
    return p;
  }
}
