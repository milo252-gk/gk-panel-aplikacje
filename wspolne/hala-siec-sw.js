/* Wspólna odpowiedź service workerów Panelu, Lidera, UR i KJ: „najpierw sieć, kopia gdy sieci nie ma” — z LIMITEM CZASU
   (etap 3 planu poprawy, 2026-11-09).

   Dotąd pliki aplikacji szły wyłącznie przez `fetch` bez końca, a kopia z pamięci służyła dopiero po BŁĘDZIE sieci. Telefon
   „z wifi, ale bez internetu” (hala bywa tak całymi godzinami) nie dostawał błędu, tylko ciszę: aplikacja nie otwierała się
   wcale, choć miała w pamięci kompletną kopię. Teraz sieć i zegar ścigają się: gdy sieć nie odpowie w `limitMs` (4 s),
   a kopia jest — dostajemy kopię; zapytanie do sieci trwa dalej i odświeży kopię na następne otwarcie. Gdy kopii nie ma
   (pierwsze wejście) — czekamy na sieć jak dotąd. Błąd sieci → kopia od razu, jak dotąd.

   Użycie w sw.js aplikacji (po `importScripts('../wspolne/hala-siec-sw.js')`):
       e.respondWith(self.halaOdpowiedzSieciowa(e.request, WERSJA));
   Kopia BIEŻĄCEJ wersji (cache WERSJA) ma pierwszeństwo — inaczej przy mrugnięciu sieci aplikacja mogłaby złożyć się z plików
   dwóch różnych wersji. Danych (/api/) tu nie ma: sw.js aplikacji odsiewa je przed wywołaniem. */

(function () {
  'use strict';
  const LIMIT_SIECI_MS = 4000;

  /* Kopia pliku: z cache bieżącej wersji, potem z jakiejkolwiek; dla nawigacji — strona główna aplikacji. null = brak. */
  function kopia(zadanie, wersja) {
    return caches.open(wersja).then(c => c.match(zadanie))
      .then(k => k || caches.match(zadanie))
      .then(k => k || (zadanie.mode === 'navigate' ? caches.match('./index.html') : null));
  }

  function odpowiedz(zadanie, wersja, limitMs) {
    // cache: 'no-cache' — pytamy serwer zawsze (304, gdy bez zmian). Bez tego na GitHub Pages (max-age=600) odświeżenie po nowej
    // wersji brało pliki z pamięci HTTP przeglądarki sprzed wysyłki i zapisywało je do pamięci NOWEJ wersji (przegląd 2026-10-06).
    const siec = fetch(zadanie, { cache: 'no-cache' }).then(odp => {
      if (odp && odp.ok) { const k = odp.clone(); caches.open(wersja).then(c => c.put(zadanie, k)).catch(() => {}); }
      return odp;
    });
    return new Promise((ok, zle) => {
      let koniec = false;
      const oddaj = w => { if (koniec) return; koniec = true; clearTimeout(zegar); ok(w); };
      const odrzuc = e => { if (koniec) return; koniec = true; clearTimeout(zegar); zle(e); };
      // Limit: sieć milczy, a kopia jest — oddajemy kopię. Bez kopii czekamy dalej (siec.then niżej).
      const zegar = setTimeout(() => { kopia(zadanie, wersja).then(k => { if (k) oddaj(k); }, () => {}); }, limitMs || LIMIT_SIECI_MS);
      siec.then(oddaj, () => kopia(zadanie, wersja).then(k => (k ? oddaj(k) : odrzuc(new Error('brak kopii'))), odrzuc));
    });
  }

  self.halaOdpowiedzSieciowa = odpowiedz;
  self.HALA_LIMIT_SIECI_MS = LIMIT_SIECI_MS;
})();
