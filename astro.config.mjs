// @ts-check
// Static output only (no server adapter). Convex is the backend, Cloudflare Pages hosts the files.
// The survey lives under /dhiinterviews (src/pages/dhiinterviews, public/dhiinterviews). The main address
// is kept free for a separate dashboard app later; for now public/_redirects sends "/" to the landing page.
// build.format "file" keeps the existing page names (landing.html, done.html, ...), because the page
// scripts and the invite links already point at them. Pages are linked with relative paths, so no base is set.
import { defineConfig } from 'astro/config';
import { existsSync, readFileSync } from 'node:fs';

// Local development only: send /api/auth/* to the Convex dev deployment, like functions/api/auth does in
// production. The address comes from .env.local, which `convex dev` writes (git ignored).
const convexSite =
  process.env.CONVEX_SITE_URL ??
  (existsSync('.env.local')
    ? readFileSync('.env.local', 'utf8').match(/^CONVEX_SITE_URL=(\S+)/m)?.[1]
    : undefined);

export default defineConfig({
  output: 'static',
  build: { format: 'file' },
  trailingSlash: 'ignore',
  compressHTML: false,
  vite: {
    server: {
      proxy: convexSite
        ? {
            '/api/auth': {
              target: convexSite,
              changeOrigin: true,
              xfwd: true,
              headers: { 'x-better-auth-forwarded-host': 'localhost:4321', 'x-better-auth-forwarded-proto': 'http' },
            },
          }
        : {},
    },
  },
});
