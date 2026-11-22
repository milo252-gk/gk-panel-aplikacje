/* Reakcje przy zleceniach i pracy (D77; nowy wygląd D89, 2026-11-19). Jeden kod dla GK Lider, GK Utrzymanie Ruchu, GK Kontrola
   Jakości i Panelu (STYL-GK §6b); ten sam plik jest kopią 1:1 `web/gk-reakcje.js` w GK Trasy i GK Flota (`.github/spojnosc.py`).

     HalaReakcje.sledz(hala)              // zwrot i niewykonane — przy otwarciu, odświeżeniu, co ok. 12 s (HalaZlecenia.sledz woła sam)
     HalaReakcje.poZrobieniu(hala, id)    // po „Zrobione” tej osoby: z zapasem czasu brawo, w terminie dobra, po terminie wkoncu
     HalaReakcje.pokaz('brawo' | 'dobra' | 'dopracuj' | 'zla' | 'wkoncu')
     HalaReakcje.ustawPamiec({ czytaj, zapisz })   // Trasy/Flota: pamięć „raz na zdarzenie” przez własną Pamiec (`gk-trasy.reakcje`)

   Pięć buziek (właściciel 2026-11-18: półpłaskie, spokojne, bez kciuków): rysunki to SVG liniowe jak ikony GK (`gk-ikony.js`) — kolory
   TYLKO z tokenów `--reakcja-*` w hala.css (ani jednego hexa w SVG; jasny i ciemny motyw działa sam).
     brawo    — oddanie z zapasem czasu albo cała checklista/trasa na czas (rzadka nagroda — nie dostaje jej każde „Zrobione”),
     dobra    — zrobione w terminie albo bez terminu,
     dopracuj — zwrot do poprawy,
     zla      — tylko awaria albo zwrot pozycji (jawne pokaz('zla')); zlecenie po terminie bez „Zrobione” i przepadnięte — bez reakcji,
     wkoncu   — „No, w końcu!”: zrobione po terminie.
   Nakładka nie blokuje pracy (pointer-events tylko na rysunku — dotknięcie albo Esc zamyka), znika sama. `aria-live` jest wstawiany
   PUSTY i wypełniany po chwili (czytnik ekranu ogłasza dopiero zmianę). Pokazuje się TYLKO w widocznej karcie — w karcie w tle
   zdarzenie NIE jest „zjadane” (zostaje na później). `prefers-reduced-motion` — sam zanik 150 ms. Dźwięk: GKDzwieki „reakcja” (raz).
   „Raz” na zdarzenie pamięta urządzenie (`hala.<app>.reakcje`, D33 — tylko klucze tej aplikacji), a od pierwszego uruchomienia tej wersji
   liczą się tylko nowe zdarzenia. Konto ekranu (monitor) — bez reakcji; wykonawca (lider, mistrz, mechanik, kontroler) widzi własną
   reakcję tak samo jak kierownik. Czyste funkcje (testy: wspolne/testy/reduktor-testy.js): rodzajZrobienia, doPokazania, moje. */
