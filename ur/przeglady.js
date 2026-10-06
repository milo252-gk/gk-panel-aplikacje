/* Przeglądy (utrzymanie prewencyjne): plan na dziś / tydzień z opóźnionymi na górze,
   karta przeglądu (skan QR maszyny → punkty kontrolne → zakończenie), ręczne
   zaplanowanie i liczniki maszyn (motogodziny, cykle — odczyt ręczny, O5).

   Każdy punkt zapisuje się sam, zdarzeniem przeglad.punkt, w chwili wyboru albo
   wyjścia z pola — nie ma „Zapisz” na końcu, więc rozładowany telefon nie kasuje
   przeglądu. Kolejny zapis tego samego punktu nadpisuje poprzedni (mapa w kontrakcie),
   dlatego wysyłamy zawsze pełny wpis punktu: wynik, wartość, uwagi i zdjęcia.        */

(function (global) {
  'use strict';

  const UR = global.UR, W = UR.W, hala = UR.hala, esc = UR.esc;
  const KLUCZ_FILTRA = 'hala.ur.filtrPrzegladow';
  const filtr = {
    czytaj() { try { return localStorage.getItem(KLUCZ_FILTRA) || 'wszystkie'; } catch (e) { return 'wszystkie'; } },
    zapisz(v) { try { localStorage.setItem(KLUCZ_FILTRA, v); } catch (e) { /* bez pamięci też działa */ } },
  };

  async function zapisz(typ, obiekt, dane, dobrze) {
    try {
      await hala.zapisz(typ, obiekt, dane || {});
      if (dobrze) { UR.brzeczyk.ok(); UR.komunikat(dobrze); }
      return true;
    } catch (e) {
      UR.komunikat(e.message || 'Nie udało się zapisać. Spróbuj jeszcze raz.', 'alarm');
      return false;
    }
  }

  // ------------------------------------------------------------ lista

  function kartaListy(w, teraz) {
    const p = w.postep;
    return `<a class="karta przeglad ${esc(w.stan.kod)} ${w.moj ? 'moj' : ''}" href="#przeglad/${encodeURIComponent(w.id)}">
      <div class="wiersz"><span class="znacznik ${esc(w.stan.klasa)}">${esc(w.stan.nazwa)}</span>
        <span class="slaby">termin ${esc(!w.termin ? '—' : w.dzien === W.dzienZakladu(teraz) ? 'dziś' : W.data(w.termin))}</span>
        ${w.oczekuje ? '<span class="slaby">czeka na wysłanie</span>' : ''}</div>
      <b class="tytul">${esc(w.maszynaNazwa)} <span class="slaby">${esc(w.maszyna)} · ${esc(w.liniaNazwa)}</span></b>
      <div class="slaby">${esc(w.kartaNazwa)}${w.mechanikNazwa ? ` · ${esc(w.mechanikNazwa)}` : ''}</div>
      ${w.status === 'w_trakcie' || w.status === 'zrealizowany' ? `<div class="pasek-postepu ${p.zrobione === p.wszystkie ? 'komplet' : ''}"><span style="width:${p.wszystkie ? Math.round(p.zrobione * 100 / p.wszystkie) : 0}%"></span></div>
        <div class="slaby">${p.zrobione}/${p.wszystkie}${p.niezgodne.length ? ` · <span class="tekst-alarm">niezgodne: ${p.niezgodne.length}</span>` : ''}</div>` : ''}
    </a>`;
  }

  UR.ekran('przeglady', {
    rysuj(el) {
      const k = UR.kontekst();
      const f = filtr.czytaj();
      const g = W.listaPrzegladow(Object.assign({ przeglady: hala.obiekty('przeglad'), filtr: f }, k));
      const sekcja = (tytul, lista, klasa, pustyTekst) => (lista.length || pustyTekst ? `
        <h2 class="${klasa || ''}">${esc(tytul)} ${lista.length ? `<span class="znacznik ${klasa === 'tekst-alarm' ? 'alarm' : 'neutral'}">${lista.length}</span>` : ''}</h2>
        <div class="lista">${lista.map(w => kartaListy(w, k.teraz)).join('') || `<p class="pusto">${esc(pustyTekst)}</p>`}</div>` : '');
      const kart = Object.keys(hala.slowniki.karty_przegladow || {}).length;
      el.innerHTML = `
        <div class="tytul-ekranu"><h1>Przeglądy</h1>
          ${UR.mozna('przeglad.zaplanowany') && kart ? '<button type="button" id="zaplanuj">＋ Zaplanuj</button>' : ''}</div>
        <div class="wybor filtr" id="filtr-przegladow">${[['wszystkie', 'Wszystkie'], ['moje', 'Moje']].map(([kod, n]) =>
          `<button type="button" data-filtr="${kod}" aria-pressed="${f === kod}">${n}</button>`).join('')}</div>
        ${!kart ? `<p class="pusto">Nie ma jeszcze kart przeglądów.${UR.kierownikUR() ? ' Dodaj je w <a href="#plan">Planie</a>.' : ' Poproś kierownika UR o plan przeglądów.'}</p>` : ''}
        ${sekcja('Opóźnione', g.opoznione, 'tekst-alarm')}
        ${sekcja('W trakcie', g.wTrakcie)}
        ${sekcja('Dziś', g.dzis, '', 'Na dziś nic nie zaplanowano')}
        ${sekcja('Najbliższy tydzień', g.tydzien)}
        ${g.pozniej.length ? `<details class="archiwum"><summary>Później (${g.pozniej.length})</summary><div class="lista">${g.pozniej.map(w => kartaListy(w, k.teraz)).join('')}</div></details>` : ''}
        ${g.zrobione.length ? `<details class="archiwum"><summary>Zrealizowane w ostatnim tygodniu (${g.zrobione.length})</summary><div class="lista">${g.zrobione.map(w => kartaListy(w, k.teraz)).join('')}</div></details>` : ''}`;
      el.querySelector('#filtr-przegladow').addEventListener('click', ev => {
        const b = ev.target.closest('[data-filtr]');
        if (!b) return;
        filtr.zapisz(b.dataset.filtr);
        UR.odswiez('wymus');
      });
      const z = el.querySelector('#zaplanuj');
      if (z) z.addEventListener('click', () => zaplanuj());
    },
  });

  /* Ręczne zaplanowanie przeglądu (poza harmonogramem). Klucz naturalny: ten sam przegląd
     (maszyna, karta, dzień) drugi raz się nie założy. */
  const zaplanuj = W.raz(async () => {
    const sl = hala.slowniki, dzis = W.dzienZakladu(hala.teraz());
    const maszyny = W.maszyny(sl);
    const opcjeKart = m => W.kartyDlaMaszyny(sl, m).map(k => `<option value="${esc(k.kod)}">${esc(k.nazwa)}</option>`).join('');
    const pierwsza = maszyny[0] ? maszyny[0].kod : '';
    const mech = W.mechanicy(hala.pracownicy, null);
    const w = await UR.okno({
      tytul: 'Zaplanuj przegląd',
      tresc: `<label>Maszyna<select name="maszyna" id="pl-maszyna">${maszyny.map(m => `<option value="${esc(m.kod)}">${esc(m.nazwa)} (${esc(m.kod)})</option>`).join('')}</select></label>
        <label>Karta przeglądu<select name="karta" id="pl-karta">${opcjeKart(pierwsza)}</select></label>
        <label>Dzień<input type="date" name="dzien" value="${esc(dzis)}" min="${esc(dzis)}"></label>
        <label>Mechanik (opcjonalnie)<select name="mechanik"><option value="">— każdy —</option>${mech.map(p => `<option value="${esc(p.id)}">${esc(p.nazwa)}</option>`).join('')}</select></label>`,
      przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: 'Zaplanuj', wartosc: true, glowny: true,
        sprawdz: f => W.bledyPlanowania(Object.fromEntries(f), sl, dzis)[0] || null }],
      przy: form => form.querySelector('#pl-maszyna').addEventListener('change', ev => {
        const k = form.querySelector('#pl-karta');
        k.innerHTML = opcjeKart(ev.target.value) || '<option value="">Brak karty dla tej maszyny</option>';
      }),
    });
    if (!w || !w.wartosc) return;
    const f = Object.fromEntries(w.dane);
    const klucz = W.kluczPrzegladu(f.maszyna, f.karta, f.dzien);
    if (hala.obiekt('przeglad', klucz)) { UR.komunikat('Taki przegląd już jest w planie.', 'uwaga'); UR.idz(`przeglad/${encodeURIComponent(klucz)}`); return; }
    const dane = { maszyna: f.maszyna, karta: f.karta, termin: W.koniecDnia(f.dzien) };
    const m = (sl.maszyny || {})[f.maszyna];
    if (m && m.linia) dane.linia = m.linia;
    if (f.mechanik) dane.mechanik = f.mechanik;
    if (await zapisz('przeglad.zaplanowany', klucz, dane, 'Zaplanowany')) UR.idz(`przeglad/${encodeURIComponent(klucz)}`);
  });

  // ------------------------------------------------------------ karta przeglądu

  function rysujPunkt(pk, wpis, edycja) {
    const w = wpis || {};
    const stan = w.wynik || '';
    const zakres = W.zakres(pk);
    let pole;
    if (pk.rodzaj === 'pomiar') {
      pole = edycja
        ? `<div class="pomiar"><input type="text" inputmode="decimal" name="wartosc" value="${esc(typeof w.wartosc === 'number' ? String(w.wartosc).replace('.', ',') : '')}" placeholder="wartość" aria-label="${esc(pk.nazwa)}">
            <span class="jednostka">${esc(pk.jednostka || '')}</span></div>`
        : `<div class="wynik-pomiaru">${typeof w.wartosc === 'number' ? esc(String(w.wartosc).replace('.', ',') + (pk.jednostka ? ' ' + pk.jednostka : '')) : '—'}</div>`;
      if (stan === 'niezgodne') pole += '<div class="wynik-pomiaru">Poza zakresem</div>';
    } else {
      pole = edycja
        ? `<div class="dwa"><button type="button" class="zgodne" data-wynik="zgodne" aria-pressed="${stan === 'zgodne'}">Zgodne</button>
            <button type="button" class="niezgodne" data-wynik="niezgodne" aria-pressed="${stan === 'niezgodne'}">Niezgodne</button></div>`
        : `<div class="wynik-pomiaru">${stan === 'zgodne' ? 'Zgodne' : stan === 'niezgodne' ? 'Niezgodne' : '—'}</div>`;
    }
    const dodatki = edycja
      ? `<details ${w.uwagi || (w.zdjecia || []).length ? 'open' : ''}><summary>Uwagi i zdjęcie</summary>
          <textarea name="uwagi" rows="2" maxlength="1000" placeholder="Uwagi do punktu">${esc(w.uwagi || '')}</textarea>
          ${UR.poleZdjec('zdjecia', w.zdjecia || [])}</details>`
      : `${w.uwagi ? `<div class="tekst slaby">${esc(w.uwagi)}</div>` : ''}${(w.zdjecia || []).length ? `<div class="zdjecia">${UR.miniatury(w.zdjecia)}</div>` : ''}`;
    return `<section class="punkt ${esc(stan)}" data-punkt="${esc(pk.id)}">
      <div class="nazwa-punktu">${esc(pk.nazwa)} ${zakres ? `<span class="zakres">(${esc(zakres)})</span>` : ''}</div>
      ${pole}${dodatki}</section>`;
  }

  function rysujKarte(el, id) {
    const p = hala.obiekt('przeglad', id);
    if (!p) {
      el.innerHTML = `<a class="wstecz" href="#przeglady">‹ Przeglądy</a><p class="pusto">Nie ma takiego przeglądu w telefonie. Wróć do listy.</p>`;
      return;
    }
    const k = UR.kontekst();
    const d = p.dane || {};
    const karta = W.kartaDla(hala.slowniki, d.karta);
    const w = W.wierszPrzegladu(p, k);
    const edycja = p.status === 'w_trakcie' && UR.mozna('przeglad.punkt');
    const wyniki = d.punkty || {};
    const licznik = hala.obiekt('licznik_maszyny', d.maszyna);
    let akcje = '';
    if (p.status === 'zaplanowany' && UR.mozna('przeglad.rozpoczety')) akcje += '<button type="button" class="glowny szeroki duzy" id="zacznij">Skanuj maszynę i zacznij</button>';
    // Etap 3: „W trakcie” też da się usunąć (kierownik UR) — przegląd porzucony w połowie nie wisi w planie na zawsze;
    // usunięty po terminie liczy się w % planu jako niewykonany (W.wykonaniePlanu).
    if ((p.status === 'zaplanowany' || p.status === 'w_trakcie') && UR.mozna('przeglad.anulowany') && W.dozwolonyZ(hala.kontrakt, 'przeglad.anulowany', p.status))
      akcje += '<button type="button" class="szeroki" id="anuluj" style="margin-top:10px">Usuń z planu</button>';
    el.innerHTML = `
      <a class="wstecz" href="#przeglady">‹ Przeglądy</a>
      <section class="karta przeglad ${esc(w.stan.kod)}">
        <div class="wiersz"><span class="znacznik ${esc(w.stan.klasa)}">${esc(w.stan.nazwa)}</span><span class="slaby">${esc(w.numer)}</span></div>
        <h1>${esc(w.maszynaNazwa)} <span class="slaby">${esc(w.maszyna)}</span></h1>
        <div>${esc(w.kartaNazwa)} · ${esc(w.liniaNazwa)}</div>
        <dl class="szczegoly">
          <dt>Termin</dt><dd>${esc(W.data(d.termin))} (do końca dnia)</dd>
          ${d.mechanik ? `<dt>Przydzielony</dt><dd>${esc(W.nazwaPracownika(k.pracownicy, d.mechanik))}</dd>` : ''}
          ${d.czas_rozpoczecia ? `<dt>Rozpoczął</dt><dd>${esc(W.nazwaPracownika(k.pracownicy, d.wykonawca))} · ${esc(W.kiedy(d.czas_rozpoczecia, k.teraz))}${d.qr ? ' · skan maszyny' : ''}</dd>` : ''}
          ${d.czas_zakonczenia ? `<dt>Zakończony</dt><dd>${esc(W.kiedy(d.czas_zakonczenia, k.teraz))}</dd>` : ''}
          ${typeof d.motogodziny === 'number' ? `<dt>Motogodziny</dt><dd>${esc(d.motogodziny)}</dd>` : ''}
          ${typeof d.cykle === 'number' ? `<dt>Cykle</dt><dd>${esc(d.cykle)}</dd>` : ''}
          ${d.uwagi_koncowe ? `<dt>Uwagi</dt><dd>${esc(d.uwagi_koncowe)}</dd>` : ''}
          ${d.powod ? `<dt>Powód usunięcia</dt><dd>${esc(d.powod)}</dd>` : ''}
        </dl>
        ${p.status !== 'zaplanowany' && karta ? `<div class="pasek-postepu ${w.postep.zrobione === w.postep.wszystkie ? 'komplet' : ''}"><span style="width:${w.postep.wszystkie ? Math.round(w.postep.zrobione * 100 / w.postep.wszystkie) : 0}%"></span></div>
          <div class="slaby">Punkty: ${w.postep.zrobione}/${w.postep.wszystkie}${w.postep.niezgodne.length ? ` · <span class="tekst-alarm">niezgodne: ${w.postep.niezgodne.length}</span>` : ''}</div>` : ''}
      </section>
      ${akcje ? `<div style="margin:12px 0">${akcje}</div>` : ''}
      ${!karta ? '<p class="pusto blad">Karty tego przeglądu nie ma w słowniku (usunięta?). Poproś kierownika UR o poprawkę planu.</p>' : ''}
      ${karta && p.status !== 'zaplanowany' ? `<h2>Punkty kontrolne</h2><div class="lista" id="punkty">${(karta.punkty || []).map(pk => rysujPunkt(pk, wyniki[pk.id], edycja)).join('')}</div>` : ''}
      ${karta && p.status === 'zaplanowany' ? `<h2>Punkty kontrolne (${(karta.punkty || []).length})</h2><ol>${(karta.punkty || []).map(pk => `<li>${esc(pk.nazwa)}${W.zakres(pk) ? ` <span class="slaby">(${esc(W.zakres(pk))})</span>` : ''}</li>`).join('')}</ol>` : ''}
      ${edycja ? '<button type="button" class="zielony szeroki duzy" id="zakoncz" style="margin-top:14px">Zakończ przegląd</button>' : ''}
      ${licznik && (licznik.dane || {}).czas_odczytu ? `<p class="slaby">Ostatni odczyt licznika: ${esc(opisLicznika(licznik.dane))} (${esc(W.kiedy(licznik.dane.czas_odczytu, k.teraz))})</p>` : ''}`;

    const zacznij = el.querySelector('#zacznij');
    if (zacznij) zacznij.addEventListener('click', () => rozpocznij(p));
    const anuluj = el.querySelector('#anuluj');
    if (anuluj) anuluj.addEventListener('click', () => usun(p));
    const zak = el.querySelector('#zakoncz');
    if (zak) zak.addEventListener('click', () => zakoncz(p.id));
    const punkty = el.querySelector('#punkty');
    if (punkty && edycja) podepnijPunkty(punkty, p.id, karta);
  }

  const opisLicznika = d => [typeof d.motogodziny === 'number' ? `${d.motogodziny} mth` : null, typeof d.cykle === 'number' ? `${d.cykle} ${W.odmiana(d.cykle, 'cykl', 'cykle', 'cykli')}` : null].filter(Boolean).join(', ') || '—';

  /* Punkt zapisuje się sam: przycisk Zgodne/Niezgodne od razu, pomiar i uwagi po wyjściu z pola,
     zdjęcie po zrobieniu. Zapisujemy pełny wpis punktu (mapa w kontrakcie nadpisuje całość). */
  function podepnijPunkty(kontener, id, karta) {
    const zapiszPunkt = async (sekcja, zmiana) => {
      const pk = (karta.punkty || []).find(x => x.id === sekcja.dataset.punkt);
      const p = hala.obiekt('przeglad', id);
      if (!pk || !p) return;
      const byl = ((p.dane || {}).punkty || {})[pk.id] || {};
      const f = {
        wynik: zmiana.wynik !== undefined ? zmiana.wynik : byl.wynik,
        wartosc: zmiana.wartosc !== undefined ? zmiana.wartosc : byl.wartosc,
        uwagi: sekcja.querySelector('textarea[name=uwagi]') ? sekcja.querySelector('textarea[name=uwagi]').value : byl.uwagi,
        zdjecia: (() => { const u = sekcja.querySelector('input[type=hidden][name=zdjecia]'); try { return u ? JSON.parse(u.value) : (byl.zdjecia || []); } catch (e) { return []; } })(),
      };
      // Uwagi albo zdjęcie przed wynikiem: ok_nok bez wyboru jeszcze nie ma czego zapisać — czekamy na wybór.
      if (pk.rodzaj !== 'pomiar' && !f.wynik) { if (zmiana.wynik === undefined) UR.komunikat('Najpierw wybierz Zgodne albo Niezgodne — uwagi zapiszą się razem z wynikiem.', 'uwaga'); return; }
      if (pk.rodzaj === 'pomiar' && (f.wartosc === undefined || f.wartosc === '')) { if (zmiana.wartosc === undefined) UR.komunikat('Najpierw wpisz wartość pomiaru.', 'uwaga'); return; }
      const { bledy, dane } = W.danePunktu(pk, f);
      if (bledy.length) { UR.brzeczyk.blad(); UR.komunikat(bledy[0], 'alarm'); return; }
      if (dane.wynik === 'niezgodne' && byl.wynik !== 'niezgodne') UR.brzeczyk.blad(); else UR.brzeczyk.ok();
      await zapisz('przeglad.punkt', id, dane);
    };
    kontener.addEventListener('click', ev => {
      const b = ev.target.closest('[data-wynik]');
      if (!b) return;
      zapiszPunkt(b.closest('[data-punkt]'), { wynik: b.dataset.wynik });
    });
    kontener.addEventListener('change', ev => {
      const sekcja = ev.target.closest('[data-punkt]');
      if (!sekcja) return;
      if (ev.target.name === 'wartosc') zapiszPunkt(sekcja, { wartosc: ev.target.value.trim() });
      else if (ev.target.name === 'uwagi') zapiszPunkt(sekcja, {});
    });
    // Zdjęcie (ukryte pole zmienia UR.poleZdjec) — zapis od razu.
    kontener.addEventListener('input', ev => {
      if (ev.target.type === 'hidden' && ev.target.name === 'zdjecia') zapiszPunkt(ev.target.closest('[data-punkt]'), {});
    });
    // Enter w polu pomiaru = gotowe (klawiatura numeryczna telefonu ma „OK”).
    kontener.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.name === 'wartosc') { ev.preventDefault(); ev.target.blur(); } });
  }

  /* Start przeglądu = skan maszyny (dowód obecności, pole qr wymagane w kontrakcie).
     Aplikacja sprawdza kod, zanim cokolwiek wyśle — zła maszyna nie trafia do huba. */
  const rozpocznij = W.raz(async p0 => {
    const p = hala.obiekt('przeglad', p0.id);
    if (!p || p.status !== 'zaplanowany') return;      // drugie dotknięcie przed przerysowaniem
    const maszyna = (p.dane || {}).maszyna;
    const qr = await UR.skanujMaszyne(maszyna, `Zeskanuj ${W.nazwaMaszyny(hala.slowniki, maszyna)}`);
    if (!qr) return;
    await zapisz('przeglad.rozpoczety', p.id, { qr }, 'Przegląd rozpoczęty');
  });

  const usun = W.raz(async p => {
    const w = await UR.okno({
      tytul: 'Usunąć przegląd z planu?',
      tresc: '<label>Powód<input name="powod" maxlength="1000" placeholder="np. maszyna w remoncie"></label>',
      przyciski: [{ tekst: 'Wróć', wartosc: false }, { tekst: 'Usuń z planu', wartosc: true, alarm: true,
        sprawdz: f => (String(f.get('powod') || '').trim() ? null : 'Wpisz powód.') }],
    });
    if (!w || !w.wartosc) return;
    const dane = { powod: String(w.dane.get('powod')).trim() };
    // Przegląd „co N motogodzin/cykli”: bieżący odczyt licznika idzie z usunięciem — następny termin liczy
    // się od niego, inaczej generator zakładałby usunięty przegląd znowu nazajutrz.
    const harm = W.harmonogramPrzegladu(hala.slowniki, p.dane);
    const licznik = (hala.obiekt('licznik_maszyny', (p.dane || {}).maszyna) || {}).dane || {};
    if (harm && typeof licznik[harm.interwal] === 'number') dane[harm.interwal] = licznik[harm.interwal];
    await zapisz('przeglad.anulowany', p.id, dane, 'Usunięty z planu');
  });

  /* Zakończenie: podsumowanie, uwagi końcowe i odczyt licznika. Odczyt idzie w przeglądzie
     (od niego generator liczy „co N motogodzin”) i osobno jako maszyna.licznik (stan licznika). */
  const zakoncz = W.raz(async id => {
    const p = hala.obiekt('przeglad', id);
    if (!p) return;
    const d = p.dane || {};
    const karta = W.kartaDla(hala.slowniki, d.karta);
    const post = W.postepPrzegladu(p, karta);
    const harm = W.harmonogramPrzegladu(hala.slowniki, d);
    const licznikowy = !!W.bladOdczytuPrzegladu(harm, {});
    const ostatni = (hala.obiekt('licznik_maszyny', d.maszyna) || {}).dane || {};
    const klucz = `zakonczenie-przegladu:${id}`;
    const b = (await hala.brudnopis.odczytaj(klucz)) || {};
    const w = await UR.okno({
      tytul: 'Zakończ przegląd',
      tresc: `<p><b>Punkty: ${post.zrobione}/${post.wszystkie}</b>${post.niezgodne.length ? ` · <span class="tekst-alarm">niezgodne: ${esc(post.niezgodne.map(x => x.nazwa).join(', '))}</span>` : ''}</p>
        ${post.brakujace.length ? `<p class="tekst-uwaga">Bez wyniku: ${esc(post.brakujace.map(x => x.nazwa).join(', '))}</p>` : ''}
        <label>Uwagi końcowe (opcjonalnie)<textarea name="uwagi" rows="2" maxlength="2000" data-bez-fokusu>${esc(b.uwagi || '')}</textarea></label>
        <h3>Odczyt licznika ${licznikowy ? '' : '(opcjonalnie)'}</h3>
        <div class="dwa"><label>Motogodziny<input name="motogodziny" inputmode="decimal" value="${esc(b.motogodziny || '')}" placeholder="${esc(ostatni.motogodziny ?? '')}" data-bez-fokusu></label>
          <label>Cykle<input name="cykle" inputmode="numeric" value="${esc(b.cykle || '')}" placeholder="${esc(ostatni.cykle ?? '')}" data-bez-fokusu></label></div>`,
      przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: post.brakujace.length ? 'Zakończ mimo braków' : 'Zakończ przegląd', wartosc: true, zielony: true,
        sprawdz: f => {
          const odczyt = { motogodziny: String(f.get('motogodziny') || '').trim(), cykle: String(f.get('cykle') || '').trim() };
          const brak = W.bladOdczytuPrzegladu(harm, odczyt);
          if (brak) return brak;
          const pusty = !odczyt.motogodziny && !odczyt.cykle;
          return pusty ? null : (W.bledyLicznika(odczyt, ostatni).bledy[0] || null);
        } }],
      przy: form => form.addEventListener('input', () => {
        const f = new FormData(form);
        hala.brudnopis.zapisz(klucz, { uwagi: f.get('uwagi') || '', motogodziny: f.get('motogodziny') || '', cykle: f.get('cykle') || '' });
      }),
    });
    if (!w || !w.wartosc) return;
    const dane = {};
    const uwagi = String(w.dane.get('uwagi') || '').trim();
    if (uwagi) dane.uwagi = uwagi;
    const l = W.bledyLicznika({ motogodziny: w.dane.get('motogodziny'), cykle: w.dane.get('cykle') }, ostatni);
    Object.assign(dane, l.dane);
    if (l.ostrzezenia.length && !(await UR.potwierdz('Sprawdź licznik', l.ostrzezenia.join(' '), 'Zapisz tak'))) return;
    if (Object.keys(l.dane).length) await zapisz('maszyna.licznik', d.maszyna, l.dane);
    if (await zapisz('przeglad.zakonczony', id, dane, post.niezgodne.length ? `Zakończony — niezgodne: ${post.niezgodne.length}` : 'Przegląd zakończony')) {
      await hala.brudnopis.usun(klucz);
    }
  });

  // Jak karta awarii: przerysowanie tylko, gdy zmienił się TEN przegląd, jego karta albo licznik maszyny.
  const podpis = id => {
    const p = hala.obiekt('przeglad', id);
    if (!p) return '';
    const d = p.dane || {};
    return JSON.stringify([p.seq, p.status, !!p._oczekuje, p.numer, d, (hala.slowniki.karty_przegladow || {})[d.karta] || null,
      (hala.obiekt('licznik_maszyny', d.maszyna) || {}).seq || null]);
  };
  let ostatniPodpis = '';

  UR.ekran('przeglad', {
    zakladka: 'przeglady',
    rysuj(el, id) { ostatniPodpis = podpis(id); rysujKarte(el, id); },
    /* Zmiana z huba albo własny zapis punktu: przerysowanie nie może zabrać pola spod palca
       (pomiar w trakcie wpisywania) ani zwinąć rozwiniętych „Uwagi i zdjęcie”. */
    odswiez(el, id) {
      if (document.getElementById('okno').open) return;
      if (podpis(id) === ostatniPodpis) return;
      const a = document.activeElement;
      if (a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) {
        a.addEventListener('blur', () => setTimeout(() => UR.odswiez(), 0), { once: true });
        return;
      }
      const otwarte = new Set(Array.from(el.querySelectorAll('[data-punkt] details[open]')).map(x => x.closest('[data-punkt]').dataset.punkt));
      // Uwagi i zdjęcia wpisane przy punkcie bez wyniku jeszcze nie są zdarzeniem — przerysowanie po zapisie
      // INNEGO punktu kasowało je z ekranu (błąd z przeglądu kodu). Przenosimy je do nowej karty.
      const niezapisane = new Map();
      for (const s of el.querySelectorAll('[data-punkt]')) {
        const u = s.querySelector('textarea[name=uwagi]'), z = s.querySelector('input[type=hidden][name=zdjecia]');
        if (u && (u.value !== u.defaultValue || (z && z.value !== z.defaultValue))) niezapisane.set(s.dataset.punkt, { uwagi: u.value, zdjecia: z ? z.value : null });
      }
      const y = global.scrollY;
      ostatniPodpis = podpis(id);
      rysujKarte(el, id);
      for (const s of el.querySelectorAll('[data-punkt]')) {
        if (otwarte.has(s.dataset.punkt)) { const d = s.querySelector('details'); if (d) d.open = true; }
        const n = niezapisane.get(s.dataset.punkt);
        if (!n) continue;
        const u = s.querySelector('textarea[name=uwagi]'), z = s.querySelector('input[type=hidden][name=zdjecia]');
        if (u) u.value = n.uwagi;
        if (z && n.zdjecia !== null && z.value !== n.zdjecia) {
          z.value = n.zdjecia;
          let ids = []; try { ids = JSON.parse(n.zdjecia); } catch (e) { ids = []; }
          const pole = z.closest('[data-zdjecia]');
          pole.querySelectorAll('figure.miniatura').forEach(f => f.remove());
          pole.insertAdjacentHTML('afterbegin', UR.miniatury(ids, true));
        }
        const d = s.querySelector('details'); if (d) d.open = true;
      }
      UR.wypelnijZdjecia(el);
      global.scrollTo(0, y);
    },
  });

  // ------------------------------------------------------------ liczniki maszyn

  UR.ekran('liczniki', {
    zakladka: 'wiecej',
    rysuj(el) {
      const k = UR.kontekst();
      const lista = W.listaLicznikow({ slowniki: hala.slowniki, liczniki: hala.obiekty('licznik_maszyny'), teraz: k.teraz });
      const moge = UR.mozna('maszyna.licznik');
      el.innerHTML = `<a class="wstecz" href="#wiecej">‹ Więcej</a><h1>Liczniki maszyn</h1>
        <p class="slaby">Motogodziny i cykle z licznika na maszynie. Z nich plan liczy przeglądy „co N motogodzin”.</p>
        <div class="lista">${lista.map(m => `<button type="button" class="karta" data-licznik="${esc(m.kod)}" ${moge ? "" : "disabled"}>
          <b>${esc(m.nazwa)}</b> <span class="slaby">${esc(m.kod)} · ${esc(m.liniaNazwa)}</span><br>
          <span>${m.motogodziny !== null ? `${esc(m.motogodziny)} mth` : '— mth'} · ${m.cykle !== null ? `${esc(m.cykle)} ${W.odmiana(m.cykle, 'cykl', 'cykle', 'cykli')}` : '— cykli'}</span>
          <span class="slaby">${m.kiedy ? ` · odczyt ${esc(m.kiedy)}` : ''}</span></button>`).join('') || '<p class="pusto">Brak maszyn w słowniku.</p>'}</div>`;
      el.querySelector('.lista').addEventListener('click', ev => {
        const b = ev.target.closest('[data-licznik]');
        if (b && moge) odczyt(b.dataset.licznik);
      });
    },
  });

  const odczyt = W.raz(async maszyna => {
    const ostatni = (hala.obiekt('licznik_maszyny', maszyna) || {}).dane || {};
    const w = await UR.okno({
      tytul: `Odczyt: ${W.nazwaMaszyny(hala.slowniki, maszyna)}`,
      tresc: `<div class="dwa"><label>Motogodziny<input name="motogodziny" inputmode="decimal" placeholder="${esc(ostatni.motogodziny ?? '')}"></label>
        <label>Cykle<input name="cykle" inputmode="numeric" placeholder="${esc(ostatni.cykle ?? '')}"></label></div>`,
      przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: 'Zapisz', wartosc: true, glowny: true,
        sprawdz: f => W.bledyLicznika({ motogodziny: f.get('motogodziny'), cykle: f.get('cykle') }, ostatni).bledy[0] || null }],
    });
    if (!w || !w.wartosc) return;
    const l = W.bledyLicznika({ motogodziny: w.dane.get('motogodziny'), cykle: w.dane.get('cykle') }, ostatni);
    if (l.ostrzezenia.length && !(await UR.potwierdz('Sprawdź licznik', l.ostrzezenia.join(' '), 'Zapisz tak'))) return;
    await zapisz('maszyna.licznik', maszyna, l.dane, 'Odczyt zapisany');
  });
})(window);
