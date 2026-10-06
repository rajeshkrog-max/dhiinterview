# Dhirise · Manas Darpan (Mind Mirror)

An 18-question student entry assessment by Dhirise. It reads Prakriti (Vata / Pitta / Kapha), Manas (Sattva / Rajas / Tamas) and chakra balance through everyday questions, then walks the student through a 10-slide reflection and a one-page summary.

## Run it

**Easiest:** double-click `index.html` (Chrome or Edge). Fonts load from Google Fonts when online; everything else is local.

**On localhost:** double-click `start-dhirise.bat`, or from this folder run:

```bash
python -m http.server 8081
```

Then open http://localhost:8081. **Always use port 8081** (8080 belongs to the Sera project). The browser keeps saved sessions per address, so a different port or `file://` starts with an empty list. Use Export/Import (JSON) to move sessions between them.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Student screen markup |
| `panel.html` | Private interviewer panel markup |
| `css/styles.css` | All styles, including the A4 print sheet |
| `js/data.js` | All text: questions, chakras, doshas, mixed types, gunas, flags, talking points |
| `js/app.js` | Scoring, report builder and the student screen |
| `js/panel.js` | Interviewer panel |
| `report.html`, `css/report.css`, `js/report.js` | Parent Report (light, printable A4) |
| `js/reportContent.js` | All Parent Report text: plain language, no internal terms |
| `js/config.js` | **Your details for the Parent Report**: phone, email, website, address, default interviewer |
| `js/vendor/html2pdf.bundle.min.js` | html2pdf.js 0.14.0 (MIT), stored locally: no CDN at runtime |
| `assets/dhirise-logo.png` | Logo with transparent background (made from `dhirise-logo.jpeg`, which is the fallback) |
| `assets/dhirise-logo-data.js` | Same logo embedded, so PDFs include it even when opened from `file://` |

## During the interview

Nothing host-side is shown to the student. Press **H** (or click the faint gear in the bottom-right corner) for the host menu:

- **I**: open the interviewer panel in a new window. Share only the main window; the panel stays private and updates live.
- **F**: full screen.
- **New student**, **Export sessions (CSV)**, **Reset counts**.

Student keys (work but aren't shown): `1`–`4` choose, `→` / `Enter` next, `←` back. On the report, `←` / `→` move between slides.

The interviewer panel shows the current question and answer live, all 18 answers with the dosha and guna each points to, flags with suggested gentle lines, follow-up questions per chakra and talking points for each report slide. **Copy summary** copies a clean text summary; **Save report as PDF** prints the A4 summary.

## PDF reports

- **On the report screen**, two small buttons sit at the bottom-right, next to the gear: **Download Session Report** (the dark on-screen report as a PDF, `Dhirise_Session_<Name>_<date>.pdf`) and **Prepare Parent Report** (opens `report.html` for that student).
- **Parent Report** (`report.html`): fill in interviewer name, note, parent name, class, stream and pronoun in the left toolbar, then **Download PDF** (`Dhirise_Report_<Name>_<date>.pdf`) or **Print**. The toolbar never appears in the PDF.
- **Host menu → Reports** lists every saved student, so you can download either PDF again later.

## Keeping session data safe

- **Autosave:** the session is saved after every answer. After a refresh or crash, the welcome screen offers “Resume <Name>’s session?”.
- **Automatic backup:** when a session completes, `Dhirise_Session_<Name>_<date>.json` downloads automatically.
- **Host menu → Export all sessions (JSON)** saves everything; **Import sessions (JSON)** merges a file back in. It accepts the export, the per-session backups and `recovery/` files. Sessions already saved are skipped, never overwritten.
- `recovery/` holds student data recovered from the browser and is git-ignored, so it never reaches GitHub.

## About the percentages and data

The "% of students" figures start from indicative estimates and blend in every completed session saved in this browser. Each completed session (name, class, stream, date, answers, results) is also stored locally and can be exported as CSV from the host menu. Present from the same computer and browser so the numbers build up.
