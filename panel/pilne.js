/* Panel Zarządczy GK — „Widziałem” przy wpisie „Pilne od zespołu” na Pulpicie (właściciel 2026-11-26: wpis wisiał 48 h; „Widziałem”
   chowa tę jedną pozycję u tej osoby). Osobny plik, żeby Pulpit (panel.js) zmieniał się o trzy wywołania.

   Pamięć urządzenia, nie serwer: hub nie ma odczytów/potwierdzeń pilnych (świadomie — „tylko informacja, bez potwierdzania”), a dopisanie
   zdarzenia zmieniłoby kontrakt. Klucz `hala.panel.pilneWidziane.<id osoby>` (lista kluczy wpisów, JSON) — tylko przedrostek `hala.panel.`
   (wspólne źródło na Pages), inne klucze bez zmian. Klucz wpisu = zlecenie | pozycja | czas pilnego, więc ponowne „Pilne” tej samej pozycji
   (nowy czas) pokazuje się znowu. Wpisy starsze niż okno Pulpitu (48 h) i tak znikają, więc lista jest przycinana do ostatnich 200. */
(function (global) {
  'use strict';

  const MAKS = 200;
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Czyste funkcje (testy: panel/testy/widok-testy.js). */
  const kluczWpisu = w => `${(w && w.id) || ''}|${(w && w.pozycja) || ''}|${(w && w.ms) || 0}`;
  function bezWidzianych(wiersze, widziane) {
    const zbior = widziane instanceof Set ? widziane : new Set(widziane || []);
    return (wiersze || []).filter(w => !zbior.has(kluczWpisu(w)));
  }
  function dopisz(lista, klucz) {
    const l = (Array.isArray(lista) ? lista : []).filter(k => k !== klucz);
    l.push(klucz);
    return l.slice(-MAKS);
  }

  /* Pamięć urządzenia — localStorage bywa niedostępny (tryb prywatny); wtedy „Widziałem” działa do odświeżenia strony. */
  const wPamieci = {};
  function widziane(ja) {
    if (!ja) return [];
    try { const t = global.localStorage.getItem('hala.panel.pilneWidziane.' + ja); if (t) return JSON.parse(t) || []; } catch (e) { /* bez pamięci */ }
    return wPamieci[ja] || [];
  }
  function oznacz(ja, klucz) {
    if (!ja || !klucz) return;
    const l = dopisz(widziane(ja), klucz);
    wPamieci[ja] = l;
    try { global.localStorage.setItem('hala.panel.pilneWidziane.' + ja, JSON.stringify(l)); } catch (e) { /* zostaje w wPamieci */ }
  }

  /* Przycisk na wpisie (cel dotyku 44 px na telefonie — panel.css .pilne-wpis .widzialem). */
  const przycisk = w => `<button type="button" class="maly widzialem" data-widzialem="${esc(kluczWpisu(w))}" title="Schowaj ten wpis u siebie — wróci, gdy przyjdzie nowe pilne">Widziałem</button>`;

  global.PanelPilne = { kluczWpisu, bezWidzianych, dopisz, widziane, oznacz, przycisk, MAKS };
})(typeof window !== 'undefined' ? window : globalThis);
