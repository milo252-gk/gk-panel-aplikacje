/* Panel Kierownika — ekran administracji (rola admin; D49: kierownik zakładu, kierownik UR i KJ — tylko Pracownicy
   ze swoim zespołem, zakres z huba, wspolne/klient/zespol.js). 2026-09-28: login to imię i nazwisko (D26),
   więc pracowników, PIN-y i karty prowadzi się tutaj, a nie tylko plikiem wspolne/narzedzia/zaladuj.py.

   Cztery części (UI etap 2, właściciel 2026-10-12 — wcześniej sześć chipów):
   - Pracownicy: dodaj, zmień dane, role, linie, nowy PIN, karta (zgubiona → usuń), wyłącz konto, odblokuj po złych PIN-ach.
     Hub: GET/POST /api/v1/admin/… przez hala.admin (rolę sprawdza hub). PIN-ów i kart nie widać — w bazie są tylko skróty.
     🖨 przy osobie i „🖨 Identyfikatory” — kody HALA:P do logowania skanem w Liderze, UR i KJ (właściciel 2026-10-20).
   - Maszyny (bez linii i stanowisk — 2026-10-12): słownik przez zdarzenia slownik.zapisany / slownik.usuniety.
     „🖨 Drukuj etykiety” drukuje naklejki QR (dawny chip „Etykiety QR” — te same opcje i ten sam druk).
   - Ustawienia: sieć zakładu i progi (hub sprawdza zakresy przy zapisie), kopie poza komputerem (etap 2: folder,
     przechowywanie zdjęć, „Zrób kopię teraz” — GET/POST /api/v1/admin/kopie), tunel i tokeny GitHub.
   - Serwis — dwie zwijane części, nad nimi niezwinięty alarm „Sieć zakładu”:
     · Dostęp z telefonów (D33): stan tunelu, adresy aplikacji na GitHub Pages z kodami QR (🖨 przy każdej i „Drukuj
       wszystkie”), „Wyślij aplikacje na
       GitHub”, wersja na Pages, logowanie z internetu (D35). Ustawienia tunelu i tokenów — Ustawienia → „Tunel i GitHub”
       (tokeny nigdy nie wracają z huba).
     · Połączenia GK (D32): klucze programów GK Trasy i GK Flota, które biorą konta z huba (wspolne/GK-KONTA.md §3).
       Jedno konto osoby we wszystkich aplikacjach GK — role transportu w oknie osoby, w osobnych grupach.
       GK Foto (D40, GK-KONTA.md §6) loguje się samym kontem GK, bez klucza — tu tylko informacja. GK Czytnik od 3.13
       działa bez logowania (D52).
   - Nad wszystkim czerwona wstęga alarmów huba (GET /api/v1/admin/alarmy): kopia, adres na Pages, token GitHub, miejsce —
     przy alarmie „Pokaż” prowadzi do części, w której się go naprawia (W.alarmyAdmina → gdzie).
   Co pokazać i czy formularz jest dobry, liczy widok.js (testy: panel/testy/widok-testy.js). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;

  let czesc = 'pracownicy';
  let lista = null, twojAdres = '', wczytuje = false, bladListy = '', bladListyCzas = 0;
  // D49: zakres zarządzającego z huba (GET /admin/pracownicy → zakres): role do nadania, linie (mistrz), czy usuwa.
  let zakres = null;
  const jestAdmin = () => !!(hala.pracownik && (hala.pracownik.role || []).includes('admin'));
  const uprawnienia = osoba => HalaZespol.uprawnieniaOsoby(jestAdmin() ? null : (zakres || { admin: false, role: [], linie: null }),
                                                  osoba, hala.pracownik && hala.pracownik.id);
  let szukaj = '', nieaktywni = false;

  async function wczytajPracownikow() {
    if (wczytuje) return;
    wczytuje = true;
    try {
      const r = await hala.admin('GET', '/api/v1/admin/pracownicy');
      lista = r.pracownicy; twojAdres = r.twoj_adres || ''; zakres = r.zakres || null; bladListy = '';
    } catch (e) {
      bladListy = P.komunikatBledu(e); bladListyCzas = Date.now();
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
    // UI etap 2: „Pokaż” przy alarmie — od kiedy dostęp z telefonów siedzi w zwiniętym Serwisie, sam napis „Administracja →
    // Serwis → …” to za mało; przycisk przełącza część, rozwija ją i przewija do miejsca naprawy.
    const tresc = alarmy.map(a => `<p><b>${esc(a.tytul)}</b> ${esc(a.opis)}${a.gdzie
      ? ` <button type="button" class="maly" data-alarm-czesc="${esc(a.gdzie.czesc)}" data-alarm-sekcja="${esc(a.gdzie.sekcja)}">Pokaż</button>` : ''}</p>`).join('');
    if (el.dataset.tresc === tresc) return;
    el.dataset.tresc = tresc;
    el.innerHTML = tresc;
    el.hidden = !alarmy.length;
  }
  $('admin-alarmy').addEventListener('click', ev => {
    const b = ev.target.closest('[data-alarm-czesc]');
    if (b) pokaz(b.dataset.alarmCzesc, b.dataset.alarmSekcja);
  });

  /* Przejście do części (chip) — czyści treść, żeby rysowanie zaczęło od szkieletu tej części. */
  function przejdz(nowa) {
    if (czesc === 'serwis' && nowa !== 'serwis') nowyKlucz = null;   // klucz programu znika z ekranu
    czesc = nowa;
    const el = $('admin-tresc');
    el.innerHTML = ''; delete el.dataset.odcisk;
    // Wejście w Serwis — od razu świeży stan tunelu i nowa próba Połączeń GK.
    if (czesc === 'serwis') { polaczenia = null; bladPolaczen = ''; dostepCzas = 0; }
    rysuj();
  }

  /* „Pokaż” przy alarmie: część + miejsce w niej (Serwis — rozwinięta część „dostep” / „polaczenia”; Ustawienia —
     id formularza). Bez przewinięcia administrator szukałby formularza tokenu pod godzinami zmian. */
  function pokaz(nowa, sekcja) {
    if (nowa === 'serwis' && sekcja) serwisOtwarte[sekcja] = true;
    przejdz(nowa);
    const cel = nowa === 'serwis' ? $(`serwis-${sekcja}`) : sekcja && $(sekcja);
    if (cel) cel.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function rysuj() {
    // D49: kierownik zakładu / UR / KJ — tylko Pracownicy (jego zespół); bez alarmów huba i ustawień.
    // Chipy, gdy części jest więcej niż jedna (D60: checklisty lidera są w Zlecenia → 💾 Zapisane, nie tutaj).
    const admin = jestAdmin();
    const dostepne = W.czesciAdministracji(P.dostepAdministracji());
    czesc = W.czescAdministracji(czesc, dostepne);
    $('admin-chipy').hidden = dostepne.length < 2;
    rysujZespol(admin || czesc !== 'pracownicy');
    for (const b of document.querySelectorAll('#administracja .chip')) {
      b.hidden = !dostepne.includes(b.dataset.czesc);
      b.setAttribute('aria-pressed', String(b.dataset.czesc === czesc));
    }
    if (!admin) { alarmy = []; rysujAlarmy(); }
    else if (Date.now() - alarmyCzas > 60000) wczytajAlarmy(); else rysujAlarmy();
    const el = $('admin-tresc');
    // D60: checklisty lidera przeniesione do Zlecenia → 💾 Zapisane (checklisty.js rysuje je tam).
    if (czesc === 'pracownicy') rysujPracownikow(el);
    else if (czesc === 'urlopy') { if (P.widoki.urlopy) P.widoki.urlopy.rysuj(el); }
    else if (czesc === 'maszyny') rysujMaszyny(el);
    else if (czesc === 'serwis') rysujSerwis(el);
    else rysujUstawienia(el);
  }

  // ------------------------------------------------------------ pracownicy

  /* D49: zdanie nad listą dla zarządzającego — kogo widzi i czego nie może (usunąć, wpisać hasła ani PIN-u). */
  function rysujZespol(admin) {
    const el = $('admin-zespol');
    const tekst = admin || !zakres ? '' : HalaZespol.opisZespolu(zakres, hala.kontrakt && hala.kontrakt.stale, hala.slowniki);
    el.hidden = !tekst;
    if (el.textContent !== tekst) el.textContent = tekst;
  }

  function rysujPracownikow(el) {
    if (lista === null) { el.innerHTML = `<p class="pusto">${esc(bladListy || 'Wczytuję…')}</p>`; if (W.wczytacPonownie(bladListy, bladListyCzas, Date.now())) wczytajPracownikow(); return; }
    // Pole wyszukiwania rysujemy tylko raz — przerysowanie co 20 s nie może zabierać kursora w trakcie pisania.
    if (!el.querySelector('#admin-szukaj')) {
      el.innerHTML = `
        <div class="admin-pasek">
          <input id="admin-szukaj" type="search" placeholder="Szukaj osoby" aria-label="Szukaj osoby" value="${esc(szukaj)}">
          <label class="zaznacz"><input type="checkbox" id="admin-nieaktywni" ${nieaktywni ? 'checked' : ''}> Pokaż wyłączone</label>
          <button type="button" data-akcja="identyfikatory" id="admin-identyfikatory" title="Kody QR do logowania skanem (GK Lider, UR, KJ)">🖨 Identyfikatory</button>
          <button type="button" class="glowny" id="admin-dodaj">+ Dodaj osobę</button>
        </div>
        <div id="admin-lista" class="lista"></div>`;
    }
    // Linie osoby nazwami — przy jednej linii (D51) bez nich: „Hala” przy każdym liderze to szum.
    const wiersze = W.pracownicyAdmin({ lista, szukaj, nieaktywni, stale: hala.kontrakt && hala.kontrakt.stale, slowniki: hala.slowniki });
    // Identyfikator QR (HALA:P) ma sens tylko dla osób logujących się w Liderze, UR albo KJ — tam jest „Zeskanuj identyfikator”.
    const zeSkanem = new Set(window.PanelEtykiety.identyfikatory(wiersze, hala.kontrakt).map(p => p.kod));
    $('admin-identyfikatory').disabled = !zeSkanem.size;
    $('admin-lista').innerHTML = wiersze.map(p => `
      <article class="admin-osoba ${p.aktywny === false ? 'wylaczona' : ''} ${p.zablokowany ? 'zablokowana' : ''}" data-id="${esc(p.id)}">
        <div class="opis">
          <div><b>${esc(p.nazwa)}</b> <span class="slaby">${esc(p.id)}</span></div>
          <div class="szczegoly">
            ${p.roleNazwy.map(r => `<span class="znacznik neutral">${esc(r)}</span>`).join('')}
            ${p.linieNazwy.map(l => `<span>${esc(l)}</span>`).join('')}
            ${p.ma_karte ? '<span class="slaby">karta ✓</span>' : ''}${W.stanHasla(p).znacznik ? `<span class="${W.stanHasla(p).klasa}">${esc(W.stanHasla(p).znacznik)}</span>` : ''}
            ${p.telefon ? `<span class="slaby">☎ ${esc(p.telefon)}</span>` : ''}
            ${p.aktywny === false ? '<span class="znacznik neutral">Wyłączone</span>' : ''}
            ${p.zablokowany ? `<span class="znacznik alarm">${p.blokada_internet && p.blokada_internet.rodzaj === 'konto'
              ? 'Zablokowane z internetu' : 'Zablokowane po złych PIN-ach'}</span>` : ''}
          </div>
        </div>
        <div class="akcje">
          ${p.zablokowany ? '<button type="button" class="maly glowny" data-akcja="odblokuj">Odblokuj</button>' : ''}
          ${zeSkanem.has(p.id) ? '<button type="button" class="maly" data-akcja="identyfikator" title="Drukuj identyfikator QR" aria-label="Drukuj identyfikator QR">🖨</button>' : ''}
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
    const u = uprawnienia(osoba);
    $('osoba-role').innerHTML = W.grupyRol(hala.kontrakt && hala.kontrakt.stale, u.role).map(g => `
      <fieldset><legend>${esc(g.nazwa)}</legend>${g.opis ? `<p class="slaby konto-drobne">${esc(g.opis)}</p>` : ''}
        <div class="zaznaczenia">${g.role.map(r =>
          `<label class="zaznacz"><input type="checkbox" name="role" value="${esc(r.kod)}" ${(osoba ? osoba.role.includes(r.kod) : (u.role || []).length === 1) ? 'checked' : ''}> ${esc(r.nazwa)}</label>`).join('')}</div>
      </fieldset>`).join('');
    P.pokazPolaLinii(fp);
    // D49: mistrz z liniami przypisuje tylko swoje (hub sprawdza to samo).
    const linie = Object.entries((hala.slowniki && hala.slowniki.linie) || {}).filter(([kod]) => !u.linie || u.linie.includes(kod));
    $('osoba-linie').innerHTML = linie.map(([kod, l]) =>
      `<label class="zaznacz"><input type="checkbox" name="linie" value="${esc(kod)}" ${osoba && (osoba.linie || []).includes(kod) ? 'checked' : ''}> ${esc((l && l.nazwa) || kod)}</label>`).join('')
      || '<span class="slaby">Brak linii do wyboru</span>';   // D51: linii w Panelu się nie zakłada — „Najpierw dodaj” nie miało gdzie
    fp.telefon.value = (osoba && osoba.telefon) || '';
    $('osoba-loginy').textContent = osoba && (osoba.loginy || []).length
      ? `Stare loginy z programów (też logują): ${osoba.loginy.join(', ')}` : '';
    polePinu();
    $('osoba-usun-karte').hidden = !(u.karta && osoba && osoba.ma_karte);
    $('osoba-karta-pole').hidden = !u.karta;
    fp.aktywny.checked = !osoba || osoba.aktywny !== false;
    fp.querySelector('.blad').hidden = true;
    // D43: działania na koncie istniejącej osoby (hasło startowe, wyloguj wszędzie, usuń) — nie dla siebie samego.
    $('osoba-konto').hidden = !osoba;
    if (osoba) {
      $('osoba-stan-hasla').textContent = W.stanHasla(osoba).opis;
      $('osoba-usun').hidden = !u.usun;
      $('osoba-wyloguj').hidden = !u.wyloguj;
    }
    $('okno-osoby').showModal();
    fp.nazwa.focus();
  }

  /* D43: człowiek — hasło startowe (nowa osoba; pole zostaje do „Ustaw hasło startowe”) i PIN 4 cyfry (nieobowiązkowy);
     konto samego ekranu — jeden PIN 4–8 cyfr, bez hasła. Pola i podpisy idą za zaznaczonymi rolami. */
  function polePinu() {
    const role = [...fp.querySelectorAll('input[name="role"]:checked')].map(x => x.value);
    const ekran = role.length === 1 && role[0] === 'ekran';
    // D34 (2026-10-07): mistrz w GK Lider widzi tylko zaznaczone linie — podpowiedź przy liniach, gdy ma tę rolę.
    $('osoba-linie-mistrz').hidden = !role.includes('mistrz');
    // D46 (właściciel 2026-10-08): administrator nie wpisuje nikomu PIN-u — tylko „Resetuj PIN” (startowy 1234).
    // Pole zostaje wyłącznie dla konta ekranu (monitor), które ma jeden sekret 4–8 cyfr.
    const u = uprawnienia(edytowany);
    $('osoba-pin-pole').hidden = !ekran || !u.pin;
    if (!ekran) fp.pin.value = '';
    $('osoba-pin-etykieta').textContent = ekran ? 'PIN ekranu (4–8 cyfr)' : 'PIN (4 cyfry, nieobowiązkowy)';
    fp.pin.maxLength = ekran ? 8 : 4;
    fp.pin.placeholder = edytowany ? 'zostaw puste — bez zmian' : ekran ? '4–8 cyfr' : 'osoba ustawi sama';
    // D49: zarządzający zespołem nie wpisuje hasła startowego — nowa osoba dostaje zawsze haslo123.
    $('osoba-haslo').hidden = ekran || !u.haslo;
    $('osoba-sekrety').hidden = $('osoba-haslo').hidden && $('osoba-pin-pole').hidden;   // pusty rząd nie robi przerwy
    if (!u.haslo) fp.haslo.value = '';
    $('osoba-reset').hidden = ekran || !u.resetHasla;
    // D46: konto ekranu nie ma PIN-u osoby; własny PIN administrator zmienia w Moim koncie (reset wylogowałby go od razu).
    $('osoba-resetuj-pin').hidden = ekran || !u.resetPinu;
    $('osoba-o-hasle').textContent = ekran ? 'Konto ekranu (monitor w biurze) ma jeden PIN — bez hasła i bez PIN-u osoby.'
      : edytowany ? 'Hasło zmienia sama osoba (Moje konto). „Ustaw hasło startowe” niżej — gdy zapomniała hasła.'
        : u.haslo ? 'Puste hasło startowe = haslo123. Przy pierwszym logowaniu osoba ustawi własne hasło (raz na 16 godzin na urządzeniu) i PIN.'
          : 'Hasło startowe: haslo123. Przy pierwszym logowaniu osoba ustawi własne hasło (raz na 16 godzin na urządzeniu) i PIN.';
  }
  $('osoba-role').addEventListener('change', polePinu);

  /* „Ustaw hasło startowe” (D43 §3a) = reset konta: haslo123 albo wpisane w polu, PIN skasowany, sesje i zaufanie
     urządzeń zakończone. Osoba przy następnym logowaniu ustawi nowe hasło i PIN. */
  $('osoba-reset').addEventListener('click', async () => {
    const o = edytowany;
    if (!o) return;
    const wlasne = uprawnienia(o).haslo ? fp.haslo.value.trim() : '';
    const w = W.pracownikZFormularza({ nazwa: o.nazwa, role: o.role, linie: o.linie, aktywny: o.aktywny !== false, telefon: o.telefon,
                                       haslo: wlasne, haslo_startowe: true }, o, lista);
    const blad = fp.querySelector('.blad');
    if (w.bledy.length) { blad.textContent = w.bledy.join(' '); blad.hidden = false; return; }
    if (!(await P.potwierdz('Ustawić hasło startowe?', `${o.nazwa} dostanie hasło ${wlasne ? 'wpisane w polu „Hasło startowe”' : '„haslo123”'}, `
          + 'PIN zostanie skasowany, a wszystkie urządzenia wylogowane. Przy następnym logowaniu osoba ustawi nowe hasło i PIN.', 'Ustaw'))) return;
    try {
      await hala.admin('POST', '/api/v1/admin/pracownik', w.dane);
      $('okno-osoby').close();
      P.komunikat(`${o.nazwa}: hasło startowe ${wlasne ? 'ustawione' : '„haslo123”'} — przy logowaniu ustawi nowe hasło i PIN.`, 'ok');
      await wczytajPracownikow();
    } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });

  /* „Resetuj PIN” (D46): PIN startowy 1234 — osoba ustawia nowy przy pierwszym logowaniu. Nikt nie zna niczyjego PIN-u. */
  $('osoba-resetuj-pin').addEventListener('click', async () => {
    const o = edytowany;
    if (!o || !(await P.potwierdz('Zresetować PIN?', `${o.nazwa} dostanie PIN startowy 1234 — przy pierwszym logowaniu `
          + 'ustawi nowy.', 'Resetuj PIN'))) return;
    try {
      await hala.admin('POST', '/api/v1/admin/resetuj-pin', { pracownik: o.id });
      $('okno-osoby').close();
      P.komunikat(`${o.nazwa}: PIN startowy 1234 — przy logowaniu ustawi nowy.`, 'ok');
      await wczytajPracownikow();         // znacznik „PIN startowy” na liście
    } catch (e) { const blad = fp.querySelector('.blad'); blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });

  /* „Wyloguj wszędzie” (D43 §2): wszystkie sesje i zaufanie urządzeń tej osoby — następne logowanie wszędzie hasłem. */
  $('osoba-wyloguj').addEventListener('click', async () => {
    const o = edytowany;
    // Zdania bez rodzaju osoby (imię i nazwisko bywa męskie i żeńskie — przegląd 2026-10-12): mówimy o koncie.
    if (!o || !(await P.potwierdz('Wylogować wszędzie?', `Konto ${o.nazwa} zostanie wylogowane we wszystkich aplikacjach i na wszystkich `
          + 'urządzeniach. Następne logowanie — hasłem.', 'Wyloguj wszędzie'))) return;
    try {
      await hala.admin('POST', '/api/v1/admin/wyloguj-wszedzie', { pracownik: o.id });
      P.komunikat(`${o.nazwa} — wylogowano wszędzie.`, 'ok');
    } catch (e) { const blad = fp.querySelector('.blad'); blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });

  /* „Usuń osobę” (D43 §3b): potwierdzenie wpisaniem imienia i nazwiska. Historia zdarzeń zostaje (z „(usunięty)”),
     sesje, urządzenia i powiadomienia przepadają, GK Trasy i GK Flota wyłączą jej konto. */
  const fu = $('formularz-usun-osobe');
  $('osoba-usun').addEventListener('click', async () => {
    const o = edytowany;
    if (!o) return;
    // Etap 3: osoba zleca zlecenia stałe — po usunięciu hub przestanie je zlecać (jak po wyłączeniu).
    const ostrz = W.ostrzezenieAutora(hala.slowniki, o, Object.assign({}, o, { aktywny: false }),
                                      ((hala.kontrakt.zdarzenia['zlecenie.utworzone'] || {}).role) || []);
    $('usun-osobe-tresc').textContent = `${o.nazwa} zniknie z list, logowania i programów GK Trasy i GK Flota. Historia `
      + `(awarie, zlecenia, raporty) zostaje z dopiskiem „(usunięty)”. Tego nie da się cofnąć — tę samą osobę można później `
      + `założyć od nowa.${ostrz ? ' ' + ostrz : ''}`;
    fu.reset();
    fu.querySelector('.blad').hidden = true;
    $('okno-osoby').close();
    $('okno-usun-osobe').showModal();
    fu.nazwa.focus();
  });
  fu.addEventListener('submit', async ev => {
    ev.preventDefault();
    const o = edytowany;
    const blad = fu.querySelector('.blad');
    if (!o) return;
    if (W.loginZNazwy(fu.nazwa.value) !== W.loginZNazwy(o.nazwa)) {
      blad.textContent = `Wpisz „${o.nazwa}”, żeby potwierdzić.`; blad.hidden = false; return;
    }
    try {
      await hala.admin('POST', '/api/v1/admin/usun-pracownika', { pracownik: o.id, nazwa: fu.nazwa.value });
      $('okno-usun-osobe').close();
      P.komunikat(`${o.nazwa} — usunięto. Historia zostaje.`, 'ok');
      edytowany = null;
      await wczytajPracownikow();
    } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });
  $('okno-usun-osobe').querySelector('[data-zamknij]').addEventListener('click', () => $('okno-usun-osobe').close());

  fp.addEventListener('submit', async ev => {
    ev.preventDefault();
    const wybrane = n => [...fp.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);
    const u = uprawnienia(edytowany);
    // Hasło z pola idzie przy zapisie tylko dla nowej osoby — u istniejącej wysyła je „Ustaw hasło startowe” (reset).
    // D49: zarządzający zespołem nie wysyła hasła, PIN-u ani karty (pola są ukryte; hub odrzuciłby je 403).
    const w = W.pracownikZFormularza({ nazwa: fp.nazwa.value, role: wybrane('role'), linie: wybrane('linie'),
                                       pin: u.pin ? fp.pin.value : '', haslo: edytowany || !u.haslo ? '' : fp.haslo.value,
                                       karta: u.karta ? fp.karta.value : '', usun_karte: u.karta && fp.usun_karte.checked,
                                       aktywny: fp.aktywny.checked, telefon: fp.telefon.value }, edytowany, lista);
    const blad = fp.querySelector('.blad');
    if (w.bledy.length) { blad.textContent = w.bledy.join(' '); blad.hidden = false; return; }
    // D49: zarządzający widzi tylko swój zespół, więc login techniczny z imienia mógłby trafić na osobę spoza listy
    // (hub uznałby to za zmianę cudzej osoby) — nowej osobie id nadaje hub („p-…”).
    if (!u.admin && !edytowany) delete w.dane.id;
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

  // ------------------------------------------------------------ maszyny

  /* 2026-10-12 (właściciel): w Panelu wyznacza się tylko maszyny — bez linii i stanowisk. Maszyny stoją na jednej
     linii-hali (W.liniaDomyslna, zakładana z pierwszą maszyną), bo Lider, UR i obchody dalej liczą na linii.
     Linia przy maszynie pokazuje się tylko przy starszych danych z kilkoma liniami (W.wieleLinii). */
  /* UI etap 2: etykiety QR drukuje przycisk nad listą maszyn (dawny osobny chip). Szkielet rysujemy raz — przerysowanie
     co 20 s nie może kasować zaznaczeń w opcjach druku ani migać listą; listę podmieniamy tylko, gdy się zmieniła. */
  let etykietyOtwarte = false;
  function rysujMaszyny(el) {
    const sl = hala.slowniki || {};
    const linie = sl.linie || {}, wiele = W.wieleLinii(sl);
    const maszyny = Object.entries(sl.maszyny || {})
      .sort(([ka, a], [kb, b]) => String((a || {}).nazwa || ka).localeCompare(String((b || {}).nazwa || kb), 'pl', { numeric: true }));
    if (!el.querySelector('#lista-maszyn')) {
      el.innerHTML = `
        <div class="admin-pasek">
          <button type="button" class="glowny" data-akcja="nowa-maszyna">+ Maszyna</button>
          <button type="button" id="drukuj-etykiety" data-akcja="etykiety" aria-expanded="false">🖨 Drukuj etykiety</button>
        </div>
        <div id="etykiety-opcje" hidden></div>
        <section class="admin-linia" id="lista-maszyn"></section>
        <p class="slaby">Kod maszyny to napis na etykiecie QR (HALA:M:…) — po wydrukowaniu etykiet go nie zmieniaj.</p>`;
    }
    const lista = maszyny.map(([mk, m]) => `
          <div class="admin-maszyna"><span><b>${esc(m.nazwa)}</b> <span class="slaby">${esc(mk)}${m.typ ? ` · ${esc(m.typ)}` : ''}${wiele ? ` · ${esc((linie[m.linia] || {}).nazwa || m.linia)}` : ''}</span></span>
            <span><button type="button" class="maly" data-akcja="etykieta" data-kod="${esc(mk)}" title="Drukuj etykietę QR tej maszyny">🖨 Etykieta</button>
            <button type="button" class="maly" data-akcja="maszyna" data-kod="${esc(mk)}">Zmień</button>
            <button type="button" class="maly" data-akcja="wycofaj" data-kod="${esc(mk)}">Wycofaj</button></span></div>`).join('')
          || '<p class="pusto">Nie ma jeszcze maszyn</p>';
    const el2 = $('lista-maszyn');
    if (el2.dataset.odcisk !== lista) { el2.dataset.odcisk = lista; el2.innerHTML = lista; }
    // Nic do druku (pusty słownik) — przycisk nieczynny, zamiast pustego arkusza.
    const doDruku = window.PanelEtykiety.pozycje(sl, { linie: [], rodzaje: window.PanelEtykiety.rodzajeDoWyboru(sl) }).length;
    $('drukuj-etykiety').disabled = !doDruku;
    const opcje = etykietyOtwarte && window.PanelEtykiety.opcjeDoWyboru(sl);
    $('etykiety-opcje').hidden = !opcje;
    $('drukuj-etykiety').setAttribute('aria-expanded', String(!!opcje));
    if (opcje) rysujEtykiety($('etykiety-opcje'));
  }

  /* „🖨 Drukuj etykiety”: przy jednej linii i samych maszynach nie ma czego wybierać — drukuje od razu (arkusz wszystkich
     maszyn). Przy kilku liniach albo stanowiskach rozwija/zwija dawne opcje druku (linie, co drukować) z ich przyciskiem. */
  async function przyciskEtykiet() {
    if (!window.PanelEtykiety.opcjeDoWyboru(hala.slowniki || {})) { await drukujEtykiety(); return; }
    etykietyOtwarte = !etykietyOtwarte;
    rysuj();
  }

  const fs = $('formularz-pozycji');
  let edytowanaMaszyna = null;   // kod istniejącej maszyny albo null (nowa)

  function otworzMaszyne(kod) {
    edytowanaMaszyna = kod || null;
    const sl = hala.slowniki || {};
    const w = kod ? (sl.maszyny || {})[kod] || {} : {};
    fs.reset();
    $('t-okno-pozycji').textContent = kod ? `Maszyna ${kod}` : 'Nowa maszyna';
    fs.kod.value = kod || ''; fs.kod.disabled = !!kod;
    fs.nazwa.value = w.nazwa || '';
    // Linia tylko przy kilku liniach w słowniku; puste pole = maszyna zostaje na swojej (nowa — na linii domyślnej).
    $('pozycja-linia').hidden = !W.wieleLinii(sl);
    fs.linia.innerHTML = Object.entries(sl.linie || {}).map(([k, l]) => `<option value="${esc(k)}">${esc((l && l.nazwa) || k)}</option>`).join('');
    fs.linia.value = w.linia || W.liniaDomyslna(sl);
    fs.typ.value = w.typ || '';
    fs.querySelector('.blad').hidden = true;
    $('okno-pozycji').showModal();
    fs.nazwa.focus();          // nazwa jest pierwsza w oknie (kod z etykiety QR — obok)
  }

  fs.addEventListener('submit', async ev => {
    ev.preventDefault();
    const sl = hala.slowniki || {};
    const byla = edytowanaMaszyna ? (sl.maszyny || {})[edytowanaMaszyna] || {} : {};
    // Stanowisko (dawny ekran linii) zostaje przy maszynie, jakie było — Panel go już nie pokazuje. Wycofane albo z innej
    // linii (maszyna przeniesiona) odpada samo (stanowiskoZachowane) — nie ma pola, w którym dałoby się je poprawić.
    const w = W.pozycjaZFormularza('maszyny', { kod: fs.kod.value, nazwa: fs.nazwa.value, typ: fs.typ.value,
                                               linia: W.wieleLinii(sl) ? fs.linia.value : '', stanowisko: byla.stanowisko || '',
                                               stanowiskoZachowane: true }, sl, edytowanaMaszyna);
    const blad = fs.querySelector('.blad');
    if (w.bledy.length) { blad.textContent = w.bledy.join(' '); blad.hidden = false; return; }
    try {
      if (w.nowaLinia) await hala.zapisz('slownik.zapisany', `linie/${w.nowaLinia.klucz}`, { slownik: 'linie', klucz: w.nowaLinia.klucz, wartosc: w.nowaLinia.wartosc });
      await hala.zapisz('slownik.zapisany', `maszyny/${w.klucz}`, { slownik: 'maszyny', klucz: w.klucz, wartosc: w.wartosc });
      $('okno-pozycji').close();
    } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });

  // ------------------------------------------------------------ ustawienia

  /* UI etap 2 (właściciel 2026-10-12): bez pól „Sesja na telefonie (godziny)” i „Sesja monitora w biurze (dni)” — nikt
     ich nie zmienia, a od D43 o logowaniu i tak decyduje hasło raz na 16 godzin na urządzeniu. Hub trzyma swoje wartości
     (zapisane albo domyślne 14 h / 90 dni) — formularz ich nie wysyła, więc niczego nie nadpisze. */
  const USTAWIENIA = [
    ['prog_zolty_min', 'Kafelek żółknie tyle minut przed terminem pozycji checklisty', 30],
    ['alarm_potwierdzenia_min', 'Alarm, gdy lider nie potwierdza naprawy dłużej niż (min)', 30],
    // P3 z tabeli „Domyślne” w DECYZJE — wskazane jako ustawienie, a pola w Panelu nie było (audyt 2026-10-16).
    ['prog_brakow_proc', 'Podpowiedź partii brakowej od tylu % braków w próbie', 5],
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
            Złe PIN-y z tej sieci nie blokują kont z internetu; sieci lokalne (192.168…, 10…) liczą się zawsze.
            Najprościej: Serwis → „Wpisz mój adres”.</span></label>
        ${USTAWIENIA.map(([k, opis, d]) => `<label>${esc(opis)}<input name="${k}" type="number" min="${W.ZAKRESY_USTAWIEN[k][0]}" max="${W.ZAKRESY_USTAWIEN[k][1]}" value="${esc(wart(k, d))}">
          <span class="blad-pola" data-blad="${k}" hidden></span></label>`).join('')}
        <p class="blad" role="alert" hidden></p>
        <div class="przyciski"><button class="glowny" type="submit">Zapisz ustawienia</button></div>
      </form>
      <form id="formularz-zmian" class="admin-ustawienia">
        <h3>Godziny zmian</h3>
        <p class="slaby">Zmiana nocna kończy się następnego dnia (np. 22:00–06:00). Obchody, raporty i „ta zmiana” w Panelu liczą się od tych godzin.</p>
        <div class="naglowek-zmian" aria-hidden="true"><span>Nr</span><span>Nazwa</span><span>Od</span><span>Do</span><span></span></div>
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
            Raz na dobę serwer kładzie tu kopię bazy (bez tokenów i kluczy) i nowe zdjęcia; trzyma 7 dziennych, 4 tygodniowe i 12 miesięcznych.</span></label>
        <label>Przechowuj zdjęcia (miesięcy)
          <input name="retencja_zdjec_mies" type="number" min="1" max="120" placeholder="puste = bez kasowania">
          <span class="slaby">Starsze zdjęcia znikają z serwera i z kopii (RODO). Puste pole — nic nie kasujemy.</span></label>
        <ul id="kopie-lista" class="slaby"></ul>
        <p class="blad" role="alert" hidden></p>
        <div class="przyciski"><button type="button" data-akcja="kopia-teraz">Zrób kopię teraz</button>
          <button class="glowny" type="submit">Zapisz kopie</button></div>
      </form>
      <form id="formularz-dostepu" class="admin-ustawienia" autocomplete="off">
        <h3>Tunel i GitHub</h3>
        <p class="slaby">Telefony otwierają aplikacje z GitHub Pages, a dane idą do serwera przez tunel Cloudflare. Stan, adresy
          i kody QR: Administracja → Serwis → Dostęp z telefonów. Token GitHub robi się raz — INSTRUKCJA-BIURO.md.</p>
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
        + 'i w Zleceniach → 💾 Zapisane — inaczej przestaną działać.', 'Zapisz mimo to'))) return;
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
          && !(await P.potwierdz('Kasować stare zdjęcia?', `Zdjęcia starsze niż ${w.dane.retencja_zdjec_mies} mies. znikną z serwera i z kopii `
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
        b2.textContent = 'Zapisane. Stan tunelu: Administracja → Serwis → Dostęp z telefonów.';
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
  let dostepStan = null, dostepCzas = 0, bladDostepu = '', bladDostepuCzas = 0, wczytujeDostep = null, wysyla = false, aktualizuje = false;

  function wczytajDostep() {
    if (wczytujeDostep) return wczytujeDostep;
    wczytujeDostep = hala.admin('GET', '/api/v1/admin/dostep')
      .then(r => { dostepStan = r; bladDostepu = ''; dostepCzas = Date.now(); })
      .catch(e => { bladDostepu = P.komunikatBledu(e); bladDostepuCzas = Date.now(); })
      .finally(() => { wczytujeDostep = null; if (czesc === 'serwis') rysuj(); });
    return wczytujeDostep;
  }

  // ------------------------------------------------------------ serwis (UI etap 2)

  /* Serwis (właściciel 2026-10-12): rzeczy, do których administrator zagląda rzadko — dostęp z telefonów (tunel, Pages,
     kody QR, logowanie z internetu) i Połączenia GK — w jednej części, każda zwinięta pod nagłówkiem ze stanem, żeby
     było widać „czy wszystko gra” bez rozwijania. Czerwona karta „Sieć zakładu” stoi nad nimi, niezwinięta — to alarm.
     Rozwinięcie pamiętamy do wylogowania (przerysowanie co 20 s go nie zwija); Dostęp pierwszy raz rozwija się sam,
     gdy jest w nim coś do zrobienia (alarm sieci, konta zablokowane z internetu). */
  let serwisOtwarte = { dostep: null, polaczenia: false };

  function rysujSerwis(el) {
    if (!el.querySelector('#serwis-dostep')) {
      el.innerHTML = `
        <div id="serwis-siec"></div>
        <details class="serwis-czesc" id="serwis-dostep" data-sekcja="dostep" ${serwisOtwarte.dostep ? 'open' : ''}>
          <summary><h3>📱 Dostęp z telefonów</h3><span id="serwis-dostep-stan"></span></summary>
          <div class="serwis-czesc-tresc" id="serwis-dostep-tresc"></div>
        </details>
        <details class="serwis-czesc" id="serwis-polaczenia" data-sekcja="polaczenia" ${serwisOtwarte.polaczenia ? 'open' : ''}>
          <summary><h3>Połączenia GK</h3><span id="serwis-polaczenia-stan"></span></summary>
          <div class="serwis-czesc-tresc" id="serwis-polaczenia-tresc"></div>
        </details>
        <p class="slaby">Czyszczenie zleceń (usuwanie historii) jest w <b>Zlecenia → 🧹 Czyszczenie</b> — tylko dla administratora.</p>`;
    }
    rysujDostep($('serwis-dostep-tresc'));
    rysujPolaczenia($('serwis-polaczenia-tresc'));
  }

  /* Wstawia HTML tylko, gdy się zmienił — nagłówki i karta alarmu są przerysowywane co 20 s (P.narysuj). */
  function wstaw(el, html) {
    if (el && el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
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
        <label>Adres tunelu stałego<input name="tunel_adres" value="${esc(u.tunel_adres || '')}" placeholder="https://serwer.twojafirma.pl" autocapitalize="none"></label>
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
    if (!dostepStan) { el.innerHTML = `<p class="pusto">${esc(bladDostepu || 'Wczytuję…')}</p>`; if (W.wczytacPonownie(bladDostepu, bladDostepuCzas, Date.now())) wczytajDostep(); return; }
    if (Date.now() - dostepCzas > 15000) wczytajDostep();
    const s = W.dostepZTelefonow(dostepStan, hala.teraz());
    const lz = W.logowanieZInternetu(dostepStan.logowanie, hala.teraz());
    const programy = W.programyNaPages(dostepStan, hala.teraz());
    // Serwis: alarm sieci zakładu nad zwiniętymi częściami, stan tunelu i wersji w nagłówku Dostępu.
    wstaw($('serwis-siec'), lz.alarm ? `<section class="admin-linia alarm-sieci" role="alert">
        <h3><span>Sieć zakładu <span class="znacznik alarm">Ustaw</span></span>
          ${lz.alarm.wpis ? '<button type="button" class="maly glowny" data-akcja="wpisz-moj-adres">Wpisz mój adres</button>' : ''}</h3>
        <p class="tekst-alarm">${esc(lz.alarm.opis)}</p>
      </section>` : '');
    const zablokowanych = lz.zablokowane.length;
    wstaw($('serwis-dostep-stan'), `<span class="znacznik ${s.tunel.kolor}">Tunel: ${esc(s.tunel.stan)}</span>
      <span class="znacznik ${s.wersja.kolor}">GitHub Pages: ${esc(s.wersja.stan)}</span>
      ${zablokowanych ? `<span class="znacznik alarm">Zablokowane z internetu: ${zablokowanych}</span>` : ''}`);
    const det = $('serwis-dostep');
    if (det && serwisOtwarte.dostep === null) { serwisOtwarte.dostep = !!(lz.alarm || zablokowanych); det.open = serwisOtwarte.dostep; }
    // Odcisk: przerysowanie co 20 s (P.narysuj) nie może migać kodami QR ani kasować zaznaczenia adresu. Godzina
    // sprawdzenia przez strażnika (co 2 min) zmienia tylko swój akapit — bez niej w odcisku.
    const straznik = s.tunel.straznik;
    const odcisk = JSON.stringify([s, lz, wysyla, aktualizuje, programy], (k, w) => (k === 'straznik' && w ? w.kolor : w));
    if (el.dataset.odcisk === odcisk) {
      const p = el.querySelector('[data-straznik]');
      if (p && straznik) p.textContent = straznik.tekst;
      return;
    }
    el.dataset.odcisk = odcisk;
    const link = a => (a ? `<a href="${esc(a)}" target="_blank" rel="noopener">${esc(a)}</a>` : '');
    el.innerHTML = `
      <p class="slaby opis-widoku">Telefony otwierają aplikacje ze stałych adresów na jednej stronie GitHub Pages (sam wygląd, bez danych):
        cztery aplikacje hali, GK Trasy, GK Flota, GK Szkolenia i GK Wycena. Dane idą tunelem do serwera i do programów w biurze.
        Pokaż kod QR albo wydrukuj — telefon zeskanuje go aparatem i doda aplikację do ekranu.</p>
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
        ${s.tunel.adres ? `<p class="dostep-adres">Adres serwera: ${link(s.tunel.adres)}</p>` : ''}
        ${straznik ? `<p data-straznik class="${straznik.kolor === 'alarm' ? 'tekst-alarm' : 'slaby'}">${esc(straznik.tekst)}</p>` : ''}
        <p class="slaby">${esc(s.tunel.opis)}</p>
      </section>
      ${s.serwer ? `<section class="admin-linia">
        <h3><span>Aktualizacja serwera <span class="znacznik ${s.serwer.kolor}">${esc(s.serwer.stan)}</span></span>
          <button type="button" class="maly glowny" data-akcja="aktualizuj-serwer" ${s.serwer.mozna && !aktualizuje ? '' : 'disabled'}>${aktualizuje ? 'Wysyłam…' : 'Zaktualizuj serwer teraz'}</button></h3>
        <p class="${s.serwer.kolor === 'alarm' ? 'tekst-alarm' : 'slaby'}">${esc(s.serwer.opis)}</p>
        <p class="slaby">Serwer sam sprawdza GitHub co noc o 3:00. Ten przycisk robi to od razu: pobiera najnowsze wydanie, instaluje je
          i uruchamia programy od nowa (kilka minut przerwy). Aplikacje na telefony serwer wyśle potem sam.</p>
      </section>` : ''}
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
            <figcaption><b>${esc(a.nazwa)}</b>${link(a.adres)}${a.opis ? `<span class="slaby">${esc(a.opis)}</span>` : ''}
              <button type="button" class="maly" data-akcja="drukuj-qr-aplikacji" data-app="${esc(a.app)}" aria-label="Drukuj kod ${esc(a.nazwa)}">🖨 Drukuj kod</button></figcaption>
          </figure>`).join('')}</div>
        <div class="admin-pasek"><button type="button" data-akcja="drukuj-qr-aplikacji">🖨 Drukuj wszystkie</button></div>
      </section>
      <section class="admin-linia">
        <h3><span>GK Trasy i GK Flota</span></h3>
        <p class="slaby">Programy na tym komputerze same mówią serwerowi swój adres tunelu, a serwer wysyła ich aplikacje na tę samą
          stronę tym samym tokenem. W programach nic nie trzeba ustawiać.</p>
        ${programy.map(p => `<div class="admin-maszyna"><span><b>${esc(p.nazwa)}</b> <span class="znacznik ${p.kolor}">${esc(p.stan)}</span>
          <span class="${p.kolor === 'alarm' ? 'tekst-alarm' : 'slaby'}">${esc(p.opis)}</span>
          ${p.adres ? `<span class="dostep-adres">Dla telefonów: ${link(p.adres)}</span>` : ''}
          ${p.adres_danych ? `<span class="slaby">Adres danych programu: ${esc(p.adres_danych)}</span>` : ''}</span></div>`).join('')}
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

  async function aktualizujSerwer() {
    if (!(await P.potwierdz('Zaktualizować serwer teraz?', 'Serwer pobierze najnowsze wydanie z GitHuba i zainstaluje je w ciągu kilku minut. '
      + 'Programy w biurze (hala, GK Trasy, GK Flota, Szkolenia, Wycena) wyłączą się na chwilę — najlepiej poza godzinami pracy.', 'Zaktualizuj'))) return;
    aktualizuje = true; rysuj();
    try {
      dostepStan = await hala.admin('POST', '/api/v1/admin/serwer/aktualizuj', {}); dostepCzas = Date.now();
      P.komunikat('Prośba wysłana — serwer zacznie w ciągu 5 minut.', 'ok');
    } catch (e) {
      P.komunikat(P.komunikatBledu(e), 'blad');
      await wczytajDostep();
    } finally { aktualizuje = false; rysuj(); }
  }

  async function wyslijNaPages() {
    if (!(await P.potwierdz('Wysłać aplikacje na GitHub?', 'Na publiczną stronę GitHub Pages trafia sam wygląd czterech aplikacji hali i adres '
      + 'tunelu — bez danych firmy. Telefony wezmą nową wersję same. GK Trasy i GK Flota serwer wysyła sam, bez tego przycisku.', 'Wyślij'))) return;
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

  /* Właściciel 2026-10-15: „chcę móc wydrukować kody QR do wszystkich aplikacji, nie tylko produkcyjnych” — ten sam arkusz
     co okno „Kody QR aplikacji” (HalaKonto.drukujKodyAplikacji): aplikacje hali, GK Trasy, GK Flota, GK Szkolenia, GK Wycena;
     na dole, które są bez kodu i dlaczego. app — jedna aplikacja (właściciel 2026-10-20: „każdy kod QR osobno”). */
  async function drukujKodyAplikacji(app) {
    try {
      const bez = await window.HalaKonto.drukujKodyAplikacji(hala, app);
      if (bez.niedziala.length) P.komunikat(`Bez kodu (program w biurze wyłączony albo jeszcze nie na GitHub Pages): ${bez.niedziala.join(', ')}`, 'uwaga');
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  }

  // ------------------------------------------------------------ połączenia GK (D32, wspolne/GK-KONTA.md §3)

  /* Klucz programu pokazujemy RAZ (w hubie jest tylko jego skrót) — po przerysowaniu go nie ma, więc trzymamy go
     w pamięci strony do zamknięcia tej części albo wylogowania. Nowy klucz czyści przypięcie instalacji programu. */
  let polaczenia = null, bladPolaczen = '', bladPolaczenCzas = 0, nowyKlucz = null, polaczeniaLokalne = false;
  // Jedno pytanie naraz: w Serwisie rysuje się też Dostęp (co 15 s), a każde rysowanie przed odpowiedzią pytałoby od nowa.
  let wczytujePolaczenia = null;

  function wczytajPolaczenia() {
    if (wczytujePolaczenia) return wczytujePolaczenia;
    wczytujePolaczenia = hala.admin('GET', '/api/v1/admin/polaczenia')
      .then(r => { polaczenia = r.polaczenia; polaczeniaLokalne = !!r.lokalne; bladPolaczen = ''; })
      .catch(e => { bladPolaczen = P.komunikatBledu(e); bladPolaczenCzas = Date.now(); })
      .finally(() => { wczytujePolaczenia = null; if (czesc === 'serwis') rysuj(); });
    return wczytujePolaczenia;
  }

  function rysujPolaczenia(el) {
    if (polaczenia === null) {
      el.innerHTML = `<p class="pusto">${esc(bladPolaczen || 'Wczytuję…')}</p>`; delete el.dataset.odcisk;
      if (W.wczytacPonownie(bladPolaczen, bladPolaczenCzas, Date.now())) wczytajPolaczenia();
      return;
    }
    // Serwis: stan każdego programu w nagłówku zwiniętej części — „Połączone” widać bez rozwijania.
    wstaw($('serwis-polaczenia-stan'), polaczenia.map(p => { const s = W.polaczenieGK(p, hala.teraz());
      return `<span class="znacznik ${s.kolor}">${esc(p.nazwa)}: ${esc(s.stan)}</span>`; }).join(' '));
    // Pole z kluczem rysujemy tylko raz — przerysowanie co 20 s nie może kasować zaznaczenia przy kopiowaniu.
    const odcisk = JSON.stringify([polaczenia, nowyKlucz, polaczeniaLokalne]);
    if (el.dataset.odcisk === odcisk) return;
    el.dataset.odcisk = odcisk;
    el.innerHTML = `
      <p class="slaby opis-widoku">Konta wszystkich aplikacji GK zakłada się tutaj (Pracownicy). <b>Programy na tym komputerze łączą
        się same</b> — serwer robi dla nich klucz i podaje go przez plik w profilu Windows, nic nie trzeba wklejać. Klucz ręczny
        („Utwórz klucz”) jest dla programu na innym komputerze: wpisz go tam razem z adresem serwera. Klucz widać tylko raz.</p>
      ${polaczenia.map(p => {
        const s = W.polaczenieGK(p, hala.teraz());
        const tutaj = polaczeniaLokalne && (!p.wlaczone || !p.lokalny);
        return `<section class="admin-linia" data-program="${esc(p.program)}">
          <h3><span>${esc(p.nazwa)} <span class="znacznik ${s.kolor}">${esc(s.stan)}</span></span>
            <span>${tutaj ? '<button type="button" class="maly glowny" data-akcja="polacz-lokalnie">Połącz na tym komputerze</button>' : ''}
            <button type="button" class="maly ${tutaj ? '' : 'glowny'}" data-akcja="nowy-klucz">${p.klucz ? 'Nowy klucz' : 'Utwórz klucz'}</button>
            ${p.wlaczone ? '<button type="button" class="maly" data-akcja="wylacz-polaczenie">Wyłącz</button>' : ''}</span></h3>
          <p class="slaby">${esc(s.opis)}</p>
          ${nowyKlucz && nowyKlucz.program === p.program ? `<div class="nowy-klucz"><b>Klucz — skopiuj teraz, więcej go nie zobaczysz:</b>
            <input readonly value="${esc(nowyKlucz.klucz)}" aria-label="Klucz ${esc(p.nazwa)}">
            <button type="button" class="maly" data-akcja="kopiuj-klucz">Kopiuj</button></div>` : ''}
        </section>`;
      }).join('')}
      <p class="slaby">GK Foto (Marketing) loguje się kontem GK z listy Pracownicy — imię i nazwisko, hasło raz na 16 godzin, na co dzień PIN.
        Klucza nie potrzebuje. Osobie, która pracuje tylko w nim, nadaj rolę „Marketing”. GK Czytnik od wersji 3.13
        działa bez logowania — konta nie potrzebuje.</p>
      <div class="admin-pasek"><button type="button" data-akcja="odswiez-polaczenia">Odśwież stan</button></div>`;
  }

  async function nowyKluczProgramu(program, nazwa) {
    const byl = (polaczenia || []).find(p => p.program === program);
    if (byl && byl.klucz && !(await P.potwierdz(`Nowy klucz ${nazwa}?`,
      'Stary klucz przestanie działać od razu — wpisz nowy w ustawieniach programu. Program na tym komputerze połączysz bez '
      + 'klucza przyciskiem „Połącz na tym komputerze”.', 'Utwórz nowy'))) return;
    const r = await hala.admin('POST', '/api/v1/admin/polaczenia', { program, akcja: 'nowy_klucz' });
    nowyKlucz = { program, klucz: r.klucz };
    await wczytajPolaczenia();
  }

  // ------------------------------------------------------------ etykiety QR (druk — Maszyny → „🖨 Drukuj etykiety”)

  // etykietyRodzaje null = wszystko, co jest do wyboru (D51: przy jednej linii bez stanowisk — same maszyny).
  let etykietyLinie = [], etykietyRodzaje = null;
  const rodzajeEtykiet = sl => etykietyRodzaje || window.PanelEtykiety.rodzajeDoWyboru(sl);

  function rysujEtykiety(el) {
    const sl = hala.slowniki || {};
    const lista = window.PanelEtykiety.pozycje(sl, { linie: etykietyLinie, rodzaje: rodzajeEtykiet(sl) });
    if (!el.querySelector('#formularz-etykiet')) {
      el.innerHTML = `
        <form id="formularz-etykiet" class="admin-ustawienia admin-linia" onsubmit="return false">
          <p class="slaby">Naklejki z kodami do obchodów i zgłoszeń ze skanu. Arkusz A4, 3 kolumny — drukuj w skali 100 %
            na papierze samoprzylepnym albo zwykłym i zalaminuj.</p>
          <fieldset ${W.wieleLinii(sl) ? '' : 'hidden'}><legend>Linie (nic nie zaznaczone = wszystkie)</legend><div class="zaznaczenia">
            ${Object.entries(sl.linie || {}).map(([k, l]) => `<label class="zaznacz"><input type="checkbox" name="linie" value="${esc(k)}"> ${esc((l && l.nazwa) || k)}</label>`).join('')}
          </div></fieldset>
          <fieldset><legend>Co drukować</legend><div class="zaznaczenia">
            ${window.PanelEtykiety.rodzajeDoWyboru(sl).map(r => `<label class="zaznacz"><input type="checkbox" name="rodzaje" value="${r}"
              ${rodzajeEtykiet(sl).includes(r) ? 'checked' : ''}> ${{ linie: 'Linie', stanowiska: 'Stanowiska', maszyny: 'Maszyny' }[r]}</label>`).join('')}
          </div></fieldset>
          <div class="przyciski"><span id="etykiet-ile" class="slaby"></span>
            <button type="button" class="glowny" data-akcja="drukuj-etykiety">🖨 Drukuj</button></div>
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

  /* Koder QR jest w bibliotece ZXing (360 kB) — wczytujemy ją dopiero przy rysowaniu kodów, nie przy każdym starcie
     Panelu. Jeden wczytywacz dla całego Panelu i okna Moje konto (HalaKonto). */
  const wczytajZXing = () => window.HalaKonto.wczytajZXing();

  /* kod maszyny — D61 (właściciel 2026-10-14: „kody QR … do całości i poszczególnych maszyn pojedynczo”): etykieta
     jednej maszyny (np. zniszczona naklejka); bez kodu — arkusz wybranych linii i rodzajów (wszystkie). Druk w ukrytej
     ramce (PanelEtykiety.drukuj — ten sam arkusz co w oknie „🖨 Kody QR”), nie druk całej strony Panelu. */
  async function drukujEtykiety(kod) {
    const lista = kod ? window.PanelEtykiety.pozycje(hala.slowniki || {}, { linie: [], rodzaje: ['maszyny'] }).filter(p => p.kod === kod)
      : window.PanelEtykiety.pozycje(hala.slowniki || {}, { linie: etykietyLinie, rodzaje: rodzajeEtykiet(hala.slowniki || {}) });
    await window.PanelEtykiety.drukuj(lista, kod ? `Etykieta QR ${kod}` : 'Etykiety QR maszyn');
  }

  /* Identyfikatory osób (HALA:P — logowanie skanem w GK Lider, UR i KJ): jednej osoby albo wszystkich z listy (z filtrem
     wyszukiwania i „Pokaż wyłączone” — PanelEtykiety.identyfikatory i tak pomija wyłączonych i konta bez aplikacji ze skanem). */
  function identyfikatoryListy(id) {
    const osoby = id ? (lista || []).filter(p => p.id === id)
      : W.pracownicyAdmin({ lista, szukaj, nieaktywni, stale: hala.kontrakt && hala.kontrakt.stale, slowniki: hala.slowniki });
    return window.PanelEtykiety.identyfikatory(osoby, hala.kontrakt);
  }

  // ------------------------------------------------------------ zdarzenia

  for (const b of document.querySelectorAll('#administracja .chip')) b.addEventListener('click', () => przejdz(b.dataset.czesc));
  // Rozwinięcie części Serwisu (także przez „Pokaż” przy alarmie) — zapamiętane na kolejne wejścia i przerysowania.
  $('admin-tresc').addEventListener('toggle', ev => {
    if (ev.target.matches && ev.target.matches('details.serwis-czesc')) serwisOtwarte[ev.target.dataset.sekcja] = ev.target.open;
  }, true);
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
        if (czesc === 'serwis') await wczytajDostep();
      }
      if (akcja === 'wpisz-moj-adres') await wpiszMojAdres();
      if (akcja === 'kopia-teraz') await kopiaTeraz();
      if (akcja === 'nowa-maszyna') otworzMaszyne();
      if (akcja === 'etykiety') await przyciskEtykiet();
      if (akcja === 'drukuj-etykiety') await drukujEtykiety();
      const program = (b.closest('[data-program]') || {}).dataset?.program;
      const nazwaProgramu = program && ((polaczenia || []).find(p => p.program === program) || {}).nazwa;
      if (akcja === 'nowy-klucz') await nowyKluczProgramu(program, nazwaProgramu);
      if (akcja === 'polacz-lokalnie') {
        await hala.admin('POST', '/api/v1/admin/polaczenia', { program, akcja: 'lokalnie' });
        if (nowyKlucz && nowyKlucz.program === program) nowyKlucz = null;
        P.komunikat(`${nazwaProgramu} połączy się sam w ciągu minuty.`, 'ok');
        await wczytajPolaczenia();
      }
      if (akcja === 'wylacz-polaczenie' && await P.potwierdz(`Wyłączyć ${nazwaProgramu}?`,
        'Program przestanie pobierać konta (zostaną mu ostatnio pobrane) i nie połączy się sam od nowa. Włącza je '
        + '„Połącz na tym komputerze” albo nowy klucz.', 'Wyłącz')) {
        await hala.admin('POST', '/api/v1/admin/polaczenia', { program, akcja: 'wylacz' });
        if (nowyKlucz && nowyKlucz.program === program) nowyKlucz = null;
        await wczytajPolaczenia();
      }
      if (akcja === 'odswiez-polaczenia') await wczytajPolaczenia();
      if (akcja === 'odswiez-dostep') await wczytajDostep();
      if (akcja === 'wyslij-pages') await wyslijNaPages();
      if (akcja === 'aktualizuj-serwer') await aktualizujSerwer();
      if (akcja === 'drukuj-qr-aplikacji') drukujKodyAplikacji(b.dataset.app);
      if (akcja === 'identyfikator' || akcja === 'identyfikatory') {
        const osoby = identyfikatoryListy(akcja === 'identyfikator' ? id : null);
        await window.PanelEtykiety.drukuj(osoby, osoby.length === 1 ? `Identyfikator QR ${osoby[0].nazwa}` : 'Identyfikatory QR');
      }
      if (akcja === 'kopiuj-klucz') {
        const pole = b.parentElement.querySelector('input');
        try { await navigator.clipboard.writeText(pole.value); P.komunikat('Skopiowano klucz', 'ok'); }
        catch (e) { pole.select(); P.komunikat('Zaznaczyłem klucz — skopiuj go (Ctrl+C).', 'uwaga'); }
      }
      if (akcja === 'maszyna') otworzMaszyne(b.dataset.kod);
      if (akcja === 'etykieta') await drukujEtykiety(b.dataset.kod);
      // Okno aplikacji (D30), nie systemowe okienko przeglądarki — ten sam wygląd co reszta pytań i nie wstrzymuje strony.
      if (akcja === 'wycofaj' && await P.potwierdz('Wycofać maszynę?', `${b.dataset.kod} — zostanie w historii awarii i przeglądów.`, 'Wycofaj'))
        await hala.zapisz('slownik.usuniety', `maszyny/${b.dataset.kod}`, { slownik: 'maszyny', klucz: b.dataset.kod });
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });
  for (const okno of [$('okno-osoby'), $('okno-pozycji')]) okno.querySelector('[data-zamknij]').addEventListener('click', () => okno.close());

  // Po wylogowaniu lista pracowników nie może zostać w pamięci strony dla następnej osoby.
  hala.na('sesja', () => {
    lista = null; zakres = null; szukaj = ''; polaczenia = null; nowyKlucz = null; dostepStan = null; bladDostepu = ''; bladListy = ''; bladPolaczen = '';
    kopieStan = null; alarmy = []; alarmyCzas = 0; serwisOtwarte = { dostep: null, polaczenia: false }; etykietyOtwarte = false;
    $('admin-tresc').innerHTML = ''; delete $('admin-tresc').dataset.odcisk;
    rysujAlarmy();
    $('admin-zespol').hidden = true; $('admin-zespol').textContent = '';
  });

  P.widoki.administracja = { rysuj, przejdz };
})();
