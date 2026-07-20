import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: Vite serves the client on 5173 and proxies API + WebSocket to the
// Node server on 3000. Prod: `vite build` emits to dist/, and the Node
// server serves those static files itself (no Vite).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
