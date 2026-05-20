// Substrate-internal utility (per EXT-10 / EXT-17). Replaces ES2023 `Array.prototype.findLast`
// for broader runtime support without polluting the global prototype.
//
// The overload signature lets callers narrow the return type when the predicate is a
// type guard (e.g., `(e): e is ParseError => e.kind === "parse-error"`).
export function findLast<T, S extends T>(arr: readonly T[], pred: (item: T, i: number) => item is S): S | undefined;
export function findLast<T>(arr: readonly T[], pred: (item: T, i: number) => boolean): T | undefined;
export function findLast<T>(arr: readonly T[], pred: (item: T, i: number) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i], i)) return arr[i];
  }
  return undefined;
}
