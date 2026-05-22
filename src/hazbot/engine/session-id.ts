// Substrate-internal helper. Generates a URL-safe nanoid-style id
// without an external dependency, using crypto.getRandomValues.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function generateSessionId(length = 12): string {
  const bytes = new Uint8Array(length);
  // crypto is a Web API; substrate is browser-only per Req 19.
  crypto.getRandomValues(bytes);
  let out = "";
  // Map each byte to an alphabet index. ALPHABET.length === 64 (a power of 2),
  // so % 64 introduces no modulo bias across the 0..255 input range.
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % 64];
  return out;
}