(function (global) {
  'use strict';

  const TEKSTY = { brawo: 'Brawo, na czas!', dobra: 'Dobra robota!', dopracuj: 'Dopracuj to!', zla: '', wkoncu: 'No, w końcu!' };
  const ARIA = { brawo: 'Brawo, na czas!', dobra: 'Dobra robota!', dopracuj: 'Dopracuj to!', zla: 'Niewykonane', wkoncu: 'No, w końcu!' };
  const POKAZ_MS = 1900;              // wejście 320 ms, chwila na przeczytanie, wyjście 240 ms od 1,45 s (hala.css)
  const TIK_MS = 12000;               // zła mina nie czeka na minutowy przegląd: sprawdzamy co ok. 12 s
  const MAKS_PAMIECI = 300;
  const DO_ZROBIENIA = ['nowe', 'przyjete'];
  const ZAPAS_MIN_MS = 10 * 60000;    // „brawo” wymaga zapasu co najmniej 10 minut i 25 % okna (od przyjęcia do terminu)
  const ZAPAS_UDZIAL = 0.25;

  const ms = t => { const x = Date.parse(t); return isNaN(x) ? null : x; };

  /* Czyje to zlecenie: wykonawca albo ta, która je przyjęła (zlecenie działu bez osoby — nikogo konkretnego). */
  function moje(z, ja) {
    const d = (z && z.dane) || {};
    return !!ja && (d.wykonawca === ja || d.przyjal === ja);
  }

  /* „Zrobione” tej osoby: 'wkoncu', gdy po terminie (termin minął przed wykonaniem albo zadanie zmianowe już przepadło —
     ta sama granica co „po terminie”/„przepadło” na ekranie działu); 'brawo', gdy oddane z zapasem (co najmniej 10 minut i 25 %
     okna od przyjęcia do terminu; zadanie zmianowe — do końca ważności); inaczej 'dobra'. */
  function rodzajZrobienia(z, teraz) {
    const d = (z && z.dane) || {};
    const kiedy = ms(d.czas_wykonania) || teraz;
    const termin = ms(d.termin), wazne = ms(d.wazne_do) || ms(d.czas_przepadniecia);
    const spoznione = (termin !== null && kiedy > termin) || (wazne !== null && kiedy > wazne);
    if (spoznione) return 'wkoncu';
    const koniec = termin !== null ? termin : wazne;
    if (koniec !== null) {
      const start = ms(d.od) || ms(d.czas_aktywacji) || ms(d.czas_przyjecia);
      const okno = start !== null && start < koniec ? koniec - start : 0;
      if (koniec - kiedy >= Math.max(ZAPAS_MIN_MS, okno * ZAPAS_UDZIAL)) return 'brawo';
    }
    return 'dobra';
  }

  /* Co pokazać teraz: [{klucz, rodzaj, id}] — tylko moje zlecenia zwrócone do poprawy ('dopracuj'). Zlecenie po terminie bez „Zrobione”
     i zlecenie, które przepadło, NIE dostają reakcji (ton: nie oceniamy osoby za samo spóźnienie; spóźnione „Zrobione” → 'wkoncu').
     'zla' pokazuje się tylko jawnie (awaria, zwrot pozycji) przez HalaReakcje.pokaz('zla').
     Tylko zdarzenia od chwili `od` (pierwsze uruchomienie z reakcjami) i jeszcze niepokazane (`widziane` — zbiór kluczy). Jedna
     reakcja danego rodzaju naraz wystarczy — reszta tylko się zapamiętuje (pierwsza na liście = najnowsze zdarzenie). */
  function doPokazania(lista, { ja, teraz, od, widziane }) {
    const wynik = [];
    const juz = widziane instanceof Set ? widziane : new Set(widziane || []);
    for (const z of lista || []) {
      if (!z || !moje(z, ja)) continue;
      const d = z.dane || {};
      const zwrot = ms(d.czas_zwrotu);
      if (DO_ZROBIENIA.includes(z.status) && zwrot !== null && zwrot >= od) {
        const klucz = `${z.id}|zwrot|${d.czas_zwrotu}`;
        if (!juz.has(klucz)) wynik.push({ klucz, rodzaj: 'dopracuj', id: z.id, kiedy: zwrot });
      }
    }
    return wynik.sort((a, b) => b.kiedy - a.kiedy);
  }

  // ---------------------------------------------------------------- pamięć urządzenia (per osoba)

  let adapter = null;                 // Trasy/Flota: { czytaj() → obiekt, zapisz(obiekt) } przez własną Pamiec
  const ustawPamiec = a => { adapter = a && a.czytaj && a.zapisz ? a : null; };

  // Klucz zawsze zaczyna się literałem 'hala.' (t_dostep.py pilnuje przedrostka we wszystkich plikach klienta — D33).
  const aplikacjaPamieci = hala => (hala && hala.aplikacja) || 'aplikacja';
  function czytaj(hala) {
    if (adapter) { try { return adapter.czytaj() || {}; } catch (e) { return {}; } }
    try { return JSON.parse(global.localStorage.getItem('hala.' + aplikacjaPamieci(hala) + '.reakcje') || '{}') || {}; } catch (e) { return {}; }
  }
  function zapisz(hala, p) {
    if (adapter) { try { adapter.zapisz(p); } catch (e) { /* trudno */ } return; }
    try { global.localStorage.setItem('hala.' + aplikacjaPamieci(hala) + '.reakcje', JSON.stringify(p)); } catch (e) { /* pełna pamięć — trudno */ }
  }
  /* Stan osoby: { od, widziane: [] } — `od` = pierwsze uruchomienie z reakcjami na TYM urządzeniu (`_od`, wspólne dla
     osób na wspólnym telefonie): zdarzenia sprzed niego się nie liczą, późniejsze — tak, także osoby, która loguje się tu
     pierwszy raz (zwrot z wczoraj zobaczy). */
  function stanOsoby(hala, ja, teraz) {
    const p = czytaj(hala);
    let zmiana = false;
    if (typeof p._od !== 'number') { p._od = teraz; zmiana = true; }
    if (!p[ja]) { p[ja] = { widziane: [] }; zmiana = true; }
    if (zmiana) zapisz(hala, p);
    return { od: p._od, widziane: p[ja].widziane || [] };
  }
  function oznacz(hala, ja, klucze) {
    if (!klucze.length) return;
    const p = czytaj(hala);
    const s = p[ja] || { widziane: [] };
    s.widziane = [...new Set([...(s.widziane || []), ...klucze])].slice(-MAKS_PAMIECI);
    p[ja] = s;
    zapisz(hala, p);
  }

  const ekran = hala => { const r = (hala.pracownik && hala.pracownik.role) || []; return !r.length || r.every(x => x === 'ekran'); };

  // ---------------------------------------------------------------- rysunki (SVG liniowe, kolory z tokenów w hala.css)

  /* Siatka 96, tarcza (48,48) r 38. Klasy: r-tarcza (wypełnienie i obrys), r-rys (kreska rysów), r-kropka (oczy), r-znaczek (kółko
     akcentu w prawym dolnym rogu) i r-znaczek-ikona (znak w kółku). Kolory i grubość linii: hala.css (`.hala-reakcja-<rodzaj>`). */
  const TARCZA = '<circle class="r-tarcza" cx="48" cy="48" r="38"/>';
  const ZNACZEK = glif => `<g class="r-znaczek-grupa"><circle class="r-znaczek" cx="76" cy="76" r="13"/>${glif}</g>`;
  const svg = wnetrze => `<svg viewBox="0 0 96 96" aria-hidden="true" focusable="false">${wnetrze}</svg>`;
  const RYSUNKI = {
    brawo: svg(`${TARCZA}
      <g class="r-oczy"><path class="r-rys r-oko" d="M26 44q7-9 14 0"/><path class="r-rys r-oko" d="M56 44q7-9 14 0"/></g>
      <path class="r-rys" d="M30 57q18 18 36 0"/>
      ${ZNACZEK('<path class="r-znaczek-ikona" d="M69.5 76.5l4 4 8-8"/>')}`),
    dobra: svg(`${TARCZA}
      <g class="r-oczy"><circle class="r-kropka" cx="35" cy="43" r="3.6"/><circle class="r-kropka" cx="61" cy="43" r="3.6"/></g>
      <path class="r-rys" d="M33 58q15 12 30 0"/>`),
    dopracuj: svg(`${TARCZA}
      <g class="r-brwi"><path class="r-rys" d="M26 38l12-5"/><path class="r-rys" d="M58 33l12 5"/></g>
      <g class="r-oczy"><circle class="r-kropka" cx="35" cy="47" r="3.6"/><circle class="r-kropka" cx="61" cy="47" r="3.6"/></g>
      <path class="r-rys" d="M36 65q12-7 24 0"/>
      ${ZNACZEK('<path class="r-znaczek-ikona" d="M71 82l1-4.5 8-8 3.5 3.5-8 8z"/>')}`),
    zla: svg(`${TARCZA}
      <g class="r-rumieniec"><ellipse class="r-kropka" cx="26" cy="58" rx="7" ry="4.5"/><ellipse class="r-kropka" cx="70" cy="58" rx="7" ry="4.5"/></g>
      <g class="r-brwi"><path class="r-rys" d="M27 34l15 8"/><path class="r-rys" d="M69 34l-15 8"/></g>
      <g class="r-oczy"><circle class="r-kropka" cx="36" cy="51" r="3.6"/><circle class="r-kropka" cx="60" cy="51" r="3.6"/></g>
      <path class="r-rys" d="M33 70q15-14 30 0"/>
      ${ZNACZEK('<path class="r-znaczek-ikona" d="M76 70v7M76 82.5h.01"/>')}`),
    wkoncu: svg(`${TARCZA}
      <path class="r-rys" d="M25 30q8-5 16-1"/><path class="r-rys" d="M55 31q8-3 16 1"/>
      <ellipse class="r-oko-kontur" cx="34" cy="45" rx="8" ry="9"/><ellipse class="r-oko-kontur" cx="62" cy="45" rx="8" ry="9"/>
      <g class="r-zrenice"><circle class="r-kropka" cx="34" cy="46" r="3.4"/><circle class="r-kropka" cx="62" cy="46" r="3.4"/></g>
      <path class="r-rys" d="M34 66l28-4"/>
      ${ZNACZEK('<path class="r-znaczek-ikona" d="M72 69h8M72 83h8M73.5 69v3l5 4-5 4v3M78.5 69v3l-5 4 5 4v3"/>')}`)
  };

  // ---------------------------------------------------------------- pokazywanie

  /* Karta widoczna? W karcie w tle reakcji nie pokazujemy i nie „zjadamy” zdarzenia — inaczej wspólna pamięć kart zapisałaby je
     jako widziane, a człowiek nic by nie zobaczył. Nadpisywalne (testy w schowanej przeglądarce). */
  let widocznaFn = () => { const d = global.document; return !d || !d.visibilityState || d.visibilityState === 'visible'; };
  const widoczna = () => widocznaFn();

  let zamknijBiezaca = null;
  function pokaz(rodzaj) {
    const doc = global.document;
    if (!doc || !RYSUNKI[rodzaj] || !widoczna()) return false;
    if (zamknijBiezaca) zamknijBiezaca();
    const el = doc.createElement('div');
    el.className = `hala-reakcja hala-reakcja-${rodzaj}`;
    // Region „na żywo” wstawiamy PUSTY i wypełniamy po chwili — czytnik ekranu ogłasza zmianę, a nie od razu gotowy region.
    el.innerHTML = `<div class="hala-reakcja-live" role="status" aria-live="polite"></div>` +
      `<button type="button" class="hala-reakcja-figura" aria-label="${ARIA[rodzaj]} — dotknij albo Esc, żeby zamknąć">${RYSUNKI[rodzaj]}${
        TEKSTY[rodzaj] ? `<span class="hala-reakcja-tekst">${TEKSTY[rodzaj]}</span>` : ''}</button>`;
    // Warstwa górna: nad otwartym oknem <dialog> (popover), inaczej zwykłe body — jak dymki aplikacji.
    (doc.body || doc.documentElement).appendChild(el);
    try { if (el.showPopover) { el.setAttribute('popover', 'manual'); el.showPopover(); } } catch (e) { /* stara przeglądarka */ }
    let zegar = null, zegarLive = null;
    const naEsc = e => { if (e.key === 'Escape' || e.key === 'Esc') zamknij(); };
    const zamknij = () => {
      clearTimeout(zegar); clearTimeout(zegarLive); doc.removeEventListener('keydown', naEsc, true);
      if (el.parentNode) el.parentNode.removeChild(el);
      if (zamknijBiezaca === zamknij) zamknijBiezaca = null;
    };
    el.querySelector('button').addEventListener('click', zamknij);
    doc.addEventListener('keydown', naEsc, true);
    zegarLive = setTimeout(() => { const l = el.querySelector('.hala-reakcja-live'); if (l) l.textContent = ARIA[rodzaj]; }, 120);
    zegar = setTimeout(zamknij, POKAZ_MS);
    zamknijBiezaca = zamknij;
    try { if (global.GKDzwieki) global.GKDzwieki.zagraj('reakcja'); } catch (e) { /* bez dźwięku */ }
    return true;
  }

  /* Po „Zrobione” tej osoby — od razu (obiekt ma już czas_wykonania z kolejki telefonu). Działa dla każdej roli wykonawczej
     (lider, mistrz, mechanik, kontroler, kierownik robiący zadanie w Panelu) — tylko konto ekranu jest pomijane. */
  function poZrobieniu(hala, id) {
    if (!hala || ekran(hala) || !hala.pracownik) return null;
    const z = hala.obiekt && hala.obiekt('zlecenie', id);
    if (!z) return null;
    const rodzaj = rodzajZrobienia(z, hala.teraz());
    oznacz(hala, hala.pracownik.id, [`${id}|zrobione`]);
    pokaz(rodzaj);
    return rodzaj;
  }

  /* Zwrot i niewykonane: przegląd przy starcie, po każdej zmianie zleceń (z opóźnieniem — paczka zdarzeń to jedno
     przejście), co ok. 12 s (termin mija bez żadnego zdarzenia) i po powrocie do karty. Kolejne reakcje — jedna po drugiej. */
  const sledzone = new WeakSet();
  function sledz(hala) {
    if (!hala || sledzone.has(hala)) return;
    sledzone.add(hala);
    let zegar = null;
    const kolejka = [];
    const nastepna = () => {
      if (!kolejka.length || !widoczna()) return;      // karta w tle: kolejka czeka, nic nie przepada
      const r = kolejka.shift();
      pokaz(r);
      if (kolejka.length) setTimeout(nastepna, POKAZ_MS + 400);
    };
    const przejrzyj = () => {
      if (!widoczna()) return;                         // nie oznaczaj jako widziane, gdy nikt nie patrzy
      if (!hala.zalogowany || !hala.zalogowany() || ekran(hala) || !hala.pracownik) return;
      const ja = hala.pracownik.id, teraz = hala.teraz();
      const s = stanOsoby(hala, ja, teraz);
      const lista = doPokazania(hala.obiekty('zlecenie'), { ja, teraz, od: s.od, widziane: s.widziane });
      if (!lista.length) return;
      oznacz(hala, ja, lista.map(r => r.klucz));
      const rodzaje = [...new Set(lista.map(r => r.rodzaj))];
      const pusto = !kolejka.length;
      for (const r of rodzaje) if (!kolejka.includes(r)) kolejka.push(r);
      if (pusto) nastepna();
    };
    const pozniej = () => { clearTimeout(zegar); zegar = setTimeout(przejrzyj, 800); };
    hala.na('sesja', pozniej);
    hala.na('zmiana', ({ typ }) => { if (typ === 'zlecenie' || typ === '*') pozniej(); });
    if (global.document && global.document.addEventListener) global.document.addEventListener('visibilitychange', () => { if (widoczna()) { nastepna(); pozniej(); } });
    setInterval(przejrzyj, TIK_MS);
    pozniej();
  }

  const HalaReakcje = { sledz, poZrobieniu, pokaz, rodzajZrobienia, doPokazania, moje, TEKSTY, ARIA, RYSUNKI, ustawPamiec, stanOsoby, oznacz, widoczna,
                        ustawWidocznosc: f => { widocznaFn = typeof f === 'function' ? f : widocznaFn; } };
  global.HalaReakcje = HalaReakcje;
  if (typeof module !== 'undefined' && module.exports) module.exports = HalaReakcje;
})(typeof window !== 'undefined' ? window : globalThis);
