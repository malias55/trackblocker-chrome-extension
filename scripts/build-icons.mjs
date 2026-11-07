// Renders icons/icon.svg (and the grey "paused" variant) to PNGs with Chromium.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINK = '<path d="M10 14.5a4.2 4.2 0 0 0 6 0l3.2-3.2a4.2 4.2 0 0 0-6-6L11.6 7"/><path d="M14 9.5a4.2 4.2 0 0 0-6 0l-3.2 3.2a4.2 4.2 0 0 0 6 6l1.6-1.6"/>';

function svg({ off = false, small = false, padded = false } = {}) {
  const [a, b] = off ? ['#94a3b8', '#475569'] : ['#22d3ee', '#6366f1'];
  const stroke = small ? 3 : 2.4;
  const glyph = small ? 'translate(14 14) scale(4.17)' : 'translate(22 24) scale(3.5)';
  const sparkle = small ? '' : '<path d="M98 18c1.6 9.6 6.4 14.4 16 16-9.6 1.6-14.4 6.4-16 16-1.6-9.6-6.4-14.4-16-16 9.6-1.6 14.4-6.4 16-16Z" fill="#fff" opacity="0.95"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <g${padded ? ' transform="translate(16 16) scale(0.75)"' : ''}>
  <rect x="4" y="4" width="120" height="120" rx="30" fill="url(#g)"/>
  <rect x="4" y="4" width="120" height="120" rx="30" fill="url(#s)"/>
  <g transform="${glyph}" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${LINK}</g>
  ${sparkle}
  </g>
</svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await writeFile(path.join(root, 'icons/icon.svg'), svg());
for (const off of [false, true]) {
  for (const size of [16, 32, 48, 128]) {
    // Chrome Web Store guideline: 128px icons have 96px artwork and 16px padding.
    const markup = svg({ off, small: size <= 32, padded: size === 128 });
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    const file = path.join(root, `icons/icon-${size}${off ? '-off' : ''}.png`);
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('wrote', path.relative(root, file));
  }
}
await browser.close();
