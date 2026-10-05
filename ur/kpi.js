/* KPI Utrzymania Ruchu: MTTR, MTBF, czas reakcji, przestój; top maszyn, linie, typy
   usterek i wykonanie planu przeglądów.

   Do 30 dni liczy telefon z tego, co ma (URWidok.kpi na hala.obiekty('awaria')) — działa
   też bez sieci. Dłuższe okresy liczy hub (ur/serwer/rozszerzenie.py, GET /api/v1/ur/kpi),
   bo telefon trzyma tylko 30 dni. Obie strony liczą według tych samych definicji
   (KONTRAKT §6.1, D8), pilnowanych wspólnymi wektorami ur/testy/wektory-kpi.json.     */

(function (global) {
  'use strict';

  const UR = global.UR, W = UR.W, hala = UR.hala, esc = UR.esc;
  const KLUCZ = 'hala.ur.kpi';
  const ustawienia = {
    czytaj() { try { return JSON.parse(localStorage.getItem(KLUCZ) || '{}'); } catch (e) { return {}; } },
    zapisz(v) { try { localStorage.setItem(KLUCZ, JSON.stringify(v)); } catch (e) { /* bez pamięci też działa */ } },
  };
  const zHuba = new Map();          // 'okres|linia|maszyna' → {wynik, kiedy} — żeby przerysowanie nie pytało huba co sekundę
  const czas = v => (v === null || v === undefined ? '—' : Hala.formatCzasu(v));

  function kafle(k, plan) {
    return `<div class="kafle-liczb">
      <div><span>Awarie</span><b>${k.liczba}</b><small>zakończone ${k.zakonczone}</small></div>
      <div><span>MTTR</span><b>${esc(czas(k.mttrMs))}</b><small>średni czas naprawy</small></div>
      <div><span>MTBF</span><b>${esc(czas(k.mtbfMs))}</b><small>między awariami maszyny</small></div>
      <div><span>Reakcja</span><b>${esc(czas(k.reakcjaMs))}</b><small>do przyjęcia</small></div>
      <div class="${k.przestojMs ? 'alarm' : ''}"><span>Przestój</span><b>${esc(czas(k.przestojMs))}</b><small>łącznie</small></div>
      ${plan ? `<div class="${plan.proc !== null && plan.proc < 90 ? 'uwaga' : ''}"><span>Plan przeglądów${plan.tylko30 ? ' (30 dni)' : ''}</span><b>${plan.proc === null ? '—' : plan.proc + ' %'}</b><small>w terminie ${plan.wTerminie}/${plan.wTerminie + plan.poTerminie + plan.opoznione + plan.usunietePoTerminie}${plan.usunietePoTerminie ? ` · usunięte po terminie ${plan.usunietePoTerminie}` : ''}</small></div>` : ''}
    </div>`;
  }

  function tabelaMaszyn(lista) {
    if (!lista.length) return '<p class="pusto ok">Brak awarii w tym okresie</p>';
    const maks = Math.max(1, ...lista.map(m => m.przestojMs));
    return `<table class="tabela"><thead><tr><th>Maszyna</th><th class="liczba">Awarie</th><th class="liczba">Przestój</th><th class="liczba">MTTR</th><th class="liczba">MTBF</th></tr></thead>
      <tbody>${lista.slice(0, 10).map(m => `<tr><td><b>${esc(m.nazwa)}</b> <span class="slaby">${esc(m.kod)}</span>
        <div class="slupek-poziomy" style="width:${Math.round(m.przestojMs * 100 / maks)}%"></div></td>
        <td class="liczba">${m.liczba}</td><td class="liczba">${esc(czas(m.przestojMs))}</td><td class="liczba">${esc(czas(m.mttrMs))}</td><td class="liczba">${esc(czas(m.mtbfMs))}</td></tr>`).join('')}</tbody></table>`;
  }

  function tabelaLinii(lista) {
    if (!lista.length) return '';
    return `<table class="tabela"><thead><tr><th>Linia</th><th class="liczba">Awarie</th><th class="liczba">Przestój</th><th class="liczba">MTTR</th></tr></thead>
      <tbody>${lista.map(l => `<tr><td>${esc(l.nazwa)}</td><td class="liczba">${l.liczba}</td><td class="liczba">${esc(czas(l.przestojMs))}</td><td class="liczba">${esc(czas(l.mttrMs))}</td></tr>`).join('')}</tbody></table>`;
  }

  function tabelaTypow(lista, stale) {
    if (!lista.length) return '';
    const maks = Math.max(1, ...lista.map(t => t.liczba));
    return `<table class="tabela"><tbody>${lista.map(t => `<tr><td>${esc(t.kod === 'brak' ? 'Bez klasyfikacji' : W.nazwaZeStalej(stale, 'typy_usterek', t.kod))}
      <div class="slupek-poziomy" style="width:${Math.round(t.liczba * 100 / maks)}%"></div></td><td class="liczba">${t.liczba}</td></tr>`).join('')}</tbody></table>`;
  }

  UR.ekran('kpi', {
    rysuj(el) {
      const k = UR.kontekst();
      const u = Object.assign({ okres: '30', linia: '', maszyna: '' }, ustawienia.czytaj());
      const okres = W.okresKpi(u.okres, k.teraz);
      // Telefon trzyma przeglądy z ~30 dni: dla dłuższych okresów kafel planu mówi uczciwie „30 dni”,
      // zamiast pokazywać miesiąc pod etykietą roku (błąd z przeglądu kodu).
      const plan = Object.assign(W.wykonaniePlanu({ przeglady: hala.obiekty('przeglad'),
        od: okres.zHuba ? W.okresKpi('30', k.teraz).od : okres.od, do: okres.doPlanu, teraz: k.teraz }), { tylko30: okres.zHuba });
      const klucz = `${u.okres}|${u.linia}|${u.maszyna}`;
      let wynik = null, zrodlo = '';
      if (!okres.zHuba) {
        wynik = W.kpi({ awarie: hala.obiekty('awaria'), od: okres.od, do: okres.do, teraz: k.teraz, linia: u.linia || null, maszyna: u.maszyna || null, slowniki: k.slowniki });
        zrodlo = 'Policzone w telefonie.';
      } else if (zHuba.has(klucz)) {
        wynik = zHuba.get(klucz).wynik;
        zrodlo = `Policzone przez hub o ${W.godzina(zHuba.get(klucz).kiedy)}.`;
      }
      const maszyny = W.maszyny(k.slowniki).filter(m => !u.linia || m.linia === u.linia);
      el.innerHTML = `<h1>KPI</h1>
        <div class="filtry">
          <div class="wybor" id="okres">${W.OKRESY.map(o => `<button type="button" data-okres="${o.kod}" aria-pressed="${u.okres === o.kod}">${esc(o.nazwa)}</button>`).join('')}</div>
          <div class="filtry-listy">
            <select id="f-linia" aria-label="Linia"><option value="">Wszystkie linie</option>${W.linie(k.slowniki).map(l => `<option value="${esc(l.kod)}" ${u.linia === l.kod ? 'selected' : ''}>${esc(l.nazwa)}</option>`).join('')}</select>
            <select id="f-maszyna" aria-label="Maszyna"><option value="">Wszystkie maszyny</option>${maszyny.map(m => `<option value="${esc(m.kod)}" ${u.maszyna === m.kod ? 'selected' : ''}>${esc(m.nazwa)}</option>`).join('')}</select>
          </div>
        </div>
        <div id="wynik-kpi">${wynik ? `${kafle(wynik, plan)}
          <h2>Maszyny — najdłuższy przestój</h2>${tabelaMaszyn(wynik.maszyny)}
          ${u.linia ? '' : `<h2>Linie</h2>${tabelaLinii(wynik.linie)}`}
          <h2>Typy usterek</h2>${tabelaTypow(wynik.typy, k.stale)}
          <p class="slaby stopka">${esc(zrodlo)} MTTR: od zgłoszenia do „Zakończona przez UR”. Przestój: do potwierdzenia lidera. Anulowane się nie liczą.</p>`
          : `<p class="pusto" id="kpi-hub">${UR.online() ? 'Liczę w hubie…' : 'Dłuższe okresy liczy hub — potrzebna sieć. Bez sieci wybierz 7 albo 30 dni.'}</p>`}</div>
        <div id="eksport-csv"></div>`;
      // Kierownik UR: awarie do Excela za dowolny okres (wspólny pasek ../wspolne/eksport.js, D32; mechanik go nie widzi).
      global.HalaEksport.rysuj(el.querySelector('#eksport-csv'), hala, { rodzaje: ['awarie'], komunikat: (t, r) => UR.komunikat(t, r) });
      el.querySelector('#okres').addEventListener('click', ev => {
        const b = ev.target.closest('[data-okres]');
        if (!b) return;
        ustawienia.zapisz(Object.assign(u, { okres: b.dataset.okres }));
        UR.odswiez('wymus');
      });
      el.querySelector('#f-linia').addEventListener('change', ev => { ustawienia.zapisz(Object.assign(u, { linia: ev.target.value, maszyna: '' })); UR.odswiez('wymus'); });
      el.querySelector('#f-maszyna').addEventListener('change', ev => { ustawienia.zapisz(Object.assign(u, { maszyna: ev.target.value })); UR.odswiez('wymus'); });
      if (okres.zHuba && !wynik && UR.online()) pobierz(klucz, okres, u);
    },
  });

  const wToku = new Set();
  const bledy = new Map();                   // klucz → {tekst, do} — po błędzie huba nie pytamy przy każdym zdarzeniu
  async function pobierz(klucz, okres, u) {
    if (wToku.has(klucz)) return;            // przerysowanie w trakcie pytania huba nie pyta drugi raz
    const b = bledy.get(klucz);
    if (b && Date.now() < b.do) { const p = document.getElementById('kpi-hub'); if (p) p.textContent = b.tekst; return; }
    wToku.add(klucz);
    const q = new URLSearchParams({ od: okres.od, do: okres.do });
    if (u.linia) q.set('linia', u.linia);
    if (u.maszyna) q.set('maszyna', u.maszyna);
    try {
      const wynik = await UR.zapytaj('GET', `/api/v1/ur/kpi?${q}`);
      zHuba.set(klucz, { wynik, kiedy: hala.teraz() });
      // Po 5 min liczymy od nowa (nowe awarie), ale nie przy każdym przerysowaniu.
      setTimeout(() => zHuba.delete(klucz), 5 * 60000);
      UR.odswiez('wymus');
    } catch (e) {
      const p = document.getElementById('kpi-hub');
      const tekst = e.kod === 403 ? 'To konto nie widzi KPI z huba.' : `Hub nie policzył KPI: ${UR.komunikatBledu(e)} Spróbuj za minutę.`;
      bledy.set(klucz, { tekst, do: Date.now() + 60000 });
      if (p) p.textContent = tekst;
    } finally {
      wToku.delete(klucz);
    }
  }
})(window);
