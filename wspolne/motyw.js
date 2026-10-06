/* Motyw: jak w telefonie / jasny / ciemny — jeden dla czterech aplikacji (jak Motyw w GK Trasy i GK Flota).

   Ładuje się w <head> PRZED arkuszami (<script src="../wspolne/motyw.js"></script> zaraz po
   <meta name="theme-color">). Inaczej pierwszy obraz jest zawsze jasny i ktoś, kto wybrał ciemny,
   dostaje w oczy białą kartkę przy każdym otwarciu.

   Wybór trzyma URZĄDZENIE, nie konto: ekran logowania rysuje się, zanim wiadomo, kto się loguje,
   a telefon bywa wspólny. Dlatego wylogowanie go nie kasuje.

   Klucz `gk.motyw` jest wspólny dla WSZYSTKICH programów GK (recenzja 2026-10-05, KONTRAKT §9): na GitHub Pages
   cztery aplikacje hali, GK Trasy i GK Flota leżą pod jednym adresem (milo252-gk.github.io), więc osoba z kilkoma
   programami ustawiała motyw trzy razy (`hala.motyw`, `gk-trasy.motyw`, `gk-flota.motyw`). Wartości jak w programach
   transportu: 'jasny' | 'ciemny'; „jak w telefonie” = BRAK klucza (nie zapisujemy 'auto').
   Migracja: przy pierwszym starcie po aktualizacji, gdy `gk.motyw` jeszcze nie ma, przejmujemy stary `hala.motyw`
   (a przed nim UR/KJ `hala.ur.motyw`, `hala.kj.motyw`) i stare klucze kasujemy. Kasujemy, a nie zapisujemy dalej w obu:
   gdy ktoś w GK Trasy wybierze „jak w telefonie” (usunie `gk.motyw`), zostawiony `hala.motyw` przywróciłby stary wybór.

   „Jak w telefonie” = brak atrybutu data-motyw; wtedy hala.css sam idzie za prefers-color-scheme,
   także gdy telefon przełączy się o zmierzchu przy otwartej aplikacji.

   Każdy dostęp do localStorage w try/catch: w Safari w trybie prywatnym sam dostęp rzuca wyjątkiem.

   API: HalaMotyw.odczytaj() → 'auto' | 'jasny' | 'ciemny'; HalaMotyw.ustaw(w) → true, gdy zapamiętane
   (false = tryb prywatny: działa do zamknięcia karty — aplikacja mówi to człowiekowi);
   HalaMotyw.zastosuj(); HalaMotyw.ciemny() → czy teraz widać ciemny.                                  */

(function (global) {
  'use strict';

  var KLUCZ = 'gk.motyw';
  // Kolejność = pierwszeństwo przy migracji: wspólny klucz hali (D30), potem jeszcze starsze UR i KJ.
  var STARE_KLUCZE = ['hala.motyw', 'hala.ur.motyw', 'hala.kj.motyw'];
  // Kolor paska przeglądarki = --marka-tlo w danym motywie (hala.css). Tu na sztywno, bo arkusza jeszcze nie ma.
  var PASEK = { jasny: '#4E4E4E', ciemny: '#191817' };
  var wybranyBezPamieci = null;   // tryb prywatny: wybór żyje do zamknięcia karty

  function czytaj(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }

  function przejmijStary() {
    try {
      if (global.localStorage.getItem(KLUCZ) === null) {
        for (var i = 0; i < STARE_KLUCZE.length; i++) {
          var w = global.localStorage.getItem(STARE_KLUCZE[i]);
          if (w === 'jasny' || w === 'ciemny') { global.localStorage.setItem(KLUCZ, w); break; }
        }
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
  // Motyw zmieniony w innym programie GK na tym samym adresie (druga karta: GK Trasy, GK Flota, inna aplikacja hali).
  try {
    global.addEventListener('storage', function (e) { if (e.key === KLUCZ || e.key === null) M.zastosuj(); });
  } catch (e) { /* bez tego motyw zmieni się przy następnym otwarciu */ }
})(window);
