const {
  AUSTRALIAN_GOV_TEXT,
  wrapText,
  getVisibleElements,
  generateFilename,
  escapeXml,
  stateToParams,
  paramsToState,
  contrastRatio,
  recolourSvg,
  pngWithPpi
} = globalThis.logo_core;

// ============================================================================
// State
// ============================================================================

// Values that share links and library presets serialise
const STATE_DEFAULTS = {
  layout: 'inline',
  textMode: 'department',
  line1: 'Australian Government',
  line2: 'Department of Example',
  line3: 'Division Name',
  logoColor: '#000000',
  bgColor: '#ffffff',
  scale: 1,
  transparentBg: false,
  fontFamily: '"Times New Roman", Times, serif',
  fontScale2: 0.8,
  letterSpacing: 0
};

const SERIALISABLE_KEYS = Object.keys(STATE_DEFAULTS);

const state = {
  ...STATE_DEFAULTS,
  // Image state (CoA is just the default image)
  image: null,          // Current image data URI
  imageAspect: 1,       // width/height ratio
  imagePng: null,       // PNG version for export compatibility
  imageBaseline: null,  // Custom baseline alignment (0-1), null = center
  uploadedSvgText: null, // Raw markup of an uploaded SVG, kept for recolouring
  defaultImage: null,   // Default CoA image
  defaultImageAspect: 1,
  defaultImagePng: null,
  defaultImageBaseline: 0.62  // CoA base is 62% down
};

// DOM element references
const elements = {};
for (const id of [
  'layout', 'textMode', 'line1', 'line2', 'line3',
  'line1Group', 'line2Group', 'line3Group',
  'logoColor', 'bgColor', 'transparentBg', 'contrastWarning',
  'imageUpload', 'resetImage',
  'scale', 'scaleValue', 'ppiValue',
  'exportPNG', 'exportJPEG', 'exportSVG', 'copyPNG', 'copyLink',
  'presetName', 'savePreset', 'presetList', 'exportLibrary', 'importLibrary',
  'fontFamily', 'fontScale2', 'fontScale2Value', 'letterSpacing', 'letterSpacingValue',
  'previewImage', 'renderCanvas'
]) {
  elements[id] = document.getElementById(id);
}

// Base dimensions (before scaling)
const BASE = {
  imageHeight: 80,
  fontSize1: 20,
  padding: 20,
  gap: 12,
  underlineHeight: 1,
  underlineGap: 2,  // Small gap between Line 1 and underline
  lineSpacing: 4
};

// ============================================================================
// UI Updates
// ============================================================================

function updateTextModeUI() {
  const mode = state.textMode;
  const line1Input = elements.line1;

  switch (mode) {
    case 'department':
      line1Input.value = AUSTRALIAN_GOV_TEXT;
      line1Input.disabled = true;
      state.line1 = AUSTRALIAN_GOV_TEXT;
      elements.line2Group.classList.remove('hidden');
      elements.line3Group.classList.add('hidden');
      break;
    case 'initiative':
      line1Input.value = 'An Australian Government Initiative';
      line1Input.disabled = false;
      state.line1 = 'An Australian Government Initiative';
      elements.line2Group.classList.add('hidden');
      elements.line3Group.classList.add('hidden');
      break;
    case 'hierarchy':
      line1Input.value = AUSTRALIAN_GOV_TEXT;
      line1Input.disabled = true;
      state.line1 = AUSTRALIAN_GOV_TEXT;
      elements.line2Group.classList.remove('hidden');
      elements.line3Group.classList.remove('hidden');
      break;
    case 'free':
      line1Input.disabled = false;
      elements.line2Group.classList.remove('hidden');
      elements.line3Group.classList.remove('hidden');
      break;
  }
}

// Briefly confirm a button action without a toast framework
function flashButton(button, text) {
  const original = button.textContent;
  button.textContent = text;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
    // Restoring disabled=false may wrongly re-enable a greyed-out Copy Link
    updateCopyLinkState();
  }, 1200);
}

// ============================================================================
// Image Loading
// ============================================================================

// Load an image and get its data URI, aspect ratio, and PNG version
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const aspect = img.width / img.height || 1;

      // Create PNG version for export compatibility (SVG-in-SVG doesn't
      // render in many viewers). Rasterise at ~2000px tall so it stays crisp
      // at the 8x+ export scales, not at the SVG's small intrinsic size.
      const pngScale = Math.max(2, 2000 / (img.height || 500));
      const canvas = document.createElement('canvas');
      canvas.width = (img.width || 200) * pngScale;
      canvas.height = (img.height || 250) * pngScale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngDataUri = canvas.toDataURL('image/png');

      resolve({ dataUri: src, aspect, pngDataUri });
    };
    img.onerror = reject;
    img.src = src;
  });
}

