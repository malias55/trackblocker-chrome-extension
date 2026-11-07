'use strict';
// End-to-end tests: the real extension in Chromium, against a local server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, launch } = require('./harness.js');

let srv;
let ext;
let base;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const at = (host, pathAndQuery) => `http://${host}:${srv.port}${pathAndQuery}`;
// amazon, google and youtube are HSTS-preloaded, so Chrome always uses HTTPS for them.
const sec = (host, pathAndQuery) => `https://${host}:${srv.httpsPort}${pathAndQuery}`;
const lastRequest = (host, pathname) => [...srv.requests].reverse().find((r) => r.host === host && r.url.split('?')[0] === pathname);

async function open(url) {
  const page = await ext.context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  return page;
}

test.before(async () => {
  srv = await startServer();
  ext = await launch();
  base = `chrome-extension://${ext.extensionId}`;
});

test.after(async () => {
  if (ext) await ext.context.close();
  if (srv) srv.close();
});

test.beforeEach(async () => {
  await ext.resetSettings();
});

test('strips global trackers before the request reaches the server', async () => {
  const page = await open(at('news.example', '/article?id=7&utm_source=newsletter&utm_medium=email&fbclid=IwAR0&gclid=Cj0'));
  assert.equal(lastRequest('news.example', '/article').url, '/article?id=7');
  assert.equal(page.url(), at('news.example', '/article?id=7'));
  await page.close();
});

test('keeps links without trackers as they are and does not loop', async () => {
  const before = srv.requests.length;
  const page = await open(at('clean.example', '/a?q=hello&page=2'));
  const hits = srv.requests.slice(before).filter((r) => r.host === 'clean.example' && r.url.startsWith('/a'));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].url, '/a?q=hello&page=2');
  await page.close();
});

test('site rules: Amazon, YouTube, Google with country domains', async () => {
  let page = await open(sec('www.amazon.de', '/dp/B0TEST?ref=sr_1_1&pd_rd_w=x&th=1&utm_source=y'));
  assert.equal(lastRequest('www.amazon.de', '/dp/B0TEST').url, '/dp/B0TEST?th=1');
  await page.close();

  page = await open(sec('www.youtube.com', '/watch?v=abc&si=share123&t=42'));
  assert.equal(lastRequest('www.youtube.com', '/watch').url, '/watch?v=abc&t=42');
  await page.close();

  page = await open(sec('www.google.com.tr', '/search?q=linkwash&ei=1&ved=2&sca_esv=3'));
  assert.equal(lastRequest('www.google.com.tr', '/search').url, '/search?q=linkwash');
  await page.close();

  // Site parameters are not removed elsewhere.
  page = await open(at('blog.example', '/post?ref=home&si=1'));
  assert.equal(lastRequest('blog.example', '/post').url, '/post?ref=home&si=1');
  await page.close();
});

test('parameters with dots and other special names', async () => {
  const page = await open(at('shop.example', '/x?WT.mc_id=abc&keep=1&_hsenc=2&mc_eid=3'));
  assert.equal(lastRequest('shop.example', '/x').url, '/x?keep=1');
  await page.close();
});

test('cleans iframes too', async () => {
  const src = at('frame.example', '/embed?v=1&utm_campaign=x');
  const page = await open(at('host.example', '/frame-host?src=' + encodeURIComponent(src)));
  await page.waitForTimeout(300);
  assert.equal(lastRequest('frame.example', '/embed').url, '/embed?v=1');
  await page.close();
});

test('counts removed trackers per tab and in the statistics', async () => {
  const page = await open(at('count.example', '/p?utm_source=a&utm_medium=b&fbclid=c'));
  await wait(600);
  const state = await ext.worker.evaluate(async () => {
    const all = await chrome.storage.session.get(null);
    await self.Linkwash.flushStats();
    const { stats } = await chrome.storage.local.get('stats');
    const tab = Object.values(all).find((s) => s && s.host === 'count.example');
    return { tab, stats };
  });
  assert.ok(state.tab, 'tab state exists');
  assert.equal(state.tab.count, 3);
  assert.deepEqual(state.tab.items.map((i) => i.name).sort(), ['fbclid', 'utm_medium', 'utm_source']);
  assert.ok(state.stats.params >= 3);
  assert.ok(state.stats.byParam.utm_source >= 1);
  assert.ok(state.stats.bySite['count.example'] >= 3);

  // A new navigation without trackers resets the counter.
  await page.goto(at('count.example', '/next'));
  await wait(300);
  const after = await ext.worker.evaluate(async () => {
    const all = await chrome.storage.session.get(null);
    return Object.values(all).find((s) => s && s.host === 'count.example');
  });
  assert.equal(after.count, 0);
  await page.close();
});

