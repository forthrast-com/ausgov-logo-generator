# AusGov Logo Generator

A small, dependency-free web tool for generating Australian Government–style
logo lockups: coat of arms (or a custom image) plus up to three lines of text,
in inline / stacked / strip layout variants, exportable as PNG, JPEG, or SVG.

**Live:** https://agl.forthrast.com

## Features

- Four layout variants: inline, inline strip, stacked, stacked strip
- Text modes: department, government only, initiative, hierarchy, free entry
- Custom logo colour, background colour, and reverse mode
- Custom image upload (PNG/JPEG/SVG) with sensible sizing rules
- Scale slider with export PPI readout
- Isolation-zone preview
- PNG / JPEG / SVG export with auto-generated filenames

## Architecture

Plain HTML + CSS + vanilla JS, no build step. The logo is generated as an SVG
string (single source of truth in `buildLogoSVG`), rendered to a canvas for
the live preview and raster exports, or downloaded directly for SVG export.

```
index.html      UI shell
src/app.js      state, layout maths, SVG generation, export
src/style.css   controls panel + preview styling
assets/         coat of arms SVG, favicon
```

## Running locally

Any static file server works:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

(A server is needed because the coat of arms is fetched at runtime;
`file://` will hit CORS.)

## Disclaimer

Unofficial tool, not affiliated with the Australian Government. Use of the
Commonwealth Coat of Arms is subject to
[PM&C guidelines](https://www.pmc.gov.au/resources/commonwealth-coat-arms-information-and-guidelines).
