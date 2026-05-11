// Substrate-internal utility (per EXT-10 / EXT-17). Replaces ES2023 `Array.prototype.findLast`
// for broader runtime support without polluting the global prototype.
export function findLast<T>(arr: readonly T[], pred: (item: T, i: number) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i], i)) return arr[i];
  }
  return undefined;
}
