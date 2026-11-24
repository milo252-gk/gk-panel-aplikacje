/* Panel Zarządczy GK — edytor pozycji checklisty (D67; 2026-10-27 część okna „Zapisane zlecenie”).

   Checklista = zapisane zlecenie z pozycjami (słownik zlecenia_stale). Hub robi z niej na każdą wybraną zmianę JEDNO
   zlecenie z pozycjami do odhaczenia (godziny tej zmiany) — dział odhacza je w Zleceniach, lider także na ekranie Zmiana.
   Od 2026-10-27 nie ma osobnego okna „Checklista”: właściciel — „wszędzie powinno dać edytować się zlecenie w pełni i
   zapisuje się to wszędzie” — pozycje edytuje się w tym samym oknie co dla kogo, kiedy, termin i opis (stale.js), a ten plik
   daje im wiersze: godzina od startu zmiany, nazwa, opis (co dokładnie zrobić) i pod „⋯” od godziny, maszyny, 📷 📝 ▣.
   D72: bez typów czynności — „Co zrobić” podpowiada gotowe czynności (raport obsady, obchód BHP…) z domyślnymi wymaganiami;
   stara pozycja z czynnością (D67) zachowuje ją (data-czynnosc) — dalej zalicza się formularzem w GK Produkcja.
   Logika formularza: widok.js → pozycjeZFormularza / stalyZFormularza (testowane). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;

  /* Maszyny pozycji do zaznaczenia (właściciel 2026-10-26: „zlecić sprawdzenie na wszystkich maszynach… wyznaczać kilka
     maszyn”): pola wyboru; zaznaczona maszyna spoza wybranej linii zostaje na liście. */
  function maszynyPozycjiHtml(p, maszyny) {
    const wybrane = new Set(Array.isArray(p.maszyny) && p.maszyny.length ? p.maszyny : (p.maszyna ? [p.maszyna] : []));
    const znane = new Set(maszyny.map(([k]) => k));
    const wszystkie = [...maszyny, ...[...wybrane].filter(k => !znane.has(k)).map(k => [k, `${k} (spoza tej linii)`])];
    return `<fieldset class="maszyny-pozycji"><legend>Maszyny <span class="slaby" data-liczba-maszyn></span></legend>
      <div class="maszyny-akcje"><button type="button" class="maly" data-maszyny="wszystkie">Wszystkie</button>
        <button type="button" class="maly" data-maszyny="zadna">Żadna</button></div>
      <div class="maszyny-lista">${wszystkie.map(([k, n]) => `<label class="zaznacz"><input type="checkbox" class="maszyna-wybor" value="${esc(k)}" ${wybrane.has(k) ? 'checked' : ''}> ${esc(n)}</label>`).join('')
        || '<span class="slaby">Brak maszyn — dodaj je w Administracja → Maszyny.</span>'}</div></fieldset>`;
  }

  /* f — formularz okna; o: { lista: element z wierszami, wklej: pole „Wklej listę” (nieobowiązkowe), linia: () => kod linii albo '', zmianaOd: () => 'HH:MM' pierwszej
     zaznaczonej zmiany, zmiana: () => odświeżenie okna, instancja: () => czy trwa edycja zlecenia (godzin nie zmieniamy) }. */
  // Czynność pozycji → ikona liniowa z gk-ikony.js (obchód to ▣ — znak skanu QR, jak na naklejkach).
  const IKONA_CZYNNOSCI = { obsada: 'konta', proba: 'proba', bhp: 'ratunek', przekazanie: 'zlecenia', przeglad: 'przeglady' };

  function utworz(f, o) {
    const lista = o.lista;

    function wiersz(p) {
      const maszyny = P.maszynyLinii(o.linia());
      return `<div class="pozycja-checklisty" data-id="${esc(p.id || '')}" data-czynnosc="${esc(p.czynnosc || '')}"
          data-z-kodu="${esc(p.z_kodu || '')}" data-termin-iso="${esc(p.termin_iso || '')}" data-od-iso="${esc(p.od_iso || '')}">
        <div class="pozycja-glowna">
          <input class="godzina" value="${esc(p.godzina || '')}" placeholder="0:30" inputmode="numeric" aria-label="Godzina od startu zmiany (g:mm)">
          <span class="godz slaby" aria-hidden="true"></span>
          <input class="nazwa" value="${esc(p.nazwa || '')}" maxlength="200" placeholder="Co zrobić (np. Obchód BHP)" aria-label="Co zrobić" list="podpowiedzi-czynnosci">
          <span class="ikony" aria-hidden="true"></span>
          <button type="button" class="maly" data-szczegoly aria-expanded="false" title="Opis, godzina „od”, maszyny, zdjęcie, notatka, skan">⋯</button>
          <button type="button" class="maly" data-ruch="-1" aria-label="W górę">${P.ik('strzalka-gora')}</button>
          <button type="button" class="maly" data-ruch="1" aria-label="W dół">${P.ik('strzalka-dol')}</button>
          <button type="button" class="maly" data-usun aria-label="Usuń pozycję">${P.ik('zamknij')}</button>
        </div>
        ${/* Opis zawsze na wierzchu (właściciel 2026-10-27: „nie da się edytować opisów zadań”) — jedna linia, rośnie z tekstem. */ ''}
        <textarea class="opis" rows="1" maxlength="2000" aria-label="Opis — co dokładnie zrobić" placeholder="Opis — co dokładnie zrobić (opcjonalnie)">${esc(p.opis || '')}</textarea>
        <div class="pozycja-szczegoly" hidden>${/* zwinięte — w wierszu widać ikony (▣ ⚙ 📷 📝 ⏳) */ ''}
          <label class="pozycja-od" title="Przed tą godziną pozycji nie da się odhaczyć (okno od–do)">${P.ik('klepsydra')}Od godziny (po starcie zmiany)
            <input class="od" value="${esc(p.od || '')}" placeholder="0:15" inputmode="numeric" aria-label="Pozycja do zrobienia od godziny po starcie zmiany (g:mm)"></label>
          ${maszynyPozycjiHtml(p, maszyny)}
          <label class="zaznacz"><input type="checkbox" class="zdjecie" ${p.zdjecie && !p.rcp ? 'checked' : ''}${p.rcp ? ' disabled' : ''}> ${P.ik('aparat')}zdjęcie</label>
          ${W.obslugujeWymogRcp(hala.kontrakt) ? `<label class="zaznacz rcp-wymog"${o.produkcja && !o.produkcja() ? ' hidden' : ''} title="Pozycja odhaczy się sama, gdy Lider albo Mistrz sprawdzi w RCP wszystkich ludzi swojej zmiany i wpisze notatkę. Zastępuje zdjęcie."><input type="checkbox" class="rcp" ${p.rcp ? 'checked' : ''}> ${P.ik('osoba')}ludzie w RCP (zamiast zdjęcia)</label>` : ''}
          <label class="zaznacz"><input type="checkbox" class="notatka" ${p.notatka ? 'checked' : ''}> ${P.ik('notatka')}notatka</label>
          <label class="zaznacz" title="Pozycja odhaczy się sama po zeskanowaniu naklejek QR wszystkich wybranych maszyn"><input type="checkbox" class="skan" ${p.skan ? 'checked' : ''}> ${P.ik('skan')}skan QR wszystkich wybranych maszyn</label>
        </div>
      </div>`;
    }

    /* Pozycje z okna (pola jak w stalyDoFormularza → pozycje); termin_iso/od_iso — godziny trwającej pozycji bez zmian. */
    function odczytaj() {
      return [...lista.querySelectorAll('.pozycja-checklisty')].map(w => {
        const v = c => w.querySelector('.' + c);
        return { id: w.dataset.id || null, godzina: v('godzina').value, od: v('od').value, nazwa: v('nazwa').value, opis: v('opis').value,
                 czynnosc: w.dataset.czynnosc || '', maszyny: [...w.querySelectorAll('.maszyna-wybor:checked')].map(x => x.value),
                 zdjecie: v('zdjecie').checked, notatka: v('notatka').checked, skan: v('skan').checked, rcp: !!(v('rcp') && v('rcp').checked),
                 z_kodu: w.dataset.zKodu || '', termin_iso: w.dataset.terminIso || '', od_iso: w.dataset.odIso || '' };
      });
    }

    /* Godziny pozycji dla pierwszej zaznaczonej zmiany (człowiek myśli „o 6:30”, a nie „+0:30”) i ikony szczegółów. */
    function odswiez() {
      const od = o.zmianaOd();
      const instancja = !!(o.instancja && o.instancja());
      lista.classList.toggle('bez-godzin', instancja);
      // D96: wymóg „RCP” ma sens tylko w checkliście produkcji (Lider/Mistrz) — przy innym dziale chowamy go i oddajemy zdjęcie.
      const produkcja = !o.produkcja || o.produkcja();
      for (const w of lista.querySelectorAll('.pozycja-checklisty')) {
        const rcp = w.querySelector('.rcp');
        if (rcp && !produkcja) { rcp.checked = false; w.querySelector('.zdjecie').disabled = false; }
        if (rcp) rcp.closest('.rcp-wymog').hidden = !produkcja;
        const min = W.minutyZTekstu(w.querySelector('.godzina').value);
        w.querySelector('.godz').textContent = !instancja && w.querySelector('.godzina').value.trim() ? `= ${W.godzinaPozycji(od, min)}`
          : instancja && w.dataset.terminIso ? W.godzina(Date.parse(w.dataset.terminIso)) : '';
        const cz = w.dataset.czynnosc;
        const ile = w.querySelectorAll('.maszyna-wybor:checked').length;
        w.querySelector('.ikony').innerHTML = [cz ? (IKONA_CZYNNOSCI[cz] ? P.ik(IKONA_CZYNNOSCI[cz]) : P.ik('skan')) : '',
          w.querySelector('.zdjecie').checked ? P.ik('aparat') : '', w.querySelector('.rcp') && w.querySelector('.rcp').checked ? P.ik('osoba') : '', w.querySelector('.notatka').checked ? P.ik('notatka') : '', w.querySelector('.skan').checked ? P.ik('skan') : '',
          ile ? `${P.ik('ustawienia')}${ile}` : '', w.querySelector('.od').value.trim() || w.dataset.odIso ? P.ik('klepsydra') : '', w.querySelector('.opis').value.trim() ? P.ik('edytuj') : ''].join('');
        const licznik = w.querySelector('[data-liczba-maszyn]');
        if (licznik) licznik.textContent = ile ? `(zaznaczone: ${ile})` : '';
      }
    }

    function rysuj(pozycje) {
      lista.innerHTML = pozycje.map(wiersz).join('');
      odswiez();
    }

    /* D72: wybrana gotowa czynność ustawia swoje domyślne wymagania — tylko gdy w wierszu nic jeszcze nie zaznaczono. */
    f.addEventListener('change', ev => {
      if (ev.target.matches('.pozycja-checklisty .rcp')) {          // D96: RCP zastępuje zdjęcie — jedno wyklucza drugie
        const zdj = ev.target.closest('.pozycja-checklisty').querySelector('.zdjecie');
        if (ev.target.checked) zdj.checked = false;
        zdj.disabled = ev.target.checked;
      }
      const pole = ev.target.closest('.pozycja-checklisty .nazwa');
      if (pole) {
        const c = W.gotowaCzynnosc(pole.value, hala.slowniki);
        const w = pole.closest('.pozycja-checklisty');
        if (c && !['zdjecie', 'notatka', 'skan'].some(k => w.querySelector('.' + k).checked)) {
          w.querySelector('.zdjecie').checked = !!c.zdjecie;
          w.querySelector('.notatka').checked = !!c.notatka;
          if (c.opis && !w.querySelector('.opis').value.trim()) w.querySelector('.opis').value = c.opis;
        }
      }
      if (ev.target.matches('[data-z-zapisanych]')) {
        const z = W.zadaniaDoChecklisty(hala.slowniki, o.kod && o.kod() ? [o.kod()] : []).find(x => x.kod === ev.target.value);
        ev.target.value = '';
        if (z) rysuj([...odczytaj().filter(p => String(p.nazwa || '').trim()), W.pozycjaZZapisanego(z)]);
      }
      odswiez();
    });
    f.addEventListener('input', ev => { if (lista.contains(ev.target)) odswiez(); });

    /* Pozycje z wklejonego tekstu (jedna w wierszu): zajmują puste wiersze od początku, reszta dochodzi na końcu. */
    function dodajZTekstu(tekst) {
      const nowe = W.pozycjeZTekstu(tekst);
      if (!nowe.length) return 0;
      const obecne = odczytaj();
      const wolne = obecne.filter(p => !String(p.nazwa || '').trim());
      rysuj([...obecne.filter(p => String(p.nazwa || '').trim()), ...nowe.map(p => Object.assign({}, wolne.shift() || {}, p))]);
      return nowe.length;
    }
    /* Enter w nazwie dodaje pozycję pod bieżącą (zamiast zapisywać formularz); w pustej nic nie robi. */
    f.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || !ev.target.matches || !ev.target.matches('.pozycja-checklisty .nazwa, .pozycja-checklisty .godzina')) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const w = ev.target.closest('.pozycja-checklisty');
      if (ev.target.matches('.godzina')) { w.querySelector('.nazwa').focus(); return; }
      if (!ev.target.value.trim()) return;
      w.insertAdjacentHTML('afterend', wiersz({}));
      w.nextElementSibling.querySelector('.godzina').focus();
      odswiez();
      if (o.zmiana) o.zmiana();
    }, true);
    /* Wklejenie kilku wierszy do nazwy rozkłada je na pozycje — bez klikania „Wklej listę”. */
    f.addEventListener('paste', ev => {
      const pole = ev.target.closest && ev.target.closest('.pozycja-checklisty .nazwa');
      const tekst = (ev.clipboardData && ev.clipboardData.getData('text')) || '';
      if (!pole || !/\r?\n.*\S/.test(tekst.trim())) return;
      ev.preventDefault();
      if (dodajZTekstu(tekst) && o.zmiana) o.zmiana();
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
      } else if (b.dataset.maszyny && w) {
        for (const x of w.querySelectorAll('.maszyna-wybor')) x.checked = b.dataset.maszyny === 'wszystkie';
      } else if (b.hasAttribute('data-szczegoly') && w) {
        const s = w.querySelector('.pozycja-szczegoly');
        s.hidden = !s.hidden;
        b.setAttribute('aria-expanded', String(!s.hidden));
      } else if (b.hasAttribute('data-dodaj-pozycje')) {
        lista.insertAdjacentHTML('beforeend', wiersz({}));
        lista.lastElementChild.querySelector('.nazwa').focus();
      } else if (b.hasAttribute('data-wklej-liste') || b.hasAttribute('data-wklej-anuluj')) {
        const otwarte = b.hasAttribute('data-wklej-liste') && o.wklej.hidden;
        o.wklej.hidden = !otwarte;
        f.querySelector('[data-wklej-liste]').setAttribute('aria-expanded', String(otwarte));
        if (otwarte) o.wklej.querySelector('textarea').focus();
        return;
      } else if (b.hasAttribute('data-wklej-dodaj')) {
        const pole = o.wklej.querySelector('textarea');
        dodajZTekstu(pole.value);
        pole.value = '';
        o.wklej.hidden = true;
        f.querySelector('[data-wklej-liste]').setAttribute('aria-expanded', 'false');
      } else return;
      odswiez();
      if (b.dataset.ruch && b.isConnected) b.focus();                  // klawiatura i czytnik ekranu nie tracą miejsca po przesunięciu
      if (o.zmiana) o.zmiana();
    });

    return { rysuj, odczytaj, odswiez, wiersz };
  }

  P.widoki.checklisty = { utworz, rysuj: () => {} };
})();
