/* Reakcje kierownika przy zleceniach (D77, właściciel 2026-10-19: „Reakcje są fajne, ale zbliż je wyglądem do emoji.
   Teksty: zrobione — »Dobra robota!«, zwrócone — »Dopracuj to!«, niewykonane — czerwieniejąca się, zła mina kierownika,
   bez tekstu. Wykonane po terminie — »No, w końcu!«”). Jeden kod dla GK Lider, GK Utrzymanie Ruchu, GK Kontrola Jakości
   i Panelu (STYL-GK §6b):

     HalaReakcje.sledz(hala)              // zwrot i niewykonane — przy otwarciu, odświeżeniu i co minutę (HalaZlecenia.sledz woła sam)
     HalaReakcje.poZrobieniu(hala, id)    // po „Zrobione” tej osoby: w terminie 👍, po terminie 🙄 (zlecenia.js woła sam)
     HalaReakcje.pokaz('dobra' | 'dopracuj' | 'zla' | 'wkoncu')

   Rysunki to SVG (na każdym telefonie tak samo — znaki emoji systemu wyglądają wszędzie inaczej), barwy od właściciela:
   żółty #FFCC4D, obrys #C28B00, oczy/brwi/usta #5B2A00. Nakładka nie blokuje pracy (pointer-events tylko na rysunku —
   dotknięcie zamyka), znika sama; `prefers-reduced-motion` — bez ruchu (hala.css). Dźwięk: GKDzwieki „reakcja” (jeden
   dla czterech, z przełącznikiem aplikacji). „Raz” na zdarzenie pamięta urządzenie (`hala.<app>.reakcje`, D33 — tylko
   klucze tej aplikacji), a od pierwszego uruchomienia tej wersji liczą się tylko nowe zdarzenia: po aktualizacji nikt nie
   dostaje 20 złych min za stare zlecenia. Konto ekranu (monitor) — bez reakcji.
   Czyste funkcje (testy: wspolne/testy/reduktor-testy.js): rodzajZrobienia, doPokazania, moje. */
