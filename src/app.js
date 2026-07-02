// Application state
const state = {
  layout: 'inline',
  textMode: 'department',
  line1: 'Australian Government',
  line2: 'Department of Example',
  line3: 'Division Name',
  logoColor: '#000000',
  bgColor: '#ffffff',
  reverse: false,
  scale: 1,
  showIsolation: false,
  // Image state (CoA is just the default image)
  image: null,          // Current image data URI
  imageAspect: 1,       // width/height ratio
  imagePng: null,       // PNG version for SVG export
  imageBaseline: null,  // Custom baseline alignment (0-1), null = center
  defaultImage: null,   // Default CoA image
  defaultImageAspect: 1,
  defaultImagePng: null,
  defaultImageBaseline: 0.62  // CoA base is 62% down
};

// DOM element references
const elements = {
  layout: document.getElementById('layout'),
  textMode: document.getElementById('textMode'),
  line1: document.getElementById('line1'),
  line2: document.getElementById('line2'),
  line3: document.getElementById('line3'),
  line1Group: document.getElementById('line1Group'),
  line2Group: document.getElementById('line2Group'),
  line3Group: document.getElementById('line3Group'),
  logoColor: document.getElementById('logoColor'),
  bgColor: document.getElementById('bgColor'),
  reverseMode: document.getElementById('reverseMode'),
  imageUpload: document.getElementById('imageUpload'),
  resetImage: document.getElementById('resetImage'),
  scale: document.getElementById('scale'),
  scaleValue: document.getElementById('scaleValue'),
  ppiValue: document.getElementById('ppiValue'),
  showIsolation: document.getElementById('showIsolation'),
  exportPNG: document.getElementById('exportPNG'),
  exportJPEG: document.getElementById('exportJPEG'),
  exportSVG: document.getElementById('exportSVG'),
  previewImage: document.getElementById('previewImage'),
  renderCanvas: document.getElementById('renderCanvas')
};

// Base dimensions (before scaling)
const BASE = {
  imageHeight: 80,
  fontSize1: 20,
  fontSize2: 16,    // Lines 2 and 3 (same as Line 1)
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
      line1Input.value = 'Australian Government';
      line1Input.disabled = true;
      state.line1 = 'Australian Government';
      elements.line2Group.classList.remove('hidden');
      elements.line3Group.classList.add('hidden');
      break;
    case 'government':
      line1Input.value = 'Australian Government';
      line1Input.disabled = true;
      state.line1 = 'Australian Government';
      elements.line2Group.classList.add('hidden');
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
      line1Input.value = 'Australian Government';
      line1Input.disabled = true;
      state.line1 = 'Australian Government';
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

async function loadDefaultImage() {
  try {
    const response = await fetch('assets/coat-of-arms.svg');
    const svgText = await response.text();
    const dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));

    const { aspect, pngDataUri } = await loadImage(dataUri);
    state.defaultImage = dataUri;
    state.defaultImageAspect = aspect;
    state.defaultImagePng = pngDataUri;

    // Set as current image
    state.image = dataUri;
    state.imageAspect = aspect;
    state.imagePng = pngDataUri;
    state.imageBaseline = state.defaultImageBaseline;

    renderPreview();
  } catch (e) {
    console.error('Failed to load default image:', e);
  }
}

function handleImageUpload(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const { dataUri, aspect, pngDataUri } = await loadImage(e.target.result);
      state.image = dataUri;
      state.imageAspect = aspect;
      state.imagePng = pngDataUri;
      state.imageBaseline = null;  // Custom images use centered alignment
      renderPreview();
    } catch (err) {
      console.error('Failed to load uploaded image:', err);
    }
  };
  reader.readAsDataURL(file);
}

// ============================================================================
// Text Wrapping
// ============================================================================

