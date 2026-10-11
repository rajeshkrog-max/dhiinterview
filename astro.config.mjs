// @ts-check
// Static output only (no server adapter). Convex is the backend, Cloudflare Pages hosts the files.
// The survey lives under /dhiinterviews (src/pages/dhiinterviews, public/dhiinterviews). The main address
// is kept free for a separate dashboard app later; for now public/_redirects sends "/" to the landing page.
// build.format "file" keeps the existing page names (landing.html, done.html, ...), because the page
// scripts and the invite links already point at them. Pages are linked with relative paths, so no base is set.
import { defineConfig } from 'astro/config';
import { existsSync, readFileSync } from 'node:fs';

// Local development only: send /api/auth/* (and /api/files, /api/render, /api/team, /api/avatar, /api/shared, /api/referral) to the Convex dev deployment, like functions/api does in
// production. The address comes from .env.local, which `convex dev` writes (git ignored).
const convexSite =
  process.env.CONVEX_SITE_URL ??
  (existsSync('.env.local')
    ? readFileSync('.env.local', 'utf8').match(/^CONVEX_SITE_URL=(\S+)/m)?.[1]
    : undefined);

// Local development only: the same rewrite as public/_redirects (`/s/* → /dhiinterviews/shared`, status 200), so a private report link
// opens under `pnpm dev` too. The address stays /s/<code>; the page is served in its place.
/** @type {import('vite').Plugin} */
const sharedRewrite = {
  name: 'dhirise-shared-rewrite',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/s\//.test(req.url)) req.url = '/dhiinterviews/shared.html';
      next();
    });
  },
};

export default defineConfig({
  output: 'static',
  build: { format: 'file' },
  trailingSlash: 'ignore',
  compressHTML: false,
  vite: {
    plugins: [sharedRewrite],
    server: {
      proxy: convexSite
        ? {
            '/api/auth': {
              target: convexSite,
              changeOrigin: true,
              xfwd: true,
              headers: { 'x-better-auth-forwarded-host': 'localhost:4321', 'x-better-auth-forwarded-proto': 'http' },
            },
            // the saved report PDF (spec 0006): the student's download and the render page's data, like functions/api/files and render
            '/api/files': { target: convexSite, changeOrigin: true },
            '/api/render': { target: convexSite, changeOrigin: true },
            // the team list and the team's report viewer (spec 0008), like functions/api/team
            '/api/team': { target: convexSite, changeOrigin: true },
            // the stored Google profile picture (spec 0011), like functions/api/avatar
            '/api/avatar': { target: convexSite, changeOrigin: true },
            // the private report link's data (spec 0010), like functions/api/shared
            '/api/shared': { target: convexSite, changeOrigin: true },
            // the public code check of the live challenge (spec 0016), like functions/api/referral (the real one also adds x-visitor)
            '/api/referral': { target: convexSite, changeOrigin: true },
          }
        : {},
    },
  },
});
