import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // En desarrollo, el backend FastAPI corre en :8000
      "/api": "http://localhost:8000",
    },
  },
});
