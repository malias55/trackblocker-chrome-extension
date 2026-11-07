/* Helpers shared by the popup and the settings page. */
/* global LinkwashEngine, LinkwashI18n */
(function (root) {
  'use strict';
  const Engine = LinkwashEngine;
  const I18n = LinkwashI18n;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let themePref = 'auto';

  function applyTheme(pref) {
    themePref = pref || 'auto';
    const dark = themePref === 'dark' || (themePref === 'auto' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  media.addEventListener('change', () => applyTheme(themePref));

  async function getSettings() {
    const { settings } = await chrome.storage.sync.get('settings');
    return Engine.normalizeSettings(settings);
  }

  /** Merge `patch` into the stored settings. Returns the new settings. */
  async function saveSettings(patch) {
    const current = await getSettings();
    const next = Engine.normalizeSettings(Object.assign({}, current, patch, {
      categories: Object.assign({}, current.categories, patch.categories || {})
    }));
    await chrome.storage.sync.set({ settings: next });
    return next;
  }

  async function getStats() {
    const { stats } = await chrome.storage.local.get('stats');
    return Object.assign({ since: Date.now(), links: 0, params: 0, redirects: 0, byCategory: {}, byParam: {}, bySite: {} }, stats || {});
  }

  function formatNumber(n) {
    return new Intl.NumberFormat(I18n.locale(), { notation: n >= 100000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n || 0);
  }

  function formatDate(ts) {
    return new Intl.DateTimeFormat(I18n.locale(), { dateStyle: 'medium' }).format(new Date(ts));
  }

  /** Animate a number from its current value to `to`. */
  function countTo(el, to) {
    const from = Number(el.dataset.value || 0);
    el.dataset.value = String(to);
    if (from === to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = formatNumber(to);
      return;
    }
    const start = performance.now();
    const dur = Math.min(900, 300 + Math.abs(to - from) * 30);
    function frame(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatNumber(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  let toastTimer = null;
  function toast(message) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = root.LinkwashIcons.icon('check', 16);
    el.appendChild(document.createTextNode(message));
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children || [])) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function faviconUrl(pageUrl, size) {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', pageUrl);
    u.searchParams.set('size', String(size || 32));
    return u.toString();
  }

  root.LinkwashUI = { applyTheme, getSettings, saveSettings, getStats, formatNumber, formatDate, countTo, toast, el, faviconUrl };
})(globalThis);
