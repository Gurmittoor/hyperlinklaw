import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",                 // important behind Cloudflare/Vercel
  build: { outDir: "dist" }
});