test('paused sites are left alone', async () => {
  await ext.setSettings({ allowlist: ['paused.example'] });
  let page = await open(at('www.paused.example', '/a?utm_source=x'));
  assert.equal(lastRequest('www.paused.example', '/a').url, '/a?utm_source=x');
  await page.close();
  page = await open(at('other.example', '/a?utm_source=x'));
  assert.equal(lastRequest('other.example', '/a').url, '/a');
  await page.close();
});

test('the master switch pauses everything', async () => {
  await ext.setSettings({ enabled: false });
  const rules = await ext.worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  assert.equal(rules.length, 0);
  const page = await open(at('off.example', '/a?utm_source=x'));
  assert.equal(lastRequest('off.example', '/a').url, '/a?utm_source=x');
  await page.close();
});

test('categories and own parameters', async () => {
  await ext.setSettings({ categories: { marketing: false }, customParams: ['my_tracker'] });
  const page = await open(at('cat.example', '/a?utm_source=x&gclid=y&my_tracker=z&id=1'));
  assert.equal(lastRequest('cat.example', '/a').url, '/a?utm_source=x&id=1');
  await page.close();
});

test('affiliate tags only go when the category is on', async () => {
  let page = await open(sec('www.amazon.com', '/dp/X?tag=creator-20&ref=abc'));
  assert.equal(lastRequest('www.amazon.com', '/dp/X').url, '/dp/X?tag=creator-20');
  await page.close();
  await ext.setSettings({ categories: { affiliate: true } });
  page = await open(sec('www.amazon.com', '/dp/X?tag=creator-20&ref=abc'));
  assert.equal(lastRequest('www.amazon.com', '/dp/X').url, '/dp/X');
  await page.close();
});

test('clicking a wrapped link skips the redirect page and removes pings', async () => {
  const target = at('target.example', '/dest?utm_source=g&keep=1');
  const wrapped = sec('www.google.com', '/url?q=' + encodeURIComponent(target) + '&sa=U&ved=abc');
  const page = await open(at('links.example', '/links?ping=1&href=' + encodeURIComponent(wrapped)));
  await page.waitForTimeout(200);
  const before = srv.requests.length;
  await page.hover('#link');
  await page.mouse.down();
  assert.equal(await page.getAttribute('#link', 'ping'), null, 'ping attribute removed');
  assert.equal(await page.getAttribute('#link', 'href'), at('target.example', '/dest?keep=1'));
  await page.mouse.up();
  await page.waitForURL((u) => u.hostname === 'target.example');
  const hits = srv.requests.slice(before);
  assert.ok(!hits.some((r) => r.host === 'www.google.com'), 'redirect page was skipped');
  assert.ok(!hits.some((r) => r.url === '/ping'), 'no ping sent');
  assert.equal(lastRequest('target.example', '/dest').url, '/dest?keep=1');
  await page.close();
});

test('right-click cleans the link so "Copy link address" copies the clean URL', async () => {
  const href = at('shop.example', '/item?id=5&utm_source=x');
  const page = await open(at('links2.example', '/links?href=' + encodeURIComponent(href)));
  await page.waitForTimeout(200);
  await page.dispatchEvent('#link', 'contextmenu', { bubbles: true, composed: true });
  assert.equal(await page.getAttribute('#link', 'href'), at('shop.example', '/item?id=5'));
  await page.close();
});

