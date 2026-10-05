/* Dane podstawowe KJ (KONTRAKT §6.5): katalog wad, wyroby z linią, plan próbkowania.
   Zapisuje kierownik KJ (i admin) zdarzeniami slownik.zapisany / slownik.usuniety,
   więc zmiana dociera do liderów i Panelu tym samym strumieniem co reszta.

   KODÓW SIĘ NIE ZMIENIA ANI NIE KASUJE. Kod wady i wyrobu to klucz historii
   (Pareto, reklamacje) — zmienia się tylko nazwa, a niepotrzebną pozycję się
   wycofuje (slownik.usuniety zostawia ją w historii).

   Słowniki zmieniają się w telefonie dopiero po odpowiedzi huba (hala.js nie
   liczy ich z kolejki), więc bez sieci pokazujemy „pojawi się po wysłaniu”.   */

(function (KJ) {
  'use strict';

  const { hala, W, esc } = KJ;
  let zakladka = 'wady';

  const moznaPisac = sl => KJ.mozna('slownik.zapisany', sl);

  /* Słownik tak, jak będzie po wysłaniu kolejki: stan z huba + zapisy czekające w telefonie.
     hala.slowniki zmienia się dopiero po odpowiedzi huba, a bez sieci kolejne zapisy porównywałyby
     się ze stanem sprzed pierwszego (kolizje kodów, „Nic się nie zmieniło” przy cofnięciu zmiany). */
  function slownikZKolejka(nazwa) {
    const wynik = Object.assign({}, hala.slowniki[nazwa] || {});
    for (const zd of hala.stanKolejki().pozycje) {
      const d = zd.dane || {};
      if (d.slownik !== nazwa) continue;
      if (zd.typ === 'slownik.zapisany') wynik[d.klucz] = d.wartosc;
      else if (zd.typ === 'slownik.usuniety') delete wynik[d.klucz];
    }
    return wynik;
  }

  async function zapiszSlownik(slownik, klucz, wartosc) {
    await hala.zapisz('slownik.zapisany', `${slownik}/${klucz}`, { slownik, klucz, wartosc });
    KJ.komunikat(hala.polaczenie.strumien ? 'Zapisane' : 'Zapisane — pojawi się na liście po wysłaniu do huba');
  }
  async function wycofaj(slownik, klucz) {
    await hala.zapisz('slownik.usuniety', `${slownik}/${klucz}`, { slownik, klucz });
    KJ.komunikat(hala.polaczenie.strumien ? 'Wycofane' : 'Wycofane — zniknie z listy po wysłaniu do huba');
  }

  /* Formularz, bo plan próbkowania to liczniki w trakcie edycji — przerysowanie
     po każdym zdarzeniu ze strumienia kasowałoby niezapisane zmiany. Listy wad
     i wyrobów odświeżamy normalnie (edycja idzie w oknie). */
  KJ.ekran('katalog', {
    zakladka: 'wiecej',
    formularz: true,
    odswiez(el) { if (zakladka !== 'plan') rysuj(el); },
    rysuj,
  });

  function rysuj(el) {
      el.innerHTML = `<h1>Katalog</h1>
        <div class="wybor zakladki-katalogu" role="tablist">
          ${[['wady', 'Wady'], ['wyroby', 'Wyroby'], ['plan', 'Plan próbkowania']].map(([k, n]) =>
            `<button type="button" role="tab" data-zakladka="${k}" aria-selected="${zakladka === k}" aria-pressed="${zakladka === k}">${n}</button>`).join('')}
        </div>
        <div id="tresc-katalogu"></div>`;
      ({ wady: rysujWady, wyroby: rysujWyroby, plan: rysujPlan })[zakladka](el.querySelector('#tresc-katalogu'));
      el.querySelector('.zakladki-katalogu').addEventListener('click', ev => {
        const b = ev.target.closest('[data-zakladka]');
        if (b) { zakladka = b.dataset.zakladka; rysuj(el); }
      });
  }

  // ------------------------------------------------------------ wady

  function rysujWady(box) {
    const lista = W.katalogWad(hala.slowniki);
    const edycja = moznaPisac('katalog_wad');
    box.innerHTML = `${edycja ? '<button type="button" class="glowny szeroki" id="nowa-wada">Dodaj wadę</button>' : '<p class="slaby">Katalog zmienia kierownik KJ.</p>'}
      <div class="lista">${lista.map(w => `
        <div class="karta wiersz-katalogu">
          <div><b>${esc(w.nazwa)}</b> <span class="slaby">${esc(w.kod)}${w.kategoria ? ' · ' + esc(w.kategoria) : ''}</span></div>
          ${edycja ? `<div class="akcje"><button type="button" data-zmien-wade="${esc(w.kod)}">Zmień</button>
            <button type="button" data-wycofaj-wade="${esc(w.kod)}">Wycofaj</button></div>` : ''}
        </div>`).join('') || '<p class="pusto">Katalog jest pusty.</p>'}</div>`;
    if (!edycja) return;
    box.querySelector('#nowa-wada').addEventListener('click', () => oknoWady(null));
    box.addEventListener('click', async ev => {
      const z = ev.target.closest('[data-zmien-wade]'), u = ev.target.closest('[data-wycofaj-wade]');
      if (z) oknoWady(z.dataset.zmienWade);
      if (u) {
        const w = hala.slowniki.katalog_wad[u.dataset.wycofajWade] || {};
        if (await KJ.potwierdz(`Wycofać „${w.nazwa}”?`, 'Nie będzie jej do wyboru w nowych próbach (także u lidera). Historia i Pareto zostają.', 'Wycofaj'))
          wycofaj('katalog_wad', u.dataset.wycofajWade);
      }
    });
  }

  /* Kody użyte w historii — nowa wada nie może dostać kodu wady wycofanej, bo
     wskrzesiłaby jej historię pod nową nazwą. Wycofanych nie ma w słowniku, więc
     zbieramy kody z prób w pamięci telefonu. */
  function zajeteKody() {
    const k = new Set(Object.keys(slownikZKolejka('katalog_wad')));
    for (const zd of hala.stanKolejki().pozycje) if ((zd.dane || {}).slownik === 'katalog_wad') k.add(zd.dane.klucz);
    for (const p of hala.obiekty('proba')) for (const w of p.dane.wady || []) if (w && w.kod) k.add(w.kod);
    return k;
  }

  async function oknoWady(kod) {
    const w = kod ? hala.slowniki.katalog_wad[kod] || {} : {};
    const nastepna = W.katalogWad(hala.slowniki).reduce((m, x) => Math.max(m, x.kolejnosc || 0), 0) + 1;
    const o = await KJ.okno({
      tytul: kod ? 'Zmień wadę' : 'Nowa wada',
      tresc: `<label>Nazwa<input name="nazwa" maxlength="80" value="${esc(w.nazwa || '')}" placeholder="np. Zadrapanie"></label>
        <label>Kategoria <span class="slaby">(opcjonalnie)</span><input name="kategoria" maxlength="80" value="${esc(w.kategoria || '')}" placeholder="np. Wizualna"></label>
        <label>Kolejność na liście<input name="kolejnosc" type="number" inputmode="numeric" min="1" value="${esc(w.kolejnosc || nastepna)}"></label>
        ${kod ? `<p class="slaby">Kod: ${esc(kod)} (nie zmienia się)</p>` : '<p class="slaby">Kod nada się sam z nazwy i już się nie zmieni.</p>'}`,
      przyciski: [{ tekst: 'Anuluj', wartosc: false },
                  { tekst: 'Zapisz', wartosc: true, glowny: true, sprawdz: d => (String(d.get('nazwa') || '').trim() ? null : 'Wpisz nazwę wady.') }],
    });
    if (!o || !o.wartosc) return;
    const nazwa = String(o.dane.get('nazwa')).trim();
    const wartosc = { nazwa };
    const kat = String(o.dane.get('kategoria') || '').trim();
    if (kat) wartosc.kategoria = kat;
    const kol = parseInt(o.dane.get('kolejnosc'), 10);
    if (kol > 0) wartosc.kolejnosc = kol;
    await zapiszSlownik('katalog_wad', kod || W.kodZNazwy(nazwa, zajeteKody()), wartosc);
  }

  // ------------------------------------------------------------ wyroby

  function rysujWyroby(box) {
    const lista = Object.entries(hala.slowniki.wyroby || {}).sort(([a], [b]) => a.localeCompare(b, 'pl'));
    const edycja = moznaPisac('wyroby');
    box.innerHTML = `${edycja ? '<button type="button" class="glowny szeroki" id="nowy-wyrob">Dodaj wyrób</button>' : ''}
      <p class="slaby">Linia wyrobu podpowiada, do których liderów trafi reklamacja.</p>
      <div class="lista">${lista.map(([k, w]) => `
        <div class="karta wiersz-katalogu">
          <div><b>${esc(k)}</b> ${esc(w.nazwa)} <span class="slaby">${esc(W.nazwaLinii(hala.slowniki, w.linia))}</span></div>
          ${edycja ? `<div class="akcje"><button type="button" data-zmien-wyrob="${esc(k)}">Zmień</button>
            <button type="button" data-wycofaj-wyrob="${esc(k)}">Wycofaj</button></div>` : ''}
        </div>`).join('') || '<p class="pusto">Brak wyrobów.</p>'}</div>`;
    if (!edycja) return;
    box.querySelector('#nowy-wyrob').addEventListener('click', () => oknoWyrobu(null));
    box.addEventListener('click', async ev => {
      const z = ev.target.closest('[data-zmien-wyrob]'), u = ev.target.closest('[data-wycofaj-wyrob]');
      if (z) oknoWyrobu(z.dataset.zmienWyrob);
      if (u && await KJ.potwierdz(`Wycofać wyrób ${u.dataset.wycofajWyrob}?`, 'Zniknie z list wyboru. Reklamacje i próby z tym kodem zostają.', 'Wycofaj'))
        wycofaj('wyroby', u.dataset.wycofajWyrob);
    });
  }

  async function oknoWyrobu(kod) {
    const w = kod ? hala.slowniki.wyroby[kod] || {} : {};
    const o = await KJ.okno({
      tytul: kod ? `Wyrób ${kod}` : 'Nowy wyrób',
      tresc: `${kod ? '' : '<label>Kod wyrobu<input name="kod" maxlength="60" autocapitalize="characters" placeholder="np. W-400"></label>'}
        <label>Nazwa<input name="nazwa" maxlength="120" value="${esc(w.nazwa || '')}"></label>
        <label>Linia<select name="linia"><option value="">— wybierz —</option>${W.linie(hala.slowniki).map(l =>
          `<option value="${esc(l.kod)}" ${w.linia === l.kod ? 'selected' : ''}>${esc(l.nazwa)}</option>`).join('')}</select></label>`,
      przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: 'Zapisz', wartosc: true, glowny: true, sprawdz: d => {
        if (!kod) {
          const k = String(d.get('kod') || '').trim();
          if (!k) return 'Wpisz kod wyrobu.';
          // Bez względu na wielkość liter: „w-200” i „W-200” to dla kontrolera ten sam wyrób.
          if (Object.keys(slownikZKolejka('wyroby')).some(x => x.toLowerCase() === k.toLowerCase())) return 'Taki kod już jest — zmień istniejący wyrób.';
          if (k.includes('/')) return 'Kod nie może zawierać znaku „/”.';
        }
        if (!String(d.get('nazwa') || '').trim()) return 'Wpisz nazwę.';
        if (!d.get('linia')) return 'Wybierz linię.';
        return null;
      } }],
    });
    if (!o || !o.wartosc) return;
    await zapiszSlownik('wyroby', kod || String(o.dane.get('kod')).trim(),
                        { nazwa: String(o.dane.get('nazwa')).trim(), linia: String(o.dane.get('linia')) });
  }

  // ------------------------------------------------------------ plan próbkowania

  function rysujPlan(box) {
    const plan = hala.slowniki.plan_probkowania || {};
    const edycja = moznaPisac('plan_probkowania');
    const stanowiska = Object.entries(hala.slowniki.stanowiska || {});
    box.innerHTML = `<p class="slaby">Ile prób KJ na zmianę na każdym stanowisku. 0 = poza planem.</p>
      <form id="f-plan">${W.linie(hala.slowniki).map(l => {
        const st = stanowiska.filter(([, s]) => s.linia === l.kod).sort(([a], [b]) => a.localeCompare(b, 'pl'));
        if (!st.length) return '';
        return `<section class="grupa"><h2>${esc(l.nazwa)}</h2>${st.map(([k, s]) => edycja
          ? KJ.licznik(k, (plan[k] && plan[k].na_zmiane) || 0, `${s.nazwa} (${k})`, true)
          : `<div class="wiersz-planu"><span>${esc(s.nazwa)}</span><b>${esc((plan[k] && plan[k].na_zmiane) || 0)}</b></div>`).join('')}</section>`;
      }).join('')}
      ${edycja ? '<div class="przyciski-formularza"><button type="submit" class="glowny">Zapisz plan</button></div>' : ''}</form>`;
    if (!edycja) return;
    // Wysyłamy wiersze, których dotknął kierownik, porównane z planem PO kolejce (bez sieci drugi zapis
    // tego samego wiersza musi wiedzieć o pierwszym). Ekran planu się nie przerysowuje w trakcie edycji.
    const dotkniete = new Set();
    const formPlanu = box.querySelector('#f-plan');
    formPlanu.addEventListener('input', ev => { if (ev.target.name) dotkniete.add(ev.target.name); });
    KJ.przyZapisie(formPlanu, async form => {
      const d = new FormData(form);
      const teraz = slownikZKolejka('plan_probkowania');
      let zmiany = 0;
      for (const [k, s] of stanowiska) {
        if (d.get(k) === null || !dotkniete.has(k)) continue;
        const n = Math.max(0, parseInt(d.get(k), 10) || 0);
        const bylo = (teraz[k] && teraz[k].na_zmiane) || 0;
        if (n === bylo) continue;
        zmiany++;
        if (n) await hala.zapisz('slownik.zapisany', `plan_probkowania/${k}`, { slownik: 'plan_probkowania', klucz: k, wartosc: { linia: s.linia, stanowisko: k, na_zmiane: n } });
        else await hala.zapisz('slownik.usuniety', `plan_probkowania/${k}`, { slownik: 'plan_probkowania', klucz: k });
      }
      dotkniete.clear();
      KJ.komunikat(zmiany ? `Plan zapisany: ${zmiany} ${W.odmiana(zmiany, 'zmiana', 'zmiany', 'zmian')}` : 'Nic się nie zmieniło');
    });
  }
})(window.KJ);
