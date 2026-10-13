/* Panel Kierownika — urlopy pracowników (D55, właściciel 2026-10-13: „opcja dodania urlopu dla pracownika — żeby nie
   psuć mu statystyk i tymczasowo zawiesić jego zadania”). Administracja → 🏖 Urlopy.

   Zapis: słownik `urlopy` ({osoba, od, do, uwagi?} — `do` włącznie). Skutki: hub nie zleca tej osobie zadań stałych ani
   „Podsumuj zmianę”, jej zlecenia osobiste widzi cały dział (HalaZlecenia), a Wskaźniki → Osoby pomijają zlecenia
   z terminem w dniach urlopu. Czyste funkcje: W.urlopyLista, W.urlopZFormularza (widok.js). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, esc } = P;

  function osobyHali() {
    const dzialy = ((hala.kontrakt.stale || {}).dzialy || []);
    return (hala.pracownicy || []).filter(p => p.aktywny !== false && (p.role || []).some(r => dzialy.some(d => (d.role || []).includes(r))))
      .sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
  }

  const wierszeUrlopow = lista => lista.map(u => `<article class="zlecenie ${u.stan === 'minal' ? 'wyslane' : ''}" data-kod="${esc(u.kod)}">
          <div class="opis"><div class="tytul"><b>${esc(u.nazwa)}</b></div>
            <div class="szczegoly"><span class="znacznik ${u.stan === 'trwa' ? 'uwaga' : 'neutral'}">${esc(u.opis)}</span>
              <span>${esc(u.od)} – ${esc(u.do)}</span>${u.uwagi ? `<span>· ${esc(u.uwagi)}</span>` : ''}</div></div>
          <div class="akcje"><button type="button" class="maly" data-akcja="usun">Usuń</button></div>
        </article>`).join('') || '<p class="pusto">Brak urlopów.</p>';

  function rysuj(el) {
    const lista = W.urlopyLista(hala.slowniki, hala.pracownicy, hala.teraz());
    // Panel przerysowuje Administrację przy każdym zdarzeniu — formularz zostaje (wpisane daty), odświeżamy tylko listę.
    const jest = el.querySelector('#formularz-urlopu');
    if (jest) { const l = el.querySelector('.lista-urlopow'); const h = wierszeUrlopow(lista); if (l.innerHTML !== h) l.innerHTML = h; return; }
    const dzis = W.dzienZakladu(hala.teraz());
    el.innerHTML = `<section class="urlopy">
      <p class="slaby opis-widoku">W czasie urlopu serwer nie zleca osobie zadań stałych ani „Podsumuj zmianę”, jej zlecenia widzi cały dział,
        a statystyki osoby pomijają te dni.</p>
      <form id="formularz-urlopu" class="urlop-formularz" autocomplete="off">
        <label>Osoba<select name="osoba" required><option value="">— wybierz —</option>${osobyHali().map(p => `<option value="${esc(p.id)}">${esc(p.nazwa)}</option>`).join('')}</select></label>
        <label>Od<input name="od" type="date" required value="${esc(dzis)}"></label>
        <label>Do (włącznie)<input name="do" type="date" required value="${esc(dzis)}"></label>
        <label>Uwagi (opcjonalnie)<input name="uwagi" maxlength="500" placeholder="np. L4, urlop wypoczynkowy"></label>
        <button type="submit" class="glowny">+ Dodaj urlop</button>
        <p class="blad" role="alert" hidden></p>
      </form>
      <div class="lista lista-urlopow">${wierszeUrlopow(lista)}</div>
    </section>`;
    const f = el.querySelector('#formularz-urlopu');
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const w = W.urlopZFormularza({ osoba: f.osoba.value, od: f.od.value, do: f.do.value, uwagi: f.uwagi.value }, hala.slowniki);
      const blad = f.querySelector('.blad');
      if (w.bledy.length) { blad.textContent = w.bledy.join(' '); blad.hidden = false; return; }
      try {
        await hala.zapisz('slownik.zapisany', `urlopy/${w.kod}`, { slownik: 'urlopy', klucz: w.kod, wartosc: w.wartosc });
        P.komunikat('Urlop zapisany', 'ok');
        P.narysuj();
      } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
    });
    el.querySelector('.lista-urlopow').addEventListener('click', async ev => {
      const b = ev.target.closest('[data-akcja="usun"]');
      if (!b) return;
      const kod = b.closest('[data-kod]').dataset.kod;
      if (!(await P.potwierdz('Usunąć urlop?', 'Zadania tej osoby wrócą od razu.', 'Usuń'))) return;
      try { await hala.zapisz('slownik.usuniety', `urlopy/${kod}`, { slownik: 'urlopy', klucz: kod }); P.komunikat('Usunięto', 'ok'); P.narysuj(); }
      catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
    });
  }

  P.widoki.urlopy = { rysuj };
})();
