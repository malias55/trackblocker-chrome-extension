'use strict';
// Starts Chromium with the unpacked extension and a local web server that
// answers for every hostname (amazon.de, google.com, … all point to it).
const http = require('node:http');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { chromium } = require('playwright');

const EXT = path.resolve(__dirname, '..', '..');

/** Self-signed certificate for the HTTPS server (HSTS-preloaded hosts such as amazon.de). */
function makeCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linkwash-cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=linkwash-test',
    '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], { stdio: 'ignore' });
  return { key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem')) };
}

function startServer() {
  const requests = [];
  const handler = (req, res) => {
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    requests.push({ host, url: req.url, method: req.method });
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }
    if (u.pathname === '/ping') {
      res.writeHead(204);
      return res.end();
    }
    let body = `<!doctype html><title>${host}${u.pathname}</title><h1 id="where">${host}${req.url}</h1>`;
    if (u.pathname === '/frame-host') {
      body += `<iframe src="${u.searchParams.get('src')}"></iframe>`;
    }
    if (u.pathname === '/links') {
      body += `<a id="link" href="${u.searchParams.get('href')}" ${u.searchParams.has('ping') ? 'ping="/ping"' : ''}>link</a>`;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  };
  const server = http.createServer(handler);
  const secure = https.createServer(makeCert(), handler);
  const listen = (s) => new Promise((resolve) => s.listen(0, '127.0.0.1', () => resolve(s.address().port)));
  return Promise.all([listen(server), listen(secure)]).then(([port, httpsPort]) => ({
    port,
    httpsPort,
    requests,
    close() {
      server.close();
      secure.close();
    }
  }));
}

async function launch(opts = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linkwash-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: opts.headless !== false,
    locale: opts.locale || 'en-US',
    colorScheme: opts.colorScheme || 'light',
    viewport: opts.viewport || { width: 1280, height: 800 },
    deviceScaleFactor: opts.deviceScaleFactor || 1,
    ignoreHTTPSErrors: true,
    // Chromium 137+ needs both of these to load an unpacked extension from the command line.
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--host-resolver-rules=MAP * 127.0.0.1',
      `--lang=${opts.locale || 'en-US'}`
    ]
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = worker.url().split('/')[2];
  // Wait until the dynamic rules are installed.
  for (let i = 0; i < 50; i++) {
    const n = await worker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length);
    if (n > 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  // Close the welcome tab opened on install.
  await new Promise((r) => setTimeout(r, 300));
  for (const p of context.pages()) if (p.url().includes('#welcome')) await p.close();

  async function setSettings(patch) {
    await worker.evaluate(async (p) => {
      const { settings } = await chrome.storage.sync.get('settings');
      const next = Object.assign({}, settings || {}, p);
      await chrome.storage.sync.set({ settings: next });
      await self.Linkwash.reload();
    }, patch);
  }

  async function resetSettings() {
    await worker.evaluate(async () => {
      await chrome.storage.sync.clear();
      // Tests check English strings, whatever the computer's language is.
      await chrome.storage.sync.set({ settings: { language: 'en' } });
      await self.Linkwash.reload();
    });
  }

  return { context, worker, extensionId, setSettings, resetSettings, userDataDir };
}

module.exports = { startServer, launch, EXT };
