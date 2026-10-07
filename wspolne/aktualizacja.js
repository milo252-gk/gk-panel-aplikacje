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
     HalaAktualizacja.wpiszWersje(element, 'ur');   // „wersja 1726f7030f5d”, w podpowiedzi (title) pełne
                                                     // „klient 0.5.0 · aplikacja ur-1726f7030f5d” dla serwisu  */

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
    // Czy stronę prowadzi już jakiś worker. NIE stała z chwili startu: strona otwarta bez workera (pierwsze wejście,
    // Ctrl+Shift+R, wyczyszczone dane) dostaje go przy pierwszym controllerchange — od tej chwili każda następna
    // zmiana to już nowa wersja. Wcześniej flaga zostawała „false” na zawsze i taka karta (monitor w biurze, telefon
    // lidera) nie brała żadnej poprawki aż do ręcznego odświeżenia (przegląd 2026-10-06).
    let prowadzona = !!nav.serviceWorker.controller;
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
      if (!prowadzona) { prowadzona = true; return; }      // pierwsza instalacja — nic się nie zmieniło
      if (czeka || przeladowano) return;
      sprobuj();
    });
    nav.serviceWorker.register(o.sw || 'sw.js').then(rejestracja => {
      const sprawdz = () => { rejestracja.update().catch(() => { /* bez sieci — spróbujemy później */ }); };
      setInterval(sprawdz, SPRAWDZ_CO_MS);
      doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') sprawdz(); });
    }).catch(() => { /* http w sieci firmowej — aplikacja działa, tylko bez pracy offline */ });
  }

  /* Stempel service workera tej aplikacji — nazwa jego pamięci podręcznej (sw.js: caches.open(WERSJA)). */
  async function stempel(aplikacja) {
    try {
      if (global.caches) return (await global.caches.keys()).filter(k => k.startsWith(aplikacja + '-')).sort().pop() || '';
    } catch (e) { /* http — bez service workera nie ma stempla */ }
    return '';
  }

  /* Pełny opis wersji dla serwisu („jaką masz wersję?”): klient hala.js i stempel service workera. */
  async function opisWersji(aplikacja) {
    const klient = 'klient ' + ((global.Hala && global.Hala.WERSJA) || '?');
    const s = await stempel(aplikacja);
    return s ? `${klient} · aplikacja ${s}` : klient;
  }

  /* Stopka „Moje konto” (STYL-GK §3, §5): człowiek widzi krótkie „wersja X” — stempel bez przedrostka aplikacji
     (`panel-…`), a bez workera (http) wersję klienta. Pełny opis zostaje w podpowiedzi (title) — dla serwisu.
     Czysta funkcja — test: klient-testy.js. */
  function wersjaDlaLudzi(klient, stempelAplikacji, aplikacja) {
    const s = String(stempelAplikacji || '');
    const k = klient || '?';
    const krotki = s && aplikacja && s.startsWith(aplikacja + '-') ? s.slice(aplikacja.length + 1) : s;
    return { tekst: 'wersja ' + (krotki || k), szczegoly: s ? `klient ${k} · aplikacja ${s}` : `klient ${k}` };
  }

  function wpiszWersje(element, aplikacja) {
    if (!element) return;
    const klient = (global.Hala && global.Hala.WERSJA) || '?';
    const wpisz = s => { const w = wersjaDlaLudzi(klient, s, aplikacja); element.textContent = w.tekst; element.title = w.szczegoly; };
    wpisz('');
    stempel(aplikacja).then(wpisz, () => {});
  }

  global.HalaAktualizacja = { pilnuj, opisWersji, wpiszWersje, wersjaDlaLudzi, zajetyWspolnie };
})(window);
