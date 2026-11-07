'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/shared/engine.js');
const Rules = require('../../src/shared/rules.js');

const compiled = Engine.compile({});
const clean = (url, opts) => Engine.cleanUrl(url, compiled, opts);

test('removes common global trackers and keeps real parameters', () => {
  const r = clean('https://example.com/article?id=42&utm_source=news&utm_medium=email&fbclid=abc&gclid=xyz&page=2');
  assert.equal(r.url, 'https://example.com/article?id=42&page=2');
  assert.deepEqual(r.removed.map((x) => x.name), ['utm_source', 'utm_medium', 'fbclid', 'gclid']);
  assert.equal(r.changed, true);
});

test('removes the whole query string when only trackers are left', () => {
  assert.equal(clean('https://example.com/?utm_source=x&utm_campaign=y').url, 'https://example.com/');
});

test('keeps the fragment and the original encoding of kept parameters', () => {
  const r = clean('https://example.com/p?q=a%20b+c&x=%E2%9C%93&utm_term=t#section-2');
  assert.equal(r.url, 'https://example.com/p?q=a%20b+c&x=%E2%9C%93#section-2');
});

test('leaves clean URLs and non-web URLs untouched', () => {
  for (const url of ['https://example.com/', 'https://example.com/?a=1', 'mailto:a@b.c?utm_source=x', 'javascript:alert(1)']) {
    const r = clean(url);
    assert.equal(r.changed, false, url);
    assert.deepEqual(r.removed, []);
  }
});

test('matching is case-sensitive like declarativeNetRequest', () => {
  assert.equal(clean('https://example.com/?UTM_SOURCE=x').changed, false);
});

test('site-specific parameters are only removed on their site', () => {
  assert.equal(clean('https://www.amazon.de/dp/B0?ref=sr_1_1&qid=1&th=1').url, 'https://www.amazon.de/dp/B0?th=1');
  assert.equal(clean('https://www.amazon.co.uk/dp/B0?pd_rd_w=1&pf_rd_p=2').url, 'https://www.amazon.co.uk/dp/B0');
  assert.equal(clean('https://www.amazon.com.tr/dp/B0?psc=1').url, 'https://www.amazon.com.tr/dp/B0');
  // "ref" is a real parameter on other sites.
  assert.equal(clean('https://example.com/?ref=main').changed, false);
});