// Raw arms markup, kept so the default image can be recoloured to the logo
// colour (the guidelines require every element in a single colour)
let defaultArmsSvgText = null;

async function recolourDefaultArms(colour, { adopt = false } = {}) {
  if (!defaultArmsSvgText) return;
  const wasCurrent = adopt || !state.image || state.image === state.defaultImage;

  // White knockouts track the background so reversed/dark-background logos
  // read like the official reversed arms; on transparent they stay white
  const knockout = state.transparentBg ? '#ffffff' : state.bgColor;
  const svgText = recolourSvg(defaultArmsSvgText, colour, knockout);
  const dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
  const { aspect, pngDataUri } = await loadImage(dataUri);

  state.defaultImage = dataUri;
  state.defaultImageAspect = aspect;
  state.defaultImagePng = pngDataUri;

  if (wasCurrent) {
    state.image = dataUri;
    state.imageAspect = aspect;
    state.imagePng = pngDataUri;
    state.imageBaseline = state.defaultImageBaseline;
  }
}

async function loadDefaultImage() {
  try {
    const response = await fetch('assets/coat-of-arms.svg');
    defaultArmsSvgText = await response.text();
    await recolourDefaultArms(state.logoColor);
    renderPreview();
  } catch (e) {
    console.error('Failed to load default image:', e);
  }
}

async function setImageFromDataUri(dataUri, baseline = null) {
  const { aspect, pngDataUri } = await loadImage(dataUri);
  state.image = dataUri;
  state.imageAspect = aspect;
  state.imagePng = pngDataUri;
  state.imageBaseline = baseline;
}

// Recolour an uploaded SVG the same way as the arms (single-colour rule:
// dark fills take the logo colour, white fills track the background).
// Raster uploads are left as-is, per the original spec.
async function recolourUploadedSvg() {
  if (!state.uploadedSvgText) return;
  const knockout = state.transparentBg ? '#ffffff' : state.bgColor;
  const svgText = recolourSvg(state.uploadedSvgText, state.logoColor, knockout);
  const dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
  await setImageFromDataUri(dataUri, null);
}

function handleImageUpload(file) {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      if (isSvg) {
        state.uploadedSvgText = e.target.result;
        await recolourUploadedSvg();
      } else {
        // Custom raster images use centered alignment (baseline null)
        state.uploadedSvgText = null;
        await setImageFromDataUri(e.target.result, null);
      }
      renderPreview();
    } catch (err) {
      console.error('Failed to load uploaded image:', err);
    }
  };
  if (isSvg) {
    reader.readAsText(file);
  } else {
    reader.readAsDataURL(file);
  }
}

// ============================================================================
// Text Measurement
// ============================================================================

// Bind a canvas context to a font so wrapping code only sees measure(text).
// Canvas letterSpacing is Chrome/Safari; elsewhere approximate it per glyph
// so measured widths still match the letter-spacing the SVG will render.
function makeMeasurer(ctx, fontSize, bold, letterSpacingPx) {
  const font = `${bold ? 'bold ' : ''}${fontSize}px ${state.fontFamily}`;
  const supportsLetterSpacing = 'letterSpacing' in ctx;
  return (text) => {
    ctx.font = font;
    if (supportsLetterSpacing) ctx.letterSpacing = `${letterSpacingPx}px`;
    const width = ctx.measureText(text).width;
    return supportsLetterSpacing ? width : width + Math.max(0, text.length - 1) * letterSpacingPx;
  };
}

// ============================================================================
// Rendering - Layout (pure geometry, no SVG)
// ============================================================================

