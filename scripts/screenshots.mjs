// Creates the Chrome Web Store images in store/images from the real extension UI.
//   node scripts/screenshots.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { startServer, launch } = require('../tests/e2e/harness.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'store', 'images');
await fs.mkdir(out, { recursive: true });

const COPY = {
  en: {
    popup: ['Every link, washed clean.', 'Linkwash removes utm_source, fbclid, gclid and 500+ other trackers before a page even loads.'],
    overview: ['See what was removed.', 'Clear statistics – stored only on your device.'],
    protection: ['You decide what goes.', 'Eight categories, from ad click IDs to shopping trackers.'],
    tools: ['Share clean links.', 'Copy a clean link with one click, a right-click or Alt+Shift+C.']
  },
  de: {
    popup: ['Jeder Link, blitzsauber.', 'Linkwash entfernt utm_source, fbclid, gclid und über 500 weitere Tracker, bevor die Seite lädt.']
  },
  tr: {
    popup: ['Her bağlantı tertemiz.', 'Linkwash, sayfa yüklenmeden önce utm_source, fbclid, gclid ve 500\'den fazla izleyiciyi kaldırır.']
  }
};

const srv = await startServer();
const at = (host, p) => `http://${host}:${srv.port}${p}`;
const sec = (host, p) => `https://${host}:${srv.httpsPort}${p}`;

