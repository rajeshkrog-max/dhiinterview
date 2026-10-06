# Dhirise · Manas Darpan (Mind Mirror)

An 18-question student entry assessment by Dhirise. It reads Prakriti (Vata / Pitta / Kapha), Manas (Sattva / Rajas / Tamas) and chakra balance through everyday questions, then walks the student through a 10-slide reflection and a one-page summary.

## Run it

**Easiest:** double-click `index.html` (Chrome or Edge). Fonts load from Google Fonts when online; everything else is local.

**On localhost** (optional), from this folder:

```bash
python -m http.server 8080
```

Then open http://localhost:8080.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Student screen markup |
| `panel.html` | Private interviewer panel markup |
| `css/styles.css` | All styles, including the A4 print sheet |
| `js/data.js` | All text: questions, chakras, doshas, mixed types, gunas, flags, talking points |
| `js/app.js` | Scoring, report builder and the student screen |
| `js/panel.js` | Interviewer panel |
| `assets/dhirise-logo.svg` | Dhirise mark |

## During the interview

Nothing host-side is shown to the student. Press **H** (or click the faint gear in the bottom-right corner) for the host menu:

- **I**: open the interviewer panel in a new window. Share only the main window; the panel stays private and updates live.
- **F**: full screen.
- **New student**, **Export sessions (CSV)**, **Reset counts**.

Student keys (work but aren't shown): `1`–`4` choose, `→` / `Enter` next, `←` back. On the report, `←` / `→` move between slides.

The interviewer panel shows the current question and answer live, all 18 answers with the dosha and guna each points to, flags with suggested gentle lines, follow-up questions per chakra and talking points for each report slide. **Copy summary** copies a clean text summary; **Save report as PDF** prints the A4 summary.

## About the percentages and data

The "% of students" figures start from indicative estimates and blend in every completed session saved in this browser. Each completed session (name, class, stream, date, answers, results) is also stored locally and can be exported as CSV from the host menu. Present from the same computer and browser so the numbers build up.
