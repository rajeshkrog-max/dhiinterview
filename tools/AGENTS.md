# Tools (lead sheet and image prep)

## Overview

Helpers that run outside the pages. `lead-sheet.gs` is the Google Apps Script that receives leads and feedback into a Google Sheet. The Python scripts make web sized images for the pages. Nothing here is loaded by the funnel in the browser.

## Key files

| File | Owns |
|---|---|
| `lead-sheet.gs` | Web app receiver. `doPost` writes leads (from `done.html`) to a **Leads** tab and `{type:"feedback"}` posts (from the report) to a **Feedback** tab. |
| `LEAD-SHEET-SETUP.md` | The 5 step setup and redeploy notes. |
| `prepare_report_slides.py` | Builds `assets/report/web/slideN.webp` and `.jpg` (max 1080 px wide) for `who.html` from `assets/report/slideN.png`. |
| `prepare_cards.py` | Retired. Built the old frame card art into `assets/cards/_unused/final/`. Kept for reference. |

## Commands

```bash
# Run from the project root. Needs Python with Pillow (and numpy for prepare_cards.py)
python tools/prepare_report_slides.py
```

## Conventions

- The pages send JSON as `text/plain` with `no-cors`, so the script reads `e.postData.contents`. Keep it that way.
- New sheet columns go last, so older sheets keep their layout.
- Original `.png` files are never changed; the scripts only write copies.

## Gotchas

- After editing `lead-sheet.gs`, redeploy with **Deploy, Manage deployments, Edit, New version**. Otherwise the old version keeps running. The URL stays the same.
- The sheet holds phone numbers and comments. Share it only with people who need it, and never commit exports.
- The `/exec` URL goes in `js/funnel-config.js` at deploy time, and that file stays empty in the repo.
- `AREAS` and `INDICES` in the script mirror `js/engine/score.js`. Keep them in step.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
