import { Buffer } from "buffer";
(window as any).Buffer = Buffer;

// Ensure crypto polyfill hash.digest returns Buffer
const origCrypto = (globalThis as any).__crypto_browserify;
if (origCrypto?.createHash) {
  const orig = origCrypto.createHash;
  origCrypto.createHash = (alg: string) => {
    const h = orig(alg);
    const od = h.digest.bind(h);
    h.digest = (...a: any[]) => Buffer.from(od(...a));
    return h;
  };
}
