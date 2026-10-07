/* Service worker Panelu — dzięki niemu Panel otwiera się bez sieci i pokazuje
   ostatni znany stan z paskiem „Brak połączenia od HH:MM” (D15). Danych tu nie
   trzymamy: stan i słowniki leżą w IndexedDB, którą prowadzi hala.js.
   Wzór: GK Flota/_zrodlo/web/sw.js (KONTRAKT §9).

   WERSJA to stempel treści plików. Liczy go i sprawdza panel/testy/testuj.py:
   po zmianie dowolnego pliku z listy uruchom `python panel/testy/testuj.py --stempel`.
   Bez nowego stempla przeglądarka nie zainstaluje nowego workera, a monitor
   w biurze bez sieci wstałby ze starą wersją.

   TA LISTA MUSI WYMIENIAĆ KAŻDY PLIK Z web/ (pilnuje tego test). Pominięty plik
   działa przy sieci, a bez niej Panel nie wstaje wcale.                        */

const WERSJA = 'panel-525cb88cd17d';

// Powiadomienia przy zamkniętym Panelu (2026-10-02): kierownik, który zlecił, dowiaduje się, że zlecenie jest po
// terminie (wspólna część z Liderem, UR i KJ — D28). Panel nie ma własnej obsługi dotknięcia: robi to wspólny plik
// (okno Panelu dostaje {typ:'otworz', adres:'#zlecenia'}, a gdy go nie ma, otwiera ./#zlecenia).
self.HALA_PUSH_OBSLUZ_KLIK = true;
importScripts('../wspolne/hala-push-sw.js');

const ZASOBY = [
  './', './index.html', './panel.css', './panel.js', './widok.js', './administracja.js', './checklisty.js', './etykiety.js', './wskazniki.js', './stale.js',
  './manifest.webmanifest', './ikona.svg', './ikona-192.png', './ikona-512.png', './ikona-maskable-512.png', './apple-touch-icon.png',
  '../wspolne/hala.js', '../wspolne/motyw.js', '../wspolne/aktualizacja.js', '../wspolne/konto.js', '../wspolne/eksport.js', '../wspolne/hala-push-sw.js', '../wspolne/hala.css', '../wspolne/logo-gkf.png',
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
    .then(klucze => Promise.all(klucze.filter(k => k.startsWith('panel-') && k !== WERSJA).map(k => caches.delete(k))))
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
      // Najpierw kopia BIEŻĄCEJ wersji — inaczej przy mrugnięciu sieci Panel mógłby
      // złożyć się z plików dwóch różnych wersji.
      .catch(() => caches.open(WERSJA).then(c => c.match(e.request))
        .then(k => k || caches.match(e.request))
        .then(k => k || (e.request.mode === 'navigate' ? caches.match('./index.html') : Promise.reject(new Error('brak kopii')))))
  );
});
