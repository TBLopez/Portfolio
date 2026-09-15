// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  // Canonical URLs, og:url and the sitemap all derive from this.
  site: 'https://tonykl.com',
  integrations: [tailwind({ applyBaseStyles: false })],
});
