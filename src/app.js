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
  customImage: null,
  customImageType: null,
  coaDataUri: null  // Base64 data URI of the coat of arms
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
  fontSize1: 18,
  fontSize2: 13,
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

async function loadDefaultCoA() {
  try {
    const response = await fetch('assets/coat-of-arms.svg');
    const svgText = await response.text();
    state.coaDataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));

    // Also create PNG version for SVG export (SVG-in-SVG often doesn't render in viewers)
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // High resolution for quality
      canvas.width = img.width * 2 || 400;
      canvas.height = img.height * 2 || 500;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      state.coaPngDataUri = canvas.toDataURL('image/png');
      renderPreview();
    };
    img.src = state.coaDataUri;
  } catch (e) {
    console.error('Failed to load default coat of arms:', e);
  }
}

function handleImageUpload(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    state.customImage = e.target.result;
    state.customImageType = file.type === 'image/svg+xml' || file.name.endsWith('.svg') ? 'svg' : 'raster';
    await renderPreview();
  };
  reader.readAsDataURL(file);
}

// ============================================================================
// Text Wrapping
// ============================================================================

function wrapText(ctx, text, maxWidth, fontSize) {
  ctx.font = `bold ${fontSize}px "Times New Roman", Times, serif`;
  const words = text.split(' ');
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

  // Determine which lines to show
  let hasLine1 = true;
  let hasLine2, hasLine3, hasUnderline;

  if (state.textMode === 'free') {
    hasLine1 = state.line1.trim().length > 0;
    hasLine2 = state.line2.trim().length > 0;
    hasLine3 = state.line3.trim().length > 0;
    hasUnderline = hasLine1 && (hasLine2 || hasLine3);
  } else {
    hasLine2 = state.textMode === 'department' || state.textMode === 'hierarchy';
    hasLine3 = state.textMode === 'hierarchy';
    hasUnderline = hasLine2;
  }

  // Layout flags
  const isStrip = state.layout === 'inline-strip' || state.layout === 'stacked-strip';
  const isImageOnTop = state.layout === 'stacked' || state.layout === 'stacked-strip';

  // Measure Line 1 width (this determines wrap width for other lines)
  const line1Width = hasLine1 ? measureText(ctx, state.line1, fontSize1).width : 0;

  // For non-strip: wrap Line 2 and Line 3 to Line 1's width
  // For strip: no wrapping, all on one line
  let line2Lines = [];
  let line3Lines = [];
  let line2Width = 0;
  let line3Width = 0;

  if (hasLine2) {
    if (isStrip) {
      line2Lines = [state.line2];
      line2Width = measureText(ctx, state.line2, fontSize2).width;
    } else {
      line2Lines = wrapText(ctx, state.line2, line1Width, fontSize2);
      line2Width = Math.max(...line2Lines.map(l => measureText(ctx, l, fontSize2).width));
    }
  }

  if (hasLine3) {
    if (isStrip) {
      line3Lines = [state.line3];
      line3Width = measureText(ctx, state.line3, fontSize2, false).width;
    } else {
      ctx.font = `${fontSize2}px "Times New Roman", Times, serif`; // Not bold for line 3
      line3Lines = wrapText(ctx, state.line3, line1Width, fontSize2);
      line3Width = Math.max(...line3Lines.map(l => measureText(ctx, l, fontSize2, false).width));
    }
  }

  // Image dimensions (assume square-ish aspect ratio for CoA, ~0.8 width:height)
  let imageWidth = imageHeight * 0.8;

  // Calculate text block dimensions (always stacked, strip just disables wrapping)
  let textBlockWidth = Math.max(line1Width, line2Width, line3Width);
  let textBlockHeight = hasLine1 ? fontSize1 : 0;
  // Underline gap above is larger to visually center it (accounts for Line 2 ascenders)
  if (hasUnderline) textBlockHeight += (lineSpacing + fontSize2 * 0.35) + underlineHeight + lineSpacing;
  if (hasLine2) {
    textBlockHeight += fontSize2; // First line
    textBlockHeight += (line2Lines.length - 1) * (fontSize2 + lineSpacing); // Additional wrapped lines
  }
  if (hasLine3) textBlockHeight += line3Lines.length * (fontSize2 + lineSpacing);

  // Calculate total dimensions - tight crop around content
  let width, height;

  if (isImageOnTop) {
    width = padding * 2 + Math.max(imageWidth, textBlockWidth);
    height = padding * 2 + imageHeight + gap + textBlockHeight;
  } else {
    width = padding * 2 + imageWidth + gap + textBlockWidth;
    height = padding * 2 + Math.max(imageHeight, textBlockHeight);
  }

  // Get image href (use data URI for CoA so it works in blob-rendered SVG)
  // For SVG export, use PNG version of coat of arms (SVG-in-SVG often doesn't render)
  let imageHref;
  if (state.customImage) {
    imageHref = state.customImage;
  } else if (forExport && state.coaPngDataUri) {
    imageHref = state.coaPngDataUri;
  } else {
    imageHref = state.coaDataUri || '';
  }

  // Calculate positions
  let imgX, imgY, textX, textY, textAnchor;

  if (isImageOnTop) {
    imgX = (width - imageWidth) / 2;
    imgY = padding;
    textX = width / 2;
    textY = padding + imageHeight + gap + fontSize1;
    textAnchor = 'middle';
  } else {
    imgX = padding;
    imgY = padding;
    textX = padding + imageWidth + gap;
    // Vertically center text block
    const textStartY = padding + (Math.max(imageHeight, textBlockHeight) - textBlockHeight) / 2;
    textY = textStartY + fontSize1;
    textAnchor = 'start';
  }

  // Build SVG elements
  let svgContent = [];

  svgContent.push(`<rect width="100%" height="100%" fill="${colors.bg}"/>`);

  if (showIsolation) {
    svgContent.push(`<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="${colors.fg}" stroke-width="2" stroke-dasharray="5,5"/>`);
  }

  // Use both href and xlink:href for compatibility with different SVG viewers
  svgContent.push(`<image x="${imgX}" y="${imgY}" width="${imageWidth}" height="${imageHeight}" href="${imageHref}" xlink:href="${imageHref}"/>`);

  const fontBold = `font-family="Times New Roman, Times, serif" font-weight="bold" fill="${colors.fg}" text-anchor="${textAnchor}"`;
  const fontNormal = `font-family="Times New Roman, Times, serif" fill="${colors.fg}" text-anchor="${textAnchor}"`;

  // All layouts use stacked text (strip just disables wrapping, handled above)
  let currentY = textY;

  // Render stack: Line1 → gap → underline → gap → Line2 → Line3

  if (hasLine1) {
    svgContent.push(`<text x="${textX}" y="${currentY}" font-size="${fontSize1}" ${fontBold}>${escapeXml(state.line1)}</text>`);
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

async function renderPreview() {
  // 3x for crisp preview
  const scale = state.scale * 3;
  const { svg, width, height } = buildLogoSVG(scale, state.showIsolation);
  const canvas = elements.renderCanvas;

  await renderSVGToCanvas(svg, canvas, width, height);

  // Revoke old blob URL to prevent memory leaks
  if (previewBlobUrl) {
    URL.revokeObjectURL(previewBlobUrl);
  }

  // Create blob URL for better browser handling
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
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

async function exportRaster(format) {
  // 8x for high-res export
  const scale = state.scale * 8;
  const { svg, width, height } = buildLogoSVG(scale, false);
  const canvas = document.createElement('canvas');

  await renderSVGToCanvas(svg, canvas, width, height);

  canvas.toBlob((blob) => {
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
  state.customImage = null;
  state.customImageType = null;
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
loadDefaultCoA();
