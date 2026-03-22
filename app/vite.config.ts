import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["crypto", "buffer", "stream", "util", "process", "events", "string_decoder", "vm", "assert"],
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  define: { "process.env": {} },
  build: {
    rollupOptions: {
      external: ["fs"],
    },
  },
});