function layoutLogo(scale) {
  const ctx = document.createElement('canvas').getContext('2d');

  const s = scale;
  const padding = BASE.padding * s;
  const imageHeight = BASE.imageHeight * s;
  const fontSize1 = BASE.fontSize1 * s;
  const fontSize2 = BASE.fontSize1 * state.fontScale2 * s;
  const gap = BASE.gap * s;
  const lineSpacing = BASE.lineSpacing * s;
  const underlineHeight = BASE.underlineHeight * s;
  const letterSpacing = state.letterSpacing * s;

  const measure1 = makeMeasurer(ctx, fontSize1, true, letterSpacing);
  const measure2 = makeMeasurer(ctx, fontSize2, true, letterSpacing);
  const measure3 = makeMeasurer(ctx, fontSize2, false, letterSpacing);

  // Determine which lines to show (unified logic for all modes)
  const visible = getVisibleElements(state.textMode, state.line1, state.line2, state.line3);
  const { hasLine1, hasLine2, hasLine3, hasUnderline } = visible;

  // Layout flags
  const isStrip = state.layout === 'inline-strip' || state.layout === 'stacked-strip';
  const isImageOnTop = state.layout === 'stacked' || state.layout === 'stacked-strip';

  // Image aspect ratio and wide image detection
  const imageAspect = state.imageAspect || 1;
  const isWide = imageAspect > 1.2;  // Wider than ~1.2:1

  // Calculate minimum image width for wide stacked images (needed for text wrapping)
  const minImageHeight = fontSize1 * 3.5;
  const minWideImageWidth = isWide && isImageOnTop ? minImageHeight * imageAspect : 0;

  // Default text width and max wrap width
  const defaultMaxWidth = measure1(AUSTRALIAN_GOV_TEXT);

  // For stacked wide images, use the wider of default or image width for wrapping
  const effectiveMaxWidth = isImageOnTop && isWide ? Math.max(defaultMaxWidth, minWideImageWidth) : defaultMaxWidth;

  let line1Lines = [];
  let line1Width = 0;

  if (hasLine1) {
    // "Australian Government" is the fixed lockup and never wraps; everything
    // else goes through wrapText so explicit newlines survive (SVG collapses
    // a raw \n inside <text> to a space). Strip layouts only disable
    // width-based wrapping, not manual line breaks.
    if (state.line1 === AUSTRALIAN_GOV_TEXT) {
      line1Lines = [state.line1];
    } else {
      line1Lines = wrapText(measure1, state.line1, isStrip ? Infinity : effectiveMaxWidth);
    }
    line1Width = Math.max(...line1Lines.map(measure1));
  }

  // Image dimensions
  let imageWidth, actualImageHeight;
  if (isImageOnTop) {
    // For stacked wide images, use minimum height constraint
    const minHeight = fontSize1 * 3;

    // Target 2/3 of text width, or use min width for wide images
    const baseWidth = (hasLine1 && line1Width > 0) ? line1Width : effectiveMaxWidth;
    const targetWidth = baseWidth * 0.66;
    const targetHeight = targetWidth / imageAspect;

    if (targetHeight < minHeight && isWide) {
      // Wide image needs minimum height - will be wider than text
      actualImageHeight = minHeight;
      imageWidth = minWideImageWidth;
    } else {
      imageWidth = targetWidth;
      actualImageHeight = targetHeight;
    }
  } else {
    // For inline: fixed height, but cap width for very wide images
    const maxWidth = imageHeight * 2;  // Max 2:1 display ratio
    actualImageHeight = imageHeight;
    imageWidth = isWide ? Math.min(imageHeight * imageAspect, maxWidth) : imageHeight * imageAspect;
  }

  // Flexible wrap width for Lines 2/3
  let wrapWidth;
  if (hasLine1 && line1Width > 0) {
    wrapWidth = line1Width;
  } else if (isImageOnTop && isWide) {
    // No Line 1, wide stacked image - wrap to image width
    wrapWidth = imageWidth;
  } else {
    wrapWidth = effectiveMaxWidth;
  }

  let line2Lines = [];
  let line3Lines = [];
  let line2Width = 0;
  let line3Width = 0;

  if (hasLine2) {
    line2Lines = wrapText(measure2, state.line2, isStrip ? Infinity : wrapWidth);
    line2Width = Math.max(...line2Lines.map(measure2));
  }

  if (hasLine3) {
    // Line 3 renders normal-weight, so measure/wrap it normal-weight too
    line3Lines = wrapText(measure3, state.line3, isStrip ? Infinity : wrapWidth);
    line3Width = Math.max(...line3Lines.map(measure3));
  }

  // Calculate text block dimensions (always stacked, strip just disables wrapping)
  // Width is determined by the widest text line present
  const textBlockWidth = Math.max(line1Width || 0, line2Width, line3Width);
  let textBlockHeight = 0;
  if (hasLine1) {
    textBlockHeight = fontSize1; // First line
    textBlockHeight += (line1Lines.length - 1) * (fontSize1 + lineSpacing); // Additional wrapped lines
  }
  // Underline gap above is larger to visually center it (accounts for Line 2 ascenders)
  if (hasUnderline) textBlockHeight += (lineSpacing + fontSize2 * 0.35) + underlineHeight + lineSpacing;
  if (hasLine2) {
    textBlockHeight += fontSize2; // First line
    textBlockHeight += (line2Lines.length - 1) * (fontSize2 + lineSpacing); // Additional wrapped lines
  }
  if (hasLine3) textBlockHeight += line3Lines.length * (fontSize2 + lineSpacing);

  // Calculate positions and dimensions
  let width, height, imgX, imgY, textX, textY, textAnchor;
  const hasText = textBlockWidth > 0 && textBlockHeight > 0;

  if (isImageOnTop) {
    // Stacked: minimal padding and gap (just a line break between image and text)
    const stackedPadding = lineSpacing * 2;
    const stackedGap = hasText ? gap : 0;
    width = stackedPadding * 2 + Math.max(imageWidth, textBlockWidth);
    height = stackedPadding * 2 + actualImageHeight + stackedGap + textBlockHeight;
    imgX = (width - imageWidth) / 2;
    imgY = stackedPadding;
    textX = width / 2;
    // First baseline offset belongs to Line 1 only; Lines 2/3 add their own
    // fontSize2 before drawing, so without Line 1 the block starts at the top
    textY = stackedPadding + actualImageHeight + stackedGap + (hasLine1 ? fontSize1 : 0);
    textAnchor = 'middle';
  } else {
    const inlineGap = hasText ? gap : 0;

    // Calculate text Y position first to determine required height
    let textTopY, textBottomY;

    if (hasUnderline && state.imageBaseline !== null) {
      // Align underline with image baseline (e.g., CoA base at 62%)
      const baselineY = padding + actualImageHeight * state.imageBaseline;
      const gapAbove = lineSpacing + fontSize2 * 0.35;
      textY = baselineY - gapAbove;  // Line 1 baseline
      textTopY = textY - fontSize1;
      textBottomY = textY - fontSize1 + textBlockHeight;
    } else {
      // Center text vertically with image
      const contentHeight = Math.max(actualImageHeight, textBlockHeight);
      textTopY = padding + (contentHeight - textBlockHeight) / 2;
      textBottomY = textTopY + textBlockHeight;
      // Same deal as stacked: only offset by fontSize1 when Line 1 exists
      textY = textTopY + (hasLine1 ? fontSize1 : 0);
    }

    // Ensure equal padding on all sides
    const imageBottom = padding + actualImageHeight;
    const contentBottom = Math.max(imageBottom, textBottomY);
    const contentTop = Math.min(padding, textTopY);
    const topAdjust = padding - contentTop;  // How much to shift down if text goes above

    imgX = padding;
    imgY = padding + topAdjust;
    textX = padding + imageWidth + inlineGap;
    textY = textY + topAdjust;
    textAnchor = 'start';

    width = padding * 2 + imageWidth + inlineGap + textBlockWidth;
    height = contentBottom + topAdjust + padding;
  }

  return {
    s, fontSize1, fontSize2, lineSpacing, underlineHeight, letterSpacing,
    width, height, imgX, imgY, imageWidth, actualImageHeight,
    textX, textY, textAnchor, textBlockWidth,
    line1Lines, line2Lines, line3Lines, visible
  };
}

