# AusGov Logo Generator — Claude Code Spec

## Overview

Build a single-page vanilla JS application that generates Australian Government–style logos following the [PM&C Australian Government Branding Guidelines (2024)](https://www.pmc.gov.au/sites/default/files/resource/download/australian-government-branding-guidelines-2024.pdf).

The app should also support **custom image uploads** so users can recreate logos for any entity using the same layout system (e.g. historical logos like NEMMCO).

Serve via `python3 -m http.server` or equivalent. **Zero dependencies** — no React, no npm, no build step. Single `index.html` with inline `<style>` and `<script>`.

---

## Logo Anatomy

The official Australian Government logo consists of four elements:

1. **Image** — Commonwealth Coat of Arms (Conventional Version 3A Solid, monochrome). Users can upload a custom image (PNG, SVG, JPG) to replace this.
2. **Line 1** — "Australian Government" in **Times New Roman Bold** (or user-editable text)
3. **Underline** — a horizontal rule beneath Line 1
4. **Line 2** — Department/agency name in **Times New Roman Bold**, slightly smaller than Line 1

All elements must render in a **single colour**. The full-colour Coat of Arms is never used in the logo.

---

## Layout Variants

Support all four official variants via a dropdown selector:

### 1. Inline (default)
Coat of Arms on the left. To its right (separated by a vertical rule): Line 1, underline, Line 2 — all left-aligned and vertically centred against the image.

### 2. Inline Strip
Same as Inline but the text is arranged as a single horizontal strip — "Australian Government" and department name separated by the underline, all on one visual line.

### 3. Stacked
Coat of Arms centred above the text block. Line 1, underline, Line 2 are centred beneath.

### 4. Stacked Strip
Coat of Arms to the left; text stacked vertically to the right with underline, but in a more compact arrangement than standard Inline.

---

## Text Modes

Support these modes via a dropdown:

| Mode | Line 1 | Underline | Line 2 | Line 3 |
|------|--------|-----------|--------|--------|
| **Department** (default) | "Australian Government" | Yes | Department name (editable) | — |
| **Government Only** | "Australian Government" | No | — | — |
| **Initiative** | "An Australian Government Initiative" | No | — | — |
| **Hierarchy** | "Australian Government" | Yes | Department name (editable) | Division/branch name (editable) |

In Department and Hierarchy modes, Line 1 is locked to "Australian Government".

---

## Typography

- **Font**: `"Times New Roman", "Times", serif` — this is the actual specified font per PM&C guidelines, not an approximation
- **Weight**: Bold for all text elements
- **Sizing**: Line 1 is larger than Line 2. Line 3 (if present) is the same size as Line 2
- Sensible default sizes — aim for Line 1 at ~18pt equivalent, Line 2 at ~12pt, but scale proportionally with the overall size control

---

## Colour Rules

Per the PM&C guidelines:

- **All elements** (image, text, rules) must be the **same single colour**
- Default: black (`#000000`)
- The colour applies uniformly: coat of arms, text, underline, vertical rule (in inline variants)
- For the default Coat of Arms SVG, apply the colour via CSS `filter` or by modifying SVG fill
- For uploaded raster images (PNG/JPG), do NOT recolour — display as-is. Only recolour SVG uploads and the default arms

### Reverse Mode
- Toggle to swap foreground/background
- White (or chosen colour) on dark background
- Never low-contrast (pastel on light, dark on dark)
- Background colour picker available for preview and raster export

---

## Custom Image Upload

- Accept `.png`, `.svg`, `.jpg` via file input
- Uploaded image replaces the Coat of Arms position
- Preserve uploaded image's aspect ratio
- Scale to match the height of the text block (or a user-adjustable image height)
- "Reset to default" button restores the Coat of Arms
- For SVG uploads: recolour fills to match the selected logo colour
- For raster uploads: display as-is (no recolouring) — the single-colour rule is relaxed for custom images

---

## Isolation Zone

The guidelines define an isolation zone of width **X**, where:

> X = distance from the top of the capital 'A' in "Australian Government" to the bottom of the underline beneath it

This zone is the **minimum clear space** on all sides of the logo. Enforce this in:
- The canvas/SVG preview (as padding)
- Exported files (as margin around the logo)

Visualise the isolation zone as a toggleable dashed border in the preview.

---

## Controls Panel

Left sidebar or top panel with:

1. **Layout variant** — dropdown: Inline / Inline Strip / Stacked / Stacked Strip
2. **Text mode** — dropdown: Department / Government Only / Initiative / Hierarchy
3. **Line 1 text** — input (locked to "Australian Government" in Department/Hierarchy modes; editable in others)
4. **Line 2 text** — input (department name, default: "Department of Posting")
5. **Line 3 text** — input (division name, only visible in Hierarchy mode)
6. **Logo colour** — colour picker (single colour for all elements, default: #000000)
7. **Reverse mode** — toggle checkbox
8. **Background colour** — colour picker (default: #FFFFFF, used in preview and raster export)
9. **Image upload** — file input (accept: `.png,.svg,.jpg,.jpeg`)
10. **Reset image** — button to restore default Coat of Arms
11. **Scale** — range slider (0.5x to 3x, default 1x)
12. **Show isolation zone** — toggle checkbox (dashed border preview)
13. **Export buttons** — PNG, JPEG, SVG

---

## Live Preview

- Central area showing the rendered logo at current settings
- Updates in real time as controls change
- Chequered/transparent background option for PNG preview
- Render using a combination of HTML/CSS for preview, canvas for raster export, and SVG DOM construction for SVG export

---

## Export

### PNG / JPEG
- Render to an offscreen `<canvas>` at 2x resolution (for retina clarity)
- Use `canvas.toBlob('image/png')` or `canvas.toBlob('image/jpeg', 0.95)`
- Trigger download via temporary `<a>` element

### SVG
- Construct SVG DOM programmatically:
  - `<image>` element with base64-encoded image data for the arms/uploaded image
  - `<text>` elements for each line (font-family: Times New Roman, font-weight: bold)
  - `<line>` or `<rect>` for the underline and vertical rule
- Serialise via `new XMLSerializer().serializeToString(svgElement)`
- Download as blob

### Filename
Pattern: `logo-{timestamp}.{ext}` (e.g. `logo-20260322-143000.png`)

---

## Default Coat of Arms

Bundle a public domain SVG of the **Commonwealth Coat of Arms, Conventional Version 3A Solid** (monochrome/single-colour version).

Source options:
- Wikimedia Commons: search for the conventional/simplified version
- Trace from the PM&C guidelines PDF

The SVG should be a single-colour path (black by default) so it can be easily recoloured by changing fill attributes.

Embed inline in the HTML as a base64 data URI or as an inline `<svg>` element stored in a JS constant.

---

## Styling the App Itself

- Clean, minimal UI — this is a utility tool
- Use system fonts for the app chrome (not Times New Roman — that's only for the logo output)
- Light grey background, white preview area
- Responsive: should work on desktop and tablet
- No dark mode needed for the app itself (dark mode is for the logo preview via reverse toggle)

---

## File Structure

```
index.html          ← everything in one file
```

That's it. Single file. Inline styles, inline script, inline SVG for the default coat of arms.

---

## Nice-to-Haves (stretch goals)

- Undo/redo for text changes
- Preset dropdown with real department names (e.g. "Department of the Prime Minister and Cabinet", "Department of Defence", etc.)
- Copy SVG to clipboard button
- Drag-and-drop image upload
- Keyboard shortcut for export (Ctrl+Shift+E)
