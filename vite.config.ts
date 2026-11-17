import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    // WRANGLER_CONFIG points at a personal config (e.g. wrangler.mine.jsonc, git-ignored)
    // that holds your own database id, domain and Access settings.
    cloudflare({ configPath: process.env.WRANGLER_CONFIG || "wrangler.jsonc" }),
  ],
});