test('popup renders and shows the page counter', async () => {
  const page = await open(at('popup.example', '/p?utm_source=a&fbclid=b'));
  await wait(400);
  const tabId = await ext.worker.evaluate(async () => (await chrome.tabs.query({ url: '*://popup.example/*' }))[0].id);
  // Open the popup in a tab, with the test page as the "active tab".
  const popup = await ext.context.newPage();
  await popup.addInitScript((id) => {
    const original = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async (q) => (q && q.active ? [await chrome.tabs.get(id)] : original(q));
  }, tabId);
  const errors = [];
  popup.on('pageerror', (e) => errors.push(e.message));
  await popup.goto(base + '/src/popup/popup.html');
  await popup.waitForFunction(() => !document.body.classList.contains('loading'));
  await popup.waitForFunction(() => document.getElementById('tabCount').textContent === '2');
  assert.equal(await popup.textContent('#siteHost'), 'popup.example');
  assert.equal(await popup.textContent('#status'), 'Protected');
  assert.deepEqual((await popup.$$eval('#chips .chip-text', (els) => els.map((e) => e.textContent))).sort(), ['fbclid', 'utm_source']);
  assert.equal(await popup.isChecked('#siteToggle'), true);

  // Pausing the site from the popup adds it to the allowlist.
  await popup.click('.site .switch');
  await wait(300);
  const { settings } = await ext.worker.evaluate(() => chrome.storage.sync.get('settings'));
  assert.deepEqual(settings.allowlist, ['popup.example']);
  assert.equal(await popup.textContent('#status'), 'Paused on this site');
  assert.deepEqual(errors, []);
  await popup.close();
  await page.close();
});

test('settings page: categories, link cleaner, language', async () => {
  const page = await ext.context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/src/options/options.html');
  await page.waitForFunction(() => !document.body.classList.contains('loading'));
  assert.equal(await page.locator('.cat').count(), 8);

  // Toggle "Ad click IDs" off.
  await page.locator('.cat[data-cat="ads"] .switch').click();
  await wait(300);
  let { settings } = await ext.worker.evaluate(() => chrome.storage.sync.get('settings'));
  assert.equal(settings.categories.ads, false);

  // Link cleaner
  await page.fill('#toolInput', 'https://www.amazon.de/dp/B0?ref=x&utm_source=y&th=1');
  assert.equal(await page.textContent('#toolUrl'), 'https://www.amazon.de/dp/B0?th=1');
  assert.equal(await page.locator('#toolRemoved .chip').count(), 2);
  assert.equal(await page.isVisible('#toolBadge'), false, 'no redirect badge for a direct link');
  await page.fill('#toolInput', 'https://www.google.com/url?q=https%3A%2F%2Fexample.com%2F%3Futm_source%3Dx');
  assert.equal(await page.textContent('#toolUrl'), 'https://example.com/');
  assert.equal(await page.isVisible('#toolBadge'), true);

  // Add a paused site and an own parameter.
  await page.fill('#siteInput', 'https://www.broken-site.com/page');
  await page.press('#siteInput', 'Enter');
  await page.fill('#paramInput', 'foo_id, bar_id');
  await page.press('#paramInput', 'Enter');
  await wait(200);
  ({ settings } = await ext.worker.evaluate(() => chrome.storage.sync.get('settings')));
  assert.deepEqual(settings.allowlist, ['broken-site.com']);
  assert.deepEqual(settings.customParams, ['foo_id', 'bar_id']);
  await page.fill('#siteInput', 'not a domain');
  await page.press('#siteInput', 'Enter');
  assert.ok((await page.textContent('#siteError')).length > 0);

  // Switch to German, then Turkish.
  await page.selectOption('#language', 'de');
  await page.waitForFunction(() => document.documentElement.lang === 'de');
  await page.waitForFunction(() => !document.body.classList.contains('loading'));
  assert.notEqual(await page.textContent('[data-i18n="navProtection"]'), 'Protection');
  await page.selectOption('#language', 'tr');
  await page.waitForFunction(() => document.documentElement.lang === 'tr');
  await page.selectOption('#language', 'ar');
  await page.waitForFunction(() => document.documentElement.dir === 'rtl');
  assert.deepEqual(errors, []);
  await page.close();
});

test('every language loads without missing strings', async () => {
  const codes = await ext.worker.evaluate(() => LinkwashI18n.LANGUAGES.map((l) => l.code));
  const page = await ext.context.newPage();
  for (const code of codes) {
    await ext.setSettings({ language: code });
    await page.goto(base + '/src/options/options.html');
    await page.waitForFunction(() => !document.body.classList.contains('loading'));
    // Untranslated keys would show up as the raw key name.
    const raw = await page.$$eval('[data-i18n]', (els) => els.filter((e) => /^[a-z]+[A-Z_][A-Za-z_]*$/.test(e.textContent.trim())).map((e) => e.dataset.i18n));
    assert.deepEqual(raw, [], code);
  }
  await page.close();
});
