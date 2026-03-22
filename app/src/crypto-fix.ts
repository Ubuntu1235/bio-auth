// @ts-nocheck
import { Buffer } from "buffer";
window.Buffer = Buffer;
globalThis.Buffer = Buffer;

// The SDK's RescueCipher uses crypto.createHash('sha256').
// crypto-browserify returns Uint8Array from digest(), but SDK
// code expects something with .reduce(). Buffer has .reduce().
// Fix: intercept crypto module and wrap digest output in Buffer.
const _crypto = require("crypto");
if (_crypto && _crypto.createHash) {
  const _origCreateHash = _crypto.createHash.bind(_crypto);
  _crypto.createHash = function(algorithm) {
    const hash = _origCreateHash(algorithm);
    const _origDigest = hash.digest.bind(hash);
    hash.digest = function(encoding) {
      if (encoding) return _origDigest(encoding);
      const result = _origDigest();
      return Buffer.from(result);
    };
    const _origUpdate = hash.update.bind(hash);
    hash.update = function(data, encoding) {
      if (data instanceof Uint8Array && !(Buffer.isBuffer(data))) {
        return _origUpdate(Buffer.from(data), encoding);
      }
      return _origUpdate(data, encoding);
    };
    return hash;
  };
}

// Also patch createCipheriv and createDecipheriv
if (_crypto && _crypto.createCipheriv) {
  const _origCipher = _crypto.createCipheriv.bind(_crypto);
  _crypto.createCipheriv = function(alg, key, iv) {
    const k = Buffer.isBuffer(key) ? key : Buffer.from(key);
    const i = Buffer.isBuffer(iv) ? iv : Buffer.from(iv);
    const c = _origCipher(alg, k, i);
    const _origUpdate = c.update.bind(c);
    const _origFinal = c.final.bind(c);
    c.update = function(data) {
      const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
      return Buffer.from(_origUpdate(d));
    };
    c.final = function() {
      return Buffer.from(_origFinal());
    };
    return c;
  };
}

if (_crypto && _crypto.createDecipheriv) {
  const _origDecipher = _crypto.createDecipheriv.bind(_crypto);
  _crypto.createDecipheriv = function(alg, key, iv) {
    const k = Buffer.isBuffer(key) ? key : Buffer.from(key);
    const i = Buffer.isBuffer(iv) ? iv : Buffer.from(iv);
    const c = _origDecipher(alg, k, i);
    const _origUpdate = c.update.bind(c);
    const _origFinal = c.final.bind(c);
    c.update = function(data) {
      const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
      return Buffer.from(_origUpdate(d));
    };
    c.final = function() {
      return Buffer.from(_origFinal());
    };
    return c;
  };
}
