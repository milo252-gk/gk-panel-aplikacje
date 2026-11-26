/* Urlopy zespołu — jeden ekran dla Panelu Zarządczego GK (Administracja → Urlopy) i aplikacji GK Utrzymanie Ruchu i GK Kontrola Jakości
   („Więcej” → Urlopy zespołu: lider UR, kierownik KJ, Menedżer). Właściciel 2026-11-26: ten sam ekran co w Panelu, wspólny kod — nie kopia.

   Zapis: słownik `urlopy` ({osoba, od, do, uwagi?} — `do` włącznie, D55) przez hala.zapisz (kolejka offline jak każdy zapis). Skutki: hub nie zleca
   tej osobie zapisanych zleceń, jej zlecenia widzi cały dział, statystyki pomijają te dni. Kto komu wpisuje — R5 (D82): lider UR i kierownik KJ tylko
   osobom ze swojego działu, Kierownik i Menedżer wszystkim; reguła jest w hubie (blad_urlopu_osoby), lista osób tylko ją odzwierciedla.
   Czyste funkcje: Hala.urlopyLista, Hala.osobyDoUrlopow, Hala.urlopZFormularza (hala.js — testy w reduktor-testy.js i widok-testy Panelu).

   HalaUrlopy.rysuj(el, hala, {
     komunikat(tekst, rodzaj),           // 'ok' | 'blad' — dymek aplikacji
     potwierdz(tytul, tresc, tak),       // własne okno pytania aplikacji → Promise<bool>
     komunikatBledu(e),                  // tekst błędu zapisu po polsku
     odswiez(),                          // przerysowanie po zapisie (Panel: P.narysuj)
     klasaWiersza,                       // klasa karty wiersza: Panel 'zlecenie', UR/KJ 'karta' (domyślnie)
     tytul,                              // nagłówek ekranu (UR/KJ: „Urlopy zespołu”; Panel bez — ma chip „Urlopy”)
   }) */
(function (global) {
  'use strict';

  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function wiersze(lista, klasa) {
    return lista.map(u => `<article class="${esc(klasa)} hala-urlop ${u.stan === 'minal' ? 'wyslane' : ''}" data-kod="${esc(u.kod)}">
          <div class="opis"><div class="tytul"><b>${esc(u.nazwa)}</b></div>
            <div class="szczegoly"><span class="znacznik ${u.stan === 'trwa' ? 'uwaga' : 'neutral'}">${esc(u.opis)}</span>
              <span>${esc(u.od)} – ${esc(u.do)}</span>${u.uwagi ? `<span>· ${esc(u.uwagi)}</span>` : ''}</div></div>
          <div class="akcje"><button type="button" class="maly" data-akcja="usun">Usuń</button></div>
        </article>`).join('') || '<p class="pusto">Brak urlopów.</p>';
  }

  function rysuj(el, hala, opcje) {
    const H = global.Hala;
    const o = opcje || {};
    const klasa = o.klasaWiersza || 'karta';
    const dzialy = ((hala.kontrakt && hala.kontrakt.stale) || {}).dzialy || [];
    const osoby = H.osobyDoUrlopow(hala.pracownicy, hala.pracownik, dzialy);
    const swoi = new Set(osoby.map(p => p.id));
    const lista = H.urlopyLista(hala.slowniki, hala.pracownicy, hala.teraz()).filter(u => swoi.has(u.osoba));
    // Aplikacje przerysowują ekran przy każdym zdarzeniu — formularz zostaje (wpisane daty), odświeżamy tylko listę.
    const jest = el.querySelector('#formularz-urlopu');
    if (jest) { const l = el.querySelector('.lista-urlopow'); const h = wiersze(lista, klasa); if (l.innerHTML !== h) l.innerHTML = h; return; }
    const dzis = H.dzienZakladu(hala.teraz());
    el.innerHTML = `${o.tytul ? `<h1>${esc(o.tytul)}</h1>` : ''}<section class="urlopy hala-urlopy">
      <p class="slaby opis-widoku">W czasie urlopu serwer nie zleca osobie zapisanych zleceń, jej zlecenia widzi cały dział,
        a statystyki osoby pomijają te dni.${H.dzialyKierownika(hala.pracownik && hala.pracownik.role, dzialy) !== null ? ' Wpisujesz urlopy osób ze swojego działu; pozostałym wpisuje je Kierownik.' : ''}</p>
      <form id="formularz-urlopu" class="urlop-formularz" autocomplete="off" novalidate>
        <label>Osoba<select name="osoba" required><option value="">— wybierz —</option>${osoby.map(p => `<option value="${esc(p.id)}">${esc(p.nazwa)}</option>`).join('')}</select></label>
        <label>Od<input name="od" type="date" required value="${esc(dzis)}"></label>
        <label>Do (włącznie)<input name="do" type="date" required value="${esc(dzis)}"></label>
        <label>Uwagi (opcjonalnie)<input name="uwagi" maxlength="500" placeholder="np. L4, urlop wypoczynkowy"></label>
        <button type="submit" class="glowny">+ Dodaj urlop</button>
        <p class="blad" role="alert" hidden></p>
      </form>
      <div class="lista lista-urlopow">${wiersze(lista, klasa)}</div>
    </section>`;
    const f = el.querySelector('#formularz-urlopu');
    const odswiez = () => { if (o.odswiez) o.odswiez(); };
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const w = H.urlopZFormularza({ osoba: f.osoba.value, od: f.od.value, do: f.do.value, uwagi: f.uwagi.value }, hala.slowniki);
      const blad = f.querySelector('.blad');
      if (w.bledy.length) { blad.textContent = w.bledy.join(' '); blad.hidden = false; return; }
      blad.hidden = true;
      try {
        await hala.zapisz('slownik.zapisany', `urlopy/${w.kod}`, { slownik: 'urlopy', klucz: w.kod, wartosc: w.wartosc });
        if (o.komunikat) o.komunikat('Urlop zapisany', 'ok');
        odswiez();
      } catch (e) { blad.textContent = o.komunikatBledu ? o.komunikatBledu(e) : String((e && e.message) || e); blad.hidden = false; }
    });
    el.querySelector('.lista-urlopow').addEventListener('click', async ev => {
      const b = ev.target.closest('[data-akcja="usun"]');
      if (!b) return;
      const kod = b.closest('[data-kod]').dataset.kod;
      if (o.potwierdz && !(await o.potwierdz('Usunąć urlop?', 'Zlecenia tej osoby wrócą od razu.', 'Usuń'))) return;
      try {
        await hala.zapisz('slownik.usuniety', `urlopy/${kod}`, { slownik: 'urlopy', klucz: kod });
        if (o.komunikat) o.komunikat('Usunięto', 'ok');
        odswiez();
      } catch (e) { if (o.komunikat) o.komunikat(o.komunikatBledu ? o.komunikatBledu(e) : String((e && e.message) || e), 'blad'); }
    });
  }

  global.HalaUrlopy = { rysuj };
})(typeof window !== 'undefined' ? window : globalThis);