// Greedy first-fit wrap of one paragraph. Assumes ctx.font is already set.
function greedyWrap(ctx, words, maxWidth) {
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
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

function wrapText(ctx, text, maxWidth, fontSize, bold = true) {
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px "Times New Roman", Times, serif`;

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
    let wrapped = greedyWrap(ctx, words, maxWidth);

    // Balance multi-line wraps: binary-search the narrowest width that still
    // fits in the same number of lines, so "...Regional Development and /
    // Local Government" becomes two lines of similar length instead of one
    // long and one short
    if (wrapped.length > 1 && isFinite(maxWidth)) {
      const lineCount = wrapped.length;
      let lo = Math.max(...words.map(w => ctx.measureText(w).width));
      let hi = maxWidth;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (greedyWrap(ctx, words, mid).length > lineCount) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      wrapped = greedyWrap(ctx, words, hi);
    }

    lines.push(...wrapped);
  }

  return lines;
}

// ============================================================================
// Rendering - SVG Generation (Single Source of Truth)
// ============================================================================

function getEffectiveColors() {
  return {
    fg: state.reverse ? state.bgColor : state.logoColor,
    bg: state.reverse ? state.logoColor : state.bgColor
  };
}

function measureText(ctx, text, fontSize, bold = true) {
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px "Times New Roman", Times, serif`;
  return ctx.measureText(text);
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

// Unified function to determine which elements to show
// Applies empty-check logic consistently across all text modes
function getVisibleElements() {
  const line1Empty = !state.line1.trim();
  const line2Empty = !state.line2.trim();
  const line3Empty = !state.line3.trim();

  // Determine if lines should be shown based on mode AND content
  let hasLine1, hasLine2, hasLine3;

  switch (state.textMode) {
    case 'government':
      hasLine1 = !line1Empty;
      hasLine2 = false;
      hasLine3 = false;
      break;
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
      hasLine1 = !line1Empty;
      hasLine2 = !line2Empty;
      hasLine3 = !line3Empty;
      break;
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

function buildLogoSVG(scale, showIsolation = false, forExport = false) {
  const colors = getEffectiveColors();
  const tempCanvas = document.createElement('canvas');
  const ctx = tempCanvas.getContext('2d');

  const s = scale;
  const padding = BASE.padding * s;
  const imageHeight = BASE.imageHeight * s;
  const fontSize1 = BASE.fontSize1 * s;
  const fontSize2 = BASE.fontSize2 * s;
  const gap = BASE.gap * s;
  const lineSpacing = BASE.lineSpacing * s;
  const underlineHeight = BASE.underlineHeight * s;

  // Determine which lines to show (unified logic for all modes)
  const { hasLine1, hasLine2, hasLine3, hasUnderline } = getVisibleElements();

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
  const australianGovText = 'Australian Government';
  const australianGovWidth = measureText(ctx, australianGovText, fontSize1).width;
  const defaultMaxWidth = australianGovWidth;

  // For stacked wide images, use the wider of default or image width for wrapping
  const effectiveMaxWidth = isImageOnTop && isWide ? Math.max(defaultMaxWidth, minWideImageWidth) : defaultMaxWidth;

  let line1Lines = [];
  let line1Width = 0;

  if (hasLine1) {
    // "Australian Government" is the fixed lockup and never wraps; everything
    // else goes through wrapText so explicit newlines survive (SVG collapses
    // a raw \n inside <text> to a space). Strip layouts only disable
    // width-based wrapping, not manual line breaks.
    if (state.line1 === australianGovText) {
      line1Lines = [state.line1];
    } else {
      line1Lines = wrapText(ctx, state.line1, isStrip ? Infinity : effectiveMaxWidth, fontSize1);
    }
    line1Width = Math.max(...line1Lines.map(l => measureText(ctx, l, fontSize1).width));
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
    // Use effective max or let content determine width
    wrapWidth = effectiveMaxWidth;
  }

  // For non-strip: wrap Line 2 and Line 3
  // For strip: no wrapping, all on one line
  let line2Lines = [];
  let line3Lines = [];
  let line2Width = 0;
  let line3Width = 0;

  if (hasLine2) {
    line2Lines = wrapText(ctx, state.line2, isStrip ? Infinity : wrapWidth, fontSize2);
    line2Width = Math.max(...line2Lines.map(l => measureText(ctx, l, fontSize2).width));
  }

  if (hasLine3) {
    // Line 3 renders normal-weight, so measure/wrap it normal-weight too
    line3Lines = wrapText(ctx, state.line3, isStrip ? Infinity : wrapWidth, fontSize2, false);
    line3Width = Math.max(...line3Lines.map(l => measureText(ctx, l, fontSize2, false).width));
  }

  // Calculate text block dimensions (always stacked, strip just disables wrapping)
  // Width is determined by the widest text line present
  let textBlockWidth = Math.max(line1Width || 0, line2Width, line3Width);
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

  // Get image href (use PNG version for SVG export as SVG-in-SVG often doesn't render)
  const imageHref = forExport ? (state.imagePng || state.image || '') : (state.image || '');

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

  // Build SVG elements
  let svgContent = [];

  svgContent.push(`<rect width="100%" height="100%" fill="${colors.bg}"/>`);

  if (showIsolation) {
    svgContent.push(`<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="${colors.fg}" stroke-width="2" stroke-dasharray="5,5"/>`);
  }

  // Use both href and xlink:href for compatibility with different SVG viewers
  svgContent.push(`<image x="${imgX}" y="${imgY}" width="${imageWidth}" height="${actualImageHeight}" href="${imageHref}" xlink:href="${imageHref}"/>`);

  const fontBold = `font-family="Times New Roman, Times, serif" font-weight="bold" fill="${colors.fg}" text-anchor="${textAnchor}"`;
  const fontNormal = `font-family="Times New Roman, Times, serif" fill="${colors.fg}" text-anchor="${textAnchor}"`;

  // All layouts use stacked text (strip just disables wrapping, handled above)
  let currentY = textY;

  // Render stack: Line1 → gap → underline → gap → Line2 → Line3

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
    let underlineX = textAnchor === 'middle' ? textX - textBlockWidth / 2 : textX;
    svgContent.push(`<rect x="${underlineX}" y="${currentY}" width="${textBlockWidth}" height="${underlineHeight}" fill="${colors.fg}"/>`);
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

  // 3x for crisp preview
  const scale = state.scale * 3;
  const { svg, width, height } = buildLogoSVG(scale, state.showIsolation);
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
// Export Functions
// ============================================================================

function generateFilename() {
  // Skip standard government text, use first custom/meaningful line
  const standardTexts = ['australian government', 'an australian government initiative'];
  const line1Lower = state.line1.trim().toLowerCase();

  let name;
  if (!standardTexts.includes(line1Lower) && state.line1.trim()) {
    name = state.line1;
  } else if (state.line2.trim()) {
    name = state.line2;
  } else if (state.line3.trim()) {
    name = state.line3;
  } else {
    name = 'logo';
  }

  // Sanitize: lowercase, replace non-alphanumeric with hyphens, trim hyphens
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'logo';
}

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

async function exportRaster(format) {
  // 8x for high-res export; forExport = true swaps the coat of arms to its
  // PNG version, which Safari needs to draw the SVG onto a canvas at all
  let scale = state.scale * 8;
  let { svg, width, height } = buildLogoSVG(scale, false, true);

  // Clamp to the canvas pixel budget rather than exporting a blank image
  if (width * height > MAX_EXPORT_PIXELS) {
    scale *= Math.sqrt(MAX_EXPORT_PIXELS / (width * height));
    ({ svg, width, height } = buildLogoSVG(scale, false, true));
  }

  const canvas = document.createElement('canvas');
  await renderSVGToCanvas(svg, canvas, width, height);

  canvas.toBlob((blob) => {
    if (!blob) {
      alert('Export failed - try a smaller scale.');
      return;
    }
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    downloadBlob(blob, `${generateFilename()}.${ext}`);
  }, `image/${format}`, format === 'jpeg' ? 0.95 : undefined);
}

function exportSVG() {
  // Use 8x scale for larger default dimensions (SVG is vector so scales infinitely)
  const scale = state.scale * 8;
  const { svg } = buildLogoSVG(scale, false, true); // forExport = true uses PNG for coat of arms
  const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
  const blob = new Blob([fullSvg], { type: 'image/svg+xml' });
  downloadBlob(blob, `${generateFilename()}.svg`);
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

elements.line1.addEventListener('input', (e) => {
  state.line1 = e.target.value;
  renderPreview();
});

elements.line2.addEventListener('input', (e) => {
  state.line2 = e.target.value;
  renderPreview();
});

elements.line3.addEventListener('input', (e) => {
  state.line3 = e.target.value;
  renderPreview();
});

elements.logoColor.addEventListener('input', (e) => {
  state.logoColor = e.target.value;
  renderPreview();
});

elements.bgColor.addEventListener('input', (e) => {
  state.bgColor = e.target.value;
  renderPreview();
});

elements.reverseMode.addEventListener('change', (e) => {
  state.reverse = e.target.checked;
  renderPreview();
});

elements.imageUpload.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    handleImageUpload(e.target.files[0]);
  }
});

elements.resetImage.addEventListener('click', () => {
  // Reset to default image
  state.image = state.defaultImage;
  state.imageAspect = state.defaultImageAspect;
  state.imagePng = state.defaultImagePng;
  state.imageBaseline = state.defaultImageBaseline;
  elements.imageUpload.value = '';
  renderPreview();
});

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

elements.scale.addEventListener('input', (e) => {
  state.scale = parseFloat(e.target.value);
  elements.scaleValue.textContent = state.scale.toFixed(1);
  updateSliderTrack();
  updatePpiValue();
  renderPreview();
});

elements.showIsolation.addEventListener('change', (e) => {
  state.showIsolation = e.target.checked;
  renderPreview();
});

elements.exportPNG.addEventListener('click', () => exportRaster('png'));
elements.exportJPEG.addEventListener('click', () => exportRaster('jpeg'));
elements.exportSVG.addEventListener('click', exportSVG);

// Enable drag-and-drop from preview image (native browser handling)
elements.previewImage.draggable = true;

// ============================================================================
// Initialize
// ============================================================================

// Re-read all form values on load (browser may remember form state)
state.layout = elements.layout.value;
state.textMode = elements.textMode.value;
state.line1 = elements.line1.value;
state.line2 = elements.line2.value;
state.line3 = elements.line3.value;
state.logoColor = elements.logoColor.value;
state.bgColor = elements.bgColor.value;
state.scale = parseFloat(elements.scale.value);
elements.scaleValue.textContent = state.scale.toFixed(1);
updateSliderTrack();
updatePpiValue();
state.reverse = elements.reverseMode.checked;
state.showIsolation = elements.showIsolation.checked;

updateTextModeUI();
loadDefaultImage();
