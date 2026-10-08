@echo off
rem Dhirise: local dev server. Astro serves the funnel pages on http://localhost:4321 (run "pnpm install" once first).
cd /d "%~dp0"
start "" http://localhost:4321/dhiinterviews/landing.html
pnpm dev
