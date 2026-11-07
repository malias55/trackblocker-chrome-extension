/*
 * Linkwash engine. The background worker, popup, options page and tests all
 * use this code, so they clean URLs the same way.
 *
 *   compile(settings)         -> compiled rule set for the current settings
 *   cleanUrl(url, compiled)   -> { url, removed[], unwrapped, changed }
 *   buildDnrRules(compiled)   -> chrome.declarativeNetRequest dynamic rules
 */
(function (root) {
  'use strict';

  const Rules = (typeof module !== 'undefined' && module.exports)
    ? require('./rules.js')
    : root.LinkwashRules;

  const TLD = '[a-z]{2,3}(\\.[a-z]{2})?';
  const RESOURCE_TYPES = ['main_frame', 'sub_frame'];
  const PRIORITY = { global: 1, site: 2, allow: 100 };
  const MAX_UNWRAP_DEPTH = 4;

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    categories: Object.freeze(Object.fromEntries(Rules.CATEGORIES.map((c) => [c.id, c.default]))),
    allowlist: Object.freeze([]),
    customParams: Object.freeze([]),
    unwrapRedirects: true,
    blockPings: true,
    showBadge: true,
    language: 'auto',
    theme: 'auto'
  });

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Normalise user input ("https://www.Example.com/path") to "example.com". */
  function normalizeDomain(input) {
    if (typeof input !== 'string') return null;
    let s = input.trim().toLowerCase();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'http://' + s;
    let host;
    try {
      host = new URL(s).hostname;
    } catch (_) {
      return null;
    }
    host = host.replace(/^www\./, '').replace(/\.$/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && host !== 'localhost') return null;
    return host;
  }

  /** A query parameter name is valid if it can't break the query string. */
  function isValidParamName(name) {
    return typeof name === 'string' && name.length > 0 && name.length <= 100 && !/[\s&=#?]/.test(name);
  }

  /** Fill in missing or invalid settings with defaults. */
  function normalizeSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const categories = {};
    for (const c of Rules.CATEGORIES) {
      const v = s.categories && s.categories[c.id];
      categories[c.id] = typeof v === 'boolean' ? v : c.default;
    }
    const bool = (k) => (typeof s[k] === 'boolean' ? s[k] : DEFAULT_SETTINGS[k]);
    const str = (k) => (typeof s[k] === 'string' ? s[k] : DEFAULT_SETTINGS[k]);
    const allowlist = Array.from(new Set((Array.isArray(s.allowlist) ? s.allowlist : [])
      .map(normalizeDomain).filter(Boolean))).sort();
    const customParams = Array.from(new Set((Array.isArray(s.customParams) ? s.customParams : [])
      .map((p) => (typeof p === 'string' ? p.trim() : p)).filter(isValidParamName)));
    return {
      enabled: bool('enabled'),
      categories,
      allowlist,
      customParams,
      unwrapRedirects: bool('unwrapRedirects'),
      blockPings: bool('blockPings'),
      showBadge: bool('showBadge'),
      language: str('language'),
      theme: ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : 'auto'
    };
  }

  /** "amazon.*" -> RegExp matching amazon.de, www.amazon.co.uk, … */
  function wildcardHostRegex(bases) {
    return new RegExp('(^|\\.)(' + bases.map(escapeRegex).join('|') + ')\\.' + TLD + '$');
  }

  function splitDomains(domains) {
    const exact = [];
    const wild = [];
    for (const d of domains) {
      if (d.endsWith('.*')) wild.push(d.slice(0, -2));
      else exact.push(d);
    }
    return { exact, wild };
  }

  function makeHostMatcher(domains) {
    const { exact, wild } = splitDomains(domains);
    const re = wild.length ? wildcardHostRegex(wild) : null;
    return function (host) {
      for (const d of exact) {
        if (host === d || host.endsWith('.' + d)) return true;
      }
      return re ? re.test(host) : false;
    };
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    } catch (_) {
      return '';
    }
  }

  /** Build the lookup tables for a given settings object. */
  function compile(rawSettings) {
    const settings = normalizeSettings(rawSettings);
    const on = settings.categories;

    const global = new Map();
    for (const [cat, names] of Object.entries(Rules.GLOBAL_PARAMS)) {
      if (!on[cat]) continue;
      for (const n of names) global.set(n, cat);
    }
    for (const n of settings.customParams) if (!global.has(n)) global.set(n, 'custom');

    const sites = Rules.SITES.map((site) => {
      const params = new Map();
      for (const [cat, names] of Object.entries(site.params)) {
        if (!on[cat]) continue;
        for (const n of names) params.set(n, cat);
      }
      return { id: site.id, name: site.name, domains: site.domains, matches: makeHostMatcher(site.domains), params };
    });

    const redirects = Rules.REDIRECTS.map((r) => ({ ...r, matches: makeHostMatcher(r.hosts) }));
    const allowMatch = makeHostMatcher(settings.allowlist);

    return {
      settings,
      global,
      sites,
      redirects,
      siteFor(host) {
        return sites.find((s) => s.matches(host)) || null;
      },
      isAllowlisted(host) {
        return settings.allowlist.length > 0 && allowMatch(host);
      }
    };
  }

  function safeDecode(s) {
    try {
      return decodeURIComponent(s.replace(/\+/g, ' '));
    } catch (_) {
      return s;
    }
  }

  function isWebUrl(u) {
    return u && (u.protocol === 'http:' || u.protocol === 'https:');
  }

  function decodeBing(value) {
    // Bing's /ck/a?u=a1<base64url-encoded destination>
    if (!/^a1[A-Za-z0-9_-]+=*$/.test(value)) return null;
    const b64 = value.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    try {
      const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
      return decodeURIComponent(Array.from(bin, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    } catch (_) {
      return null;
    }
  }

  /** If `url` is a known redirect wrapper, return the destination URL string. */
  function unwrapOnce(url, compiled) {
    let u;
    try {
      u = new URL(url);
    } catch (_) {
      return null;
    }
    if (!isWebUrl(u)) return null;
    const host = u.hostname.toLowerCase();
    for (const r of compiled.redirects) {
      if (!r.matches(host) || !u.pathname.startsWith(r.path)) continue;
      for (const p of r.param) {
        let value = u.searchParams.get(p);
        if (!value) continue;
        if (r.decode === 'bing') value = decodeBing(value);
        else if (r.decode === 'disqus') value = value.replace(/:[A-Za-z0-9_-]+$/, '');
        if (!value) continue;
        let target;
        try {
          target = r.base ? new URL(value, r.base) : new URL(value);
        } catch (_) {
          continue;
        }
        if (isWebUrl(target)) return target.href;
      }
    }
    return null;
  }

  /** Remove tracking parameters from the query string. The rest stays as it was. */
  function stripParams(url, compiled) {
    let u;
    try {
      u = new URL(url);
    } catch (_) {
      return { url, removed: [] };
    }
    if (!isWebUrl(u) || !u.search) return { url: u.href, removed: [] };
    const host = u.hostname.toLowerCase();
    if (compiled.isAllowlisted(host)) return { url: u.href, removed: [] };
    const site = compiled.siteFor(host);
    const removed = [];
    const kept = [];
    for (const piece of u.search.slice(1).split('&')) {
      if (!piece) continue;
      const eq = piece.indexOf('=');
      const key = safeDecode(eq === -1 ? piece : piece.slice(0, eq));
      const cat = (site && site.params.get(key)) || compiled.global.get(key);
      if (cat) removed.push({ name: key, category: cat, site: site && site.params.has(key) ? site.id : null });
      else kept.push(piece);
    }
    if (!removed.length) return { url: u.href, removed };
    u.search = kept.length ? '?' + kept.join('&') : '';
    return { url: u.href, removed };
  }

  /**
   * Clean a URL: open redirect wrappers (if enabled), then remove tracking
   * parameters.
   * @returns {{url: string, removed: Array<{name, category, site}>, unwrapped: boolean, changed: boolean}}
   */
  function cleanUrl(input, compiled, opts) {
    const options = opts || {};
    const unwrap = options.unwrap !== undefined ? options.unwrap : compiled.settings.unwrapRedirects;
    let url = String(input || '').trim();
    let unwrapped = false;
    const removed = [];
    if (!compiled.settings.enabled && !options.force) {
      return { url, removed, unwrapped, changed: false };
    }
    for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth++) {
      const first = stripParams(url, compiled);
      removed.push(...first.removed);
      url = first.url;
      if (!unwrap) break;
      const next = unwrapOnce(url, compiled);
      if (!next) break;
      url = next;
      unwrapped = true;
    }
    return { url, removed, unwrapped, changed: unwrapped || removed.length > 0 };
  }

  function wildcardRegexFilter(bases) {
    return '^https?://([^/:?#]+\\.)?(' + bases.map(escapeRegex).join('|') + ')\\.' + TLD + '(:[0-9]+)?([/?#]|$)';
  }

  function redirectAction(params) {
    return { type: 'redirect', redirect: { transform: { queryTransform: { removeParams: params } } } };
  }

  /**
   * Turn the compiled rules into declarativeNetRequest dynamic rules.
   * Chrome applies only one redirect rule per request, so each site rule also
   * includes all global parameters and has a higher priority.
   */
  function buildDnrRules(compiled) {
    const rules = [];
    if (!compiled.settings.enabled) return rules;
    let id = 1;
    const globalParams = Array.from(compiled.global.keys());

    if (compiled.settings.allowlist.length) {
      rules.push({
        id: id++,
        priority: PRIORITY.allow,
        action: { type: 'allow' },
        condition: { requestDomains: compiled.settings.allowlist.slice(), resourceTypes: RESOURCE_TYPES.slice() }
      });
    }

    if (globalParams.length) {
      rules.push({
        id: id++,
        priority: PRIORITY.global,
        action: redirectAction(globalParams),
        condition: { resourceTypes: RESOURCE_TYPES.slice() }
      });
    }

    for (const site of compiled.sites) {
      if (!site.params.size) continue;
      const params = Array.from(new Set(globalParams.concat(Array.from(site.params.keys()))));
      const { exact, wild } = splitDomains(site.domains);
      if (exact.length) {
        rules.push({
          id: id++,
          priority: PRIORITY.site,
          action: redirectAction(params),
          condition: { requestDomains: exact, resourceTypes: RESOURCE_TYPES.slice() }
        });
      }
      if (wild.length) {
        rules.push({
          id: id++,
          priority: PRIORITY.site,
          action: redirectAction(params),
          condition: { regexFilter: wildcardRegexFilter(wild), isUrlFilterCaseSensitive: false, resourceTypes: RESOURCE_TYPES.slice() }
        });
      }
    }
    return rules;
  }

  /** Count of all known parameters per category (for the settings UI). */
  function catalog() {
    const out = {};
    for (const c of Rules.CATEGORIES) out[c.id] = { global: [], sites: [] };
    for (const [cat, names] of Object.entries(Rules.GLOBAL_PARAMS)) out[cat].global.push(...names);
    for (const site of Rules.SITES) {
      for (const [cat, names] of Object.entries(site.params)) out[cat].sites.push({ id: site.id, name: site.name, params: names.slice() });
    }
    for (const c of Object.keys(out)) {
      out[c].count = out[c].global.length + out[c].sites.reduce((n, s) => n + s.params.length, 0);
    }
    return out;
  }

  const api = {
    DEFAULT_SETTINGS,
    normalizeSettings,
    normalizeDomain,
    isValidParamName,
    hostOf,
    compile,
    cleanUrl,
    stripParams,
    unwrapOnce,
    buildDnrRules,
    catalog,
    Rules
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LinkwashEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
