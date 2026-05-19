// Substrate-private helper. Not re-exported from engine/index.ts; scoped to the
// `temporal-initial-values-mismatch` runtime check. If a broader runtime-type
// concern emerges, define a separate helper rather than widening this one.
export function runtimeType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
