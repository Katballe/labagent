import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" keeps every asset path relative, so the built app works from a
// GitHub Pages sub-path (user.github.io/labagent/) as well as a domain root.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    // web-llm is one large chunk, loaded only when someone picks a local model.
    chunkSizeWarningLimit: 6500,
  },
  // The database runs in a module worker (src/ai/db.worker.js).
  worker: { format: "es" },
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ["@mlc-ai/web-llm"],
  },
});
