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
          <div><b>${esc(s.tytul)}</b> ${s.wymagajZdjecia ? '<span title="Wymagane zdjęcie">📷</span>' : ''}${s.wymagajNotatki ? '<span title="Wymagana notatka">📝</span>' : ''}</div>
          <div class="szczegoly">
            <span class="znacznik ${s.aktywny ? 'ok' : ''}">${s.aktywny ? 'Aktywne' : 'Wstrzymane'}</span>
            ${s.pilne ? '<span class="znacznik alarm">Pilne</span>' : ''}
            <span class="znacznik neutral">${esc(s.dzialNazwa)}</span>
            ${s.liniaNazwa ? `<span>${esc(s.liniaNazwa)}</span>` : ''}${s.maszyna ? `<span>· ${esc(s.maszyna)}</span>` : ''}
            ${s.osoba ? `<span>· dla: ${esc(s.osoba)}</span>` : ''}
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
      </article>`).join('') || `<p class="pusto">Nie ma jeszcze zleceń stałych.${pisze ? ' Dodaj pierwsze: „+ Nowe zlecenie stałe”.' : ''}</p>`;
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
      P.komunikat(`Dodano ${brak.length} — hub sam zleci je według harmonogramu`, 'ok');
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });

  // ------------------------------------------------------------ okno edycji

  const f = $('formularz-stalego');
  let edytowanyKod = null;

  const zmianySlownik = () => {
    const z = (hala.slowniki && hala.slowniki.zmiany) || {};
    return Object.keys(z).length ? z : { I: { nazwa: 'Zmiana I', od: '06:00' }, II: { nazwa: 'Zmiana II', od: '14:00' }, III: { nazwa: 'Zmiana III', od: '22:00' } };
  };
  const wybrane = n => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);
  const pola = () => ({
    tytul: f.tytul.value, opis: f.opis.value, dzial: f.dzial.value, linia: f.linia.value, maszyna: f.maszyna.value,
    wykonawca: f.wykonawca.value, pilne: f.pilne.checked, wymagaj_zdjecia: f.wymagaj_zdjecia.checked, wymagaj_notatki: f.wymagaj_notatki.checked,
    rodzaj: f.rodzaj.value, dni: wybrane('dni'), dzien_miesiaca: f.dzien_miesiaca.value, zmiany: wybrane('zmiany'),
    termin_rodzaj: f.termin_rodzaj.value, godzina: f.godzina.value, minuty: f.minuty.value, aktywny: f.aktywny.checked,
  });

  /* Pokaż tylko pola pasujące do wyborów i podgląd „Następne: …” — kierownik od razu widzi, kiedy hub zleci. */
  function odswiez() {
    const r = f.rodzaj.value, t = f.termin_rodzaj.value;
    $('stale-dni').hidden = r !== 'dni_tygodnia';
    $('stale-dzien').hidden = r !== 'miesiecznie';
    $('stale-zmiany').hidden = $('stale-zmiany-opis').hidden = r === 'reczny';
    $('stale-godzina').hidden = t !== 'godzina';
    $('stale-minuty').hidden = t !== 'minuty';
    const w = W.stalyZFormularza(pola(), hala.slowniki, edytowanyKod, hala.pracownik && hala.pracownik.id);
    let podglad = '';
    if (!w.bledy.length) {
      podglad = W.harmonogramPoLudzku(w.wartosc, hala.slowniki);
      if (r !== 'reczny' && w.wartosc.aktywny) {
        const n = W.nastepneWystapienie(w.kod, w.wartosc, hala.teraz(), hala.slowniki);
        podglad += n ? ` · następne: ${n.opis}` : ' · brak wystąpień w najbliższych dwóch miesiącach';
      }
    }
    $('stale-podglad').textContent = podglad;
  }

  function otworz(wartosci, kod, tytulOkna) {
    const sl = hala.slowniki || {};
    edytowanyKod = kod || null;
    f.reset();
    f.querySelector('.blad').hidden = true;
    $('t-okno-stalego').textContent = tytulOkna || (edytowanyKod ? `Zlecenie stałe: ${wartosci.tytul}` : 'Nowe zlecenie stałe');
    f.dzial.innerHTML = P.opcje(((hala.kontrakt.stale || {}).dzialy || []).map(d => [d.kod, d.nazwa]));
    f.dzial.value = wartosci.dzial || 'produkcja';
    // „— każda —” = jedno zlecenie dla wszystkich liderów; „każda linia osobno” = hub robi po jednym na linię (D34).
    f.linia.innerHTML = P.opcje([[W.LINIA_KAZDA, '— każda linia osobno —'], ...P.linieLista()], '— każda —');
    f.linia.value = wartosci.linia || '';
    f.maszyna.innerHTML = P.opcje(P.maszynyLinii(f.linia.value === W.LINIA_KAZDA ? '' : f.linia.value), '— żadna —');
    f.maszyna.value = wartosci.maszyna || '';
    f.wykonawca.innerHTML = P.opcje(P.osobyDzialu(f.dzial.value), '— cały dział —');
    f.wykonawca.value = wartosci.wykonawca || '';
    f.tytul.value = wartosci.tytul || '';
    f.opis.value = wartosci.opis || '';
    f.pilne.checked = !!wartosci.pilne;
    f.wymagaj_zdjecia.checked = !!wartosci.wymagaj_zdjecia;
    f.wymagaj_notatki.checked = !!wartosci.wymagaj_notatki;
    f.aktywny.checked = wartosci.aktywny !== false;
    f.rodzaj.value = wartosci.rodzaj || 'codziennie';
    f.dzien_miesiaca.value = wartosci.dzien_miesiaca || 1;
    f.termin_rodzaj.value = wartosci.termin_rodzaj || 'koniec_zmiany';
    f.godzina.value = wartosci.godzina || '';
    f.minuty.value = wartosci.minuty || 60;
    $('stale-dni').innerHTML = W.DNI_NAZWY.map((n, i) =>
      `<label class="zaznacz"><input type="checkbox" name="dni" value="${i + 1}" ${(wartosci.dni || []).includes(i + 1) ? 'checked' : ''}> ${esc(n)}</label>`).join('');
    $('stale-zmiany').innerHTML = Object.entries(zmianySlownik()).map(([k, z]) =>
      `<label class="zaznacz"><input type="checkbox" name="zmiany" value="${esc(k)}" ${(wartosci.zmiany || []).includes(k) ? 'checked' : ''}> ${esc(z.nazwa || k)} <span class="slaby">${esc(z.od || '')}</span></label>`).join('');
    odswiez();
    $('okno-stalego').showModal();
    f.tytul.focus();
  }

  f.addEventListener('input', odswiez);
  f.addEventListener('change', ev => {
    if (ev.target === f.dzial) f.wykonawca.innerHTML = P.opcje(P.osobyDzialu(f.dzial.value), '— cały dział —');
    if (ev.target === f.linia) f.maszyna.innerHTML = f.linia.value === W.LINIA_KAZDA ? P.opcje([], '— żadna —') : P.opcje(P.maszynyLinii(f.linia.value), '— żadna —');
    odswiez();
  });
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const w = W.stalyZFormularza(pola(), hala.slowniki, edytowanyKod, hala.pracownik.id);
    const blad = f.querySelector('.blad');
    if (w.bledy.length) { blad.textContent = w.bledy.join(' '); blad.hidden = false; return; }
    try {
      await hala.zapisz('slownik.zapisany', `zlecenia_stale/${w.kod}`, { slownik: 'zlecenia_stale', klucz: w.kod, wartosc: w.wartosc });
      $('okno-stalego').close();
      P.komunikat(w.wartosc.harmonogram.rodzaj === 'reczny' ? 'Zapisano — zlecasz je przyciskiem „Zleć teraz”'
        : 'Zapisano — hub sam zleci je według harmonogramu', 'ok');
      P.pokazZlecenia(null, 'stale');
    } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });

  $('nowe-stale').addEventListener('click', () => otworz({ dzial: 'produkcja', rodzaj: 'codziennie', dni: [1, 2, 3, 4, 5], zmiany: [],
                                                           termin_rodzaj: 'koniec_zmiany', wymagaj_zdjecia: true, wymagaj_notatki: true, aktywny: true }));

  $('lista-stalych').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    const kod = b.closest('[data-kod]').dataset.kod;
    const s = ((hala.slowniki || {}).zlecenia_stale || {})[kod];
    if (!s) return;
    try {
      if (b.dataset.akcja === 'zmien') otworz(W.stalyDoFormularza(s), kod);
      if (b.dataset.akcja === 'kopiuj') otworz(Object.assign(W.stalyDoFormularza(s), { tytul: `${s.tytul} (kopia)` }), null, 'Nowe zlecenie stałe (kopia)');
      if (b.dataset.akcja === 'zlec') {
        P.noweZlecenie(W.zlecenieZeStalego(kod, s, W.terminTeraz(s, hala.zmianaTeraz(), hala.teraz())));
      }
      if (b.dataset.akcja === 'wstrzymaj') {
        // Autor = kto zapisuje: od teraz hub zleca w imieniu tej osoby (kontrakt — hub to sprawdza).
        const wartosc = Object.assign({}, s, { aktywny: s.aktywny === false, autor: hala.pracownik.id });
        await hala.zapisz('slownik.zapisany', `zlecenia_stale/${kod}`, { slownik: 'zlecenia_stale', klucz: kod, wartosc });
        P.komunikat(wartosc.aktywny ? 'Wznowione' : 'Wstrzymane — hub nie będzie go zlecał', 'ok');
      }
      if (b.dataset.akcja === 'usun') {
        if (!(await P.potwierdz('Usunąć zlecenie stałe?', `„${s.tytul}”. Zlecenia zrobione z niego zostają nietknięte.`, 'Usuń'))) return;
        await hala.zapisz('slownik.usuniety', `zlecenia_stale/${kod}`, { slownik: 'zlecenia_stale', klucz: kod });
        P.komunikat('Usunięto', 'ok');
      }
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });

  /* „Zapisz jako stałe” przy zwykłym zleceniu (jak „Zapisz jako szablon” w GK Trasy). */
  function zZlecenia(z) {
    if (!z) return;
    otworz(W.stalyZZlecenia(z), null, 'Zapisz jako zlecenie stałe');
  }

  P.widoki.stale = { rysuj, zZlecenia };
})();
