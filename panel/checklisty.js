/* Panel Kierownika — edytor pozycji checklisty (D67; 2026-10-27 część okna „Zapisane zlecenie”).

   Checklista = zapisane zlecenie z pozycjami (słownik zlecenia_stale). Hub robi z niej na każdą wybraną zmianę JEDNO
   zlecenie z pozycjami do odhaczenia (godziny tej zmiany) — dział odhacza je w Zleceniach, lider także na ekranie Zmiana.
   Od 2026-10-27 nie ma osobnego okna „Checklista”: właściciel — „wszędzie powinno dać edytować się zlecenie w pełni i
   zapisuje się to wszędzie” — pozycje edytuje się w tym samym oknie co dla kogo, kiedy, termin i opis (stale.js), a ten plik
   daje im wiersze: godzina od startu zmiany, nazwa, opis (co dokładnie zrobić) i pod „⋯” od godziny, maszyny, 📷 📝 ▣.
   D72: bez typów czynności — „Co zrobić” podpowiada gotowe czynności (raport obsady, obchód BHP…) z domyślnymi wymaganiami;
   stara pozycja z czynnością (D67) zachowuje ją (data-czynnosc) — dalej zalicza się formularzem w GK Lider.
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

  /* f — formularz okna; o: { lista: element z wierszami, linia: () => kod linii albo '', zmianaOd: () => 'HH:MM' pierwszej
     zaznaczonej zmiany, zmiana: () => odświeżenie okna, instancja: () => czy trwa edycja zlecenia (godzin nie zmieniamy) }. */
  function utworz(f, o) {
    const lista = o.lista;

    function wiersz(p) {
      const maszyny = P.maszynyLinii(o.linia());
      return `<div class="pozycja-checklisty" data-id="${esc(p.id || '')}" data-czynnosc="${esc(p.czynnosc || '')}"
          data-termin-iso="${esc(p.termin_iso || '')}" data-od-iso="${esc(p.od_iso || '')}">
        <div class="pozycja-glowna">
          <input class="godzina" value="${esc(p.godzina || '')}" placeholder="0:30" inputmode="numeric" aria-label="Godzina od startu zmiany (g:mm)">
          <span class="godz slaby" aria-hidden="true"></span>
          <input class="nazwa" value="${esc(p.nazwa || '')}" maxlength="200" placeholder="Co zrobić (np. Obchód BHP)" aria-label="Co zrobić" list="podpowiedzi-czynnosci">
          <span class="ikony" aria-hidden="true"></span>
          <button type="button" class="maly" data-szczegoly aria-expanded="false" title="Opis, godzina „od”, maszyny, zdjęcie, notatka, skan">⋯</button>
          <button type="button" class="maly" data-ruch="-1" aria-label="W górę">↑</button>
          <button type="button" class="maly" data-ruch="1" aria-label="W dół">↓</button>
          <button type="button" class="maly" data-usun aria-label="Usuń pozycję">✕</button>
        </div>
        ${/* Opis zawsze na wierzchu (właściciel 2026-10-27: „nie da się edytować opisów zadań”) — jedna linia, rośnie z tekstem. */ ''}
        <textarea class="opis" rows="1" maxlength="2000" aria-label="Opis — co dokładnie zrobić" placeholder="Opis — co dokładnie zrobić (opcjonalnie)">${esc(p.opis || '')}</textarea>
        <div class="pozycja-szczegoly" hidden>${/* zwinięte — w wierszu widać ikony (▣ ⚙ 📷 📝 ⏳) */ ''}
          <label class="pozycja-od" title="Przed tą godziną pozycji nie da się odhaczyć (okno od–do)">⏳ Od godziny (po starcie zmiany)
            <input class="od" value="${esc(p.od || '')}" placeholder="0:15" inputmode="numeric" aria-label="Pozycja do zrobienia od godziny po starcie zmiany (g:mm)"></label>
          ${maszynyPozycjiHtml(p, maszyny)}
          <label class="zaznacz"><input type="checkbox" class="zdjecie" ${p.zdjecie ? 'checked' : ''}> 📷 zdjęcie</label>
          <label class="zaznacz"><input type="checkbox" class="notatka" ${p.notatka ? 'checked' : ''}> 📝 notatka</label>
          <label class="zaznacz" title="Pozycja odhaczy się sama po zeskanowaniu naklejek QR wszystkich wybranych maszyn"><input type="checkbox" class="skan" ${p.skan ? 'checked' : ''}> ▣ skan QR wszystkich wybranych maszyn</label>
        </div>
      </div>`;
    }

    /* Pozycje z okna (pola jak w stalyDoFormularza → pozycje); termin_iso/od_iso — godziny trwającej pozycji bez zmian. */
    function odczytaj() {
      return [...lista.querySelectorAll('.pozycja-checklisty')].map(w => {
        const v = c => w.querySelector('.' + c);
        return { id: w.dataset.id || null, godzina: v('godzina').value, od: v('od').value, nazwa: v('nazwa').value, opis: v('opis').value,
                 czynnosc: w.dataset.czynnosc || '', maszyny: [...w.querySelectorAll('.maszyna-wybor:checked')].map(x => x.value),
                 zdjecie: v('zdjecie').checked, notatka: v('notatka').checked, skan: v('skan').checked,
                 termin_iso: w.dataset.terminIso || '', od_iso: w.dataset.odIso || '' };
      });
    }

    /* Godziny pozycji dla pierwszej zaznaczonej zmiany (człowiek myśli „o 6:30”, a nie „+0:30”) i ikony szczegółów. */
    function odswiez() {
      const od = o.zmianaOd();
      const instancja = !!(o.instancja && o.instancja());
      lista.classList.toggle('bez-godzin', instancja);
      for (const w of lista.querySelectorAll('.pozycja-checklisty')) {
        const min = W.minutyZTekstu(w.querySelector('.godzina').value);
        w.querySelector('.godz').textContent = !instancja && w.querySelector('.godzina').value.trim() ? `= ${W.godzinaPozycji(od, min)}`
          : instancja && w.dataset.terminIso ? W.godzina(Date.parse(w.dataset.terminIso)) : '';
        const cz = w.dataset.czynnosc;
        const ile = w.querySelectorAll('.maszyna-wybor:checked').length;
        w.querySelector('.ikony').textContent = [cz ? (W.CZYNNOSCI_POZYCJI.find(([k]) => k === cz) || ['', ''])[1].split(' ')[0] : '',
          w.querySelector('.zdjecie').checked ? '📷' : '', w.querySelector('.notatka').checked ? '📝' : '', w.querySelector('.skan').checked ? '▣' : '',
          ile ? `⚙${ile}` : '', w.querySelector('.od').value.trim() || w.dataset.odIso ? '⏳' : '', w.querySelector('.opis').value.trim() ? '✎' : ''].join('');
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
      } else return;
      odswiez();
      if (b.dataset.ruch && b.isConnected) b.focus();                  // klawiatura i czytnik ekranu nie tracą miejsca po przesunięciu
      if (o.zmiana) o.zmiana();
    });

    return { rysuj, odczytaj, odswiez, wiersz };
  }

  P.widoki.checklisty = { utworz, rysuj: () => {} };
})();
