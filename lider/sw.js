/* Service worker Aplikacji Lidera — dzięki niemu aplikacja otwiera się bez zasięgu
   (hala bywa bez wifi), a zapisy czekają w kolejce hala.js. Danych tu nie trzymamy:
   stan, kolejka i brudnopisy leżą w IndexedDB, którą prowadzi hala.js.
   Wzór: panel/web/sw.js i GK Flota/_zrodlo/web/sw.js (KONTRAKT §9).

   WERSJA to stempel treści plików z lider/web. Liczy go i sprawdza lider/testy/testuj.py:
   po zmianie dowolnego pliku z web/ uruchom `python lider/testy/testuj.py --stempel`.
   Pliki wspólne (hala.js, hala.css, skaner.js, skaner-zxing.js) NIE wchodzą do stempla — należą do
   integratora i ich zmiana nie może wywracać CI Lidera. Przy sieci i tak przychodzą
   świeże (network-first), a kopia w cache odnawia się przy każdym pobraniu.

   TA LISTA MUSI WYMIENIAĆ KAŻDY PLIK Z web/ (pilnuje tego test). Pominięty plik
   działa przy sieci, a bez niej aplikacja nie wstaje wcale.                     */

const WERSJA = 'lider-92f371837dde';

// Powiadomienia przy zamkniętej aplikacji (D28) — wspólne dla Lidera, UR i KJ. Dotknięcie też wspólne (jak KJ i Panel):
// otwarte okno dostaje {typ:'otworz', adres} z data.adres (np. '#zlecenia'), a bez okna otwiera się ./#zlecenia —
// app.js zamienia adres na ekran. Wcześniej własna obsługa tylko przywracała okno (przegląd 2026-10-07).
self.HALA_PUSH_OBSLUZ_KLIK = true;
importScripts('../wspolne/hala-push-sw.js');

const ZASOBY = [
  './', './index.html', './lider.css', './app.js', './widok.js', './awarie.js', './jakosc.js', './zmiana.js', './formularze.js',
  './manifest.webmanifest', './ikona.svg', './ikona-192.png', './ikona-512.png', './ikona-maskable-512.png', './apple-touch-icon.png',
  '../wspolne/hala.js', '../wspolne/motyw.js', '../wspolne/aktualizacja.js', '../wspolne/konto.js', '../wspolne/hala-push-sw.js', '../wspolne/zlecenia.js', '../wspolne/hala.css', '../wspolne/skaner.js', '../wspolne/logo-gkf.png',
  '../wspolne/skaner-zxing.js',          // zapasowy dekoder (iPhone) — obchód z QR musi działać bez sieci
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
    .then(klucze => Promise.all(klucze.filter(k => k.startsWith('lider-') && k !== WERSJA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const adres = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (adres.origin !== self.location.origin) return;      // hub za tunelem, Pages → hub: nie nasze
  if (adres.pathname.includes('/api/')) return;           // dane i strumień zawsze z huba, nigdy z kopii

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
      .catch(() => caches.open(WERSJA).then(c => c.match(e.request))
        .then(k => k || caches.match(e.request))
        .then(k => k || (e.request.mode === 'navigate' ? caches.match('./index.html') : Promise.reject(new Error('brak kopii')))))
  );
});
