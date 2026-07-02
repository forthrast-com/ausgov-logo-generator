const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  wrapText,
  getVisibleElements,
  generateFilename,
  escapeXml,
  stateToParams,
  paramsToState,
  crc32,
  pngWithPpi
} = require('../src/logo_core.js');

// Fake measurer: every character is 10px wide, spaces included
const measure = (text) => text.length * 10;

// ============================================================================
// wrapText
// ============================================================================

test('wrapText keeps short text on one line', () => {
  assert.deepEqual(wrapText(measure, 'short text', 1000), ['short text']);
});

test('wrapText preserves explicit newlines even when text fits', () => {
  assert.deepEqual(wrapText(measure, 'one\ntwo', 1000), ['one', 'two']);
});

test('wrapText preserves blank lines', () => {
  assert.deepEqual(wrapText(measure, 'one\n\ntwo', 1000), ['one', '', 'two']);
});

test('wrapText wraps at max width', () => {
  // 'aaaa bbbb' is 90px, adding ' cccc' makes 140px
  assert.deepEqual(wrapText(measure, 'aaaa bbbb cccc', 90), ['aaaa bbbb', 'cccc']);
});

test('wrapText balances ragged wraps', () => {
  // Greedy at 130 gives ['aaaaa bbbbb c' (130), 'dddddd' (60)];
  // balanced is ['aaaaa bbbbb' (110), 'c dddddd' (80)]
  assert.deepEqual(
    wrapText(measure, 'aaaaa bbbbb c dddddd', 130),
    ['aaaaa bbbbb', 'c dddddd']
  );
});

test('wrapText never wraps with Infinity max width', () => {
  assert.deepEqual(
    wrapText(measure, 'a very long line that should stay whole', Infinity),
    ['a very long line that should stay whole']
  );
});

test('wrapText keeps an overlong single word on its own line', () => {
  assert.deepEqual(
    wrapText(measure, 'tiny extraordinarily-long-word tiny', 100),
    ['tiny', 'extraordinarily-long-word', 'tiny']
  );
});

// ============================================================================
// getVisibleElements
// ============================================================================

test('department mode shows lines 1-2 and underline', () => {
  assert.deepEqual(
    getVisibleElements('department', 'Australian Government', 'Dept', 'ignored'),
    { hasLine1: true, hasLine2: true, hasLine3: false, hasUnderline: true }
  );
});

test('department mode with empty line 2 drops the underline', () => {
  assert.deepEqual(
    getVisibleElements('department', 'Australian Government', '  ', ''),
    { hasLine1: true, hasLine2: false, hasLine3: false, hasUnderline: false }
  );
});

test('initiative mode shows only line 1', () => {
  assert.deepEqual(
    getVisibleElements('initiative', 'An Initiative', 'Dept', 'Division'),
    { hasLine1: true, hasLine2: false, hasLine3: false, hasUnderline: false }
  );
});

test('hierarchy mode shows all three lines', () => {
  assert.deepEqual(
    getVisibleElements('hierarchy', 'AG', 'Dept', 'Division'),
    { hasLine1: true, hasLine2: true, hasLine3: true, hasUnderline: true }
  );
});

test('free mode with only line 2 has no underline', () => {
  assert.deepEqual(
    getVisibleElements('free', '', 'Just this', ''),
    { hasLine1: false, hasLine2: true, hasLine3: false, hasUnderline: false }
  );
});

// ============================================================================
// generateFilename
// ============================================================================

test('generateFilename skips standard government text', () => {
  assert.equal(generateFilename('Australian Government', 'Department of Health', ''), 'department-of-health');
});

test('generateFilename uses custom line 1', () => {
  assert.equal(generateFilename('My Cool Thing!!', 'Dept', ''), 'my-cool-thing');
});

test('generateFilename falls back to logo', () => {
  assert.equal(generateFilename('', '', ''), 'logo');
});

// ============================================================================
// escapeXml
// ============================================================================

test('escapeXml escapes all five specials', () => {
  assert.equal(escapeXml(`<a & 'b' "c">`), '&lt;a &amp; &apos;b&apos; &quot;c&quot;&gt;');
});

// ============================================================================
// URL state serialisation
// ============================================================================

const DEFAULTS = {
  layout: 'inline',
  textMode: 'department',
  line1: 'Australian Government',
  line2: 'Department of Example',
  line3: 'Division Name',
  logoColor: '#000000',
  bgColor: '#ffffff',
  scale: 1,
  showIsolation: false,
  transparentBg: false,
  fontFamily: '"Times New Roman", Times, serif',
  fontScale2: 0.8,
  letterSpacing: 0
};

test('stateToParams omits defaults', () => {
  assert.equal(stateToParams({ ...DEFAULTS }, DEFAULTS).toString(), '');
});

test('state round-trips through params', () => {
  const custom = {
    ...DEFAULTS,
    layout: 'stacked',
    line2: 'Department of Vibes & Time',
    logoColor: '#00205b',
    scale: 1.5,
    transparentBg: true,
    letterSpacing: 0.5
  };
  const params = new URLSearchParams(stateToParams(custom, DEFAULTS).toString());
  const restored = { ...DEFAULTS, ...paramsToState(params, DEFAULTS) };
  assert.deepEqual(restored, custom);
});

test('paramsToState drops malformed numbers', () => {
  const params = new URLSearchParams('sc=banana');
  assert.deepEqual(paramsToState(params, DEFAULTS), {});
});

// ============================================================================
// PNG pHYs chunk
// ============================================================================

test('crc32 matches the standard check value', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(crc32(bytes), 0xCBF43926);
});

test('pngWithPpi inserts a valid pHYs chunk after IHDR', () => {
  // Synthetic PNG: signature + fake IHDR (25 bytes) + 7 tail bytes
  const png = new Uint8Array(40);
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  png[11] = 13; // IHDR length
  png.set([73, 72, 68, 82], 12); // 'IHDR'
  png[39] = 0xAB; // sentinel tail byte

  const out = pngWithPpi(png, 300);
  const view = new DataView(out.buffer);

  assert.equal(out.length, png.length + 21);
  assert.equal(view.getUint32(33), 9); // chunk data length
  assert.deepEqual([...out.subarray(37, 41)], [0x70, 0x48, 0x59, 0x73]); // 'pHYs'
  assert.equal(view.getUint32(41), Math.round(300 / 0.0254)); // x pixels/metre
  assert.equal(view.getUint32(45), Math.round(300 / 0.0254)); // y pixels/metre
  assert.equal(out[49], 1); // unit: metres
  assert.equal(view.getUint32(50), crc32(out.subarray(37, 50))); // chunk crc
  assert.equal(out[out.length - 1], 0xAB); // tail preserved
});

test('pngWithPpi leaves non-PNG bytes alone', () => {
  const notPng = new Uint8Array([1, 2, 3, 4]);
  assert.equal(pngWithPpi(notPng, 300), notPng);
});