// ============================================================================
// Rendering - SVG Emission
// ============================================================================

function emitLogoSVG(geom, { forExport = false, transparent = false } = {}) {
  const {
    fontSize1, fontSize2, lineSpacing, underlineHeight, letterSpacing,
    width, height, imgX, imgY, imageWidth, actualImageHeight,
    textX, textY, textAnchor, textBlockWidth,
    line1Lines, line2Lines, line3Lines,
    visible: { hasLine1, hasLine2, hasLine3, hasUnderline }
  } = geom;

  // Use PNG version for exports as SVG-in-SVG often doesn't render
  const imageHref = forExport ? (state.imagePng || state.image || '') : (state.image || '');

  const fontFamilyAttr = escapeXml(state.fontFamily);
  const lsAttr = letterSpacing ? ` letter-spacing="${letterSpacing}"` : '';
  const fontBold = `font-family="${fontFamilyAttr}" font-weight="bold" fill="${state.logoColor}" text-anchor="${textAnchor}"${lsAttr}`;
  const fontNormal = `font-family="${fontFamilyAttr}" fill="${state.logoColor}" text-anchor="${textAnchor}"${lsAttr}`;

  const svgContent = [];

  if (!transparent) {
    svgContent.push(`<rect width="100%" height="100%" fill="${state.bgColor}"/>`);
  }

  // Use both href and xlink:href for compatibility with different SVG viewers
  svgContent.push(`<image x="${imgX}" y="${imgY}" width="${imageWidth}" height="${actualImageHeight}" href="${imageHref}" xlink:href="${imageHref}"/>`);

  // Render stack: Line1 → gap → underline → gap → Line2 → Line3
  let currentY = textY;

  if (hasLine1) {
    svgContent.push(`<text x="${textX}" y="${currentY}" font-size="${fontSize1}" ${fontBold}>${escapeXml(line1Lines[0])}</text>`);
    for (let i = 1; i < line1Lines.length; i++) {
      currentY += lineSpacing + fontSize1;
      svgContent.push(`<text x="${textX}" y="${currentY}" font-size="${fontSize1}" ${fontBold}>${escapeXml(line1Lines[i])}</text>`);
    }
  }

  if (hasUnderline) {
    // Gap above must be larger to visually center the underline
    // Line 2's ascenders (~70% of fontSize2) make the visual gap below appear smaller
    // So we add half the ascender height to the gap above
    const gapAbove = lineSpacing + fontSize2 * 0.35;
    currentY += gapAbove;
    const underlineX = textAnchor === 'middle' ? textX - textBlockWidth / 2 : textX;
    svgContent.push(`<rect x="${underlineX}" y="${currentY}" width="${textBlockWidth}" height="${underlineHeight}" fill="${state.logoColor}"/>`);
    currentY += underlineHeight + lineSpacing;
  }

  if (hasLine2) {
    currentY += fontSize2;
    svgContent.push(`<text x="${textX}" y="${currentY}" font-size="${fontSize2}" ${fontBold}>${escapeXml(line2Lines[0])}</text>`);
    for (let i = 1; i < line2Lines.length; i++) {
      currentY += lineSpacing + fontSize2;
      svgContent.push(`<text x="${textX}" y="${currentY}" font-size="${fontSize2}" ${fontBold}>${escapeXml(line2Lines[i])}</text>`);
    }
  }

  if (hasLine3) {
    for (const line of line3Lines) {
      currentY += lineSpacing + fontSize2;
      svgContent.push(`<text x="${textX}" y="${currentY}" font-size="${fontSize2}" ${fontNormal}>${escapeXml(line)}</text>`);
    }
  }

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${svgContent.join('')}</svg>`,
    width,
    height
  };
}

function buildLogoSVG(scale, opts = {}) {
  return emitLogoSVG(layoutLogo(scale), opts);
}

// ============================================================================
// Rendering - Canvas Output
// ============================================================================

async function renderSVGToCanvas(svgString, canvas, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve();
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };

    img.src = url;
  });
}

let previewBlobUrl = null;
let previewRenderToken = 0;

async function renderPreview() {
  // Rapid input events overlap here (async, shared canvas); the token makes
  // sure only the latest render gets to set the preview image
  const token = ++previewRenderToken;

  syncUrl();
  updateCopyLinkState();

  // 3x for crisp preview
  const scale = state.scale * 3;
  const { svg, width, height } = buildLogoSVG(scale, {
    transparent: state.transparentBg
  });
  const canvas = elements.renderCanvas;

  await renderSVGToCanvas(svg, canvas, width, height);
  if (token !== previewRenderToken) return;

  // Create blob URL for better browser handling
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (token !== previewRenderToken) return;

  // Revoke old blob URL to prevent memory leaks
  if (previewBlobUrl) {
    URL.revokeObjectURL(previewBlobUrl);
  }
  previewBlobUrl = URL.createObjectURL(blob);
  elements.previewImage.src = previewBlobUrl;
}

// ============================================================================
// Shareable URLs
// ============================================================================

let syncUrlTimer = null;

function syncUrl() {
  clearTimeout(syncUrlTimer);
  syncUrlTimer = setTimeout(() => {
    const qs = stateToParams(state, STATE_DEFAULTS).toString();
    history.replaceState(null, '', qs ? `#${qs}` : location.pathname + location.search);
  }, 150);
}

