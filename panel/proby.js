/* Panel Kierownika — próby jakościowe (D56, właściciel 2026-10-13: „dodaj widoczność prób jakościowych dla admina /
   kierownika zakładu”). Raporty → 🔬 Próby jakościowe: próby liderów i KJ od najnowszej — miejsce (maszyna ze skanu
   albo stanowisko), kto, sprawdzone, braki, %, wady, zdjęcia, wnioski. Dziś i wczoraj z pamięci Panelu (2 doby),
   dłuższy okres z serwera (GET /api/v1/stan/proba?od=). Czysta funkcja: W.listaProb (widok.js). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;
  const DOBA = 86400000;
  const filtr = { okres: 1, zrodlo: '' };
  const zSerwera = new Map();          // od (ISO) → {lista, blad}
  const wToku = new Set();

  async function pobierz(odIso) {
    if (wToku.has(odIso)) return;
    wToku.add(odIso);
    try {
      const w = await hala.zapytaj('GET', `/api/v1/stan/proba?od=${encodeURIComponent(odIso)}&limit=5000`);
      zSerwera.set(odIso, { lista: w.obiekty || [] });
      setTimeout(() => zSerwera.delete(odIso), 5 * 60000);
    } catch (e) {
      zSerwera.set(odIso, { lista: null, blad: P.komunikatBledu(e) });
      setTimeout(() => zSerwera.delete(odIso), 60000);
    } finally { wToku.delete(odIso); P.narysuj(); }
  }

  function rysuj(d) {
    const el = $('lista-prob');
    const teraz = d.teraz;
    const l = Hala.lokalny(teraz);
    // Początek okresu: północ zakładu „dni” temu (dziś i wczoraj = 1 dzień wstecz).
    const od = Hala.zLokalnego(l.rok, l.miesiac, l.dzien - filtr.okres, 0, 0);
    let lista = hala.obiekty('proba');
    if (od < teraz - 2 * DOBA) {
      const odIso = new Date(od).toISOString();
      const z = zSerwera.get(odIso);
      if (!z) { el.innerHTML = '<p class="pusto">Wczytuję próby z serwera…</p>'; pobierz(odIso); return; }
      if (!z.lista) { el.innerHTML = `<p class="pusto">${esc(z.blad || 'Brak danych z serwera.')}</p>`; return; }
      const jest = new Set(lista.map(x => x.id));
      lista = lista.concat(z.lista.filter(x => !jest.has(x.id)));
    }
    const wiersze = W.listaProb({ proby: lista, slowniki: d.slowniki, pracownicy: d.pracownicy, od, zrodlo: filtr.zrodlo });
    const suma = wiersze.reduce((s, w) => ({ spr: s.spr + w.sprawdzone, br: s.br + w.braki }), { spr: 0, br: 0 });
    el.innerHTML = wiersze.length ? `<p class="slaby">${wiersze.length} ${wiersze.length === 1 ? 'próba' : 'prób'} · sprawdzone ${suma.spr} · braki ${suma.br}${suma.spr ? ` (${W.procent(Math.round(suma.br * 1000 / suma.spr) / 10)} %)` : ''}</p>
      ${wiersze.map(w => `<article class="zlecenie ${w.braki ? 'po-terminie' : ''}">
        <div class="opis">
          <div class="tytul"><b>${esc(w.miejsce || '—')}</b> <span class="znacznik neutral">${esc(w.zrodloNazwa)}</span> <span class="slaby">${esc(w.kto)}</span></div>
          <div class="szczegoly"><span>sprawdzone ${w.sprawdzone}</span><span class="${w.braki ? 'tekst-alarm' : ''}">· braki ${w.braki}${w.proc !== null ? ` (${esc(W.procent(w.proc))} %)` : ''}</span>
            ${w.wady ? `<span>· ${esc(w.wady)}</span>` : ''}</div>
          ${w.wnioski ? `<div class="slaby tekst-opisu">Wnioski: ${esc(w.wnioski)}</div>` : ''}
          ${w.dzialania ? `<div class="slaby tekst-opisu">Działania: ${esc(w.dzialania)}</div>` : ''}
          ${w.zdjecia.length ? `<div class="zdjecia">${w.zdjecia.map(id => `<button type="button" class="miniatura" data-zdjecie="${esc(id)}" data-podpis="${esc(w.miejsce)}" aria-label="Powiększ zdjęcie"><img data-plik="${esc(id)}" alt=""></button>`).join('')}</div>` : ''}
        </div>
        <div class="numer slaby">${esc(w.kiedy)}</div>
      </article>`).join('')}`
      : '<p class="pusto">Brak prób w tym okresie.</p>';
    for (const e of el.querySelectorAll('img[data-plik]')) hala.adresPliku(e.dataset.plik).then(u => { e.src = u; }).catch(() => {});
  }

  $('filtry-prob').addEventListener('change', () => {
    const f = $('filtry-prob');
    Object.assign(filtr, { okres: +f.okres.value || 1, zrodlo: f.zrodlo.value });
    P.narysuj();
  });
  $('filtry-prob').addEventListener('submit', ev => ev.preventDefault());
  $('lista-prob').addEventListener('click', ev => {
    const foto = ev.target.closest('[data-zdjecie]');
    if (foto) P.pokazZdjecie(foto.dataset.zdjecie, foto.dataset.podpis);
  });

  P.widoki.proby = { rysuj };
})();
