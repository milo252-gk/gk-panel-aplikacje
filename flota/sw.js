/* Service worker — dzieki niemu aplikacja otwiera sie w telefonie bez zasiegu.
   Trzyma kopie samego programu (HTML, style, skrypty). Danych nie buforuje
   tutaj — od tego jest IndexedDB w kolejka.js.

   W tym programie to nie jest wygoda, tylko warunek dzialania: kierowca robi
   obchod auta na placu, w hali albo na parkingu pod lasem, gdzie firmowe wifi
   nie siega, a zasieg komorkowy bywa jednokreskowy. Program ma sie tam otworzyc
   i przyjac komplet zdjec.                                                   */

const WERSJA = 'flotex-da9880044ce2';

/* Zasoby wołamy ZE STEMPLEM wersji w adresie (?v=...). To jedyne, czego żadna
   pamięć podręczna nie obejdzie: po zmianie pliku zmienia się adres, więc stara
   kopia nie ma jak zostać podana. index.html zostaje bez stempla — serwer
   oddaje go z „no-store".

   TA LISTA MUSI WYMIENIAĆ KAŻDY PLIK Z web/. Pominięcie choć jednego daje
   program, który działa przy zasięgu, a bez zasięgu nie wstaje wcale — i to
   akurat wtedy, kiedy jest potrzebny. Nowy plik dopisuje się w dwóch
   miejscach: <script>/<link> w index.html (ikony PNG — w manifest.webmanifest)
   i tutaj. Pilnują tego testy/t_web.py i zbuduj.py.                          */
const ZASOBY = [
  './style.css', './app.js', './kolejka.js', './zdjecia.js', './podpis.js',
  './skrot.js', './pojazdy.js', './przeglady.js', './kierowca.js', './awaria.js', './zaproszenie.js',
  './ustawienia.js', './konta.js',
  './ikona.svg', './logo-gkf.png', './manifest.webmanifest',
  './ikona-192.png', './ikona-512.png', './ikona-maskable-512.png', './apple-touch-icon.png',
];
const SZKIELET = ['./', './index.html'].concat(ZASOBY.map(a => a + '?v=' + WERSJA));

/* Instalacja pliku po pliku, a NIE addAll.

   addAll jest wszystko-albo-nic: jedno nieudane pobranie (a firmowe wifi na
   hali potrafi mrugnąć) unieważnia całą instalację. Nowy worker wtedy nigdy nie
   wchodzi, stary dalej rządzi i podaje starą kopię programu — i dokładnie tak
   wygląda „poprawka nie dotarła". Przy allSettled brak jednego pliku nie
   blokuje wersji: kopia będzie niepełna, a brakujące pliki i tak przyjdą
   z sieci, bo tryb jest „najpierw sieć".                                     */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(WERSJA)
    .then(c => Promise.allSettled(SZKIELET.map(adres => c.add(adres))))
    .then(() => self.skipWaiting()));
});

/* Sprzątamy WYŁĄCZNIE własne stare pamięci („flotex-…”). Pamięć podręczna jest
   wspólna dla całego źródła, a na GitHub Pages (D33) pod tym samym
   https://milo252-gk.github.io stoją też GK Trasy i aplikacje hali. Kasowanie
   „wszystkiego poza moją wersją” zabierałoby im tryb offline przy każdej
   aktualizacji floty — a one robiłyby to samo nam.                           */
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(klucze => Promise.all(klucze.filter(k => k.startsWith('flotex-') && k !== WERSJA)
      .map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Powiadomienia przy ZAMKNIĘTEJ aplikacji (Web Push) — ten sam sposób co hub
   GK Panel Kierownika (wspolne/klient/hala-push-sw.js).

   Program wysyła push BEZ treści (szyfrowanie treści wymagałoby bibliotek spoza
   Pythona), więc tutaj po jego otrzymaniu pytamy program „co nowego” adresem
   subskrypcji i dopiero wtedy pokazujemy powiadomienie.

   Gdzie stoi program: aplikacja z GitHub Pages ma obok siebie adres.json z adresem
   programu w biurze (tak jak app.js). Otwarta wprost z programu nie ma tego pliku —
   program oddaje wtedy stronę aplikacji zamiast JSON-a — a dane są pod tym samym
   adresem co worker.                                                          */
async function adresDanych() {
  try {
    const odp = await fetch(new URL('adres.json', self.registration.scope).href + '?t=' + Date.now(),
                            { cache: 'no-store' });
    if (odp.ok) {
      const opis = await odp.json();
      if (opis && typeof opis.api === 'string' && /^https?:\/\//.test(opis.api)) {
        return opis.api.replace(/\/+$/, '');
      }
    }
  } catch (e) { /* brak pliku albo nie-JSON = dane pod adresem aplikacji */ }
  return self.location.origin;
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let wiadomosci = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const odp = await fetch((await adresDanych()) + '/api/push/co-nowego', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub ? sub.endpoint : '' }) });
      if (odp.ok) wiadomosci = (await odp.json()).wiadomosci || [];
    } catch (err) { /* program nieosiągalny — i tak coś pokażemy, żeby zajrzeć do aplikacji */ }
    // Przeglądarka wymaga powiadomienia po każdym pushu (inaczej pokaże własne,
    // po angielsku) — gdy treści nie ma, mówimy chociaż, gdzie zajrzeć.
    if (!wiadomosci.length) {
      wiadomosci = [{ tytul: 'GK Flota', tresc: 'Coś nowego we flocie — otwórz aplikację.',
                      tag: 'gk-flota' }];
    }
    // Ikona PNG: SVG w powiadomieniu nie każda przeglądarka rysuje (Android), PNG — każda.
    const ikona = new URL('./ikona-192.png', self.registration.scope).href;
    await Promise.all(wiadomosci.map(w => self.registration.showNotification(w.tytul || 'GK Flota', {
      body: w.tresc || '', tag: w.tag || 'gk-flota', renotify: true, requireInteraction: !!w.pilne,
      icon: ikona, badge: ikona, vibrate: w.pilne ? [300, 150, 300, 150, 300] : [200],
      data: { ekran: w.ekran || '' } })));
  })());
});

