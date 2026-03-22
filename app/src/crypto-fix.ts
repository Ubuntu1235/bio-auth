// @ts-nocheck
import { Buffer } from "buffer";
window.Buffer = Buffer;
globalThis.Buffer = Buffer;

// Patch Uint8Array.prototype to add reduce if missing (shouldn't be, but just in case)
if (!Uint8Array.prototype.reduce) {
  Uint8Array.prototype.reduce = Array.prototype.reduce;
}

// Ensure all TypedArrays have reduce
for (const TypedArray of [Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array]) {
  if (!TypedArray.prototype.reduce) {
    TypedArray.prototype.reduce = Array.prototype.reduce;
  }
}
