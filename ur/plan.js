/* Plan przeglądów (kierownik UR): karty przeglądów z punktami kontrolnymi i harmonogram.
   Oba to słowniki z rozszerzenia UR (karty_przegladow, harmonogram_przegladow), więc zapis
   to zdarzenie slownik.zapisany — z historią, offline i przez ten sam strumień do telefonów.

   Z harmonogramu przeglądy zakłada hub (ur/serwer/rozszerzenie.py) co godzinę, 14 dni do
   przodu. Po zmianie planu kierownik może to przyspieszyć przyciskiem „Zaplanuj teraz”. */

(function (global) {
  'use strict';

  const UR = global.UR, W = UR.W, hala = UR.hala, esc = UR.esc;

  async function zapiszSlownik(slownik, klucz, wartosc) {
    await hala.zapisz('slownik.zapisany', `${slownik}/${klucz}`, { slownik, klucz, wartosc });
  }
  async function usunSlownik(slownik, klucz) {
    await hala.zapisz('slownik.usuniety', `${slownik}/${klucz}`, { slownik, klucz });
  }

  /* Generator w hubie widzi plan dopiero, gdy zapis dojdzie do huba — czekamy chwilę na kolejkę. */
  async function zaplanujTeraz(cicho) {
    if (!UR.online()) { if (!cicho) UR.komunikat('Bez sieci — hub zaplanuje przeglądy sam, gdy dostanie plan.', 'uwaga'); return; }
    for (let i = 0; i < 20 && hala.stanKolejki().moje; i++) { hala.synchronizuj(); await new Promise(ok => setTimeout(ok, 300)); }
    try {
      const r = await UR.zapytaj('POST', '/api/v1/ur/plan/generuj', {});
      const czesci = [];
      if (r.zaplanowane) czesci.push(`zaplanowane: ${r.zaplanowane}`);
      if (r.usuniete) czesci.push(`usunięte stare terminy: ${r.usuniete}`);
      UR.komunikat(czesci.length ? `Przeglądy — ${czesci.join(', ')}` : 'Plan aktualny — nic do zmiany.');
    } catch (e) {
      if (!cicho) UR.komunikat(`Hub nie zaplanował: ${UR.komunikatBledu(e)}`, 'alarm');
    }
  }

  // ------------------------------------------------------------ ekran planu

  UR.ekran('plan', {
    rysuj(el) {
      if (!UR.kierownikUR()) { el.innerHTML = '<p class="pusto">Plan przeglądów prowadzi kierownik UR.</p>'; return; }
      const sl = hala.slowniki;
      const karty = Object.entries(sl.karty_przegladow || {}).map(([kod, k]) => Object.assign({ kod }, k))
        .sort((a, b) => String(a.nazwa).localeCompare(String(b.nazwa), 'pl'));
      const harm = W.listaHarmonogramu(sl, hala.pracownicy);
      const dlaKogo = k => (k.typ_maszyny ? `typ: ${k.typ_maszyny}` : (k.maszyny || []).map(m => W.nazwaMaszyny(sl, m)).join(', ')) || '—';
      el.innerHTML = `<h1>Plan przeglądów</h1>
        ${!karty.length ? `<div class="grupa"><p>Nie ma jeszcze kart przeglądów. Wstaw przykładowy plan (karta dla każdego typu maszyny,
            przegląd co miesiąc albo co tydzień) i popraw go pod swoje maszyny — albo dodaj karty od zera.</p>
            <button type="button" class="glowny szeroki" id="przyklad">Wstaw przykładowy plan</button></div>` : ''}
        <h2>Karty przeglądów <span class="znacznik neutral">${karty.length}</span></h2>
        <div class="lista">${karty.map(k => `<a class="karta" href="#karta/${encodeURIComponent(k.kod)}"><b class="tytul">${esc(k.nazwa)}</b>
          <span class="slaby">${esc(dlaKogo(k))} · ${(k.punkty || []).length} ${W.odmiana((k.punkty || []).length, 'punkt', 'punkty', 'punktów')}</span></a>`).join('')}</div>
        <a class="przycisk szeroki" href="#karta/nowa" style="margin-top:10px">＋ Nowa karta</a>
        <h2>Harmonogram <span class="znacznik neutral">${harm.length}</span></h2>
        <div class="lista" id="harmonogram">${harm.map(h => `<button type="button" class="karta" data-harmonogram="${esc(h.klucz)}" style="text-align:left">
          <b>${esc(h.maszynaNazwa)}</b> <span class="slaby">${esc(h.maszyna)}</span><br>
          <span>${esc(h.kartaNazwa)} · ${esc(h.co_ile)}</span> <span class="slaby">od ${esc(h.od)}${h.mechanikNazwa ? ' · ' + esc(h.mechanikNazwa) : ''}</span>
          ${h.zepsuty ? '<br><span class="zepsuty">Maszyny albo karty już nie ma — popraw albo usuń</span>' : ''}</button>`).join('') || '<p class="pusto">Harmonogram jest pusty.</p>'}</div>
        <div class="przyciski-formularza" style="margin-top:10px">
          <button type="button" id="zaplanuj-teraz" ${harm.length ? '' : 'disabled'}>Zaplanuj teraz</button>
          <button type="button" class="glowny" id="dodaj-harmonogram" ${karty.length ? '' : 'disabled'}>＋ Dodaj do harmonogramu</button>
        </div>
        <p class="slaby stopka">Hub zakłada przeglądy z harmonogramu co godzinę, na 14 dni do przodu. Przegląd „co N motogodzin/cykli” pojawia się, gdy licznik maszyny urośnie o N od ostatniego przeglądu.</p>`;
      const p = el.querySelector('#przyklad');
      if (p) p.addEventListener('click', wstawPrzyklad);
      el.querySelector('#dodaj-harmonogram').addEventListener('click', () => edytujHarmonogram(null));
      el.querySelector('#zaplanuj-teraz').addEventListener('click', () => zaplanujTeraz(false));
      el.querySelector('#harmonogram').addEventListener('click', ev => {
        const b = ev.target.closest('[data-harmonogram]');
        if (b) edytujHarmonogram(b.dataset.harmonogram);
      });
    },
  });

  const wstawPrzyklad = W.raz(async () => {
    const plan = W.przykladowyPlan(hala.slowniki, W.dzienZakladu(hala.teraz()));
    const nk = Object.keys(plan.karty).length, nh = Object.keys(plan.harmonogram).length;
    if (!(await UR.potwierdz('Wstawić przykładowy plan?', `${nk} ${W.odmiana(nk, 'karta', 'karty', 'kart')} i ${nh} ${W.odmiana(nh, 'pozycja', 'pozycje', 'pozycji')} harmonogramu (od dziś). Wszystko możesz potem zmienić albo usunąć.`, 'Wstaw'))) return;
    for (const [kod, w] of Object.entries(plan.karty)) await zapiszSlownik('karty_przegladow', kod, w);
    for (const [klucz, w] of Object.entries(plan.harmonogram)) await zapiszSlownik('harmonogram_przegladow', klucz, w);
    UR.komunikat('Przykładowy plan wstawiony');
    zaplanujTeraz(true);
  });

  const edytujHarmonogram = W.raz(async klucz => {
    const sl = hala.slowniki;
    const byl = klucz ? (sl.harmonogram_przegladow || {})[klucz] : null;
    const w0 = Object.assign({ maszyna: '', karta: '', interwal: 'miesiac', co: 1, od: W.dzienZakladu(hala.teraz()), mechanik: '', start: '' }, byl || {});
    const maszyny = W.maszyny(sl);
    if (!w0.maszyna && maszyny[0]) w0.maszyna = maszyny[0].kod;
    // Karty: najpierw te dla maszyny (po kodzie albo typie), ale kierownik może wybrać dowolną.
    const opcjeKart = m => {
      const pasujace = W.kartyDlaMaszyny(sl, m).map(k => k.kod);
      const wszystkie = Object.entries(sl.karty_przegladow || {}).map(([kod, k]) => ({ kod, nazwa: k.nazwa }))
        .sort((a, b) => (pasujace.includes(b.kod) - pasujace.includes(a.kod)) || String(a.nazwa).localeCompare(String(b.nazwa), 'pl'));
      return wszystkie.map(k => `<option value="${esc(k.kod)}" ${k.kod === w0.karta ? 'selected' : ''}>${esc(k.nazwa)}${pasujace.includes(k.kod) ? '' : ' (inna maszyna)'}</option>`).join('');
    };
    const mech = W.mechanicy(hala.pracownicy, null);
    const licznikowy = i => i === 'motogodziny' || i === 'cykle';
    const przyciski = [{ tekst: 'Anuluj', wartosc: false }];
    if (klucz) przyciski.push({ tekst: 'Usuń', wartosc: 'usun', alarm: true });
    przyciski.push({ tekst: 'Zapisz', wartosc: true, glowny: true,
      sprawdz: f => W.harmonogramZFormularza(Object.fromEntries(f), sl).bledy[0] || null });
    const w = await UR.okno({
      tytul: klucz ? 'Harmonogram' : 'Dodaj do harmonogramu',
      tresc: `<label>Maszyna<select name="maszyna" id="h-maszyna" ${klucz ? 'disabled' : ''}>${maszyny.map(m => `<option value="${esc(m.kod)}" ${m.kod === w0.maszyna ? 'selected' : ''}>${esc(m.nazwa)} (${esc(m.kod)})</option>`).join('')}</select></label>
        ${klucz ? `<input type="hidden" name="maszyna" value="${esc(w0.maszyna)}"><input type="hidden" name="karta" value="${esc(w0.karta)}">` : ''}
        <label>Karta<select name="karta" id="h-karta" ${klucz ? 'disabled' : ''}>${opcjeKart(w0.maszyna)}</select></label>
        <h3>Co ile</h3>${UR.chipy('interwal', W.INTERWALY, [w0.interwal])}
        <div class="dwa"><label>Co<input name="co" inputmode="decimal" value="${esc(w0.co)}" data-bez-fokusu></label>
          <label>Pierwszy przegląd<input type="date" name="od" value="${esc(w0.od)}"></label></div>
        <label id="h-start" ${licznikowy(w0.interwal) ? '' : 'hidden'}>Odczyt licznika w dniu startu<input name="start" inputmode="decimal" value="${esc(w0.start ?? '')}" data-bez-fokusu></label>
        <label>Mechanik (opcjonalnie)<select name="mechanik"><option value="">— każdy —</option>${mech.map(p => `<option value="${esc(p.id)}" ${p.id === w0.mechanik ? 'selected' : ''}>${esc(p.nazwa)}</option>`).join('')}</select></label>
        ${klucz ? '<p class="slaby">Maszyny i karty nie da się zmienić — usuń pozycję i dodaj nową.</p>' : ''}`,
      przyciski,
      przy: form => {
        const m = form.querySelector('#h-maszyna');
        if (m && !klucz) m.addEventListener('change', ev => { form.querySelector('#h-karta').innerHTML = opcjeKart(ev.target.value); });
        form.addEventListener('input', ev => {
          if (ev.target.name === 'interwal') form.querySelector('#h-start').hidden = !licznikowy(ev.target.value);
        });
      },
    });
    if (!w || w.wartosc === false) return;
    if (w.wartosc === 'usun') {
      if (!(await UR.potwierdz('Usunąć z harmonogramu?', 'Przyszłe przeglądy z tej pozycji znikną z planu. Opóźnione i rozpoczęte zostają.', 'Usuń', true))) return;
      await usunSlownik('harmonogram_przegladow', klucz);
      UR.komunikat('Usunięte z harmonogramu');
      zaplanujTeraz(true);
      return;
    }
    const h = W.harmonogramZFormularza(Object.fromEntries(w.dane), sl);
    if (!klucz && (sl.harmonogram_przegladow || {})[h.klucz] &&
        !(await UR.potwierdz('Już jest w harmonogramie', 'Ta maszyna ma już harmonogram z tą kartą. Zastąpić go nowym?', 'Zastąp'))) return;
    await zapiszSlownik('harmonogram_przegladow', klucz || h.klucz, h.wartosc);
    UR.komunikat('Harmonogram zapisany');
    zaplanujTeraz(true);
  });

  // ------------------------------------------------------------ edytor karty

  /* Karta to formularz z listą punktów w pamięci (dodaj, przesuń, usuń) i brudnopisem —
     kierownik może przerwać w połowie i wrócić. Id punktu nadaje się raz, z nazwy. */
  let stan = null;       // { kod, nowa, nazwa, tryb: 'typ'|'maszyny', typ_maszyny, maszyny: [], punkty: [] }
  const kluczBrudnopisu = kod => `karta:${kod}`;

  function typyMaszyn(sl) {
    return Array.from(new Set(Object.values(sl.maszyny || {}).map(m => m.typ).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pl'));
  }

  function rysujPunkty(el) {
    const lista = el.querySelector('#punkty-karty');
    lista.innerHTML = stan.punkty.map((p, i) => `<div class="punkt-edycja" data-i="${i}">
      <div class="pola">
        <input name="nazwa" value="${esc(p.nazwa || '')}" placeholder="Punkt kontrolny, np. Poziom oleju" aria-label="Nazwa punktu ${i + 1}">
        <select name="rodzaj" aria-label="Rodzaj"><option value="ok_nok" ${p.rodzaj !== 'pomiar' ? 'selected' : ''}>Zgodne / Niezgodne</option><option value="pomiar" ${p.rodzaj === 'pomiar' ? 'selected' : ''}>Pomiar (liczba)</option></select>
        <div class="granice" ${p.rodzaj === 'pomiar' ? '' : 'hidden'}>
          <input name="jednostka" value="${esc(p.jednostka || '')}" placeholder="jedn., np. bar" aria-label="Jednostka">
          <input name="min" inputmode="decimal" value="${esc(p.min ?? '')}" placeholder="min" aria-label="Minimum">
          <input name="max" inputmode="decimal" value="${esc(p.max ?? '')}" placeholder="max" aria-label="Maksimum">
        </div>
      </div>
      <div class="przesun">
        <button type="button" data-ruch="-1" aria-label="W górę" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-ruch="1" aria-label="W dół" ${i === stan.punkty.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" data-usun aria-label="Usuń punkt">×</button>
      </div></div>`).join('') || '<p class="pusto">Dodaj pierwszy punkt kontrolny.</p>';
  }

  async function rysujEdytor(el, kod) {
    if (!UR.kierownikUR()) { el.innerHTML = '<p class="pusto">Karty przeglądów prowadzi kierownik UR.</p>'; return; }
    const sl = hala.slowniki;
    const nowa = !kod || kod === 'nowa';
    const istn = nowa ? null : (sl.karty_przegladow || {})[kod];
    if (!nowa && !istn) { el.innerHTML = '<a class="wstecz" href="#plan">‹ Plan</a><p class="pusto">Nie ma takiej karty.</p>'; return; }
    const kodB = nowa ? 'nowa' : kod;
    const b = await hala.brudnopis.odczytaj(kluczBrudnopisu(kodB));
    stan = b || { kod: nowa ? null : kod, nowa, nazwa: istn ? istn.nazwa : '', tryb: istn && (istn.maszyny || []).length && !istn.typ_maszyny ? 'maszyny' : 'typ',
                  typ_maszyny: istn ? (istn.typ_maszyny || '') : '', maszyny: istn ? (istn.maszyny || []).slice() : [],
                  punkty: istn ? JSON.parse(JSON.stringify(istn.punkty || [])) : [{ nazwa: '', rodzaj: 'ok_nok' }] };
    const typy = typyMaszyn(sl);
    el.innerHTML = `<a class="wstecz" href="#plan">‹ Plan</a>
      <form class="formularz" id="edytor-karty" autocomplete="off">
        <h1>${nowa ? 'Nowa karta' : 'Karta przeglądu'}</h1>
        ${b ? '<p class="tekst-uwaga">Przywrócono niezapisane zmiany.</p>' : ''}
        <label>Nazwa<input name="nazwa-karty" value="${esc(stan.nazwa)}" placeholder="np. Wtryskarka — przegląd miesięczny"></label>
        <fieldset><legend>Dla</legend>
          <div class="wybor" id="tryb">${[['typ', 'Typu maszyny'], ['maszyny', 'Wybranych maszyn']].map(([k, n]) => `<button type="button" data-tryb="${k}" aria-pressed="${stan.tryb === k}">${n}</button>`).join('')}</div>
          <div id="dla-typu" ${stan.tryb === 'typ' ? '' : 'hidden'} style="margin-top:8px"><select name="typ">${['', ...typy].map(t => `<option value="${esc(t)}" ${t === stan.typ_maszyny ? 'selected' : ''}>${t ? esc(t) : '— wybierz typ —'}</option>`).join('')}</select></div>
          <div id="dla-maszyn" class="wybor-maszyn" ${stan.tryb === 'maszyny' ? '' : 'hidden'} style="margin-top:8px">${W.maszyny(sl).map(m => `<label><input type="checkbox" name="maszyna" value="${esc(m.kod)}" ${stan.maszyny.includes(m.kod) ? 'checked' : ''}>${esc(m.nazwa)}</label>`).join('')}</div>
        </fieldset>
        <h2>Punkty kontrolne</h2>
        <div id="punkty-karty"></div>
        <button type="button" id="dodaj-punkt">＋ Punkt</button>
        <p class="blad" id="blad-karty" hidden></p>
        <div class="przyciski-formularza">${nowa ? '<a class="przycisk" href="#plan">Anuluj</a>' : '<button type="button" class="alarm" id="wycofaj">Usuń kartę</button>'}<button type="submit" class="glowny">Zapisz kartę</button></div>
      </form>`;
    rysujPunkty(el);
    const form = el.querySelector('#edytor-karty');
    const zapiszB = () => hala.brudnopis.zapisz(kluczBrudnopisu(kodB), stan);
    form.addEventListener('input', ev => {
      const t = ev.target, wiersz = t.closest('[data-i]');
      if (wiersz) {
        const p = stan.punkty[+wiersz.dataset.i];
        if (t.name === 'rodzaj') { p.rodzaj = t.value; wiersz.querySelector('.granice').hidden = t.value !== 'pomiar'; }
        else p[t.name] = t.value;
      } else if (t.name === 'nazwa-karty') stan.nazwa = t.value;
      else if (t.name === 'typ') stan.typ_maszyny = t.value;
      else if (t.name === 'maszyna') stan.maszyny = Array.from(form.querySelectorAll('input[name=maszyna]:checked')).map(x => x.value);
      zapiszB();
    });
    form.addEventListener('click', ev => {
      const tr = ev.target.closest('[data-tryb]');
      if (tr) {
        stan.tryb = tr.dataset.tryb;
        for (const x of form.querySelectorAll('[data-tryb]')) x.setAttribute('aria-pressed', String(x === tr));
        form.querySelector('#dla-typu').hidden = stan.tryb !== 'typ';
        form.querySelector('#dla-maszyn').hidden = stan.tryb !== 'maszyny';
        zapiszB();
        return;
      }
      const wiersz = ev.target.closest('[data-i]');
      if (!wiersz) return;
      const i = +wiersz.dataset.i;
      if (ev.target.closest('[data-usun]')) stan.punkty.splice(i, 1);
      else if (ev.target.closest('[data-ruch]')) {
        const j = i + (+ev.target.closest('[data-ruch]').dataset.ruch);
        if (j < 0 || j >= stan.punkty.length) return;
        [stan.punkty[i], stan.punkty[j]] = [stan.punkty[j], stan.punkty[i]];
      } else return;
      rysujPunkty(el);
      zapiszB();
    });
    el.querySelector('#dodaj-punkt').addEventListener('click', () => {
      stan.punkty.push({ nazwa: '', rodzaj: 'ok_nok' });
      rysujPunkty(el);
      const ostatni = el.querySelectorAll('#punkty-karty input[name=nazwa]');
      if (ostatni.length) ostatni[ostatni.length - 1].focus();
      zapiszB();
    });
    // Enter w polu nie zapisuje całej karty (klawiatura telefonu „Dalej”).
    form.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') ev.preventDefault(); });
    form.addEventListener('submit', ev => { ev.preventDefault(); zapiszKarte(el, kodB); });
    const wyc = el.querySelector('#wycofaj');
    if (wyc) wyc.addEventListener('click', () => wycofaj(kod));
  }

  const zapiszKarte = W.raz(async (el, kodB) => {
    const sl = hala.slowniki;
    const r = W.kartaZFormularza({ nazwa: stan.nazwa, maszyny: stan.tryb === 'maszyny' ? stan.maszyny : [],
      typ_maszyny: stan.tryb === 'typ' ? stan.typ_maszyny : '', punkty: stan.punkty });
    const blad = el.querySelector('#blad-karty');
    if (r.bledy.length) { blad.textContent = r.bledy[0]; blad.hidden = false; UR.brzeczyk.blad(); return; }
    const kod = stan.kod || W.kodZNazwy(r.wartosc.nazwa, Object.keys(sl.karty_przegladow || {}));
    await zapiszSlownik('karty_przegladow', kod, r.wartosc);
    await hala.brudnopis.usun(kluczBrudnopisu(kodB));
    stan = null;
    UR.komunikat('Karta zapisana');
    UR.idz('plan');
  });

  const wycofaj = W.raz(async kod => {
    const uzywa = W.listaHarmonogramu(hala.slowniki, hala.pracownicy).filter(h => h.karta === kod);
    const tresc = uzywa.length
      ? `Karta jest w harmonogramie (${uzywa.map(h => h.maszynaNazwa).join(', ')}). Po usunięciu te pozycje przestaną planować przeglądy.`
      : 'Zaplanowane już przeglądy z tą kartą stracą listę punktów.';
    if (!(await UR.potwierdz('Usunąć kartę?', tresc, 'Usuń', true))) return;
    await usunSlownik('karty_przegladow', kod);
    await hala.brudnopis.usun(kluczBrudnopisu(kod));
    UR.komunikat('Karta usunięta');
    UR.idz('plan');
  });

  UR.ekran('karta', {
    zakladka: 'plan',
    rysuj: rysujEdytor,
    odswiez() { /* formularz — zmiany z huba nie przerysowują go spod palca */ },
  });
})(window);
