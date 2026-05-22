// `requiredDefaults` path traversal validator.
// Path syntax (per requirements.md "`requiredDefaults` path syntax"):
//   - dot-segments traverse object fields
//   - `[*]` traverses every entry of an array (each entry must satisfy the suffix)
// Failure cases:
//   - intermediate segment resolves to undefined / null
//   - `[*]` segment encounters a non-array, an empty array, or any entry whose suffix fails
// Returns the failing path (with the offending `[*]` index substituted, e.g.
// "zones[1].terrainType is undefined") so the load-failure message can pinpoint the gap.

export type ValidateResult =
  | { ok: true }
  | { ok: false; failingPath: string };

export function validateDefaultsPath(defaults: unknown, path: string): ValidateResult {
  const segments = parsePath(path);
  return walk(defaults, segments, "");
}

interface FieldSeg { kind: "field"; name: string }
interface StarSeg { kind: "star" }
type Segment = FieldSeg | StarSeg;

function parsePath(path: string): Segment[] {
  const segs: Segment[] = [];
  // Split on dots, but recognise `[*]` as its own segment that may be appended to a field.
  // Examples:
  //   "wind.speed" → field(wind), field(speed)
  //   "zones[*].terrainType" → field(zones), star, field(terrainType)
  const parts = path.split(".");
  for (const part of parts) {
    // Strip any [*] suffixes off this part.
    let idx = part.indexOf("[*]");
    if (idx === -1) {
      if (part) segs.push({ kind: "field", name: part });
      continue;
    }
    let cursor = 0;
    while (idx !== -1) {
      const head = part.slice(cursor, idx);
      if (head) segs.push({ kind: "field", name: head });
      segs.push({ kind: "star" });
      cursor = idx + 3;
      idx = part.indexOf("[*]", cursor);
    }
    const tail = part.slice(cursor);
    if (tail) segs.push({ kind: "field", name: tail });
  }
  return segs;
}

function walk(value: unknown, segs: Segment[], pathSoFar: string): ValidateResult {
  if (segs.length === 0) {
    if (value === undefined || value === null) {
      return { ok: false, failingPath: `${pathSoFar} is ${value === null ? "null" : "undefined"}` };
    }
    return { ok: true };
  }
  if (value === undefined || value === null) {
    return { ok: false, failingPath: `${pathSoFar} is ${value === null ? "null" : "undefined"}` };
  }
  const [head, ...rest] = segs;
  if (head.kind === "field") {
    const obj = value as Record<string, unknown>;
    const next = obj[head.name];
    const path = pathSoFar ? `${pathSoFar}.${head.name}` : head.name;
    return walk(next, rest, path);
  }
  // star
  if (!Array.isArray(value)) {
    return { ok: false, failingPath: `${pathSoFar} is not an array` };
  }
  if (value.length === 0) {
    return { ok: false, failingPath: `${pathSoFar}[] is empty` };
  }
  for (let i = 0; i < value.length; i++) {
    const indexedPath = `${pathSoFar}[${i}]`;
    const r = walk(value[i], rest, indexedPath);
    if (!r.ok) return r;
  }
  return { ok: true };
}
