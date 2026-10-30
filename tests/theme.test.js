const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--c-([\w-]+): (\d+) (\d+) (\d+);/g)) out[m[1]] = [+m[2], +m[3], +m[4]];
  return out;
}

const light = tokens(css.match(/:root \{([\s\S]*?)\n\}/)[1]);
const dark = tokens(css.match(/\n\.dark \{([\s\S]*?)\n\}/)[1]);

const luminance = ([r, g, b]) => {
  const c = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// Text colour on the background it is really used on
const PAIRS = [
  ['on-surface', 'surface'], ['on-surface', 'surface-container-lowest'], ['on-surface', 'surface-container-low'], ['on-surface', 'surface-container'],
  ['on-surface-variant', 'surface'], ['on-surface-variant', 'surface-container-lowest'], ['on-surface-variant', 'surface-container-low'], ['on-surface-variant', 'surface-container'],
  ['primary', 'surface-container-lowest'], ['primary', 'surface'], ['primary', 'surface-container-low'],
  ['on-primary', 'primary'], ['on-primary-container', 'primary-container'], ['on-primary-fixed', 'primary-fixed'],
  ['error', 'surface-container-lowest'], ['on-error', 'error'], ['on-error-container', 'error-container'],
  ['tertiary', 'surface-container-lowest'], ['on-tertiary-fixed', 'tertiary-fixed'], ['on-tertiary-fixed', 'tertiary-fixed-dim'],
  ['on-secondary-container', 'secondary-container'], ['inverse-on-surface', 'inverse-surface'], ['on-tertiary-container', 'tertiary-container'],
];

describe('theme tokens', () => {
  test('light and dark define exactly the same tokens', () => {
    assert.deepEqual(Object.keys(dark).sort(), Object.keys(light).sort());
    assert.ok(Object.keys(light).length >= 40);
  });

  for (const [name, theme] of [['light', light], ['dark', dark]]) {
    test(`${name}: text pairs meet WCAG AA (4.5:1)`, () => {
      const failures = PAIRS.map(([fg, bg]) => [fg, bg, ratio(theme[fg], theme[bg])]).filter(([, , r]) => r < 4.5)
        .map(([fg, bg, r]) => `${fg} on ${bg} = ${r.toFixed(2)}`);
      assert.deepEqual(failures, []);
    });
  }

  test('dark is really dark, light is really light', () => {
    assert.ok(luminance(dark.surface) < 0.03);
    assert.ok(luminance(light.surface) > 0.9);
    assert.ok(luminance(dark['on-surface']) > 0.7);
  });
});
