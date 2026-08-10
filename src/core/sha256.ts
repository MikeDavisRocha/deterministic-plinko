/**
 * SHA-256 and HMAC-SHA256, written out rather than imported.
 *
 * Three reasons this is not `crypto.subtle`. It is synchronous, and the drop
 * path is synchronous — an await between pressing drop and spawning the disc
 * would spread through the loop for nothing. It is the same code in the browser
 * and under vitest, so a committed vector proves the thing the game actually
 * runs. And a provably fair scheme whose hash a reader cannot follow is asking
 * for trust at exactly the point it promises not to.
 *
 * Correctness is not argued here, it is pinned: src/test/fair.test.ts checks
 * these against the published FIPS 180-4 and RFC 4231 vectors.
 *
 * This is a hash, not a cipher. Nothing here is constant-time, and the secret
 * it handles is a server seed that gets published a few drops later, so there
 * is nothing for a timing attack to learn.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const BLOCK_BYTES = 64;
export const DIGEST_BYTES = 32;

const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

export function sha256(message: Uint8Array): Uint8Array {
  // Padding: the 0x80 marker, then zeros, then the length in bits as a 64-bit
  // big-endian integer — so the last block needs 9 bytes it cannot share.
  const blocks = Math.ceil((message.length + 9) / BLOCK_BYTES);
  const padded = new Uint8Array(blocks * BLOCK_BYTES);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bits = message.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let b = 0; b < blocks; b++) {
    const off = b * BLOCK_BYTES;
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }

    let a = h[0], bb = h[1], c = h[2], d = h[3];
    let e = h[4], f = h[5], g = h[6], hh = h[7];

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (s0 + maj) >>> 0;

      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }

    h[0] += a; h[1] += bb; h[2] += c; h[3] += d;
    h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }

  const out = new Uint8Array(DIGEST_BYTES);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  // A key longer than one block is hashed down to 32 bytes first. This branch
  // is the one an implementation gets wrong and never notices, because short
  // keys are all anyone tests with — RFC 4231 case 6 covers it.
  const k = new Uint8Array(BLOCK_BYTES);
  k.set(key.length > BLOCK_BYTES ? sha256(key) : key);

  const inner = new Uint8Array(BLOCK_BYTES + message.length);
  const outer = new Uint8Array(BLOCK_BYTES + DIGEST_BYTES);
  for (let i = 0; i < BLOCK_BYTES; i++) {
    inner[i] = k[i] ^ 0x36;
    outer[i] = k[i] ^ 0x5c;
  }
  inner.set(message, BLOCK_BYTES);
  outer.set(sha256(inner), BLOCK_BYTES);
  return sha256(outer);
}

const encoder = new TextEncoder();

/** UTF-8 bytes. Seeds are text, and what gets hashed is their bytes. */
export const bytesOf = (text: string): Uint8Array => encoder.encode(text);

export function hexOf(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
