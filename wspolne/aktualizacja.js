/* Nowa wersja aplikacji — jedna obsługa dla Panelu, Lidera, UR i KJ (jak w GK Trasy).

   Bez tego otwarta aplikacja nigdy nie bierze poprawki: service worker nowej wersji instaluje się
   w tle (sw.js: skipWaiting + clients.claim), przejmuje stronę i przeglądarka zgłasza
   controllerchange — ale na ekranie dalej chodzi stary kod, aż ktoś sam odświeży. Monitor w biurze
   (konto ekranu, sesja 90 dni) i telefon lidera otwarty całą zmianę nie odświeżają nigdy.

   Zasady:
   - przy PIERWSZEJ instalacji też pada controllerchange, choć nic się nie zmieniło — odświeżamy tylko,
     gdy stronę prowadził już jakiś worker (inaczej każde pierwsze wejście mignęłoby ekranem);
   - nie spod palca: przy otwartym oknie, skanerze, formularzu albo polu, w którym ktoś pisze, tylko
     mówimy „Jest nowa wersja — odświeży się po zamknięciu okna” i czekamy, aż się zwolni;
   - dokładnie raz (strażnik przeladowano) — żadnej pętli odświeżania;
   - sprawdzenie nowej wersji co godzinę i po powrocie na kartę (telefon wyjęty z kieszeni).

   Użycie (zamiast navigator.serviceWorker.register('sw.js')):
     HalaAktualizacja.pilnuj({ komunikat: (tekst, rodzaj) => …, zajety: () => czyAplikacjaMaCośOtwartego });
     HalaAktualizacja.wpiszWersje(element, 'ur');   // „klient 0.5.0 · aplikacja ur-1726f7030f5d”        */

(function (global) {
  'use strict';

  const nav = global.navigator;
  const doc = global.document;
  const SPRAWDZ_CO_MS = 3600 * 1000;
  const CZEKAJ_CO_MS = 2000;

  /* Wspólne „zajęte” dla wszystkich aplikacji: okno modalne (<dialog> UR, KJ, Panelu), skaner
     (skaner.js), formularz zlecenia (zlecenia.js) i pole z wpisanym tekstem pod kursorem. Puste pole
     z fokusem (np. identyfikator na ekranie logowania monitora) nie blokuje — inaczej czekałoby wiecznie. */
  function zajetyWspolnie() {
    if (doc.querySelector('dialog[open], .hala-skaner, .hala-zlecenie-formularz')) return true;
    const a = doc.activeElement;
    if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
    if (a.type === 'checkbox' || a.type === 'radio' || a.type === 'button' || a.type === 'submit') return false;
    return a.tagName === 'SELECT' || !!a.value;
  }

  function pilnuj(opcje) {
    const o = opcje || {};
    if (!nav || !('serviceWorker' in nav)) return;
    const komunikat = typeof o.komunikat === 'function' ? o.komunikat : () => {};
    const zajety = () => {
      try { return zajetyWspolnie() || !!(o.zajety && o.zajety()); } catch (e) { return false; }
    };
    const bylJuzWorker = !!nav.serviceWorker.controller;
    let czeka = false, przeladowano = false;

    function przeladuj() {
      if (przeladowano) return;
      przeladowano = true;
      komunikat('Nowa wersja — odświeżam', 'ok');
      setTimeout(() => global.location.reload(), 600);
    }
    function sprobuj() {
      if (przeladowano) return;
      if (!zajety()) { przeladuj(); return; }
      if (!czeka) { czeka = true; komunikat('Jest nowa wersja — odświeży się po zamknięciu okna'); }
      setTimeout(sprobuj, CZEKAJ_CO_MS);
    }

    nav.serviceWorker.addEventListener('controllerchange', () => {
      if (!bylJuzWorker || czeka || przeladowano) return;
      sprobuj();
    });
    nav.serviceWorker.register(o.sw || 'sw.js').then(rejestracja => {
      const sprawdz = () => { rejestracja.update().catch(() => { /* bez sieci — spróbujemy później */ }); };
      setInterval(sprawdz, SPRAWDZ_CO_MS);
      doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') sprawdz(); });
    }).catch(() => { /* http w sieci firmowej — aplikacja działa, tylko bez pracy offline */ });
  }

  /* Wersja do pokazania człowiekowi (serwis pyta „jaką masz wersję?”): klient hala.js i stempel
     service workera tej aplikacji — to nazwa jego pamięci podręcznej (sw.js: caches.open(WERSJA)). */
  async function opisWersji(aplikacja) {
    const klient = 'klient ' + ((global.Hala && global.Hala.WERSJA) || '?');
    let stempel = '';
    try {
      if (global.caches) stempel = (await global.caches.keys()).filter(k => k.startsWith(aplikacja + '-')).sort().pop() || '';
    } catch (e) { /* http — bez service workera nie ma stempla */ }
    return stempel ? `${klient} · aplikacja ${stempel}` : klient;
  }

  function wpiszWersje(element, aplikacja) {
    if (!element) return;
    element.textContent = 'klient ' + ((global.Hala && global.Hala.WERSJA) || '?');
    opisWersji(aplikacja).then(t => { element.textContent = t; }, () => {});
  }

  global.HalaAktualizacja = { pilnuj, opisWersji, wpiszWersje, zajetyWspolnie };
})(window);
