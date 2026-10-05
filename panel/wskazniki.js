/* Panel Kierownika — wskaźniki (2026-09-28, decyzja właściciela): awarie, przestój na linię, MTTR i czas reakcji,
   braki w próbach i najczęstsze wady, zlecenia — za bieżącą zmianę, dziś albo wczoraj. Liczy widok.js
   (W.wskazniki — testowane) z danych, które Panel trzyma w pamięci (2 doby), więc działa też bez sieci. */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;
  let okres = 'zmiana';

  const czas = ms => (ms === null || ms === undefined ? '—' : Hala.formatCzasu(ms));

  function rysuj(d) {
    for (const b of document.querySelectorAll('#wskazniki .chip')) b.setAttribute('aria-pressed', String(b.dataset.okres === okres));
    const okno = W.oknoWskaznikow(okres, d.teraz, d.zmiana);
    const el = $('wskazniki-tresc');
    if (!okno) { el.innerHTML = '<p class="pusto">Teraz nie trwa żadna zmiana — wybierz „Dziś” albo „Wczoraj”.</p>'; return; }
    const w = W.wskazniki({ awarie: hala.obiekty('awaria'), proby: hala.obiekty('proba'), zlecenia: hala.obiekty('zlecenie'),
                            slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz, okno });
    const tw = w.terminowosc;
    // Terminowość zleceń (D31): pasek = % w terminie, czerwony, gdy poniżej 80 %.
    const wierszTerminu = g => `<div class="pasek-wsk">
            <span class="nazwa">${esc(g.nazwa)}</span>
            <span class="slupek"><i class="${g.proc >= 80 ? 'dobrze' : ''}" style="width:${g.proc}%"></i></span>
            <span class="liczba">${g.proc} %</span>
            <span class="slaby">w terminie ${g.wTerminie} z ${g.wTerminie + g.poTerminie}${g.poTerminie ? ` · po terminie ${g.poTerminie}` : ''}</span>
          </div>`;
    const kafel = (etykieta, wartosc, klasa) => `<div class="${klasa || ''}"><span class="etykieta">${esc(etykieta)}</span><b>${esc(wartosc)}</b></div>`;
    el.innerHTML = `
      <p class="slaby okres-opis">${esc(okno.nazwa || '')} · ${esc(W.dataKrotka(okno.od))} ${esc(W.godzina(okno.od))} – ${esc(W.dataKrotka(okno.do))} ${esc(W.godzina(okno.do))}</p>
      <div class="hala-kafelki">
        ${kafel('Awarie', w.awarie, w.awarie ? 'uwaga' : 'zero')}
        ${kafel('Zatrzymania linii', w.zatrzymania, w.zatrzymania ? 'pilne' : 'zero')}
        ${kafel('Przestój łącznie', czas(w.przestojMs), w.przestojMs ? 'pilne' : 'zero')}
        ${kafel('Reakcja UR (średnio)', czas(w.reakcjaMs), w.reakcjaMs === null ? 'zero' : '')}
        ${kafel('MTTR (średnio)', czas(w.mttrMs), w.mttrMs === null ? 'zero' : '')}
        ${kafel('Braki w próbach', w.brakiProc === null ? '—' : `${w.brakiProc} %`, w.brakiProc ? 'uwaga' : 'zero')}
        ${kafel('Zlecenia wykonane', `${w.zleceniaWykonane}/${w.zlecenia}`, w.zlecenia ? 'dobrze' : 'zero')}
        ${kafel('Zlecenia w terminie', tw.proc === null ? '—' : `${tw.proc} %`, tw.proc === null ? 'zero' : tw.proc >= 80 ? 'dobrze' : 'pilne')}
      </div>
      <div class="wskazniki-dwa">
        <section><h3>Przestój na linię</h3>
          ${w.linie.map(k => `<div class="pasek-wsk">
            <span class="nazwa">${esc(k.nazwa)}</span>
            <span class="slupek"><i style="width:${w.maksPrzestojMs ? Math.round(k.przestojMs * 100 / w.maksPrzestojMs) : 0}%"></i></span>
            <span class="liczba">${esc(czas(k.przestojMs))}</span>
            <span class="slaby">${k.awarie} aw.${k.zatrzymania ? ` · ${k.zatrzymania} zatrz.` : ''}${k.mttrMs !== null ? ` · MTTR ${esc(czas(k.mttrMs))}` : ''}</span>
          </div>`).join('') || '<p class="pusto">Brak linii</p>'}
        </section>
        <section><h3>Najczęstsze wady ${w.proby ? `<span class="slaby">(${w.proby} prób, ${w.braki}/${w.sprawdzone} braków)</span>` : ''}</h3>
          ${w.pareto.map(p => `<div class="pasek-wsk">
            <span class="nazwa">${esc(p.nazwa)}</span>
            <span class="slupek"><i class="wada" style="width:${p.proc}%"></i></span>
            <span class="liczba">${p.ile} szt.</span><span class="slaby">${p.proc} %</span>
          </div>`).join('') || `<p class="pusto ok">${w.proby ? 'Bez wad w próbach' : 'Brak prób w tym okresie'}</p>`}
        </section>
        <section><h3>Zlecenia w terminie — działy ${tw.proc !== null ? `<span class="slaby">(${tw.wTerminie} z ${tw.wTerminie + tw.poTerminie})</span>` : ''}</h3>
          ${tw.dzialy.map(wierszTerminu).join('') || '<p class="pusto">Brak zleceń z terminem w tym okresie</p>'}
          ${tw.osoby.length ? `<h3 class="podtytul">Osoby (zlecenia z wybraną osobą)</h3>${tw.osoby.map(wierszTerminu).join('')}` : ''}
        </section>
      </div>`;
  }

  for (const b of document.querySelectorAll('#wskazniki .chip')) b.addEventListener('click', () => { okres = b.dataset.okres; P.narysuj(); });

  P.widoki.wskazniki = { rysuj };
})();
