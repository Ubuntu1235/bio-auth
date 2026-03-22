import { Buffer } from "buffer";
(window as any).Buffer = Buffer;

// Patch crypto.createHash to always return Buffer from digest
try {
  const cryptoModule = require("crypto");
  if (cryptoModule && cryptoModule.createHash) {
    const orig = cryptoModule.createHash;
    cryptoModule.createHash = function(alg: string) {
      const hash = orig.call(cryptoModule, alg);
      const origDigest = hash.digest.bind(hash);
      hash.digest = function(...args: any[]) {
        const result = origDigest(...args);
        if (result && typeof result !== "string" && !(result instanceof Buffer)) {
          return Buffer.from(result);
        }
        return result;
      };
      return hash;
    };
  }
} catch (e) {}
