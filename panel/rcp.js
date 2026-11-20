/* Panel Kierownika — zakładka RCP (rejestracja czasu pracy). Tylko kierownik zakładu i admin (serwer też odmawia: 403).

   Odbicia robi terminal na hali (terminal.html, konto „ekran”); tu kierownik widzi dni, zatwierdza je albo poprawia, przypisuje
   breloki i pobiera plik dla płac. Godziny liczy SERWER (gk_rcp.py) — Panel nic nie liczy, tylko pokazuje i woła
   /api/v1/panel/rcp/…. Surowe odbicia nigdy się nie zmieniają: korekta to nowy wpis z powodem, anulowanie zostawia ślad.

   Zakładka rysuje się RAZ i odświeża tylko na polecenie (zmiana okresu/filtra, akcja, „Odśwież”, co minutę) — Panel woła
   rysuj() przy każdym zdarzeniu z huba i nie może zamazywać wpisywanego tekstu. Czyste funkcje: W.rcp* (widok.js). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, esc } = P;

  const S = { czesc: 'dni', od: '', do: '', filtr: 'do_zatwierdzenia', szukaj: '', dni: null, karty: null, grafik: null, tydzien: '', blad: '', otwarte: new Set(),
              eksport: { format: 'csv', wszystkie: false } };
  let korzen = null, wczytuje = false, ostatnieOdswiezenie = 0;
  const ODSWIEZ_MS = 60000;

  const api = (metoda, sciezka, cialo) => hala.zapytaj(metoda, '/api/v1/panel/rcp/' + sciezka, cialo);
  const tekstBledu = e => (e && e.odHuba && e.message) ? e.message : P.komunikatBledu(e);

  // ---- daty (dni zakładu jako „RRRR-MM-DD”; rachunek w UTC, żeby strefa przeglądarki nie przesuwała dnia)
  const dodajDni = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const poniedzialek = iso => { const d = new Date(iso + 'T00:00:00Z'); return dodajDni(iso, -((d.getUTCDay() + 6) % 7)); };
  const DNI_TYG = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];

  // ---- dane
  async function wczytaj() {
    if (wczytuje) return;
    wczytuje = true;
    try {
      if (!S.od) Object.assign(S, W.rcpOkres(hala.teraz()));
      if (S.czesc === 'dni' || S.dni === null) S.dni = (await api('GET', `dni?od=${S.od}&do=${S.do}`)).dni;
      if (S.czesc === 'karty' || S.czesc === 'grafik' || S.karty === null) S.karty = (await api('GET', 'karty')).karty;
      if (S.czesc === 'grafik') {
        if (!S.tydzien) S.tydzien = poniedzialek(W.dzienZakladu(hala.teraz()));
        S.grafik = await api('GET', `grafik?od=${S.tydzien}&do=${dodajDni(S.tydzien, 6)}`);
      }
      S.blad = '';
    } catch (e) { S.blad = tekstBledu(e); }
    finally { wczytuje = false; ostatnieOdswiezenie = Date.now(); rysujTresc(); }
  }

  // ---- widok „Dni”
  const znacznik = (tekst, rodzaj) => `<span class="znacznik ${rodzaj || 'neutral'}">${esc(tekst)}</span>`;
  const nazwaRodzaju = r => (r === 'wyjscie' ? 'wyjście' : 'wejście');
  const dzisIso = () => new Date().toISOString();

  function wierszDnia(w) {
    const otwarty = S.otwarte.has(w.klucz);
    const zat = w.status === 'zatwierdzony', wPracy = w.status === 'w_pracy';
    const nad = [w.ponadNorme && `ponad 8 h: ${w.ponadNorme}`, w.wDzienWolny && `${w.dzienWolny || 'dzień wolny'}: ${w.wDzienWolny}`, w.nocne && `nocne: ${w.nocne}`]
      .filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('');
    const odbicia = w.odbicia.map(o => `<li>${esc(W.godzina(o.czas))} — ${esc(nazwaRodzaju(o.rodzaj))}
        <span class="slaby">${o.zrodlo === 'korekta' ? `· ręcznie: ${esc(o.powod || '')}` : '· terminal'}</span>
        ${zat || !o.id ? '' : `<button type="button" class="maly" data-akcja="anuluj" data-odbicie="${esc(o.id)}">Anuluj odbicie</button>`}</li>`).join('');
    return `<article class="zlecenie rcp-dzien" data-klucz="${esc(w.klucz)}" data-pracownik="${esc(w.pracownik)}" data-dzien="${esc(w.dzien)}">
      <div class="opis">
        <div class="tytul"><b>${esc(w.nazwa)}</b> <span class="slaby">${esc(w.dzienOpis)}</span></div>
        <div class="szczegoly"><span>${esc(w.godziny || '—')}</span><span><b>${esc(w.czas)}</b></span>${nad}
          ${zat ? znacznik(`Zatwierdzone (${w.zatwierdzil})`, 'ok') : ''}${w.zmiana ? znacznik('Zmiana ' + w.zmiana) : ''}${w.spoznienie ? znacznik(`Spóźnienie ${w.spoznienie} min`, 'uwaga') : ''}${wPracy ? znacznik('W pracy', 'uwaga') : ''}${w.uwagi.map(u => znacznik(u, 'uwaga')).join('')}</div>
        ${otwarty ? `<div class="rcp-popraw">
          <ul class="rcp-odbicia">${odbicia}</ul>
          ${zat ? '<p class="slaby">Dzień jest zatwierdzony — najpierw wycofaj zatwierdzenie, żeby go poprawić.</p>' : `<form class="rcp-korekta" autocomplete="off">
            <label>Brakujące odbicie<select name="rodzaj"><option value="wyjscie">Wyjście</option><option value="wejscie">Wejście</option></select></label>
            <label>Kiedy<input name="czas" type="datetime-local" required></label>
            <label>Powód<input name="powod" maxlength="300" required placeholder="np. zapomniał odbić"></label>
            <button type="submit" class="glowny maly">Dodaj odbicie</button>
          </form>`}
        </div>` : ''}
      </div>
      <div class="akcje">
        ${zat ? '<button type="button" class="maly" data-akcja="wycofaj">Wycofaj</button>'
              : (wPracy || !w.odbicia.length) ? '' : `<button type="button" class="${w.uwagi.length ? 'maly' : 'glowny maly'}" data-akcja="zatwierdz">${w.uwagi.length ? 'Zatwierdź mimo uwag' : 'Zatwierdź'}</button>`}
        <button type="button" class="maly" data-akcja="popraw" aria-expanded="${otwarty}">${otwarty ? 'Zwiń' : 'Odbicia'}</button>
      </div></article>`;
  }

  function trescDni() {
    const l = W.rcpLiczby(S.dni || []);
    const licznik = { do_zatwierdzenia: l.doZatwierdzenia, z_uwagami: l.zUwagami, spoznienia: l.spoznienia, zatwierdzone: l.zatwierdzone, wszystkie: l.razem };
    const wiersze = W.rcpWiersze(S.dni || [], { filtr: S.filtr, szukaj: S.szukaj });
    return `<div class="rcp-pasek">
        <label>Od<input type="date" data-pole="od" value="${esc(S.od)}"></label>
        <label>Do<input type="date" data-pole="do" value="${esc(S.do)}"></label>
        <label class="rcp-szukaj">Szukaj<input type="search" data-pole="szukaj" value="${esc(S.szukaj)}" placeholder="nazwisko"></label>
        <button type="button" class="maly" data-akcja="odswiez">Odśwież</button>
      </div>
      <div class="chipy karta-chipy" role="group" aria-label="Filtr dni">${W.RCP_FILTRY.map(([k, nazwa]) =>
        `<button type="button" class="chip${(k === 'z_uwagami' || k === 'spoznienia') && licznik[k] ? ' spoznione' : ''}" data-filtr="${k}" aria-pressed="${S.filtr === k}">${esc(nazwa)} · ${licznik[k]}</button>`).join('')}</div>
      <div class="lista">${wiersze.map(wierszDnia).join('') || `<p class="pusto${S.dni && S.filtr === 'do_zatwierdzenia' && !l.razem ? '' : ''}">${S.dni === null ? 'Wczytuję…' : (l.razem ? 'Nic w tym filtrze.' : 'Brak odbić w tym okresie.')}</p>`}</div>`;
  }

  // ---- widok „Karty”
  function trescKart() {
    const karty = S.karty || [];
    const maja = new Set(karty.map(k => k.pracownik));
    const osoby = (hala.pracownicy || []).filter(p => p.aktywny !== false && !(p.role || []).includes('ekran'));
    const bez = osoby.filter(p => !maja.has(p.id));
    return `<p class="slaby opis-widoku">Brelok przypisujesz osobie raz: kliknij pole „Numer karty” i przyłóż brelok do czytnika
        (czytnik sam wpisze numer i zatwierdzi). Jedna osoba ma jeden aktywny brelok; nowy zastępuje stary.</p>
      <form class="rcp-karta-formularz" autocomplete="off">
        <label>Osoba<select name="pracownik" required><option value="">— wybierz —</option>${(bez.length ? bez : osoby).map(p => `<option value="${esc(p.id)}">${esc(p.nazwa)}</option>`).join('')}</select></label>
        <label>Numer karty<input name="karta" inputmode="numeric" required placeholder="przyłóż brelok do czytnika"></label>
        <button type="submit" class="glowny">Przypisz brelok</button>
        <p class="blad" role="alert" hidden></p>
      </form>
      <h3>Przypisane breloki · ${karty.length}</h3>
      <div class="lista">${karty.map(k => `<article class="zlecenie" data-pracownik="${esc(k.pracownik)}">
          <div class="opis"><div class="tytul"><b>${esc(k.nazwa || k.pracownik)}</b></div><div class="szczegoly"><span>numer: ${esc(k.numer)}</span></div></div>
          <div class="akcje"><button type="button" class="maly" data-akcja="odepnij">Odepnij</button></div></article>`).join('')
        || `<p class="pusto">${S.karty === null ? 'Wczytuję…' : 'Żaden brelok nie jest jeszcze przypisany.'}</p>`}</div>
      ${bez.length ? `<h3>Bez breloka · ${bez.length}</h3><p class="slaby">${bez.map(p => esc(p.nazwa)).join(', ')}</p>` : ''}`;
  }

  // ---- widok „Grafik” (prosty plan zmian: osoba × dzień; plan wolno zmieniać, odbicia nie)
  function trescGrafiku() {
    const g = S.grafik;
    if (!g) return '<p class="pusto">Wczytuję…</p>';
    const dni = [0, 1, 2, 3, 4, 5, 6].map(i => dodajDni(S.tydzien, i));
    const plan = new Map((g.wpisy || []).map(w => [`${w.pracownik}|${w.dzien}`, w.zmiana]));
    const zmiany = Object.entries(g.zmiany || {});
    const maja = new Set((S.karty || []).map(k => k.pracownik));
    // Wiersze: osoby z brelokiem (to oni odbijają się na terminalu) + każdy, kto ma plan w tym tygodniu.
    const osoby = (hala.pracownicy || []).filter(p => p.aktywny !== false && (maja.has(p.id) || dni.some(d => plan.has(`${p.id}|${d}`))))
      .sort((a, b) => String(a.nazwa).localeCompare(String(b.nazwa), 'pl'));
    const komorka = (p, d) => `<td><select data-grafik data-pracownik="${esc(p.id)}" data-dzien="${d}" aria-label="${esc(p.nazwa)} ${d}">
        <option value="">—</option>${zmiany.map(([k, z]) => `<option value="${esc(k)}" title="${esc(z.od)}–${esc(z.do)}"${plan.get(p.id + '|' + d) === k ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select></td>`;
    return `<div class="rcp-pasek">
        <button type="button" class="maly" data-akcja="tydzien-wstecz">${P.ik('strzalka-lewo', 14)}Poprzedni</button>
        <b>${esc(S.tydzien.split('-').reverse().join('.'))} – ${esc(dni[6].split('-').reverse().join('.'))}</b>
        <button type="button" class="maly" data-akcja="tydzien-dalej">Następny${P.ik('strzalka-prawo', 14)}</button>
        <button type="button" class="maly" data-akcja="kopiuj-tydzien">Kopiuj ten tydzień na następny</button>
      </div>
      <p class="slaby opis-widoku">Zmiana I zaczyna się o 6:00, II o 14:00, III o 22:00 — odbicie po starcie zmiany to spóźnienie. Bez planu zmianę
        podpowiada godzina wejścia. Breloki przypisujesz w części „Breloki”; tu pojawiają się osoby z brelokiem.</p>
      <div class="rcp-siatka-pudlo"><table class="rcp-siatka"><thead><tr><th>Osoba</th>${dni.map((d, i) => `<th>${DNI_TYG[i]} ${esc(d.slice(8))}.${esc(d.slice(5, 7))}</th>`).join('')}</tr></thead>
        <tbody>${osoby.map(p => `<tr><th scope="row">${esc(p.nazwa)}</th>${dni.map(d => komorka(p, d)).join('')}</tr>`).join('')
          || '<tr><td colspan="8" class="pusto">Brak osób z brelokiem — przypisz je w części „Breloki”.</td></tr>'}</tbody></table></div>`;
  }

  // ---- widok „Plik dla płac”
  function trescEksportu() {
    return `<p class="slaby opis-widoku">Plik zawiera tylko dni ZATWIERDZONE (płace nie dostają niesprawdzonych godzin). Układ kolumn jest tymczasowy —
        dostosujemy go do wzoru z IMAG/Wapro, gdy go dostarczysz.</p>
      <form class="rcp-eksport" autocomplete="off">
        <label>Od<input type="date" name="od" value="${esc(S.od)}" required></label>
        <label>Do<input type="date" name="do" value="${esc(S.do)}" required></label>
        <label>Format<select name="format"><option value="csv"${S.eksport.format === 'csv' ? ' selected' : ''}>CSV (Excel, średnik)</option><option value="txt"${S.eksport.format === 'txt' ? ' selected' : ''}>TXT (tabulator)</option></select></label>
        <label class="rcp-wybor"><input type="checkbox" name="wszystkie"${S.eksport.wszystkie ? ' checked' : ''}> Także niezatwierdzone (tylko podgląd roboczy)</label>
        <button type="submit" class="glowny">Pobierz plik</button>
        <p class="blad" role="alert" hidden></p>
      </form>`;
  }

  // ---- szkielet i rysowanie
  const CZESCI = [['dni', 'Dni'], ['grafik', 'Grafik'], ['karty', 'Breloki'], ['eksport', 'Plik dla płac']];

  function rysujTresc() {
    if (!korzen) return;
    const t = korzen.querySelector('.rcp-tresc');
    const aktywny = document.activeElement;
    const zapamietaj = aktywny && t.contains(aktywny) && aktywny.dataset ? aktywny.dataset.pole : null;
    const html = S.blad ? `<p class="blad" role="alert">${esc(S.blad)}</p>${S.czesc === 'dni' ? trescDni() : ''}`
      : (S.czesc === 'dni' ? trescDni() : S.czesc === 'grafik' ? trescGrafiku() : S.czesc === 'karty' ? trescKart() : trescEksportu());
    if (t.innerHTML !== html) {
      t.innerHTML = html;
      if (zapamietaj) { const el = t.querySelector(`[data-pole="${zapamietaj}"]`); if (el) { el.focus(); if (el.setSelectionRange && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); } }
    }
    for (const b of korzen.querySelectorAll('[data-rcp-czesc]')) b.setAttribute('aria-pressed', String(b.dataset.rcpCzesc === S.czesc));
  }

  async function wykonaj(wywolanie, sukces) {
    try { await wywolanie(); if (sukces) P.komunikat(sukces, 'ok'); await wczytaj(); }
    catch (e) { P.komunikat(tekstBledu(e), 'blad'); }
  }

  function zbudujSzkielet(el) {
    el.innerHTML = `<section class="rcp" aria-label="Rejestracja czasu pracy">
      <div class="chipy" role="group" aria-label="Część RCP">${CZESCI.map(([k, n]) => `<button type="button" class="chip" data-rcp-czesc="${k}" aria-pressed="${k === S.czesc}">${esc(n)}</button>`).join('')}</div>
      <div class="rcp-tresc"></div></section>`;
    korzen = el.querySelector('.rcp');

    korzen.addEventListener('click', async ev => {
      const cz = ev.target.closest('[data-rcp-czesc]');
      if (cz) { S.czesc = cz.dataset.rcpCzesc; S.blad = ''; rysujTresc(); if (S.czesc !== 'eksport') { if (S.czesc === 'grafik') S.grafik = null; wczytaj(); } return; }
      const f = ev.target.closest('[data-filtr]');
      if (f) { S.filtr = f.dataset.filtr; rysujTresc(); return; }
      const b = ev.target.closest('[data-akcja]');
      if (!b) return;
      const wiersz = b.closest('[data-pracownik]');
      const pracownik = wiersz && wiersz.dataset.pracownik, dzien = wiersz && wiersz.dataset.dzien;
      switch (b.dataset.akcja) {
        case 'odswiez': await wczytaj(); break;
        case 'tydzien-wstecz': S.tydzien = dodajDni(S.tydzien, -7); S.grafik = null; rysujTresc(); await wczytaj(); break;
        case 'tydzien-dalej': S.tydzien = dodajDni(S.tydzien, 7); S.grafik = null; rysujTresc(); await wczytaj(); break;
        case 'kopiuj-tydzien':
          if (await P.potwierdz('Skopiować plan?', 'Plan tego tygodnia zastąpi plan następnego (dla osób, które mają wpisy w tym tygodniu).', 'Kopiuj'))
            await wykonaj(() => api('POST', 'grafik', { kopiuj_tydzien_od: S.tydzien }), 'Plan skopiowany na następny tydzień');
          break;
        case 'popraw': { const k = wiersz.dataset.klucz; if (S.otwarte.has(k)) S.otwarte.delete(k); else S.otwarte.add(k); rysujTresc(); break; }
        case 'zatwierdz': {
          const wd = (S.dni || []).find(d => d.pracownik === pracownik && d.dzien === dzien);
          const uwagi = wd && wd.anomalie.length;
          if (uwagi && !(await P.potwierdz('Zatwierdzić dzień z uwagami?', wd.anomalie.map(W.rcpUwaga).join(', ') + '. Zatwierdź tylko, jeśli to się zgadza.', 'Zatwierdź'))) break;
          await wykonaj(() => api('POST', 'zatwierdz', { pracownik, dzien, swiadomie: !!uwagi }), 'Dzień zatwierdzony');
          break;
        }
        case 'wycofaj': {
          const powod = await P.zapytajTekst({ tytul: 'Wycofać zatwierdzenie?', etykieta: 'Dlaczego? (zostanie zapisane)', wymagany: true, przycisk: 'Wycofaj' });
          if (powod) await wykonaj(() => api('POST', 'wycofaj', { pracownik, dzien, powod }), 'Zatwierdzenie wycofane');
          break;
        }
        case 'anuluj': {
          const powod = await P.zapytajTekst({ tytul: 'Anulować odbicie?', etykieta: 'Dlaczego? (odbicie zostaje w dzienniku, ale nie liczy się do godzin)', wymagany: true, przycisk: 'Anuluj odbicie', wstecz: 'Nie' });
          if (powod) await wykonaj(() => api('POST', 'anuluj', { odbicie: b.dataset.odbicie, powod }), 'Odbicie anulowane');
          break;
        }
        case 'odepnij': {
          if (await P.potwierdz('Odpiąć brelok?', 'Osoba nie będzie mogła odbijać się tym brelokiem, aż przypiszesz nowy.', 'Odepnij'))
            await wykonaj(() => api('POST', 'karty', { pracownik, odepnij: true }), 'Brelok odpięty');
          break;
        }
        default: break;
      }
    });

    korzen.addEventListener('change', ev => {
      if (ev.target.dataset && ev.target.dataset.grafik !== undefined) {
        const { pracownik, dzien } = ev.target.dataset;
        wykonaj(() => api('POST', 'grafik', { pracownik, dni: [dzien], zmiana: ev.target.value || null }), '');
        return;
      }
      const p = ev.target.dataset && ev.target.dataset.pole;
      if (p === 'od' || p === 'do') { S[p] = ev.target.value; if (S.od && S.do) wczytaj(); }
    });
    korzen.addEventListener('input', ev => {
      if (ev.target.dataset && ev.target.dataset.pole === 'szukaj') { S.szukaj = ev.target.value; rysujTresc(); }
    });

    korzen.addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, blad = f.querySelector('.blad');
      const pokazBlad = t => { if (blad) { blad.textContent = t; blad.hidden = !t; } };
      if (f.classList.contains('rcp-korekta')) {
        const wiersz = f.closest('[data-pracownik]');
        const czas = f.czas.value ? new Date(f.czas.value).toISOString() : '';
        await wykonaj(() => api('POST', 'korekta', { pracownik: wiersz.dataset.pracownik, rodzaj: f.rodzaj.value, czas, powod: f.powod.value.trim() }), 'Odbicie dodane');
      } else if (f.classList.contains('rcp-karta-formularz')) {
        try {
          const w = await api('POST', 'karty', { pracownik: f.pracownik.value, karta: f.karta.value.trim() });
          P.komunikat(`Brelok przypisany: ${w.nazwa}`, 'ok'); f.karta.value = ''; await wczytaj();
        } catch (e) { pokazBlad(tekstBledu(e)); }
      } else if (f.classList.contains('rcp-eksport')) {
        S.od = f.od.value; S.do = f.do.value; S.eksport = { format: f.format.value, wszystkie: f.wszystkie.checked };
        try {
          const w = await api('GET', `eksport?od=${S.od}&do=${S.do}&format=${S.eksport.format}${S.eksport.wszystkie ? '&wszystkie=1' : ''}`);
          if (!w.wiersze) { pokazBlad('Brak zatwierdzonych dni w tym okresie — nie ma czego pobrać.'); return; }
          pokazBlad('');
          const blob = new Blob(['﻿' + w.tresc], { type: S.eksport.format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = w.nazwa_pliku;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          P.komunikat(`Pobrano ${w.nazwa_pliku} (${w.wiersze} wierszy)`, 'ok');
        } catch (e) { pokazBlad(tekstBledu(e)); }
      }
    });
  }

  function rysuj(el) {
    if (!korzen || !el.contains(korzen)) { korzen = null; zbudujSzkielet(el); rysujTresc(); wczytaj(); return; }
    // Panel woła rysuj() przy każdym zdarzeniu z huba — dane odświeżamy tylko co minutę i tylko na liście dni.
    if (S.czesc === 'dni' && Date.now() - ostatnieOdswiezenie > ODSWIEZ_MS) wczytaj();
  }

  P.widoki.rcp = { rysuj };
})();
