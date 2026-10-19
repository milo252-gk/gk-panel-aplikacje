/* Worker strony przekierowania szkolenia/ (D78) — wygenerowany przez hub (dostep.py → sw_przekierowania). */
const WERSJA = "szkolenia-przekierowanie-1";
const ZASOBY = ['./', './index.html', '../wspolne/hala.css'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(WERSJA).then(c => Promise.allSettled(ZASOBY.map(a => c.add(new Request(a, { cache: 'no-cache' })))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith("szkolenia-przekierowanie-") && x !== WERSJA)
    .map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const adres = new URL(e.request.url);
  if (e.request.method !== 'GET' || adres.origin !== self.location.origin) return;
  if (adres.pathname.endsWith('/konfiguracja.json')) return;        // adres tunelu — zawsze świeży, nigdy z kopii
  e.respondWith(fetch(e.request, { cache: 'no-cache' })
    .then(o => { if (o && o.ok) { const k = o.clone(); caches.open(WERSJA).then(c => c.put(e.request, k)); } return o; })
    .catch(() => caches.open(WERSJA).then(c => c.match(e.request))
      .then(k => k || (e.request.mode === 'navigate' ? caches.match('./index.html') : Promise.reject(new Error('brak kopii'))))));
});
