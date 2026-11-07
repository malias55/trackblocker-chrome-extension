/*
 * Linkwash service worker.
 *
 * Chrome's declarativeNetRequest engine strips the parameters before the
 * request is sent, so cleaning works even while this worker is asleep. The
 * worker only:
 *   - keeps the dynamic rules in sync with the settings,
 *   - watches requests (read-only) to update the counter and statistics,
 *   - handles the context menu and the keyboard shortcut.
 */
/* global LinkwashEngine, LinkwashI18n */
importScripts('shared/rules.js', 'shared/engine.js', 'shared/i18n.js');

const Engine = LinkwashEngine;
const I18n = LinkwashI18n;

const TAB_KEY = (id) => 'tab:' + id;
const MAX_TAB_ITEMS = 100;
const MAX_STAT_KEYS = 150;
const LINK_HINT_TTL = 15000;
const BADGE_COLOR = '#0E7490';

let compiledPromise = null;
const tabCache = new Map();
/** Clean URLs the content script just produced -> what it removed. */
const linkHints = new Map();

/* ---------- Settings & rules ---------- */

function getCompiled() {
  if (!compiledPromise) {
    compiledPromise = chrome.storage.sync.get('settings').then(({ settings }) => Engine.compile(settings));
  }
  return compiledPromise;
}

// Rule updates run one after another, so quick setting changes can't race.
let applyQueue = Promise.resolve();
function applyRules() {
  const run = applyQueue.then(applyRulesNow, applyRulesNow);
  applyQueue = run.catch((e) => console.warn('Linkwash: could not update rules', e));
  return run;
}

async function applyRulesNow() {
  const compiled = await getCompiled();
  const rules = Engine.buildDnrRules(compiled);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: rules
  });
  await updateActionIcon(compiled.settings.enabled);
  return rules.length;
}

async function updateActionIcon(enabled) {
  const suffix = enabled ? '' : '-off';
  await chrome.action.setIcon({
    path: {
      16: '/icons/icon-16' + suffix + '.png',
      32: '/icons/icon-32' + suffix + '.png',
      48: '/icons/icon-48' + suffix + '.png'
    }
  });
}

async function setupContextMenus() {
  const { settings } = await chrome.storage.sync.get('settings');
  await I18n.init(Engine.normalizeSettings(settings).language);
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'copy-link', title: I18n.t('menuCopyCleanLink'), contexts: ['link'] });
  chrome.contextMenus.create({ id: 'open-link', title: I18n.t('menuOpenCleanLink'), contexts: ['link'] });
  chrome.contextMenus.create({ id: 'copy-page', title: I18n.t('menuCopyCleanPage'), contexts: ['page'] });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  await applyRules();
  await setupContextMenus();
  if (details.reason === 'install') {
    const { stats } = await chrome.storage.local.get('stats');
    if (!stats) await chrome.storage.local.set({ stats: emptyStats() });
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#welcome') });
  }
});

chrome.runtime.onStartup.addListener(() => {
  applyRules();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.settings) return;
  const before = Engine.normalizeSettings(changes.settings.oldValue);
  const after = Engine.normalizeSettings(changes.settings.newValue);
  compiledPromise = null;
  applyRules();
  if (before.language !== after.language) setupContextMenus();
  if (before.showBadge !== after.showBadge || before.enabled !== after.enabled) refreshAllBadges();
});

/* ---------- Statistics ---------- */

function emptyStats() {
  return { since: Date.now(), links: 0, params: 0, redirects: 0, byCategory: {}, byParam: {}, bySite: {} };
}

let pendingStats = null;
let statsTimer = null;

function bump(map, key, n) {
  map[key] = (map[key] || 0) + n;
}

function prune(map) {
  const keys = Object.keys(map);
  if (keys.length <= MAX_STAT_KEYS) return map;
  return Object.fromEntries(keys.sort((a, b) => map[b] - map[a]).slice(0, MAX_STAT_KEYS).map((k) => [k, map[k]]));
}

function recordStats(removed, host, redirect) {
  if (!pendingStats) pendingStats = { links: 0, params: 0, redirects: 0, byCategory: {}, byParam: {}, bySite: {} };
  if (removed.length || redirect) pendingStats.links += 1;
  if (redirect) pendingStats.redirects += 1;
  pendingStats.params += removed.length;
  for (const r of removed) {
    bump(pendingStats.byCategory, r.category, 1);
    bump(pendingStats.byParam, r.name, 1);
  }
  if (host && (removed.length || redirect)) bump(pendingStats.bySite, host.replace(/^www\./, ''), removed.length || 1);
  clearTimeout(statsTimer);
  statsTimer = setTimeout(flushStats, 400);
}

async function flushStats() {
  const delta = pendingStats;
  pendingStats = null;
  if (!delta) return;
  const { stats: stored } = await chrome.storage.local.get('stats');
  const stats = Object.assign(emptyStats(), stored || {});
  stats.links += delta.links;
  stats.params += delta.params;
  stats.redirects += delta.redirects;
  for (const k of ['byCategory', 'byParam', 'bySite']) {
    const target = Object.assign({}, stats[k]);
    for (const [key, n] of Object.entries(delta[k])) bump(target, key, n);
    stats[k] = prune(target);
  }
  await chrome.storage.local.set({ stats });
}

/* ---------- Per-tab state & badge ---------- */