async function session(lang, theme) {
  const ext = await launch({ deviceScaleFactor: 2, colorScheme: theme });
  const base = `chrome-extension://${ext.extensionId}`;
  await ext.setSettings({ language: lang, theme });
  // Some browsing so the statistics have content.
  const visits = [
    sec('www.amazon.de', '/dp/B0C1?ref=sr_1_3&pd_rd_w=a&pf_rd_p=b&pd_rd_r=c&qid=1&sr=8-3&th=1'),
    sec('www.youtube.com', '/watch?v=a&si=xyz&feature=share&pp=ygU'),
    at('news.example', '/a?utm_source=newsletter&utm_medium=email&utm_campaign=fall&mc_eid=1&mc_cid=2'),
    at('blog.example', '/b?fbclid=IwAR&utm_source=facebook&utm_medium=social'),
    at('shop.example', '/c?gclid=Cj0&gad_source=1&srsltid=AfmB&utm_source=google'),
    sec('www.google.com', '/search?q=linkwash&sca_esv=1&ei=2&ved=3&oq=link&gs_lcrp=4&sourceid=chrome'),
    sec('www.instagram.com', '/p/x/?igsh=MWQ1'),
    sec('www.linkedin.com', '/posts/x?trk=public&lipi=abc&utm_source=share')
  ];
  const page = await ext.context.newPage();
  for (const v of visits) await page.goto(v, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(300);
  await page.goto(at('www.example-store.com', '/products/headphones?color=black&utm_source=instagram&utm_medium=social&utm_campaign=bf24&fbclid=IwAR2x&gclid=Cj0K&mc_eid=8f2&_hsenc=p2AN&igshid=MzRl'));
  await page.waitForTimeout(800);
  await ext.worker.evaluate(() => self.Linkwash.flushStats());
  return { ext, base, page };
}

async function shootPopup(ext, base, page, file) {
  const tabId = await ext.worker.evaluate(async () => (await chrome.tabs.query({ url: '*://www.example-store.com/*' }))[0].id);
  const popup = await ext.context.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.addInitScript((id) => {
    const original = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async (q) => (q && q.active ? [await chrome.tabs.get(id)] : original(q));
  }, tabId);
  await popup.goto(base + '/src/popup/popup.html');
  await popup.waitForFunction(() => !document.body.classList.contains('loading'));
  await popup.waitForTimeout(1200);
  const height = await popup.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
  await popup.setViewportSize({ width: 360, height });
  await popup.screenshot({ path: file });
  await popup.close();
}

async function shootOptions(ext, base, hash, file, size = { width: 1280, height: 800 }) {
  const p = await ext.context.newPage();
  await p.setViewportSize(size);
  await p.goto(base + '/src/options/options.html' + hash);
  await p.waitForFunction(() => !document.body.classList.contains('loading'));
  if (hash === '#tools') {
    await p.fill('#toolInput', 'https://www.amazon.de/dp/B0C1?ref=sr_1_3&pd_rd_w=a&pf_rd_p=b&qid=17&th=1&utm_source=newsletter');
  }
  if (hash === '#protection') {
    await p.locator('.cat[data-cat="social"] .cat-more').click();
  }
  await p.waitForTimeout(1000);
  if (hash) await p.evaluate((h) => document.querySelector(h).scrollIntoView(), hash);
  await p.waitForTimeout(300);
  await p.screenshot({ path: file });
  await p.close();
}

/** Put a UI screenshot on a branded 1280×800 canvas with a headline. */
async function compose(ext, image, [title, text], file, { wide = false, dir = 'ltr' } = {}) {
  const data = (await fs.readFile(image)).toString('base64');
  const p = await ext.context.newPage();
  await p.setViewportSize({ width: 1280, height: 800 });
  const imgStyle = wide
    ? 'display:block;width:820px;border-radius:14px;box-shadow:0 40px 80px -30px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)'
    : 'width:360px;border-radius:18px;box-shadow:0 40px 80px -30px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.08)';
  await p.setContent(`<!doctype html><html dir="${dir}"><body style="margin:0;width:1280px;height:800px;overflow:hidden;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:radial-gradient(1200px 600px at 85% 10%,rgba(34,211,238,.35),transparent 60%),radial-gradient(900px 600px at 0% 100%,rgba(99,102,241,.45),transparent 60%),#0b1020;color:#fff;position:relative">
    <div style="position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.08) 1px,transparent 1px);background-size:22px 22px"></div>
    <div style="position:absolute;${wide ? 'left:80px;top:90px;width:340px' : 'left:100px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center'}">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px">
        <img src="data:image/png;base64,${(await fs.readFile(path.join(root, 'icons/icon-128.png'))).toString('base64')}" width="56" height="56" style="margin:-8px">
        <span style="font-weight:750;font-size:24px;letter-spacing:-.02em">Linkwash</span>
      </div>
      <div style="font-size:${wide ? 40 : 54}px;line-height:1.05;font-weight:800;letter-spacing:-.035em">${title}</div>
      <div style="margin-top:20px;font-size:${wide ? 18 : 21}px;line-height:1.5;color:rgba(255,255,255,.75)">${text}</div>
    </div>
    <div style="position:absolute;${wide ? 'right:-40px;top:110px' : 'right:120px;top:0;bottom:0;display:flex;align-items:center'}"><img src="data:image/png;base64,${data}" style="${imgStyle}"></div>
  </body></html>`);
  await p.screenshot({ path: file });
  await p.close();
}

async function promo(ext, file, w, h) {
  const p = await ext.context.newPage();
  await p.setViewportSize({ width: w, height: h });
  const icon = (await fs.readFile(path.join(root, 'icons/icon-128.png'))).toString('base64');
  const big = w > 1000;
  const chips = ['utm_source', 'fbclid', 'gclid', 'si', 'igsh', 'mc_eid', 'ref', 'ved'];
  await p.setContent(`<!doctype html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;background:linear-gradient(135deg,#0e7490 0%,#3730a3 100%);position:relative;display:flex;align-items:center;${big ? 'padding:0 110px' : 'padding:0 34px'};box-sizing:border-box">
    <div style="position:absolute;inset:0;background:radial-gradient(${big ? 700 : 300}px ${big ? 400 : 200}px at 85% 15%,rgba(103,232,249,.5),transparent 70%)"></div>
    <div style="position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.12) 1px,transparent 1px);background-size:${big ? 22 : 14}px ${big ? 22 : 14}px;mask-image:linear-gradient(90deg,transparent,#000)"></div>
    <div style="position:relative;flex:1">
      <div style="display:flex;align-items:center;gap:${big ? 18 : 10}px">
        <img src="data:image/png;base64,${icon}" width="${big ? 120 : 64}" height="${big ? 120 : 64}" style="margin:${big ? -15 : -8}px">
        <span style="font-weight:800;font-size:${big ? 72 : 36}px;letter-spacing:-.035em">Linkwash</span>
      </div>
      <div style="margin-top:${big ? 22 : 12}px;font-size:${big ? 32 : 17}px;font-weight:600;color:rgba(255,255,255,.9)">Clean links. Zero trackers.</div>
      ${big ? `<div style="margin-top:14px;font-size:22px;color:rgba(255,255,255,.7)">No login · 100% local · 17 languages</div>` : ''}
    </div>
    ${big ? `<div style="position:relative;display:flex;flex-wrap:wrap;gap:12px;width:430px;justify-content:flex-end">${chips.map((c, i) => `<span style="font:600 22px ui-monospace,Menlo,monospace;padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);text-decoration:line-through;text-decoration-color:rgba(255,255,255,.7);opacity:${1 - i * 0.06}">${c}</span>`).join('')}</div>` : ''}
  </body>`);
  await p.screenshot({ path: file });
  await p.close();
}

const tmp = path.join(out, '.raw');
await fs.mkdir(tmp, { recursive: true });

// English, light
{
  const { ext, base, page } = await session('en', 'light');
  await shootPopup(ext, base, page, path.join(tmp, 'popup-en.png'));
  await shootOptions(ext, base, '', path.join(tmp, 'overview-en.png'), { width: 1180, height: 800 });
  await shootOptions(ext, base, '#protection', path.join(tmp, 'protection-en.png'), { width: 1180, height: 800 });
  await shootOptions(ext, base, '#tools', path.join(tmp, 'tools-en.png'), { width: 1180, height: 800 });
  await compose(ext, path.join(tmp, 'popup-en.png'), COPY.en.popup, path.join(out, 'screenshot-1-popup.png'));
  await compose(ext, path.join(tmp, 'overview-en.png'), COPY.en.overview, path.join(out, 'screenshot-2-overview.png'), { wide: true });
  await compose(ext, path.join(tmp, 'protection-en.png'), COPY.en.protection, path.join(out, 'screenshot-3-protection.png'), { wide: true });
  await compose(ext, path.join(tmp, 'tools-en.png'), COPY.en.tools, path.join(out, 'screenshot-4-tools.png'), { wide: true });
  await promo(ext, path.join(out, 'promo-small-440x280.png'), 440, 280);
  await promo(ext, path.join(out, 'promo-marquee-1400x560.png'), 1400, 560);
  await ext.context.close();
}
// German and Turkish, dark
for (const lang of ['de', 'tr']) {
  const { ext, base, page } = await session(lang, 'dark');
  await shootPopup(ext, base, page, path.join(tmp, `popup-${lang}.png`));
  await compose(ext, path.join(tmp, `popup-${lang}.png`), COPY[lang].popup, path.join(out, `screenshot-5-popup-${lang}.png`));
  await ext.context.close();
}
srv.close();
console.log('Images written to', path.relative(root, out));
