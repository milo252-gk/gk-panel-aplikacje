/* Osłona „palec na ekranie” — wspólna dla Panelu, Lidera, UR i KJ (etap 3 planu poprawy, 2026-11-09; wzór: UR, przegląd kodu).

   Problem: strumień zmian przerysowuje ekran co kilka sekund. Przerysowanie między dotknięciem (pointerdown) a puszczeniem
   (pointerup) podmienia przycisk pod palcem i „click” nie przychodzi — mechanik / lider w rękawicy musi dotknąć drugi raz.
   UR miał osłonę u siebie; Lider, KJ i Panel nie (połykały dotknięcia). Teraz jeden plik:

       const palec = HalaPalec.zainstaluj(() => App.odswiez());     // raz, przy starcie aplikacji
       App.odswiez = () => { if (palec.zajety()) return; …rysuj… };  // palec na ekranie → odkładamy, rysujemy po puszczeniu

   `zajety()` zwraca true, gdy palec jest na ekranie, i zapamiętuje, że przerysowanie czeka: po puszczeniu (pointerup /
   pointercancel) wołamy `ponow` po 60 ms. Zabezpieczenie, którego UR nie miał: gdy puszczenie zginie (palec zjechał poza okno,
   przeglądarka połknęła zdarzenie), osłona sama się zwalnia po `limitMs` (5 s) — inaczej ekran stałby bez odświeżania do
   następnego dotknięcia. Czyste, testowalne (dokument i zegar można podstawić). */

(function (global) {
  'use strict';

  function zainstaluj(ponow, opcje) {
    const o = Object.assign({ dokument: typeof document !== 'undefined' ? document : null, limitMs: 5000, opoznienieMs: 60,
                              // Zegary opakowane w funkcje strzałkowe: wołane jako `o.zegar(…)` goły setTimeout dostaje `this` = o i przeglądarka
                              // rzuca „Illegal invocation” przy każdym dotknięciu ekranu (błąd z wydania 2026.11.09-1845).
                              zegar: typeof setTimeout === 'function' ? (f, ms) => setTimeout(f, ms) : null,
                              kasuj: typeof clearTimeout === 'function' ? (id) => clearTimeout(id) : () => {} }, opcje || {});
    let palec = false, poPalcu = false, straznik = null;
    const puscil = () => {
      palec = false;
      if (o.kasuj && straznik) { o.kasuj(straznik); straznik = null; }
      if (poPalcu) { poPalcu = false; if (o.zegar) o.zegar(() => { try { ponow(); } catch (e) { console.error(e); } }, o.opoznienieMs); }
    };
    if (o.dokument && o.dokument.addEventListener) {
      o.dokument.addEventListener('pointerdown', () => {
        palec = true;
        if (o.kasuj && straznik) o.kasuj(straznik);
        if (o.zegar) straznik = o.zegar(puscil, o.limitMs);
      }, true);
      o.dokument.addEventListener('pointerup', puscil, true);
      o.dokument.addEventListener('pointercancel', puscil, true);
    }
    return {
      /* true = palec na ekranie: przerysowanie odłożone do puszczenia (ponow). */
      zajety() { if (palec) { poPalcu = true; return true; } return false; },
      naEkranie: () => palec,
    };
  }

  const HalaPalec = { zainstaluj };
  global.HalaPalec = HalaPalec;
  if (typeof module !== 'undefined' && module.exports) module.exports = HalaPalec;
})(typeof window !== 'undefined' ? window : globalThis);
