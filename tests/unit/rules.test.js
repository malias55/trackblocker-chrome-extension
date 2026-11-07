'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../../src/shared/engine.js');
const Rules = require('../../src/shared/rules.js');

const ROOT = path.join(__dirname, '..', '..');
const categoryIds = Rules.CATEGORIES.map((c) => c.id);

test('every parameter is in a known category and listed once', () => {
  const globalSeen = new Map();
  for (const [cat, names] of Object.entries(Rules.GLOBAL_PARAMS)) {
    assert.ok(categoryIds.includes(cat), cat);
    for (const n of names) {
      assert.ok(Engine.isValidParamName(n), `invalid name ${n}`);
      assert.ok(!globalSeen.has(n), `${n} listed in ${globalSeen.get(n)} and ${cat}`);
      globalSeen.set(n, cat);
    }
  }
  for (const site of Rules.SITES) {
    const seen = new Set();
    for (const [cat, names] of Object.entries(site.params)) {
      assert.ok(categoryIds.includes(cat), `${site.id}: ${cat}`);
      for (const n of names) {
        assert.ok(Engine.isValidParamName(n), `${site.id}: invalid ${n}`);
        assert.ok(!seen.has(n), `${site.id}: duplicate ${n}`);
        assert.ok(!globalSeen.has(n), `${site.id}: ${n} is already global`);
        seen.add(n);
      }
    }
  }
});

test('site domains do not overlap (Chrome applies only one redirect rule)', () => {
  const owner = new Map();
  for (const site of Rules.SITES) {
    assert.ok(/^[a-z0-9_]+$/.test(site.id), site.id);
    for (const d of site.domains) {
      assert.ok(/^[a-z0-9.-]+(\.\*)?$/.test(d), `${site.id}: bad domain ${d}`);
      assert.ok(!owner.has(d), `${d} in ${owner.get(d)} and ${site.id}`);
      owner.set(d, site.id);
    }
  }
  const compiled = Engine.compile({});
  for (const site of Rules.SITES) {
    for (const d of site.domains) {
      const host = 'www.' + d.replace(/\.\*$/, '.com');
      const matches = compiled.sites.filter((s) => s.matches(host)).map((s) => s.id);
      assert.deepEqual(matches, [site.id], host);
    }
  }
});

test('never strips parameters that sites need to work', () => {
  const essential = ['q', 'v', 't', 'id', 'p', 'page', 'list', 'index', 'k', 'url', 'u', 'redirect', 'next', 'code', 'state', 'token', 'lang', 'hl', 'gl', 'session', 'key', 'search', 'query', 'tbm', 'start', 'th', 'smid', 'm', 'var', 'sk', 'context'];
  const compiled = Engine.compile({ categories: Object.fromEntries(categoryIds.map((c) => [c, true])) });
  for (const name of essential) {
    if (name === 't' || name === 'sk' || name === 'context') continue; // checked per site below
    assert.ok(!compiled.global.has(name), `global list contains ${name}`);
  }
  // Specific sites where a short name is functional.
  const keep = [
    ['https://www.youtube.com/watch?v=a&t=30&list=b&index=2', 'YouTube timestamp/playlist'],
    ['https://www.amazon.de/s?k=usb&page=2&rh=n%3A1', 'Amazon search'],
    ['https://www.amazon.de/dp/B0?th=1&psc_keep=1&smid=A1&m=A2', 'Amazon offer'],
    ['https://www.google.com/search?q=x&tbm=isch&start=10&hl=de', 'Google search'],
    ['https://www.ebay.de/itm/1?var=2', 'eBay variant'],
    ['https://www.reddit.com/r/a/comments/b/c/d/?context=3', 'Reddit comment context'],
    ['https://medium.com/@a/b-123?sk=friendlink', 'Medium friend link'],
    ['https://accounts.google.com/o/oauth2/auth?client_id=1&redirect_uri=x&state=y&code=z', 'OAuth']
  ];
  for (const [url, label] of keep) {
    assert.equal(Engine.cleanUrl(url, compiled).url, new URL(url).href, label);
  }
});

