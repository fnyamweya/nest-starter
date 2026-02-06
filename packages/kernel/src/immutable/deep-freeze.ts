export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj as object)) {
      deepFreeze((obj as Record<string, unknown>)[k]);
    }
  }
  return obj as Readonly<T>;
}
