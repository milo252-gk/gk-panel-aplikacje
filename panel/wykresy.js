/* Panel Kierownika — wykresy do Wskaźników (właściciel 2026-10-27: „dodaj wykresy, słupki, koła”).

   Czyste funkcje: dane → tekst SVG/HTML (bez DOM, bez sieci), więc da się je testować w widok-testy.js. Kolory tylko z tokenów
   hala.css (jasny i ciemny motyw sam się zgadza). Kolory statusów (zielony = w terminie, czerwony = po terminie) są zarezerwowane
   dla statusów; kategorie (wady) idą w stałej kolejności niebieski → pomarańczowy → grafit → szary, a „Inne” jest jasnoszare.
   Każdy wykres ma legendę z liczbami (kolor nie jest jedynym nośnikiem — są też liczby i procenty), podpowiedź przy najechaniu
   (<title>) i opis dla czytników ekranu. Bez bibliotek — SVG w HTML, jedna oś, cienkie znaczniki, spokojna siatka. */

(function (global) {
  'use strict';

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KOLORY_KATEGORII = ['var(--niebieski)', 'var(--pomarancz-ciemny)', 'var(--grafit-jasny)', 'var(--szary)'];
  const KOLOR_INNE = 'var(--ramka-mocna, #c7c7cb)';
  const skrot = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
  const procent = (a, b) => (b ? Math.round(a * 1000 / b) / 10 : 0);

  /* Koło (pierścień): segmenty [{ nazwa, ile, kolor }], pomija zera. opcje: { tytul, srodek (napis w środku), podpis (pod środkiem) }.
     Zwraca { html, suma }. Pusty zestaw → html pusty (wywołujący pokazuje „brak danych”). */
  function kolo(segmenty, opcje) {
    const o = opcje || {};
    const dane = (segmenty || []).filter(s => s && s.ile > 0);
    const suma = dane.reduce((n, s) => n + s.ile, 0);
    if (!suma) return { html: '', suma: 0 };
    const R = 70, r = 46, c = 90;                                   // promień zewnętrzny i wewnętrzny, środek (viewBox 180×180)
    let kat = -Math.PI / 2;
    const luk = (a0, a1) => {
      const duzy = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rr, a) => `${(c + rr * Math.cos(a)).toFixed(2)} ${(c + rr * Math.sin(a)).toFixed(2)}`;
      return `M ${p(R, a0)} A ${R} ${R} 0 ${duzy} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${duzy} 0 ${p(r, a0)} Z`;
    };
    const kawalki = dane.map(s => {
      const a0 = kat, a1 = kat + (s.ile / suma) * Math.PI * 2 - (dane.length > 1 ? 0.02 : 0);     // 2 px odstępu między kawałkami
      kat += (s.ile / suma) * Math.PI * 2;
      const opis = `${s.nazwa}: ${s.ile} (${String(procent(s.ile, suma)).replace('.', ',')} %)`;
      if (dane.length === 1) return `<circle cx="${c}" cy="${c}" r="${(R + r) / 2}" fill="none" stroke="${s.kolor}" stroke-width="${R - r}"><title>${esc(opis)}</title></circle>`;
      return `<path d="${luk(a0, a1)}" fill="${s.kolor}"><title>${esc(opis)}</title></path>`;
    }).join('');
    const legenda = dane.map(s => `<li><span class="wykres-kropka" style="background:${s.kolor}" aria-hidden="true"></span>
      <span class="wykres-nazwa">${esc(s.nazwa)}</span> <b>${s.ile}</b> <span class="slaby">${String(procent(s.ile, suma)).replace('.', ',')} %</span></li>`).join('');
    const opisCaly = dane.map(s => `${s.nazwa} ${s.ile}`).join(', ');
    return { suma, html: `<figure class="wykres wykres-kolo" aria-label="${esc(`${o.tytul || 'Wykres kołowy'}: ${opisCaly}`)}">
      <svg viewBox="0 0 180 180" role="img" aria-hidden="true" class="wykres-svg">${kawalki}
        <text x="${c}" y="${o.podpis ? c - 2 : c + 7}" text-anchor="middle" class="wykres-srodek">${esc(o.srodek === undefined ? suma : o.srodek)}</text>
        ${o.podpis ? `<text x="${c}" y="${c + 16}" text-anchor="middle" class="wykres-podpis">${esc(o.podpis)}</text>` : ''}</svg>
      <ul class="wykres-legenda">${legenda}</ul></figure>` };
  }

  /* Kolumny pionowe (jedna seria): dane [{ nazwa, wartosc, etykieta?, opis? }]; opcje: { tytul, jednostka, format (wartość → tekst), maks }.
     Nazwy pod kolumnami skrócone (pełna w podpowiedzi), wartości nad kolumnami; spokojna siatka w 3 poziomach. */
  function kolumny(dane, opcje) {
    const o = opcje || {};
    const lista = (dane || []).filter(d => d && d.wartosc > 0);
    if (!lista.length) return { html: '' };
    const fmt = o.format || (v => String(v));
    const maks = o.maks || Math.max(...lista.map(d => d.wartosc));
    const W = Math.max(280, 54 * lista.length + 50), H = 190, dol = 150, gora = 22, lewo = 8;
    const szer = (W - lewo - 8) / lista.length;
    const wys = v => ((dol - gora) * v) / maks;
    const siatka = [0.5, 1].map(u => `<line x1="${lewo}" x2="${W - 8}" y1="${(dol - wys(maks * u)).toFixed(1)}" y2="${(dol - wys(maks * u)).toFixed(1)}" class="wykres-siatka"/>`).join('');
    const slupki = lista.map((d, i) => {
      const x = lewo + i * szer + szer * 0.22, w = szer * 0.56, h = Math.max(2, wys(d.wartosc)), y = dol - h;
      const opis = d.opis || `${d.nazwa}: ${d.etykieta || fmt(d.wartosc)}`;
      return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${d.kolor || 'var(--niebieski)'}"><title>${esc(opis)}</title></rect>
        <text x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" class="wykres-wartosc">${esc(d.etykieta || fmt(d.wartosc))}</text>
        <text x="${(x + w / 2).toFixed(1)}" y="${dol + 14}" text-anchor="middle" class="wykres-os">${esc(skrot(d.nazwa, szer > 70 ? 14 : 9))}<title>${esc(d.nazwa)}</title></text></g>`;
    }).join('');
    const opisCaly = lista.map(d => `${d.nazwa} ${d.etykieta || fmt(d.wartosc)}`).join(', ');
    return { html: `<figure class="wykres wykres-kolumny" aria-label="${esc(`${o.tytul || 'Wykres słupkowy'}: ${opisCaly}`)}">
      <div class="wykres-przewijanie"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-hidden="true" class="wykres-svg">${siatka}
        <line x1="${lewo}" x2="${W - 8}" y1="${dol}" y2="${dol}" class="wykres-oska"/>${slupki}</svg></div></figure>` };
  }

  /* Kolumny piętrowe: wiersze [{ nazwa, czesci: [{ nazwa, ile, kolor }] }] — np. zlecenia działu: w terminie + po terminie.
     Segmenty rozdziela 2 px przerwy; legenda z nazwami części u góry. */
  function kolumnyPietrowe(wiersze, opcje) {
    const o = opcje || {};
    const lista = (wiersze || []).filter(w => w && (w.czesci || []).some(c => c.ile > 0));
    if (!lista.length) return { html: '' };
    const maks = Math.max(...lista.map(w => w.czesci.reduce((n, c) => n + c.ile, 0)));
    const W = Math.max(280, 70 * lista.length + 50), H = 190, dol = 150, gora = 22, lewo = 8;
    const szer = (W - lewo - 8) / lista.length;
    const wys = v => ((dol - gora) * v) / maks;
    const slupki = lista.map((w, i) => {
      const x = lewo + i * szer + szer * 0.2, sz = szer * 0.6;
      let y = dol;
      const suma = w.czesci.reduce((n, c) => n + c.ile, 0);
      const kawalki = w.czesci.filter(c => c.ile > 0).map(c => {
        const h = Math.max(2, wys(c.ile) - 2);
        y -= h + 2;
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${sz.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${c.kolor}"><title>${esc(`${w.nazwa} — ${c.nazwa}: ${c.ile}`)}</title></rect>`;
      }).join('');
      return `<g>${kawalki}<text x="${(x + sz / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" class="wykres-wartosc">${suma}</text>
        <text x="${(x + sz / 2).toFixed(1)}" y="${dol + 14}" text-anchor="middle" class="wykres-os">${esc(skrot(w.nazwa, 12))}<title>${esc(w.nazwa)}</title></text></g>`;
    }).join('');
    const czesci = [];
    for (const w of lista) for (const c of w.czesci) if (!czesci.some(x => x.nazwa === c.nazwa)) czesci.push(c);
    const legenda = czesci.map(c => `<li><span class="wykres-kropka" style="background:${c.kolor}" aria-hidden="true"></span>${esc(c.nazwa)}</li>`).join('');
    const opisCaly = lista.map(w => `${w.nazwa}: ${w.czesci.map(c => `${c.nazwa} ${c.ile}`).join(', ')}`).join('; ');
    return { html: `<figure class="wykres wykres-kolumny" aria-label="${esc(`${o.tytul || 'Wykres słupkowy'}: ${opisCaly}`)}">
      <ul class="wykres-legenda wykres-legenda-pozioma">${legenda}</ul>
      <div class="wykres-przewijanie"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-hidden="true" class="wykres-svg">
        <line x1="${lewo}" x2="${W - 8}" y1="${dol}" y2="${dol}" class="wykres-oska"/>${slupki}</svg></div></figure>` };
  }

  /* Kategorie koła: n największych w stałej kolejności kolorów, reszta zbita w „Inne”. */
  function kategorie(pozycje, ileMax) {
    const sorted = (pozycje || []).filter(p => p && p.ile > 0).slice().sort((a, b) => b.ile - a.ile);
    const n = ileMax || KOLORY_KATEGORII.length;
    const wynik = sorted.slice(0, n).map((p, i) => ({ nazwa: p.nazwa, ile: p.ile, kolor: KOLORY_KATEGORII[i % KOLORY_KATEGORII.length] }));
    const reszta = sorted.slice(n).reduce((s, p) => s + p.ile, 0);
    if (reszta) wynik.push({ nazwa: 'Inne', ile: reszta, kolor: KOLOR_INNE });
    return wynik;
  }

  const PanelWykresy = { kolo, kolumny, kolumnyPietrowe, kategorie, KOLORY_KATEGORII };
  global.PanelWykresy = PanelWykresy;
  if (typeof module !== 'undefined' && module.exports) module.exports = PanelWykresy;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
