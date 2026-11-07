/*
 * Translations. Uses Chrome's _locales files but lets the user choose a
 * language other than the browser's in Settings.
 */
(function (root) {
  'use strict';

  const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'de', name: 'Deutsch' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt_BR', name: 'Português (Brasil)' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'pl', name: 'Polski' },
    { code: 'ru', name: 'Русский' },
    { code: 'uk', name: 'Українська' },
    { code: 'ar', name: 'العربية', rtl: true },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
    { code: 'zh_CN', name: '简体中文' },
    { code: 'id', name: 'Bahasa Indonesia' }
  ];
  const CODES = LANGUAGES.map((l) => l.code);

  let current = 'en';
  let dict = {};
  let fallback = {};

  /** Map a browser locale such as "de-AT" or "pt-BR" to a supported code. */
  function resolve(locale) {
    if (!locale) return 'en';
    const norm = String(locale).replace('-', '_');
    if (CODES.includes(norm)) return norm;
    const base = norm.split('_')[0].toLowerCase();
    if (base === 'pt') return 'pt_BR';
    if (base === 'zh') return 'zh_CN';
    return CODES.includes(base) ? base : 'en';
  }

  async function fetchMessages(code) {
    try {
      const res = await fetch(chrome.runtime.getURL('_locales/' + code + '/messages.json'));
      return res.ok ? await res.json() : {};
    } catch (_) {
      return {};
    }
  }

  async function init(preference) {
    current = !preference || preference === 'auto' ? resolve(chrome.i18n.getUILanguage()) : resolve(preference);
    const [d, f] = await Promise.all([fetchMessages(current), current === 'en' ? null : fetchMessages('en')]);
    dict = d;
    fallback = f || d;
    return current;
  }

  /** t('paramsCount', [12]) -> "12 parameters" */
  function t(key, subs) {
    const entry = dict[key] || fallback[key];
    if (!entry) return key;
    const list = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
    return entry.message
      .replace(/\$(\d)/g, (m, n) => (list[n - 1] !== undefined ? String(list[n - 1]) : m))
      .replace(/\$\$/g, '$');
  }

  function isRtl() {
    const l = LANGUAGES.find((x) => x.code === current);
    return !!(l && l.rtl);
  }

  /** BCP 47 tag for Intl formatting and the html lang attribute. */
  function locale() {
    return current.replace('_', '-');
  }

  /** Translate all [data-i18n*] attributes below `scope`. */
  function apply(scope) {
    const rootEl = scope || document;
    rootEl.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    for (const attr of ['title', 'placeholder', 'aria-label']) {
      const dataKey = 'i18n' + attr.replace(/(^|-)([a-z])/g, (m, d, c) => c.toUpperCase());
      rootEl.querySelectorAll('[data-i18n-' + attr + ']').forEach((el) => {
        el.setAttribute(attr, t(el.dataset[dataKey]));
      });
    }
    if (!scope) {
      document.documentElement.lang = locale();
      document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
    }
  }

  const api = { LANGUAGES, resolve, init, t, apply, locale, isRtl, get current() { return current; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LinkwashI18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