async function getTab(tabId) {
  if (tabCache.has(tabId)) return tabCache.get(tabId);
  const key = TAB_KEY(tabId);
  const stored = (await chrome.storage.session.get(key))[key] || null;
  tabCache.set(tabId, stored);
  return stored;
}

async function setTab(tabId, state) {
  tabCache.set(tabId, state);
  await chrome.storage.session.set({ [TAB_KEY(tabId)]: state });
  await renderBadge(tabId, state);
}

async function renderBadge(tabId, state) {
  const compiled = await getCompiled();
  const show = compiled.settings.enabled && compiled.settings.showBadge;
  const n = state ? state.count : 0;
  const text = show && n > 0 ? (n > 999 ? '999+' : String(n)) : '';
  try {
    await chrome.action.setBadgeText({ tabId, text });
  } catch (_) {
    // The tab was closed in the meantime.
  }
}

async function refreshAllBadges() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) renderBadge(tab.id, await getTab(tab.id));
}

function toItems(removed, host) {
  const ts = Date.now();
  return removed.map((r) => ({ name: r.name, category: r.category, host, ts }));
}

function takeLinkHint(url) {
  const now = Date.now();
  for (const [k, v] of linkHints) if (now - v.ts > LINK_HINT_TTL) linkHints.delete(k);
  const hint = linkHints.get(url);
  if (hint) linkHints.delete(url);
  return hint || null;
}

async function onRequest(details) {
  if (details.tabId < 0 || details.documentLifecycle === 'prerender') return;
  const compiled = await getCompiled();
  if (!compiled.settings.enabled) return;
  const host = Engine.hostOf(details.url);
  const { removed } = Engine.stripParams(details.url, compiled);
  const previous = await getTab(details.tabId);

  if (details.type === 'main_frame') {
    if (removed.length) {
      recordStats(removed, host, false);
      await setTab(details.tabId, {
        requestId: details.requestId,
        host,
        items: toItems(removed, host),
        count: removed.length
      });
      return;
    }
    // Chrome sends the cleaned URL as a new request with the same ID.
    if (previous && previous.requestId === details.requestId) return;
    const hint = takeLinkHint(details.url);
    const items = hint ? toItems(hint.removed, host) : [];
    await setTab(details.tabId, { requestId: details.requestId, host, items, count: items.length, redirect: !!(hint && hint.redirect) });
    return;
  }

  // Sub-frames add to the counter of the page they are on.
  if (!removed.length) return;
  recordStats(removed, host, false);
  const state = previous || { requestId: null, host: '', items: [], count: 0 };
  const items = state.items.concat(toItems(removed, host)).slice(-MAX_TAB_ITEMS);
  await setTab(details.tabId, Object.assign({}, state, { items, count: state.count + removed.length }));
}

// Events of one tab are handled in order. Otherwise the cleaned follow-up
// request could overwrite the counter of the original one.
const tabQueues = new Map();

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const prev = tabQueues.get(details.tabId) || Promise.resolve();
    const next = prev.then(() => onRequest(details)).catch((e) => console.warn('Linkwash:', e));
    tabQueues.set(details.tabId, next);
    next.then(() => {
      if (tabQueues.get(details.tabId) === next) tabQueues.delete(details.tabId);
    });
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame', 'sub_frame'] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCache.delete(tabId);
  chrome.storage.session.remove(TAB_KEY(tabId));
});

/* ---------- Messages from content script & pages ---------- */

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.type === 'link-cleaned' && sender.tab && typeof msg.url === 'string' && Array.isArray(msg.removed)) {
    const removed = msg.removed
      .filter((r) => r && typeof r.name === 'string' && typeof r.category === 'string')
      .slice(0, 50);
    linkHints.set(msg.url, { removed, redirect: !!msg.redirect, ts: Date.now() });
    recordStats(removed, Engine.hostOf(msg.url), !!msg.redirect);
    return false;
  }
  return false;
});

/* ---------- Clipboard (context menu & shortcut) ---------- */

async function copyText(text) {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (!existing.length) {
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Copy the cleaned link to the clipboard.'
    });
  }
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'copy', text });
}

async function cleanForCopy(url) {
  const compiled = await getCompiled();
  return Engine.cleanUrl(url, compiled, { force: true, unwrap: true });
}

async function flashBadge(tabId) {
  try {
    await chrome.action.setBadgeText({ tabId, text: '✓' });
    setTimeout(async () => renderBadge(tabId, await getTab(tabId)), 1500);
  } catch (_) {
    // Ignore closed tabs.
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const source = info.menuItemId === 'copy-page' ? info.pageUrl : info.linkUrl;
  if (!source) return;
  const result = await cleanForCopy(source);
  if (info.menuItemId === 'open-link') {
    chrome.tabs.create({ url: result.url, index: tab ? tab.index + 1 : undefined, openerTabId: tab ? tab.id : undefined });
    return;
  }
  await copyText(result.url);
  if (tab) flashBadge(tab.id);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'copy-clean-url') return;
  const active = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!active || !/^https?:/.test(active.url || '')) return;
  const result = await cleanForCopy(active.url);
  await copyText(result.url);
  flashBadge(active.id);
});

// Used by the end-to-end tests and handy in the service worker console.
self.Linkwash = {
  reload() {
    compiledPromise = null;
    return applyRules();
  },
  getCompiled,
  flushStats
};
