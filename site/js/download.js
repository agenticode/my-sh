// Fills the download page from /release.json and shows the install script /get.
//
// The page names what to fill: data-r="version|date|commit|notes|sums|script",
// data-href="...{version}..." for links into the tagged source, and one
// <li data-platform="os/arch"> per archive with data-f="file|size|sha256" inside.
// <main data-release> gets data-state="ready" or "failed"; site.css shows the
// parts of each state. tools/release.mjs writes release.json, so a new release
// changes only that file.
(() => {
  'use strict';

  const main = document.querySelector('[data-release]');
  if (!main) return;
  const ko = document.documentElement.lang === 'ko';
  const all = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const https = (u) => typeof u === 'string' && u.startsWith('https://');
  const size = (n) => `${(n / 1e6).toFixed(1)} MB`;
  const bytes = (n) => `${n.toLocaleString(ko ? 'ko-KR' : 'en-US')} ${ko ? '바이트' : 'bytes'}`;

  function fill(rel) {
    const v = rel && rel.version;
    if (typeof v !== 'string' || !/^v\d+\.\d+\.\d+[0-9A-Za-z.+-]*$/.test(v) || !Array.isArray(rel.archives)) {
      throw new Error('release.json: no version or no archives');
    }
    for (const el of all('[data-r="version"]')) el.textContent = v;
    for (const el of all('[data-r="date"]')) {
      el.textContent = String(rel.date);
      el.setAttribute('datetime', String(rel.date));
    }
    for (const el of all('[data-r="commit"]')) el.textContent = String(rel.commit || '').slice(0, 12);
    if (https(rel.notes)) for (const el of all('a[data-r="notes"]')) el.href = rel.notes;
    if (rel.sums && https(rel.sums.url)) for (const el of all('a[data-r="sums"]')) el.href = rel.sums.url;
    for (const el of all('a[data-href]')) el.href = el.dataset.href.split('{version}').join(v);

    const items = all('[data-platform]');
    for (const a of rel.archives) {
      const key = `${a.os}/${a.arch}`;
      let li = items.find((x) => x.dataset.platform === key);
      if (!li && items.length) {
        // A platform the page does not describe yet: a copy of the first item, named os/arch.
        li = items[0].cloneNode(true);
        li.dataset.platform = key;
        li.querySelector('h3').textContent = key;
        for (const n of all('.note', li)) n.remove();
        items[items.length - 1].after(li);
        items.push(li);
      }
      if (!li || !https(a.url)) continue;
      const link = li.querySelector('[data-f="file"]');
      link.href = a.url;
      link.textContent = a.file;
      const s = li.querySelector('[data-f="size"]');
      s.textContent = size(a.size);
      s.title = bytes(a.size);
      li.querySelector('[data-f="sha256"]').textContent = a.sha256;
      li.dataset.filled = '';
    }
    for (const li of items) if (!('filled' in li.dataset)) li.hidden = true;
    main.dataset.state = 'ready';
  }

  fetch('/release.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`/release.json: HTTP ${r.status}`))))
    .then(fill)
    .catch((e) => {
      main.dataset.state = 'failed';
      console.error(e);
    });

  const box = document.querySelector('[data-r="script"]');
  if (box) {
    fetch('/get', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`/get: HTTP ${r.status}`))))
      .then((text) => {
        box.textContent = text;
        box.closest('pre').hidden = false;
      })
      .catch((e) => console.error(e));
  }
})();
