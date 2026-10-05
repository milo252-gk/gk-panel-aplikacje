/* Panel Kierownika — szablony checklisty lidera (2026-09-28). Kto: role z kontraktu
   (slowniki.szablony_checklist.zapis — kierownik i admin).

   Szablon = nazwa + zakres (linie, zmiany; puste = wszystkie) + pozycje z terminem „godziny:minuty od startu
   zmiany”. Aplikacja Lidera bierze najwęższy pasujący szablon (Hala.szablonDla) i przy otwarciu zmiany robi
   z niego migawkę z godzinami — zmiana szablonu nie przestawia więc zmiany, która już trwa.
   Zapis: slownik.zapisany / slownik.usuniety. Logika formularza: widok.js (szablonZFormularza — testowana). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;

  function rysuj() {
    const sl = hala.slowniki || {};
    const lista = W.szablonyLista(sl);
    $('lista-szablonow').innerHTML = lista.map(s => `
      <article class="szablon" data-kod="${esc(s.kod)}">
        <div class="opis"><b>${esc(s.nazwa)}</b>
          <div class="slaby">${esc(s.zakres)} · pozycji: ${s.pozycji}</div></div>
        <div class="akcje">
          <button type="button" class="maly" data-akcja="zmien">Zmień</button>
          <button type="button" class="maly" data-akcja="kopiuj">Kopiuj</button>
          <button type="button" class="maly" data-akcja="usun">Usuń</button>
        </div>
      </article>`).join('') || '<p class="pusto">Nie ma jeszcze szablonów — bez nich lider nie ma checklisty.</p>';
  }

  // ------------------------------------------------------------ okno edycji

  const f = $('formularz-szablonu');
  let edytowanyKod = null;

  const zmianySlownik = () => {
    const z = (hala.slowniki && hala.slowniki.zmiany) || {};
    return Object.keys(z).length ? z : { I: { nazwa: 'Zmiana I', od: '06:00' }, II: { nazwa: 'Zmiana II', od: '14:00' }, III: { nazwa: 'Zmiana III', od: '22:00' } };
  };

  function wierszPozycji(p) {
    const typy = W.TYPY_POZYCJI.map(([k, n]) => `<option value="${k}" ${p.typ === k ? 'selected' : ''}>${esc(n)}</option>`).join('');
    return `<div class="pozycja-szablonu" data-id="${esc(p.id || '')}">
      <input class="termin" value="${esc(p.termin || '')}" placeholder="0:30" aria-label="Termin od startu zmiany (godziny:minuty)" inputmode="numeric">
      <span class="godzina slaby"></span>
      <input class="nazwa" value="${esc(p.nazwa || '')}" placeholder="Co zrobić" aria-label="Nazwa pozycji">
      <select class="typ" aria-label="Rodzaj">${typy}</select>
      <input class="cel" value="${esc(p.cel || '')}" placeholder="punkt QR" aria-label="Stanowisko do zeskanowania (opcjonalnie)" ${p.typ === 'obchod' ? '' : 'hidden'}>
      <span class="przyciski-wiersza">
        <button type="button" class="maly" data-ruch="-1" aria-label="W górę">↑</button>
        <button type="button" class="maly" data-ruch="1" aria-label="W dół">↓</button>
        <button type="button" class="maly" data-usun aria-label="Usuń pozycję">✕</button>
      </span>
    </div>`;
  }

  /* Podgląd godzin dla pierwszej zaznaczonej zmiany (albo I) — człowiek myśli „o 6:30”, a nie „+0:30”. */
  function odswiezGodziny() {
    const zm = zmianySlownik();
    const wybrana = [...f.querySelectorAll('input[name="zmiany"]:checked')].map(x => x.value)[0] || Object.keys(zm)[0];
    const od = (zm[wybrana] || {}).od;
    $('szablon-podglad').textContent = `Godziny w podglądzie: ${(zm[wybrana] || {}).nazwa || wybrana} (start ${od || '—'})`;
    for (const w of f.querySelectorAll('.pozycja-szablonu')) {
      w.querySelector('.godzina').textContent = W.godzinaPozycji(od, W.minutyZTekstu(w.querySelector('.termin').value));
      w.querySelector('.cel').hidden = w.querySelector('.typ').value !== 'obchod';
    }
  }

  function otworz(kod, kopia) {
    const sl = hala.slowniki || {};
    const zrodlo = kod ? W.szablonDoFormularza((sl.szablony_checklist || {})[kod] || {}) : { nazwa: '', linie: [], zmiany: [], pozycje: [
      { nazwa: 'Raport obsady', typ: 'obsada', termin: '0:30' }, { nazwa: 'Obchód linii — start', typ: 'obchod', termin: '1:00' },
      { nazwa: 'Przekazanie zmiany', typ: 'przekazanie', termin: '7:45' }] };
    edytowanyKod = kopia ? null : kod;
    if (kopia) { zrodlo.nazwa = `${zrodlo.nazwa} (kopia)`; zrodlo.pozycje.forEach(p => { if (p.typ !== 'przekazanie') delete p.id; }); }
    $('t-okno-szablonu').textContent = edytowanyKod ? `Szablon: ${zrodlo.nazwa}` : 'Nowy szablon';
    f.nazwa.value = zrodlo.nazwa;
    $('szablon-linie').innerHTML = Object.entries(sl.linie || {}).map(([k, l]) =>
      `<label class="zaznacz"><input type="checkbox" name="linie" value="${esc(k)}" ${zrodlo.linie.includes(k) ? 'checked' : ''}> ${esc((l && l.nazwa) || k)}</label>`).join('');
    $('szablon-zmiany').innerHTML = Object.entries(zmianySlownik()).map(([k, z]) =>
      `<label class="zaznacz"><input type="checkbox" name="zmiany" value="${esc(k)}" ${zrodlo.zmiany.includes(k) ? 'checked' : ''}> ${esc(z.nazwa || k)} <span class="slaby">${esc(z.od || '')}</span></label>`).join('');
    $('szablon-pozycje').innerHTML = zrodlo.pozycje.map(wierszPozycji).join('');
    f.querySelector('.blad').hidden = true;
    odswiezGodziny();
    $('okno-szablonu').showModal();
    f.nazwa.focus();
  }

  f.addEventListener('input', odswiezGodziny);
  f.addEventListener('change', odswiezGodziny);
  f.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const w = b.closest('.pozycja-szablonu');
    if (b.dataset.ruch && w) {
      const cel = +b.dataset.ruch < 0 ? w.previousElementSibling : w.nextElementSibling;
      if (cel) (+b.dataset.ruch < 0 ? cel.before(w) : cel.after(w));
    } else if (b.hasAttribute('data-usun') && w) {
      w.remove();
    } else if (b.id === 'szablon-dodaj') {
      $('szablon-pozycje').insertAdjacentHTML('beforeend', wierszPozycji({ typ: 'zadanie' }));
      $('szablon-pozycje').lastElementChild.querySelector('.termin').focus();
    } else if (b.hasAttribute('data-zamknij')) {
      $('okno-szablonu').close();
    }
    odswiezGodziny();
  });

  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const wybrane = n => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);
    const pozycje = [...f.querySelectorAll('.pozycja-szablonu')].map(w => ({
      id: w.dataset.id || null, termin: w.querySelector('.termin').value, nazwa: w.querySelector('.nazwa').value,
      typ: w.querySelector('.typ').value, cel: w.querySelector('.cel').value }));
    const wynik = W.szablonZFormularza({ nazwa: f.nazwa.value, linie: wybrane('linie'), zmiany: wybrane('zmiany'), pozycje },
                                       hala.slowniki, edytowanyKod);
    const blad = f.querySelector('.blad');
    if (wynik.bledy.length) { blad.textContent = wynik.bledy.join(' '); blad.hidden = false; return; }
    // Etap 3: w noc przejścia na czas letni zmiana przez 02:00 trwa godzinę krócej — to wyjątek raz w roku, więc pytamy.
    if ((wynik.ostrzezenia || []).length && !(await P.potwierdz('Termin blisko końca zmiany', wynik.ostrzezenia.join(' '), 'Zapisz mimo to'))) return;
    try {
      await hala.zapisz('slownik.zapisany', `szablony_checklist/${wynik.kod}`,
                        { slownik: 'szablony_checklist', klucz: wynik.kod, wartosc: wynik.wartosc });
      $('okno-szablonu').close();
    } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });

  $('nowy-szablon').addEventListener('click', () => otworz(null));
  $('lista-szablonow').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    const kod = b.closest('[data-kod]').dataset.kod;
    if (b.dataset.akcja === 'zmien') otworz(kod);
    if (b.dataset.akcja === 'kopiuj') otworz(kod, true);
    if (b.dataset.akcja === 'usun') {
      const s = (hala.slowniki.szablony_checklist || {})[kod] || {};
      if (!confirm(`Usunąć szablon „${s.nazwa || kod}”? Zmiany, które już trwają, zostają przy swojej checkliście.`)) return;
      try { await hala.zapisz('slownik.usuniety', `szablony_checklist/${kod}`, { slownik: 'szablony_checklist', klucz: kod }); }
      catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
    }
  });

  P.widoki.checklisty = { rysuj };
})();
