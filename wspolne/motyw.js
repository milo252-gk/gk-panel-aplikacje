/* Motyw: jak w telefonie / jasny / ciemny — jeden dla czterech aplikacji (jak Motyw w GK Trasy i GK Flota).

   Ładuje się w <head> PRZED arkuszami (<script src="../wspolne/motyw.js"></script> zaraz po
   <meta name="theme-color">). Inaczej pierwszy obraz jest zawsze jasny i ktoś, kto wybrał ciemny,
   dostaje w oczy białą kartkę przy każdym otwarciu.

   Wybór trzyma URZĄDZENIE, nie konto: ekran logowania rysuje się, zanim wiadomo, kto się loguje,
   a telefon bywa wspólny. Dlatego wylogowanie go nie kasuje. Klucz jest wspólny (`hala.motyw`,
   KONTRAKT §9) — cztery aplikacje leżą pod jednym adresem, więc wybór w jednej działa we wszystkich.
   Stare klucze UR i KJ (`hala.ur.motyw`, `hala.kj.motyw`) przejmujemy raz, żeby nikomu nie zmienił się
   wygląd po aktualizacji.

   „Jak w telefonie” = brak atrybutu data-motyw; wtedy hala.css sam idzie za prefers-color-scheme,
   także gdy telefon przełączy się o zmierzchu przy otwartej aplikacji.

   Każdy dostęp do localStorage w try/catch: w Safari w trybie prywatnym sam dostęp rzuca wyjątkiem.

   API: HalaMotyw.odczytaj() → 'auto' | 'jasny' | 'ciemny'; HalaMotyw.ustaw(w) → true, gdy zapamiętane
   (false = tryb prywatny: działa do zamknięcia karty — aplikacja mówi to człowiekowi);
   HalaMotyw.zastosuj(); HalaMotyw.ciemny() → czy teraz widać ciemny.                                  */

(function (global) {
  'use strict';

  var KLUCZ = 'hala.motyw';
  var STARE_KLUCZE = ['hala.ur.motyw', 'hala.kj.motyw'];
  // Kolor paska przeglądarki = --marka-tlo w danym motywie (hala.css). Tu na sztywno, bo arkusza jeszcze nie ma.
  var PASEK = { jasny: '#4E4E4E', ciemny: '#191817' };
  var wybranyBezPamieci = null;   // tryb prywatny: wybór żyje do zamknięcia karty

  function czytaj(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }

  function przejmijStary() {
    try {
      if (global.localStorage.getItem(KLUCZ) !== null) return;
      for (var i = 0; i < STARE_KLUCZE.length; i++) {
        var w = global.localStorage.getItem(STARE_KLUCZE[i]);
        if (w === 'jasny' || w === 'ciemny') { global.localStorage.setItem(KLUCZ, w); break; }
      }
      for (var j = 0; j < STARE_KLUCZE.length; j++) global.localStorage.removeItem(STARE_KLUCZE[j]);
    } catch (e) { /* tryb prywatny — zostaje „jak w telefonie” */ }
  }

  function systemCiemny() {
    try { return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; }
  }

  var M = {
    odczytaj: function () {
      var w = wybranyBezPamieci || czytaj(KLUCZ);
      return w === 'jasny' || w === 'ciemny' ? w : 'auto';
    },
    ciemny: function () {
      var w = M.odczytaj();
      return w === 'ciemny' || (w === 'auto' && systemCiemny());
    },
    zastosuj: function () {
      var w = M.odczytaj(), korzen = global.document.documentElement;
      if (w === 'auto') korzen.removeAttribute('data-motyw'); else korzen.setAttribute('data-motyw', w);
      var pasek = global.document.querySelector('meta[name="theme-color"]');
      if (pasek) pasek.setAttribute('content', M.ciemny() ? PASEK.ciemny : PASEK.jasny);
    },
    ustaw: function (w) {
      var zapamietane = true;
      wybranyBezPamieci = null;
      try {
        if (w === 'jasny' || w === 'ciemny') global.localStorage.setItem(KLUCZ, w); else global.localStorage.removeItem(KLUCZ);
      } catch (e) {
        zapamietane = false;
        wybranyBezPamieci = (w === 'jasny' || w === 'ciemny') ? w : 'auto';
      }
      M.zastosuj();
      return zapamietane;
    },
  };

  global.HalaMotyw = M;
  przejmijStary();
  M.zastosuj();
  // Kolor paska przeglądarki ma nadążyć, gdy telefon sam zmieni motyw (tryb „jak w telefonie”).
  try {
    var czujnik = global.matchMedia('(prefers-color-scheme: dark)');
    if (czujnik.addEventListener) czujnik.addEventListener('change', M.zastosuj);
    else if (czujnik.addListener) czujnik.addListener(M.zastosuj);
  } catch (e) { /* stara przeglądarka — pasek zostaje w kolorze z chwili otwarcia */ }
})(window);
