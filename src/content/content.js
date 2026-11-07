/*
 * Linkwash content script.
 *
 * Cleans a link just before you use it (click, middle-click, right-click,
 * Enter). Then "Copy link address" copies the clean URL, and redirect
 * wrappers (google.com/url?q=…, l.facebook.com/l.php?u=…) go straight to the
 * destination. Network-level cleaning happens in declarativeNetRequest.
 */
/* global LinkwashEngine */
(function () {
  'use strict';
  if (window.__linkwashLoaded) return;
  window.__linkwashLoaded = true;

  const Engine = LinkwashEngine;
  let compiled = null;

  function load() {
    chrome.storage.sync.get('settings', ({ settings }) => {
      compiled = Engine.compile(settings);
    });
  }
  load();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) compiled = Engine.compile(changes.settings.newValue);
  });

  function findAnchor(event) {
    const path = event.composedPath ? event.composedPath() : [event.target];
    for (const node of path) {
      if (node && node.nodeType === 1 && (node.localName === 'a' || node.localName === 'area') && node.href) return node;
    }
    return null;
  }

  function handle(event) {
    if (!compiled || !compiled.settings.enabled) return;
    if (compiled.isAllowlisted(location.hostname.toLowerCase())) return;
    const a = findAnchor(event);
    if (!a) return;

    if (compiled.settings.blockPings && a.hasAttribute('ping')) a.removeAttribute('ping');

    const href = typeof a.href === 'string' ? a.href : a.href && a.href.baseVal;
    if (!href || !/^https?:/i.test(href)) return;
    const result = Engine.cleanUrl(href, compiled);
    if (!result.changed || result.url === href) return;
    if (typeof a.href === 'string') a.href = result.url;
    else a.setAttribute('href', result.url);
    try {
      chrome.runtime.sendMessage({ type: 'link-cleaned', url: result.url, removed: result.removed, redirect: result.unwrapped });
    } catch (_) {
      // The extension was updated or reloaded; the page still works.
    }
  }

  for (const type of ['mousedown', 'auxclick', 'click', 'contextmenu', 'touchstart']) {
    window.addEventListener(type, handle, { capture: true, passive: true });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handle(e);
  }, { capture: true, passive: true });
})();
