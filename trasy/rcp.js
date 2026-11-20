/* GK Trasy — ekran „RCP” (2026-11-19, D93): czas pracy kierowców i biura. TE SAME funkcje i ten sam układ co w Panelu Kierownika → RCP.

   Wzór: panel/web/rcp.js (+ czyste funkcje W.rcp* z panel/web/widok.js — tu skopiowane niżej, bo Trasy nie ładują widok.js Panelu).
   Odbicia robi terminal na hali; tu administrator GK Trasy widzi dni swoich ludzi, zatwierdza je albo poprawia, układa grafik zmian,
   przypisuje breloki i pobiera plik dla płac. Dane przychodzą na żywo z huba przez serwer Tras (/api/rcp/…), który zawęża je do osób
   transportu (rola trasy_*) i niczego nie kopiuje (dane płacowe); przy niedostępnym Panelu ekran mówi to zdaniem. Godziny liczy hub
   (gk_rcp.py) — tu tylko pokazujemy. Surowe odbicia się nie zmieniają: korekta to nowy wpis z powodem, anulowanie zostawia ślad.
   Wszystko rysujemy przez DOM (textContent), bez wstawiania tekstu z serwera do HTML-a. */

EKRANY.rcp = {
  tytul: 'RCP',
  tylkoAdministrator: true,
  async rysuj(pole) {
    // ------------------------------------------------------------ czyste funkcje (kopia W.rcp* z Panelu)
    const UWAGI = { brak_wyjscia: 'Brak wyjścia', wyjscie_bez_wejscia: 'Wyjście bez wejścia', podwojne_wejscie: 'Podwójne wejście',
                    za_dluga_doba: 'Doba dłuższa niż 13 h', odpoczynek_dobowy_ponizej_11h: 'Odpoczynek krótszy niż 11 h',
                    poza_grafikiem: 'Poza grafikiem', brak_odbic_w_grafiku: 'Brak odbić w grafiku' };
    const FILTRY = [['do_zatwierdzenia', 'Do zatwierdzenia'], ['z_uwagami', 'Z uwagami'], ['spoznienia', 'Spóźnienia'],
                    ['zatwierdzone', 'Zatwierdzone'], ['wszystkie', 'Wszystkie']];
    const CZESCI = [['dni', 'Dni'], ['grafik', 'Grafik'], ['karty', 'Breloki'], ['plik', 'Plik dla płac']];
    const dniTyg = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];
    const dwie = x => String(x).padStart(2, '0');
    const dodajDni = (iso, n) => {
      const [r, m, d] = iso.split('-').map(Number);
      const t = new Date(Date.UTC(r, m - 1, d + n));
      return t.getUTCFullYear() + '-' + dwie(t.getUTCMonth() + 1) + '-' + dwie(t.getUTCDate());
    };
    const poniedzialek = iso => { const d = new Date(iso + 'T00:00:00Z'); return dodajDni(iso, -((d.getUTCDay() + 6) % 7)); };
    const poPolsku = iso => iso.split('-').reverse().join('.');
    const godz = iso => new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
    const hm = min => (typeof min === 'number' && min >= 0 ? Math.floor(min / 60) + ':' + dwie(Math.round(min) % 60) : '—');
    const status = d => (d.zatwierdzono ? 'zatwierdzony' : (d.w_trakcie ? 'w_pracy' : (d.anomalie && d.anomalie.length ? 'uwagi' : 'do_zatwierdzenia')));
    const sortCzasu = lista => (lista || []).slice().sort((a, b) => String(a.czas).localeCompare(String(b.czas)));
    const przedzialy = odbicia => {
      const wyniki = [];
      let otwarte = null;
      for (const o of sortCzasu(odbicia)) {
        if (o.rodzaj === 'wejscie') { if (otwarte !== null) wyniki.push(otwarte + '–?'); otwarte = godz(o.czas); }
        else if (otwarte !== null) { wyniki.push(otwarte + '–' + godz(o.czas)); otwarte = null; }
        else wyniki.push('?–' + godz(o.czas));
      }
      if (otwarte !== null) wyniki.push(otwarte + '–?');
      return wyniki.join(', ');
    };
    const liczby = dni => {
      const l = { do_zatwierdzenia: 0, z_uwagami: 0, spoznienia: 0, zatwierdzone: 0, wszystkie: (dni || []).length };
      for (const d of dni || []) {
        const s = status(d);
        if (d.spoznienie_min > 0) l.spoznienia++;
        if (s === 'zatwierdzony') l.zatwierdzone++; else if (s === 'uwagi') l.z_uwagami++; else if (s === 'do_zatwierdzenia') l.do_zatwierdzenia++;
      }
      return l;
    };
    const wiersze = (dni, filtr, szukaj) => {
      const q = String(szukaj || '').trim().toLowerCase();
      return (dni || []).filter(d => {
        const s = status(d);
        if (q && !String(d.nazwa || '').toLowerCase().includes(q)) return false;
        return !filtr || filtr === 'wszystkie' || (filtr === 'do_zatwierdzenia' && s === 'do_zatwierdzenia') || (filtr === 'z_uwagami' && s === 'uwagi')
          || (filtr === 'spoznienia' && d.spoznienie_min > 0) || (filtr === 'zatwierdzone' && s === 'zatwierdzony');
      }).sort((a, b) => String(b.dzien).localeCompare(a.dzien) || String(a.nazwa).localeCompare(String(b.nazwa), 'pl'));
    };
    // datetime-local („2026-11-18T14:00”) → ISO z przesunięciem strefy komputera (bez toISOString — daty liczy przeglądarka lokalnie)
    const zOffsetem = v => {
      const przes = -new Date(v).getTimezoneOffset();
      return v + ':00' + (przes < 0 ? '-' : '+') + dwie(Math.floor(Math.abs(przes) / 60)) + ':' + dwie(Math.abs(przes) % 60);
    };

    // ------------------------------------------------------------ stan
    const S = { czesc: 'dni', od: dodajDni(dzisiaj(), -6), do: dzisiaj(), filtr: 'do_zatwierdzenia', szukaj: '', dni: null, karty: null,
                osoby: [], grafik: null, tydzien: poniedzialek(dzisiaj()), otwarte: new Set(), eksport: { format: 'csv', wszystkie: false }, blad: '' };

    const el = (tag, klasa, tekst, atrybuty) => {
      const e = document.createElement(tag);
      if (klasa) e.className = klasa;
      if (tekst !== undefined && tekst !== null && tekst !== '') e.textContent = String(tekst);
      for (const k of Object.keys(atrybuty || {})) e.setAttribute(k, atrybuty[k]);
      return e;
    };
    const przycisk = (tekst, klasa, akcja, dane) => {
      const b = el('button', klasa, tekst, { type: 'button', 'data-akcja': akcja });
      for (const k of Object.keys(dane || {})) b.setAttribute('data-' + k, dane[k]);
      return b;
    };
    const plakietka = (tekst, klasa) => el('span', 'plakietka ' + (klasa || 'p-oczekuje'), tekst);
    const komunikatBledu = e => poLudzku(e);

    pole.textContent = '';
    const korzen = el('div', 'rcp-trasy');
    const chipy = el('div', 'chipy', '', { role: 'group', 'aria-label': 'Część RCP' });
    const tresc = el('div', 'rcp-tresc');
    korzen.append(chipy, tresc);
    pole.appendChild(korzen);

    // ------------------------------------------------------------ dane
    const api = {
      dni: () => API.get('/api/rcp/dni?od=' + S.od + '&do=' + S.do),
      karty: () => API.get('/api/rcp/karty'),
      grafik: () => API.get('/api/rcp/grafik?od=' + S.tydzien + '&do=' + dodajDni(S.tydzien, 6)),
      post: (akcja, dane) => API.post('/api/rcp/' + akcja, dane),
    };
    async function wczytaj() {
      tresc.textContent = '';
      tresc.appendChild(el('div', 'pusto', 'Wczytuję…'));
      try {
        if (S.czesc === 'dni') S.dni = (await api.dni()).dni;
        if (S.czesc === 'karty' || S.czesc === 'grafik') { const k = await api.karty(); S.karty = k.karty; S.osoby = k.osoby || []; }
        if (S.czesc === 'grafik') S.grafik = await api.grafik();
        S.blad = '';
      } catch (e) {
        S.blad = komunikatBledu(e);
      }
      rysujTresc();
    }
    async function wykonaj(wywolanie, sukces) {
      try { await wywolanie(); if (sukces) komunikat(sukces, 'ok'); await wczytaj(); }
      catch (e) { komunikat(komunikatBledu(e), 'blad'); }
    }
    // Powód (korekta, anulowanie, wycofanie) w oknie aplikacji; Anuluj = null.
    function zapytajPowod(tytul, etykieta, napisPrzycisku) {
      return new Promise(ok => {
        const tresc_ = '<label>' + escHtml(etykieta) + '<textarea id="rcp-powod" maxlength="300" rows="3"></textarea></label>';
        okno({
          tytul, tresc: tresc_,
          przyciski: [
            { napis: 'Anuluj', klik: zamknij => { zamknij(); ok(null); } },
            { napis: napisPrzycisku, klasa: 'glowny', klik: zamknij => {
              const v = (document.getElementById('rcp-powod').value || '').trim();
              if (!v) { komunikat('Napisz powód — zostanie zapisany.', 'blad'); return; }
              zamknij(); ok(v);
            } },
          ],
        });
      });
    }

    // ------------------------------------------------------------ widok „Dni”
    function wierszDnia(w) {
      const otwarty = S.otwarte.has(w.pracownik + '|' + w.dzien);
      const st = status(w), zat = st === 'zatwierdzony', wPracy = st === 'w_pracy';
      const karta = el('article', 'karta rcp-dzien', '', { 'data-pracownik': w.pracownik, 'data-dzien': w.dzien });
      const gora = el('div', 'karta-gora');
      const opis = el('div');
      const tytul = el('h3', '', w.nazwa + ' ');
      tytul.appendChild(el('span', 'slaby', poPolsku(w.dzien)));
      const info = el('div', 'rcp-szczegoly');
      info.append(el('span', '', przedzialy(w.odbicia) || '—'), el('b', '', hm(w.czas_pracy_min)));
      const ponad = (w.nad50_min || 0) + (w.nad_nocne_min || 0);
      if (ponad > 0) info.appendChild(el('span', 'slaby', 'ponad 8 h: ' + hm(ponad)));
      if (w.nad100_min > 0) info.appendChild(el('span', 'slaby', (w.dzien_wolny || 'dzień wolny') + ': ' + hm(w.nad100_min)));
      if (w.godziny_nocne_min > 0) info.appendChild(el('span', 'slaby', 'nocne: ' + hm(w.godziny_nocne_min)));
      const zm = w.zmiana_wynik || w.zmiana;
      if (zm) info.appendChild(plakietka('Zmiana ' + zm));
      if (w.spoznienie_min > 0) info.appendChild(plakietka('Spóźnienie ' + w.spoznienie_min + ' min', 'p-w_toku'));
      if (wPracy) info.appendChild(plakietka('W pracy', 'p-w_toku'));
      if (zat) info.appendChild(plakietka('Zatwierdzone (' + (w.zatwierdzono.kto || '') + ')', 'p-dostarczone'));
      for (const a of w.anomalie || []) info.appendChild(plakietka(UWAGI[a] || a, 'p-w_toku'));
      opis.append(tytul, info);
      const akcje = el('div', 'rcp-akcje');
      if (zat) akcje.appendChild(przycisk('Wycofaj', 'maly', 'wycofaj'));
      else if (!wPracy && (w.odbicia || []).length) akcje.appendChild(przycisk((w.anomalie || []).length ? 'Zatwierdź mimo uwag' : 'Zatwierdź', (w.anomalie || []).length ? 'maly' : 'glowny maly', 'zatwierdz'));
      akcje.appendChild(przycisk(otwarty ? 'Zwiń' : 'Odbicia', 'maly', 'popraw'));
      gora.append(opis, akcje);
      karta.appendChild(gora);
      if (otwarty) {
        const lista = el('ul', 'rcp-odbicia');
        for (const o of sortCzasu(w.odbicia)) {
          const li = el('li', '', godz(o.czas) + ' — ' + (o.rodzaj === 'wyjscie' ? 'wyjście' : 'wejście') + ' ');
          li.appendChild(el('span', 'slaby', o.zrodlo === 'korekta' ? '· ręcznie: ' + (o.powod || '') : '· terminal'));
          if (!zat && o.id) li.appendChild(przycisk('Anuluj odbicie', 'maly', 'anuluj', { odbicie: o.id }));
          lista.appendChild(li);
        }
        const blok = el('div', 'rcp-popraw');
        blok.appendChild(lista);
        if (zat) blok.appendChild(el('p', 'slaby', 'Dzień jest zatwierdzony — najpierw wycofaj zatwierdzenie, żeby go poprawić.'));
        else {
          const f = el('form', 'rcp-korekta', '', { autocomplete: 'off' });
          const rodzaj = el('select', '', '', { name: 'rodzaj' });
          rodzaj.append(el('option', '', 'Wyjście', { value: 'wyjscie' }), el('option', '', 'Wejście', { value: 'wejscie' }));
          const czas = el('input', '', '', { name: 'czas', type: 'datetime-local', required: 'required' });
          const powod = el('input', '', '', { name: 'powod', maxlength: '300', required: 'required', placeholder: 'np. zapomniał odbić' });
          for (const [t, c] of [['Brakujące odbicie', rodzaj], ['Kiedy', czas], ['Powód', powod]]) { const l = el('label', '', t); l.appendChild(c); f.appendChild(l); }
          f.appendChild(el('button', 'glowny maly', 'Dodaj odbicie', { type: 'submit' }));
          blok.appendChild(f);
        }
        karta.appendChild(blok);
      }
      return karta;
    }

    function rysujDni() {
      const l = liczby(S.dni || []);
      const pasek = el('form', 'rcp-pasek', '', { autocomplete: 'off' });
      const od = el('input', '', '', { type: 'date', name: 'od', required: 'required', value: S.od });
      const dd = el('input', '', '', { type: 'date', name: 'do', required: 'required', value: S.do });
      const szukaj = el('input', '', '', { type: 'search', name: 'szukaj', placeholder: 'nazwisko', value: S.szukaj });
      for (const [t, c] of [['Od', od], ['Do', dd], ['Szukaj', szukaj]]) { const lab = el('label', '', t); lab.appendChild(c); pasek.appendChild(lab); }
      pasek.appendChild(el('button', 'glowny', 'Pokaż', { type: 'submit' }));
      pasek.addEventListener('submit', ev => {
        ev.preventDefault();
        if (!od.value || !dd.value || dd.value < od.value) { komunikat('Sprawdź daty: „do” nie może być przed „od”.', 'blad'); return; }
        S.od = od.value; S.do = dd.value; wczytaj();
      });
      const filtry = el('div', 'chipy', '', { role: 'group', 'aria-label': 'Filtr dni' });
      for (const [k, n] of FILTRY) {
        const b = el('button', 'chip' + (S.filtr === k ? ' wybrany' : ''), n + ' · ' + l[k], { type: 'button', 'data-filtr': k, 'aria-pressed': String(S.filtr === k) });
        filtry.appendChild(b);
      }
      const lista = el('div', 'rcp-lista');
      const odswiezListe = () => {
        lista.textContent = '';
        const w = wiersze(S.dni, S.filtr, S.szukaj);
        if (!w.length) lista.appendChild(el('div', 'karta', l.wszystkie ? 'Nic w tym filtrze.' : 'Brak odbić w tym okresie.'));
        for (const x of w) lista.appendChild(wierszDnia(x));
      };
      szukaj.addEventListener('input', () => { S.szukaj = szukaj.value; odswiezListe(); });
      odswiezListe();
      tresc.append(pasek, filtry, lista);
    }

    // ------------------------------------------------------------ widok „Grafik”
    function tabela(naglowki, wierszeT) {
      const pud = el('div', 'tabela-przewijana');
      const t = el('table', 'tabela-wsk');
      const tr0 = el('tr');
      for (const n of naglowki) tr0.appendChild(el('th', '', n));
      t.appendChild(el('thead')).appendChild(tr0);
      const cialo = el('tbody');
      for (const w of wierszeT) { const tr = el('tr'); for (const c of w) tr.appendChild(c instanceof Node ? c : el('td', '', c)); cialo.appendChild(tr); }
      t.appendChild(cialo);
      pud.appendChild(t);
      return pud;
    }

    function rysujGrafik() {
      const g = S.grafik || { wpisy: [], zmiany: {} };
      const dni = [0, 1, 2, 3, 4, 5, 6].map(i => dodajDni(S.tydzien, i));
      const plan = new Map((g.wpisy || []).map(w => [w.pracownik + '|' + w.dzien, w.zmiana]));
      const maja = new Set((S.karty || []).map(k => k.pracownik));
      const osoby = S.osoby.filter(p => maja.has(p.id) || dni.some(d => plan.has(p.id + '|' + d)));
      const pasek = el('div', 'rcp-pasek');
      const wstecz = przycisk('Poprzedni', 'maly', 'tydzien-wstecz'); wstecz.insertAdjacentHTML('afterbegin', ikonka('strzalka-lewo', 14));
      const dalej = przycisk('Następny', 'maly', 'tydzien-dalej'); dalej.insertAdjacentHTML('beforeend', ikonka('strzalka-prawo', 14));
      pasek.append(wstecz, el('b', '', poPolsku(S.tydzien) + ' – ' + poPolsku(dni[6])), dalej, przycisk('Kopiuj ten tydzień na następny', 'maly', 'kopiuj-tydzien'));
      const wiersze_ = osoby.map(p => [el('th', '', p.nazwa, { scope: 'row' })].concat(dni.map(d => {
        const td = el('td');
        const s = el('select', '', '', { 'data-grafik': '', 'data-pracownik': p.id, 'data-dzien': d, 'aria-label': p.nazwa + ' ' + d });
        s.appendChild(el('option', '', '—', { value: '' }));
        for (const k of Object.keys(g.zmiany || {})) {
          const o = el('option', '', k, { value: k, title: (g.zmiany[k].od || '') + '–' + (g.zmiany[k].do || '') });
          if (plan.get(p.id + '|' + d) === k) o.selected = true;
          s.appendChild(o);
        }
        td.appendChild(s);
        return td;
      })));
      tresc.append(pasek,
        el('p', 'slaby', 'Zmiana I zaczyna się o 6:00, II o 14:00, III o 22:00 — odbicie po starcie zmiany to spóźnienie. Bez planu zmianę podpowiada godzina wejścia. Breloki przypisujesz w części „Breloki”; tu pojawiają się osoby z brelokiem.'),
        osoby.length ? tabela(['Osoba'].concat(dni.map((d, i) => dniTyg[i] + ' ' + d.slice(8) + '.' + d.slice(5, 7))), wiersze_)
                     : el('div', 'karta', 'Brak osób z brelokiem — przypisz je w części „Breloki”.'));
    }

    // ------------------------------------------------------------ widok „Breloki”
    function rysujKarty() {
      const karty = S.karty || [];
      const maja = new Set(karty.map(k => k.pracownik));
      const bez = S.osoby.filter(p => !maja.has(p.id));
      tresc.appendChild(el('p', 'slaby', 'Brelok przypisujesz osobie raz: kliknij pole „Numer karty” i przyłóż brelok do czytnika (czytnik sam wpisze numer i zatwierdzi). Jedna osoba ma jeden aktywny brelok; nowy zastępuje stary.'));
      const f = el('form', 'rcp-karta-formularz', '', { autocomplete: 'off' });
      const wybor = el('select', '', '', { name: 'pracownik', required: 'required' });
      wybor.appendChild(el('option', '', '— wybierz —', { value: '' }));
      for (const p of (bez.length ? bez : S.osoby)) wybor.appendChild(el('option', '', p.nazwa, { value: p.id }));
      const numer = el('input', '', '', { name: 'karta', inputmode: 'numeric', required: 'required', placeholder: 'przyłóż brelok do czytnika' });
      for (const [t, c] of [['Osoba', wybor], ['Numer karty', numer]]) { const l = el('label', '', t); l.appendChild(c); f.appendChild(l); }
      f.appendChild(el('button', 'glowny', 'Przypisz brelok', { type: 'submit' }));
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        try { const w = await api.post('karty', { pracownik: wybor.value, karta: numer.value.trim() }); komunikat('Brelok przypisany: ' + w.nazwa, 'ok'); await wczytaj(); }
        catch (e) { komunikat(komunikatBledu(e), 'blad'); }
      });
      tresc.appendChild(f);
      tresc.appendChild(el('h3', '', 'Przypisane breloki · ' + karty.length));
      if (!karty.length) tresc.appendChild(el('div', 'karta', 'Żaden brelok nie jest jeszcze przypisany.'));
      for (const k of karty) {
        const a = el('article', 'karta', '', { 'data-pracownik': k.pracownik });
        const gora = el('div', 'karta-gora');
        const opis = el('div'); opis.append(el('h3', '', k.nazwa || k.pracownik), el('div', 'slaby', 'numer: ' + k.numer));
        gora.append(opis, przycisk('Odepnij', 'maly', 'odepnij'));
        a.appendChild(gora); tresc.appendChild(a);
      }
      if (bez.length) tresc.append(el('h3', '', 'Bez breloka · ' + bez.length), el('p', 'slaby', bez.map(p => p.nazwa).join(', ')));
    }

    // ------------------------------------------------------------ widok „Plik dla płac”
    function rysujPlik() {
      tresc.appendChild(el('p', 'slaby', 'Plik zawiera tylko dni ZATWIERDZONE (płace nie dostają niesprawdzonych godzin) — kierowców i biura. Układ kolumn jest tymczasowy — dostosujemy go do wzoru z IMAG/Wapro, gdy go dostarczysz.'));
      const f = el('form', 'rcp-eksport', '', { autocomplete: 'off' });
      const od = el('input', '', '', { type: 'date', name: 'od', required: 'required', value: S.od });
      const dd = el('input', '', '', { type: 'date', name: 'do', required: 'required', value: S.do });
      const fmt = el('select', '', '', { name: 'format' });
      fmt.append(el('option', '', 'CSV (Excel, średnik)', { value: 'csv' }), el('option', '', 'TXT (tabulator)', { value: 'txt' }));
      fmt.value = S.eksport.format;
      const wszystkie = el('input', '', '', { type: 'checkbox', name: 'wszystkie' });
      wszystkie.checked = S.eksport.wszystkie;
      for (const [t, c] of [['Od', od], ['Do', dd], ['Format', fmt]]) { const l = el('label', '', t); l.appendChild(c); f.appendChild(l); }
      const lw = el('label', 'rcp-wybor'); lw.append(wszystkie, document.createTextNode(' Także niezatwierdzone (tylko podgląd roboczy)')); f.appendChild(lw);
      f.appendChild(el('button', 'glowny', 'Pobierz plik', { type: 'submit' }));
      const info = el('p', 'blad', '', { role: 'alert' }); info.hidden = true; f.appendChild(info);
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        S.od = od.value; S.do = dd.value; S.eksport = { format: fmt.value, wszystkie: wszystkie.checked };
        info.hidden = true;
        try {
          const w = await API.get('/api/rcp/eksport?od=' + S.od + '&do=' + S.do + '&format=' + S.eksport.format + (S.eksport.wszystkie ? '&wszystkie=1' : ''));
          if (!w.wiersze) { info.textContent = 'Brak zatwierdzonych dni w tym okresie — nie ma czego pobrać.'; info.hidden = false; return; }
          const blob = new Blob(['﻿' + w.tresc], { type: S.eksport.format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = w.nazwa_pliku;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          komunikat('Pobrano ' + w.nazwa_pliku + ' (' + w.wiersze + ' wierszy)', 'ok');
        } catch (e) { info.textContent = komunikatBledu(e); info.hidden = false; }
      });
      tresc.appendChild(f);
    }

    function rysujTresc() {
      tresc.textContent = '';
      chipy.querySelectorAll('.chip').forEach(b => { const jest = b.dataset.rcpCzesc === S.czesc; b.classList.toggle('wybrany', jest); b.setAttribute('aria-pressed', String(jest)); });
      if (S.blad) {
        const k = el('div', 'karta');
        k.append(el('h2', '', 'Nie udało się wczytać RCP'), el('p', 'slaby', S.blad), przycisk('Spróbuj ponownie', 'glowny', 'ponow'));
        tresc.appendChild(k);
        return;
      }
      if (S.czesc === 'dni') rysujDni(); else if (S.czesc === 'grafik') rysujGrafik(); else if (S.czesc === 'karty') rysujKarty(); else rysujPlik();
    }

    // ------------------------------------------------------------ zdarzenia
    for (const [k, n] of CZESCI) chipy.appendChild(el('button', 'chip', n, { type: 'button', 'data-rcp-czesc': k }));
    chipy.addEventListener('click', ev => {
      const b = ev.target.closest('[data-rcp-czesc]');
      if (!b) return;
      S.czesc = b.dataset.rcpCzesc; S.blad = '';
      if (S.czesc === 'plik') rysujTresc(); else wczytaj();
    });
    tresc.addEventListener('click', async ev => {
      const f = ev.target.closest('[data-filtr]');
      if (f) { S.filtr = f.dataset.filtr; rysujTresc(); return; }
      const b = ev.target.closest('[data-akcja]');
      if (!b) return;
      const wiersz = b.closest('[data-pracownik]');
      const pracownik = wiersz && wiersz.dataset.pracownik, dzien = wiersz && wiersz.dataset.dzien;
      switch (b.dataset.akcja) {
        case 'ponow': await wczytaj(); break;
        case 'popraw': { const k = pracownik + '|' + dzien; if (S.otwarte.has(k)) S.otwarte.delete(k); else S.otwarte.add(k); rysujTresc(); break; }
        case 'zatwierdz': {
          const wd = (S.dni || []).find(d => d.pracownik === pracownik && d.dzien === dzien);
          const uwagi = wd && wd.anomalie.length;
          if (uwagi && !(await potwierdz('Zatwierdzić dzień z uwagami?', wd.anomalie.map(a => UWAGI[a] || a).join(', ') + '. Zatwierdź tylko, jeśli to się zgadza.', { tak: 'Zatwierdź', nie: 'Nie' }))) break;
          await wykonaj(() => api.post('zatwierdz', { pracownik, dzien, swiadomie: !!uwagi }), 'Dzień zatwierdzony');
          break;
        }
        case 'wycofaj': {
          const powod = await zapytajPowod('Wycofać zatwierdzenie?', 'Dlaczego? (zostanie zapisane)', 'Wycofaj');
          if (powod) await wykonaj(() => api.post('wycofaj', { pracownik, dzien, powod }), 'Zatwierdzenie wycofane');
          break;
        }
        case 'anuluj': {
          const powod = await zapytajPowod('Anulować odbicie?', 'Dlaczego? (odbicie zostaje w dzienniku, ale nie liczy się do godzin)', 'Anuluj odbicie');
          if (powod) await wykonaj(() => api.post('anuluj', { odbicie: b.dataset.odbicie, powod }), 'Odbicie anulowane');
          break;
        }
        case 'odepnij':
          if (await potwierdz('Odpiąć brelok?', 'Osoba nie będzie mogła odbijać się tym brelokiem, aż przypiszesz nowy.', { tak: 'Odepnij', nie: 'Nie' }))
            await wykonaj(() => api.post('karty', { pracownik, odepnij: true }), 'Brelok odpięty');
          break;
        case 'tydzien-wstecz': S.tydzien = dodajDni(S.tydzien, -7); await wczytaj(); break;
        case 'tydzien-dalej': S.tydzien = dodajDni(S.tydzien, 7); await wczytaj(); break;
        case 'kopiuj-tydzien':
          if (await potwierdz('Skopiować plan?', 'Plan tego tygodnia zastąpi plan następnego (dla osób, które mają wpisy w tym tygodniu).', { tak: 'Kopiuj', nie: 'Nie' }))
            await wykonaj(() => api.post('grafik', { kopiuj_tydzien_od: S.tydzien }), 'Plan skopiowany na następny tydzień');
          break;
        default: break;
      }
    });
    tresc.addEventListener('change', ev => {
      const s = ev.target;
      if (s.dataset && s.dataset.grafik !== undefined)
        wykonaj(() => api.post('grafik', { pracownik: s.dataset.pracownik, dni: [s.dataset.dzien], zmiana: s.value || null }), '');
    });
    tresc.addEventListener('submit', async ev => {
      const f = ev.target;
      if (!f.classList.contains('rcp-korekta')) return;
      ev.preventDefault();
      const wiersz = f.closest('[data-pracownik]');
      await wykonaj(() => api.post('korekta', { pracownik: wiersz.dataset.pracownik, rodzaj: f.rodzaj.value, czas: zOffsetem(f.czas.value), powod: f.powod.value.trim() }), 'Odbicie dodane');
    });

    chipy.querySelector('[data-rcp-czesc="dni"]').classList.add('wybrany');
    await wczytaj();
  },
};
