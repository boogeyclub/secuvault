import { isAndroid } from '@nativescript/core';

/**
 * Crypto helpers implemented on top of the Android platform classes
 * (java.security.MessageDigest / SecureRandom).
 *
 * The vault secret (password / PIN / pattern) is never stored in plain
 * text - only a salted, iterated SHA-256 hash is kept (inside the
 * encrypted secure storage provided by @nativescript/secure-storage).
 */

const ITERATIONS = 15000;

function sha256Hex(input: string): string {
  const md = java.security.MessageDigest.getInstance('SHA-256');
  const bytes = new java.lang.String(input).getBytes('UTF-8');
  const out = md.digest(bytes);
  let hex = '';
  for (let i = 0; i < out.length; i++) {
    const b = out[i] & 0xff;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

export function randomHex(byteCount: number): string {
  const sr = new java.security.SecureRandom();
  const buf = Array.create('byte', byteCount) as any;
  sr.nextBytes(buf);
  let hex = '';
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i] & 0xff;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

/** Salted, iterated hash of a vault secret. */
export function hashSecret(secret: string, salt: string): string {
  let h = sha256Hex(salt + '::' + secret);
  for (let i = 0; i < ITERATIONS; i++) {
    h = sha256Hex(h + secret);
  }
  return h;
}

/**
 * A drawn pattern is direction-insensitive: "1236" and "6321" are the
 * same pattern. We store the lexicographically smaller form.
 */
export function canonicalPattern(seq: string): string {
  const rev = seq.split('').reverse().join('');
  return seq < rev ? seq : rev;
}

/** SHA-256 of any string - used as a fallback id/verifier, not for secrets. */
export function sha256Of(input: string): string {
  return sha256Hex(input);
}

export function hasCrypto(): boolean {
  return isAndroid;
}
