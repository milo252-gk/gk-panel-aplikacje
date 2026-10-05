/* Panel Kierownika — etykiety QR do druku (2026-09-28). Bez naklejek z kodami HALA:L/S/M na liniach, stanowiskach
   i maszynach nie ruszą obchody ze skanem ani zgłoszenia awarii ze skanu, więc drukuje je administrator z Panelu.

   Kod QR robi koder z biblioteki ZXing (wspolne/klient/skaner-zxing.js — ta sama, która je czyta; licencja Apache-2.0),
   rysujemy go sami jako SVG: ostry w druku w każdym rozmiarze, bez obrazków i bez sieci.
   Czyste funkcje (testy: panel/testy/widok-testy.js — kod zakodowany i odczytany z powrotem przez ZXing). */

(function (global) {
  'use strict';

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Macierz modułów QR: tablica wierszy z 0/1. Poziom korekcji M (15 %) — naklejka na hali bywa porysowana. */
  function macierz(tekst, ZX) {
    const kod = ZX.QRCodeEncoder.encode(String(tekst), ZX.QRCodeDecoderErrorCorrectionLevel.fromString('M'), null);
    const m = kod.getMatrix();
    const wynik = [];
    for (let y = 0; y < m.getHeight(); y++) {
      const wiersz = [];
      for (let x = 0; x < m.getWidth(); x++) wiersz.push(m.get(x, y) === 1 ? 1 : 0);
      wynik.push(wiersz);
    }
    return wynik;
  }

  /* SVG kodu z marginesem 4 modułów (wymóg normy — skaner potrzebuje ciszy dookoła). Jedna ścieżka zamiast
     setek prostokątów, crispEdges — bez rozmytych krawędzi w druku. */
  function svgQR(tekst, ZX) {
    const m = macierz(tekst, ZX), n = m.length, MARGINES = 4, bok = n + 2 * MARGINES;
    let d = '';
    m.forEach((wiersz, y) => wiersz.forEach((v, x) => { if (v) d += `M${x + MARGINES} ${y + MARGINES}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bok} ${bok}" shape-rendering="crispEdges" role="img" aria-label="${esc(tekst)}">`
      + `<rect width="${bok}" height="${bok}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  const RODZAJE = { linie: ['L', 'Linia'], stanowiska: ['S', 'Stanowisko'], maszyny: ['M', 'Maszyna'] };

  /* Co drukujemy: pozycje wybranych słowników dla wybranych linii (pusta lista = wszystkie), w kolejności linii,
     w linii: linia → stanowiska → maszyny. Kod QR z pola „qr” słownika (kody zastane w zakładzie), inaczej HALA:<litera>:<kod>. */
  function pozycje(slowniki, { linie, rodzaje }) {
    const sl = slowniki || {};
    const kolejnosc = Object.entries(sl.linie || {}).sort(([ka, a], [kb, b]) => ((a || {}).kolejnosc || 999) - ((b || {}).kolejnosc || 999) || ka.localeCompare(kb));
    const wybrane = new Set(linie && linie.length ? linie : kolejnosc.map(([k]) => k));
    const wynik = [];
    for (const [kodLinii, l] of kolejnosc) {
      if (!wybrane.has(kodLinii)) continue;
      const liniaNazwa = (l && l.nazwa) || kodLinii;
      for (const rodzaj of ['linie', 'stanowiska', 'maszyny']) {
        if (!(rodzaje || []).includes(rodzaj)) continue;
        const wpisy = rodzaj === 'linie' ? [[kodLinii, l]] : Object.entries(sl[rodzaj] || {}).filter(([, w]) => (w || {}).linia === kodLinii);
        for (const [kod, w] of wpisy.sort(([a], [b]) => a.localeCompare(b))) {
          wynik.push({ rodzaj, rodzajNazwa: RODZAJE[rodzaj][1], kod, nazwa: (w && w.nazwa) || kod, liniaNazwa,
                       qr: (w && w.qr) || `HALA:${RODZAJE[rodzaj][0]}:${kod}` });
        }
      }
    }
    return wynik;
  }

  /* Arkusz do druku: siatka naklejek (CSS w panel.css → @media print). */
  function arkusz(lista, ZX) {
    return lista.map(p => `
      <div class="etykieta etykieta-${p.rodzaj}">
        <div class="etykieta-qr">${svgQR(p.qr, ZX)}</div>
        <div class="etykieta-opis">
          <div class="etykieta-kod">${esc(p.kod)}</div>
          <div class="etykieta-nazwa">${esc(p.nazwa)}</div>
          <div class="etykieta-linia">${esc(p.rodzaj === 'linie' ? 'Linia' : `${p.rodzajNazwa} · ${p.liniaNazwa}`)}</div>
          <div class="etykieta-tekst">${esc(p.qr)}</div>
        </div>
      </div>`).join('');
  }

  const PanelEtykiety = { macierz, svgQR, pozycje, arkusz };
  global.PanelEtykiety = PanelEtykiety;
  if (typeof module !== 'undefined' && module.exports) module.exports = PanelEtykiety;
})(typeof window !== 'undefined' ? window : globalThis);
