/* Panel Kierownika — okno „Checklista” (D67, właściciel 2026-10-14: „W zleceniach ma być jeden rodzaj checklist — dla
   lidera nie musi być osobnej. Uprość budowanie samych checklist, wydają się przekomplikowane”).

   Checklista = zapisane zlecenie z pozycjami (słownik zlecenia_stale). Hub robi z niej na każdą wybraną zmianę JEDNO
   zlecenie z pozycjami do odhaczenia (godziny tej zmiany) — dział odhacza je w Zleceniach, lider także na ekranie Zmiana.
   Okno ma tylko to, co potrzebne: nazwa, kto (dział, linia, osoba), kiedy (codziennie / w wybrane dni / ręcznie, zmiany)
   i pozycje: godzina od startu zmiany i co zrobić. D72: bez typów czynności — „Co zrobić” podpowiada gotowe czynności
   (raport obsady, obchód BHP…) z domyślnymi wymaganiami, kierownik je zmienia; maszyna i wymagania (📷 📝 ▣) pod „⋯”.
   Stara pozycja z czynnością (D67) zachowuje ją (data-czynnosc) — dalej zalicza się formularzem w GK Lider.
   Zapis: slownik.zapisany zlecenia_stale/<kod>. Logika formularza: widok.js → checklistaZFormularza (testowana). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;

  const f = $('formularz-checklisty');
  let edytowanyKod = null;

  const zmianySlownik = () => {
    const z = (hala.slowniki && hala.slowniki.zmiany) || {};
    return Object.keys(z).length ? z : { I: { nazwa: 'Zmiana I', od: '06:00' }, II: { nazwa: 'Zmiana II', od: '14:00' }, III: { nazwa: 'Zmiana III', od: '22:00' } };
  };
  const wybrane = n => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);

  function wierszPozycji(p) {
    const maszyny = P.maszynyLinii(f.linia.value === W.LINIA_KAZDA ? '' : f.linia.value);
    return `<div class="pozycja-checklisty" data-id="${esc(p.id || '')}" data-czynnosc="${esc(p.czynnosc || '')}">
      <div class="pozycja-glowna">
        <input class="godzina" value="${esc(p.godzina || '')}" placeholder="0:30" inputmode="numeric" aria-label="Godzina od startu zmiany (g:mm)">
        <span class="godz slaby" aria-hidden="true"></span>
        <input class="nazwa" value="${esc(p.nazwa || '')}" maxlength="200" placeholder="Co zrobić (np. Obchód BHP)" aria-label="Co zrobić" list="podpowiedzi-czynnosci">
        <span class="ikony" aria-hidden="true"></span>
        <button type="button" class="maly" data-szczegoly aria-expanded="false" title="Maszyna, zdjęcie, notatka, skan">⋯</button>
        <button type="button" class="maly" data-ruch="-1" aria-label="W górę">↑</button>
        <button type="button" class="maly" data-ruch="1" aria-label="W dół">↓</button>
        <button type="button" class="maly" data-usun aria-label="Usuń pozycję">✕</button>
      </div>
      <div class="pozycja-szczegoly" hidden>${/* zawsze zwinięte — w wierszu widać ikony (👥 ▣ 📷 📝) */ ''}
        <label>Maszyna<select class="maszyna">${P.opcje(maszyny, '— bez maszyny —')}</select></label>
        <label class="zaznacz"><input type="checkbox" class="zdjecie" ${p.zdjecie ? 'checked' : ''}> 📷 zdjęcie</label>
        <label class="zaznacz"><input type="checkbox" class="notatka" ${p.notatka ? 'checked' : ''}> 📝 notatka</label>
        <label class="zaznacz" title="Odhaczy tylko po zeskanowaniu naklejki QR wybranej maszyny"><input type="checkbox" class="skan" ${p.skan ? 'checked' : ''}> ▣ skan QR</label>
      </div>
    </div>`;
  }

  const pozycjeZOkna = () => [...f.querySelectorAll('.pozycja-checklisty')].map(w => {
    const v = c => w.querySelector('.' + c);
    return { id: w.dataset.id || null, godzina: v('godzina').value, nazwa: v('nazwa').value, czynnosc: w.dataset.czynnosc || '',
             maszyna: v('maszyna').value, zdjecie: v('zdjecie').checked, notatka: v('notatka').checked, skan: v('skan').checked };
  });

  /* D72: wybrana gotowa czynność ustawia swoje domyślne wymagania — tylko gdy w wierszu nic jeszcze nie zaznaczono. */
  f.addEventListener('change', ev => {
    const pole = ev.target.closest('.pozycja-checklisty .nazwa');
    if (!pole) return;
    const c = W.gotowaCzynnosc(pole.value, hala.slowniki);
    const w = pole.closest('.pozycja-checklisty');
    if (!c || ['zdjecie', 'notatka', 'skan'].some(k => w.querySelector('.' + k).checked)) return;
    w.querySelector('.zdjecie').checked = !!c.zdjecie;
    w.querySelector('.notatka').checked = !!c.notatka;
    odswiez();
  });

  function rysujPozycje(pozycje) {
    $('checklista-pozycje').innerHTML = pozycje.map(wierszPozycji).join('');
    const wiersze = [...f.querySelectorAll('.pozycja-checklisty')];
    wiersze.forEach((w, i) => { w.querySelector('.maszyna').value = pozycje[i].maszyna || ''; });
    odswiez();
  }

  const pola = () => ({ nazwa: f.nazwa.value, dzial: f.dzial.value, linia: f.linia.value, wykonawca: f.wykonawca.value,
                        rodzaj: f.rodzaj.value, dni: wybrane('dni'), zmiany: wybrane('zmiany'), aktywny: f.aktywny.checked,
                        pozycje: pozycjeZOkna() });

  /* Godziny pozycji dla pierwszej zaznaczonej zmiany (człowiek myśli „o 6:30”, a nie „+0:30”), ikony szczegółów,
     dni tygodnia tylko przy „W wybrane dni” i podgląd „Następna: …”. */
  function odswiez() {
    const zm = zmianySlownik();
    const nr = wybrane('zmiany')[0] || Object.keys(zm)[0];
    const od = (zm[nr] || {}).od;
    for (const w of f.querySelectorAll('.pozycja-checklisty')) {
      const min = W.minutyZTekstu(w.querySelector('.godzina').value);
      w.querySelector('.godz').textContent = w.querySelector('.godzina').value.trim() ? `= ${W.godzinaPozycji(od, min)}` : '';
      const cz = w.dataset.czynnosc;
      w.querySelector('.ikony').textContent = [cz ? (W.CZYNNOSCI_POZYCJI.find(([k]) => k === cz) || ['', ''])[1].split(' ')[0] : '',
        w.querySelector('.zdjecie').checked ? '📷' : '', w.querySelector('.notatka').checked ? '📝' : '', w.querySelector('.skan').checked ? '▣' : ''].join('');
    }
    const r = f.rodzaj.value;
    $('checklista-dni').hidden = r !== 'dni_tygodnia';
    $('checklista-zmiany').hidden = $('checklista-zmiany-opis').hidden = r === 'reczny';
    const w = W.checklistaZFormularza(pola(), hala.slowniki, edytowanyKod, hala.pracownik && hala.pracownik.id);
    let podglad = '';
    if (!w.bledy.length) {
      podglad = W.harmonogramPoLudzku(w.wartosc, hala.slowniki);
      if (r !== 'reczny' && w.wartosc.aktywny) {
        const n = W.nastepneWystapienie(w.kod, w.wartosc, hala.teraz(), hala.slowniki);
        podglad += n ? ` · następna: ${n.opis}` : ' · brak wystąpień w najbliższych dwóch miesiącach';
      }
      const ile = w.wartosc.pozycje.length;
      podglad += ` · ${ile} ${ile === 1 ? 'pozycja' : ile < 5 ? 'pozycje' : 'pozycji'}`;
    }
    $('checklista-podglad').textContent = podglad;
  }

  function linieDzialu(dzial) {
    // Lider i mistrz pracują na liniach — domyślnie „każda linia osobno” (każda linia dostaje swoją checklistę).
    const naLiniach = dzial === 'produkcja' || dzial === 'mistrz';
    f.linia.innerHTML = P.opcje([...(naLiniach ? [[W.LINIA_KAZDA, '— każda linia osobno —']] : []), ...P.linieLista()],
                                naLiniach ? '— wszystkie razem —' : '— bez linii —');
  }

  /* kod = istniejąca checklista; kopia — nowa z jej treścią. */
  function otworz(kod, kopia) {
    P.podpowiedziCzynnosci();
    const s = kod ? ((hala.slowniki || {}).zlecenia_stale || {})[kod] : null;
    const zm = Object.keys(zmianySlownik());
    const w = s ? W.checklistaDoFormularza(s)
      : { nazwa: '', dzial: 'produkcja', linia: W.LINIA_KAZDA, wykonawca: '', rodzaj: 'codziennie', dni: [1, 2, 3, 4, 5], zmiany: zm, aktywny: true,
          pozycje: [{ godzina: '0:30', nazwa: '' }, { godzina: '', nazwa: '' }] };
    edytowanyKod = kopia ? null : kod;
    if (kopia) { w.nazwa = `${w.nazwa} (kopia)`; w.pozycje.forEach(p => { delete p.id; }); }
    $('t-okno-checklisty').textContent = edytowanyKod ? `Checklista: ${w.nazwa}` : kopia ? 'Nowa checklista (kopia)' : 'Nowa checklista';
    f.querySelector('.blad').hidden = true;
    f.nazwa.value = w.nazwa;
    f.dzial.innerHTML = P.opcje(((hala.kontrakt.stale || {}).dzialy || []).filter(d => d.kod !== 'kierownik').map(d => [d.kod, d.nazwa]));
    f.dzial.value = w.dzial;
    linieDzialu(w.dzial);
    P.pokazPolaLinii(f);
    f.linia.value = w.linia || '';
    f.wykonawca.innerHTML = P.opcje(P.osobyDzialu(f.dzial.value), '— cały dział —');
    f.wykonawca.value = w.wykonawca || '';
    f.rodzaj.value = ['codziennie', 'dni_tygodnia', 'reczny'].includes(w.rodzaj) ? w.rodzaj : 'codziennie';
    $('checklista-dni').innerHTML = W.DNI_NAZWY.map((n, i) =>
      `<label class="zaznacz"><input type="checkbox" name="dni" value="${i + 1}" ${(w.dni || []).includes(i + 1) ? 'checked' : ''}> ${esc(n)}</label>`).join('');
    $('checklista-zmiany').innerHTML = Object.entries(zmianySlownik()).map(([k, z]) =>
      `<label class="zaznacz"><input type="checkbox" name="zmiany" value="${esc(k)}" ${(w.zmiany || []).includes(k) ? 'checked' : ''}> ${esc(z.nazwa || k)} <span class="slaby">${esc(z.od || '')}</span></label>`).join('');
    f.aktywny.checked = w.aktywny !== false;
    rysujPozycje(w.pozycje.length ? w.pozycje : [{}]);
    // Właściciel 2026-10-13: pozycje także z zapisanych zleceń — bez pisania drugi raz.
    const zapisane = W.zadaniaDoChecklisty(hala.slowniki);
    const z = f.querySelector('[data-z-zapisanych]');
    z.innerHTML = `<option value="">${zapisane.length ? '➕ Z zapisanych…' : '➕ Z zapisanych — brak'}</option>`
      + zapisane.map(x => `<option value="${esc(x.kod)}">${esc(x.opisWyboru)}</option>`).join('');
    z.disabled = !zapisane.length;
    $('okno-checklisty').showModal();
    f.nazwa.focus();
  }

  f.addEventListener('input', odswiez);
  f.addEventListener('change', ev => {
    if (ev.target === f.dzial) {
      linieDzialu(f.dzial.value);
      f.wykonawca.innerHTML = P.opcje(P.osobyDzialu(f.dzial.value), '— cały dział —');
    }
    if (ev.target === f.linia) rysujPozycje(pozycjeZOkna());          // maszyny do wyboru — z wybranej linii
    if (ev.target.matches('[data-z-zapisanych]')) {
      const z = W.zadaniaDoChecklisty(hala.slowniki).find(x => x.kod === ev.target.value);
      ev.target.value = '';
      if (z) rysujPozycje([...pozycjeZOkna().filter(p => String(p.nazwa || '').trim()), W.pozycjaZZapisanego(z)]);
    }
    odswiez();
  });
  f.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const w = b.closest('.pozycja-checklisty');
    if (b.dataset.ruch && w) {
      const cel = +b.dataset.ruch < 0 ? w.previousElementSibling : w.nextElementSibling;
      if (cel) (+b.dataset.ruch < 0 ? cel.before(w) : cel.after(w));
    } else if (b.hasAttribute('data-usun') && w) {
      w.remove();
    } else if (b.hasAttribute('data-szczegoly') && w) {
      const s = w.querySelector('.pozycja-szczegoly');
      s.hidden = !s.hidden;
      b.setAttribute('aria-expanded', String(!s.hidden));
    } else if (b.hasAttribute('data-dodaj-pozycje')) {
      $('checklista-pozycje').insertAdjacentHTML('beforeend', wierszPozycji({}));
      $('checklista-pozycje').lastElementChild.querySelector('.godzina').focus();
    } else if (b.hasAttribute('data-zamknij')) {
      $('okno-checklisty').close();
    }
    odswiez();
  });

  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const blad = f.querySelector('.blad');
    const w = W.checklistaZFormularza(pola(), hala.slowniki, edytowanyKod, hala.pracownik.id);
    if (w.bledy.length) { blad.textContent = w.bledy.join(' '); blad.hidden = false; return; }
    try {
      await hala.zapisz('slownik.zapisany', `zlecenia_stale/${w.kod}`, { slownik: 'zlecenia_stale', klucz: w.kod, wartosc: w.wartosc });
      $('okno-checklisty').close();
      P.komunikat(w.wartosc.harmonogram.rodzaj === 'reczny' ? 'Checklista zapisana — zlecasz ją „Zleć teraz”'
        : 'Checklista zapisana — serwer sam zleci ją na wybrane zmiany', 'ok');
      P.pokazZlecenia(null, 'stale');
    } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });

  P.widoki.checklisty = { otworz, rysuj: () => {} };
})();
