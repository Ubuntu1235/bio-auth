// @ts-nocheck
import { Buffer } from "buffer";
window.Buffer = Buffer;

try {
  const c = require("crypto");
  if (c && c.createHash) {
    const o = c.createHash;
    c.createHash = function(a) {
      const h = o.call(c, a);
      const d = h.digest.bind(h);
      h.digest = function() {
        const r = d.apply(this, arguments);
        if (r && !r.reduce) return Buffer.from(r);
        return r;
      };
      return h;
    };
  }
} catch(e) {}
