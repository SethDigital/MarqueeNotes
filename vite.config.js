import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the built app works from a domain root or a subfolder
  // (e.g. GitHub Pages project sites).
  base: "./",
  plugins: [react()],
});