function readStateFromUrl() {
  return paramsToState(new URLSearchParams(location.hash.slice(1)), STATE_DEFAULTS);
}

// ============================================================================
// Export Functions
// ============================================================================

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Browsers silently fail (null blob / blank canvas) past ~16M pixels
const MAX_EXPORT_PIXELS = 16000000;

// Shared render path for downloads and clipboard. forExport swaps the coat
// of arms to its PNG version, which Safari needs to canvas-draw at all.
async function renderExportBlob(format) {
  const transparent = state.transparentBg && format !== 'jpeg';

  // 8x for high-res export
  let scale = state.scale * 8;
  let { svg, width, height } = buildLogoSVG(scale, { forExport: true, transparent });

  // Clamp to the canvas pixel budget rather than exporting a blank image
  if (width * height > MAX_EXPORT_PIXELS) {
    scale *= Math.sqrt(MAX_EXPORT_PIXELS / (width * height));
    ({ svg, width, height } = buildLogoSVG(scale, { forExport: true, transparent }));
  }

  const canvas = document.createElement('canvas');
  await renderSVGToCanvas(svg, canvas, width, height);

  let blob = await new Promise(resolve =>
    canvas.toBlob(resolve, `image/${format}`, format === 'jpeg' ? 0.95 : undefined));
  if (!blob) {
    throw new Error('canvas export failed - try a smaller scale');
  }

  if (format === 'png') {
    // Stamp the pixel density the UI advertises (base design is 72 PPI at 1x)
    const ppi = Math.round(scale * 72);
    const bytes = pngWithPpi(new Uint8Array(await blob.arrayBuffer()), ppi);
    blob = new Blob([bytes], { type: 'image/png' });
  }

  return blob;
}

