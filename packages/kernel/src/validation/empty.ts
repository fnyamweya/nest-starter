export type Empty = Readonly<Record<string, never>>;
export const empty: Empty = Object.freeze({});
