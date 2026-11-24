/* Terminal RCP — kiosk z czytnikiem kart USB (jak ekran „Imag RCP”, tylko nasz).

   Czytnik udaje klawiaturę: wpisuje cyfry numeru karty (np. 0006450974), zwykle z Enterem. Łapiemy je globalnie, więc nie
   trzeba nigdzie klikać. Odczyt kończy Enter albo 200 ms ciszy po ostatniej cyfrze. Zapis robi serwer
   (POST /api/v1/panel/rcp/odbicie, konto „ekran”); terminal NIE liczy godzin ani nie decyduje, czy to wejście, czy wyjście.

   Bez sieci skany czekają w pamięci terminala (z godziną skanu) i idą do serwera, gdy wróci połączenie — nikt nie traci
   odbicia przez chwilową awarię wifi. Serwer przyjmuje godzinę skanu tylko z ostatnich 48 godzin. */
(async () => {
  'use strict';

  const $ = id => document.getElementById(id);
  const KLUCZ_KOLEJKI = 'hala.panel.rcp.kolejka';
  const KLUCZ_ODRZUCONYCH = 'hala.panel.rcp.odrzucone';
  const CISZA_MS = 200, MIN_CYFR = 4, POKAZ_MS = 4000, OPCJE_MS = 12000, OKNO_BEZCZYNNOSC_MS = 120000, PONOW_MS = 15000, MAKS_KOLEJKA = 500;

  const hala = Hala.utworz({ aplikacja: 'panel', typy: [], dni: 1 });

  const pamiec = {
    czytaj(k, domyslna) { try { const t = localStorage.getItem(k); return t === null ? domyslna : JSON.parse(t); } catch (e) { return domyslna; } },
    zapisz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bez pamięci terminal działa online */ } },
  };

  // ---- sygnał dźwiękowy: wspólny zestaw GK (gk-dzwieki.js — żadna aplikacja nie ma własnego generatora, test t_dzwieki):
  // „sukces” = przyjęte, „blad” = problem albo spóźnienie. Pierwsze naciśnięcie klawisza (skan) odblokowuje dźwięk przeglądarki.
  const DZWIEK_OK = 'sukces', DZWIEK_BLAD = 'blad';
  function pisk(rodzaj) { try { if (window.GKDzwieki) window.GKDzwieki.zagraj(rodzaj); } catch (e) { /* bez dźwięku też działa */ } }

  // ---- ekran
  let zegarKoniec = 0;
  function rysujZegar() {
    const t = new Date();
    $('zegar').textContent = t.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $('data').textContent = t.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (zegarKoniec && Date.now() > zegarKoniec) pokaz('', '', '');
  }
  setInterval(rysujZegar, 1000);

  // `opcje` — id właśnie zapisanego odbicia: pod komunikatem pojawiają się „Sprawdź dane” i „Złóż wniosek urlopowy” (D97).
  // Kliknięcie którejkolwiek ANULUJE to odbicie (serwer: tylko świeże, z tego terminala) i otwiera okno osoby.
  let opcjeOdbicie = null;
  function pokaz(rodzaj, tekst, podpis, opcje) {
    $('terminal').className = rodzaj;
    $('komunikat').textContent = tekst || 'Zeskanuj kartę…';
    $('podpis').textContent = podpis || '';
    opcjeOdbicie = opcje || null;
    $('opcje').hidden = !opcjeOdbicie;
    zegarKoniec = rodzaj ? Date.now() + (opcjeOdbicie ? OPCJE_MS : POKAZ_MS) : 0;
  }

  function stan() {
    const kol = pamiec.czytaj(KLUCZ_KOLEJKI, []).length, odrz = pamiec.czytaj(KLUCZ_ODRZUCONYCH, []).length;
    const el = $('stan'), polaczony = !!(hala.polaczenie && hala.polaczenie.online);
    el.className = kol || odrz ? 'czeka' : (polaczony ? '' : 'blad');
    $('stan-tekst').textContent = [polaczony ? 'Połączony z serwerem' : 'Brak połączenia z serwerem',
      kol ? `${kol} skan(ów) czeka na wysłanie` : '', odrz ? `${odrz} odrzuconych (zgłoś kierownikowi)` : ''].filter(Boolean).join(' · ');
  }

  function nazwaRodzaju(r) { return r === 'wyjscie' ? 'WYJŚCIE' : 'WEJŚCIE'; }

  // ---- wysyłka
  // Brak odpowiedzi huba (fetch padł, limit czasu, bramka zamiast serwera) albo wygasła sesja (401) = skan zostaje w kolejce
  // terminala. Odmowa samego serwera (nieznana karta, 403…) to decyzja człowieka — nie ponawiamy jej w nieskończoność.
  function bladSieci(e) { return !e || !e.odHuba || e.kod === 401; }

  async function wyslij(karta, kiedy) {
    return hala.zapytaj('POST', '/api/v1/panel/rcp/odbicie', { karta, zeskanowano: kiedy });
  }

  let wysylka = Promise.resolve();
  function skan(karta) {
    const kiedy = new Date().toISOString();
    // Kolejka: skany idą jeden po drugim, w kolejności przyłożenia (dwa naraz mogłyby się wyprzedzić).
    wysylka = wysylka.then(() => obsluz(karta, kiedy));
  }

  async function obsluz(karta, kiedy) {
    try {
      const w = await wyslij(karta, kiedy);
      if (w.powtorzone) { pokaz('uwaga', 'Już odbito', `${w.nazwa} — ${nazwaRodzaju(w.rodzaj)} ${w.czas_lokalny || ''}`.trim()); pisk(DZWIEK_BLAD); return; }
      // Wejście po starcie zmiany (6:00 / 14:00 / 22:00) to spóźnienie — mówimy to od razu, żeby nikt nie dowiedział się po fakcie.
      const spoznienie = w.rodzaj === 'wejscie' && w.spoznienie_min > 0;
      pokaz(spoznienie ? 'uwaga' : 'ok', `${nazwaRodzaju(w.rodzaj)} ${w.czas_lokalny}`,
            spoznienie ? `${w.nazwa} — spóźnienie ${w.spoznienie_min} min (zmiana ${w.zmiana})` : w.nazwa, w.id);
      if (w.uwaga === 'poprzednie_bez_wyjscia') $('podpis').textContent += ' — poprzedni dzień bez wyjścia, zgłoś kierownikowi';
      // Decyzja w sprawie wniosku urlopowego — pokazujemy raz, przy najbliższym odbiciu (pracownik produkcji nie ma aplikacji).
      const decyzje = (w.decyzje || []).map(x => `Wniosek ${dataPl(x.od)} – ${dataPl(x.do)}: ${x.status === 'zatwierdzony' ? 'zatwierdzony' : 'odrzucony' + (x.powod ? ' (' + x.powod + ')' : '')}`);
      if (decyzje.length) {
        $('podpis').textContent += ' · ' + decyzje.join(' · ');
        zegarKoniec = Date.now() + Math.max(POKAZ_MS, 12000);
      }
      pisk(spoznienie ? DZWIEK_BLAD : DZWIEK_OK);
    } catch (e) {
      if (bladSieci(e)) {
        const k = pamiec.czytaj(KLUCZ_KOLEJKI, []);
        k.push({ karta, zeskanowano: kiedy });
        pamiec.zapisz(KLUCZ_KOLEJKI, k.slice(-MAKS_KOLEJKA));
        pokaz('uwaga', 'Zapisano na terminalu', 'Brak połączenia — odbicie wyśle się samo. Nazwisko pokaże się później.');
        pisk(DZWIEK_OK);
      } else {
        pokaz('blad', (e && e.message) || 'Nie udało się odbić. Przyłóż kartę jeszcze raz.', '');
        pisk(DZWIEK_BLAD);
      }
    }
    stan();
  }

  let wTrakcie = false;
  async function oprozniKolejke() {
    if (wTrakcie) return;
    wTrakcie = true;
    try {
      let k = pamiec.czytaj(KLUCZ_KOLEJKI, []);
      while (k.length) {
        const [pierwszy, ...reszta] = k;
        try {
          await wyslij(pierwszy.karta, pierwszy.zeskanowano);
        } catch (e) {
          if (bladSieci(e)) break;                       // dalej brak sieci — spróbujemy za chwilę
          const o = pamiec.czytaj(KLUCZ_ODRZUCONYCH, []);   // serwer odmówił (nieznana karta itp.) — zostaje do wglądu
          o.push({ karta: pierwszy.karta, zeskanowano: pierwszy.zeskanowano, powod: (e && e.message) || '' });
          pamiec.zapisz(KLUCZ_ODRZUCONYCH, o.slice(-100));
        }
        k = reszta;
        pamiec.zapisz(KLUCZ_KOLEJKI, k);
      }
    } finally { wTrakcie = false; stan(); }
  }
  setInterval(() => { if ($('terminal').hidden === false) oprozniKolejke(); }, PONOW_MS);

  // ---- okno osoby (D97): „Sprawdź dane” (tylko odczyt własnych danych) i „Złóż wniosek urlopowy”. Token okna trzymamy tylko w pamięci strony.
  const oknoEl = $('okno'), oknoKarta = oknoEl.querySelector('.okno-karta');
  let oknoToken = null, oknoLicznik = null, oknoAnulowano = null;
  const dwie = n => String(n).padStart(2, '0');
  const dataPl = iso => String(iso || '').split('-').reverse().join('.');
  const godz = iso => { const d = new Date(iso); return `${dwie(d.getHours())}:${dwie(d.getMinutes())}`; };
  const czas = min => (typeof min === 'number' && min >= 0 ? `${Math.floor(min / 60)}:${dwie(Math.round(min) % 60)}` : '—');
  const DZIEN_NAZWA = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];

  function el(tag, atr, ...dzieci) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(atr || {})) { if (k === 'tekst') e.textContent = v; else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); }
    for (const d of dzieci.flat()) if (d != null) e.append(d);
    return e;
  }
  function przedluzOkno() {
    clearTimeout(oknoLicznik);
    oknoLicznik = setTimeout(zamknijOkno, OKNO_BEZCZYNNOSC_MS);
  }
  async function zamknijOkno() {
    clearTimeout(oknoLicznik);
    const t = oknoToken; oknoToken = null;
    oknoEl.hidden = true; oknoKarta.replaceChildren();
    // Odbicie, z którego weszliśmy do okna, zostało anulowane — mówimy to głośno, żeby nikt nie wyszedł bez zapisanego wejścia/wyjścia.
    if (oknoAnulowano === true) pokaz('uwaga', 'Odbicie anulowane', 'Przyłóż brelok jeszcze raz, żeby zapisać wejście lub wyjście.');
    else pokaz('', '', '');
    oknoAnulowano = null;
    if (t) { try { await hala.zapytaj('POST', '/api/v1/panel/rcp/okno/zamknij', { okno: t }); } catch (e) { /* okno i tak wygasa na serwerze */ } }
  }
  oknoEl.addEventListener('pointerdown', przedluzOkno);
  oknoEl.addEventListener('keydown', przedluzOkno);

  function naglowekOkna(tytul, nazwa) {
    return el('div', { class: 'okno-pasek' }, el('div', {}, el('h1', { tekst: tytul }), el('span', { class: 'slaby', tekst: nazwa })),
              el('button', { type: 'button', tekst: 'Zakończ' }));
  }
  function zakonczOkno(pasek) { pasek.querySelector('button').addEventListener('click', zamknijOkno); return pasek; }

  // Serwer odpowiada 410, gdy okno wygasło (bezczynność 5 min, twardy limit 15 min, restart huba) — wracamy do skanu, bez wylogowania kiosku.
  function oknoWygaslo(e) {
    if (!(e && e.odHuba && e.kod === 410)) return false;
    oknoToken = null; clearTimeout(oknoLicznik); oknoEl.hidden = true; oknoKarta.replaceChildren();
    pokaz('uwaga', 'Okno wygasło', 'Przyłóż brelok jeszcze raz.');
    return true;
  }

  async function pokazDane() {
    const w = await hala.zapytaj('POST', '/api/v1/panel/rcp/moje', { okno: oknoToken });
    const wiersze = w.dni.map(d => {
      const dt = new Date(d.dzien + 'T12:00:00');
      const odb = d.odbicia.map(o => `${o.rodzaj === 'wyjscie' ? 'wyjście' : 'wejście'} ${godz(o.czas)}`).join(', ');
      const uwagi = [d.spoznienie_min > 0 ? `spóźnienie ${d.spoznienie_min} min` : '', ...d.uwagi, d.w_trakcie ? 'w pracy' : ''].filter(Boolean).join(', ');
      return el('tr', {}, el('td', { tekst: `${DZIEN_NAZWA[dt.getDay()]} ${dataPl(d.dzien).slice(0, 5)}` }), el('td', { tekst: odb || '—' }),
                el('td', { tekst: czas(d.czas_pracy_min) }), el('td', { class: uwagi ? 'blad-tekst' : 'slaby', tekst: uwagi || '—' }));
    });
    const urlopy = w.urlopy.map(u => el('li', { tekst: `${dataPl(u.od)} – ${dataPl(u.do)}${u.stan === 'trwa' ? ' (trwa)' : ''}${u.uwagi ? ' · ' + u.uwagi : ''}` }));
    const wnioski = w.wnioski.map(x => el('li', { tekst: `${dataPl(x.od)} – ${dataPl(x.do)} · ${x.rodzaj_nazwa} · ${x.status === 'oczekuje' ? 'czeka na decyzję' : x.status}${x.decyzja && x.decyzja.powod ? ' (' + x.decyzja.powod + ')' : ''}` }));
    oknoKarta.replaceChildren(zakonczOkno(naglowekOkna('Moje dane', w.osoba.nazwa)),
      el('p', { class: 'slaby', tekst: `Ostatnie dni (${dataPl(w.od)} – ${dataPl(w.do)}). Tylko do odczytu.` }),
      wiersze.length ? el('table', {}, el('thead', {}, el('tr', {}, el('th', { tekst: 'Dzień' }), el('th', { tekst: 'Odbicia' }), el('th', { tekst: 'Czas pracy' }), el('th', { tekst: 'Uwagi' }))),
                          el('tbody', {}, wiersze)) : el('p', { class: 'slaby', tekst: 'Brak odbić w ostatnich dniach.' }),
      el('h2', { tekst: 'Urlopy' }),
      w.saldo ? el('p', { tekst: `Pula na ${w.saldo.rok}: ${w.saldo.pula} dni · wykorzystano ${w.saldo.wykorzystano} · zostało ${w.saldo.zostalo} (dni robocze)` }) : null,
      urlopy.length ? el('ul', {}, urlopy) : el('p', { class: 'slaby', tekst: 'Brak zapisanych urlopów.' }),
      el('h2', { tekst: 'Wnioski urlopowe' }), wnioski.length ? el('ul', {}, wnioski) : el('p', { class: 'slaby', tekst: 'Nie złożono wniosków.' }));
  }

  function pokazWniosek(nazwa) {
    const dzis = new Date(), iso = `${dzis.getFullYear()}-${dwie(dzis.getMonth() + 1)}-${dwie(dzis.getDate())}`;
    const od = el('input', { type: 'date', required: true, min: iso, value: iso }), doo = el('input', { type: 'date', required: true, min: iso, value: iso });
    const rodzaj = el('select', {}, el('option', { value: 'wypoczynkowy', tekst: 'Wypoczynkowy' }), el('option', { value: 'na_zadanie', tekst: 'Na żądanie' }), el('option', { value: 'inny', tekst: 'Inny' }));
    const notatka = el('input', { type: 'text', maxlength: '500', placeholder: 'np. wesele rodziny (opcjonalnie)' });
    const blad = el('p', { class: 'blad-tekst', role: 'alert', hidden: true });
    const wyslij = el('button', { type: 'submit', class: 'glowny', tekst: 'Wyślij wniosek' });
    const formularz = el('form', { autocomplete: 'off', style: 'display:grid;gap:16px' },
      el('label', {}, 'Od', od), el('label', {}, 'Do (włącznie)', doo), el('label', {}, 'Rodzaj urlopu', rodzaj), el('label', {}, 'Notatka', notatka), blad, wyslij);
    od.addEventListener('change', () => { if (doo.value < od.value) doo.value = od.value; doo.min = od.value; });
    formularz.addEventListener('submit', async ev => {
      ev.preventDefault();
      wyslij.disabled = true; blad.hidden = true;
      try {
        const r = await hala.zapytaj('POST', '/api/v1/panel/rcp/wniosek', { okno: oknoToken, od: od.value, do: doo.value, rodzaj_urlopu: rodzaj.value, notatka: notatka.value.trim() });
        oknoKarta.replaceChildren(zakonczOkno(naglowekOkna('Wniosek wysłany', nazwa)),
          el('p', { class: 'ok-tekst', tekst: `Wniosek na ${dataPl(r.od)} – ${dataPl(r.do)} czeka na decyzję kierownika.` }),
          el('p', { class: 'slaby', tekst: 'Decyzję zobaczysz po przyłożeniu breloka: „Sprawdź dane”.' }));
        pisk(DZWIEK_OK);
      } catch (e) { if (oknoWygaslo(e)) return; blad.textContent = (e && e.message) || 'Nie udało się wysłać wniosku.'; blad.hidden = false; wyslij.disabled = false; pisk(DZWIEK_BLAD); }
    });
    oknoKarta.replaceChildren(zakonczOkno(naglowekOkna('Wniosek urlopowy', nazwa)), formularz);
  }

  async function otworzOkno(co) {
    const odbicie = opcjeOdbicie;
    if (!odbicie) return;
    $('opcje').hidden = true;
    try {
      const r = await hala.zapytaj('POST', '/api/v1/panel/rcp/okno', { odbicie });
      oknoToken = r.okno;
      oknoEl.hidden = false;
      przedluzOkno();
      oknoAnulowano = r.anulowano;
      if (co === 'dane') await pokazDane(); else pokazWniosek(r.nazwa);
    } catch (e) {
      if (oknoWygaslo(e)) return;
      oknoEl.hidden = true;
      pokaz('blad', (e && e.odHuba && e.message) || 'Brak połączenia z serwerem. Spróbuj jeszcze raz.', '');
      pisk(DZWIEK_BLAD);
    }
  }
  $('opcja-dane').addEventListener('click', () => otworzOkno('dane'));
  $('opcja-wniosek').addEventListener('click', () => otworzOkno('wniosek'));

  // ---- czytnik jako klawiatura
  let bufor = '', czasomierz = null, ostatniaCyfra = 0, szybkie = '';
  function zakoncz() {
    clearTimeout(czasomierz); czasomierz = null;
    const odczyt = bufor; bufor = '';
    if (odczyt.length >= MIN_CYFR) skan(odczyt);
  }
  document.addEventListener('keydown', ev => {
    if ($('terminal').hidden) return;                  // przy logowaniu pola działają normalnie
    if (!oknoEl.hidden) {
      // W oknie osoby cyfry z klawiatury trafiają do pól formularza. Skan breloka (szybki ciąg cyfr) to inna osoba w kolejce: zamykamy okno
      // i odbijamy ją — inaczej wejście zniknęłoby, a numer breloka wpadłby w cudzą notatkę.
      if (/^[0-9]$/.test(ev.key)) {
        const teraz = Date.now();
        szybkie = teraz - ostatniaCyfra < 80 ? szybkie + ev.key : ev.key;
        ostatniaCyfra = teraz;
        if (szybkie.length >= MIN_CYFR) {
          ev.preventDefault();
          const a = document.activeElement;
          if (a && a.tagName === 'INPUT' && a.type === 'text' && a.value.endsWith(szybkie.slice(0, -1))) a.value = a.value.slice(0, a.value.length - (szybkie.length - 1));
          const odczyt = szybkie; szybkie = '';
          zamknijOkno();                                  // zamknięcie ekranu jest synchroniczne (zapytanie do serwera leci w tle)
          bufor = odczyt; clearTimeout(czasomierz); czasomierz = setTimeout(zakoncz, CISZA_MS);
        }
      }
      return;
    }
    if (ev.key === 'Enter') { ev.preventDefault(); zakoncz(); return; }
    if (/^[0-9]$/.test(ev.key)) {
      ev.preventDefault();
      bufor += ev.key;
      clearTimeout(czasomierz);
      czasomierz = setTimeout(zakoncz, CISZA_MS);
    }
  });

  // ---- logowanie kontem ekranu i start
  function pokazSesje() {
    const z = hala.zalogowany();
    $('logowanie').hidden = z;
    $('terminal').hidden = !z;
    if (z) { rysujZegar(); oprozniKolejke(); }
    stan();
  }
  $('formularz-logowania').addEventListener('submit', async ev => {
    ev.preventDefault();
    const blad = $('blad-logowania');
    blad.hidden = true;
    try {
      await hala.zaloguj({ identyfikator: $('identyfikator').value.trim(), pin: $('haslo').value });
      $('haslo').value = '';
    } catch (e) {
      blad.textContent = (e && e.message) || 'Nie udało się zalogować.';
      blad.hidden = false;
    }
  });
  hala.na('sesja', pokazSesje);
  hala.na('polaczenie', () => { stan(); if (hala.zalogowany()) oprozniKolejke(); });
  await hala.start();
  pokazSesje();
})();