/* Dotknięcie powiadomienia: otwarta aplikacja przechodzi na właściwy ekran
   (app.js słucha wiadomości „otworz”), zamknięta — otwiera się na nim (#ekran=…). */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const ekran = String((e.notification.data && e.notification.data.ekran) || '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(okna => {
    const zakres = new URL(self.registration.scope).pathname;
    const moje = okna.find(o => new URL(o.url).pathname.startsWith(zakres));
    if (moje) {
      if (ekran) moje.postMessage({ typ: 'otworz', ekran });
      return moje.focus();
    }
    const adres = new URL('./', self.registration.scope);
    if (ekran) adres.hash = 'ekran=' + encodeURIComponent(ekran);
    return self.clients.openWindow(adres.href);
  }));
});

self.addEventListener('fetch', e => {
  const adres = new URL(e.request.url);
  if (e.request.method !== 'GET') return;                 // zapisy zawsze do serwera
  if (adres.pathname.startsWith('/api/')) return;         // dane zawsze swieze

  /* Zdjęć przeglądów NIE buforujemy. Po pierwsze idą na token, który wygasa
     po pół godzinie — kopia w pamięci przeżyłaby token i podawała obrazek,
     do którego przeglądarka nie ma już prawa. Po drugie komplet zdjęć całej
     floty to setki megabajtów; telefon skasowałby wtedy pamięć aplikacji
     razem z niewysłanym przeglądem kierowcy.                                 */
  if (adres.pathname.startsWith('/pliki/')) return;

  /* adres.json — wprost do sieci, bez kopii. Aplikacja czyta go ze znacznikiem
     czasu (?t=…) przy starcie i po każdej utracie programu (zmiana adresu
     tunelu), więc każda kopia leżałaby pod innym adresem i pamięć rosłaby bez
     końca. Brak sieci aplikacja obsługuje sama — ostatnim adresem z IndexedDB. */
  if (adres.pathname.endsWith('/adres.json')) return;

  // Zapytania na zewnatrz sa obce — trzymamy sie od nich z daleka, zeby przy
  // braku sieci nie dostaly awaryjnego index.html zamiast czystego bledu.
  if (adres.origin !== self.location.origin) return;

  // Szkielet: najpierw siec (zeby poprawki dochodzily), kopia jako zabezpieczenie.
  // index.html oddajemy awaryjnie tylko przy wchodzeniu na strone — nigdy
  // w miejsce brakujacego skryptu czy obrazka.
  e.respondWith(
    fetch(e.request)
      .then(odp => {
        if (odp && odp.ok) {
          const kopia = odp.clone();
          caches.open(WERSJA).then(c => c.put(e.request, kopia));
        }
        return odp;
      })
      // Kopia awaryjna szuka NAJPIERW w pamieci biezacej wersji. Bez tego
      // caches.match przeszukuje wszystkie pamieci po kolei i przy jednym
      // mrugnieciu sieci potrafi podac plik ze starej paczki — aplikacja
      // chodzi wtedy jako mieszanka wersji i nic tego nie zglasza.
      .catch(() => caches.open(WERSJA).then(c => c.match(e.request))
        .then(k => k || caches.match(e.request))
        .then(k => k || (e.request.mode === 'navigate' ? caches.match('./index.html')
                                                       : Promise.reject())))
  );
});