test('declarativeNetRequest rules are valid', () => {
  const compiled = Engine.compile({ allowlist: ['example.com'], customParams: ['x_track'] });
  const rules = Engine.buildDnrRules(compiled);
  const ids = new Set();
  let regexCount = 0;
  for (const r of rules) {
    assert.ok(Number.isInteger(r.id) && r.id > 0);
    assert.ok(!ids.has(r.id), 'duplicate id');
    ids.add(r.id);
    assert.ok(r.condition.resourceTypes.length);
    if (r.action.type === 'redirect') {
      const params = r.action.redirect.transform.queryTransform.removeParams;
      assert.ok(params.length > 0);
      assert.equal(new Set(params).size, params.length, `duplicate params in rule ${r.id}`);
      assert.ok(params.includes('utm_source'), 'every redirect rule includes the global params');
      assert.ok(params.includes('x_track'));
    }
    if (r.condition.regexFilter) {
      regexCount++;
      new RegExp(r.condition.regexFilter); // must compile
      assert.ok(r.condition.regexFilter.length < 2000);
    }
  }
  assert.equal(rules[0].action.type, 'allow');
  assert.deepEqual(rules[0].condition.requestDomains, ['example.com']);
  assert.ok(rules.length < 5000, 'dynamic rule limit');
  assert.ok(regexCount < 1000, 'regex rule limit');
});

test('regex filters match the same hosts as the JavaScript matcher', () => {
  const compiled = Engine.compile({});
  const rules = Engine.buildDnrRules(compiled).filter((r) => r.condition.regexFilter);
  const hosts = ['www.amazon.de', 'amazon.co.uk', 'smile.amazon.com', 'www.amazon.com.tr', 'www.google.com', 'google.de', 'www.ebay.de', 'de.aliexpress.com', 'notamazon.de', 'amazon.example.com', 'www.zalando.de'];
  for (const host of hosts) {
    for (const port of ['', ':8080']) {
      const url = 'https://' + host + port + '/path?x=1';
      const dnr = rules.some((r) => new RegExp(r.condition.regexFilter).test(url));
      const js = compiled.sites.some((s) => s.domains.some((d) => d.endsWith('.*')) && s.matches(host));
      assert.equal(dnr, js, url);
    }
  }
});

test('no rules are generated while paused', () => {
  assert.deepEqual(Engine.buildDnrRules(Engine.compile({ enabled: false })), []);
});

test('manifest is valid', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.content_scripts.flatMap((c) => c.js)
  ];
  for (const f of files) assert.ok(fs.existsSync(path.join(ROOT, f)), `missing ${f}`);
  for (const size of [16, 32, 48]) assert.ok(fs.existsSync(path.join(ROOT, `icons/icon-${size}-off.png`)));
});

test('all locales are complete and fit Chrome Web Store limits', () => {
  const dir = path.join(ROOT, '_locales');
  const en = JSON.parse(fs.readFileSync(path.join(dir, 'en', 'messages.json'), 'utf8'));
  const I18n = require('../../src/shared/i18n.js');
  const locales = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory());
  for (const l of I18n.LANGUAGES) assert.ok(locales.includes(l.code), `missing locale ${l.code}`);
  for (const code of locales) {
    const msgs = JSON.parse(fs.readFileSync(path.join(dir, code, 'messages.json'), 'utf8'));
    assert.deepEqual(Object.keys(msgs).sort(), Object.keys(en).sort(), `${code} keys`);
    for (const [key, { message }] of Object.entries(en)) {
      const tr = msgs[key].message;
      assert.equal(typeof tr, 'string');
      assert.ok(tr.trim().length > 0, `${code}.${key} empty`);
      for (const ph of message.match(/\$\d/g) || []) assert.ok(tr.includes(ph), `${code}.${key} misses ${ph}`);
    }
    assert.ok(msgs.extName.message.length <= 75, `${code} extName too long`);
    assert.ok(msgs.extShortName.message.length <= 12, `${code} extShortName too long`);
    assert.ok(msgs.extDescription.message.length <= 132, `${code} extDescription too long (${msgs.extDescription.message.length})`);
  }
});

test('every translation key used in the UI exists', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales/en/messages.json'), 'utf8'));
  const used = new Set();
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/\bt\('([A-Za-z_]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/I18n\.t\('([A-Za-z_]+)'/g)) used.add(m[1]);
  });
  walk(path.join(ROOT, 'src'));
  for (const c of categoryIds.concat('custom')) {
    used.add(`cat_${c}_name`);
    if (c !== 'custom') used.add(`cat_${c}_desc`);
  }
  used.delete('cat_');
  for (const k of used) assert.ok(k in en, `missing key ${k}`);
  const manifest = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
  for (const m of manifest.matchAll(/__MSG_(\w+)__/g)) assert.ok(m[1] in en, `manifest key ${m[1]}`);
});

test('i18n resolves browser locales', () => {
  const I18n = require('../../src/shared/i18n.js');
  assert.equal(I18n.resolve('de-AT'), 'de');
  assert.equal(I18n.resolve('tr'), 'tr');
  assert.equal(I18n.resolve('pt-PT'), 'pt_BR');
  assert.equal(I18n.resolve('zh-TW'), 'zh_CN');
  assert.equal(I18n.resolve('sv'), 'en');
  assert.equal(I18n.resolve(undefined), 'en');
});
