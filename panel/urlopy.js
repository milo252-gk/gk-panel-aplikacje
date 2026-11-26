/* Panel Zarządczy GK — urlopy pracowników (D55, właściciel 2026-10-13: „opcja dodania urlopu dla pracownika — żeby nie
   psuć mu statystyk i tymczasowo zawiesić jego zadania”). Administracja → Urlopy.

   Od 2026-11-26 ekran jest wspólny z „Urlopy zespołu” w GK Utrzymanie Ruchu i GK Kontrola Jakości (właściciel: ten sam ekran, nie kopia):
   wygląd i zapis — wspolne/klient/urlopy.js (HalaUrlopy), czyste funkcje — hala.js (Hala.urlopyLista, Hala.urlopZFormularza,
   Hala.osobyDoUrlopow; W.* w widok.js to te same funkcje). Tu tylko podpięcie do Panelu (dymek, okno pytania, przerysowanie). */

(() => {
  'use strict';
  const P = window.Panel;

  function rysuj(el) {
    window.HalaUrlopy.rysuj(el, P.hala, { klasaWiersza: 'zlecenie', komunikat: (t, r) => P.komunikat(t, r), potwierdz: (...a) => P.potwierdz(...a),
                                         komunikatBledu: e => P.komunikatBledu(e), odswiez: () => P.narysuj() });
  }

  P.widoki.urlopy = { rysuj };
})();