async function exportRaster(format) {
  try {
    const blob = await renderExportBlob(format);
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    downloadBlob(blob, `${currentFilename()}.${ext}`);
  } catch (e) {
    alert(`Export failed: ${e.message}`);
  }
}

function exportSVG() {
  // Use 8x scale for larger default dimensions (SVG is vector so scales infinitely)
  const scale = state.scale * 8;
  const { svg } = buildLogoSVG(scale, { forExport: true, transparent: state.transparentBg });
  const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
  const blob = new Blob([fullSvg], { type: 'image/svg+xml' });
  downloadBlob(blob, `${currentFilename()}.svg`);
}

function currentFilename() {
  return generateFilename(state.line1, state.line2, state.line3);
}

function copyPNG() {
  if (!navigator.clipboard || !window.ClipboardItem) {
    alert('Clipboard images are not supported in this browser.');
    return;
  }
  // ClipboardItem must be created synchronously within the user gesture
  // (Safari), so it wraps the render promise rather than awaiting it first
  const item = new ClipboardItem({ 'image/png': renderExportBlob('png') });
  navigator.clipboard.write([item])
    .then(() => flashButton(elements.copyPNG, 'Copied ✓'))
    .catch(e => alert(`Copy failed: ${e.message}`));
}

function copyLink() {
  navigator.clipboard.writeText(location.href)
    .then(() => flashButton(elements.copyLink, 'Copied ✓'))
    .catch(e => alert(`Copy failed: ${e.message}`));
}

// ============================================================================
// Logo Library (localStorage presets)
// ============================================================================

const LIBRARY_KEY = 'agl.library.v1';

function loadLibrary() {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY)) || {};
  } catch {
    return {};
  }
}

function saveLibrary(library) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    return true;
  } catch (e) {
    // Quota is the realistic failure here, usually from large embedded images
    alert(`Could not save preset (storage full?): ${e.message}`);
    return false;
  }
}

function serializeState() {
  const preset = {};
  for (const key of SERIALISABLE_KEYS) {
    preset[key] = state[key];
  }
  // Only embed custom images; the default CoA is loaded from the site.
  // SVG uploads store raw markup so they stay recolourable on load.
  if (state.uploadedSvgText) {
    preset.svgText = state.uploadedSvgText;
  } else if (state.image && state.defaultImage && state.image !== state.defaultImage) {
    preset.image = state.image;
    preset.imageBaseline = state.imageBaseline;
  }
  return preset;
}

async function applyPreset(preset) {
  for (const key of SERIALISABLE_KEYS) {
    if (preset[key] !== undefined) state[key] = preset[key];
  }
  reflectStateToControls();
  updateTextModeUI();
  // updateTextModeUI forces mode-default Line 1 text; restore the preset's
  for (const key of ['line1', 'line2', 'line3']) {
    if (preset[key] !== undefined) {
      state[key] = preset[key];
      elements[key].value = preset[key];
    }
  }

  try {
    if (preset.svgText) {
      state.uploadedSvgText = preset.svgText;
      await recolourUploadedSvg();
    } else if (preset.image) {
      state.uploadedSvgText = null;
      await setImageFromDataUri(preset.image, preset.imageBaseline ?? null);
    } else {
      state.uploadedSvgText = null;
      await recolourDefaultArms(state.logoColor, { adopt: true });
    }
  } catch (e) {
    console.error('Failed to load preset image:', e);
  }

  updateContrastWarning();
  renderPreview();
}

