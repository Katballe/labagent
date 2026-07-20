import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" keeps every asset path relative, so the built app works from a
// GitHub Pages sub-path (user.github.io/labagent/) AND when opened locally.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 4000,
  },
  server: {
    port: 5173,
    host: true,
  },
  optimizeDeps: {
    exclude: ["@mlc-ai/web-llm"],
  },
});
