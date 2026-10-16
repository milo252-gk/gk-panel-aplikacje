/* Panel Kierownika — zlecenia stałe (D31, prośba właściciela 2026-10-01: „jak w GK Trasy”).

   Zlecenie stałe = zadanie + dział (linia, maszyna, osoba) + harmonogram + termin + wymagane zdjęcie/notatka.
   Zapis: slownik.zapisany / slownik.usuniety w słowniku zlecenia_stale (kierownicy i admin — kontrakt). Zleceń
   nie robi Panel: hub sam co minutę zamienia wystąpienia z harmonogramu w „zlecenie.utworzone” (automat_zlecen),
   więc działa też, gdy żaden Panel nie jest otwarty. „Zleć teraz” otwiera zwykłe okno „Nowe zlecenie” wypełnione
   tym szablonem. Logika formularza i opisy po ludzku: widok.js (testowane w panel/testy/widok-testy.js). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;

  function rysuj(d) {
    const lista = W.zleceniaStale({ slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz,
                                    roleZlecajacych: ((hala.kontrakt.zdarzenia['zlecenie.utworzone'] || {}).role) || [] });
    const pisze = P.mozeZapisacStale();
    const zlecaj = pisze && (hala.pracownik.role || []).some(r => r === 'admin'
      || ((hala.kontrakt.zdarzenia['zlecenie.utworzone'] || {}).role || []).includes(r));
    $('lista-stalych').innerHTML = lista.map(s => `
      <article class="staly ${s.aktywny ? '' : 'wstrzymany'}" data-kod="${esc(s.kod)}">
        <div class="opis">
          ${s.checklista ? `<div class="slaby">☑ Checklista · ${esc(s.pozycji)} ${s.pozycji === 1 ? 'pozycja' : s.pozycji < 5 ? 'pozycje' : 'pozycji'}</div>` : ''}
          <div><b>${esc(s.tytul)}</b> ${s.wymagajZdjecia ? '<span title="Wymagane zdjęcie">📷</span>' : ''}${s.wymagajNotatki ? '<span title="Wymagana notatka">📝</span>' : ''}${s.wymagajSkanu ? '<span title="Wymagany skan QR maszyny">▣</span>' : ''}</div>
          <div class="szczegoly">
            <span class="znacznik ${s.aktywny ? 'ok' : ''}">${!s.aktywny ? 'Wstrzymane' : s.reczny ? (s.checklista ? 'Ręczna' : 'Pojedyncze') : (s.checklista ? 'Stała' : 'Stałe')}</span>
            ${s.pilne ? '<span class="znacznik alarm">Pilne</span>' : ''}
            <span class="znacznik neutral">${esc(s.dla || s.dzialNazwa)}</span>
            ${s.liniaNazwa ? `<span>${esc(s.liniaNazwa)}</span>` : ''}${s.maszyna ? `<span>· ${esc(s.maszyna)}</span>` : ''}

          </div>
          <div class="slaby">${esc(s.harmonogram)}</div>
          ${s.nieZleca ? `<div class="ostrzezenie-stalego">Nie zleca — ${esc(s.nieZleca)}, kliknij „Zmień”</div>` : ''}
          ${s.aktywny && !s.reczny ? `<div class="nastepne">${s.nastepne ? `Następne: ${esc(s.nastepne)}` : 'Brak wystąpień w najbliższych dwóch miesiącach'}</div>` : ''}
        </div>
        <div class="akcje">
          ${zlecaj ? '<button type="button" class="maly glowny" data-akcja="zlec">Zleć teraz</button>' : ''}
          ${pisze ? `<button type="button" class="maly" data-akcja="zmien">Zmień</button>
            <button type="button" class="maly" data-akcja="kopiuj">Kopiuj</button>
            <button type="button" class="maly" data-akcja="wstrzymaj">${s.aktywny ? 'Wstrzymaj' : 'Wznów'}</button>
            <button type="button" class="maly" data-akcja="usun">Usuń</button>` : ''}
        </div>
      </article>`).join('') || `<p class="pusto">Nie ma jeszcze zapisanych zleceń.${pisze ? ' Dodaj pierwsze: „+ Nowe zapisane” albo „💾 Zapisz” przy zleceniu.' : ''}</p>`;
    const brak = pisze ? W.brakujaceZestawu(d.slowniki, hala.pracownik.id) : [];
    $('zestaw-stalych').hidden = !brak.length;
    $('zestaw-stalych').textContent = `+ Zadania mistrza i lidera (${brak.length})`;
  }

  /* Zestaw od właściciela (D34) jednym przyciskiem — tylko brakujące, autor = kto klika (hub zleca w jego imieniu). */
  $('zestaw-stalych').addEventListener('click', async () => {
    const brak = W.brakujaceZestawu(hala.slowniki, hala.pracownik.id);
    if (!brak.length) return;
    if (!(await P.potwierdz('Dodać zadania mistrza i lidera?', `${brak.map(z => z.wartosc.tytul).join(', ')}. `
      + 'Każde potem zmienisz albo wstrzymasz. Zadania mistrza zobaczą osoby z rolą „mistrz”. Zadania lidera przepadają '
      + 'z końcem swojej zmiany; obsadę („Ustaw ludzi na maszyny”) lider ma w checkliście.', 'Dodaj'))) return;
    try {
      for (const z of brak) await hala.zapisz('slownik.zapisany', `zlecenia_stale/${z.kod}`, { slownik: 'zlecenia_stale', klucz: z.kod, wartosc: z.wartosc });
      P.komunikat(`Dodano ${brak.length} — serwer sam zleci je według harmonogramu`, 'ok');
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });

  // ------------------------------------------------------------ okno edycji

  const f = $('formularz-stalego');
  let edytowanyKod = null;
  let poZapisie = null;                      // D55: zgłoszenie → zlecenie stałe (Panel.widoki.zgloszenia)
  // D71: stan kalendarza okna — dni wybrane („w dni wybrane w kalendarzu”), pominięte dni i oglądany miesiąc.
  const kal = { daty: [], pomin: [], rok: 0, miesiac: 0 };

  const zmianySlownik = () => {
    const z = (hala.slowniki && hala.slowniki.zmiany) || {};
    return Object.keys(z).length ? z : { I: { nazwa: 'Zmiana I', od: '06:00' }, II: { nazwa: 'Zmiana II', od: '14:00' }, III: { nazwa: 'Zmiana III', od: '22:00' } };
  };
  const wybrane = n => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);
  const dzis = () => W.dzienZakladu(hala.teraz());
  const dzialyKontraktu = () => ((hala.kontrakt.stale || {}).dzialy || []);
  const pola = () => ({
    tytul: f.tytul.value, opis: f.opis.value, dzialy: wybrane('dzialy'), kto: (f.querySelector('input[name="kto"]:checked') || {}).value || 'dzial',
    wykonawcy: wybrane('osoby'), linia: f.linia.value, maszyna: f.maszyna.value,
    pilne: f.pilne.checked, wymagaj_zdjecia: f.wymagaj_zdjecia.checked, wymagaj_notatki: f.wymagaj_notatki.checked,
    wymagaj_skanu: f.wymagaj_skanu.checked, co_min: f.co_min.value,
    rodzaj: f.rodzaj.value, dni: wybrane('dni'), dzien_miesiaca: f.dzien_miesiaca.value, zmiany: wybrane('zmiany'),
    co: f.co.value, co_tygodni: f.co_tygodni.value, mies_tryb: (f.querySelector('input[name="mies_tryb"]:checked') || {}).value || 'dzien',
    tydzien: f.tydzien.value, dzien_tygodnia: f.dzien_tygodnia.value, od: f.od.value, do: f.do.value, bez_swiat: f.bez_swiat.checked,
    daty: kal.daty, pomin: kal.pomin, dzis: dzis(),
    termin_rodzaj: f.termin_rodzaj.value, godzina: f.godzina.value, minuty: f.minuty.value, aktywny: f.aktywny.checked,
  });

  /* Osoby zaznaczonych działów (każda dostaje własne zlecenie); zaznaczenie zostaje przy zmianie działów. */
  function rysujOsoby(zaznaczone) {
    const dz = new Set(wybrane('dzialy'));
    const widziane = new Set();
    const osoby = [];
    for (const d of dzialyKontraktu()) {
      if (!dz.has(d.kod)) continue;
      for (const [id, n] of P.osobyDzialu(d.kod)) if (!widziane.has(id)) { widziane.add(id); osoby.push([id, n]); }
    }
    $('stale-osoby').innerHTML = osoby.map(([id, n]) => `<label class="zaznacz"><input type="checkbox" name="osoby" value="${esc(id)}" ${zaznaczone.includes(id) ? 'checked' : ''}> ${esc(n)}${
      Hala.naUrlopie(hala.slowniki, id, dzis()) ? ' <span class="slaby">(urlop)</span>' : ''}</label>`).join('')
      || '<span class="slaby">W zaznaczonych działach nikt nie ma konta.</span>';
  }

  /* Mini-kalendarz w oknie: dni zlecenia (●), pominięte (przekreślone, z powodem), święta; dotknięcie przełącza dzień. */
  function rysujKalendarz(wartosc) {
    const h = wartosc ? wartosc.harmonogram : null;
    const pk = W.podgladKalendarza(h && h.rodzaj !== 'reczny' ? h : null, kal.rok, kal.miesiac, dzis());
    $('stale-kal-tytul').textContent = pk.tytul;
    $('stale-kal-siatka').innerHTML = W.DNI_NAZWY.map(n => `<span class="kal-naglowek" aria-hidden="true">${esc(n.slice(0, 2))}</span>`).join('')
      + pk.dni.map(c => `<button type="button" class="kal-dzien-m${c.wMiesiacu ? '' : ' poza'}${c.jest ? ' jest' : ''}${c.pominiety ? ' pominiety' : ''}${c.swieto ? ' swieto' : ''}${c.dzis ? ' dzis' : ''}${c.przeszly ? ' przeszly' : ''}"
          data-data="${c.data}" aria-pressed="${c.jest}" title="${esc(c.pominiety ? `${c.data}: ${c.pominiety}` : c.swieto ? `${c.data}: ${c.swieto}` : c.data)}">${c.dzien}</button>`).join('');
    const r = f.rodzaj.value;
    $('stale-kal-opis').textContent = r === 'reczny' ? 'Pojedyncze zlecasz sam — kalendarz nie dotyczy.'
      : r === 'daty' ? 'Dotknij dni, w które ma być zlecenie (dotknij jeszcze raz, żeby zabrać).'
        : 'Dotknij dnia, żeby go pominąć (np. przestój) — dotknij jeszcze raz, żeby przywrócić.';
    $('stale-kalendarz').classList.toggle('wylaczony', r === 'reczny');
  }

  /* Pokaż tylko pola pasujące do wyborów, podgląd dni i „Trafi do …” — kierownik od razu widzi, kiedy i komu hub zleci. */
  function odswiez() {
    const r = f.rodzaj.value, t = f.termin_rodzaj.value;
    $('stale-dni').hidden = r !== 'dni_tygodnia';
    $('stale-co-tygodni').hidden = r !== 'dni_tygodnia';
    $('stale-dzien').hidden = !(r === 'miesiecznie' && (f.querySelector('input[name="mies_tryb"]:checked') || {}).value !== 'tydzien');
    $('stale-mies').hidden = r !== 'miesiecznie';
    $('stale-co-dni').hidden = r !== 'co_dni';
    $('stale-zakres').hidden = $('stale-swieta').hidden = r === 'reczny' || r === 'daty';
    $('stale-zmiany').hidden = $('stale-zmiany-opis').hidden = $('stale-co').hidden = r === 'reczny';
    $('stale-osoby').hidden = (f.querySelector('input[name="kto"]:checked') || {}).value !== 'osoby';
    P.pokazSkan(f);
    $('stale-godzina').hidden = t !== 'godzina';
    $('stale-minuty').hidden = t !== 'minuty';
    const w = W.stalyZFormularza(pola(), hala.slowniki, edytowanyKod, hala.pracownik && hala.pracownik.id);
    const a = W.adresaciPoLudzku(w.wartosc, hala.kontrakt.stale, hala.pracownicy, hala.slowniki, dzis());
    $('stale-adresaci').textContent = a.tekst;
    $('stale-adresaci').classList.toggle('blad-tekst', !!a.alarm);
    let podglad = '', najblizsze = '';
    if (!w.bledy.length) {
      podglad = W.harmonogramPoLudzku(w.wartosc, hala.slowniki);
      if (r !== 'reczny' && w.wartosc.aktywny) {
        const n = W.najblizszeWystapienia(w.kod, w.wartosc, hala.teraz(), hala.slowniki, 6);
        najblizsze = n.terminy.length ? `Najbliższe: ${n.terminy.map(x => x.opis).join(' · ')}` : 'Brak terminów w najbliższych trzech miesiącach — sprawdź dni i daty.';
        if (n.pominiete.length) najblizsze += ` — pominięte: ${n.pominiete.slice(0, 3).map(x => x.opis).join(', ')}`;
      }
    }
    $('stale-podglad').textContent = podglad;
    $('stale-najblizsze').textContent = najblizsze;
    rysujKalendarz(w.wartosc);
  }

  function ustawMiesiac(data) {
    const m = /^(\d{4})-(\d{2})/.exec(data || dzis());
    kal.rok = +m[1]; kal.miesiac = +m[2];
  }

  function otworz(wartosci, kod, tytulOkna, poZapisieFn) {
    P.podpowiedziCzynnosci();
    edytowanyKod = kod || null;
    poZapisie = poZapisieFn || null;
    f.reset();
    f.querySelector('.blad').hidden = true;
    $('t-okno-stalego').textContent = tytulOkna || (edytowanyKod ? `Zapisane zlecenie: ${wartosci.tytul}` : 'Nowe zapisane zlecenie');
    const dz = (wartosci.dzialy && wartosci.dzialy.length ? wartosci.dzialy : [wartosci.dzial || 'produkcja']);
    $('stale-dzialy').innerHTML = dzialyKontraktu().map(d => `<label class="zaznacz"><input type="checkbox" name="dzialy" value="${esc(d.kod)}" ${dz.includes(d.kod) ? 'checked' : ''}> ${esc(d.nazwa)}</label>`).join('');
    const kto = wartosci.kto || (wartosci.wykonawca ? 'osoby' : 'dzial');
    for (const x of f.querySelectorAll('input[name="kto"]')) x.checked = x.value === kto;
    rysujOsoby(wartosci.wykonawcy && wartosci.wykonawcy.length ? wartosci.wykonawcy : (wartosci.wykonawca ? [wartosci.wykonawca] : []));
    // „— każda —” = jedno zlecenie dla wszystkich liderów; „każda linia osobno” = hub robi po jednym na linię (D34).
    P.pokazPolaLinii(f);
    f.linia.innerHTML = P.opcje([[W.LINIA_KAZDA, '— każda linia osobno —'], ...P.linieLista()], '— każda —');
    f.linia.value = wartosci.linia || '';
    f.maszyna.innerHTML = P.opcje(P.maszynyLinii(f.linia.value === W.LINIA_KAZDA ? '' : f.linia.value), '— żadna —');
    f.maszyna.value = wartosci.maszyna || '';
    f.tytul.value = wartosci.tytul || '';
    f.opis.value = wartosci.opis || '';
    f.pilne.checked = !!wartosci.pilne;
    f.wymagaj_zdjecia.checked = !!wartosci.wymagaj_zdjecia;
    f.wymagaj_notatki.checked = !!wartosci.wymagaj_notatki;
    f.wymagaj_skanu.checked = !!wartosci.wymagaj_skanu;
    f.aktywny.checked = wartosci.aktywny !== false;
    f.rodzaj.value = wartosci.rodzaj || 'reczny';
    f.co_min.value = String(wartosci.co_min || '');
    f.dzien_miesiaca.value = wartosci.dzien_miesiaca || 1;
    f.co.value = wartosci.co || 7;
    f.co_tygodni.value = String(wartosci.co_tygodni || 1);
    for (const x of f.querySelectorAll('input[name="mies_tryb"]')) x.checked = x.value === (wartosci.mies_tryb || 'dzien');
    f.tydzien.value = String(wartosci.tydzien || 1);
    f.dzien_tygodnia.value = String(wartosci.dzien_tygodnia || 1);
    f.od.value = wartosci.od || dzis();
    f.do.value = wartosci.do || '';
    f.bez_swiat.checked = !!wartosci.bez_swiat;
    kal.daty = [...(wartosci.daty || [])];
    kal.pomin = [...(wartosci.pomin || [])];
    ustawMiesiac(kal.daty.filter(d => d >= dzis())[0]);
    f.termin_rodzaj.value = wartosci.termin_rodzaj || 'koniec_zmiany';
    f.godzina.value = wartosci.godzina || '';
    f.minuty.value = wartosci.minuty || 60;
    $('stale-dni').innerHTML = W.DNI_NAZWY.map((n, i) =>
      `<label class="zaznacz"><input type="checkbox" name="dni" value="${i + 1}" ${(wartosci.dni || []).includes(i + 1) ? 'checked' : ''}> ${esc(n)}</label>`).join('');
    $('stale-zmiany').innerHTML = Object.entries(zmianySlownik()).map(([k, z]) =>
      `<label class="zaznacz"><input type="checkbox" name="zmiany" value="${esc(k)}" ${(wartosci.zmiany || []).includes(k) ? 'checked' : ''}> ${esc(z.nazwa || k)} <span class="slaby">${esc(z.od || '')}</span></label>`).join('');
    // Gotowe opcje zależne od dnia (badanie: Google Calendar) — jedno dotknięcie zamiast kilku pól.
    $('stale-presety').innerHTML = W.presetyHarmonogramu(dzis()).map(p => `<button type="button" class="chip maly" data-preset="${esc(p.kod)}">${esc(p.etykieta)}</button>`).join('');
    odswiez();
    $('okno-stalego').showModal();
    f.tytul.focus();
  }

  $('stale-presety').addEventListener('click', ev => {
    const b = ev.target.closest('[data-preset]');
    if (!b) return;
    const p = W.presetyHarmonogramu(dzis()).find(x => x.kod === b.dataset.preset);
    if (!p) return;
    f.rodzaj.value = p.h.rodzaj;
    if (p.h.dni) for (const x of f.querySelectorAll('input[name="dni"]')) x.checked = p.h.dni.includes(+x.value);
    if (p.h.rodzaj === 'dni_tygodnia') f.co_tygodni.value = '1';
    if (p.h.tydzien) {
      for (const x of f.querySelectorAll('input[name="mies_tryb"]')) x.checked = x.value === 'tydzien';
      f.tydzien.value = String(p.h.tydzien);
      f.dzien_tygodnia.value = String(p.h.dzien_tygodnia);
    }
    if (p.h.rodzaj === 'daty') ustawMiesiac();
    odswiez();
  });
  $('stale-wszystkie').addEventListener('click', () => {
    const wszystkie = [...f.querySelectorAll('input[name="dzialy"]')];
    const zaznacz = !wszystkie.every(x => x.checked);
    for (const x of wszystkie) x.checked = zaznacz;
    rysujOsoby(wybrane('osoby'));
    odswiez();
  });
  $('stale-kalendarz').addEventListener('click', ev => {
    const nav = ev.target.closest('[data-mkal]');
    if (nav) {
      const d = new Date(Date.UTC(kal.rok, kal.miesiac - 1 + (+nav.dataset.mkal), 1));
      kal.rok = d.getUTCFullYear(); kal.miesiac = d.getUTCMonth() + 1;
      odswiez();
      return;
    }
    const b = ev.target.closest('[data-data]');
    if (!b || f.rodzaj.value === 'reczny') return;
    const w = W.stalyZFormularza(pola(), hala.slowniki, edytowanyKod, '');
    const h = W.przelaczDzien(Object.assign({}, w.wartosc.harmonogram, { daty: kal.daty, pomin: kal.pomin }), b.dataset.data);
    kal.daty = h.daty || kal.daty;
    kal.pomin = h.pomin || kal.pomin;
    odswiez();
  });

  f.addEventListener('input', odswiez);
  f.addEventListener('change', ev => {
    if (ev.target === f.tytul) {
      // D72: podpowiedź wstawia opis (gdy pusty) i swoje domyślne wymagania — kierownik zmienia je, jak chce.
      const c = W.gotowaCzynnosc(f.tytul.value, hala.slowniki);
      if (c) { if (c.opis && !f.opis.value.trim()) f.opis.value = c.opis; f.wymagaj_zdjecia.checked = !!c.zdjecie; f.wymagaj_notatki.checked = !!c.notatka; }
    }
    if (ev.target.name === 'dzialy') rysujOsoby(wybrane('osoby'));
    if (ev.target === f.linia) f.maszyna.innerHTML = f.linia.value === W.LINIA_KAZDA ? P.opcje([], '— żadna —') : P.opcje(P.maszynyLinii(f.linia.value), '— żadna —');
    if (ev.target === f.rodzaj && f.rodzaj.value === 'daty') ustawMiesiac(kal.daty.filter(d => d >= dzis())[0]);
    odswiez();
  });
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const blad = f.querySelector('.blad');
    const w = W.stalyZFormularza(pola(), hala.slowniki, edytowanyKod, hala.pracownik.id);
    if (w.bledy.length) { blad.textContent = w.bledy.join(' '); blad.hidden = false; return; }
    // „Zmień” nie może zgubić tego, czego okno nie pokazuje (stara czynność, kilka maszyn — D56, D72; audyt 2026-10-16).
    const dawny = edytowanyKod && ((hala.slowniki || {}).zlecenia_stale || {})[edytowanyKod];
    if (dawny) for (const pole of ['czynnosc', 'maszyny']) if (dawny[pole] !== undefined && w.wartosc[pole] === undefined) w.wartosc[pole] = dawny[pole];
    try {
      await hala.zapisz('slownik.zapisany', `zlecenia_stale/${w.kod}`, { slownik: 'zlecenia_stale', klucz: w.kod, wartosc: w.wartosc });
      if (poZapisie) { const fn = poZapisie; poZapisie = null; await fn(w.kod); }
      $('okno-stalego').close();
      P.komunikat(w.wartosc.harmonogram.rodzaj === 'reczny' ? 'Zapisano — zlecasz je przyciskiem „Zleć teraz”'
        : 'Zapisano — serwer sam zleci je według harmonogramu', 'ok');
      P.pokazZlecenia(null, 'stale');
    } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });

  $('nowe-stale').addEventListener('click', () => otworz({ dzial: 'produkcja', rodzaj: 'reczny', dni: [1, 2, 3, 4, 5], zmiany: [],
                                                           termin_rodzaj: 'koniec_zmiany', wymagaj_zdjecia: true, wymagaj_notatki: true,
                                                           bez_swiat: true, aktywny: true }));

  $('lista-stalych').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    const kod = b.closest('[data-kod]').dataset.kod;
    const s = ((hala.slowniki || {}).zlecenia_stale || {})[kod];
    if (!s) return;
    try {
      // D67: checklista (zapisane z pozycjami) ma własne, proste okno (checklisty.js).
      const lista = Array.isArray(s.pozycje) && s.pozycje.length > 0;
      if (b.dataset.akcja === 'zmien') { if (lista) P.widoki.checklisty.otworz(kod); else otworz(W.stalyDoFormularza(s), kod); }
      if (b.dataset.akcja === 'kopiuj') {
        if (lista) P.widoki.checklisty.otworz(kod, true);
        else otworz(Object.assign(W.stalyDoFormularza(s), { tytul: `${s.tytul} (kopia)` }), null, 'Nowe zapisane (kopia)');
      }
      if (b.dataset.akcja === 'zlec' && W.wieluAdresatow(s)) {
        // D71: wiele adresatów — każdy dostaje własne zlecenie od razu (jak w harmonogramie), po potwierdzeniu liczby.
        const cele = Hala.celeStalego(s, (hala.kontrakt.stale || {}).dzialy || [], hala.pracownicy || [], hala.slowniki || {}, dzis());
        if (!cele.length) { P.komunikat('Nikt nie dostanie tego zlecenia — zaznacz osoby albo sprawdź urlopy.', 'blad'); return; }
        const n = cele.length;
        if (!(await P.potwierdz('Zlecić teraz?', `„${s.tytul}” — ${n} ${n === 1 ? 'zlecenie' : n < 5 ? 'zlecenia' : 'zleceń'}, każdy adresat dostaje własne.`, 'Zleć'))) return;
        const zmiana = hala.zmianaTeraz(), teraz = hala.teraz();
        for (const dane of W.zleceniaTeraz(kod, s, cele, zmiana, teraz, W.terminTeraz(s, zmiana, teraz))) {
          await hala.zapisz('zlecenie.utworzone', hala.nowyId(), dane);
        }
        P.komunikat(`Zlecone: ${s.tytul} — ${n} ${n === 1 ? 'zlecenie' : n < 5 ? 'zlecenia' : 'zleceń'}`, 'ok');
      } else if (b.dataset.akcja === 'zlec' && lista) {
        // Zlecenie z pozycjami od razu — okno „Nowe zlecenie” nie ma pozycji.
        const dane = W.checklistaTeraz(kod, s, hala.zmianaTeraz(), hala.teraz(), W.terminTeraz(s, hala.zmianaTeraz(), hala.teraz()));
        await hala.zapisz('zlecenie.utworzone', hala.nowyId(), dane);
        P.komunikat(`Zlecone: ${s.tytul} — dział dostał checklistę`, 'ok');
      } else if (b.dataset.akcja === 'zlec') {
        P.noweZlecenie(W.zlecenieZeStalego(kod, s, W.terminTeraz(s, hala.zmianaTeraz(), hala.teraz())));
      }
      if (b.dataset.akcja === 'wstrzymaj') {
        // Autor = kto zapisuje: od teraz hub zleca w imieniu tej osoby (kontrakt — hub to sprawdza).
        const wartosc = Object.assign({}, s, { aktywny: s.aktywny === false, autor: hala.pracownik.id });
        await hala.zapisz('slownik.zapisany', `zlecenia_stale/${kod}`, { slownik: 'zlecenia_stale', klucz: kod, wartosc });
        P.komunikat(wartosc.aktywny ? 'Wznowione' : 'Wstrzymane — serwer nie będzie go zlecał', 'ok');
      }
      if (b.dataset.akcja === 'usun') {
        if (!(await P.potwierdz('Usunąć zapisane zlecenie?', `„${s.tytul}”. Zlecenia zrobione z niego zostają nietknięte.`, 'Usuń'))) return;
        await hala.zapisz('slownik.usuniety', `zlecenia_stale/${kod}`, { slownik: 'zlecenia_stale', klucz: kod });
        P.komunikat('Usunięto', 'ok');
      }
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });

  /* „Zapisz jako stałe” przy zwykłym zleceniu (jak „Zapisz jako szablon” w GK Trasy). */
  function zZlecenia(z) {
    if (!z) return;
    otworz(W.stalyZZlecenia(z), null, 'Zapisz zlecenie');
  }

  $('nowa-checklista-zlecen').addEventListener('click', () => P.widoki.checklisty.otworz(null));

  /* D71: „Zmień” z kalendarza Zleceń — to samo okno co na liście (checklista — swoje). */
  function otworzKod(kod) {
    const s = ((hala.slowniki || {}).zlecenia_stale || {})[kod];
    if (!s) return;
    if (Array.isArray(s.pozycje) && s.pozycje.length) P.widoki.checklisty.otworz(kod);
    else otworz(W.stalyDoFormularza(s), kod);
  }

  P.widoki.stale = { rysuj, zZlecenia, otworzKod, otworzZ: (wartosci, tytul, fn) => otworz(wartosci, null, tytul, fn) };
})();
