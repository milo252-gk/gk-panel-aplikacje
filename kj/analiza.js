/* Analiza Pareto wad (specyfikacja 2.1, D11).

   Suma wady[].ilosc po kodzie z katalogu, malejąco, z procentem skumulowanym.
   Źródło: próby KJ, próby liderów albo oba (ten sam typ zdarzenia i ten sam
   katalog — dlatego da się je dodać).

   Wykres: poziome słupki (liczba) + osobny wąski pasek skumulowanego % w każdym
   wierszu. Celowo NIE klasyczny wykres z dwiema osiami — dwie skale na jednym
   polu łatwo źle odczytać. Kreska „80 %” oddziela wady, które dają większość braków.

   Liczy telefon z prób trzymanych w pamięci (ostatnie 30 dni — `dni` w Hala.utworz).
   Dłuższe okresy wymagałyby rozszerzenia serwerowego (KONTRAKT §7.1).          */

(function (KJ) {
  'use strict';

  const { hala, W, esc } = KJ;
  const PAMIEC = 'hala.kj.pareto';
  const OKRESY = [['zmiana', 'Ta zmiana'], ['dzis', 'Dziś'], ['7', '7 dni'], ['30', '30 dni']];
  const ZRODLA = [['', 'KJ + lider'], ['kj', 'KJ'], ['lider', 'Lider']];

  // Filtry pamiętamy w telefonie — kontroler wraca do tego samego widoku.
  let filtry = { okres: '7', zrodlo: '', linia: '', stanowisko: '', wyrob: '' };
  try { Object.assign(filtry, JSON.parse(localStorage.getItem(PAMIEC) || '{}')); } catch (e) { /* bez pamięci */ }
  const zapamietaj = () => { try { localStorage.setItem(PAMIEC, JSON.stringify(filtry)); } catch (e) { /* bez pamięci */ } };

  KJ.ekran('pareto', {
    zakladka: 'wiecej',
    rysuj(el) {
      // Zapamiętany filtr, którego już nie ma w słownikach (wycofany wyrób), działałby niewidocznie —
      // lista pokazywałaby „Wszystkie”, a wynik byłby pusty bez powodu.
      if (filtry.linia && !(hala.slowniki.linie || {})[filtry.linia]) filtry.linia = '';
      if (filtry.stanowisko && !(hala.slowniki.stanowiska || {})[filtry.stanowisko]) filtry.stanowisko = '';
      if (filtry.wyrob && !(hala.slowniki.wyroby || {})[filtry.wyrob]) filtry.wyrob = '';
      const teraz = hala.teraz();
      const o = W.okres(filtry.okres, teraz, hala.zmianaTeraz());
      const wynik = W.pareto(Object.assign({ proby: hala.obiekty('proba'), slowniki: hala.slowniki, od: o.od, do: o.do }, filtry,
                                           { zrodlo: filtry.zrodlo || null }));
      const max = wynik.wiersze.length ? wynik.wiersze[0].ilosc : 0;
      const stanowiska = Object.entries(hala.slowniki.stanowiska || {}).filter(([, s]) => !filtry.linia || s.linia === filtry.linia);
      const opcje = (lista, wybrana) => lista.map(([k, n]) => `<option value="${esc(k)}" ${wybrana === k ? 'selected' : ''}>${esc(n)}</option>`).join('');
      let granica = false;
      el.innerHTML = `
        <h1>Pareto wad</h1>
        <form class="filtry" id="f-pareto">
          <div class="wybor" role="group" aria-label="Okres">${OKRESY.map(([k, n]) => `<button type="button" data-okres="${k}" aria-pressed="${filtry.okres === k}">${n}</button>`).join('')}</div>
          <div class="wybor" role="group" aria-label="Źródło">${ZRODLA.map(([k, n]) => `<button type="button" data-zrodlo="${k}" aria-pressed="${filtry.zrodlo === k}">${n}</button>`).join('')}</div>
          <div class="filtry-listy">
            <select name="linia" aria-label="Linia"><option value="">Wszystkie linie</option>${opcje(W.linie(hala.slowniki).map(l => [l.kod, l.nazwa]), filtry.linia)}</select>
            <select name="stanowisko" aria-label="Stanowisko"><option value="">Wszystkie stanowiska</option>${opcje(stanowiska.map(([k, s]) => [k, s.nazwa]), filtry.stanowisko)}</select>
            <select name="wyrob" aria-label="Wyrób"><option value="">Wszystkie wyroby</option>${opcje(Object.entries(hala.slowniki.wyroby || {}).map(([k, w]) => [k, `${k} · ${w.nazwa}`]), filtry.wyrob)}</select>
          </div>
        </form>
        <div class="kafle-liczb">
          <div><span>Próby</span><b>${wynik.liczbaProb}</b></div>
          <div><span>Sprawdzone</span><b>${wynik.sprawdzone}</b></div>
          <div><span>Braki</span><b>${wynik.braki}</b>${wynik.procBrakow !== null ? `<small>${String(wynik.procBrakow).replace('.', ',')} %</small>` : ''}</div>
          <div><span>Wady</span><b>${wynik.suma}</b></div>
        </div>
        ${wynik.wiersze.length ? `
        <div class="pareto" role="table" aria-label="Pareto wad">
          <div class="pareto-wiersz naglowek" role="row"><span role="columnheader">Wada</span><span role="columnheader">Liczba</span><span role="columnheader">Skumulowany %</span></div>
          ${wynik.wiersze.map(w => {
            // Kreska po wierszu, który przekroczył 80 % — tyle wad daje większość braków.
            const kreska = !granica && w.skumulowany >= 80 ? (granica = true) : false;
            return `<div class="pareto-wiersz ${kreska ? 'granica' : ''}" role="row" title="${esc(w.nazwa)}: ${w.ilosc} (${w.proc} %), narastająco ${w.skumulowany} %">
              <span class="nazwa" role="cell">${esc(w.nazwa)}${w.wycofana ? ' <span class="slaby">(wycofana)</span>' : ''}</span>
              <span class="slupek" role="cell"><span class="pasek" style="width:${max ? (w.ilosc * 100 / max) : 0}%"></span><b>${w.ilosc}</b></span>
              <span class="skumulowany" role="cell"><span class="tor"><span style="width:${w.skumulowany}%"></span></span>${String(w.skumulowany).replace('.', ',')} %</span>
            </div>`;
          }).join('')}
        </div>
        ${granica ? '<p class="slaby legenda-pareto">Kreska: wady powyżej dają razem co najmniej 80 % wszystkich wad.</p>' : ''}`
        : '<p class="pusto">Brak wad w wybranym okresie i filtrach.</p>'}
        <p class="slaby">Dane z ostatnich 30 dni zapisanych w tym telefonie.</p>
        <div id="eksport-csv"></div>`;
      // Kierownik KJ: próby i partie brakowe do Excela za dowolny okres (wspólny pasek ../wspolne/eksport.js, D32).
      window.HalaEksport.rysuj(el.querySelector('#eksport-csv'), hala, { rodzaje: ['proby', 'partie'], komunikat: (t, r) => KJ.komunikat(t, r) });
      const form = el.querySelector('#f-pareto');
      form.addEventListener('change', () => {
        const d = new FormData(form);
        const nowaLinia = String(d.get('linia') || '');
        if (nowaLinia !== filtry.linia) filtry.stanowisko = '';     // stanowisko z innej linii nie ma sensu
        else filtry.stanowisko = String(d.get('stanowisko') || '');
        filtry.linia = nowaLinia; filtry.wyrob = String(d.get('wyrob') || '');
        zapamietaj(); KJ.odswiez('wymus');
      });
      form.addEventListener('click', ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        if (b.dataset.okres !== undefined) filtry.okres = b.dataset.okres;
        if (b.dataset.zrodlo !== undefined) filtry.zrodlo = b.dataset.zrodlo;
        zapamietaj(); KJ.odswiez('wymus');
      });
    },
  });
})(window.KJ);
