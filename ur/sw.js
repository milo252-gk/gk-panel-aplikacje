/* Service worker Aplikacji UR — dzięki niemu aplikacja otwiera się na hali bez
   zasięgu. Danych tu nie trzymamy: kolejka, stan, brudnopisy i zdjęcia leżą
   w IndexedDB, którą prowadzi hala.js. Wzór: kj/web/sw.js, panel/web/sw.js i GK Flota (KONTRAKT §9).

   WERSJA to stempel treści plików. Liczy go i sprawdza ur/testy/testuj.py:
   po zmianie dowolnego pliku z listy uruchom `python3 ur/testy/testuj.py --stempel`.
   Bez nowego stempla przeglądarka nie zainstaluje nowego workera, a telefon
   bez sieci wstałby ze starą wersją.

   TA LISTA MUSI WYMIENIAĆ KAŻDY PLIK Z web/ (pilnuje tego test). Pominięty plik
   działa przy sieci, a bez niej aplikacja nie wstaje wcale.                    */

const WERSJA = 'ur-4c0ca8221fb2';

// Powiadomienia przy zamkniętej aplikacji (D28) — wspólne dla Lidera, UR i KJ.
importScripts('../wspolne/hala-push-sw.js');

const ZASOBY = [
  './', './index.html', './ur.css', './ur.js', './widok.js',
  './awarie.js', './przeglady.js', './kpi.js', './plan.js',
  './manifest.webmanifest', './ikona.svg', './ikona-192.png', './ikona-512.png', './ikona-maskable-512.png', './apple-touch-icon.png',
  '../wspolne/hala.js', '../wspolne/motyw.js', '../wspolne/aktualizacja.js', '../wspolne/konto.js', '../wspolne/eksport.js', '../wspolne/hala-push-sw.js', '../wspolne/zlecenia.js', '../wspolne/hala.css', '../wspolne/logo-gkf.png', '../wspolne/skaner.js',
  '../wspolne/skaner-zxing.js',          // zapasowy dekoder (iPhone) — bez sieci też musi czytać kody
];

/* Plik po pliku (allSettled), nie addAll: jedno mrugnięcie wifi przy addAll
   unieważnia całą instalację i stara wersja zostaje na zawsze.              */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(WERSJA)
    .then(c => Promise.allSettled(ZASOBY.map(adres => c.add(new Request(adres, { cache: 'no-cache' })))))
    .then(() => self.skipWaiting()));
});

/* Stare kopie kasujemy dopiero, gdy nowa jest zainstalowana — czyli nigdy bez sieci. */
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(klucze => Promise.all(klucze.filter(k => k.startsWith('ur-') && k !== WERSJA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const adres = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (adres.origin !== self.location.origin) return;      // hub za tunelem, Pages → hub: nie nasze
  if (adres.pathname.includes('/api/')) return;           // dane, zdjęcia i strumień zawsze z huba, nigdy z kopii

  // Najpierw sieć (poprawki docierają od razu), kopia tylko gdy sieci nie ma.
  e.respondWith(
    // cache: 'no-cache' — pytamy serwer zawsze (304, gdy bez zmian). Bez tego na GitHub Pages (max-age=600) odświeżenie
    // po nowej wersji brało pliki z pamięci HTTP przeglądarki sprzed wysyłki i zapisywało je do pamięci NOWEJ wersji
    // (przegląd 2026-10-06).
    fetch(e.request, { cache: 'no-cache' })
      .then(odp => {
        if (odp && odp.ok) { const kopia = odp.clone(); caches.open(WERSJA).then(c => c.put(e.request, kopia)); }
        return odp;
      })
      // Najpierw kopia BIEŻĄCEJ wersji — inaczej przy mrugnięciu sieci aplikacja mogłaby
      // złożyć się z plików dwóch różnych wersji.
      .catch(() => caches.open(WERSJA).then(c => c.match(e.request))
        .then(k => k || caches.match(e.request))
        .then(k => k || (e.request.mode === 'navigate' ? caches.match('./index.html') : Promise.reject(new Error('brak kopii')))))
  );
});

/* Dotknięcie powiadomienia o awarii: otwórz (albo pokaż) aplikację na karcie tej awarii.
   Powiadomienie pokazuje ur.js przez registration.showNotification — na Androidzie
   „new Notification” z samej strony nie działa. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const adres = (e.notification.data && e.notification.data.adres) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(okna => {
    for (const o of okna) {
      if (new URL(o.url).pathname.startsWith(new URL(self.registration.scope).pathname)) {
        o.postMessage({ typ: 'otworz', adres });
        return o.focus();
      }
    }
    return self.clients.openWindow('./' + adres);
  }));
});