(function (global) {
  'use strict';

  const TEKSTY = { dobra: 'Dobra robota!', dopracuj: 'Dopracuj to!', zla: '', wkoncu: 'No, w końcu!' };
  const ARIA = { dobra: 'Dobra robota!', dopracuj: 'Dopracuj to!', zla: 'Zadanie niewykonane', wkoncu: 'No, w końcu!' };
  const POKAZ_MS = 1900;              // ok. 1,5 s ruchu + chwila na przeczytanie; potem znika (hala.css: zanikanie od 1,45 s)
  const MAKS_PAMIECI = 300;
  const DO_ZROBIENIA = ['nowe', 'przyjete'];

  const ms = t => { const x = Date.parse(t); return isNaN(x) ? null : x; };

  /* Czyje to zlecenie: wykonawca albo ta, która je przyjęła (zlecenie działu bez osoby — nikogo konkretnego). */
  function moje(z, ja) {
    const d = (z && z.dane) || {};
    return !!ja && (d.wykonawca === ja || d.przyjal === ja);
  }

  /* „Zrobione” tej osoby: 'wkoncu', gdy po terminie (termin minął przed wykonaniem albo zadanie zmianowe już przepadło —
     ta sama granica co „po terminie”/„przepadło” na ekranie działu), inaczej 'dobra'. */
  function rodzajZrobienia(z, teraz) {
    const d = (z && z.dane) || {};
    const kiedy = ms(d.czas_wykonania) || teraz;
    const termin = ms(d.termin), wazne = ms(d.wazne_do) || ms(d.czas_przepadniecia);
    const spoznione = (termin !== null && kiedy > termin) || (wazne !== null && kiedy > wazne);
    return spoznione ? 'wkoncu' : 'dobra';
  }

  /* Co pokazać teraz: [{klucz, rodzaj, id}] — moje zlecenia zwrócone do poprawy ('dopracuj') i niewykonane w czasie
     ('zla': po terminie bez „Zrobione” albo przepadło). Tylko zdarzenia od chwili `od` (pierwsze uruchomienie z reakcjami)
     i jeszcze niepokazane (`widziane` — zbiór kluczy). Jedna reakcja danego rodzaju naraz wystarczy — reszta tylko się
     zapamiętuje (pierwsza na liście = najnowsze zdarzenie). */
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
      const termin = ms(d.termin);
      const przepadlo = z.status === 'przepadlo' ? (ms(d.czas_przepadniecia) || ms(d.wazne_do)) : null;
      const poTerminie = DO_ZROBIENIA.includes(z.status) && termin !== null && termin < teraz ? termin : null;
      // Zwrot po terminie liczy się od zwrotu (nowy termin mógł nie przyjść) — wtedy dopiero „Dopracuj”, nie od razu zła mina.
      const kiedyZle = przepadlo !== null ? przepadlo : poTerminie !== null && (zwrot === null || zwrot < poTerminie) ? poTerminie : null;
      if (kiedyZle !== null && kiedyZle >= od) {
        const klucz = `${z.id}|zla`;
        if (!juz.has(klucz)) wynik.push({ klucz, rodzaj: 'zla', id: z.id, kiedy: kiedyZle });
      }
    }
    return wynik.sort((a, b) => b.kiedy - a.kiedy);
  }

  // ---------------------------------------------------------------- pamięć urządzenia (per osoba)

  // Klucz zawsze zaczyna się literałem 'hala.' (t_dostep.py pilnuje przedrostka we wszystkich plikach klienta — D33).
  const aplikacjaPamieci = hala => (hala && hala.aplikacja) || 'aplikacja';
  function czytaj(hala) {
    try { return JSON.parse(global.localStorage.getItem('hala.' + aplikacjaPamieci(hala) + '.reakcje') || '{}') || {}; } catch (e) { return {}; }
  }
  function zapisz(hala, p) {
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

  // ---------------------------------------------------------------- rysunki (SVG, barwy od właściciela)

  const Z = '#FFCC4D', O = '#C28B00', B = '#5B2A00';
  const KCIUK = `<g class="r-kciuk">
      <rect x="12" y="56" width="20" height="48" rx="5" fill="${O}"/>
      <path d="M34 60 L48 60 L58 32 C60 22 70 17 77 23 C82 28 80 35 78 42 L73 56 L94 56 C102 56 106 63 104 69 L97 96 C95 102 90 105 84 105 L34 105 Z"
        fill="${Z}" stroke="${O}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M76 69 H101 M74 81 H98 M72 93 H94" stroke="${O}" stroke-width="3.5" stroke-linecap="round" fill="none"/></g>`;
  const RYSUNKI = {
    dobra: `<svg viewBox="0 0 120 120" aria-hidden="true">${KCIUK}</svg>`,
    // Odwrócenie w CSS (.r-dol, obrót wokół środka rysunku) — atrybut transform gryzł się z transform-box z hala.css
    // i kciuk lądował pod tekstem (próba w przeglądarce 2026-10-19).
    dopracuj: `<svg viewBox="0 0 120 120" aria-hidden="true"><g class="r-dol">${KCIUK}</g></svg>`,
    zla: `<svg viewBox="0 0 120 120" aria-hidden="true">
      <g class="r-para r-para-l"><circle cx="12" cy="60" r="6" fill="#B4B2A9"/><circle cx="7" cy="45" r="8" fill="#B4B2A9"/></g>
      <g class="r-para r-para-p"><circle cx="108" cy="60" r="6" fill="#B4B2A9"/><circle cx="113" cy="45" r="8" fill="#B4B2A9"/></g>
      <circle class="r-czerwienieje" cx="60" cy="62" r="44" fill="${Z}" stroke="${O}" stroke-width="4"/>
      <path d="M33 43 L53 53 M87 43 L67 53" stroke="${B}" stroke-width="6" stroke-linecap="round"/>
      <ellipse cx="46" cy="64" rx="5" ry="7" fill="${B}"/><ellipse cx="74" cy="64" rx="5" ry="7" fill="${B}"/>
      <path d="M41 93 Q60 76 79 93" stroke="${B}" stroke-width="6" fill="none" stroke-linecap="round"/></svg>`,
    wkoncu: `<svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="62" r="44" fill="${Z}" stroke="${O}" stroke-width="4"/>
      <path d="M31 39 Q42 33 53 37 M67 37 Q78 33 89 39" stroke="${B}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <ellipse cx="45" cy="56" rx="11" ry="13" fill="#FFFFFF" stroke="${B}" stroke-width="2"/>
      <ellipse cx="75" cy="56" rx="11" ry="13" fill="#FFFFFF" stroke="${B}" stroke-width="2"/>
      <g class="r-zrenice"><circle cx="45" cy="60" r="5.5" fill="${B}"/><circle cx="75" cy="60" r="5.5" fill="${B}"/></g>
      <path d="M47 88 Q60 84 73 87" stroke="${B}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <g class="r-wydech" fill="none" stroke="#378ADD" stroke-width="3.5" stroke-linecap="round">
        <path d="M76 90 q9 3 15 -1"/><path d="M80 98 q8 3 14 0"/></g></svg>`,
  };

  let zamknijBiezaca = null;
  function pokaz(rodzaj) {
    const doc = global.document;
    if (!doc || !RYSUNKI[rodzaj]) return false;
    if (zamknijBiezaca) zamknijBiezaca();
    const el = doc.createElement('div');
    el.className = `hala-reakcja hala-reakcja-${rodzaj}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `<button type="button" class="hala-reakcja-figura" aria-label="${ARIA[rodzaj]} — dotknij, żeby zamknąć">${RYSUNKI[rodzaj]}${
      TEKSTY[rodzaj] ? `<span class="hala-reakcja-tekst">${TEKSTY[rodzaj]}</span>` : ''}</button>`;
    // Warstwa górna: nad otwartym oknem <dialog> (popover), inaczej zwykłe body — jak dymki aplikacji.
    (doc.body || doc.documentElement).appendChild(el);
    try { if (el.showPopover) { el.setAttribute('popover', 'manual'); el.showPopover(); } } catch (e) { /* stara przeglądarka */ }
    let zegar = null;
    const zamknij = () => { clearTimeout(zegar); if (el.parentNode) el.parentNode.removeChild(el); if (zamknijBiezaca === zamknij) zamknijBiezaca = null; };
    el.querySelector('button').addEventListener('click', zamknij);
    zegar = setTimeout(zamknij, POKAZ_MS);
    zamknijBiezaca = zamknij;
    try { if (global.GKDzwieki) global.GKDzwieki.zagraj('reakcja'); } catch (e) { /* bez dźwięku */ }
    return true;
  }

  /* Po „Zrobione” tej osoby — od razu (obiekt ma już czas_wykonania z kolejki telefonu). */
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
     przejście) i co minutę (termin mija bez żadnego zdarzenia). Kolejne reakcje — jedna po drugiej, nie naraz. */
  const sledzone = new WeakSet();
  function sledz(hala) {
    if (!hala || sledzone.has(hala)) return;
    sledzone.add(hala);
    let zegar = null;
    const kolejka = [];
    const nastepna = () => { const r = kolejka.shift(); if (r) { pokaz(r); if (kolejka.length) setTimeout(nastepna, POKAZ_MS + 400); } };
    const przejrzyj = () => {
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
    setInterval(przejrzyj, 60000);
    pozniej();
  }

  const HalaReakcje = { sledz, poZrobieniu, pokaz, rodzajZrobienia, doPokazania, moje, TEKSTY, RYSUNKI };
  global.HalaReakcje = HalaReakcje;
  if (typeof module !== 'undefined' && module.exports) module.exports = HalaReakcje;
})(typeof window !== 'undefined' ? window : globalThis);