function renderPresetList() {
  const library = loadLibrary();
  const names = Object.keys(library).sort();
  elements.presetList.innerHTML = '';

  if (names.length === 0) {
    const li = document.createElement('li');
    li.className = 'preset-empty';
    li.textContent = 'No saved logos yet';
    elements.presetList.appendChild(li);
    return;
  }

  for (const name of names) {
    const li = document.createElement('li');

    const load = document.createElement('button');
    load.className = 'preset-load';
    load.textContent = name;
    load.title = `Load "${name}"`;
    load.addEventListener('click', () => applyPreset(library[name]));

    const del = document.createElement('button');
    del.className = 'preset-delete';
    del.textContent = '✕';
    del.title = `Delete "${name}"`;
    del.addEventListener('click', () => {
      const current = loadLibrary();
      delete current[name];
      if (saveLibrary(current)) renderPresetList();
    });

    li.appendChild(load);
    li.appendChild(del);
    elements.presetList.appendChild(li);
  }
}

function savePreset() {
  const name = elements.presetName.value.trim() || currentFilename();
  const library = loadLibrary();
  library[name] = serializeState();
  if (saveLibrary(library)) {
    elements.presetName.value = '';
    renderPresetList();
    flashButton(elements.savePreset, 'Saved ✓');
  }
}

