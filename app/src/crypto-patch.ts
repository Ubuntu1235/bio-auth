// Patch crypto.createHash to return Buffer with .reduce()
const origCreateHash = globalThis.crypto ? null : null;
import { Buffer } from "buffer";

const _origCrypto = await import("crypto");
const _origCreateHash = _origCrypto.createHash;

if (_origCreateHash) {
  (_origCrypto as any).createHash = function(alg: string) {
    const hash = _origCreateHash(alg);
    const origDigest = hash.digest.bind(hash);
    hash.digest = function(...args: any[]) {
      const result = origDigest(...args);
      if (result && !result.reduce) {
        return Buffer.from(result);
      }
      return result;
    };
    return hash;
  };
}