test('social sites', () => {
  assert.equal(clean('https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=AbC&t=42').url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42');
  assert.equal(clean('https://youtu.be/dQw4w9WgXcQ?si=xyz').url, 'https://youtu.be/dQw4w9WgXcQ');
  assert.equal(clean('https://open.spotify.com/track/1?si=abc').url, 'https://open.spotify.com/track/1');
  assert.equal(clean('https://x.com/user/status/1?s=20&t=abc').url, 'https://x.com/user/status/1');
  assert.equal(clean('https://www.instagram.com/p/xyz/?igsh=MW1').url, 'https://www.instagram.com/p/xyz/');
  assert.equal(clean('https://www.tiktok.com/@u/video/1?is_from_webapp=1&sender_device=pc&_r=1').url, 'https://www.tiktok.com/@u/video/1');
  assert.equal(clean('https://www.linkedin.com/posts/x?trk=public_post&lipi=abc').url, 'https://www.linkedin.com/posts/x');
  assert.equal(clean('https://www.reddit.com/r/a/comments/b/?share_id=1&utm_name=ios').url, 'https://www.reddit.com/r/a/comments/b/');
});

test('Google search trackers are removed but the query stays', () => {
  const r = clean('https://www.google.de/search?q=linkwash&sca_esv=1&ei=abc&ved=0ah&oq=link&gs_lcrp=x&sourceid=chrome&ie=UTF-8');
  assert.equal(r.url, 'https://www.google.de/search?q=linkwash&ie=UTF-8');
  assert.ok(r.removed.every((x) => x.category === 'search'));
});

test('wildcard TLDs do not match unrelated hosts', () => {
  assert.equal(clean('https://notamazon.de/?ref=1').changed, false);
  assert.equal(clean('https://amazon.example.com/?ref=1').changed, false);
});

test('affiliate tags are kept by default and removed when enabled', () => {
  const url = 'https://www.amazon.de/dp/B0?tag=creator-21&ref=x';
  assert.equal(clean(url).url, 'https://www.amazon.de/dp/B0?tag=creator-21');
  const withAff = Engine.compile({ categories: { affiliate: true } });
  assert.equal(Engine.cleanUrl(url, withAff).url, 'https://www.amazon.de/dp/B0');
});

test('disabling a category keeps its parameters', () => {
  const c = Engine.compile({ categories: { marketing: false } });
  assert.equal(Engine.cleanUrl('https://e.com/?utm_source=x&fbclid=1', c).url, 'https://e.com/?utm_source=x');
});

test('custom parameters are removed on every site', () => {
  const c = Engine.compile({ customParams: ['my_track', 'bad name'] });
  assert.deepEqual(c.settings.customParams, ['my_track']);
  const r = Engine.cleanUrl('https://e.com/?my_track=1&keep=2', c);
  assert.equal(r.url, 'https://e.com/?keep=2');
  assert.equal(r.removed[0].category, 'custom');
});

test('paused sites and the global switch', () => {
  const c = Engine.compile({ allowlist: ['https://www.Example.com/path'] });
  assert.deepEqual(c.settings.allowlist, ['example.com']);
  assert.equal(Engine.cleanUrl('https://shop.example.com/?utm_source=x', c).changed, false);
  assert.equal(Engine.cleanUrl('https://other.com/?utm_source=x', c).changed, true);
  const off = Engine.compile({ enabled: false });
  assert.equal(Engine.cleanUrl('https://e.com/?utm_source=x', off).changed, false);
  assert.equal(Engine.cleanUrl('https://e.com/?utm_source=x', off, { force: true }).url, 'https://e.com/');
});

test('unwraps redirect links and cleans the destination', () => {
  const cases = [
    ['https://www.google.com/url?q=https://example.com/a?utm_source=g&sa=U&ved=1', 'https://example.com/a'],
    ['https://www.google.de/url?url=https%3A%2F%2Fexample.com%2F%3Fid%3D1&rct=j', 'https://example.com/?id=1'],
    ['https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2F%3Ffbclid%3Dx&h=AT0', 'https://example.com/'],
    ['https://www.youtube.com/redirect?event=video_description&q=https%3A%2F%2Fexample.com%2Fx&v=1', 'https://example.com/x'],
    ['https://out.reddit.com/t3_x?url=https%3A%2F%2Fexample.com%2F&token=1', 'https://example.com/'],
    ['https://steamcommunity.com/linkfilter/?url=https://example.com/', 'https://example.com/'],
    ['https://disq.us/url?url=https%3A%2F%2Fexample.com%2Fpage%3AabC123&cuid=1', 'https://example.com/page'],
    ['https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F&rut=1', 'https://example.com/'],
    ['https://deref-gmx.net/mail/client/x/dereferrer/?redirectUrl=https%3A%2F%2Fexample.com%2F', 'https://example.com/'],
    ['https://www.youtube.com/attribution_link?u=%2Fwatch%3Fv%3Dabc%26feature%3Dshare', 'https://www.youtube.com/watch?v=abc'],
    // Nested wrappers
    ['https://www.google.com/url?q=' + encodeURIComponent('https://l.facebook.com/l.php?u=' + encodeURIComponent('https://example.com/?utm_source=x')), 'https://example.com/']
  ];
  for (const [input, expected] of cases) {
    const r = clean(input);
    assert.equal(r.url, expected, input);
    assert.equal(r.unwrapped, true, input);
  }
});

test('decodes Bing click-tracking links', () => {
  const target = 'https://example.com/ü?x=1';
  const b64 = Buffer.from(target, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = clean('https://www.bing.com/ck/a?!&&p=abc&u=a1' + b64 + '&ntb=1');
  assert.equal(r.url, new URL(target).href);
});

test('never unwraps to non-web URLs', () => {
  for (const url of [
    'https://www.google.com/url?q=javascript:alert(1)',
    'https://l.facebook.com/l.php?u=data:text/html,hi',
    'https://www.google.com/url?q=file:///etc/passwd'
  ]) {
    const r = clean(url);
    assert.equal(r.unwrapped, false, url);
  }
});

test('unwrapping can be turned off', () => {
  const r = clean('https://www.google.com/url?q=https://example.com/', { unwrap: false });
  assert.equal(r.unwrapped, false);
  assert.ok(r.url.startsWith('https://www.google.com/url'));
});

test('normalizeDomain', () => {
  assert.equal(Engine.normalizeDomain('Example.COM'), 'example.com');
  assert.equal(Engine.normalizeDomain('https://www.example.com/a?b'), 'example.com');
  assert.equal(Engine.normalizeDomain('sub.example.co.uk'), 'sub.example.co.uk');
  assert.equal(Engine.normalizeDomain('münchen.de'), 'xn--mnchen-3ya.de');
  for (const bad of ['', '   ', 'not a domain', 'example', null, 42]) assert.equal(Engine.normalizeDomain(bad), null, String(bad));
});

test('normalizeSettings fills defaults and drops junk', () => {
  const s = Engine.normalizeSettings({ enabled: 'yes', theme: 'neon', categories: { ads: false, bogus: true }, allowlist: 'x' });
  assert.equal(s.enabled, true);
  assert.equal(s.theme, 'auto');
  assert.equal(s.categories.ads, false);
  assert.equal(s.categories.affiliate, false);
  assert.equal('bogus' in s.categories, false);
  assert.deepEqual(s.allowlist, []);
});