function exportLibrary() {
  const blob = new Blob([JSON.stringify(loadLibrary(), null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'ausgov-logo-library.json');
}

function importLibrary(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (typeof imported !== 'object' || imported === null || Array.isArray(imported)) {
        throw new Error('expected an object of named presets');
      }
      const merged = { ...loadLibrary(), ...imported };
      if (saveLibrary(merged)) renderPresetList();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

// ============================================================================
// Control Sync
// ============================================================================

function usingCustomImage() {
  return !!(state.image && state.defaultImage && state.image !== state.defaultImage);
}

// Share links can't carry uploaded images (data URIs don't fit in a URL),
// so the link button greys out whenever a custom image is in play
function updateCopyLinkState() {
  const custom = usingCustomImage();
  elements.copyLink.disabled = custom;
  elements.copyLink.title = custom
    ? "Share links can't include uploaded images"
    : 'Copy a link to this design';
}

// The guidelines prohibit low-contrast combos (pastel on light, dark on
// dark, tints). 4.5:1 is the WCAG AA line - a decent proxy for "integrity
// of the logo is not compromised".
function updateContrastWarning() {
  const ratio = contrastRatio(state.logoColor, state.bgColor);
  const low = ratio !== null && ratio < 4.5 && !state.transparentBg;
  elements.contrastWarning.classList.toggle('hidden', !low);
}

function reflectStateToControls() {
  elements.layout.value = state.layout;
  elements.textMode.value = state.textMode;
  elements.line1.value = state.line1;
  elements.line2.value = state.line2;
  elements.line3.value = state.line3;
  elements.logoColor.value = state.logoColor;
  elements.bgColor.value = state.bgColor;
  elements.transparentBg.checked = state.transparentBg;
  elements.scale.value = state.scale;
  elements.fontFamily.value = state.fontFamily;
  elements.fontScale2.value = state.fontScale2;
  elements.letterSpacing.value = state.letterSpacing;
  updateControlReadouts();
}

function updateControlReadouts() {
  elements.scaleValue.textContent = state.scale.toFixed(1);
  elements.fontScale2Value.textContent = state.fontScale2.toFixed(2);
  elements.letterSpacingValue.textContent = state.letterSpacing.toFixed(1);
  updateSliderTrack();
  updatePpiValue();
}

function updateSliderTrack() {
  const slider = elements.scale;
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const val = parseFloat(slider.value);
  const percent = ((val - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(to right, #008542 0%, #008542 ${percent}%, #ddd ${percent}%, #ddd 100%)`;
}

function updatePpiValue() {
  // Export uses 8x scale multiplier, base 72 PPI
  const ppi = Math.round(state.scale * 8 * 72);
  elements.ppiValue.textContent = ppi;
}

// ============================================================================
// Event Listeners
// ============================================================================

elements.layout.addEventListener('change', (e) => {
  state.layout = e.target.value;
  renderPreview();
});

elements.textMode.addEventListener('change', (e) => {
  state.textMode = e.target.value;
  updateTextModeUI();
  renderPreview();
});

for (const key of ['line1', 'line2', 'line3']) {
  elements[key].addEventListener('input', (e) => {
    state[key] = e.target.value;
    renderPreview();
  });
}

// Text recolours instantly; the arms re-rasterise on a debounce because
// regenerating the ~2000px PNG on every colour-picker tick is too heavy
let armsRecolourTimer = null;

function scheduleArmsRecolour() {
  clearTimeout(armsRecolourTimer);
  armsRecolourTimer = setTimeout(async () => {
    await recolourDefaultArms(state.logoColor);
    await recolourUploadedSvg();
    renderPreview();
  }, 150);
}

elements.logoColor.addEventListener('input', (e) => {
  state.logoColor = e.target.value;
  updateContrastWarning();
  renderPreview();
  scheduleArmsRecolour();
});

elements.bgColor.addEventListener('input', (e) => {
  state.bgColor = e.target.value;
  updateContrastWarning();
  renderPreview();
  scheduleArmsRecolour(); // knockout detail tracks the background colour
});

elements.transparentBg.addEventListener('change', (e) => {
  state.transparentBg = e.target.checked;
  updateContrastWarning();
  renderPreview();
  scheduleArmsRecolour();
});

for (const swatch of document.querySelectorAll('.swatch')) {
  swatch.addEventListener('click', async () => {
    state.logoColor = swatch.dataset.fg;
    state.bgColor = swatch.dataset.bg;
    elements.logoColor.value = state.logoColor;
    elements.bgColor.value = state.bgColor;
    updateContrastWarning();
    await recolourDefaultArms(state.logoColor);
    await recolourUploadedSvg();
    renderPreview();
  });
}

elements.imageUpload.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    handleImageUpload(e.target.files[0]);
  }
});

elements.resetImage.addEventListener('click', async () => {
  // Reset to the default arms, recoloured to the current logo colour
  state.uploadedSvgText = null;
  await recolourDefaultArms(state.logoColor, { adopt: true });
  elements.imageUpload.value = '';
  renderPreview();
});

elements.scale.addEventListener('input', (e) => {
  state.scale = parseFloat(e.target.value);
  updateControlReadouts();
  renderPreview();
});

elements.fontFamily.addEventListener('change', (e) => {
  state.fontFamily = e.target.value;
  renderPreview();
});

elements.fontScale2.addEventListener('input', (e) => {
  state.fontScale2 = parseFloat(e.target.value);
  updateControlReadouts();
  renderPreview();
});

elements.letterSpacing.addEventListener('input', (e) => {
  state.letterSpacing = parseFloat(e.target.value);
  updateControlReadouts();
  renderPreview();
});

elements.exportPNG.addEventListener('click', () => exportRaster('png'));
elements.exportJPEG.addEventListener('click', () => exportRaster('jpeg'));
elements.exportSVG.addEventListener('click', exportSVG);
elements.copyPNG.addEventListener('click', copyPNG);
elements.copyLink.addEventListener('click', copyLink);

elements.savePreset.addEventListener('click', savePreset);
elements.exportLibrary.addEventListener('click', exportLibrary);
elements.importLibrary.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    importLibrary(e.target.files[0]);
    e.target.value = '';
  }
});

// Enable drag-and-drop from preview image (native browser handling)
elements.previewImage.draggable = true;

// ============================================================================
// Initialize
// ============================================================================

// Re-read all form values on load (browser may remember form state),
// then overlay anything a share link specifies
state.layout = elements.layout.value;
state.textMode = elements.textMode.value;
state.line1 = elements.line1.value;
state.line2 = elements.line2.value;
state.line3 = elements.line3.value;
state.logoColor = elements.logoColor.value;
state.bgColor = elements.bgColor.value;
state.scale = parseFloat(elements.scale.value);
state.transparentBg = elements.transparentBg.checked;

const urlState = readStateFromUrl();
Object.assign(state, urlState);
reflectStateToControls();
updateTextModeUI();
// updateTextModeUI forces mode-default Line 1 text; a share link's wins
if (urlState.line1 !== undefined) {
  state.line1 = urlState.line1;
  elements.line1.value = urlState.line1;
}

renderPresetList();
updateCopyLinkState();
updateContrastWarning();
loadDefaultImage();
