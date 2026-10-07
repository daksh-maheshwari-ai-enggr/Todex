import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built site works from any static host or subpath.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
