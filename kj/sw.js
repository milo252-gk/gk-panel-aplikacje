/* Service worker Aplikacji KJ — dzięki niemu aplikacja otwiera się na hali bez
   zasięgu. Danych tu nie trzymamy: kolejka, stan, brudnopisy i zdjęcia leżą
   w IndexedDB, którą prowadzi hala.js. Wzór: panel/web/sw.js i GK Flota (KONTRAKT §9).

   WERSJA to stempel treści plików. Liczy go i sprawdza kj/testy/testuj.py:
   po zmianie dowolnego pliku z listy uruchom `python3 kj/testy/testuj.py --stempel`.
   Bez nowego stempla przeglądarka nie zainstaluje nowego workera, a telefon
   bez sieci wstałby ze starą wersją.

   TA LISTA MUSI WYMIENIAĆ KAŻDY PLIK Z web/ (pilnuje tego test). Pominięty plik
   działa przy sieci, a bez niej aplikacja nie wstaje wcale.                    */

const WERSJA = 'kj-b66c1f0a83c4';

self.HALA_PUSH_OBSLUZ_KLIK = true;   // KJ nie ma własnej obsługi dotknięcia powiadomienia
// Powiadomienia przy zamkniętej aplikacji (D28) — wspólne dla Lidera, UR i KJ.
importScripts('../wspolne/hala-push-sw.js');

const ZASOBY = [
  './', './index.html', './kj.css', './kj.js', './widok.js',
  './alerty.js', './proba.js', './reklamacje.js', './analiza.js', './katalog.js',
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
    .then(klucze => Promise.all(klucze.filter(k => k.startsWith('kj-') && k !== WERSJA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const adres = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (adres.origin !== self.location.origin) return;      // hub za tunelem, Pages → hub: nie nasze
  if (adres.pathname.includes('/api/')) return;           // dane, zdjęcia i strumień zawsze z huba, nigdy z kopii

  // Najpierw sieć (poprawki docierają od razu), kopia tylko gdy sieci nie ma.
  e.respondWith(
    fetch(e.request)
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
