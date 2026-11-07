// Offscreen document: the service worker can't use the clipboard itself.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'copy') return false;
  const el = document.getElementById('buffer');
  el.value = String(msg.text || '');
  el.select();
  const ok = document.execCommand('copy');
  el.value = '';
  sendResponse({ ok });
  setTimeout(() => window.close(), 0);
  return false;
});
