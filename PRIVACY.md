# Linkwash privacy policy

_Last updated: 7 November 2026_

Linkwash doesn't collect, store or send any personal data.

- **No account.** You never sign in or register.
- **No servers.** Linkwash doesn't connect to any server. It has no analytics, telemetry or crash reporting, and it makes no network requests of its own.
- **Your browsing stays on your device.** To remove tracking parameters, Linkwash reads the web addresses you open. This happens only inside your browser, and the addresses are never sent anywhere.
- **What's stored, and where:**
  - Your settings (switched-on categories, paused sites, your own parameters, language and theme) are kept in Chrome's `storage.sync`. If you've turned on Chrome sync, Google syncs them between your own devices like any other Chrome setting.
  - The statistics (counts of removed parameters, and the domains they were removed on) are kept only on this device in `storage.local`.
  - The counter for open tabs is kept in memory and deleted when the tab or browser is closed.
- **Deleting your data:** use *Reset statistics* and *Restore defaults* in the settings, or remove the extension. Removing it deletes everything it stored.

## Why Linkwash needs its permissions

| Permission | Why |
| --- | --- |
| Access to all websites (`<all_urls>`) and `declarativeNetRequestWithHostAccess` | Remove tracking parameters from links on any site before the page loads |
| `webRequest` | Count the removed parameters for the counter and statistics. Linkwash only reads; it never blocks or changes requests through this API |
| `storage` | Save your settings and statistics |
| `contextMenus` | The *Copy clean link* and *Open clean link* menu items |
| `offscreen`, `clipboardWrite` | Copy a clean link to the clipboard from the menu or the keyboard shortcut |
| `favicon` | Show the site's icon in the popup and in the list of paused sites |

## Contact

Questions or problems: <https://github.com/malias55/trackblocker-chrome-extension/issues>
