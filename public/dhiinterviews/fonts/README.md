# Mukta, hosted by DhiRise

Mukta by Girish Dalvi and Ek Type, SIL Open Font License 1.1 (see `OFL.txt`, which must stay beside these files).
Source files: https://github.com/google/fonts/tree/main/ofl/mukta (Mukta-Regular.ttf, Mukta-SemiBold.ttf, Mukta-Bold.ttf).

Each `woff2` here is a Latin subset (Basic Latin, Latin 1, and the symbols the pages use). Made with fonttools:

    pip install fonttools brotli
    U="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2190,U+20B9"
    pyftsubset Mukta-Regular.ttf  --unicodes="$U" --flavor=woff2 --layout-features='*' --output-file=mukta-400.v1.woff2
    pyftsubset Mukta-SemiBold.ttf --unicodes="$U" --flavor=woff2 --layout-features='*' --output-file=mukta-600.v1.woff2
    pyftsubset Mukta-Bold.ttf     --unicodes="$U" --flavor=woff2 --layout-features='*' --output-file=mukta-700.v1.woff2

Rules:
- `public/_headers` caches these files for a year as immutable. If a font file changes, give it a new name (`v2`) and
  update `css/frame.css`. Never replace a file in place.
- Devanagari and other scripts are not included; text in them falls back to the system font.
