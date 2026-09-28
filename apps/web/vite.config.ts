import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Single-page app with no route-based code-splitting yet; the default
    // 500kb warning threshold is otherwise tripped by Radix UI's Select primitive.
    chunkSizeWarningLimit: 600,
  },
});
