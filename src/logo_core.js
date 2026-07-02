// Pure logic shared by the browser app and the node test suite.
// No DOM access: text measurement comes in as an injected measure(text) -> px
// function, so tests can use a fake measurer and the app can bind a canvas.
//
// IIFE-wrapped: classic scripts share one global lexical scope, so top-level
// const/function declarations here would collide with app.js redeclaring the
// same names when it destructures globalThis.logo_core.
(() => {
const AUSTRALIAN_GOV_TEXT = 'Australian Government';

// ============================================================================
// Text Wrapping
// ============================================================================

// Greedy first-fit wrap of one paragraph's words
function greedyWrap(measure, words, maxWidth) {
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (measure(testLine) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function wrapText(measure, text, maxWidth) {
  // First split on explicit line breaks, then wrap each paragraph
  const paragraphs = text.split('\n');
  const lines = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      // Empty line - preserve it
      lines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let wrapped = greedyWrap(measure, words, maxWidth);

    // Balance multi-line wraps: binary-search the narrowest width that still
    // fits in the same number of lines, so "...Regional Development and /
    // Local Government" becomes two lines of similar length instead of one
    // long and one short
    if (wrapped.length > 1 && isFinite(maxWidth)) {
      const lineCount = wrapped.length;
      let lo = Math.max(...words.map(measure));
      let hi = maxWidth;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (greedyWrap(measure, words, mid).length > lineCount) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      wrapped = greedyWrap(measure, words, hi);
    }

    lines.push(...wrapped);
  }

  return lines;
}

// ============================================================================
// Element Visibility
// ============================================================================

// Which logo elements to show, applying empty-check logic consistently
// across all text modes
function getVisibleElements(textMode, line1, line2, line3) {
  const line1Empty = !line1.trim();
  const line2Empty = !line2.trim();
  const line3Empty = !line3.trim();

  let hasLine1, hasLine2, hasLine3;

  switch (textMode) {
    case 'initiative':
      hasLine1 = !line1Empty;
      hasLine2 = false;
      hasLine3 = false;
      break;
    case 'department':
      hasLine1 = !line1Empty;
      hasLine2 = !line2Empty;
      hasLine3 = false;
      break;
    case 'hierarchy':
    case 'free':
    default:
      hasLine1 = !line1Empty;
      hasLine2 = !line2Empty;
      hasLine3 = !line3Empty;
      break;
  }

  // Underline shows when Line 1 exists AND there's content below it
  const hasUnderline = hasLine1 && (hasLine2 || hasLine3);

  return { hasLine1, hasLine2, hasLine3, hasUnderline };
}

// ============================================================================
// Filenames & Escaping
// ============================================================================

function generateFilename(line1, line2, line3) {
  // Skip standard government text, use first custom/meaningful line
  const standardTexts = ['australian government', 'an australian government initiative'];
  const line1Lower = line1.trim().toLowerCase();

  let name;
  if (!standardTexts.includes(line1Lower) && line1.trim()) {
    name = line1;
  } else if (line2.trim()) {
    name = line2;
  } else if (line3.trim()) {
    name = line3;
  } else {
    name = 'logo';
  }

  // Sanitize: lowercase, replace non-alphanumeric with hyphens, trim hyphens
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'logo';
}

function escapeXml(str) {
  return str.replace(/[<>&'"]/g, c => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  }[c]));
}

// ============================================================================
// Shareable-URL State Serialisation
// ============================================================================

const PARAM_MAP = {
  layout: 'l',
  textMode: 'm',
  line1: 't1',
  line2: 't2',
  line3: 't3',
  logoColor: 'fg',
  bgColor: 'bg',
  scale: 'sc',
  transparentBg: 'tr',
  fontFamily: 'ff',
  fontScale2: 'fs',
  letterSpacing: 'ls'
};

// Only non-default values go into the URL, to keep share links short
function stateToParams(state, defaults) {
  const params = new URLSearchParams();
  for (const [key, short] of Object.entries(PARAM_MAP)) {
    const value = state[key];
    if (value === defaults[key]) continue;
    params.set(short, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  return params;
}

// Types are recovered from the defaults object; malformed numbers are dropped
function paramsToState(params, defaults) {
  const out = {};
  for (const [key, short] of Object.entries(PARAM_MAP)) {
    if (!params.has(short)) continue;
    const raw = params.get(short);
    const def = defaults[key];
    if (typeof def === 'boolean') {
      out[key] = raw === '1';
    } else if (typeof def === 'number') {
      const n = parseFloat(raw);
      if (!Number.isNaN(n)) out[key] = n;
    } else {
      out[key] = raw;
    }
  }
  return out;
}

// ============================================================================
// Colour
// ============================================================================

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// WCAG relative-luminance contrast ratio (1..21), or null for unparseable
// colours. Used to flag combos the guidelines prohibit (pastel on light,
// dark on dark, tints).
function contrastRatio(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return null;

  const channel = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = ([r, g, bl]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(bl);

  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Recolour a monochrome SVG (the Conventional 3A Solid arms) so the whole
// logo stays single-colour per the guidelines. Dark fills (and inherited
// defaults, via a root fill) take the logo colour; white fills are knockout
// detail - crown, stars, shield voids - and map to the knockout colour
// (normally the background), which is how the official reversed logo works.
// fill="none" stays untouched.
function recolourSvg(svgText, colour, knockout = '#ffffff') {
  const isWhite = (v) => /^(#fff(fff)?|white)$/i.test(v.trim());
  const isNone = (v) => /^none$/i.test(v.trim());
  const map = (v) => (isWhite(v) ? knockout : colour);

  return svgText
    .replace(/fill="([^"]*)"/gi, (m, v) => isNone(v) ? m : `fill="${map(v)}"`)
    .replace(/fill:([^;"'}]*)/gi, (m, v) => isNone(v) ? m : `fill:${map(v)}`)
    .replace(/stroke="([^"]*)"/gi, (m, v) => isNone(v) ? m : `stroke="${map(v)}"`)
    .replace(/stroke:([^;"'}]*)/gi, (m, v) => isNone(v) ? m : `stroke:${map(v)}`)
    .replace(/<svg\b(?![^>]*\bfill=)/i, `<svg fill="${colour}"`);
}

// ============================================================================
// PNG Metadata (pHYs chunk)
// ============================================================================

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Insert a pHYs chunk (physical pixel density) right after IHDR, so exported
// PNGs actually carry the PPI the UI promises. Canvas-produced PNGs have no
// density chunk of their own.
function pngWithPpi(pngBytes, ppi) {
  const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (pngBytes[i] !== SIGNATURE[i]) return pngBytes; // not a PNG; leave it
  }

  const pixelsPerMetre = Math.round(ppi / 0.0254);
  const chunk = new Uint8Array(21); // 4 length + 4 type + 9 data + 4 crc
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
  view.setUint32(8, pixelsPerMetre);
  view.setUint32(12, pixelsPerMetre);
  chunk[16] = 1; // unit: metres
  view.setUint32(17, crc32(chunk.subarray(4, 17)));

  // IHDR is always first: 8 signature + 4 length + 4 type + 13 data + 4 crc
  const insertAt = 33;
  const out = new Uint8Array(pngBytes.length + chunk.length);
  out.set(pngBytes.subarray(0, insertAt));
  out.set(chunk, insertAt);
  out.set(pngBytes.subarray(insertAt), insertAt + chunk.length);
  return out;
}

// ============================================================================
// Exports (node for tests, globalThis for the browser)
// ============================================================================

const logo_core = {
  AUSTRALIAN_GOV_TEXT,
  greedyWrap,
  wrapText,
  getVisibleElements,
  generateFilename,
  escapeXml,
  stateToParams,
  paramsToState,
  contrastRatio,
  recolourSvg,
  crc32,
  pngWithPpi
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = logo_core;
} else {
  globalThis.logo_core = logo_core;
}
})();
