/* global LinkwashEngine, LinkwashI18n, LinkwashIcons, LinkwashUI */
(async function () {
  'use strict';
  const Engine = LinkwashEngine;
  const I18n = LinkwashI18n;
  const UI = LinkwashUI;
  const t = I18n.t;
  const $ = (id) => document.getElementById(id);
  const MAX_CHIPS = 12;

  let settings = await UI.getSettings();
  UI.applyTheme(settings.theme);
  await I18n.init(settings.language);
  I18n.apply();
  LinkwashIcons.hydrate();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageUrl = tab && tab.url && /^https?:/i.test(tab.url) ? tab.url : null;
  const host = pageUrl ? Engine.hostOf(pageUrl) : null;
  const tabKey = tab ? 'tab:' + tab.id : null;
  let tabState = tabKey ? (await chrome.storage.session.get(tabKey))[tabKey] : null;
  let shownChipKeys = new Set();

  function render() {
    const compiled = Engine.compile(settings);
    const paused = !settings.enabled;
    const sitePaused = !!host && compiled.isAllowlisted(host);
    const count = tabState && !paused && !sitePaused ? tabState.count : 0;

    $('master').checked = settings.enabled;
    const status = $('status');
    status.className = 'pill' + (paused ? ' off' : sitePaused ? ' paused' : '');
    status.textContent = t(paused ? 'statusPaused' : sitePaused ? 'statusSitePaused' : 'statusProtected');

    $('hero').classList.toggle('paused', paused || sitePaused || !pageUrl);
    UI.countTo($('tabCount'), count);
    $('heroLabel').textContent = !pageUrl ? t('heroUnavailable')
      : paused ? t('heroPaused')
      : sitePaused ? t('statusSitePaused')
      : count === 0 ? t('heroNothingYet')
      : t('heroRemovedOnPage');
    renderChips(paused || sitePaused ? [] : (tabState && tabState.items) || []);

    // Site row
    const siteToggle = $('siteToggle');
    const sub = $('siteSub');
    sub.classList.remove('warn');
    if (pageUrl) {
      $('siteHost').textContent = host.replace(/^www\./, '');
      $('favicon').src = UI.faviconUrl(pageUrl, 32);
      const site = compiled.siteFor(host);
      if (sitePaused) {
        sub.textContent = t('siteIsPaused');
        sub.classList.add('warn');
      } else {
        sub.textContent = site ? t('siteRulesFor', site.name) : t('siteGeneralRules');
      }
      siteToggle.checked = !sitePaused;
      siteToggle.disabled = paused;
    } else {
      $('siteHost').textContent = t('siteUnavailable');
      $('favicon').src = UI.faviconUrl('chrome://newtab', 32);
      sub.textContent = '';
      siteToggle.checked = false;
      siteToggle.disabled = true;
    }
    $('copy').disabled = !pageUrl;
  }

  function renderChips(items) {
    const box = $('chips');
    const counts = new Map();
    for (const it of items) {
      const prev = counts.get(it.name);
      counts.set(it.name, { name: it.name, category: it.category, n: prev ? prev.n + 1 : 1 });
    }
    const list = Array.from(counts.values()).sort((a, b) => b.n - a.n);
    box.textContent = '';
    const next = new Set();
    for (const c of list.slice(0, MAX_CHIPS)) {
      next.add(c.name);
      const chip = UI.el('span', { class: 'chip' + (shownChipKeys.has(c.name) ? '' : ' chip-enter'), dataset: { cat: c.category }, title: t('cat_' + c.category + '_name') }, [
        UI.el('span', { class: 'chip-text', text: c.name }),
        c.n > 1 ? UI.el('span', { class: 'count', text: '×' + c.n }) : null
      ]);
      box.appendChild(chip);
    }
    if (list.length > MAX_CHIPS) {
      box.appendChild(UI.el('span', { class: 'chip more', text: t('moreCount', list.length - MAX_CHIPS) }));
    }
    shownChipKeys = next;
  }

  async function renderStats() {
    const stats = await UI.getStats();
    UI.countTo($('statLinks'), stats.links);
    UI.countTo($('statParams'), stats.params);
    UI.countTo($('statRedirects'), stats.redirects);
  }

  /* ---------- Events ---------- */

  $('master').addEventListener('change', async (e) => {
    settings = await UI.saveSettings({ enabled: e.target.checked });
    render();
  });

  $('siteToggle').addEventListener('change', async (e) => {
    if (!host) return;
    const domain = Engine.normalizeDomain(host);
    let allowlist = settings.allowlist.slice();
    if (e.target.checked) {
      // Remove every entry that covers this host (example.com covers shop.example.com).
      allowlist = allowlist.filter((d) => !(domain === d || domain.endsWith('.' + d)));
    } else if (!allowlist.includes(domain)) {
      allowlist.push(domain);
    }
    settings = await UI.saveSettings({ allowlist });
    render();
    // Reload so the page loads with the new setting.
    chrome.tabs.reload(tab.id);
  });

  $('copy').addEventListener('click', async () => {
    if (!pageUrl) return;
    const result = Engine.cleanUrl(pageUrl, Engine.compile(settings), { force: true, unwrap: true });
    const btn = $('copy');
    try {
      await navigator.clipboard.writeText(result.url);
    } catch (_) {
      return;
    }
    btn.classList.add('success');
    btn.querySelector('span').textContent = t('actionCopied');
    btn.querySelector('.icon').outerHTML = LinkwashIcons.icon('check');
    setTimeout(() => {
      btn.classList.remove('success');
      btn.querySelector('span').textContent = t('actionCopyClean');
      btn.querySelector('.icon').outerHTML = LinkwashIcons.icon('copy');
    }, 1600);
  });

  $('settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && tabKey && changes[tabKey]) {
      tabState = changes[tabKey].newValue || null;
      render();
    } else if (area === 'local' && changes.stats) {
      renderStats();
    } else if (area === 'sync' && changes.settings) {
      settings = Engine.normalizeSettings(changes.settings.newValue);
      render();
    }
  });

  render();
  await renderStats();
  document.body.classList.remove('loading');
})();
