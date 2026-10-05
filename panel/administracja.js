/* Panel Kierownika — ekran administracji (tylko rola admin). 2026-09-28: login to imię i nazwisko (D26),
   więc pracowników, PIN-y i karty prowadzi się tutaj, a nie tylko plikiem wspolne/narzedzia/zaladuj.py.

   Trzy części:
   - Pracownicy: dodaj, zmień dane, role, linie, nowy PIN, karta (zgubiona → usuń), wyłącz konto, odblokuj po złych PIN-ach.
     Hub: GET/POST /api/v1/admin/… przez hala.admin (rolę sprawdza hub). PIN-ów i kart nie widać — w bazie są tylko skróty.
   - Linie i maszyny: słowniki przez zdarzenia slownik.zapisany / slownik.usuniety (jak każdy zapis w systemie).
   - Ustawienia: sieć zakładu i progi (hub sprawdza zakresy przy zapisie), kopie poza komputerem (etap 2: folder,
     przechowywanie zdjęć, „Zrób kopię teraz” — GET/POST /api/v1/admin/kopie).
   - Nad wszystkim czerwona wstęga alarmów huba (GET /api/v1/admin/alarmy): kopia, adres na Pages, token GitHub, miejsce.
   - Połączenia GK (D32): klucze programów GK Trasy i GK Flota, które biorą konta z huba (wspolne/GK-KONTA.md §3).
     Jedno konto osoby we wszystkich aplikacjach GK — role transportu w oknie osoby, w osobnych grupach.
   - Dostęp z telefonów (D33): stan tunelu, adresy czterech aplikacji na GitHub Pages z kodami QR, „Wyślij aplikacje na
     GitHub”, wersja na Pages. Ustawienia tunelu i tokenów — Ustawienia → „Tunel i GitHub” (tokeny nigdy nie wracają z huba).
   Co pokazać i czy formularz jest dobry, liczy widok.js (testy: panel/testy/widok-testy.js). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;

  let czesc = 'pracownicy';
  let lista = null, twojAdres = '', wczytuje = false, bladListy = '';
  let szukaj = '', nieaktywni = false;

  async function wczytajPracownikow() {
    if (wczytuje) return;
    wczytuje = true;
    try {
      const r = await hala.admin('GET', '/api/v1/admin/pracownicy');
      lista = r.pracownicy; twojAdres = r.twoj_adres || ''; bladListy = '';
    } catch (e) {
      bladListy = P.komunikatBledu(e);
    } finally {
      wczytuje = false;
      P.narysuj();
    }
  }

  /* Alarmy huba (etap 2): czerwona wstęga nad wszystkimi częściami Administracji — kopia poza komputerem, adres huba na
     Pages, token GitHub, miejsce na dysku. Komputer w biurze stoi bez opieki; to, co psuje się po cichu, ma krzyczeć.
     Odświeżane co minutę, gdy Administracja jest otwarta (hub wysyła też push, najwyżej raz na 6 h). */
  let alarmy = [], alarmyCzas = 0, wczytujeAlarmy = false;
  async function wczytajAlarmy() {
    if (wczytujeAlarmy) return;
    wczytujeAlarmy = true; alarmyCzas = Date.now();
    try { alarmy = W.alarmyAdmina((await hala.admin('GET', '/api/v1/admin/alarmy')).alarmy); }
    catch (e) { /* bez sieci zostaje ostatnia wstęga — pasek połączenia i tak mówi, że huba nie ma */ }
    finally { wczytujeAlarmy = false; rysujAlarmy(); }
  }
  function rysujAlarmy() {
    const el = $('admin-alarmy');
    if (!el) return;
    const tresc = alarmy.map(a => `<p><b>${esc(a.tytul)}</b> ${esc(a.opis)}</p>`).join('');
    if (el.dataset.tresc === tresc) return;
    el.dataset.tresc = tresc;
    el.innerHTML = tresc;
    el.hidden = !alarmy.length;
  }

  function rysuj() {
    for (const b of document.querySelectorAll('#administracja .chip')) b.setAttribute('aria-pressed', String(b.dataset.czesc === czesc));
    if (Date.now() - alarmyCzas > 60000) wczytajAlarmy(); else rysujAlarmy();
    const el = $('admin-tresc');
    if (czesc === 'pracownicy') rysujPracownikow(el);
    else if (czesc === 'linie') rysujLinie(el);
    else if (czesc === 'etykiety') rysujEtykiety(el);
    else if (czesc === 'polaczenia') rysujPolaczenia(el);
    else if (czesc === 'dostep') rysujDostep(el);
    else rysujUstawienia(el);
  }

  // ------------------------------------------------------------ pracownicy

  function rysujPracownikow(el) {
    if (lista === null) { el.innerHTML = `<p class="pusto">${esc(bladListy || 'Wczytuję…')}</p>`; if (!bladListy) wczytajPracownikow(); return; }
    // Pole wyszukiwania rysujemy tylko raz — przerysowanie co 20 s nie może zabierać kursora w trakcie pisania.
    if (!el.querySelector('#admin-szukaj')) {
      el.innerHTML = `
        <div class="admin-pasek">
          <input id="admin-szukaj" type="search" placeholder="Szukaj osoby" aria-label="Szukaj osoby" value="${esc(szukaj)}">
          <label class="zaznacz"><input type="checkbox" id="admin-nieaktywni" ${nieaktywni ? 'checked' : ''}> Pokaż wyłączone</label>
          <button type="button" class="glowny" id="admin-dodaj">+ Dodaj osobę</button>
        </div>
        <div id="admin-lista" class="lista"></div>`;
    }
    const linie = (hala.slowniki && hala.slowniki.linie) || {};
    const wiersze = W.pracownicyAdmin({ lista, szukaj, nieaktywni, stale: hala.kontrakt && hala.kontrakt.stale });
    $('admin-lista').innerHTML = wiersze.map(p => `
      <article class="admin-osoba ${p.aktywny === false ? 'wylaczona' : ''} ${p.zablokowany ? 'zablokowana' : ''}" data-id="${esc(p.id)}">
        <div class="opis">
          <div><b>${esc(p.nazwa)}</b> <span class="slaby">${esc(p.id)}</span></div>
          <div class="szczegoly">
            ${p.roleNazwy.map(r => `<span class="znacznik neutral">${esc(r)}</span>`).join('')}
            ${(p.linie || []).map(l => `<span>${esc((linie[l] || {}).nazwa || l)}</span>`).join('')}
            ${p.ma_karte ? '<span class="slaby">karta ✓</span>' : ''}${p.ma_pin ? '' : '<span class="tekst-alarm">bez PIN-u</span>'}
            ${p.telefon ? `<span class="slaby">☎ ${esc(p.telefon)}</span>` : ''}
            ${p.aktywny === false ? '<span class="znacznik neutral">Wyłączone</span>' : ''}
            ${p.zablokowany ? `<span class="znacznik alarm">${p.blokada_internet && p.blokada_internet.rodzaj === 'konto'
              ? 'Zablokowane z internetu' : 'Zablokowane po złych PIN-ach'}</span>` : ''}
          </div>
        </div>
        <div class="akcje">
          ${p.zablokowany ? '<button type="button" class="maly glowny" data-akcja="odblokuj">Odblokuj</button>' : ''}
          <button type="button" class="maly" data-akcja="edytuj">Zmień</button>
        </div>
      </article>`).join('') || '<p class="pusto">Nikogo nie znaleziono</p>';
  }

  const fp = $('formularz-osoby');
  let edytowany = null;

  function otworzOsobe(osoba) {
    edytowany = osoba;
    fp.reset();
    $('t-okno-osoby').textContent = osoba ? osoba.nazwa : 'Nowa osoba';
    fp.nazwa.value = osoba ? osoba.nazwa : '';
    // Role w grupach: hala oraz GK Trasy / GK Flota (D32) — jedno konto osoby we wszystkich aplikacjach GK.
    $('osoba-role').innerHTML = W.grupyRol(hala.kontrakt && hala.kontrakt.stale).map(g => `
      <fieldset><legend>${esc(g.nazwa)}</legend>${g.opis ? `<p class="slaby konto-drobne">${esc(g.opis)}</p>` : ''}
        <div class="zaznaczenia">${g.role.map(r =>
          `<label class="zaznacz"><input type="checkbox" name="role" value="${esc(r.kod)}" ${osoba && osoba.role.includes(r.kod) ? 'checked' : ''}> ${esc(r.nazwa)}</label>`).join('')}</div>
      </fieldset>`).join('');
    const linie = Object.entries((hala.slowniki && hala.slowniki.linie) || {});
    $('osoba-linie').innerHTML = linie.map(([kod, l]) =>
      `<label class="zaznacz"><input type="checkbox" name="linie" value="${esc(kod)}" ${osoba && (osoba.linie || []).includes(kod) ? 'checked' : ''}> ${esc((l && l.nazwa) || kod)}</label>`).join('')
      || '<span class="slaby">Najpierw dodaj linie</span>';
    fp.telefon.value = (osoba && osoba.telefon) || '';
    $('osoba-loginy').textContent = osoba && (osoba.loginy || []).length
      ? `Stare loginy z programów (też logują): ${osoba.loginy.join(', ')}` : '';
    polePinu();
    $('osoba-usun-karte').hidden = !(osoba && osoba.ma_karte);
    fp.aktywny.checked = !osoba || osoba.aktywny !== false;
    fp.querySelector('.blad').hidden = true;
    $('okno-osoby').showModal();
    fp.nazwa.focus();
  }

  /* Biuro GK Trasy / GK Flota ma hasło (min. 8 znaków, litery też) — pole i podpis idą za zaznaczonymi rolami. */
  function polePinu() {
    const biuro = W.biuroTransportu([...fp.querySelectorAll('input[name="role"]:checked')].map(x => x.value));
    $('osoba-pin-etykieta').textContent = biuro ? 'Hasło (min. 8 znaków)' : 'PIN';
    fp.pin.inputMode = biuro ? 'text' : 'numeric';
    fp.pin.placeholder = edytowany ? `zostaw puste — ${biuro ? 'hasło' : 'PIN'} bez zmian` : biuro ? 'min. 8 znaków' : '4–8 cyfr';
  }
  $('osoba-role').addEventListener('change', polePinu);

  fp.addEventListener('submit', async ev => {
    ev.preventDefault();
    const wybrane = n => [...fp.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);
    const w = W.pracownikZFormularza({ nazwa: fp.nazwa.value, role: wybrane('role'), linie: wybrane('linie'), pin: fp.pin.value,
                                       karta: fp.karta.value, usun_karte: fp.usun_karte.checked, aktywny: fp.aktywny.checked,
                                       telefon: fp.telefon.value }, edytowany, lista);
    const blad = fp.querySelector('.blad');
    if (w.bledy.length) { blad.textContent = w.bledy.join(' '); blad.hidden = false; return; }
    // Własna rola administratora (D35): po zapisie Administracja znika z menu — pytamy, zanim to się stanie.
    // Ostatniego administratora hub i tak nie odda (409); tu chodzi o pomyłkę przy własnym koncie.
    const ja = hala.pracownik && edytowany && edytowany.id === hala.pracownik.id;
    if (ja && edytowany.role.includes('admin') && (!w.dane.role.includes('admin') || w.dane.aktywny === false)
        && !(await P.potwierdz(w.dane.aktywny === false ? 'Wyłączyć własne konto?' : 'Odebrać sobie rolę administratora?',
          'Po zapisie stracisz dostęp do Administracji (konta, PIN-y, tunel). Wróci tylko, gdy nada go inny administrator.',
          w.dane.aktywny === false ? 'Wyłącz' : 'Odbierz'))) return;
    // Etap 3: osoba zleca zlecenia stałe — po wyłączeniu (albo bez roli kierownika) hub przestanie je zlecać.
    const ostrz = W.ostrzezenieAutora(hala.slowniki, edytowany, w.dane, ((hala.kontrakt.zdarzenia['zlecenie.utworzone'] || {}).role) || []);
    if (ostrz && !(await P.potwierdz('Zlecenia stałe tej osoby', ostrz, 'Zapisz mimo to'))) return;
    try {
      await hala.admin('POST', '/api/v1/admin/pracownik', w.dane);
      $('okno-osoby').close();
      await wczytajPracownikow();
    } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });

  // ------------------------------------------------------------ linie i maszyny

  function rysujLinie(el) {
    const sl = hala.slowniki || {};
    const linie = Object.entries(sl.linie || {}).sort(([, a], [, b]) => ((a || {}).kolejnosc || 999) - ((b || {}).kolejnosc || 999));
    const maszyny = Object.entries(sl.maszyny || {});
    const stanowiska = Object.entries(sl.stanowiska || {});
    el.innerHTML = `
      <div class="admin-pasek">
        <button type="button" class="glowny" data-akcja="nowa-linia">+ Linia</button>
        <button type="button" data-akcja="nowe-stanowisko" ${linie.length ? '' : 'disabled'}>+ Stanowisko</button>
        <button type="button" data-akcja="nowa-maszyna" ${linie.length ? '' : 'disabled'}>+ Maszyna</button>
      </div>
      ${linie.map(([kod, l]) => `
        <section class="admin-linia">
          <h3><span>${esc(l.nazwa)} <span class="slaby">${esc(kod)}</span></span>
            <button type="button" class="maly" data-akcja="linia" data-kod="${esc(kod)}">Zmień</button></h3>
          ${stanowiska.filter(([, st]) => st.linia === kod).map(([sk, st]) => `
            <div class="admin-maszyna admin-stanowisko"><span>📍 ${esc(st.nazwa)} <span class="slaby">${esc(sk)}</span></span>
              <span><button type="button" class="maly" data-akcja="stanowisko" data-kod="${esc(sk)}">Zmień</button>
              <button type="button" class="maly" data-akcja="wycofaj-stanowisko" data-kod="${esc(sk)}">Wycofaj</button></span></div>`).join('')}
          ${maszyny.filter(([, m]) => m.linia === kod).map(([mk, m]) => `
            <div class="admin-maszyna"><span><b>${esc(m.nazwa)}</b> <span class="slaby">${esc(mk)}${m.typ ? ` · ${esc(m.typ)}` : ''}${m.stanowisko ? ` · ${esc(m.stanowisko)}` : ''}</span></span>
              <span><button type="button" class="maly" data-akcja="maszyna" data-kod="${esc(mk)}">Zmień</button>
              <button type="button" class="maly" data-akcja="wycofaj" data-kod="${esc(mk)}">Wycofaj</button></span></div>`).join('')
            || '<p class="slaby">Bez maszyn</p>'}
        </section>`).join('') || '<p class="pusto">Nie ma jeszcze linii</p>'}
      <p class="slaby">Kod linii i maszyny to napis na etykiecie QR (HALA:L:…, HALA:M:…) — po wydrukowaniu etykiet go nie zmieniaj.</p>`;
  }

  const fs = $('formularz-pozycji');
  let pozycja = null;          // { rodzaj: 'linie'|'maszyny', kod?: istniejący }

  function otworzPozycje(rodzaj, kod) {
    pozycja = { rodzaj, kod };
    const sl = hala.slowniki || {};
    const w = kod ? (sl[rodzaj] || {})[kod] || {} : {};
    fs.reset();
    const NAZWY = { linie: ['Linia', 'Nowa linia'], stanowiska: ['Stanowisko', 'Nowe stanowisko'], maszyny: ['Maszyna', 'Nowa maszyna'] };
    $('t-okno-pozycji').textContent = kod ? `${NAZWY[rodzaj][0]} ${kod}` : NAZWY[rodzaj][1];
    fs.kod.value = kod || ''; fs.kod.disabled = !!kod;
    fs.nazwa.value = w.nazwa || '';
    $('pozycja-linia').hidden = rodzaj === 'linie';
    $('pozycja-typ').hidden = $('pozycja-stanowisko').hidden = rodzaj !== 'maszyny';
    $('pozycja-kolejnosc').hidden = rodzaj !== 'linie';
    fs.linia.innerHTML = Object.entries(sl.linie || {}).map(([k, l]) => `<option value="${esc(k)}">${esc((l && l.nazwa) || k)}</option>`).join('');
    if (w.linia) fs.linia.value = w.linia;
    stanowiskaLinii(w.stanowisko);
    fs.typ.value = w.typ || '';
    fs.kolejnosc.value = w.kolejnosc || '';
    fs.querySelector('.blad').hidden = true;
    $('okno-pozycji').showModal();
    (kod ? fs.nazwa : fs.kod).focus();
  }

  // Maszyna stoi na stanowisku swojej linii — lista stanowisk idzie za wybraną linią.
  function stanowiskaLinii(wybrane) {
    const st = Object.entries((hala.slowniki && hala.slowniki.stanowiska) || {}).filter(([, s]) => s.linia === fs.linia.value);
    fs.stanowisko.innerHTML = '<option value="">— bez stanowiska —</option>'
      + st.map(([k, s]) => `<option value="${esc(k)}" ${k === wybrane ? 'selected' : ''}>${esc(s.nazwa)} (${esc(k)})</option>`).join('');
  }
  fs.linia.addEventListener('change', () => stanowiskaLinii(''));

  fs.addEventListener('submit', async ev => {
    ev.preventDefault();
    const w = W.pozycjaZFormularza(pozycja.rodzaj, { kod: fs.kod.value, nazwa: fs.nazwa.value, linia: fs.linia.value, typ: fs.typ.value,
                                                     kolejnosc: fs.kolejnosc.value, stanowisko: fs.stanowisko.value }, hala.slowniki, pozycja.kod);
    const blad = fs.querySelector('.blad');
    if (w.bledy.length) { blad.textContent = w.bledy.join(' '); blad.hidden = false; return; }
    try {
      await hala.zapisz('slownik.zapisany', `${pozycja.rodzaj}/${w.klucz}`, { slownik: pozycja.rodzaj, klucz: w.klucz, wartosc: w.wartosc });
      $('okno-pozycji').close();
    } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });

  // ------------------------------------------------------------ ustawienia

  const USTAWIENIA = [
    ['prog_zolty_min', 'Kafelek żółknie tyle minut przed terminem pozycji checklisty', 30],
    ['alarm_potwierdzenia_min', 'Alarm, gdy lider nie potwierdza naprawy dłużej niż (min)', 30],
    ['sesja_godz', 'Sesja na telefonie (godziny)', 14],
    ['sesja_ekran_dni', 'Sesja monitora w biurze (dni)', 90],
  ];

  function rysujUstawienia(el) {
    if (el.querySelector('#formularz-ustawien')) return;           // nie kasujemy tego, co administrator właśnie wpisuje
    const u = (hala.slowniki && hala.slowniki.ustawienia) || {};
    const wart = (k, d) => ((u[k] || {}).wartosc !== undefined ? u[k].wartosc : d);
    el.innerHTML = `
      <form id="formularz-ustawien" class="admin-ustawienia" novalidate>
        <label>Sieć zakładu (adresy internetu wifi zakładu, po przecinku)
          <input name="siec_zakladu" value="${esc(wart('siec_zakladu', ''))}" placeholder="np. 203.0.113.7">
          <span class="slaby">${twojAdres ? `Ten komputer łączy się z adresu <b>${esc(twojAdres)}</b> — jeśli jesteś w zakładzie, to jest adres zakładu.` : ''}
            Złe PIN-y z tej sieci nie blokują kont z internetu (D35); sieci lokalne (192.168…, 10…) liczą się zawsze.
            Najprościej: Dostęp z telefonów → „Wpisz mój adres”.</span></label>
        ${USTAWIENIA.map(([k, opis, d]) => `<label>${esc(opis)}<input name="${k}" type="number" min="${W.ZAKRESY_USTAWIEN[k][0]}" max="${W.ZAKRESY_USTAWIEN[k][1]}" value="${esc(wart(k, d))}">
          <span class="blad-pola" data-blad="${k}" hidden></span></label>`).join('')}
        <p class="blad" role="alert" hidden></p>
        <div class="przyciski"><button class="glowny" type="submit">Zapisz ustawienia</button></div>
      </form>
      <form id="formularz-zmian" class="admin-ustawienia">
        <h3>Godziny zmian</h3>
        <p class="slaby">Zmiana nocna kończy się następnego dnia (np. 22:00–06:00). Obchody, raporty i „ta zmiana” w Panelu liczą się od tych godzin.</p>
        <div id="wiersze-zmian"></div>
        <button type="button" id="dodaj-zmiane">+ Zmiana</button>
        <p class="blad" role="alert" hidden></p>
        <div class="przyciski"><button class="glowny" type="submit">Zapisz godziny zmian</button></div>
      </form>
      <form id="formularz-kopii" class="admin-ustawienia" autocomplete="off">
        <h3>Kopie poza komputerem <span id="kopie-znacznik"></span></h3>
        <p class="slaby" id="kopie-opis">Wczytuję…</p>
        <label>Folder kopii
          <input name="kopia_folder" placeholder="np. E:\\GK-kopie" autocapitalize="none" spellcheck="false">
          <span class="slaby">np. E:\\GK-kopie (dysk zewnętrzny) albo folder OneDrive/Dysk Google — tylko na kopie, nigdy na żywą bazę.
            Raz na dobę hub kładzie tu kopię bazy (bez tokenów i kluczy) i nowe zdjęcia; trzyma 7 dziennych, 4 tygodniowe i 12 miesięcznych.</span></label>
        <label>Przechowuj zdjęcia (miesięcy)
          <input name="retencja_zdjec_mies" type="number" min="1" max="120" placeholder="puste = bez kasowania">
          <span class="slaby">Starsze zdjęcia znikają z huba i z kopii (RODO). Puste pole — nic nie kasujemy.</span></label>
        <ul id="kopie-lista" class="slaby"></ul>
        <p class="blad" role="alert" hidden></p>
        <div class="przyciski"><button type="button" data-akcja="kopia-teraz">Zrób kopię teraz</button>
          <button class="glowny" type="submit">Zapisz kopie</button></div>
      </form>
      <form id="formularz-dostepu" class="admin-ustawienia" autocomplete="off">
        <h3>Tunel i GitHub</h3>
        <p class="slaby">Telefony otwierają aplikacje z GitHub Pages, a dane idą do huba przez tunel Cloudflare (D33). Stan, adresy
          i kody QR: Administracja → Dostęp z telefonów. Token GitHub robi się raz — INSTRUKCJA-BIURO.md.</p>
        <div id="pola-dostepu"><p class="slaby">Wczytuję…</p></div>
      </form>`;
    const wierszZmiany = (nr, z) => `<div class="wiersz-zmiany"><input name="nr" value="${esc(nr)}" aria-label="Numer zmiany" maxlength="4">
      <input name="nazwa" value="${esc((z && z.nazwa) || '')}" placeholder="Nazwa" aria-label="Nazwa zmiany">
      <input name="od" value="${esc((z && z.od) || '')}" placeholder="06:00" aria-label="Od">
      <input name="do" value="${esc((z && z.do) || '')}" placeholder="14:00" aria-label="Do">
      <button type="button" class="maly" data-usun-zmiane aria-label="Usuń zmianę">✕</button></div>`;
    const zm = (hala.slowniki && hala.slowniki.zmiany) || {};
    $('wiersze-zmian').innerHTML = Object.entries(zm).map(([nr, z]) => wierszZmiany(nr, z)).join('');
    $('dodaj-zmiane').addEventListener('click', () => $('wiersze-zmian').insertAdjacentHTML('beforeend', wierszZmiany('', null)));
    $('wiersze-zmian').addEventListener('click', ev => { if (ev.target.closest('[data-usun-zmiane]')) ev.target.closest('.wiersz-zmiany').remove(); });
    $('formularz-zmian').addEventListener('submit', async ev => {
      ev.preventDefault();
      const blad = ev.target.querySelector('p[role=alert]');
      const wiersze = [...document.querySelectorAll('.wiersz-zmiany')].map(w => ({ nr: w.querySelector('[name=nr]').value,
        nazwa: w.querySelector('[name=nazwa]').value, od: w.querySelector('[name=od]').value, do: w.querySelector('[name=do]').value }));
      const wynik = W.zmianyZFormularza(wiersze);
      if (wynik.bledy.length) { blad.hidden = false; blad.className = 'blad'; blad.textContent = wynik.bledy.join(' '); return; }
      // Etap 3: numer zmiany, który znika, a jest w szablonach checklist albo zleceniach stałych — tam przestanie pasować.
      const uzycia = W.uzyciaZmian(hala.slowniki, wynik.zmiany.map(z => z.nr));
      if (uzycia.length && !(await P.potwierdz('Zmienić numery zmian?', `${uzycia.join(' ')} Po zapisie popraw je w Checklistach `
        + 'i w Zleceniach stałych — inaczej przestaną działać.', 'Zapisz mimo to'))) return;
      try {
        const obecne = (hala.slowniki && hala.slowniki.zmiany) || {};
        const zapisy = wynik.zmiany.filter(z => JSON.stringify(obecne[z.nr]) !== JSON.stringify(z.wartosc))
          .map(z => ['slownik.zapisany', `zmiany/${z.nr}`, { slownik: 'zmiany', klucz: z.nr, wartosc: z.wartosc }])
          .concat(Object.keys(obecne).filter(nr => !wynik.zmiany.some(z => z.nr === nr))
            .map(nr => ['slownik.usuniety', `zmiany/${nr}`, { slownik: 'zmiany', klucz: nr }]));
        blad.hidden = false; blad.className = 'slaby'; blad.textContent = 'Zapisuję…';
        const w = W.wynikZapisu(await P.zapiszWHubie(zapisy));
        blad.className = w.klasa; blad.textContent = w.tekst;
      } catch (e) { blad.hidden = false; blad.className = 'blad'; blad.textContent = P.komunikatBledu(e); }
    });
    if (lista === null) wczytajPracownikow();      // twoj_adres przychodzi z listą pracowników
    wczytajDostep().then(() => wypelnijDostep());
    wczytajKopie().then(() => wypelnijKopie());
    $('formularz-kopii').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, blad = f.querySelector('.blad');
      const w = W.kopieZFormularza({ kopia_folder: f.kopia_folder.value, retencja_zdjec_mies: f.retencja_zdjec_mies.value });
      if (w.bledy.length) { blad.hidden = false; blad.className = 'blad'; blad.textContent = w.bledy.join(' '); return; }
      if (w.dane.retencja_zdjec_mies && w.dane.retencja_zdjec_mies !== ((kopieStan || {}).ustawienia || {}).retencja_zdjec_mies
          && !(await P.potwierdz('Kasować stare zdjęcia?', `Zdjęcia starsze niż ${w.dane.retencja_zdjec_mies} mies. znikną z huba i z kopii `
            + 'poza komputerem — na zawsze. Zdarzenia (awarie, zlecenia) zostają.', 'Kasuj stare'))) return;
      try {
        kopieStan = await hala.admin('POST', '/api/v1/admin/kopie', w.dane);
        rysujStanKopii();
        blad.hidden = false; blad.className = 'ok';
        blad.textContent = w.dane.kopia_folder ? 'Zapisane. Pierwsza kopia zrobi się sama w ciągu kilku minut (albo „Zrób kopię teraz”).' : 'Zapisane.';
        alarmyCzas = 0;
      } catch (e) { blad.hidden = false; blad.className = 'blad'; blad.textContent = P.komunikatBledu(e); }
    });
    $('formularz-dostepu').addEventListener('change', ev => {
      if (ev.target.name === 'tunel_tryb') $('pola-stalego').hidden = ev.target.value !== 'staly';
    });
    $('formularz-dostepu').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, blad = f.querySelector('.blad');
      const w = W.dostepZFormularza({ tunel_tryb: f.tunel_tryb.value, tunel_adres: f.tunel_adres.value, tunel_token: f.tunel_token.value,
                                      github_repo: f.github_repo.value, github_token: f.github_token.value,
                                      usun_tunel_token: !!(f.usun_tunel_token && f.usun_tunel_token.checked),
                                      usun_github_token: !!(f.usun_github_token && f.usun_github_token.checked) },
                                    (dostepStan || {}).ustawienia);
      if (w.bledy.length) { blad.hidden = false; blad.className = 'blad'; blad.textContent = w.bledy.join(' '); return; }
      try {
        dostepStan = await hala.admin('POST', '/api/v1/admin/dostep', w.dane); dostepCzas = Date.now();
        wypelnijDostep(true);
        const b2 = $('formularz-dostepu').querySelector('.blad');
        b2.hidden = false; b2.className = 'ok';
        b2.textContent = 'Zapisane. Stan tunelu: Administracja → Dostęp z telefonów.';
      } catch (e) { blad.hidden = false; blad.className = 'blad'; blad.textContent = P.komunikatBledu(e); }
    });
    $('formularz-ustawien').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, blad = f.querySelector('p[role=alert]');
      const u2 = (hala.slowniki && hala.slowniki.ustawienia) || {};
      // Etap 3: puste pole albo liczba spoza zakresu huba — błąd przy polu (wcześniej Number('') = 0 szło do huba).
      const w = W.ustawieniaZFormularza(Object.assign({ siec_zakladu: f.siec_zakladu.value },
        Object.fromEntries(USTAWIENIA.map(([k]) => [k, f[k].value]))), u2);
      for (const el of f.querySelectorAll('[data-blad]')) { el.hidden = !w.bledy[el.dataset.blad]; el.textContent = w.bledy[el.dataset.blad] || ''; }
      if (Object.keys(w.bledy).length) { blad.hidden = false; blad.className = 'blad'; blad.textContent = 'Popraw pola zaznaczone na czerwono.'; return; }
      try {
        blad.hidden = false; blad.className = 'slaby'; blad.textContent = 'Zapisuję…';
        // „Zapisane.” dopiero, gdy hub przyjął (Panel.zapiszWHubie) — hub sprawdza zakresy i format sieci zakładu.
        const wynik = W.wynikZapisu(await P.zapiszWHubie(w.zmiany.map(([k, v]) =>
          ['slownik.zapisany', `ustawienia/${k}`, { slownik: 'ustawienia', klucz: k, wartosc: { wartosc: v } }])));
        blad.className = wynik.klasa; blad.textContent = wynik.tekst;
      } catch (e) { blad.hidden = false; blad.className = 'blad'; blad.textContent = P.komunikatBledu(e); }
    });
  }

  // ------------------------------------------------------------ kopie poza komputerem (etap 2)

  /* Ustawienie folderu i retencji w hubie (meta, nie słownik — ścieżka dotyczy komputera w biurze i hub sprawdza ją na
     dysku). Pola wypełniamy raz (przerysowanie nie kasuje wpisywanego), stan odświeżamy przy wejściu i po „teraz”. */
  let kopieStan = null, wczytujeKopie = null;
  function wczytajKopie() {
    if (wczytujeKopie) return wczytujeKopie;
    wczytujeKopie = hala.admin('GET', '/api/v1/admin/kopie')
      .then(r => { kopieStan = r; })
      .catch(e => { kopieStan = null; const o = $('kopie-opis'); if (o) o.textContent = P.komunikatBledu(e); })
      .finally(() => { wczytujeKopie = null; rysujStanKopii(); });
    return wczytujeKopie;
  }
  function wypelnijKopie() {
    const f = $('formularz-kopii');
    if (!f || !kopieStan || f.dataset.gotowe) return;
    f.dataset.gotowe = '1';
    f.kopia_folder.value = kopieStan.ustawienia.kopia_folder || '';
    f.retencja_zdjec_mies.value = kopieStan.ustawienia.retencja_zdjec_mies || '';
  }
  function rysujStanKopii() {
    if (!kopieStan || !$('kopie-opis')) return;
    const s = W.stanKopii(kopieStan, hala.teraz());
    $('kopie-znacznik').innerHTML = `<span class="znacznik ${s.kolor}">${esc(s.stan)}</span>`;
    $('kopie-opis').textContent = s.opis;
    $('kopie-lista').innerHTML = [s.lokalna, ...s.kopie.map(k => 'Poza komputerem: ' + k)].filter(Boolean)
      .map(t => `<li>${esc(t)}</li>`).join('');
  }
  async function kopiaTeraz() {
    kopieStan = await hala.admin('POST', '/api/v1/admin/kopie/teraz', {});
    rysujStanKopii();
    P.komunikat('Kopiuję — stan odświeży się sam.', 'ok');
    // Pierwsza kopia zdjęć na pusty dysk trwa minuty — patrzymy co 3 s, aż skończy (najwyżej 15 min).
    const koniec = Date.now() + 15 * 60000;
    while (Date.now() < koniec) {
      await new Promise(ok => setTimeout(ok, 3000));
      if (czesc !== 'ustawienia') return;
      await wczytajKopie();
      if (!kopieStan || !kopieStan.stan.trwa) break;
    }
    alarmyCzas = 0; wczytajAlarmy();
    const st = (kopieStan || {}).stan || {};
    P.komunikat(st.blad ? st.blad : 'Kopia gotowa.', st.blad ? 'blad' : 'ok');
  }

  // ------------------------------------------------------------ dostęp z telefonów (D33)

  /* Stan z huba (GET /api/v1/admin/dostep): ustawienia bez wartości tokenów, tunel, wersja na Pages. Odświeżany przy
     wejściu w część i co ~15 s, gdy jest otwarta (tunel łączy się kilka sekund, wysyłka trwa minutę). */
  let dostepStan = null, dostepCzas = 0, bladDostepu = '', wczytujeDostep = null, wysyla = false;

  function wczytajDostep() {
    if (wczytujeDostep) return wczytujeDostep;
    wczytujeDostep = hala.admin('GET', '/api/v1/admin/dostep')
      .then(r => { dostepStan = r; bladDostepu = ''; dostepCzas = Date.now(); })
      .catch(e => { bladDostepu = P.komunikatBledu(e); })
      .finally(() => { wczytujeDostep = null; if (czesc === 'dostep') rysuj(); });
    return wczytujeDostep;
  }

  /* Pola formularza „Tunel i GitHub” — raz po wczytaniu (i po zapisie), żeby przerysowanie nie kasowało wpisywanego. */
  function wypelnijDostep(poZapisie) {
    const el = $('pola-dostepu');
    if (!el || (el.dataset.gotowe && !poZapisie)) return;
    if (!dostepStan) { el.innerHTML = `<p class="blad">${esc(bladDostepu || 'Nie udało się wczytać ustawień tunelu.')}</p>`; return; }
    const u = dostepStan.ustawienia;
    const opcja = (w, t) => `<option value="${w}" ${u.tunel_tryb === w ? 'selected' : ''}>${t}</option>`;
    const zapisany = (k, co) => (u[k + '_ustawiony'] ? `<label class="zaznacz"><input type="checkbox" name="usun_${k}"> Usuń zapisany ${co}</label>` : '');
    el.dataset.gotowe = '1';
    el.innerHTML = `
      <label>Tunel Cloudflare
        <select name="tunel_tryb">${opcja('brak', 'Wyłączony — tylko sieć firmowa')}${opcja('szybki', 'Szybki — adres losowy, zmienia się sam (zalecany)')}${opcja('staly', 'Stały — własna domena w Cloudflare')}</select></label>
      <div id="pola-stalego" class="admin-ustawienia" ${u.tunel_tryb === 'staly' ? '' : 'hidden'}>
        <label>Adres tunelu stałego<input name="tunel_adres" value="${esc(u.tunel_adres || '')}" placeholder="https://hub.twojafirma.pl" autocapitalize="none"></label>
        <label>Token tunelu stałego (panel Cloudflare)
          <input name="tunel_token" type="password" autocomplete="off" placeholder="${u.tunel_token_ustawiony ? 'zapisany — zostaw puste, żeby nie zmieniać' : 'wklej token albo całe polecenie z panelu Cloudflare'}"></label>
        ${zapisany('tunel_token', 'token tunelu')}
      </div>
      <label>Repozytorium GitHub Pages<input name="github_repo" value="${esc(u.github_repo || '')}" placeholder="milo252-gk/gk-panel-aplikacje" autocapitalize="none"></label>
      <label>Token GitHub (fine-grained, „Contents: Read and write” tylko do tego repozytorium)
        <input name="github_token" type="password" autocomplete="off" placeholder="${u.github_token_ustawiony ? 'zapisany — zostaw puste, żeby nie zmieniać' : 'wklej token z GitHuba (github_pat_…)'}"></label>
      ${zapisany('github_token', 'token GitHub')}
      <p class="blad" role="alert" hidden></p>
      <div class="przyciski"><button class="glowny" type="submit">Zapisz tunel i GitHub</button></div>`;
  }

  function rysujDostep(el) {
    if (!dostepStan) { el.innerHTML = `<p class="pusto">${esc(bladDostepu || 'Wczytuję…')}</p>`; if (!bladDostepu) wczytajDostep(); return; }
    if (Date.now() - dostepCzas > 15000) wczytajDostep();
    const s = W.dostepZTelefonow(dostepStan, hala.teraz());
    const lz = W.logowanieZInternetu(dostepStan.logowanie, hala.teraz());
    // Odcisk: przerysowanie co 20 s (P.narysuj) nie może migać kodami QR ani kasować zaznaczenia adresu.
    const odcisk = JSON.stringify([s, lz, wysyla]);
    if (el.dataset.odcisk === odcisk) return;
    el.dataset.odcisk = odcisk;
    const link = a => (a ? `<a href="${esc(a)}" target="_blank" rel="noopener">${esc(a)}</a>` : '');
    el.innerHTML = `
      <p class="slaby opis-widoku">Telefony otwierają aplikacje ze stałych adresów na GitHub Pages (sam wygląd, bez danych),
        a dane idą do huba przez tunel. Pokaż kod QR albo wydrukuj — telefon zeskanuje go aparatem i doda aplikację do ekranu.</p>
      ${lz.alarm ? `<section class="admin-linia alarm-sieci" role="alert">
        <h3><span>Sieć zakładu <span class="znacznik alarm">Ustaw</span></span>
          ${lz.alarm.wpis ? '<button type="button" class="maly glowny" data-akcja="wpisz-moj-adres">Wpisz mój adres</button>' : ''}</h3>
        <p class="tekst-alarm">${esc(lz.alarm.opis)}</p>
      </section>` : ''}
      <section class="admin-linia">
        <h3><span>Logowanie z internetu <span class="znacznik ${lz.licznik.kolor}">${esc(String((dostepStan.logowanie || {}).zle_proby_godzina || 0))}</span></span></h3>
        <p class="slaby">${esc(lz.licznik.tekst)}. Konto po 10 złych PIN-ach z internetu czeka 15 minut, po trzech takich seriach
          w ciągu doby jest zablokowane z internetu — w firmowym wifi loguje się dalej.</p>
        ${lz.zablokowane.map(z => `<div class="admin-maszyna" data-id="${esc(z.id)}"><span><b>${esc(z.nazwa)}</b>
          <span class="${z.konto ? 'tekst-alarm' : 'slaby'}">${esc(z.opis)}</span></span>
          <button type="button" class="maly glowny" data-akcja="odblokuj">Odblokuj</button></div>`).join('')}
      </section>
      <section class="admin-linia">
        <h3><span>Tunel <span class="znacznik ${s.tunel.kolor}">${esc(s.tunel.stan)}</span></span>
          <button type="button" class="maly" data-akcja="odswiez-dostep">Odśwież</button></h3>
        ${s.tunel.adres ? `<p class="dostep-adres">Adres huba: ${link(s.tunel.adres)}</p>` : ''}
        <p class="slaby">${esc(s.tunel.opis)}</p>
      </section>
      <section class="admin-linia">
        <h3><span>Aplikacje na GitHub Pages <span class="znacznik ${s.wersja.kolor}">${esc(s.wersja.stan)}</span></span>
          <button type="button" class="maly glowny" data-akcja="wyslij-pages" ${s.wyslij.mozna && !wysyla ? '' : 'disabled'}>${wysyla ? 'Wysyłam…' : 'Wyślij aplikacje na GitHub'}</button></h3>
        <p class="slaby">${esc(s.wersja.opis)}${s.wersja.ostatnio ? ` ${esc(s.wersja.ostatnio)}.` : ''}</p>
        ${s.wyslij.powod && !wysyla ? `<p class="slaby">${esc(s.wyslij.powod)}</p>` : ''}
        ${s.adres.opis ? `<p class="${s.adres.kolor === 'alarm' ? 'tekst-alarm' : 'slaby'}">${esc(s.adres.opis)}</p>` : ''}
        ${s.strona ? `<p class="dostep-adres">Strona: ${link(s.strona)}</p>` : '<p class="tekst-alarm">Wpisz repozytorium GitHub w Ustawienia → Tunel i GitHub.</p>'}
        <div class="dostep-aplikacje">${s.aplikacje.filter(a => a.adres).map(a => `
          <figure class="dostep-qr">
            <div class="dostep-kod" data-qr="${esc(a.adres)}" role="img" aria-label="Kod QR: ${esc(a.nazwa)}"></div>
            <figcaption><b>${esc(a.nazwa)}</b>${link(a.adres)}</figcaption>
          </figure>`).join('')}</div>
        ${s.aplikacje.some(a => a.adres) ? '<div class="admin-pasek"><button type="button" data-akcja="drukuj-qr-aplikacji">🖨 Drukuj kody aplikacji</button></div>' : ''}
      </section>`;
    rysujKodyQR(el);
  }

  async function rysujKodyQR(el) {
    const pola = [...el.querySelectorAll('[data-qr]')];
    if (!pola.length) return;
    try {
      const ZX = await wczytajZXing();
      for (const p of pola) p.innerHTML = window.PanelEtykiety.svgQR(p.dataset.qr, ZX);
    } catch (e) { for (const p of pola) p.textContent = P.komunikatBledu(e); }
  }

  /* „Wpisz mój adres” (D35): dopisuje adres, z którego patrzy administrator, do sieci zakładu — zwykłym zapisem
     ustawienia, jak formularz Ustawień (hub sprawdza format). Logowanie z tej sieci przestaje się liczyć do blokad
     z internetu. Stan odświeżamy chwilę później — zapis idzie przez kolejkę. */
  async function wpiszMojAdres() {
    const lz = W.logowanieZInternetu(dostepStan && dostepStan.logowanie, hala.teraz());
    const wpis = lz.alarm && lz.alarm.wpis;
    if (!wpis) return;
    const obecna = String((((hala.slowniki && hala.slowniki.ustawienia) || {}).siec_zakladu || {}).wartosc || '').trim();
    if (!(await P.potwierdz('Wpisać ten adres jako sieć zakładu?', `${wpis} — rób to tylko w firmowej sieci (komputer w biurze `
      + 'albo telefon w firmowym wifi). Złe PIN-y z tego adresu nie będą blokować kont z internetu.', 'Wpisz'))) return;
    const wartosc = obecna ? `${obecna}, ${wpis}` : wpis;
    await hala.zapisz('slownik.zapisany', 'ustawienia/siec_zakladu', { slownik: 'ustawienia', klucz: 'siec_zakladu', wartosc: { wartosc } });
    P.komunikat(`Sieć zakładu: ${wartosc}`, 'ok');
    setTimeout(() => { wczytajDostep(); }, 1500);
  }

  async function wyslijNaPages() {
    if (!(await P.potwierdz('Wysłać aplikacje na GitHub?', 'Na publiczną stronę GitHub Pages trafia sam wygląd czterech aplikacji i adres '
      + 'tunelu — bez danych firmy. Telefony wezmą nową wersję same.', 'Wyślij'))) return;
    wysyla = true; rysuj();
    try {
      const r = await hala.admin('POST', '/api/v1/admin/dostep/publikuj', {});
      dostepStan = r; dostepCzas = Date.now();
      P.komunikat(r.wynik && r.wynik.wyslane === 0 && !r.wynik.usuniete ? 'Na GitHub już była ta wersja.'
        : 'Wysłane — GitHub pokaże nową wersję za 1–2 minuty.', 'ok');
    } catch (e) {
      P.komunikat(P.komunikatBledu(e), 'blad');
      await wczytajDostep();
    } finally { wysyla = false; rysuj(); }
  }

  function drukujKodyAplikacji() {
    const s = W.dostepZTelefonow(dostepStan, hala.teraz());
    wczytajZXing().then(ZX => {
      $('etykiety-druk').innerHTML = s.aplikacje.filter(a => a.adres).map(a => `
        <div class="etykieta etykieta-aplikacja">
          <div class="etykieta-qr">${window.PanelEtykiety.svgQR(a.adres, ZX)}</div>
          <div class="etykieta-opis"><div class="etykieta-kod">${esc(a.nazwa)}</div>
            <div class="etykieta-nazwa">Zeskanuj aparatem telefonu</div><div class="etykieta-tekst">${esc(a.adres)}</div></div>
        </div>`).join('');
      window.print();
    }, e => P.komunikat(P.komunikatBledu(e), 'blad'));
  }

  // ------------------------------------------------------------ połączenia GK (D32, wspolne/GK-KONTA.md §3)

  /* Klucz programu pokazujemy RAZ (w hubie jest tylko jego skrót) — po przerysowaniu go nie ma, więc trzymamy go
     w pamięci strony do zamknięcia tej części albo wylogowania. Nowy klucz czyści przypięcie instalacji programu. */
  let polaczenia = null, bladPolaczen = '', nowyKlucz = null;

  async function wczytajPolaczenia() {
    try { polaczenia = (await hala.admin('GET', '/api/v1/admin/polaczenia')).polaczenia; bladPolaczen = ''; }
    catch (e) { bladPolaczen = P.komunikatBledu(e); }
    if (czesc === 'polaczenia') rysuj();
  }

  function rysujPolaczenia(el) {
    if (polaczenia === null) { el.innerHTML = `<p class="pusto">${esc(bladPolaczen || 'Wczytuję…')}</p>`; if (!bladPolaczen) wczytajPolaczenia(); return; }
    // Pole z kluczem rysujemy tylko raz — przerysowanie co 20 s nie może kasować zaznaczenia przy kopiowaniu.
    const odcisk = JSON.stringify([polaczenia, nowyKlucz]);
    if (el.dataset.odcisk === odcisk) return;
    el.dataset.odcisk = odcisk;
    el.innerHTML = `
      <p class="slaby opis-widoku">Konta wszystkich aplikacji GK zakłada się tutaj (Pracownicy). GK Trasy i GK Flota pobierają je
        kluczem — wpisz go w ustawieniach programu razem z adresem huba. Klucz widać tylko raz.</p>
      ${polaczenia.map(p => {
        const s = W.polaczenieGK(p, hala.teraz());
        return `<section class="admin-linia" data-program="${esc(p.program)}">
          <h3><span>${esc(p.nazwa)} <span class="znacznik ${s.kolor}">${esc(s.stan)}</span></span>
            <span><button type="button" class="maly glowny" data-akcja="nowy-klucz">${p.klucz ? 'Nowy klucz' : 'Utwórz klucz'}</button>
            ${p.wlaczone ? '<button type="button" class="maly" data-akcja="wylacz-polaczenie">Wyłącz</button>' : ''}</span></h3>
          <p class="slaby">${esc(s.opis)}</p>
          ${nowyKlucz && nowyKlucz.program === p.program ? `<div class="nowy-klucz"><b>Klucz — skopiuj teraz, więcej go nie zobaczysz:</b>
            <input readonly value="${esc(nowyKlucz.klucz)}" aria-label="Klucz ${esc(p.nazwa)}">
            <button type="button" class="maly" data-akcja="kopiuj-klucz">Kopiuj</button></div>` : ''}
        </section>`;
      }).join('')}
      <div class="admin-pasek"><button type="button" data-akcja="odswiez-polaczenia">Odśwież stan</button></div>`;
  }

  async function nowyKluczProgramu(program, nazwa) {
    const byl = (polaczenia || []).find(p => p.program === program);
    if (byl && byl.klucz && !(await P.potwierdz(`Nowy klucz ${nazwa}?`,
      'Stary klucz przestanie działać od razu — wpisz nowy w ustawieniach programu.', 'Utwórz nowy'))) return;
    const r = await hala.admin('POST', '/api/v1/admin/polaczenia', { program, akcja: 'nowy_klucz' });
    nowyKlucz = { program, klucz: r.klucz };
    await wczytajPolaczenia();
  }

  // ------------------------------------------------------------ etykiety QR (druk)

  let etykietyLinie = [], etykietyRodzaje = ['linie', 'stanowiska', 'maszyny'];

  function rysujEtykiety(el) {
    const sl = hala.slowniki || {};
    const lista = window.PanelEtykiety.pozycje(sl, { linie: etykietyLinie, rodzaje: etykietyRodzaje });
    if (!el.querySelector('#formularz-etykiet')) {
      el.innerHTML = `
        <form id="formularz-etykiet" class="admin-ustawienia" onsubmit="return false">
          <p class="slaby">Naklejki z kodami do obchodów i zgłoszeń ze skanu. Arkusz A4, 3 kolumny — drukuj w skali 100 %
            na papierze samoprzylepnym albo zwykłym i zalaminuj. Kod QR to napis HALA:… z Administracji.</p>
          <fieldset><legend>Linie (nic nie zaznaczone = wszystkie)</legend><div class="zaznaczenia">
            ${Object.entries(sl.linie || {}).map(([k, l]) => `<label class="zaznacz"><input type="checkbox" name="linie" value="${esc(k)}"> ${esc((l && l.nazwa) || k)}</label>`).join('')}
          </div></fieldset>
          <fieldset><legend>Co drukować</legend><div class="zaznaczenia">
            <label class="zaznacz"><input type="checkbox" name="rodzaje" value="linie" checked> Linie</label>
            <label class="zaznacz"><input type="checkbox" name="rodzaje" value="stanowiska" checked> Stanowiska</label>
            <label class="zaznacz"><input type="checkbox" name="rodzaje" value="maszyny" checked> Maszyny</label>
          </div></fieldset>
          <div class="przyciski"><span id="etykiet-ile" class="slaby"></span>
            <button type="button" class="glowny" data-akcja="drukuj-etykiety">🖨 Drukuj etykiety</button></div>
        </form>`;
      $('formularz-etykiet').addEventListener('change', () => {
        const f = $('formularz-etykiet');
        etykietyLinie = [...f.querySelectorAll('input[name=linie]:checked')].map(x => x.value);
        etykietyRodzaje = [...f.querySelectorAll('input[name=rodzaje]:checked')].map(x => x.value);
        rysuj();
      });
    }
    $('etykiet-ile').textContent = lista.length ? `Etykiet: ${lista.length}` : 'Nic nie wybrano';
  }

  /* Koder QR jest w bibliotece ZXing (360 kB) — wczytujemy ją dopiero przy drukowaniu, nie przy każdym starcie Panelu. */
  function wczytajZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    return new Promise((ok, zle) => {
      const s = document.createElement('script');
      s.src = '../wspolne/skaner-zxing.js';
      s.onload = () => ok(window.ZXing);
      s.onerror = () => zle(new Error('Nie udało się wczytać kodera QR. Sprawdź połączenie z hubem i spróbuj jeszcze raz.'));
      document.head.appendChild(s);
    });
  }

  async function drukujEtykiety() {
    const lista = window.PanelEtykiety.pozycje(hala.slowniki || {}, { linie: etykietyLinie, rodzaje: etykietyRodzaje });
    if (!lista.length) return;
    const ZX = await wczytajZXing();
    $('etykiety-druk').innerHTML = window.PanelEtykiety.arkusz(lista, ZX);
    window.print();
  }
  window.addEventListener('afterprint', () => { $('etykiety-druk').innerHTML = ''; });

  // ------------------------------------------------------------ zdarzenia

  for (const b of document.querySelectorAll('#administracja .chip')) {
    b.addEventListener('click', () => {
      if (czesc === 'polaczenia' && b.dataset.czesc !== 'polaczenia') nowyKlucz = null;   // klucz znika z ekranu
      czesc = b.dataset.czesc;
      const el = $('admin-tresc');
      el.innerHTML = ''; delete el.dataset.odcisk;
      if (czesc === 'polaczenia') polaczenia = null;
      if (czesc === 'dostep') dostepCzas = 0;           // wejście w część — świeży stan tunelu
      rysuj();
    });
  }
  $('admin-tresc').addEventListener('input', ev => {
    if (ev.target.id === 'admin-szukaj') { szukaj = ev.target.value; rysuj(); }
  });
  $('admin-tresc').addEventListener('change', ev => {
    if (ev.target.id === 'admin-nieaktywni') { nieaktywni = ev.target.checked; rysuj(); }
  });
  $('admin-tresc').addEventListener('click', async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.id === 'admin-dodaj') return otworzOsobe(null);
    const akcja = b.dataset.akcja, id = (b.closest('[data-id]') || {}).dataset?.id;
    try {
      if (akcja === 'edytuj') otworzOsobe(lista.find(p => p.id === id));
      if (akcja === 'odblokuj') {
        await hala.admin('POST', '/api/v1/admin/odblokuj', { pracownik: id });
        await wczytajPracownikow();
        if (czesc === 'dostep') await wczytajDostep();
      }
      if (akcja === 'wpisz-moj-adres') await wpiszMojAdres();
      if (akcja === 'kopia-teraz') await kopiaTeraz();
      if (akcja === 'nowa-linia') otworzPozycje('linie');
      if (akcja === 'nowa-maszyna') otworzPozycje('maszyny');
      if (akcja === 'nowe-stanowisko') otworzPozycje('stanowiska');
      if (akcja === 'stanowisko') otworzPozycje('stanowiska', b.dataset.kod);
      if (akcja === 'wycofaj-stanowisko' && confirm(`Wycofać stanowisko ${b.dataset.kod}? Zostanie w historii prób i obchodów.`))
        await hala.zapisz('slownik.usuniety', `stanowiska/${b.dataset.kod}`, { slownik: 'stanowiska', klucz: b.dataset.kod });
      if (akcja === 'drukuj-etykiety') await drukujEtykiety();
      const program = (b.closest('[data-program]') || {}).dataset?.program;
      const nazwaProgramu = program && ((polaczenia || []).find(p => p.program === program) || {}).nazwa;
      if (akcja === 'nowy-klucz') await nowyKluczProgramu(program, nazwaProgramu);
      if (akcja === 'wylacz-polaczenie' && await P.potwierdz(`Wyłączyć ${nazwaProgramu}?`,
        'Program przestanie pobierać konta (zostaną mu ostatnio pobrane). Nowy klucz włącza połączenie.', 'Wyłącz')) {
        await hala.admin('POST', '/api/v1/admin/polaczenia', { program, akcja: 'wylacz' });
        if (nowyKlucz && nowyKlucz.program === program) nowyKlucz = null;
        await wczytajPolaczenia();
      }
      if (akcja === 'odswiez-polaczenia') await wczytajPolaczenia();
      if (akcja === 'odswiez-dostep') await wczytajDostep();
      if (akcja === 'wyslij-pages') await wyslijNaPages();
      if (akcja === 'drukuj-qr-aplikacji') drukujKodyAplikacji();
      if (akcja === 'kopiuj-klucz') {
        const pole = b.parentElement.querySelector('input');
        try { await navigator.clipboard.writeText(pole.value); P.komunikat('Skopiowano klucz', 'ok'); }
        catch (e) { pole.select(); P.komunikat('Zaznaczyłem klucz — skopiuj go (Ctrl+C).', 'uwaga'); }
      }
      if (akcja === 'linia') otworzPozycje('linie', b.dataset.kod);
      if (akcja === 'maszyna') otworzPozycje('maszyny', b.dataset.kod);
      if (akcja === 'wycofaj' && confirm(`Wycofać maszynę ${b.dataset.kod}? Zostanie w historii awarii i przeglądów.`))
        await hala.zapisz('slownik.usuniety', `maszyny/${b.dataset.kod}`, { slownik: 'maszyny', klucz: b.dataset.kod });
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });
  for (const okno of [$('okno-osoby'), $('okno-pozycji')]) okno.querySelector('[data-zamknij]').addEventListener('click', () => okno.close());

  // Po wylogowaniu lista pracowników nie może zostać w pamięci strony dla następnej osoby.
  hala.na('sesja', () => {
    lista = null; szukaj = ''; polaczenia = null; nowyKlucz = null; dostepStan = null; bladDostepu = '';
    kopieStan = null; alarmy = []; alarmyCzas = 0;
    $('admin-tresc').innerHTML = ''; delete $('admin-tresc').dataset.odcisk;
    rysujAlarmy();
  });

  P.widoki.administracja = { rysuj };
})();
