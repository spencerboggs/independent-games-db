import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves project sites from /<repository>/. Set SITE_BASE to "/"
// for a user site or a custom domain.
const base = process.env.SITE_BASE ?? "/independent-games-db";

export default defineConfig({
  site: "https://spencerboggs.github.io",
  base,
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
