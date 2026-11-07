/* global LinkwashEngine, LinkwashI18n, LinkwashIcons, LinkwashUI */
(async function () {
  'use strict';
  const Engine = LinkwashEngine;
  const Rules = Engine.Rules;
  const I18n = LinkwashI18n;
  const Icons = LinkwashIcons;
  const UI = LinkwashUI;
  const t = I18n.t;
  const el = UI.el;
  const $ = (id) => document.getElementById(id);

  let settings = await UI.getSettings();
  UI.applyTheme(settings.theme);
  await I18n.init(settings.language);
  I18n.apply();
  Icons.hydrate();

  const catalog = Engine.catalog();
  const catIcon = Object.fromEntries(Rules.CATEGORIES.map((c) => [c.id, c.icon]));
  const save = async (patch) => {
    settings = await UI.saveSettings(patch);
    return settings;
  };

  /* ---------- Navigation ---------- */

  const navLinks = Array.from(document.querySelectorAll('.nav a'));
  const sections = navLinks.map((a) => $(a.dataset.section));
  function setActive(id) {
    for (const a of navLinks) a.classList.toggle('active', a.dataset.section === id);
  }
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) setActive(visible[0].target.id);
  }, { rootMargin: '-10% 0px -70% 0px' });
  sections.forEach((s) => observer.observe(s));
  setActive('overview');

  /* ---------- Welcome ---------- */

  if (location.hash === '#welcome') {
    $('welcome').hidden = false;
    $('welcomeDismiss').addEventListener('click', () => {
      $('welcome').hidden = true;
      history.replaceState(null, '', location.pathname);
    });
  }

  /* ---------- Overview ---------- */

  function renderMaster() {
    $('master').checked = settings.enabled;
    const pill = $('masterStatus');
    pill.className = 'pill' + (settings.enabled ? '' : ' off');
    pill.textContent = t(settings.enabled ? 'statusProtected' : 'statusPaused');
  }
  $('master').addEventListener('change', async (e) => {
    await save({ enabled: e.target.checked });
    renderMaster();
  });

  function topEntries(map, n) {
    return Object.entries(map || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  /** Which category a parameter name usually belongs to (for bar colours). */
  const paramCategory = new Map();
  for (const [cat, info] of Object.entries(catalog)) {
    for (const p of info.global) paramCategory.set(p, cat);
    for (const s of info.sites) for (const p of s.params) if (!paramCategory.has(p)) paramCategory.set(p, cat);
  }

  function renderBars(listEl, entries, kind) {
    listEl.textContent = '';
    if (!entries.length) {
      listEl.appendChild(el('li', { class: 'empty', text: t('emptyStats') }));
      return;
    }
    const max = entries[0][1];
    for (const [name, n] of entries) {
      const cat = kind === 'param' ? paramCategory.get(name) || 'custom' : null;
      listEl.appendChild(el('li', {}, [
        el('span', { class: 'name' + (kind === 'site' ? ' site' : ''), text: name, title: name }),
        el('span', { class: 'val', text: UI.formatNumber(n) }),
        el('div', { class: 'bar' }, [el('span', { style: 'width:' + Math.max(4, (n / max) * 100) + '%', dataset: cat ? { cat } : {} })])
      ]));
    }
  }

  async function renderStats() {
    const stats = await UI.getStats();
    $('overviewSince').textContent = t('overviewSubtitle', UI.formatDate(stats.since));
    UI.countTo($('kpiParams'), stats.params);
    UI.countTo($('kpiLinks'), stats.links);
    UI.countTo($('kpiRedirects'), stats.redirects);
    renderBars($('topParams'), topEntries(stats.byParam, 6), 'param');
    renderBars($('topSites'), topEntries(stats.bySite, 6), 'site');

    const stack = $('catStack');
    const legend = $('catLegend');
    stack.textContent = '';
    legend.textContent = '';
    const cats = Object.entries(stats.byCategory || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const total = cats.reduce((s, [, n]) => s + n, 0);
    if (!total) {
      legend.appendChild(el('span', { class: 'empty', text: t('emptyStats') }));
      legend.firstChild.style.setProperty('--c', 'transparent');
      return;
    }
    for (const [cat, n] of cats) {
      stack.appendChild(el('span', { dataset: { cat }, style: 'flex:' + n, title: t('cat_' + cat + '_name') + ': ' + n }));
      legend.appendChild(el('span', { dataset: { cat } }, [t('cat_' + cat + '_name') + ' ', el('b', { text: Math.round((n / total) * 100) + '%' })]));
    }
  }

  $('resetStats').addEventListener('click', async () => {
    if (!confirm(t('resetStatsConfirm'))) return;
    await chrome.storage.local.set({ stats: { since: Date.now(), links: 0, params: 0, redirects: 0, byCategory: {}, byParam: {}, bySite: {} } });
  });

  /* ---------- Protection ---------- */

  function renderCats() {
    const box = $('cats');
    box.textContent = '';
    for (const c of Rules.CATEGORIES) {
      const info = catalog[c.id];
      const on = settings.categories[c.id];
      const toggle = el('input', { type: 'checkbox', 'aria-label': t('cat_' + c.id + '_name') });
      toggle.checked = on;
      toggle.addEventListener('change', async () => {
        await save({ categories: { [c.id]: toggle.checked } });
        card.classList.toggle('on', toggle.checked);
      });

      const paramsBox = el('div', { class: 'cat-params', hidden: true });
      const more = el('button', { class: 'cat-more', type: 'button', 'aria-expanded': 'false', html: Icons.icon('chevron') }, [el('span', { text: t('showParams') })]);
      more.addEventListener('click', () => {
        const open = paramsBox.hidden;
        if (open && !paramsBox.childElementCount) fillParams(paramsBox, c.id, info);
        paramsBox.hidden = !open;
        more.setAttribute('aria-expanded', String(open));
        more.querySelector('span').textContent = t(open ? 'hideParams' : 'showParams');
      });

      const card = el('article', { class: 'card cat' + (on ? ' on' : ''), dataset: { cat: c.id } }, [
        el('div', { class: 'cat-head' }, [
          el('div', { class: 'cat-icon', html: Icons.icon(catIcon[c.id], 20) }),
          el('div', { class: 'cat-title' }, [
            el('div', { class: 'cat-name', text: t('cat_' + c.id + '_name') }),
            el('div', { class: 'cat-count', text: t('paramsCount', info.count) })
          ]),
          el('label', { class: 'switch' }, [toggle, el('span', { class: 'track' })])
        ]),
        el('p', { class: 'cat-desc', text: t('cat_' + c.id + '_desc') }),
        more,
        paramsBox
      ]);
      box.appendChild(card);
    }
  }

  function fillParams(box, catId, info) {
    const group = (title, names) => el('div', {}, [
      el('div', { class: 'cat-group-name', text: title }),
      el('div', { class: 'chip-list' }, names.map((n) => el('span', { class: 'chip', dataset: { cat: catId } }, [el('span', { class: 'chip-text', text: n })])))
    ]);
    if (info.global.length) box.appendChild(group(t('globalParams'), info.global));
    for (const s of info.sites) box.appendChild(group(s.name, s.params));
  }

  for (const key of ['unwrapRedirects', 'blockPings', 'showBadge']) {
    const input = $(key);
    input.checked = settings[key];
    input.addEventListener('change', () => save({ [key]: input.checked }));
  }

  /* ---------- Paused sites ---------- */

  function renderSites() {
    const list = $('siteList');
    list.textContent = '';
    const next = list.nextElementSibling;
    if (next && next.classList.contains('empty')) next.remove();
    if (!settings.allowlist.length) {
      list.after(el('p', { class: 'empty', text: t('sitesEmpty') }));
      return;
    }
    for (const domain of settings.allowlist) {
      const remove = el('button', { class: 'btn sm ghost icon-only', type: 'button', title: t('remove'), 'aria-label': t('remove') + ' ' + domain, html: Icons.icon('x', 16) });
      remove.addEventListener('click', () => save({ allowlist: settings.allowlist.filter((d) => d !== domain) }).then(renderSites));
      list.appendChild(el('li', {}, [
        el('img', { src: UI.faviconUrl('https://' + domain, 32), alt: '' }),
        el('span', { class: 'host', text: domain }),
        remove
      ]));
    }
  }

  $('siteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('siteInput');
    const domain = Engine.normalizeDomain(input.value);
    if (!domain) {
      input.classList.add('invalid');
      $('siteError').textContent = t('sitesInvalid');
      return;
    }
    input.classList.remove('invalid');
    $('siteError').textContent = '';
    input.value = '';
    if (!settings.allowlist.includes(domain)) await save({ allowlist: settings.allowlist.concat(domain) });
    renderSites();
  });
  $('siteInput').addEventListener('input', () => {
    $('siteInput').classList.remove('invalid');
    $('siteError').textContent = '';
  });

  /* ---------- Own parameters ---------- */

  function renderParams() {
    const list = $('paramList');
    list.textContent = '';
    if (!settings.customParams.length) {
      list.appendChild(el('p', { class: 'empty', text: t('customEmpty') }));
      return;
    }
    for (const p of settings.customParams) {
      const remove = el('button', { type: 'button', title: t('remove'), 'aria-label': t('remove') + ' ' + p, html: Icons.icon('x', 12) });
      remove.addEventListener('click', () => save({ customParams: settings.customParams.filter((x) => x !== p) }).then(renderParams));
      list.appendChild(el('span', { class: 'chip', dataset: { cat: 'custom' } }, [el('span', { class: 'chip-text', text: p }), remove]));
    }
  }

  $('paramForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('paramInput');
    const names = input.value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const error = (msg) => {
      input.classList.add('invalid');
      $('paramError').textContent = msg;
    };
    if (!names.length) return;
    const invalid = names.find((n) => !Engine.isValidParamName(n));
    if (invalid) return error(t('customInvalid'));
    const fresh = names.filter((n) => !settings.customParams.includes(n));
    if (!fresh.length) return error(t('customExists'));
    input.classList.remove('invalid');
    $('paramError').textContent = '';
    input.value = '';
    await save({ customParams: settings.customParams.concat(fresh) });
    renderParams();
  });
  $('paramInput').addEventListener('input', () => {
    $('paramInput').classList.remove('invalid');
    $('paramError').textContent = '';
  });

  /* ---------- Link cleaner ---------- */

  function runTool() {
    const value = $('toolInput').value.trim();
    const out = $('toolOut');
    const msg = $('toolMsg');
    out.hidden = true;
    msg.hidden = true;
    msg.className = 'tool-msg';
    if (!value) return;
    let parsed = null;
    try {
      parsed = new URL(value);
    } catch (_) {
      // handled below
    }
    if (!parsed || !/^https?:$/.test(parsed.protocol)) {
      msg.hidden = false;
      msg.classList.add('err');
      msg.textContent = t('toolsInvalid');
      return;
    }
    const result = Engine.cleanUrl(value, Engine.compile(settings), { force: true, unwrap: true });
    if (!result.changed) {
      msg.hidden = false;
      msg.classList.add('ok');
      msg.textContent = t('toolsNone');
      return;
    }
    out.hidden = false;
    $('toolUrl').textContent = result.url;
    const badge = $('toolBadge');
    badge.hidden = !result.unwrapped;
    badge.textContent = t('toolsUnwrapped');
    const removedBox = $('toolRemoved');
    removedBox.textContent = '';
    $('toolRemovedLabel').hidden = !result.removed.length;
    for (const r of result.removed) {
      removedBox.appendChild(el('span', { class: 'chip', dataset: { cat: r.category }, title: t('cat_' + r.category + '_name') }, [el('span', { class: 'chip-text', text: r.name })]));
    }
  }
  $('toolInput').addEventListener('input', runTool);
  $('toolCopy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('toolUrl').textContent);
    UI.toast(t('toastCopied'));
  });

  async function renderShortcut() {
    const cmds = await chrome.commands.getAll();
    const cmd = cmds.find((c) => c.name === 'copy-clean-url');
    const desc = $('shortcutDesc');
    desc.textContent = '';
    if (cmd && cmd.shortcut) {
      const [before, after] = t('shortcutDesc', '\u0000').split('\u0000');
      desc.append(before, el('kbd', { text: cmd.shortcut }), after || '');
    } else {
      desc.textContent = t('shortcutNone');
    }
  }
  $('shortcutBtn').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

  /* ---------- General ---------- */

  const langSelect = $('language');
  langSelect.appendChild(el('option', { value: 'auto', text: t('languageAuto') }));
  for (const l of I18n.LANGUAGES) langSelect.appendChild(el('option', { value: l.code, text: l.name, lang: l.code.replace('_', '-') }));
  langSelect.value = settings.language;
  langSelect.addEventListener('change', async () => {
    await save({ language: langSelect.value });
    location.reload();
  });

  function renderTheme() {
    for (const b of $('theme').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.value === settings.theme));
  }
  $('theme').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    await save({ theme: b.dataset.value });
    UI.applyTheme(settings.theme);
    renderTheme();
  });

  $('exportBtn').addEventListener('click', () => {
    const data = JSON.stringify({ app: 'linkwash', version: 1, exported: new Date().toISOString(), settings }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = el('a', { href: url, download: 'linkwash-settings.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== 'linkwash' || typeof data.settings !== 'object') throw new Error('invalid');
      settings = Engine.normalizeSettings(data.settings);
      await chrome.storage.sync.set({ settings });
      UI.toast(t('backupImported'));
      setTimeout(() => location.reload(), 700);
    } catch (_) {
      alert(t('backupInvalid'));
    }
  });

  $('resetSettings').addEventListener('click', async () => {
    if (!confirm(t('resetSettingsConfirm'))) return;
    await chrome.storage.sync.set({ settings: Engine.normalizeSettings({}) });
    location.reload();
  });

  /* ---------- About ---------- */

  const manifest = chrome.runtime.getManifest();
  $('aboutVersion').textContent = t('aboutVersion', manifest.version);
  const totalParams = Object.values(catalog).reduce((n, c) => n + c.count, 0);
  $('aboutRules').textContent = t('aboutRules', [UI.formatNumber(totalParams), Rules.SITES.length]);

  /* ---------- Live updates ---------- */

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.stats) renderStats();
    if (area === 'sync' && changes.settings) {
      settings = Engine.normalizeSettings(changes.settings.newValue);
      renderMaster();
    }
  });

  renderMaster();
  renderCats();
  renderSites();
  renderParams();
  renderTheme();
  renderShortcut();
  await renderStats();
  if (location.hash && location.hash !== '#welcome') {
    const target = document.querySelector(location.hash);
    if (target) target.scrollIntoView();
  }
  document.body.classList.remove('loading');
})();
