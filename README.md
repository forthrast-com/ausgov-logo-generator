# AusGov Logo Generator

A small, dependency-free web tool for generating Australian Government–style
logo lockups: coat of arms (or a custom image) plus up to three lines of text,
in inline / stacked / strip layout variants, exportable as PNG, JPEG, or SVG.

**Live:** https://agl.forthrast.com

## Features

- Four layout variants: inline, inline strip, stacked, stacked strip
- Text modes: department, initiative, hierarchy, free entry
- Custom logo and background colours, optional transparent background
- Custom image upload (PNG/JPEG/SVG) with sensible sizing rules
- Logo library: save named presets to localStorage, export/import as JSON
- Shareable URLs: the address bar always encodes the current design
- Typography controls (font, secondary size ratio, letter spacing),
  tucked into the Library & Typography drawer
- Balanced text wrapping; explicit line breaks honoured everywhere
- Isolation-zone preview (clear space of half the arms height, per the
  brand clear-space rule)
- Scale slider with export PPI readout; exported PNGs carry a matching
  pHYs density chunk
- PNG / JPEG / SVG export with auto-generated filenames, plus
  copy-to-clipboard for PNG and share link
- Preview backdrop toggle: checkerboard / white / dark

## Architecture

Plain HTML + CSS + vanilla JS, no build step. The logo is generated as an SVG
string (single source of truth in `buildLogoSVG`), rendered to a canvas for
the live preview and raster exports, or downloaded directly for SVG export.

```
index.html          UI shell
src/logo_core.js    pure logic (wrapping, visibility, serialisation, PNG pHYs)
src/app.js          state, layout maths, SVG emission, exports, library
src/style.css       controls panel + preview styling
assets/             coat of arms SVG, favicon
tests/              node:test suite for logo_core
flake.nix           dev shell (node for tests, python for serving)
```

Share links carry text, colours, and typography — not uploaded images
(data URIs don't fit in a URL). Custom images persist via library
presets and their JSON export instead.

## Running locally

Any static file server works:

```sh
nix develop -c python3 -m http.server 8000
# then open http://localhost:8000
```

(A server is needed because the coat of arms is fetched at runtime;
`file://` will hit CORS.)

## Tests

```sh
nix develop -c node --test tests/logo_core.test.js
```

## Disclaimer

Unofficial tool, not affiliated with the Australian Government. Use of the
Commonwealth Coat of Arms is subject to
[PM&C guidelines](https://www.pmc.gov.au/resources/commonwealth-coat-arms-information-and-guidelines).
