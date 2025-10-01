import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/<NOME_REPO>/",
  plugins: [react()],
  build: { outDir: "dist" }
});
