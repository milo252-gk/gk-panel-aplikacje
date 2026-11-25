/* Panel Zarządczy GK — rysowanie i połączenie z hubem.

   Panel tylko CZYTA: nie wysyła żadnych zdarzeń (konto „ekran” i tak nie może).
   Całą łączność, pracę bez sieci i pamięć w urządzeniu daje hala.js; tu jest
   tylko: zaloguj → słuchaj zmian → narysuj. Co pokazać, liczy widok.js.       */

(async () => {
  'use strict';

  const W = window.PanelWidok;
  const $ = id => document.getElementById(id);
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KLUCZ_POLACZENIA = 'hala.panel.ostatnioPolaczony';
  const START = Date.now(), START_LASKA_MS = 5000;

  // D59: bhp_zgloszenie — zgłoszenia BHP liderów (lista ⛑ BHP, „Na żywo”, gong przy incydencie).
  const hala = Hala.utworz({ aplikacja: 'panel', typy: ['awaria', 'zmiana_linii', 'partia', 'alert', 'zlecenie', 'proba', 'zgloszenie', 'narzedzia', 'bhp_zgloszenie'], dni: 2 });
  // Wspólne narzędzia dla ekranów w osobnych plikach (administracja.js) — rejestrują się w Panel.widoki.
  // ik('drukuj') — ikona liniowa z gk-ikony.js przed napisem (zamiast emoji); bez załadowanego pliku nic, napis obok mówi to samo.
  const ik = (nazwa, rozmiar) => (window.GKIkony ? `<span class="ik" aria-hidden="true">${window.GKIkony.html(nazwa, rozmiar || 16)}</span>` : '');
  // Znaki statusu zostają w danych (✓ ✗ ▶ ⏳), na ekranie to ikony liniowe; ○ i – to kropka/kreska statusu — tekstem.
  const ZNAK_IKONA = { '✓': 'haczyk', '✗': 'zamknij', '▶': 'odtworz', '⏳': 'klepsydra' };
  const znakIk = (z, r) => (ZNAK_IKONA[z] && window.GKIkony ? ik(ZNAK_IKONA[z], r || 14) : esc(z));
  const Panel = window.Panel = { hala, W, $, esc, ik, widoki: {}, narysuj: () => narysuj(), komunikatBledu: e => komunikatBledu(e) };

  // localStorage bywa niedostępny (tryb prywatny) — Panel ma działać i bez niego.
  const pamiec = {
    czytaj(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    zapisz(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bez pamięci też działa */ } },
  };

  // ------------------------------------------------------------ komunikaty (toast jak w GK Trasy i pozostałych aplikacjach)

  /* Krótki komunikat na dole ekranu (wygląd w hala.css → .komunikaty). rodzaj: ok | blad | uwaga | bez rodzaju.
     Błędy wiszą dłużej. Naraz najwyżej dwa — najstarszy znika. Popover, bo okna Panelu to <dialog>
     w warstwie górnej: bez tego komunikat chowałby się pod zasłoną otwartego okna. */
  const MAKS_KOMUNIKATOW = 2;
  Panel.komunikat = (tekst, rodzaj) => {
    const pudlo = $('komunikaty');
    const el = document.createElement('div');
    el.className = 'komunikat ' + (rodzaj || '');
    el.textContent = tekst;
    pudlo.appendChild(el);
    while (pudlo.children.length > MAKS_KOMUNIKATOW) pudlo.firstElementChild.remove();
    if (pudlo.showPopover) { try { pudlo.hidePopover(); } catch (e) { /* nie był otwarty */ } try { pudlo.showPopover(); } catch (e) { /* stara przeglądarka */ } }
    const dlugo = rodzaj === 'blad' ? 7000 : 4000;   // jak w każdej aplikacji GK: 4 s, błąd 7 s
    setTimeout(() => el.classList.add('znika'), dlugo);
    setTimeout(() => el.remove(), dlugo + 300);
  };
  const komunikat = Panel.komunikat;

  /* Pytanie tak/nie w oknie aplikacji (jak UR.potwierdz) — zamknięcie okna (Esc, Anuluj) = „nie”. */
  Panel.potwierdz = (tytul, tresc, tak) => new Promise(ok => {
    const o = $('okno-pytania');
    let wynik = false;
    $('t-okno-pytania').textContent = tytul;
    $('pytanie-tresc').textContent = tresc;
    $('pytanie-tak').textContent = tak || 'Tak';
    $('pytanie-tak').onclick = ev => { ev.preventDefault(); wynik = true; o.close(); };
    o.addEventListener('close', () => ok(wynik), { once: true });
    o.showModal();
    $('pytanie-tak').focus();
  });

  /* Zapis, który hub ma POTWIERDZIĆ (ustawienia, godziny zmian — etap 3). hala.zapisz wraca od razu (kolejka w telefonie),
     a „Zapisane.” przy formularzu obiecywało coś, czego hub mógł nie przyjąć (zakres, uprawnienia). Czekamy, aż zdarzenia
     zejdą z kolejki (najwyżej maksMs), i patrzymy, czy nie trafiły do odrzuconych. Wynik: W.wynikZapisu. */
  Panel.zapiszWHubie = async (zapisy, maksMs) => {
    const ids = [];
    for (const [typ, obiekt, dane] of zapisy) ids.push((await hala.zapisz(typ, obiekt, dane)).id);
    const wKolejce = () => { const k = new Set(hala.stanKolejki().pozycje.map(z => z.id)); return ids.filter(id => k.has(id)).length; };
    const koniec = Date.now() + (maksMs || 8000);
    while (ids.length && wKolejce() && Date.now() < koniec) {
      await hala.synchronizuj();
      if (wKolejce()) await new Promise(r => setTimeout(r, 300));
    }
    const odrzucone = ids.length ? (await hala.odrzucone()).filter(o => ids.includes(o.id)) : [];
    return { zmian: ids.length, czeka: wKolejce(), odrzucone };
  };

  let widokAktywny = 'na-zywo';
  let ostatnioPolaczony = +pamiec.czytaj(KLUCZ_POLACZENIA) || null;

  // ------------------------------------------------------------ logowanie

  function pokazSesje() {
    const z = hala.zalogowany();
    $('logowanie').hidden = z;
    $('aplikacja').hidden = !z;
    const ekran = !!(hala.pracownik && (hala.pracownik.role || []).includes('ekran'));
    document.body.classList.toggle('tryb-ekran', z && ekran);
    // D64: w nagłówku sama ikona konta (STYL-GK §3) — imię tylko w menu na komputerze.
    $('menu-kto').textContent = z && hala.pracownik ? hala.pracownik.nazwa : '';
    // 2026-11-23: nagłówek menu = imię i nazwisko, nazwa roli, STAŁA nazwa programu „Panel Zarządczy GK” (bez wariantów zależnych od roli).
    const rola = z ? Hala.nazwaRoliMenu(hala.pracownik, hala.kontrakt, 'panel') : '';
    if ($('menu-rola').textContent !== rola) $('menu-rola').textContent = rola;
    // Zapis tylko tam, gdzie kontrakt pozwala roli (konto ekranu i kierownik KJ nie zgłaszają awarii).
    $('menu-awaria').hidden = !(z && mozeWyslac('awaria.zgloszona'));
    $('nowe-zlecenie').hidden = !(z && mozeWyslac('zlecenie.utworzone'));
    // Ten sam warunek co „+ Nowe zlecenie” w Zleceniach (kierownik zakładu i admin; lider UR i kierownik KJ nie), ale liczony wprost: przycisk
    // w Zleceniach bywa ukryty zależnie od zakładki (Zapisane, Kalendarz) i nie może zabierać skrótu z Pulpitu.
    $('pulpit-nowe-zlecenie').hidden = !(z && mozeWyslac('zlecenie.utworzone'));
    // D49: kierownik zakładu, lider UR i kierownik KJ też — ale tylko „Pracownicy” ze swoim zespołem (administracja.js).
    // UI etap 3: Checklisty są częścią Administracji — menu widać też samemu edytującemu szablony.
    const czesciAdm = z ? W.czesciAdministracji(Panel.dostepAdministracji()) : [];
    $('menu-administracja').hidden = !czesciAdm.length;
    // Lider UR i Kierownik KJ mają tu tylko urlopy swoich ludzi — pozycja nazywa się wtedy „Urlopy” (W.nazwaAdministracji).
    const nazwaAdm = W.nazwaAdministracji(czesciAdm);
    const wstawNazwe = (el, nazwa) => { if (el && el.textContent !== nazwa) el.textContent = nazwa; };
    wstawNazwe(document.querySelector('#menu-administracja span:not(.ikona)'), nazwaAdm);
    wstawNazwe($('t-administracja'), nazwaAdm);
    // Czytnik ekranu i podpis ikony czytają title/aria-label ustawione raz przy starcie — odświeżamy je razem z widocznym tekstem.
    for (const id of ['menu-administracja', 't-administracja']) {
      const el = $(id) && ($(id).closest('button, a') || $(id));
      if (el && el.hasAttribute('title')) el.title = nazwaAdm;
      if (el && el.hasAttribute('aria-label')) el.setAttribute('aria-label', nazwaAdm);
    }
    if (z) requestAnimationFrame(dopasujMenu);        // liczba pozycji zależy od roli — mierzymy po ich pokazaniu
    rysujPasek(hala.polaczenie);
    // Raporty → „Do Excela” (D32): rysowany raz na sesję, nie co 20 s — inaczej zamykałby kalendarz w trakcie wyboru daty.
    if (z) HalaEksport.rysuj($('eksport-raporty'), hala, { komunikat });
    else $('eksport-raporty').innerHTML = '';
    if (z) { narysuj(); trzymajEkranWlaczony(ekran); rysujDzwiek(); obsluzAdres(); }
    else {
      znaneAlarmy = null;
      // Fokus tylko z myszą (czytnik kart przy komputerze) — na telefonie wyskoczyłaby klawiatura na pół ekranu.
      if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) setTimeout(() => $('identyfikator').focus(), 0);
    }
  }

  // Zasady w widok.js (W.tekstBledu — testowane): sieć → instrukcja, błąd z telefonu → jego polski tekst.
  function komunikatBledu(e) { return W.tekstBledu(e); }

  /* Logowanie identyfikatorem i hasłem albo PIN-em (D24, D43): identyfikator to kod z karty (czytnik „pisze” go jak
     klawiatura i kończy Enterem) albo login — konto monitora w biurze nie ma karty. Enter z czytnika
     przenosi do drugiego pola, zamiast wysyłać pusty sekret. Drugie pole: „Hasło (raz na 16 godzin na tym
     urządzeniu)” albo „PIN (4 cyfry)” — zależnie od tego, czy ta osoba ma na tym urządzeniu ważny znacznik (konto.js). */
  const poleSekretu = HalaKonto.poleLogowania({ hala, ident: $('identyfikator'), sekret: $('pin'), etykieta: $('pin-etykieta'),
                                                przelacz: $('przelacz-sekret') });
  $('formularz-logowania').addEventListener('submit', async ev => {
    ev.preventDefault();
    const ident = $('identyfikator').value.trim();
    const pin = $('pin').value.trim();
    if (ident && !pin) { $('pin').focus(); return; }
    if (!ident) {          // STYL-GK §2: to samo zdanie co w hubie i w GK Trasy / GK Flota
      $('blad-logowania').textContent = 'Wpisz imię i nazwisko oraz PIN albo hasło.'; $('blad-logowania').hidden = false;
      $('identyfikator').focus(); return;
    }
    const blad = $('blad-logowania');
    blad.hidden = true;
    const przycisk = ev.target.querySelector('button[type="submit"]');
    przycisk.disabled = true;
    try {
      await HalaKonto.zaloguj(hala, { identyfikator: ident, pin }, { komunikat });
      $('identyfikator').value = ''; $('pin').value = ''; poleSekretu.odswiez();
      pokazSesje();
    } catch (e) {
      // Hub przyjął sekret, a potknęło się dopiero wczytywanie stanu (sieć mrugnęła): sesja jest,
      // a resztę dociągnie synchronizacja w tle — nie trzymamy kierownika na ekranie logowania.
      if (hala.zalogowany()) { $('identyfikator').value = ''; $('pin').value = ''; poleSekretu.odswiez(); pokazSesje(); return; }
      blad.textContent = komunikatBledu(e);
      blad.hidden = false;
      $('pin').value = '';
      // D43: 16 h minęło albo 5 złych PIN-ów — hala.js zapomniał znacznik, pole wraca do hasła.
      if (e && e.powod === 'wymagane_haslo') poleSekretu.haslo();
      $('pin').focus();
    } finally {
      przycisk.disabled = false;
    }
  });

  /* Wyloguj: stopka menu (komputer, jak w GK Trasy) i „Moje konto” (ikona osoby w pasku). Zapisy, które jeszcze czekają, nie
     przepadają — wyślą się po ponownym zalogowaniu tej osoby — ale trzeba o nich powiedzieć (jak w UR, KJ, Liderze). */
  async function wyloguj() {
    const ekran = document.body.classList.contains('tryb-ekran');
    const k = hala.stanKolejki().moje;
    if (k && !(await Panel.potwierdz('Wylogować?', `Czeka na wysłanie: ${k}. Wyślą się, gdy znowu zalogujesz się na tym urządzeniu.`, 'Wyloguj'))) return;
    if (!k && ekran && !(await Panel.potwierdz('Wylogować ekran?', 'Trzeba będzie wpisać imię i nazwisko konta ekranu i PIN ponownie.', 'Wyloguj'))) return;
    const konto = document.getElementById('hala-okno-konta');
    if (konto && konto.open) konto.close();
    await hala.wyloguj();
    if (blokada) blokada.release().catch(() => {});   // następna osoba (kierownik na tablecie) nie potrzebuje wiecznego ekranu
    pokazSesje();
  }
  $('menu-wyloguj').addEventListener('click', wyloguj);

  // ------------------------------------------------------------ „Moje konto” (ikona osoby w pasku)

  const NAZWY_TYPOW = {
    'awaria.zgloszona': 'Zgłoszenie awarii', 'zlecenie.utworzone': 'Nowe zlecenie', 'zlecenie.zamkniete': 'Odbiór zlecenia',
    'zlecenie.zwrocone': 'Zwrot zlecenia', 'zlecenie.anulowane': 'Odwołanie zlecenia', 'zlecenie.wykonane': 'Wykonanie zlecenia',
    'zlecenie.cofniete': 'Cofnięcie czynności na zleceniu',
    'zlecenie.zatwierdzone_automatycznie': 'Zatwierdzenie automatyczne', 'zlecenie.pozycja_odebrana': 'Odbiór pozycji checklisty', 'zlecenie.pozycja_zwrocona': 'Zwrot pozycji checklisty',
    'slownik.zapisany': 'Zmiana w administracji', 'slownik.usuniety': 'Usunięcie w administracji',
  };
  function nazwaTypu(typ) {
    if (NAZWY_TYPOW[typ]) return NAZWY_TYPOW[typ];
    const spec = hala.kontrakt && hala.kontrakt.zdarzenia[typ];
    return (spec && spec.opis) ? spec.opis.split(/[.—(]/)[0].trim() : typ;
  }
  Panel.nazwaTypu = nazwaTypu;

  /* „Moje konto” — JEDNO okno z Liderem, UR i KJ (../wspolne/konto.js → HalaKonto.mojeKonto, STYL-GK §3 runda 2):
     ten sam wygląd, szerokość 440 px, Wygląd, Zmień PIN/hasło, Dane w tym urządzeniu, „wersja X”, Zamknij + Wyloguj.
     Rzecz Panelu (dodatki): Powiadomienia — push, gdy zlecenie tej osoby jest po terminie (wspólna sekcja z Liderem).
     Monitor w biurze (konto ekranu) nikomu nic nie zleca — nie ma czego mu przypominać, nie ma też Zmień PIN. */
  function otworzKonto() {
    const ekran = (hala.pracownik && hala.pracownik.role || []).includes('ekran');
    HalaKonto.mojeKonto(hala, {
      aplikacja: 'panel', komunikat, wyloguj, odrzucone: pokazOdrzucone,
      // Instrukcja: krótka strona obok Panelu (instrukcja.html) — telefon z Pages nie ma Instrukcja.pdf z folderu programu. Dla każdej roli, też ekranu.
      instrukcja: 'instrukcja.html',
      dodatki: el => {
        if (ekran) return;
        el.innerHTML = '<div id="konto-powiadomienia"></div>';
        HalaKonto.powiadomienia(el.firstChild, hala, { opis: 'Gdy Twoje zlecenie jest po terminie — także przy zamkniętym Panelu.', komunikat });
      },
    });
  }
  $('konto').addEventListener('click', otworzKonto);

  /* Odrzucone przez hub: nic nie znika samo — kierownik czyta powód i sam usuwa z listy (KONTRAKT §5.2). Osobne okno
     (jak „Odrzucone” w Liderze) — „Moje konto” ma tylko przycisk „Odrzucone przez hub: N”. */
  async function rysujOdrzucone() {
    const lista = await hala.odrzucone();
    const zdjecia = await hala.odrzuconePliki();
    $('lista-odrzuconych').innerHTML = (lista.length ? `<p class="slaby">„Spróbuj ponownie” wysyła zapis jeszcze raz; jeśli powód mówi o błędzie w treści — wprowadź go poprawnie i usuń ten z listy.</p>
      <ul class="lista-odrzuconych">${lista.map(o => `<li><b>${esc(nazwaTypu(o.zd.typ))}</b> <span class="slaby">${esc(W.dataKrotka(o.zd.czas))} ${esc(W.godzina(o.zd.czas))}</span>
        <div class="blad">${esc(o.powod)}</div>
        ${HalaKolejkaUI.przyciskPonow(o.id)} <button type="button" class="maly" data-usun-odrzucone="${esc(o.id)}">Usuń z listy</button></li>`).join('')}</ul>` : '')
      + HalaKolejkaUI.zdjeciaHtml(zdjecia) || '<p class="pusto">Brak niewysłanych zapisów. Wszystko dotarło.</p>';
  }
  HalaKolejkaUI.podlacz($('lista-odrzuconych'), hala, { odswiez: () => rysujOdrzucone(), komunikat });
  async function pokazOdrzucone() {
    await rysujOdrzucone();
    if (!$('okno-odrzucone').open) $('okno-odrzucone').showModal();
  }
  $('lista-odrzuconych').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-usun-odrzucone]');
    if (!b) return;
    await hala.usunOdrzucone(b.dataset.usunOdrzucone);
    rysujOdrzucone();
  });

  // ------------------------------------------------------------ zakładki

  // Podpis pozycji menu także w title — na monitorze (konto ekranu) menu pokazuje same ikony.
  // Na wąskim telefonie podpisy bywają schowane (dopasujMenu) — nazwa pozycji zostaje dla czytnika ekranu w aria-label.
  for (const b of document.querySelectorAll('.zakladki > button')) {
    if (!b.title) b.title = b.textContent.trim();
    if (!b.hasAttribute('aria-label')) b.setAttribute('aria-label', b.title);
  }

  /* Dolny pasek na telefonie (szlif UI 2026-10-12): podpisy 13 px. Gdy którykolwiek się nie mieści (7 pozycji na 390 px —
     „Administracja”, „Wskaźniki”), same ikony we WSZYSTKICH pozycjach — równy pasek zamiast uciętych słów. Mierzymy, a nie
     zgadujemy progu: krój (Roboto, SF, Segoe) i liczba pozycji (rola) zmieniają szerokość podpisów. */
  function dopasujMenu() {
    const nav = document.querySelector('.zakladki');
    nav.classList.remove('same-ikony');
    if (!window.matchMedia('(max-width: 820px)').matches) return;
    const ciasno = [...nav.querySelectorAll(':scope > button:not([hidden])')].some(b => b.scrollWidth > b.clientWidth + 1);
    nav.classList.toggle('same-ikony', ciasno);
  }
  window.addEventListener('resize', dopasujMenu);

  /* Kto co widzi w Administracji (W.czesciAdministracji). Szablony checklist może zmieniać, komu kontrakt pozwala
     zapisywać ten słownik (kierownik, admin). */
  Panel.dostepAdministracji = () => {
    const role = (hala.pracownik && hala.pracownik.role) || [];
    const zapisSzablonow = (((hala.kontrakt || {}).slowniki || {}).szablony_checklist || {}).zapis || [];
    const zapisUrlopow = (((hala.kontrakt || {}).slowniki || {}).urlopy || {}).zapis || [];
    // R10 (2026-11-09): „Maszyny” (kod, nazwa, etykieta QR) ma każdy, komu kontrakt pozwala zapisywać ten słownik — kierownik
    // zakładu i admin (hub od początku to dopuszczał; ekran dawał tylko adminowi).
    const zapisMaszyn = (((hala.kontrakt || {}).slowniki || {}).maszyny || {}).zapis || [];
    return { admin: role.includes('admin'), zespol: HalaZespol.zarzadzaKontami(role, (hala.kontrakt || {}).stale),
             szablony: role.some(r => zapisSzablonow.includes(r)), urlopy: role.some(r => zapisUrlopow.includes(r)),
             maszyny: role.some(r => zapisMaszyn.includes(r)),
             plan: W.obslugujeZmianyWgDni(hala.kontrakt) && role.some(r => ((((hala.kontrakt || {}).slowniki || {}).plan_zmian || {}).zapis || []).includes(r)),
             // kody.dostepne(): kierownik albo administrator; analityka (Wskaźniki, Raporty): to samo grono (pokazAnalityke).
             wyniki: HalaWyniki.dostep(role, (hala.kontrakt || {}).stale).tryb === 'zarzad',
             kody: role.some(r => r === 'kierownik' || r === 'admin'), analityka: role.some(r => r === 'kierownik' || r === 'admin') };
  };

  const WIDOKI = ['na-zywo', 'zlecenia', 'wskazniki', 'wyniki', 'raporty', 'rcp', 'administracja'];
  for (const b of document.querySelectorAll('.zakladki button[data-widok]')) {
    b.addEventListener('click', () => {
      widokAktywny = b.dataset.widok;
      for (const x of document.querySelectorAll('.zakladki button[data-widok]')) x.setAttribute('aria-selected', String(x === b));
      for (const w of WIDOKI) $(w).hidden = widokAktywny !== w;
      narysuj();
    });
  }

  // Właściciel 2026-11-17: Panel nie ma „☰ Więcej”. Chipy Administracji (administracja.js) otwierają te same widoki i okna co dawniej
  // „Więcej”: Wskaźniki i Raporty — zakładki menu (na telefonie schowane, ale klik programowy działa), Nie wysłane — to samo okno co pasek.
  Panel.pokazOdrzucone = () => pokazOdrzucone();
  /* Wskaźniki i Raporty (wykresy, KPI) — tylko kierownik zakładu i administrator (właściciel 2026-10-27); serwer też odmawia
     (GET /api/v1/panel/wskazniki → 403). Lider UR, Kierownik KJ i ekran widzą Na żywo i Zlecenia. */
  function pokazAnalityke() {
    const ok = !!(hala.pracownik && (hala.pracownik.role || []).some(r => r === 'kierownik' || r === 'admin'));
    for (const w of ['wskazniki', 'raporty', 'rcp']) {       // RCP: ta sama grupa ról (serwer: /api/v1/panel/rcp/… tylko kierownik i admin)
      const t = document.querySelector(`.zakladki [data-widok="${w}"]`);
      if (t) t.hidden = !ok;
    }
    // Wyniki (D98): także kierownik działu (swój dział) — zakres liczy HalaWyniki.dostep, tak samo jak chip w Administracji.
    const wyniki = !!hala.pracownik && HalaWyniki.dostep(hala.pracownik.role, (hala.kontrakt || {}).stale).tryb === 'zarzad';
    const tw = document.querySelector('.zakladki [data-widok="wyniki"]');
    if (tw) tw.hidden = !wyniki;
    if (!wyniki && widokAktywny === 'wyniki') { const n = document.querySelector('.zakladki [data-widok="na-zywo"]'); if (n) n.click(); }
    if (!ok && (widokAktywny === 'wskazniki' || widokAktywny === 'raporty' || widokAktywny === 'rcp')) { const n = document.querySelector('.zakladki [data-widok="na-zywo"]'); if (n) n.click(); }
  }
  /* Liczba „Nie wysłane” (odrzucone zapisy i zdjęcia): plakietka na pozycji Administracja w pasku i licznik na chipie „Nie wysłane”.
     Plakietka tylko tam, gdzie chip jest (administrator, kierownik zakładu — W.czesciAdministracji); lider UR i kierownik KJ mają „Urlopy” i swój
     pasek połączenia. */
  function rysujPlakietkiAdministracji() {
    pokazAnalityke();
    const n = ((kolejka && kolejka.odrzucone) || 0) + ((kolejka && kolejka.plikiOdrzucone) || 0);
    const maChip = !!hala.pracownik && W.czesciAdministracji(Panel.dostepAdministracji()).includes('niewyslane');
    const chip = $('chip-niewyslane-tekst');
    if (chip) chip.textContent = n ? `Nie wysłane (${n})` : 'Nie wysłane';
    $('plakietka-administracja').hidden = !(n && maChip);
    $('plakietka-administracja').textContent = n && maChip ? String(n) : '';
  }

  function mozeWyslac(typ) {
    const spec = hala.kontrakt && hala.kontrakt.zdarzenia[typ];
    const role = (hala.pracownik && hala.pracownik.role) || [];
    return !!spec && !role.every(r => r === 'ekran') && (role.includes('admin') || role.some(r => (spec.role || []).includes(r)));
  }

  // ------------------------------------------------------------ rysowanie

  function dane() {
    return {
      teraz: hala.teraz(),
      zmiana: hala.zmianaTeraz(),
      slowniki: hala.slowniki,
      pracownicy: hala.pracownicy,
      stale: (hala.kontrakt && hala.kontrakt.stale) || null,
    };
  }

  function rysujNaglowek(d) {
    const z = W.opisBiezacejZmiany(d.zmiana, d.teraz);
    $('zmiana').innerHTML = z
      ? `<b>${esc(z.nazwa)}</b> <span>${esc(z.od)}–${esc(z.do)}</span> <span class="slaby">${z.pozaPlanem ? 'Poza planem zakładu' : `zostało ${esc(Hala.formatCzasu(z.zostaloMs))}`}</span>`
      : '<span class="slaby">Poza zmianą</span>';                // D64: ten sam tekst co Lider, UR i KJ
    $('zegar').textContent = W.godzina(d.teraz);
  }

  // Czy rozwinięte „Do odbioru” w karcie obchodu (klucz karty → true = rozwinięte); domyślnie ZWINIĘTE (właściciel 2026-11-18: Awarie i Jakość nie spadają pod ekran), wybór przeżywa przerysowania.
  const odbiorKarty = new Map();
  $('kafelki').addEventListener('toggle', ev => {
    const det = ev.target.closest && ev.target.closest('details.kafelek-odbior');
    if (!det) return;
    odbiorKarty.set(det.dataset.klucz, det.open);
    const kar = det.closest('.kafelek');
    kar.classList.toggle('odbior-otwarty', !!kar.querySelector('details.kafelek-odbior[open]'));
  }, true);
  /* Podgląd WSZYSTKICH pozycji w karcie obchodu (właściciel 2026-11-18): klik w kartę (albo przycisk „Wszystkie pozycje”, albo „+N więcej”)
     rozwija listę z dowodami zrobionych pozycji — jeszcze przed oddaniem checklisty. Domyślnie zwinięte, stan przeżywa przerysowania
     (klucz karty → true), rozwinięta karta zajmuje cały rząd. Tylko odczyt (bez Odbierz/Zwróć); lista rysowana dopiero po rozwinięciu. */
  const pozycjeKarty = new Map();
  // Odbierz / Zwróć przy ZROBIONEJ pozycji w rozwiniętej karcie, także gdy checklista nie jest jeszcze oddana (właściciel 2026-11-18).
  // Hub musi przyjmować pozycja_odebrana / pozycja_zwrocona dla otwartych checklist — bez tego zapis zostanie odrzucony (komunikat). Wyłącznik:
  const ODBIOR_POZYCJI_W_KARCIE = true;
  // Filtr pozycji w rozwiniętej karcie (Wszystkie / Do zrobienia / Spóźnione / Zrobione / Pominięte) — klucz karty → kod; bez pamięci w urządzeniu.
  const filtrPozycjiKarty = new Map();
  $('kafelki').addEventListener('click', ev => {
    const b = ev.target.closest('[data-karta-filtr]');
    const karta = b && b.closest('.kafelek[data-klucz]');
    if (!karta) return;
    filtrPozycjiKarty.set(karta.dataset.klucz, b.dataset.kartaFiltr);
    narysuj();
  });
  $('kafelki').addEventListener('click', ev => {
    const karta = ev.target.closest('.kafelek[data-klucz]');
    if (!karta || !karta.querySelector('[data-karta-pozycje]')) return;
    // Klik w coś interaktywnego (przyciski wierszy „Do odbioru”, miniatury, rozwijane części) działa po swojemu; przełącza tylko sam przycisk i reszta karty.
    if (ev.target.closest('button, a, summary, details, input, select, textarea, [data-zdjecie], .karta-pozycje') && !ev.target.closest('[data-karta-pozycje]')) return;
    pozycjeKarty.set(karta.dataset.klucz, pozycjeKarty.get(karta.dataset.klucz) !== true);
    narysuj();
  });
  $('kafelki').addEventListener('click', obsluzKlikZlecenia);
  let wKartach = new Set();
  function rysujKafelki(d, awarie) {
    // Jedna karta na każdą checklistę (tytuł = nazwa checklisty, podpis = dział): mistrz, lider (linie), brygadzista SP, UR, KJ (W.obchodyKarty).
    const karty = W.obchodyKarty({
      slowniki: d.slowniki, pracownicy: d.pracownicy, zmiana: d.zmiana, teraz: d.teraz, stale: d.stale,
      prog: hala.ustawienie('prog_zolty_min', 30), awarie, ja: hala.pracownik,
      zmianaLinii: klucz => hala.obiekt('zmiana_linii', klucz), zlecenia: hala.obiekty('zlecenie'),
    });
    // D87: odbiór checklisty bieżącej zmiany jest w karcie obchodu (nie w osobnej sekcji Pulpitu). Roli bez prawa odbioru
    // (konto ekranu, lider…) karta wygląda jak dotąd.
    const mozeOdbierac = mozeWyslac('zlecenie.zamkniete');
    const odbiory = new Map(), podglady = new Map();
    for (const k of karty) {
      if (mozeOdbierac) {
        const pg = W.pozycjeObchodu({ zlecenia: hala.obiekty('zlecenie'), zmiana: W.zmianaKarty(d.zmiana, k.dzial, d.slowniki, d.teraz), linia: k.linia, dzial: k.dzial || 'produkcja', zlecenieId: k.zlecenieId,
                                      slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz, ja: hala.pracownik });
        if (pg.length) podglady.set(k.klucz, pg);
      }
      const w = mozeOdbierac ? W.odbiorObchodu({ zlecenia: hala.obiekty('zlecenie'), zmiana: W.zmianaKarty(d.zmiana, k.dzial, d.slowniki, d.teraz), linia: k.linia, dzial: k.dzial || 'produkcja', zlecenieId: k.zlecenieId,
                                                slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz, ja: hala.pracownik }) : [];
      if (w.length) odbiory.set(k.klucz, w);
    }
    // Karencja D88 (właściciel 2026-11-17): przez 15 min po końcu zmiany obok kart bieżącej stoją karty POPRZEDNIEJ zmiany z odbiorem
    // („Zmiana II — jeszcze 7 min na odbiór”); po karencji znikają, a serwer zatwierdza zlecenia sam. Karta tylko, gdy coś czeka.
    // D104: Magazyn ma własne zmiany — jego karencja i „poprzednia zmiana” liczą się z jego godzin; reszta zakładu jak dotąd.
    const dzialyWlasne = (Hala.DZIALY_Z_WLASNYMI_ZMIANAMI || []).filter(x => Hala.zmianyDzialu(d.slowniki, x));
    const kartyKarencji = [];
    const widziane = new Set();
    const grupy = [{ dzial: null, zmiana: d.zmiana }].concat(dzialyWlasne.map(x => ({ dzial: x, zmiana: W.zmianaKarty(d.zmiana, x, d.slowniki, d.teraz) })));
    for (const g of grupy) {
      const karencja = mozeOdbierac ? W.zmianaWKarencji({ zmiana: g.zmiana, slowniki: d.slowniki, stale: d.stale, teraz: d.teraz, dzial: g.dzial }) : null;
      if (!karencja) continue;
      // Po karencji też karta na checklistę: tytuł = nazwa checklisty, podpis działu (jak karty bieżącej zmiany).
      const zrodla = W.DZIALY_OBCHODOW.filter(([dzial]) => g.dzial ? dzial === g.dzial : !dzialyWlasne.includes(dzial))
        .map(([dzial, , podpis]) => ({ dzial, linia: null, podpis, klucz: dzial }))
        .concat(g.dzial ? [] : karty.filter(k => k.dzial === 'produkcja').map(k => ({ dzial: 'produkcja', linia: k.linia, podpis: k.podpis, klucz: `produkcja/${k.linia}` })));
      for (const k of zrodla) {
        const w = W.odbiorObchodu({ zlecenia: hala.obiekty('zlecenie'), zmiana: karencja.zmiana, linia: k.linia, dzial: k.dzial,
                                    slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz, ja: hala.pracownik });
        for (const z of w) {
          if (widziane.has(z.id)) continue;
          widziane.add(z.id);
          kartyKarencji.push({ klucz: `karencja/${karencja.zmiana.id}/${z.id}`, naglowek: z.tytul || 'Checklista', podpis: k.podpis, napis: karencja.napis, wiersze: [z] });
        }
      }
    }
    zlecBufor = new Map([].concat(...odbiory.values(), ...kartyKarencji.map(k => k.wiersze)).map(z => [z.id, z]));        // okno szczegółów pozycji czyta stąd
    // Checklisty widoczne w kartach (otwarte i do odbioru) nie powtarzają się w kartach zleceń działów (rysujBiezace).
    wKartach = new Set([...karty.map(k => k.zlecenieId), ...zlecBufor.keys()].filter(Boolean));
    if (okPoz.open) rysujPozycje();
    const kartaKarencji = k => `<article class="kafelek kolor-zolty ma-odbior karencja${odbiorKarty.get(k.klucz) === true ? ' odbior-otwarty' : ''}" data-klucz="${esc(k.klucz)}">
        <header><h3>${esc(k.naglowek)}</h3><span class="znacznik uwaga">Poprzednia zmiana</span></header>
        ${k.podpis ? `<div class="podpis-karty slaby">${esc(k.podpis)}</div>` : ''}
        <div class="stan-zmiany">${esc(k.napis)}</div>
        <details class="kafelek-odbior" data-klucz="${esc(k.klucz)}"${odbiorKarty.get(k.klucz) === true ? ' open' : ''}><summary>Do odbioru <span class="znacznik ok">${k.wiersze.length}</span></summary>
          <div class="lista">${k.wiersze.map(wierszZlecenia).join('')}</div></details>
      </article>`;
    // Filtry sekcji (dział, linia, „tylko spóźnione”; osoba i rodzaj „Zlecenie” ukrywają karty checklist) dotyczą kart checklist
    // tak samo jak kart zleceń. Zwracana lista `karty` zostaje pełna — liczy z niej kafelek „Opóźnione checklisty”.
    const kartaPasuje = k => {
      if (document.body.classList.contains('tryb-ekran')) return true;      // monitor nie ma filtrów — pokazuje wszystkie karty
      const dz = biezaceDzial(), moje = mojeDzialy() || [];
      if (dz === W.MOJE_DZIALY ? !moje.includes(k.dzial || 'produkcja') : (dz && (k.dzial || 'produkcja') !== dz)) return false;
      if (biezace.linia && k.linia !== biezace.linia) return false;
      if (biezace.osoba || biezace.maszyna || biezace.rodzaj === 'zlecenie') return false;
      return !biezace.spoznione || k.opoznione.length > 0;
    };
    $('kafelki').innerHTML = karty.filter(kartaPasuje).map(k => {
      const proc = k.wszystkie ? Math.round(k.zrobione * 100 / k.wszystkie) : 0;
      const stan = k.zamknieta ? 'Raport wysłany' : k.przyjecie && k.przyjecie.tekst ? k.przyjecie.tekst : k.wirtualna ? 'Nie otwarta' : (k.lider || 'Otwarta');
      const pod = podglady.get(k.klucz) || [], podOtwarty = pod.length > 0 && pozycjeKarty.get(k.klucz) === true;
      const opoz = k.opoznione.slice(0, 3).map(p => `<li>${esc(p.godz)} ${esc(p.nazwa)}</li>`).join('')
        + (k.opoznione.length > 3 ? `<li>${pod.length ? `<button type="button" class="link-wiecej" data-karta-pozycje aria-expanded="${podOtwarty}" aria-controls="pk-${esc(k.klucz)}">+${k.opoznione.length - 3} więcej</button>` : `+${k.opoznione.length - 3} więcej`}</li>` : '');
      const podZrobione = pod.reduce((n, z) => n + z.pozycje.filter(p => p.stan !== 'czeka').length, 0), podWszystkie = pod.reduce((n, z) => n + z.pozycje.length, 0);
      // UI etap 4: zatrzymana maszyna na „zielonym” (obchód na czas) kafelku myliła — kafelek dostaje czerwony obrys (.stoi).
      const odb = odbiory.get(k.klucz) || [], odbOtwarty = odb.length && odbiorKarty.get(k.klucz) === true;
      return `<article class="kafelek kolor-${esc(k.kolor)}${k.zatrzymania ? ' stoi' : ''}${odb.length ? ' ma-odbior' : ''}${odbOtwarty ? ' odbior-otwarty' : ''}${pod.length ? ' ma-podglad' : ''}${podOtwarty ? ' pozycje-otwarte' : ''}" data-klucz="${esc(k.klucz)}">
        <header><h3>${esc(k.naglowek)}</h3>${k.zatrzymania ? `<span class="znacznik alarm">${ik('stop', 14)}Stoi: ${k.zatrzymania}</span>` : k.awarie ? `<span class="znacznik uwaga">Awarie: ${k.awarie}</span>` : ''}</header>
        ${k.podpis ? `<div class="podpis-karty slaby">${esc(k.podpis)}</div>` : ''}
        <div class="stan-zmiany ${W.stanKafelkaCzerwony(k) ? 'nieotwarta' : ''}">${esc(stan)}</div>
        <div class="postep" role="progressbar" aria-valuemin="0" aria-valuemax="${k.wszystkie}" aria-valuenow="${k.zrobione}"><span style="width:${proc}%"></span></div>
        <div class="liczby"><b>${k.zrobione}/${k.wszystkie}</b>${k.najblizsza ? ` <span>Następne ${esc(k.najblizsza.godz)} · ${esc(k.najblizsza.nazwa)}</span>` : k.wszystkie ? ' <span>Wszystko zrobione</span>' : ' <span>Brak planu</span>'}</div>
        ${k.opoznione.length ? `<ul class="opoznione" aria-label="Opóźnione">${opoz}</ul>` : ''}
        ${pod.length ? `<button type="button" class="maly karta-pozycje-przycisk" data-karta-pozycje aria-expanded="${podOtwarty}" aria-controls="pk-${esc(k.klucz)}">Wszystkie pozycje · ${podZrobione}/${podWszystkie} <span aria-hidden="true">${ik(podOtwarty ? 'szewron-gora' : 'szewron-dol', 14)}</span></button>` : ''}
        ${podOtwarty ? `<div class="karta-pozycje" id="pk-${esc(k.klucz)}">${chipyPozycji(pod, filtrPozycjiKarty.get(k.klucz) || 'wszystkie')}${pod.map(z => podgladPozycji(z, pod.length > 1, filtrPozycjiKarty.get(k.klucz) || 'wszystkie', mozeOdbierac)).join('')}</div>` : ''}
        ${odb.length ? `<details class="kafelek-odbior" data-klucz="${esc(k.klucz)}"${odbOtwarty ? ' open' : ''}><summary>Do odbioru <span class="znacznik ok">${odb.length}</span></summary>
          <div class="lista">${odb.map(wierszZlecenia).join('')}</div></details>` : ''}
      </article>`;
    }).concat(kartyKarencji.map(kartaKarencji)).join('');
    $('kafelki').dataset.pustyTekst = W.pustyObchod(d.slowniki, d.zmiana);
    ladujZdjeciaLeniwie($('kafelki'));
    // Kafelek mistrza liczy się do „Opóźnione checklisty” na Pulpicie tak samo jak kafelek linii (czerwony = po terminie).
    return karty;
  }

  /* Lista wszystkich pozycji jednej checklisty w karcie obchodu: zrobione (z dowodami), po terminie i do zrobienia. */
  function chipyPozycji(pod, wybrany) {
    const wszystkie = pod.flatMap(z => z.pozycje);
    const licz = kod => wszystkie.filter(p => W.pozycjaPasujeDoFiltru(p, kod)).length;
    return `<div class="chipy karta-chipy" role="group" aria-label="Pokaż pozycje">${W.FILTRY_POZYCJI.map(([kod, nazwa]) =>
      `<button type="button" class="chip maly" data-karta-filtr="${kod}" aria-pressed="${kod === wybrany}">${esc(nazwa)} · ${licz(kod)}</button>`).join('')}</div>`;
  }
  function podgladPozycji(z, zTytulem, filtr, mozeOdbierac) {
    const ZN = { wykonana: '✓', pominieta: '–', czeka: '○' };
    const widoczne = z.pozycje.filter(p => W.pozycjaPasujeDoFiltru(p, filtr || 'wszystkie'));
    if (!widoczne.length) return zTytulem ? '' : '<p class="slaby">Brak pozycji w tym filtrze.</p>';
    const wolno = ODBIOR_POZYCJI_W_KARCIE && !!mozeOdbierac && z.moznaOdebrac && z.mozeOdbieracPozycje && mozeWyslac('zlecenie.pozycja_odebrana');
    return `<section class="karta-pozycje-lista" data-id="${esc(z.id)}">${zTytulem ? `<div class="slaby">${esc(z.tytul)}</div>` : ''}<ul>${widoczne.map(p => `
      <li class="stan-${esc(p.stan)}${p.spozniona ? ' spozniona' : ''}"><div class="poz-wiersz"><span aria-hidden="true">${znakIk(ZN[p.stan])}</span> ${p.godz ? `<span class="slaby">${esc(p.godz)}</span> ` : ''}${esc(p.nazwa)}${
        p.spozniona ? ' <span class="znacznik alarm">po terminie</span>' : p.stan === 'czeka' ? ' <span class="slaby">do zrobienia</span>' : ''}${przyciskiPozycjiHtml(z, p, wolno)}</div>${p.stan !== 'czeka' ? dowodyPozycji(z, p) : ''}</li>`).join('')}</ul></section>`;
  }

  function rysujAwarie(wiersze) {
    const stoi = wiersze.filter(w => w.zatrzymuje).length;
    $('licznik-awarii').innerHTML = wiersze.length
      ? `${stoi ? `<span class="znacznik alarm">Zatrzymane: ${stoi}</span> ` : ''}<span class="znacznik info">Aktywne: ${wiersze.length}</span>` : '';
    // Zwarty pasek (właściciel 2026-11-18): bez awarii jedna cienka linia, przy awariach zwarte wiersze (maszyna, licznik, status, mechanik, miniatura).
    $('lista-awarii').closest('section').classList.toggle('bez-awarii', !wiersze.length);
    $('lista-awarii').innerHTML = wiersze.map(w => `
      <article class="awaria zwarta ${w.zatrzymuje ? 'zatrzymanie' : ''} ${w.czeka && w.czeka.alarm ? 'alarm-potwierdzenia' : ''} ${swieze('awaria|' + w.id) ? 'nowy' : ''}">
        <div class="licznik-przestoju" data-od="${esc(Date.parse(w.czasZgloszenia) || '')}">${esc(W.licznik(w.przestojMs))}</div>
        <div class="opis">
          <div class="maszyna"><b>${esc(w.maszynaNazwa)}</b> <span class="slaby">${esc(w.maszyna)}${w.liniaNazwa ? ` · ${esc(w.liniaNazwa)}` : ''}</span></div>
          <div class="szczegoly">
            <span class="znacznik ${statusKlasa(w.status)}">${esc(w.etykieta)}</span>
            ${w.zatrzymuje ? '' : `<span class="znacznik neutral">${esc(w.priorytetNazwa)}</span>`}
            ${w.mechanik ? `<span>${esc(w.mechanik)}</span>` : ''}
            ${w.czeka ? `<span class="${w.czeka.alarm ? 'tekst-alarm' : ''}">${w.czeka.min ? `od ${esc(Hala.formatCzasu(w.czeka.min * 60000))}` : 'przed chwilą'}</span>` : ''}
          </div>
          ${w.opis ? `<div class="slaby tekst-opisu">${esc(w.opis)}</div>` : ''}
          ${w.mozeAnulowac ? `<div class="akcje-awarii"><button type="button" class="maly" data-akcja="anuluj-awarie" data-id="${esc(w.id)}" title="Fałszywy alarm albo zgłoszenie podwójne — awaria znika z listy">Odwołaj awarię</button></div>` : ''}
        </div>
        ${w.zdjecia.length ? `<div class="zdjecia">${w.zdjecia.map(id => `<button type="button" class="miniatura" data-zdjecie="${esc(id)}" data-podpis="${esc([w.maszynaNazwa, w.opis].filter(Boolean).join(' · '))}" aria-label="Powiększ zdjęcie awarii"><img data-plik="${esc(id)}" alt=""></button>`).join('')}</div>` : ''}
        <div class="numer slaby">${esc(w.numer)}<br> od ${esc(w.godzZgloszenia)}</div>
      </article>`).join('') || '<p class="pusto ok">Brak aktywnych awarii</p>';
    for (const e of $('lista-awarii').querySelectorAll('img[data-plik]'))
      hala.adresPliku(e.dataset.plik).then(u => { e.src = u; }).catch(() => {});
  }

  /* „Pilne od zespołu” (2026-11-25): trwałe wpisy z „Pilne — powiadom kierownika”, ostatnie 48 godzin (W.pilneOdZespolu). Konto „ekran”
     (monitor) ich nie widzi — to wiadomość do kierownika i Menedżera. */
  function rysujPilne(d, zlecenia) {
    const sekcja = $('pulpit-pilne');
    const wiersze = ((hala.pracownik && (hala.pracownik.role || []).includes('ekran')) ? [] : W.pilneOdZespolu({ zlecenia, pracownicy: d.pracownicy, teraz: d.teraz }));
    sekcja.hidden = !wiersze.length;
    $('licznik-pilnych').innerHTML = wiersze.length ? `<span class="znacznik alarm">${wiersze.length}</span>` : '';
    $('lista-pilnych').innerHTML = wiersze.map(w => {
      const podpis = [w.nazwaPozycji, w.tytul].filter(Boolean).join(' · ');
      return `<article class="pilne-wpis" data-id="${esc(w.id)}">
        <div class="opis"><div><b>${esc(w.nazwaPozycji || w.tytul || 'Zlecenie')}</b>${w.nazwaPozycji && w.tytul ? ` <span class="slaby">${esc(w.tytul)}</span>` : ''}</div>
          <div class="slaby">${esc(w.kto)} · ${esc(W.godzina(w.czas))}</div>
          ${w.uwagi ? `<div class="tekst-opisu">${esc(w.uwagi)}</div>` : ''}</div>
        ${w.zdjecia.length ? `<div class="zdjecia">${w.zdjecia.map(id => `<button type="button" class="miniatura" data-zdjecie="${esc(id)}" data-podpis="${esc(podpis)}" aria-label="Powiększ zdjęcie"><img data-plik="${esc(id)}" alt=""></button>`).join('')}</div>` : ''}
      </article>`;
    }).join('');
    ladujZdjeciaLeniwie($('lista-pilnych'));
  }
  $('lista-pilnych').addEventListener('click', ev => {
    const foto = ev.target.closest('[data-zdjecie]');
    if (foto) pokazZdjecie(foto.dataset.zdjecie, foto.dataset.podpis);
  });

  function statusKlasa(status) {
    return { zgloszona: 'alarm', przyjeta: 'uwaga', w_trakcie: 'info', wstrzymana: 'neutral', oczekuje_potwierdzenia: 'ok' }[status] || 'neutral';
  }


  /* Lista raportów jest przerysowywana przy każdym zdarzeniu i co 20 s — bez tej
     pamięci rozwinięty raport zwijałby się kierownikowi w trakcie czytania.   */
  const otwarteRaporty = new Set();
  $('lista-raportow').addEventListener('click', ev => { if (ev.target.closest('[data-bhp-raport]')) Panel.pokazZlecenia('do-zamkniecia', 'biezace', 'bhp'); });
  $('lista-raportow').addEventListener('toggle', ev => {
    const k = ev.target.dataset && ev.target.dataset.klucz;
    if (k) { if (ev.target.open) otwarteRaporty.add(k); else otwarteRaporty.delete(k); }
  }, true);

  // Przerysowanie co 20 s nie może zwijać sekcji, którą kierownik właśnie rozwinął.
  let nieotwarteRozwiniete = false;
  $('bez-raportu').addEventListener('toggle', ev => { if (ev.target.matches('details.nieotwarte')) nieotwarteRozwiniete = ev.target.open; }, true);
  const bezRaportu = d => W.zmianyBezRaportu({ zmianaLinii: klucz => hala.obiekt('zmiana_linii', klucz), slowniki: d.slowniki,
                                                pracownicy: d.pracownicy, teraz: d.teraz, zlecenia: hala.obiekty('zlecenie') });

  function rysujRaporty(d) {
    if (Panel.widoki.proby) Panel.widoki.proby.rysuj(d);
    // Etap 3: zakończone zmiany bez raportu końcowego (2 doby) nad raportami — brak raportu też jest informacją.
    // Otwarte (lider zaczął i nie skończył) — na wierzchu; nieotwarte z szablonem (po weekendzie to szum) — zwinięte.
    const brak = bezRaportu(d), otw = brak.filter(b => b.otwarta), nieotw = brak.filter(b => !b.otwarta);
    const wiersz = b => `<li><span class="kiedy">${esc(b.zmianaOpis)}</span>${b.liniaNazwa ? ` <b>${esc(b.liniaNazwa)}</b>` : ''}
        ${b.otwarta ? '<span class="znacznik alarm">otwarta, bez raportu</span>' : ''}${b.lider ? ` <span class="slaby">${esc(b.lider)}</span>` : ''}</li>`;
    $('bez-raportu').hidden = !brak.length;
    $('bez-raportu').innerHTML = !brak.length ? '' : `
      ${otw.length ? `<h3>Zmiany bez raportu <span class="znacznik uwaga">${otw.length}</span></h3>
        <ul class="lista-bez-raportu">${otw.map(wiersz).join('')}</ul>` : ''}
      ${nieotw.length ? `<details class="nieotwarte" ${nieotwarteRozwiniete ? 'open' : ''}><summary>Nieotwarte (z checklistą): ${nieotw.length}</summary>
        <ul class="lista-bez-raportu">${nieotw.map(wiersz).join('')}</ul></details>` : ''}`;
    const lista = W.raporty({ zmianyLinii: hala.obiekty('zmiana_linii'), slowniki: d.slowniki, pracownicy: d.pracownicy });
    $('lista-raportow').innerHTML = lista.map(r => `
      <details class="raport" data-klucz="${esc(r.klucz)}" ${otwarteRaporty.has(r.klucz) ? 'open' : ''}>
        <summary>
          <span class="kiedy">${esc(r.zmianaOpis)}</span>
          ${r.liniaNazwa ? `<b>${esc(r.liniaNazwa)}</b>` : ''}
          <span class="slaby">${esc(r.lider || '')}</span>
          <span class="skrot">
            ${r.checklista.wszystkie !== null ? `<span class="znacznik ${r.checklista.opoznione ? 'uwaga' : 'ok'}">Checklista ${esc(r.checklista.zrobione)}/${esc(r.checklista.wszystkie)}${r.checklista.opoznione ? ` · ${esc(r.checklista.opoznione)} po czasie` : ''}</span>` : ''}
            ${r.awarie ? `<span class="znacznik alarm">Awarie ${r.awarie} · ${esc(Hala.formatCzasu(r.przestojMin * 60000))}</span>` : '<span class="znacznik ok">Bez awarii</span>'}
            ${r.proby.liczba ? `<span class="znacznik ${r.proby.braki ? 'uwaga' : 'ok'}">Braki ${esc(r.proby.braki)}/${esc(r.proby.sprawdzone)}</span>` : ''}
            ${r.bhp ? `<span class="znacznik alarm">BHP ${esc(r.bhp)}</span>` : ''}
          </span>
        </summary>
        <dl>
          ${r.obsada ? `<dt>Obsada</dt><dd>${esc(r.obsada.obecna ?? '—')} z ${esc(r.obsada.planowana ?? '—')}</dd>` : ''}
          <dt>Checklista</dt><dd>${r.checklista.wszystkie !== null ? `${esc(r.checklista.zrobione)}/${esc(r.checklista.wszystkie)}, opóźnione: ${esc(r.checklista.opoznione)}, pominięte: ${esc(r.checklista.pominiete)}` : '—'}</dd>
          <dt>Awarie</dt><dd>${r.awarieLista.map(a => `${esc(a.numer)} ${esc(a.maszyna)} (${esc(Hala.formatCzasu(a.przestojMin * 60000))})`).join(', ') || 'brak'}</dd>
          <dt>Próby</dt><dd>${r.proby.liczba ? `${esc(r.proby.liczba)}, sprawdzone ${esc(r.proby.sprawdzone)}, braki ${esc(r.proby.braki)}${r.proby.proc !== null ? ` (${esc(W.procent(r.proby.proc))} %)` : ''}` : 'brak'}</dd>
          ${r.bhp ? `<dt>BHP</dt><dd>${esc(r.bhp)} ${r.bhp === 1 ? 'zgłoszenie' : r.bhp < 5 ? 'zgłoszenia' : 'zgłoszeń'} <button type="button" class="maly" data-bhp-raport>${ik('ratunek')}Zobacz zgłoszenia BHP</button></dd>` : ''}
          ${r.uwagi ? `<dt>Uwagi lidera</dt><dd>${esc(r.uwagi)}</dd>` : ''}
          <dt>Zamknięta</dt><dd>${esc(W.dataKrotka(r.czas))} ${esc(W.godzina(r.czas))}</dd>
        </dl>
      </details>`).join('') || '<p class="pusto">Brak raportów z ostatnich dwóch dni</p>';
  }

  /* Sygnał bez rysowania. Schowana karta (Panel pod innym oknem, zminimalizowany) nie dostaje klatek
     (requestAnimationFrame stoi), więc sygnał liczony tylko przy rysowaniu milczał akurat wtedy, gdy kierownik nie patrzy
     (przegląd 2026-10-12). Po powrocie na kartę rysowanie widzi te alarmy jako znane — sygnał nie gra drugi raz, a miganie
     zostaje (swiezeDo). */
  function sygnalWTle() {
    if (!hala.zalogowany()) return;
    const d = dane();
    const wiersze = W.awarie({ awarie: hala.obiekty('awaria', a => a.aktywny), slowniki: d.slowniki, pracownicy: d.pracownicy,
                               stale: d.stale, teraz: d.teraz, alarmMin: hala.ustawienie('alarm_potwierdzenia_min', 30) });   // bez „ja”: tylko sygnał
    const jakosc = W.incydenty({ partie: hala.obiekty('partia'), alerty: hala.obiekty('alert'), slowniki: d.slowniki, zmiana: d.zmiana, teraz: d.teraz });
    sprawdzAlarmy(wiersze, jakosc.lista);
  }

  let zaplanowane = false;
  // Etap 3: osłona „palec na ekranie” (wspolne/palec.js, wzór: UR) — przerysowanie spod palca (tablet kierownika) podmieniało przycisk i połykało dotknięcie.
  const palec = window.HalaPalec.zainstaluj(() => narysuj());
  function narysuj() {
    try { rysujPlakietkiAdministracji(); } catch (e) { /* kolejka jeszcze nieznana przy pierwszym rysowaniu */ }
    if (document.hidden) sygnalWTle();
    if (palec.zajety()) return;
    // Strumień potrafi przynieść kilkadziesiąt zdarzeń naraz (np. po powrocie sieci) — rysujemy raz na klatkę.
    if (zaplanowane) return;
    zaplanowane = true;
    requestAnimationFrame(() => {
      zaplanowane = false;
      if (!hala.zalogowany()) return;
      const d = dane();
      rysujNaglowek(d);
      // Awarie i incydenty liczymy zawsze — nowe zatrzymanie ma dać sygnał także na zakładce „Raporty”.
      const awarie = hala.obiekty('awaria', a => a.aktywny);
      const wiersze = W.awarie({ awarie, slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale,
                                 teraz: d.teraz, alarmMin: hala.ustawienie('alarm_potwierdzenia_min', 30), ja: hala.pracownik });
      const jakosc = W.incydenty({ partie: hala.obiekty('partia'), alerty: hala.obiekty('alert'), slowniki: d.slowniki, zmiana: d.zmiana, teraz: d.teraz });
      sprawdzAlarmy(wiersze, jakosc.lista);
      const zlecenia = hala.obiekty('zlecenie');
      const doZamkniecia = zlecenia.filter(z => z.status === 'wykonane' || z.status === 'odrzucone').length;
      $('plakietka-zlecen').hidden = !doZamkniecia;
      $('plakietka-zlecen').textContent = doZamkniecia || '';
      if (widokAktywny === 'na-zywo') {
        const linie = rysujKafelki(d, awarie);
        rysujAwarie(wiersze);
        rysujPilne(d, zlecenia);
        rysujBiezace(d, zlecenia);
        rysujLiczby(W.kafelki({ kafelkiLinii: linie, wierszeAwarii: wiersze, incydenty: jakosc, zlecenia, teraz: d.teraz, bezRaportu: bezRaportu(d),
                                slowniki: d.slowniki, urzadzenia }));
        pokazJeszcze();
      } else if (widokAktywny === 'zlecenia') {
        rysujZlecenia(d, zlecenia);
        if ($('okno-wykonania').open && Panel.widoki.zgloszenia) Panel.widoki.zgloszenia.odswiezWykonanie();
      } else if (widokAktywny === 'wskazniki') {
        if (Panel.widoki.wskazniki) Panel.widoki.wskazniki.rysuj(d);
      } else if (widokAktywny === 'wyniki') {
        if (Panel.widoki.wyniki) Panel.widoki.wyniki.rysuj();
      } else if (widokAktywny === 'rcp') {
        if (Panel.widoki.rcp) Panel.widoki.rcp.rysuj($('rcp'));
      } else if (widokAktywny === 'administracja') {
        if (Panel.widoki.administracja) Panel.widoki.administracja.rysuj(d);
      } else {
        rysujRaporty(d);
      }
    });
  }

  // ------------------------------------------------------------ pulpit: kafelki liczb (jak GK Flota)

  // Tylko kafelki z liczbą > 0 (W.kafelkiDoPokazania); same zera — jedno spokojne zdanie zamiast rzędu szarych „0”.
  function rysujLiczby(lista) {
    const w = W.kafelkiDoPokazania(lista);
    $('kafelki-liczb').innerHTML = w.spokoj ? '<p class="spokoj">' + ik('haczyk', 18) + 'Wszystko w porządku — nic nie stoi, nic nie czeka</p>' : w.kafelki.map(k => `
      <button type="button" class="${esc(k.klasa)}" data-kafel="${esc(k.kod)}"><span class="etykieta">${esc(k.etykieta)}</span><b>${k.liczba}</b>${k.dopisek ? `<span class="dopisek">${esc(k.dopisek)}</span>` : ''}</button>`).join('');
  }
  // Kafelki zleceń prowadzą do zleceń — „po terminie” do „W toku”, gdzie spóźnione stoją na górze z ⏰ (UI etap 2:
  // osobnego filtra „Po terminie” już nie ma). Reszta jest na tym samym ekranie.
  $('kafelki-liczb').addEventListener('click', ev => {
    const k = ev.target.closest('[data-kafel]');
    if (k && k.dataset.kafel === 'zlecenia') Panel.pokazZlecenia('otwarte', 'biezace');
    if (k && k.dataset.kafel === 'po-terminie') Panel.pokazZlecenia('otwarte', 'biezace');
    if (k && k.dataset.kafel === 'bez-raportu') document.querySelector('.zakladki [data-widok="raporty"]').click();      // zakładka Raporty (na telefonie schowana — klik programowy działa)
    if (k && k.dataset.kafel === 'bhp') Panel.pokazZlecenia('do-zamkniecia', 'biezace', 'bhp');
    if (k && k.dataset.kafel === 'urzadzenia') pokazUrzadzenia();
  });

  /* D78: „Urządzenia z niewysłanymi zapisami” — telefony meldują swoją kolejkę (hala.js → /api/v1/urzadzenie/kolejka),
     Panel pyta hub co minutę. Same liczby: kto i ile; wysyła ta osoba po zalogowaniu albo kierownik z tego telefonu
     (Moje konto → „Zapisy innych osób… Wyślij”). Bez sieci — ostatnia znana lista. */
  let urzadzenia = [];
  async function wczytajUrzadzenia() {
    if (!hala.zalogowany() || (hala.trybOffline && hala.trybOffline())) return;
    try {
      urzadzenia = ((await hala.zapytaj('GET', '/api/v1/panel/urzadzenia')) || {}).urzadzenia || [];
      narysuj();
    } catch (e) { /* bez sieci albo starszy hub — zostaje to, co było */ }
  }
  setInterval(wczytajUrzadzenia, 60000);
  hala.na('sesja', s => { if (s && s.zalogowany) wczytajUrzadzenia(); else urzadzenia = []; });
  function pokazUrzadzenia() {
    let d = document.getElementById('okno-urzadzen');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'okno-urzadzen';
      d.className = 'hala-okno';
      document.body.appendChild(d);
    }
    const lista = W.opisUrzadzen(urzadzenia, hala.teraz());
    d.innerHTML = `<form method="dialog"><h2>Urządzenia z niewysłanymi zapisami</h2>
      ${lista.map(u => `<p><b>${esc(u.tytul)}</b><br>${esc(u.osoby)}<br><span class="slaby">${esc(u.opis)}</span></p>`).join('') || '<p>Nic nie czeka.</p>'}
      <p class="slaby">Zapisy wyślą się, gdy ta osoba zaloguje się na swoim telefonie. Na wspólnym telefonie wyśle je też kierownik albo Menedżer: Moje konto → „Zapisy innych osób” → Wyślij.</p>
      <div class="hala-okno-przyciski"><button type="submit" class="glowny">Zamknij</button></div></form>`;
    if (!d.open) d.showModal();
  }

  // ------------------------------------------------------------ zlecenia dla działów (kierownik)

  let filtrZlecen = 'otwarte', trybZlecen = 'biezace';
  const wZamknietych = () => filtrZlecen === 'zamkniete' || filtrZlecen === 'przepadlo';   // Odebrane i Przepadło: okres, starsze z serwera
  /* Wybór filtra, trybu (biezace | stale) i rodzaju z zewnątrz (kafelek „Zlecenia po terminie” na pulpicie, push, BHP).
     Rodzaj podany — tylko ten (np. BHP); bez rodzaju — filtr rodzaju czyszczony, żeby kafelek pokazał wszystko. */
  Panel.pokazZlecenia = (filtr, tryb, rodzaj, zachowaj) => {
    // Wariant B (2026-11-24): „W toku” i „Do odbioru” wracają na ekran Zlecenia (pełne akcje); Pulpit ma tylko karty checklist.
    // Właściciel 2026-11-24: chipa „Do odbioru” nie ma — pozycje do odbioru (z Odbierz/Zwróć) są w „W toku”.
    if (filtr) filtrZlecen = filtr === 'do-zamkniecia' ? 'otwarte' : filtr;
    if (tryb) trybZlecen = tryb;
    filtry.rodzaj = rodzaj || '';
    const fr = $('filtry-zlecen');
    if (fr && fr.rodzaj) fr.rodzaj.value = filtry.rodzaj;
    document.querySelector('.zakladki [data-widok="zlecenia"]').click();
    $('lista-zlecen').scrollTop = 0;       // spóźnione są na górze listy — tam ma patrzeć kierownik
  };
  /* Adres #zlecenia = dotknięte powiadomienie „Po terminie” (hala-push-sw.js otwiera ./#zlecenia albo przysyła
     otwartemu Panelowi {typ:'otworz'}): od razu Zlecenia „W toku” — spóźnione stoją tam na górze z ⏰ (UI etap 2).
     Adres czyścimy, żeby następne powiadomienie z tym samym adresem znowu zadziałało, a odświeżenie strony nie
     przełączało widoku. Przed zalogowaniem adres czeka — pokazSesje woła to jeszcze raz po zalogowaniu. */
  function obsluzAdres() {
    if (!hala.zalogowany() || !['#zlecenia', '#administracja', '#checklisty', '#bhp', '#pilne'].includes(location.hash)) return;
    const adres = location.hash;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* stary adres zostanie — bez szkody */ }
    // #administracja = dotknięty alarm huba (etap 2: kopia, adres na Pages, token, miejsce) — tylko administrator ma ten widok.
    // Nad częściami świeci czerwona wstęga, a przy każdym alarmie „Pokaż” prowadzi tam, gdzie się go naprawia.
    if (adres === '#administracja') { if (!$('menu-administracja').hidden) $('menu-administracja').click(); return; }
    // #checklisty — dawna pozycja menu (UI etap 3: część Administracji); stare zakładki i linki dalej trafiają w szablony.
    if (adres === '#checklisty') {
      // D60: szablony checklisty lidera są w Zlecenia → Zapisane (stare zakładki i linki trafiają tam).
      Panel.pokazZlecenia(null, 'stale');
      return;
    }
    // #pilne — dotknięte powiadomienie „Pilne — powiadom kierownika” (2026-11-25): Pulpit, gdzie stoi sekcja „Pilne od zespołu”.
    if (adres === '#pilne') { const z = document.querySelector('.zakladki [data-widok="na-zywo"]'); if (z) z.click(); return; }
    // #bhp — dotknięte powiadomienie o zgłoszeniu BHP (D59): lista ⛑ BHP, otwarte na górze.
    if (adres === '#bhp') { Panel.pokazZlecenia('do-zamkniecia', 'biezace', 'bhp'); return; }
    Panel.pokazZlecenia('otwarte', 'biezace');
  }
  window.addEventListener('hashchange', obsluzAdres);
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ev => {
    if (ev.data && ev.data.typ === 'otworz' && ev.data.adres) { window.focus(); location.hash = ev.data.adres; }
  });
  $('filtr-zlecen').addEventListener('click', ev => {
    const b = ev.target.closest('[data-filtr]');
    if (b) { filtrZlecen = b.dataset.filtr; narysuj(); }
  });
  $('tryb-zlecen').addEventListener('click', ev => {
    const b = ev.target.closest('[data-tryb]');
    if (b) { trybZlecen = b.dataset.tryb; narysuj(); }
  });

  // ------------------------------------------------------------ D4: jedno globalne „Szukaj” (przycisk w nagłówku)

  /* Okno „Szukaj”: pole + lista wyników z W.szukaj (czysta funkcja w widok.js). Przeszukuje to, co Panel już ma: zlecenia z
     bieżących dwóch dób, zamknięte dociągnięte z serwera przez filtr Okres (starsze.lista) i słowniki — nic nowego z serwera.
     Dotknięcie wyniku otwiera Zlecenia z odpowiednim filtrem (osoba, maszyna, linia, dział) albo z zaznaczonym zleceniem. Filtry
     ustawione przy przejściu NIE są zapisywane do pamięci (to skrót, nie wybór — jak kafelek „BHP”), więc po odświeżeniu wracają
     te, które osoba sobie zapamiętała. */
  let szukajWyniki = [];
  let zaznaczZlecenie = null;
  function wierszeDoSzukania() {
    const d = dane();
    const jest = new Set();
    const wszystkie = [];
    for (const z of hala.obiekty('zlecenie').concat(starsze.lista || [])) if (z && !jest.has(z.id)) { jest.add(z.id); wszystkie.push(z); }
    return { d, wiersze: W.zlecenia({ zlecenia: wszystkie, slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz, filtr: 'wszystkie', ja: hala.pracownik }) };
  }
  const zaKrotkaFraza = fraza => String(fraza || '').trim().length < 2;
  function rysujWynikiSzukania(fraza, lista) {
    const { d, wiersze } = wierszeDoSzukania();
    szukajWyniki = W.szukaj({ fraza, zlecenia: wiersze, slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, ja: hala.pracownik });
    if (!fraza.trim()) { lista.innerHTML = '<p class="slaby">Wpisz numer zlecenia (ZL-…), tytuł, osobę, maszynę, linię albo dział.</p>'; return; }
    if (!szukajWyniki.length) { lista.innerHTML = `<p class="pusto">${zaKrotkaFraza(fraza) ? 'Wpisz co najmniej 2 znaki.' : 'Nic nie znaleziono. Sprawdź pisownię albo wpisz numer zlecenia.'}</p>`; return; }
    let rodzaj = '';
    lista.innerHTML = szukajWyniki.map((w, i) => {
      const naglowek = w.rodzaj !== rodzaj ? `<h3 class="szukaj-grupa">${esc(W.NAZWY_WYNIKOW[w.rodzaj])}</h3>` : '';
      rodzaj = w.rodzaj;
      const znacznik = w.rodzaj !== 'zlecenie' ? `<span class="znacznik neutral">${w.liczba} ${w.liczba === 1 ? 'zlecenie' : 'zleceń'}</span>` : (w.znacznik ? `<span class="znacznik neutral">${esc(w.znacznik)}</span>` : '');
      return `${naglowek}<button type="button" class="szukaj-wynik" data-n="${i}"><span class="szukaj-tekst"><b>${esc(w.tytul)}</b>${w.opis ? `<span class="slaby">${esc(w.opis)}</span>` : ''}</span>${znacznik}</button>`;
    }).join('');
  }
  function otworzSzukanie() {
    if (!hala.zalogowany() || document.body.classList.contains('tryb-ekran')) return;
    let o = document.getElementById('okno-szukaj');
    if (!o) {
      o = document.createElement('dialog');
      o.id = 'okno-szukaj';
      o.className = 'hala-okno okno-szukaj';
      o.setAttribute('aria-label', 'Szukaj');
      o.innerHTML = `<form method="dialog"><h2>Szukaj</h2>
        <input id="szukaj-pole" type="search" autocomplete="off" enterkeyhint="search" aria-label="Szukaj: zlecenie, osoba, maszyna, linia, dział" placeholder="ZL-…, tytuł, osoba, maszyna, dział">
        <div id="szukaj-wyniki" class="szukaj-wyniki" aria-live="polite"></div>
        <div class="hala-okno-przyciski"><button type="submit">Zamknij</button></div></form>`;
      document.body.appendChild(o);
      $('szukaj-pole').addEventListener('input', () => rysujWynikiSzukania($('szukaj-pole').value, $('szukaj-wyniki')));
      $('szukaj-pole').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); const p = document.querySelector('#szukaj-wyniki .szukaj-wynik'); if (p) p.click(); } });
      $('szukaj-wyniki').addEventListener('click', ev => {
        const b = ev.target.closest('.szukaj-wynik');
        if (b) przejdzDoWyniku(szukajWyniki[+b.dataset.n]);
      });
    }
    $('szukaj-pole').value = '';
    rysujWynikiSzukania('', $('szukaj-wyniki'));
    if (!o.open) o.showModal();
    $('szukaj-pole').focus();
  }
  function przejdzDoWyniku(w) {
    if (!w) return;
    const n = w.nawigacja || {};
    const o = document.getElementById('okno-szukaj');
    if (o && o.open) o.close();
    // Skrót: czyste filtry (osoba / maszyna / linia / dział z wyniku), bez zapisu do pamięci — patrz komentarz wyżej.
    Object.assign(filtry, { dzial: n.dzial || '', osoba: n.osoba || '', rodzaj: '', status: '', linia: n.linia || '', maszyna: n.maszyna || '',
                            od: '', doDnia: '', spoznione: false });
    if ((n.filtr === 'zamkniete' || n.filtr === 'przepadlo') && filtry.okres < 7) filtry.okres = 7;
    zaznaczZlecenie = n.zlecenie || null;
    if (n.filtr !== 'zamkniete' && n.filtr !== 'przepadlo') Object.assign(biezace, { dzial: n.dzial || '', osoba: n.osoba || '', rodzaj: '', linia: n.linia || '', maszyna: n.maszyna || '', spoznione: false });
    Panel.pokazZlecenia(n.filtr || 'otwarte', 'biezace', '', true);
    if ((n.filtr === 'zamkniete' || n.filtr === 'przepadlo') && okresDni() > 2) { probaStarszych = okresDni(); wczytajStarsze(okresDni()); }
  }
  /* Po narysowaniu listy Zleceń: zlecenie wybrane w „Szukaj” dostaje ramkę i przewija się na ekran (raz). */
  function zaznaczZnalezione() {
    if (!zaznaczZlecenie) return;
    const sel = `[data-id="${CSS.escape(zaznaczZlecenie)}"]`;
    const el = $('lista-zlecen').querySelector(sel) || $('kafelki').querySelector(sel);
    if (!el) return;
    zaznaczZlecenie = null;
    const wKarcie = el.closest('details.kafelek-odbior');
    if (wKarcie && !wKarcie.open) wKarcie.open = true;      // wynik Szukaj leży w zwiniętej części karty
    el.classList.add('znalezione');
    el.scrollIntoView({ block: 'center' });
    setTimeout(() => el.classList.remove('znalezione'), 6000);
  }
  $('szukaj').addEventListener('click', otworzSzukanie);
  // E5: na komputerze stałe pole w nagłówku (wyniki w panelu pod nim, te same co w oknie); lupa i okno zostają na telefonie.
  const szukajStale = window.HalaNaglowek ? window.HalaNaglowek.stalePole(document.querySelector('.naglowek .kto'), {
    znak: 'Szukaj: zlecenie, osoba, maszyna, dział', aria: 'Szukaj: zlecenie, osoba, maszyna, linia, dział',
    rysuj: rysujWynikiSzukania, wybierz: b => przejdzDoWyniku(szukajWyniki[+b.dataset.n]) }) : null;
  document.addEventListener('keydown', ev => {
    if (ev.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((ev.target || {}).tagName || '') && !document.querySelector('dialog[open]')) {
      ev.preventDefault();
      if (!(szukajStale && hala.zalogowany() && !document.body.classList.contains('tryb-ekran') && szukajStale.fokus())) otworzSzukanie();
    }
  });

  function klasaZlecenia(status) {
    return { nowe: 'info', przyjete: 'info', wykonane: 'ok', odrzucone: 'uwaga', zamkniete: 'neutral', anulowane: 'neutral',
             przepadlo: 'alarm', zaplanowane: 'neutral' }[status] || 'neutral';
  }


  const mozeZapisacStale = () => {
    const role = (hala.pracownik && hala.pracownik.role) || [];
    const zapis = (((hala.kontrakt || {}).slowniki || {}).zlecenia_stale || {}).zapis || [];
    return role.some(r => r === 'admin' || zapis.includes(r));
  };
  Panel.mozeZapisacStale = mozeZapisacStale;
  // D59: lista BHP (zgloszenia.js) — kto może zamknąć zgłoszenie i dane do nazw (linie, stanowiska, osoby, stałe).
  Panel.mozeWyslac = typ => mozeWyslac(typ);
  Panel.dane = () => dane();

  /* D55: filtry listy zleceń. Okres dłuższy niż 2 dni (Zamknięte) — dociągamy zlecenia z serwera (GET /stan/zlecenie?od=),
     telefon/Panel trzyma w pamięci tylko dwie doby. */
  const filtry = { dzial: '', osoba: '', okres: 2, spoznione: false, rodzaj: '', status: '', linia: '', maszyna: '', od: '', doDnia: '', sort: '', pulpitSort: '' };
  let starsze = { od: null, lista: [], wczytuje: false };
  /* ------------------------------------------------------------ Unifikacja E4 (właściciel 2026-11-23): „Aktualna zmiana” na Pulpicie
     Dawny „W toku” i „Do odbioru” z ekranu Zlecenia, z tymi samymi wierszami i akcjami (wierszZlecenia, obsluzKlikZlecenia, zgloszenia.js),
     nad Obchodami. Filtry tej sekcji (dział, osoba, rodzaj, linia, maszyna, „tylko spóźnione”) to stan w pamięci tej karty — nie zapisujemy ich
     i nie ruszamy kluczy hala.panel.filtry.<id> (te należą do listy „Zlecenia odebrane”). Domyślny dział jak w D76 (lider UR / kierownik KJ — „mój
     dział i moje”). Konto „ekran” (monitor) tej sekcji nie ma. */
  const ZERO_BIEZACYCH = { dzial: null, osoba: '', rodzaj: '', linia: '', maszyna: '', spoznione: false };   // maszyna: bez pola w filtrach, ustawia ją tylko Szukaj
  const biezace = Object.assign({}, ZERO_BIEZACYCH);
  const biezaceDzial = () => (biezace.dzial === null ? dzialDomyslny() : biezace.dzial);
  // Rodzaje na Pulpicie są dwa (właściciel 2026-11-23): Checklista i Zlecenie — zgłoszenie, narzędzia, BHP itd. to „Zlecenie”.
  const rodzajPulpitu = () => '';      // Pulpit pokazuje już tylko karty checklist — filtra rodzaju nie ma (właściciel 2026-11-23)
  function pokazBiezace(ust) {
    Object.assign(biezace, ust || {});
    biezace.rodzaj = rodzajPulpitu(biezace.rodzaj);
    document.querySelector('.zakladki [data-widok="na-zywo"]').click();
    narysuj();
    // Sekcja bywa jeszcze ukryta, gdy rysowanie (rAF) nie zdążyło — próbujemy kilka razy.
    let proby = 0;
    const przewin = () => { const el = $('pulpit-zlecenia'); if (el && !el.hidden) el.scrollIntoView({ block: 'start' }); else if (++proby < 10) setTimeout(przewin, 100); };
    setTimeout(przewin, 60);
  }
  Panel.pokazBiezace = pokazBiezace;
  function wypelnijSelect(select, html, wartosc) {
    if (select.dataset.html !== html) { select.innerHTML = html; select.dataset.html = html; }
    select.value = wartosc;
    return select.value === wartosc;
  }
  function rysujFiltryBiezace(d) {
    const f = $('filtry-biezace');
    const dz = (d.stale && d.stale.dzialy) || [];
    const moje = mojeDzialy();
    const dzial = biezaceDzial();
    wypelnijSelect(f.dzial, (moje ? `<option value="${W.MOJE_DZIALY}">mój dział i moje</option>` : '') + '<option value="">wszystkie</option>'
      + dz.map(x => `<option value="${esc(x.kod)}">${esc(x.nazwa)}</option>`).join(''), dzial);
    const rolaDzialu = dzial === W.MOJE_DZIALY ? dz.filter(x => (moje || []).includes(x.kod)).flatMap(x => x.role || [])
      : dzial ? ((dz.find(x => x.kod === dzial) || {}).role || []) : null;
    const osoby = (d.pracownicy || []).filter(p => p.aktywny !== false && (!rolaDzialu || (p.role || []).some(r => rolaDzialu.includes(r))))
      .filter(p => (p.role || []).some(r => dz.some(x => (x.role || []).includes(r))));
    if (!wypelnijSelect(f.osoba, '<option value="">wszyscy</option>' + osoby.map(p => `<option value="${esc(p.id)}">${esc(p.nazwa)}</option>`).join(''), biezace.osoba)) biezace.osoba = '';
    f.spoznione.checked = biezace.spoznione;
    $('biezace-czysc').hidden = !(biezaceDzial() !== dzialDomyslny() || biezace.osoba || biezace.rodzaj || biezace.linia || biezace.maszyna || biezace.spoznione);
  }
  function rysujBiezace(d, lista) {
    const ekran = document.body.classList.contains('tryb-ekran');
    $('filtry-biezace').hidden = ekran;
    if (ekran) { if (!$('kafelki').children.length) $('kafelki').innerHTML = `<p class="pusto">${esc($('kafelki').dataset.pustyTekst || '')}</p>`; return; }
    const ZG = Panel.widoki.zgloszenia;
    rysujFiltryBiezace(d);
    const dla = filtr => W.zlecenia({ zlecenia: lista, slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz, filtr, ja: hala.pracownik })
      .filter(z => !((z.pozycje || []).length && wKartach.has(z.id)))
      .map(z => Object.assign(z, { html: wierszZlecenia(z) }));
    const wToku = dla('otwarte'), doOdbioru = dla('do-zamkniecia');
    // Właściciel 2026-11-23: kart zleceń działów („Lider GK · Zlecenia · W toku”) na Pulpicie nie ma — wystarczy rozwinięcie karty checklisty
    // (lista pozycji, odbiór). Wiersze zostają w zlecBufor, bo okno szczegółów pozycji czyta stamtąd.
    for (const el of $('kafelki').querySelectorAll('.zlecenia-dzialu, .pusto')) el.remove();
    if (!$('kafelki').children.length) {
      const filtrAktywny = !$('biezace-czysc').hidden;
      $('kafelki').innerHTML = `<p class="pusto">${filtrAktywny ? 'Nic nie pasuje do filtrów — wyczyść je.' : esc($('kafelki').dataset.pustyTekst || 'Żadne zlecenie nie jest w toku ani nie czeka na odbiór.')}${!filtrAktywny && mozeWyslac('zlecenie.utworzone') ? ' Dodasz je przyciskiem „Nowe zlecenie”.' : ''}</p>`;
    }
    zlecBufor = new Map([...zlecBufor, ...[...wToku, ...doOdbioru].map(z => [z.id, z])]);      // okno szczegółów pozycji czyta stąd
    if (okPoz.open) rysujPozycje();
    ladujZdjeciaLeniwie($('kafelki'));
    if (zaznaczZlecenie && wKartach.has(zaznaczZlecenie)) zaznaczZlecenie = null;      // checklista z karty — jej wiersza tu nie ma
    zaznaczZnalezione();
  }
  $('filtry-biezace').addEventListener('change', ev => {
    const f = $('filtry-biezace');
    Object.assign(biezace, { dzial: f.dzial.value, osoba: f.osoba.value, spoznione: f.spoznione.checked });
    narysuj();
  });
  $('filtry-biezace').addEventListener('submit', ev => ev.preventDefault());
  $('biezace-czysc').addEventListener('click', () => { Object.assign(biezace, ZERO_BIEZACYCH); narysuj(); });

  /* Filtry i sortowanie pamiętane osobno dla każdej osoby w tej przeglądarce (2026-11-17): klucz hala.panel.filtry.<id osoby>.
     Wczytujemy raz po zalogowaniu osoby (zmiana osoby = jej własne ustawienia, nie poprzedniej), zapisujemy przy każdej zmianie
     przez użytkownika — nie przy wejściu z kafelka (np. „BHP”), bo to chwilowy skrót, nie wybór. Brak pamięci albo zły zapis
     = ustawienia domyślne; nic nie zmienia istniejących kluczy ani kolejki zapisów. */
  const dzialDomyslny = () => (mojeDzialy() ? W.MOJE_DZIALY : '');
  function zadbajOFiltry() {
    const ja = hala.pracownik && hala.pracownik.id;
    if (!ja || filtry.dlaOsoby === ja) return;
    filtry.dlaOsoby = ja;
    // Klucz jako literał „hala.panel.filtry.” + id (to samo co W.KLUCZ_FILTROW): test t_dostep pilnuje przedrostka „hala.” w kodzie.
    const zapis = W.filtryZPamieci(pamiec.czytaj('hala.panel.filtry.' + ja));
    Object.assign(filtry, { dzial: dzialDomyslny(), osoba: '', rodzaj: '', status: '', linia: '', maszyna: '', od: '', doDnia: '', spoznione: false,
                            sort: '', okres: 2, pulpitSort: '' }, zapis || {});
    if (zapis && !zapis.dzial) filtry.dzial = '';                         // zapisane „wszystkie” zostaje „wszystkie”
    if (filtry.dzial === W.MOJE_DZIALY && !mojeDzialy()) filtry.dzial = '';
  }
  const zapiszFiltry = () => { const ja = hala.pracownik && hala.pracownik.id; if (ja) pamiec.zapisz('hala.panel.filtry.' + ja, W.filtryDoPamieci(filtry)); };
  /* Ile dni wstecz dociągnąć Zamknięte: Okres, a przy „Od dnia” — tyle, ile trzeba, żeby ta data była w pamięci. */
  function okresDni() {
    const z = filtry.od ? W.zakresDat(filtry.od, '') : null;
    return z && z.odMs !== null ? Math.max(2, Math.ceil((hala.teraz() - z.odMs) / 86400000)) : filtry.okres;
  }
  let probaStarszych = 0;
  async function wczytajStarsze(dni) {
    const od = new Date(hala.teraz() - dni * 86400000).toISOString();
    if (starsze.wczytuje || (starsze.od && starsze.od <= od)) return;
    starsze.wczytuje = true;
    try {
      const w = await hala.pobierzStan('zlecenie', { aktywne: 0, od, limit: 5000 });
      starsze = { od, lista: w.obiekty || [], wczytuje: false };
      const uciete = W.komunikatUciecia(w);
      if (uciete) komunikat('Odebrane zlecenia: ' + uciete, 'uwaga');
    } catch (e) { starsze.wczytuje = false; komunikat('Starszych zleceń nie wczytano — ' + komunikatBledu(e), 'uwaga'); }
    narysuj();
  }
  Panel.zleceniaOkresu = async dni => { await wczytajStarsze(dni); return starsze.lista; };
  function listaZOkresem(lista) {
    if (!wZamknietych() || okresDni() <= 2 || !starsze.od) return lista;
    const od = hala.teraz() - okresDni() * 86400000;
    const jest = new Set(lista.map(z => z.id));
    return lista.concat(starsze.lista.filter(z => !jest.has(z.id) && Date.parse(z.zmieniono || (z.dane || {}).czas_zlecenia) >= od));
  }
  /* D76: lider UR i kierownik KJ widzą domyślnie zlecenia swojego działu i to, co sam zlecił („Mój dział i moje”); „wszystkie”
     działa jak dotąd — to filtr, nie blokada. Domyślny ustawiamy raz na zalogowaną osobę. */
  const mojeDzialy = () => { const z = Hala.dzialyKierownika(roleJa(), (hala.kontrakt.stale || {}).dzialy || []); return z && z.length ? z : null; };
  function rysujFiltry(d) {
    const f = $('filtry-zlecen');
    const dz = (d.stale && d.stale.dzialy) || [];
    const moje = mojeDzialy(), ja = hala.pracownik && hala.pracownik.id;
    zadbajOFiltry();                    // domyślny dział raz na osobę (D76) albo to, co ta osoba zapamiętała (2026-11-17)
    const nowe = (moje ? `<option value="${W.MOJE_DZIALY}">mój dział i moje</option>` : '') + '<option value="">wszystkie</option>'
      + dz.map(x => `<option value="${esc(x.kod)}">${esc(x.nazwa)}</option>`).join('');
    if (f.dzial.dataset.html !== nowe) { f.dzial.innerHTML = nowe; f.dzial.dataset.html = nowe; }
    if (f.dzial.value !== filtry.dzial) f.dzial.value = filtry.dzial;
    const rolaDzialu = filtry.dzial === W.MOJE_DZIALY ? dz.filter(x => (moje || []).includes(x.kod)).flatMap(x => x.role || [])
      : filtry.dzial ? ((dz.find(x => x.kod === filtry.dzial) || {}).role || []) : null;
    const osoby = (d.pracownicy || []).filter(p => p.aktywny !== false && (!rolaDzialu || (p.role || []).some(r => rolaDzialu.includes(r))))
      .filter(p => (p.role || []).some(r => dz.some(x => (x.role || []).includes(r))));
    const noweO = '<option value="">wszyscy</option>' + osoby.map(p => `<option value="${esc(p.id)}">${esc(p.nazwa)}</option>`).join('');
    if (f.osoba.dataset.html !== noweO) { f.osoba.innerHTML = noweO; f.osoba.dataset.html = noweO; f.osoba.value = filtry.osoba; if (f.osoba.value !== filtry.osoba) filtry.osoba = ''; }
    // Osoba ustawiona z zewnątrz (wynik „Szukaj”) — pole ma pokazać to samo, co filtruje; nieznana na liście wraca do „wszyscy”.
    if (f.osoba.value !== filtry.osoba) { f.osoba.value = filtry.osoba; if (f.osoba.value !== filtry.osoba) filtry.osoba = ''; }
    $('filtr-okres').hidden = !wZamknietych();
    const noweR = '<option value="">wszystkie</option>' + W.RODZAJE_ZADAN.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');
    if (f.rodzaj.dataset.html !== noweR) { f.rodzaj.innerHTML = noweR; f.rodzaj.dataset.html = noweR; }
    f.rodzaj.value = filtry.rodzaj;
    f.spoznione.checked = filtry.spoznione;
    f.okres.value = String(filtry.okres);
  }
  /* Pola z 2026-11-17 (status, linia, maszyna, daty, kolejność). Listy budujemy z wierszy tej zakładki (status — tylko te,
     które tam są; wybrana wartość zostaje na liście, żeby zapamiętany filtr nie był niewidocznym ukrywaniem listy). Linia —
     tylko przy kilku liniach (W.wieleLinii, jak wszędzie); maszyna zawężona do wybranej linii. */
  function rysujFiltryDodatkowe(d, zlecenia) {
    const f = $('filtry-zlecen');
    const sl = d.slowniki || {};
    const nazwyStatusow = (((hala.kontrakt || {}).obiekty || {}).zlecenie || {}).statusy || {};
    const kody = [...new Set(zlecenia.map(z => z.status).concat(filtry.status ? [filtry.status] : []))];
    const nS = '<option value="">wszystkie</option>' + kody.map(k => `<option value="${esc(k)}">${esc(nazwyStatusow[k] || k)}</option>`).join('');
    if (f.status.dataset.html !== nS) { f.status.innerHTML = nS; f.status.dataset.html = nS; }
    f.status.value = filtry.status;
    const wiele = W.wieleLinii(sl);
    $('filtr-linia').hidden = !wiele;
    if (!wiele && filtry.linia) filtry.linia = '';            // jedna linia = pole schowane, więc nie może też cicho filtrować
    const linie = Object.entries(sl.linie || {}).sort((a, b) => ((a[1] || {}).kolejnosc || 0) - ((b[1] || {}).kolejnosc || 0));
    const nL = '<option value="">wszystkie</option>' + linie.map(([k, l]) => `<option value="${esc(k)}">${esc((l || {}).nazwa || k)}</option>`).join('');
    if (f.linia.dataset.html !== nL) { f.linia.innerHTML = nL; f.linia.dataset.html = nL; }
    f.linia.value = filtry.linia;
    const maszyny = Object.entries(sl.maszyny || {}).filter(([k, m]) => !filtry.linia || (m || {}).linia === filtry.linia || k === filtry.maszyna)
      .sort((a, b) => String((a[1] || {}).nazwa || a[0]).localeCompare(String((b[1] || {}).nazwa || b[0]), 'pl'));
    $('filtr-maszyna').hidden = !maszyny.length;
    const nM = '<option value="">wszystkie</option>' + maszyny.map(([k, m]) => `<option value="${esc(k)}">${esc((m || {}).nazwa || k)}</option>`).join('');
    if (f.maszyna.dataset.html !== nM) { f.maszyna.innerHTML = nM; f.maszyna.dataset.html = nM; }
    f.maszyna.value = filtry.maszyna;
    const nK = W.SORTOWANIA.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');
    if (f.sort.dataset.html !== nK) { f.sort.innerHTML = nK; f.sort.dataset.html = nK; }
    f.sort.value = filtry.sort;
    if (f.od.value !== filtry.od) f.od.value = filtry.od;
    if (f.doDnia.value !== filtry.doDnia) f.doDnia.value = filtry.doDnia;
    return { dzial: Object.fromEntries(((d.stale && d.stale.dzialy) || []).map(x => [x.kod, x.nazwa])),
             osoba: Object.fromEntries((d.pracownicy || []).map(p => [p.id, p.nazwa])),
             rodzaj: Object.fromEntries(W.RODZAJE_ZADAN), status: nazwyStatusow,
             linia: Object.fromEntries(linie.map(([k, l]) => [k, (l || {}).nazwa || k])),
             maszyna: Object.fromEntries(Object.entries(sl.maszyny || {}).map(([k, m]) => [k, (m || {}).nazwa || k])) };
  }
  /* „N z M”, co jest aktywne i „Wyczyść filtry” — N po filtrach, M wszystkich w tej zakładce (przed filtrami wybieranymi przez osobę). */
  function rysujStanFiltrow(nazwy, n, m) {
    const aktywne = W.filtryAktywne(filtry, dzialDomyslny());
    $('filtry-licznik').textContent = `${n} z ${m}`;
    const opis = W.opisFiltrow(filtry, nazwy);
    $('filtry-opis').textContent = opis.length ? `Aktywne: ${opis.join(' · ')}` : '';
    // Plakietka na wierzchu (też na telefonie, gdzie rząd pól się przewija): ile filtrów zawęża listę.
    $('filtry-aktywne').hidden = !aktywne || !opis.length;
    $('filtry-aktywne').textContent = opis.length === 1 ? '1 filtr' : `Filtry: ${opis.length}`;
    $('filtry-czysc').hidden = !aktywne;
    // Rzadkie pola (okres, linia, maszyna, daty): aktywny filtr nie może siedzieć w schowanym miejscu — „Więcej” otwiera się samo.
    const rzadkieAktywne = !!(filtry.linia || filtry.maszyna || filtry.od || filtry.doDnia || (wZamknietych() && okresDni() > 2));
    ustawRzadkie(rzadkieOtwarte || rzadkieAktywne);
  }
  let rzadkieOtwarte = false;
  function ustawRzadkie(otwarte) {
    $('filtry-rzadkie').classList.toggle('otwarte', otwarte);
    $('filtry-wiecej').setAttribute('aria-expanded', String(otwarte));
  }
  $('filtry-wiecej').addEventListener('click', () => {
    rzadkieOtwarte = $('filtry-wiecej').getAttribute('aria-expanded') !== 'true';
    ustawRzadkie(rzadkieOtwarte);
  });
  $('filtry-zlecen').addEventListener('change', ev => {
    const f = $('filtry-zlecen');
    Object.assign(filtry, { dzial: f.dzial.value, osoba: f.osoba.value, okres: +f.okres.value || 2, spoznione: f.spoznione.checked,
                            rodzaj: f.rodzaj.value, status: f.status.value, linia: f.linia.value, maszyna: f.maszyna.value,
                            od: f.od.value, doDnia: f.doDnia.value, sort: f.sort.value });
    // Zmiana linii zdejmuje maszynę z innej linii (lista maszyn jest zawężona do wybranej linii).
    if (ev.target === f.linia && filtry.linia && filtry.maszyna && ((hala.slowniki.maszyny || {})[filtry.maszyna] || {}).linia !== filtry.linia) filtry.maszyna = '';
    zapiszFiltry();
    if (wZamknietych() && okresDni() > 2) { probaStarszych = okresDni(); wczytajStarsze(okresDni()); }
    narysuj();
  });
  $('filtry-zlecen').addEventListener('submit', ev => ev.preventDefault());
  // „Wyczyść filtry” wraca do stanu wyjściowego (dział lidera UR i kierownika KJ — „mój dział i moje”, jak po pierwszym zalogowaniu); kolejność
  // Pulpitu to osobny wybór i zostaje.
  $('filtry-czysc').addEventListener('click', () => {
    Object.assign(filtry, { dzial: dzialDomyslny(), osoba: '', rodzaj: '', status: '', linia: '', maszyna: '', od: '', doDnia: '', spoznione: false, sort: '', okres: 2 });
    zapiszFiltry();
    narysuj();
  });

  $('zlecenia-czysc').addEventListener('click', () => { if (Panel.widoki.czyszczenie) Panel.widoki.czyszczenie.otworz(); });

  /* Pusta lista „W toku” mówi też, co dalej (audyt 2026-11-09): kto może zlecać, dostaje wskazówkę o przycisku u góry. */
  function pustaListaZlecenTekst(chipy) {
    const filtryAktywne = !!(filtry.dzial || filtry.osoba || filtry.rodzaj || filtry.spoznione || filtry.status || filtry.linia || filtry.maszyna || filtry.od || filtry.doDnia);
    const tekst = W.pustaListaZlecen(filtrZlecen, chipy, filtryAktywne);
    return filtrZlecen === 'otwarte' && !filtryAktywne && mozeWyslac('zlecenie.utworzone')
      ? `${tekst}. Dodasz je przyciskiem „Nowe zlecenie”.` : tekst;
  }
  /* Rozwinięcia sekcji <details> w wierszach listy Zleceń (Pozycje, Części, Nie mogę): klucz = id zlecenia + klasa sekcji. Zapisuje tylko to,
     co zrobiła osoba (klik w summary); domyślne otwarcie („Do odbioru” ma pozycje rozwinięte) działa jak dotąd, dopóki osoba nie zmieni. */
  const rozwiniecia = new Map();
  const kluczRozwiniecia = det => { const w = det.closest('[data-id]'); return w ? `${w.dataset.id}|${det.className}` : ''; };
  $('lista-zlecen').addEventListener('click', ev => {
    const sum = ev.target.closest('summary');
    const det = sum && sum.parentElement;
    if (!det || det.tagName !== 'DETAILS') return;
    const k = kluczRozwiniecia(det);
    if (k) rozwiniecia.set(k, !det.open);          // klik jeszcze nie przestawił `open` — stan po kliknięciu to przeciwieństwo
  });
  function przywrocRozwiniecia(korzen) {
    for (const det of korzen.querySelectorAll('details')) {
      const k = kluczRozwiniecia(det);
      if (k && rozwiniecia.has(k)) det.open = rozwiniecia.get(k);
    }
  }
  function rysujZlecenia(d, lista) {
    for (const b of document.querySelectorAll('#tryb-zlecen [data-tryb]')) b.setAttribute('aria-pressed', String(b.dataset.tryb === trybZlecen));
    for (const b of document.querySelectorAll('#filtr-zlecen [data-filtr]')) b.setAttribute('aria-pressed', String(b.dataset.filtr === filtrZlecen));
    // D60 (właściciel 2026-10-14: „oznaczaj rodzaje zleceń, a nie dziel je na kategorie — wszystko z tego jest zadaniem”):
    // dwa tryby — Zadania (jedna lista wszystkich rodzajów, znacznik + filtr „Rodzaj”) i Zapisane (wszystkie wzory, także
    // checklisty lidera, wcześniej w Administracji). Zgłoszenia, narzędzia i BHP — wiersze z zgloszenia.js.
    const ZG = Panel.widoki.zgloszenia;
    for (const t of ['biezace', 'stale', 'kalendarz']) $(`zlecenia-${t}`).hidden = trybZlecen !== t;
    $('nowe-zlecenie').hidden = !(trybZlecen === 'biezace' && mozeWyslac('zlecenie.utworzone'));
    $('nowe-menu').hidden = !(trybZlecen === 'stale' && mozeZapisacStale());
    $('zlecenia-czysc').hidden = !(trybZlecen === 'biezace' && Panel.widoki.czyszczenie && Panel.widoki.czyszczenie.dostepne());
    // D71: 📅 Kalendarz — miesiąc zleceń stałych i zaplanowanych (kalendarz.js).
    if (trybZlecen === 'kalendarz') {
      if (Panel.widoki.kalendarz) Panel.widoki.kalendarz.rysuj(d, lista);
      return;
    }
    if (trybZlecen === 'stale') {
      if (Panel.widoki.checklisty) Panel.widoki.checklisty.rysuj();
      if (Panel.widoki.stale) Panel.widoki.stale.rysuj(d);
      return;
    }
    rysujFiltry(d);
    const zlecenia = W.zlecenia({ zlecenia: listaZOkresem(lista), slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale,
                                  teraz: d.teraz, filtr: filtrZlecen === 'otwarte' ? 'w-toku' : filtrZlecen, ja: hala.pracownik }).map(z => Object.assign(z, { html: wierszZlecenia(z) }));
    // Zgłoszenia, narzędzia i BHP czekające na kierownika (dawny „Do odbioru”) są teraz w „W toku”; Przepadło ich nie dotyczy.
    const inne = !ZG ? [] : filtrZlecen === 'otwarte' ? ZG.wiersze(d, 'do-zamkniecia') : filtrZlecen === 'zamkniete' ? ZG.wiersze(d, 'zamkniete') : [];
    const fm = Object.assign({}, filtry, { mojeDzialy: mojeDzialy() || [], ja: hala.pracownik && hala.pracownik.id });
    // „Więcej filtrów”: sortowanie wybrane przez osobę zastępuje kolejność domyślną całej listy; M = wszystko w tej zakładce.
    const nazwyFiltrow = rysujFiltryDodatkowe(d, zlecenia);
    const wiersze = W.sortujWgDaty(W.polaczZadania(W.filtrujZlecenia(zlecenia, fm), W.filtrujZlecenia(inne, fm)), filtry.sort);
    rysujStanFiltrow(nazwyFiltrow, wiersze.length, zlecenia.length + inne.length);
    // Zamknięte starsze niż 2 dni (Okres albo „Od dnia”) — dociągamy raz; po błędzie nie ponawiamy w pętli rysowania.
    if (wZamknietych() && okresDni() > 2 && okresDni() > probaStarszych) { probaStarszych = okresDni(); wczytajStarsze(okresDni()); }
    // Liczby na chipach — kierownik widzi od razu, ile jest w toku (⏰ ile po terminie) i ile czeka na niego (także
    // zgłoszenia, narzędzia i BHP). Po terminie, przepadłe (D35) i pilne BHP — chip na czerwono.
    const chipy = W.chipyZlecen(lista, d.teraz, ZG ? ZG.liczby() : null);
    for (const c of chipy) {
      const b = document.querySelector(`#filtr-zlecen [data-filtr="${c.filtr}"]`);
      if (!b) continue;
      const tresc = esc(c.napis) + (c.po ? ` · ${ik('zegar', 14).replace('class="ik"', 'class="ik bez-odstepu"')}${c.po}` : '');
      if (b.dataset.tresc !== tresc) { b.innerHTML = tresc; b.dataset.tresc = tresc; }
      b.title = c.po ? `${c.po} po terminie` : '';
      b.classList.toggle('spoznione', c.alarm);
    }
    zlecBufor = new Map(zlecenia.map(z => [z.id, z]));
    if (okPoz.open) rysujPozycje();                      // okno pozycji odświeża się razem z listą (zlecenie odebrane → zamyka się)
    // Właściciel 2026-11-24: rozwinięta historia/pozycje checklisty nie może się zwijać przy odświeżeniu listy (co kilka sekund, zdarzenia
    // na żywo). Stan rozwinięcia pamiętamy po id zlecenia i rodzaju sekcji (rozwinął/zwinął osoba — kliknięcie w summary) i przywracamy po rysowaniu.
    // Lista bez zmian nie jest rysowana od nowa (bez migotania i bez gubienia przewinięcia wewnątrz wiersza).
    const htmlListy = wiersze.map(w => w.html).join('') || `<p class="pusto">${esc(pustaListaZlecenTekst(chipy))}</p>`;
    const listaEl = $('lista-zlecen');
    if (listaEl.dataset.html !== htmlListy) {
      listaEl.innerHTML = htmlListy;
      listaEl.dataset.html = htmlListy;
      przywrocRozwiniecia(listaEl);
      // Zdjęcia ładują się leniwie tylko po faktycznym przerysowaniu (obrazki z zachowanego DOM już mają src).
      ladujZdjeciaLeniwie(listaEl);
    }
    zaznaczZnalezione();
  }

  /* Zdjęcia na liście Zleceń ładują się dopiero, gdy trafią na ekran (IntersectionObserver). Zwinięte „Pozycje” zamkniętej
     checklisty nie mają układu, więc ich zdjęcia ruszają dopiero po rozwinięciu — długa lista Zamkniętych nie ciągnie setek plików. */
  const obserwatorZdjec = typeof IntersectionObserver === 'function' ? new IntersectionObserver(wpisy => {
    for (const w of wpisy) {
      if (!w.isIntersecting) continue;
      const e = w.target;
      obserwatorZdjec.unobserve(e);
      hala.adresPliku(e.dataset.plik).then(u => { e.src = u; }).catch(() => {});
    }
  }, { rootMargin: '200px' }) : null;
  function ladujZdjeciaLeniwie(korzen) {
    for (const e of korzen.querySelectorAll('img[data-plik]')) {
      if (obserwatorZdjec) obserwatorZdjec.observe(e);
      else hala.adresPliku(e.dataset.plik).then(u => { e.src = u; }).catch(() => {});
    }
  }

  // Zlecenia z ostatniego rysowania listy — okno szczegółów pozycji czyta stąd (i odświeża się razem z listą).
  let zlecBufor = new Map();
  const okPoz = $('okno-pozycji-zlecenia');
  let pozOtwarta = null;
  /* Wiersz zlecenia na jednej liście (D60: znacznik rodzaju; zadanie dla kierownika — „▶ Wykonaj”). */
  const zdjeciaWiersza = (ids, etykieta, podpis) => ids.length ? `<div class="zdjecia"><span class="slaby">${esc(etykieta)}</span>${ids.map(id =>
    `<button type="button" class="miniatura" data-zdjecie="${esc(id)}" data-podpis="${esc(podpis)}" aria-label="Powiększ zdjęcie"><img data-plik="${esc(id)}" alt=""></button>`).join('')}</div>` : '';
  /* Akcje wiersza zlecenia (Panel). Audyt 2026-11-09: do ośmiu równorzędnych przycisków w kolumnie (Wykonaj, Przekaż, Rozdziel,
     Zmień, Zleć teraz, Odbierz, Zwróć, Odwołaj, Do zapisanych). Teraz: jedna GŁÓWNA czynność wynikająca ze stanu (Odbierz / Zleć teraz /
     Wykonaj / Przekaż), obok niej najwyżej jedna najczęstsza, reszta pod „Więcej”. Uprawnienia bez zmian — każdy przycisk
     pojawia się pod tym samym warunkiem co dotąd (serwer i tak je egzekwuje). */
  const wiecejOtwarte = new Set();
  function akcjeZlecenia(z, { zrob, kier, stale }) {
    const p = (akcja, napis, klasa, title) => `<button type="button" class="maly${klasa ? ` ${klasa}` : ''}" data-akcja="${akcja}"${title ? ` title="${esc(title)}"` : ''}>${napis}</button>`;
    const glowne = [], obok = [], reszta = [];
    if (zrob) glowne.push(p('wykonaj', `${ik('odtworz', 14)}Wykonaj`, 'glowny'));
    const przekaz = z.dzialania.przekaz ? p('przekaz', 'Przekaż', z.doKierownika ? 'glowny' : '') : '';
    const rozdziel = z.dzialania.rozdziel ? p('rozdziel', 'Rozdziel') : '';
    if (z.doKierownika && przekaz) { glowne.push(przekaz); if (rozdziel) obok.push(rozdziel); } else reszta.push(przekaz, rozdziel);
    const edytuj = kier && z.moznaEdytowac && mozeWyslac('zlecenie.edytowane')
      ? p('edytuj', `${ik('edytuj', 14)}Zmień`, '', 'Popraw treść, opis, pozycje, godziny — także w zapisanym zleceniu') : '';
    if (z.moznaZmienic) { glowne.push(p('zlec-teraz', 'Zleć teraz', 'glowny', 'Zleć od razu — dział dostanie powiadomienie')); reszta.push(p('zmien-plan', 'Zmień')); }
    if (kier && z.doZamkniecia && z.moznaOdebrac) {
      // D87: checklista oddana pozycja po pozycji — „Odbierz całą” (albo resztę, gdy część już odebrana) i „Zwróć całą”.
      const lista = z.status === 'wykonane' && z.mozeOdbieracPozycje;
      glowne.push(p('zamknij', z.status !== 'wykonane' ? 'Zamknij' : lista ? (z.odbior && z.odbior.odebrane > 0 ? 'Odbierz resztę' : 'Odbierz całą') : 'Odbierz', 'glowny'));
      if (z.zwrotDozwolony !== false) obok.push(p('zwroc', lista ? 'Zwróć całą' : 'Zwróć'));
    }
    // Audyt ról 2026-11-09 (D80): „Odwołaj” tylko tam, gdzie kontrakt pozwala roli (zlecenie.anulowane — kierownik zakładu
    // i admin). Lider UR i Kierownik KJ widzieli przycisk, a hub odpowiadał 403.
    const anuluj = z.moznaAnulowac && mozeWyslac('zlecenie.anulowane') ? p('anuluj', 'Odwołaj') : '';
    const zapisz = stale && !z.stale && !z.zaplanowane
      ? p('jako-stale', `${ik('zapisane')}Do zapisanych`, '', 'Zapisz, żeby zlecać je znowu (pojedynczo albo według harmonogramu)') : '';
    // Bez czynności głównej (zlecenie czeka na dział) najczęstsze jest poprawienie treści — „Zmień” zostaje na wierzchu.
    const widoczne = glowne.concat(obok);
    // „Historia” (właściciel 2026-11-18, wzór: „Przebieg” w GK Trasy): oś zdarzeń zlecenia — kto i kiedy zlecił, przyjął, zrobił, odebrał,
    // zwrócił, pozycje, zatwierdzenie automatyczne, odwołanie. Dla tych, którzy odbierają (kierownik zakładu, admin, kierownik działu swój).
    // Na zamkniętych i odwołanych — od razu na wierzchu; przy zleceniach z własnymi przyciskami — pod „Więcej”. Okno to samo co klik w tytuł.
    const historia = kier && z.prawoOdbioru && !z.zaplanowane ? p('historia', 'Historia', '', 'Przebieg zlecenia: kto i kiedy, notatki i zdjęcia') : '';
    if (historia && !z.otwarte && !z.doZamkniecia) widoczne.push(historia); else reszta.push(historia);
    if (!widoczne.length && edytuj) widoczne.push(edytuj); else reszta.push(edytuj);
    const ukryte = reszta.concat(anuluj, zapisz).filter(Boolean);
    if (ukryte.length === 1 && widoczne.length < 2) return widoczne.concat(ukryte).join('');   // dwa widoczne to komplet — reszta pod „Więcej”
    if (!ukryte.length) return widoczne.join('');
    const otwarte = wiecejOtwarte.has(z.id);
    return widoczne.join('') + p('wiecej', `Więcej${ik(otwarte ? 'szewron-gora' : 'szewron-dol', 14).replace('class="ik"', 'class="ik po"')}`, 'wiecej').replace('<button ', `<button aria-expanded="${otwarte}" `)
      + (otwarte ? ukryte.join('') : '');
  }
  /* Przyciski Odbierz / Zwróć przy ZROBIONEJ pozycji (albo znacznik „Odebrana”) — jedno miejsce dla wiersza zlecenia („Do odbioru”) i dla rozwiniętej
     karty obchodu (checklista jeszcze nie oddana, właściciel 2026-11-18). `wolno` = czy ta osoba może teraz odbierać; zwrot ukryty w karencji D88. */
  function przyciskiPozycjiHtml(z, p, wolno) {
    if (!wolno || p.stan === 'czeka') return '';
    return p.odebrana ? `<span class="znacznik ok poz-odebrana" title="${esc(p.odebranaPrzez ? `Odebrana przez ${p.odebranaPrzez}${p.odebranaGodz ? `, ${p.odebranaGodz}` : ''}` : 'Odebrana')}">Odebrana</span>`
      : `<span class="poz-przyciski"><button type="button" class="maly glowny" data-akcja="poz-odbierz" data-pozycja="${esc(p.id)}" title="Odbierz tę pozycję" aria-label="Odbierz: ${esc(p.nazwa)}">Odbierz</button>${z.zwrotDozwolony === false ? '' : `<button type="button" class="maly" data-akcja="poz-zwroc" data-pozycja="${esc(p.id)}" title="Wróci do działu tylko ta pozycja" aria-label="Zwróć: ${esc(p.nazwa)}">Zwróć</button>`}</span>`;
  }
  /* Dowody jednej pozycji checklisty (kto i kiedy, notatka, zdjęcia, powód pominięcia) — tylko odczyt. Ten sam kod w wierszu zlecenia
     (Do odbioru, wgląd w zamknięte) i w podglądzie pozycji w karcie obchodu na Pulpicie. */
  function dowodyPozycji(z, p) {
      const sz = p.szczegoly, zdjecia = zdjeciaWiersza;
      const kto = sz.kto ? esc(sz.kto) : sz.automat ? 'automatycznie (czynność w aplikacji)' : '';
      const kiedy = sz.godz ? `${sz.godz}${sz.data && sz.data !== W.dataKrotka(hala.teraz()) ? `, ${sz.data}` : ''}` : '';
      const linia = [p.stan === 'pominieta' ? 'Pominięta' : 'Zrobiona', kto ? `przez ${kto}` : '', kiedy ? esc(kiedy) : ''].filter(Boolean).join(' ');
      return `<div class="poz-dowody"><span class="slaby">${linia}</span>${p.stan === 'pominieta' ? ` <span class="tekst-alarm">— nie mogę: ${p.powod ? esc(p.powod) : 'bez powodu'}</span>` : ''}${
        sz.notatka ? `<div class="poz-notatka">${ik('notatka', 14)} ${esc(sz.notatka)}</div>` : ''}${
        sz.zdjecia.length ? zdjecia(sz.zdjecia, '', [p.nazwa, z.tytul, sz.kto].filter(Boolean).join(' · ')) : ''}</div>`;
    }
  function wierszZlecenia(z) {
    const kier = mozeWyslac('zlecenie.zamkniete');
    const stale = mozeZapisacStale();
    const zdjecia = zdjeciaWiersza;
    const ja = hala.pracownik && hala.pracownik.id;
    const zrob = z.rodzaj === 'kierownik' && z.otwarte && ((hala.pracownik && hala.pracownik.role) || []).some(r => r === 'kierownik' || r === 'admin')
      && (!z.wykonawcaId || z.wykonawcaId === ja);
    const rodzajNapis = (z.checklista ? `${ik('lista', 14)}Checklista ${z.checklista.gotowe}/${z.checklista.wszystkie}` : W.nazwaRodzaju(z.rodzaj));
    // 2026-10-27: postęp maszyn „▣ 2/7 maszyn” z paskiem — kierownik widzi, ile maszyn jest już sprawdzonych.
    const maszynyPasek = z.maszynyPostep ? `<span class="postep-maszyn${z.maszynyPostep.gotowe === z.maszynyPostep.wszystkie ? ' pelny' : ''}" style="--p:${z.maszynyPostep.proc}%"
      title="Zeskanowane maszyny">${ik('skan', 14)}${z.maszynyPostep.gotowe}/${z.maszynyPostep.wszystkie} maszyn</span>` : '';
    // D67: pozycje checklisty — kierownik widzi, co odhaczone, co pominięte (z powodem) i co zostało.
    // D87 (właściciel 2026-11-17): przy odbiorze (zlecenie „wykonane” z checklistą) każda pozycja ma na wierszu swoje dowody
    // (kto i kiedy, notatka, zdjęcia, powód pominięcia) i własne przyciski Odbierz / Zwróć — odbiór nie wymaga już wchodzenia w okno.
    const ZNAK = { wykonana: '✓', pominieta: '–', czeka: '○' };
    // Do odbioru każda pozycja jest przyciskiem: okno ze szczegółami (zdjęcie, notatka, kto i kiedy) — kierownik ocenia wykonanie.
    const klik = z.doZamkniecia;
    const poz = kier && z.moznaOdebrac && z.mozeOdbieracPozycje && mozeWyslac('zlecenie.pozycja_odebrana');
    // Wgląd w ZAMKNIĘTĄ checklistę (właściciel 2026-11-18): kto i kiedy, notatka, zdjęcia, powód pominięcia — tylko do odczytu, bez
    // Odbierz/Zwróć. Dla tych, którzy odbierają (kierownik zakładu, admin; lider UR i kierownik KJ tylko swój dział — prawoOdbioru); ekran nie.
    const wglad = kier && z.prawoOdbioru && !z.doZamkniecia && z.pozycje.length > 0 && !z.otwarte;
    const pokazDowody = p => p.stan !== 'czeka' && ((klik && poz) || wglad);
    const dowody = p => dowodyPozycji(z, p);
    const przyciskiPozycji = p => przyciskiPozycjiHtml(z, p, poz);
    const liPozycji = p => `<li class="stan-${esc(p.stan)}${p.odebrana ? ' odebrana' : ''}${p.niewykonana ? ' niewykonana' : ''}"><div class="poz-wiersz">${klik ? `<button type="button" class="pozycja-otworz" data-akcja="pozycja" data-pozycja="${esc(p.id)}" title="Szczegóły pozycji: zdjęcie, notatka, kto i kiedy">` : ''}<span aria-hidden="true">${p.odebrana ? ik('ok-kolo', 16) : znakIk(ZNAK[p.stan])}</span> ${p.godz || p.od ? `<span class="slaby">${esc(p.od ? (p.godz ? `${p.od}–${p.godz}` : `od ${p.od}`) : p.godz)}</span> ` : ''}${esc(p.nazwa)}${p.maszynyPostep ? ` <span class="postep-maszyn mala${p.maszynyPostep.gotowe === p.maszynyPostep.wszystkie ? ' pelny' : ''}">${ik('skan', 12)}${p.maszynyPostep.gotowe}/${p.maszynyPostep.wszystkie}</span>` : ''}${p.poprawiona && !p.odebrana ? ' <span class="znacznik info" title="Dział poprawił pozycję po zwrocie">poprawiona</span>' : ''}${p.niewykonana ? ' <span class="znacznik alarm" title="Zmiana zamknięta bez tej pozycji">niewykonana</span>' : ''}${klik ? `${p.szczegoly.zdjecia.length ? ` <span class="pozycja-znacznik" title="Jest zdjęcie">${ik('aparat', 14)}${p.szczegoly.zdjecia.length > 1 ? p.szczegoly.zdjecia.length : ''}</span>` : ''}${p.szczegoly.notatka ? ` <span class="pozycja-znacznik" title="Jest notatka">${ik('notatka', 14)}</span>` : ''}<span class="pozycja-strzalka" aria-hidden="true">${ik('szewron-prawo', 14)}</span></button>` : ''}${przyciskiPozycji(p)}</div>${p.opis ? `<div class="slaby opis-pozycji">${esc(p.opis)}</div>` : ''}${pokazDowody(p) ? dowody(p) : p.powod ? ` <span class="slaby">— pominięte: ${esc(p.powod)}</span>` : ''}${p.uwagi && !pokazDowody(p) ? ` <span class="slaby">— ${esc(p.uwagi)}</span>` : ''}${p.zwrot ? `<div class="poz-zwrot tekst-alarm">${ik('powtarzaj', 14)} Zwrócona do działu${p.zwrot.kto ? ` (${esc(p.zwrot.kto)}${p.zwrot.godz ? `, ${esc(p.zwrot.godz)}` : ''})` : ''}: ${esc(p.zwrot.uwagi)}</div>` : ''}</li>`;
    const naglowekPozycji = z.odbior && z.doZamkniecia && z.status === 'wykonane'
      ? `Pozycje (${z.odbior.odebrane}/${z.odbior.wszystkie} odebrane)` : `Pozycje (${z.checklista ? z.checklista.gotowe : 0}/${z.checklista ? z.checklista.wszystkie : 0})${wglad ? ' — kto, kiedy, notatki i zdjęcia' : ''}`;
    const pozycje = z.pozycje.length ? `<details class="pozycje-zlecenia"${z.doZamkniecia ? ' open' : ''}><summary>${naglowekPozycji}</summary>
      <ul>${z.pozycje.map(liPozycji).join('')}</ul></details>` : '';
    return `
      <article class="zlecenie ${z.pilne ? 'pilne' : ''} ${z.poTerminie ? 'po-terminie' : ''}" data-rodzaj="zlecenie" data-id="${esc(z.id)}">
        <div class="opis">
          <div class="tytul"><button type="button" class="tytul-historii" data-akcja="historia" title="Historia: kto, kiedy, notatki i zdjęcia">${esc(z.tytul)}</button> <span class="slaby">${esc(z.numer)}</span>${z.naZmiane ? ` <span class="znacznik neutral">${esc(z.naZmiane)}</span>` : ''}</div>
          ${window.HalaZlecenia ? window.HalaZlecenia.krokiStatusu(z.status) : ''}
          ${z.postep && z.otwarte ? `<div class="postep-zlecenia">${ik('odtworz', 14)}W toku: ${esc(z.postep.opis)} <span class="slaby">(ostatnio ${esc(z.postep.ostatni)})</span></div>` : ''}
          ${z.czynnosc && z.otwarte ? `<div class="slaby">${z.czynnosc === 'proba' ? ik('proba') + 'zaliczy się samo po próbie jakościowej' : ik('przeglady') + 'zaliczy się samo po przeglądzie UR'}</div>` : ''}
          <div class="szczegoly">
            <span class="znacznik rodzaj-zadania">${z.checklista ? rodzajNapis : esc(rodzajNapis)}</span>
            ${maszynyPasek}${z.okno ? ` <span class="znacznik neutral" title="Wcześniej nie da się go zrobić">${ik('klepsydra', 14)}${esc(z.okno)}</span>` : ''}
            <span class="znacznik ${klasaZlecenia(z.status)}">${esc(z.zaplanowane && z.zaplanowaneNa ? `Zaplanowane na ${z.zaplanowaneNa}` : z.etykieta)}</span>
            ${z.pilne ? '<span class="znacznik alarm">Pilne</span>' : ''}
            ${z.spoznienie ? `<span class="znacznik alarm">${ik('zegar', 14)}${esc(z.spoznienie)}</span>` : ''}
            ${z.niewykonane ? `<span class="znacznik alarm" title="Zmiana zamknięta z niewykonanymi pozycjami — nie przeszły na następną zmianę">Niewykonane: ${z.niewykonane}${z.checklista ? ` z ${z.checklista.wszystkie}` : ''}</span>` : ''}
            <span class="znacznik neutral">${esc(z.dzialNazwa)}</span>
            ${z.liniaNazwa ? `<span>${esc(z.liniaNazwa)}</span>` : ''}${z.maszyna ? `<span>· ${esc(z.maszyna)}</span>` : ''}
            ${z.kto ? `<span>· ${esc(z.kto)}</span>` : z.wykonawca ? `<span>· dla: ${esc(z.wykonawca)}</span>` : ''}
            ${z.doKierownika ? '<span class="znacznik uwaga" title="Kierownik działu je przekaże albo rozdzieli">Do rozdzielenia</span>' : ''}
            ${z.zatwierdzoneAuto ? '<span class="znacznik neutral" title="Zmiana się skończyła — serwer zatwierdził zlecenie sam, bez odbioru kierownika">Zatwierdzone automatycznie</span>' : ''}
            ${z.odbiorZakonczony ? `<span class="znacznik neutral" title="Odbiór zleceń zmianowych jest do końca zmiany + ${Hala.karencjaOdbioru(hala.kontrakt && hala.kontrakt.stale)} min">Tylko do wglądu</span>` : ''}
            ${z.wymagajZdjecia ? `<span title="${z.zdjecia.length ? 'Dział dodał zdjęcie' : 'Dział musi dodać zdjęcie'}">${ik('aparat')}${z.zdjecia.length ? ik('haczyk', 14) : ''}</span>` : ''}${z.wymagajNotatki ? `<span title="${z.notatka ? 'Dział napisał notatkę' : 'Dział musi napisać notatkę'}">${ik('notatka')}${z.notatka ? ik('haczyk', 14) : ''}</span>` : ''}${z.wymagajSkanu ? `<span title="${z.zeskanowano ? 'Dział zeskanował kod QR maszyny' : 'Dział musi zeskanować kod QR maszyny'}">${ik('skan')}${z.zeskanowano ? ik('haczyk', 14) : ''}</span>` : ''}
          </div>
          ${z.opis ? `<div class="slaby tekst-opisu">${esc(z.opis)}</div>` : ''}
          ${pozycje}
          ${/* D76: komu kierownik działu rozdzielił zlecenie i ile już zrobione (✓ zrobione, ▶ w robocie, ✗ nie może, ○ czeka). */
            z.rozdzial ? `<div class="postep-zlecenia">Rozdzielone: <b>${esc(z.rozdzial.tekst)}</b> — ${z.rozdzial.osoby.map(o =>
              `<span class="${o.znak === '✓' ? 'tekst-ok' : o.znak === '✗' ? 'tekst-alarm' : ''}">${znakIk(o.znak)} ${esc(o.kto)}</span>`).join(', ')}</div>` : ''}
          ${/* D76 (właściciel 2026-10-19): wgląd w postęp dla upoważnionych (W.rozdzialZlecenia → czesci) — każda część: stan,
               kiedy zrobiona, notatka, zdjęcia, powód „Nie mogę”. Zwinięte, rozwinięte przy „Do odbioru”. */
            z.rozdzial && z.rozdzial.czesci && z.rozdzial.czesci.length ? `<details class="pozycje-zlecenia czesci-zlecenia"${z.doZamkniecia ? ' open' : ''}><summary>Części — szczegóły</summary>
            <ul>${z.rozdzial.czesci.map(c => `<li class="stan-${c.znak === '✓' ? 'wykonana' : 'czeka'}"><span aria-hidden="true">${znakIk(c.znak)}</span> <b>${esc(c.kto)}</b> <span class="slaby">— ${esc(c.stan)}${c.kiedy ? ` ${esc(c.kiedy)}` : ''}</span>${c.powod ? ` <span class="tekst-alarm">— ${esc(c.powod)}</span>` : ''}${c.notatka ? `<div class="slaby">${ik('notatka', 14)}${esc(c.notatka)}</div>` : ''}${zdjecia(c.zdjecia, '', [z.tytul, c.kto, c.notatka].filter(Boolean).join(' · '))}</li>`).join('')}</ul></details>` : ''}
          ${/* Dowody zwykłego zlecenia (bez pozycji) — jak „Do odbioru”, tylko do odczytu: kto i kiedy zrobił i odebrał (notatka i zdjęcia niżej). */
            kier && z.prawoOdbioru && !z.pozycje.length && z.wykonanoPrzez && !z.otwarte
              ? `<div class="slaby poz-dowody">Zrobione przez ${esc(z.wykonanoPrzez)}${z.wykonanoKiedy ? ` ${esc(z.wykonanoKiedy)}` : ''}${z.odebranoKiedy && z.status === 'zamkniete' ? ` · odebrane ${esc(z.odebranoKiedy)}` : ''}</div>` : ''}
          ${/* „Nie mogę (N)” — kto, kiedy i powód każdego odrzucenia (zwarte, rozwijane); tylko do odczytu dla odbierających, na zamkniętych/odebranych. */
            kier && z.prawoOdbioru && !z.otwarte && z.odrzucenia && z.odrzucenia.length
              ? `<details class="slaby odrzucenia"><summary>Nie mogę (${z.odrzucenia.length})</summary><ul>${z.odrzucenia.map(o => `<li>${esc(o.kto)}${o.kiedy ? `, ${esc(o.kiedy)}` : ''}: ${esc(o.powod)}</li>`).join('')}</ul></details>` : ''}
          ${z.odpowiedz ? `<div class="odpowiedz">${esc(z.odpowiedz)}</div>` : ''}
          ${z.notatka ? `<div class="odpowiedz">${ik('notatka')}${esc(z.notatka)}</div>` : ''}
          ${z.uwagiZwrotu && (z.otwarte || (kier && z.prawoOdbioru)) ? `<div class="slaby">Zwrócone${z.zwrotKiedy && !z.otwarte ? ` (${esc(z.zwrotKiedy)})` : ''}: ${esc(z.uwagiZwrotu)}</div>` : ''}
          ${zdjecia(z.zdjecia, 'Od działu:', [z.tytul, z.kto, z.notatka].filter(Boolean).join(' · '))}${zdjecia(z.zdjeciaKierownika, 'Do zlecenia:', z.tytul)}
        </div>
        ${z.zaplanowane ? `<div class="numer slaby">zleci się<br><b class="tekst-planu">${esc(z.zaplanowaneNa || '—')}</b><br>${esc(z.terminPlanu)}${z.zlecil ? `<br>${esc(z.zlecil)}` : ''}</div>`
          : `<div class="numer slaby">${esc(z.zleconoDzien)} ${esc(z.zlecono)}${z.zlecil ? `<br>${esc(z.zlecil)}` : ''}${z.termin ? `<br><span class="${z.poTerminie ? 'tekst-alarm' : ''}">termin ${esc(z.termin)}</span>` : ''}</div>`}
        <div class="akcje">${akcjeZlecenia(z, { zrob, kier, stale })}</div>
      </article>`;
  }

  /* Okno szczegółów pozycji checklisty przy odbiorze (Zlecenia → „Do odbioru” i Pulpit). Pokazuje to, co dział zostawił przy tej
     pozycji: zdjęcie (powiększa to samo okno co przy zwykłym zleceniu), notatkę, kto i kiedy ją zamknął. D87: z okna odbiera się
     JEDNĄ pozycję („Odbierz pozycję”), zwraca ją do poprawy z powodem („Zwróć pozycję” — wraca tylko ona) albo całą listę
     („Odbierz całą”, „Zwróć całą”). Wszystkie przyciski idą tą samą ścieżką co przyciski na wierszu (akcjaZlecenia): pasek
     „Cofnij”, pytanie o powód, uprawnienia. */
  const ZNAK_POZ = { wykonana: '✓', pominieta: '–', czeka: '○' };
  function rysujPozycje() {
    const z = pozOtwarta && zlecBufor.get(pozOtwarta.zlecenie);
    const p = z && z.pozycje.find(x => x.id === pozOtwarta.pozycja);
    if (!z || !p || !z.doZamkniecia) { if (okPoz.open) okPoz.close(); return; }
    const sz = p.szczegoly;
    const dzis = sz.data === W.dataKrotka(hala.teraz());
    const kiedy = sz.godz ? `${sz.godz}${sz.data && !dzis ? `, ${sz.data}` : ''}` : '';
    const kto = sz.kto ? esc(sz.kto) : sz.automat ? 'automatycznie (czynność w aplikacji)' : '';
    const ktoKiedy = p.niewykonana ? 'Niewykonana — zmiana została zamknięta bez tej pozycji.' : p.stan === 'czeka' ? 'Dział jeszcze jej nie zamknął.'
      : `${p.stan === 'pominieta' ? 'Pominięta' : 'Zrobiona'}${kto ? ` przez ${kto}` : ''}${kiedy ? `, ${esc(kiedy)}` : ''}${!kto && !kiedy ? ' — brak danych, kto i kiedy' : ''}`;
    const kier = mozeWyslac('zlecenie.zamkniete') && z.moznaOdebrac;
    const poz = kier && z.mozeOdbieracPozycje && mozeWyslac('zlecenie.pozycja_odebrana');
    $('t-okno-pozycji-zlecenia').textContent = p.nazwa || 'Pozycja';
    $('pozycja-zlecenia-tresc').innerHTML = `
      <p class="slaby">Zlecenie: ${esc(z.tytul)} · ${esc(z.numer)} · pozycja ${z.pozycje.indexOf(p) + 1} z ${z.pozycje.length}</p>
      <p class="pozycja-kto"><span aria-hidden="true">${znakIk(ZNAK_POZ[p.stan])}</span> ${ktoKiedy}</p>
      ${p.odebrana ? `<p class="pozycja-kto tekst-ok">Odebrana${p.odebranaPrzez ? ` przez ${esc(p.odebranaPrzez)}` : ''}${p.odebranaGodz ? `, ${esc(p.odebranaGodz)}` : ''}</p>` : ''}
      ${p.opis ? `<p class="slaby opis-pozycji">${esc(p.opis)}</p>` : ''}
      ${p.stan === 'pominieta' ? `<div class="pozycja-pole"><b>Powód pominięcia</b><p>${p.powod ? esc(p.powod) : '<span class="slaby">Bez powodu</span>'}</p></div>` : ''}
      <div class="pozycja-pole"><b>${ik('aparat')} Zdjęcie wykonania</b>${sz.zdjecia.length
        ? zdjeciaWiersza(sz.zdjecia, '', [p.nazwa, z.tytul, sz.kto].filter(Boolean).join(' · ')) : '<p class="slaby">Brak zdjęcia</p>'}</div>
      <div class="pozycja-pole"><b>${ik('notatka')} Opis od wykonawcy</b>${sz.notatka ? `<p class="pozycja-notatka">${esc(sz.notatka)}</p>` : '<p class="slaby">Bez opisu</p>'}</div>
      <p class="slaby pozycja-uwaga">${poz ? 'Odbierasz pozycję po pozycji albo całą listę naraz. Zwrot pozycji wraca do działu tylko ją — reszta zostaje odebrana.'
        : 'Odbiór i zwrot dotyczą całego zlecenia.'}</p>`;
    const b = (akcja, napis, klasa) => `<button type="button"${klasa ? ` class="${klasa}"` : ''} data-pozycja-akcja="${akcja}">${napis}</button>`;
    const cala = z.status === 'wykonane' && z.mozeOdbieracPozycje;
    $('pozycja-zlecenia-akcje').innerHTML = !kier ? ''
      : poz ? (p.stan !== 'czeka' && !p.odebrana ? (z.zwrotDozwolony === false ? '' : b('poz-zwroc', 'Zwróć pozycję')) + b('poz-odbierz', 'Odbierz pozycję', 'glowny') : '')
          + (z.zwrotDozwolony === false ? '' : b('zwroc', 'Zwróć całą')) + b('zamknij', z.odbior && z.odbior.odebrane > 0 ? 'Odbierz resztę' : 'Odbierz całą', p.odebrana || p.stan === 'czeka' ? 'glowny' : '')
      : (z.zwrotDozwolony === false ? '' : b('zwroc', cala ? 'Zwróć całą' : 'Zwróć zlecenie')) + b('zamknij', z.status === 'wykonane' ? 'Odbierz zlecenie' : 'Zamknij zlecenie', 'glowny');
    for (const e of $('pozycja-zlecenia-tresc').querySelectorAll('img[data-plik]'))
      hala.adresPliku(e.dataset.plik).then(u => { e.src = u; }).catch(() => {});
  }
  Panel.pokazPozycje = (zlecenie, pozycja) => {
    pozOtwarta = { zlecenie, pozycja };
    rysujPozycje();
    if (pozOtwarta && zlecBufor.get(zlecenie) && !okPoz.open) okPoz.showModal();
  };
  okPoz.addEventListener('click', ev => {
    const foto = ev.target.closest('[data-zdjecie]');
    if (foto) { pokazZdjecie(foto.dataset.zdjecie, foto.dataset.podpis); return; }
    const b = ev.target.closest('[data-pozycja-akcja]');
    if (!b || !pozOtwarta) return;
    // Ta sama ścieżka co przyciski wiersza (akcjaZlecenia: cofnięcie odbioru, pytanie o powód zwrotu, uprawnienia) — okno tylko je skraca.
    const { zlecenie, pozycja } = pozOtwarta;
    const napis = b.textContent.trim();
    okPoz.close();
    akcjaZlecenia({ dataset: { akcja: b.dataset.pozycjaAkcja, pozycja }, textContent: napis }, zlecenie);
  });
  okPoz.addEventListener('close', () => { if (!okPoz.open) pozOtwarta = null; });   // close przychodzi asynchronicznie — nie kasuj, gdy okno otwarto już na nowo

  /* Zdjęcie od działu w dużym rozmiarze — kierownik ocenia wykonanie, a miniatura 64 px nic nie mówi. */
  Panel.pokazZdjecie = (id, podpis) => pokazZdjecie(id, podpis);
  async function pokazZdjecie(id, podpis) {
    $('zdjecie-duze').src = await hala.adresPliku(id);
    $('zdjecie-opis').textContent = podpis || '';
    $('okno-zdjecia').showModal();
  }

  /* Pytanie o tekst (powód zwrotu, odwołania) w oknie aplikacji. null = Anuluj. */
  /* wstecz — napis przycisku „zostaw jak jest” (domyślnie „Anuluj”). Przy pytaniu „Odwołać zlecenie?” samo „Anuluj” stało obok
     „Odwołaj zlecenie” i nie było wiadomo, który kończy, a który wycofuje — tam „Nie”. */
  Panel.zapytajTekst = ({ tytul, etykieta, wymagany, przycisk, wstecz }) => new Promise(ok => {
    const o = $('okno-tekstu'), f = $('formularz-tekstu');
    let wynik = null;
    $('t-okno-tekstu').textContent = tytul;
    $('tekst-etykieta').textContent = etykieta;
    $('tekst-tak').textContent = przycisk || 'OK';
    o.querySelector('[data-zamknij]').textContent = wstecz || 'Anuluj';
    f.tekst.value = '';
    f.querySelector('.blad').hidden = true;
    f.onsubmit = ev => {
      ev.preventDefault();
      const t = f.tekst.value.trim();
      if (wymagany && !t) { const b = f.querySelector('.blad'); b.textContent = 'Napisz to — dział zobaczy ten tekst.'; b.hidden = false; return; }
      wynik = t; o.close();
    };
    o.addEventListener('close', () => ok(wynik), { once: true });
    o.showModal();
    f.tekst.focus();
  });

  // Zdjęcie ze zgłoszenia awarii (D47) — dotknięcie miniatury powiększa, jak w zleceniach.
  $('lista-awarii').addEventListener('click', async ev => {
    const foto = ev.target.closest('[data-zdjecie]');
    if (foto) { pokazZdjecie(foto.dataset.zdjecie, foto.dataset.podpis); return; }
    // R7 (2026-11-09): kierownik zakładu odwołuje awarię (fałszywy alarm). Powód jest obowiązkowy (kontrakt: ≤ 1000 znaków).
    const b = ev.target.closest('[data-akcja="anuluj-awarie"]');
    if (!b) return;
    try {
      const powod = await Panel.zapytajTekst({ tytul: 'Odwołać awarię?', etykieta: 'Dlaczego? (np. fałszywy alarm, zgłoszenie podwójne)',
                                               wymagany: true, przycisk: 'Odwołaj awarię', wstecz: 'Nie' });
      if (powod === null) return;
      if (powod.length > 1000) { komunikat(`Powód za długi: ${powod.length} znaków, najwyżej 1000. Skróć opis.`, 'blad'); return; }
      await hala.zapisz('awaria.anulowana', b.dataset.id, { powod });
      komunikat('Awaria odwołana', 'ok');
    } catch (e) { komunikat(komunikatBledu(e), 'blad'); }
  });
  /* D87: te same wiersze zleceń stoją na liście Zleceń i w kartach obchodów na Pulpicie („Do odbioru”) — jeden obsługiwacz kliknięć. */
  async function obsluzKlikZlecenia(ev) {
    const foto = ev.target.closest('[data-zdjecie]');
    if (foto) { pokazZdjecie(foto.dataset.zdjecie, foto.dataset.podpis); return; }
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    const wiersz = b.closest('[data-id]');
    if (!wiersz) return;
    const id = wiersz.dataset.id;
    if (b.dataset.akcja === 'pozycja') { Panel.pokazPozycje(id, b.dataset.pozycja); return; }
    // D60: zgłoszenie, narzędzia, BHP — ta sama lista, ich przyciski obsługuje zgloszenia.js.
    if (wiersz.dataset.rodzaj && wiersz.dataset.rodzaj !== 'zlecenie') { await Panel.widoki.zgloszenia.akcja(wiersz.dataset.rodzaj, b.dataset.akcja, id, b); return; }
    await akcjaZlecenia(b, id);
  }
  $('lista-zlecen').addEventListener('click', obsluzKlikZlecenia);

  /* Odbiór jednej pozycji checklisty (D87). Po ostatniej odebranej zlecenie zamyka się samo — z paskiem „Cofnij”, jak „Odbierz całą”;
     hub ma siatkę bezpieczeństwa (porzadkuj_odebrane) na wypadek, gdyby to zamknięcie się nie wysłało. */
  async function odbierzPozycje(id, pozycja) {
    await hala.zapisz('zlecenie.pozycja_odebrana', id, { pozycja });
    // Toast sukcesu tylko, gdy stan (ta sama reguła co w hubie) naprawdę przyjął odbiór — inaczej widać tylko komunikat o odrzuceniu zapisu.
    const po = hala.obiekt('zlecenie', id);
    if (!((Hala.odbiorPozycji((po && po.dane) || {}).pozycje[pozycja] || {}).odebrana)) return;
    if (W.czyZamknacPoOdbiorze(hala.obiekt('zlecenie', id))) {
      const { pasek } = await window.HalaDzialania.zapiszZCofnieciem(hala, 'zlecenie.zamkniete', id, {},
        { tekst: 'Odebrane wszystkie pozycje.', komunikat, cofnieto: t => komunikat(t, 'ok') });
      if (!pasek) komunikat('Odebrane wszystkie pozycje', 'ok');
    } else {
      const z = hala.obiekt('zlecenie', id), o = Hala.odbiorPozycji((z && z.dane) || {});
      komunikat(`Pozycja odebrana (${o.odebrane}/${o.wszystkie})`, 'ok');
    }
  }
  /* Zwrot jednej pozycji (D87): powód obowiązkowy, wraca do działu tylko ta pozycja, pozostałe zostają odebrane. */
  async function zwrocPozycje(id, pozycja) {
    const z = hala.obiekt('zlecenie', id);
    const p = ((z && z.dane && z.dane.pozycje) || []).find(x => x.id === pozycja);
    // Checklista jeszcze nie oddana (nowe/przyjęte): zlecenie zostaje u osoby, wraca tylko pozycja — nie „do działu”.
    const otwarta = !!z && z.status !== 'wykonane';
    const uwagi = await Panel.zapytajTekst({ tytul: otwarta ? 'Zwrócić pozycję do poprawy?' : 'Zwrócić pozycję do działu?',
                                             etykieta: `„${(p && p.nazwa) || 'Pozycja'}” — co trzeba poprawić? Wróci tylko ta pozycja${otwarta ? ', zlecenie zostaje u osoby' : ''}.`,
                                             wymagany: true, przycisk: 'Zwróć pozycję' });
    if (!uwagi) return;
    if (uwagi.length > 2000) { komunikat(`Powód za długi: ${uwagi.length} znaków, najwyżej 2000. Skróć opis.`, 'blad'); return; }
    await hala.zapisz('zlecenie.pozycja_zwrocona', id, { pozycja, uwagi });
    const po = hala.obiekt('zlecenie', id);
    if (!((Hala.odbiorPozycji((po && po.dane) || {}).pozycje[pozycja] || {}).zwrocona)) return;       // odrzucone przez regułę — bez toastu sukcesu
    komunikat(otwarta ? 'Pozycja wraca do poprawy — zlecenie zostaje u osoby' : 'Pozycja wróciła do działu — pozostałe zostają odebrane', 'ok');
  }

  async function akcjaZlecenia(b, id) {
    try {
      if (b.dataset.akcja === 'poz-odbierz') { await odbierzPozycje(id, b.dataset.pozycja); return; }
      if (b.dataset.akcja === 'poz-zwroc') { await zwrocPozycje(id, b.dataset.pozycja); return; }
      if (b.dataset.akcja === 'wiecej') { if (wiecejOtwarte.has(id)) wiecejOtwarte.delete(id); else wiecejOtwarte.add(id); narysuj(); return; }
      wiecejOtwarte.delete(id);
      if (b.dataset.akcja === 'wykonaj') { Panel.widoki.zgloszenia.wykonaj(id); return; }
      if (b.dataset.akcja === 'historia') { if (window.HalaDzialania) window.HalaDzialania.historia(hala, 'zlecenie', id); return; }
      if ((b.dataset.akcja === 'przekaz' || b.dataset.akcja === 'rozdziel') && window.HalaDzialania) {
        window.HalaDzialania[b.dataset.akcja](hala, id, { gotowe: t => komunikat(t, 'ok') });
        return;
      }
      if (b.dataset.akcja === 'zamknij') {
        // Etap 6c: bez pytania — pasek „Odebrane. Cofnij” (kilka sekund); starszy serwer bez cofania dostaje zwykły komunikat.
        const { pasek } = await window.HalaDzialania.zapiszZCofnieciem(hala, 'zlecenie.zamkniete', id, {}, { komunikat, cofnieto: t => komunikat(t, 'ok') });
        if (!pasek) komunikat('Odebrane', 'ok');
      }
      if (b.dataset.akcja === 'anuluj') {
        const powod = await Panel.zapytajTekst({ tytul: 'Odwołać zlecenie?', etykieta: 'Dlaczego? (można zostawić puste)', przycisk: 'Odwołaj zlecenie', wstecz: 'Nie' });
        if (powod === null) return;
        const { pasek } = await window.HalaDzialania.zapiszZCofnieciem(hala, 'zlecenie.anulowane', id, powod ? { powod } : {},
          { tekst: 'Zlecenie odwołane.', komunikat, cofnieto: t => komunikat(t, 'ok') });
        if (!pasek) komunikat('Zlecenie odwołane', 'ok');
      }
      if (b.dataset.akcja === 'zmien-plan') Panel.noweZlecenie(null, hala.obiekt('zlecenie', id));
      if (b.dataset.akcja === 'edytuj') Panel.widoki.stale.otworzInstancje(hala.obiekt('zlecenie', id));
      if (b.dataset.akcja === 'zlec-teraz') {
        // D47: zaplanowane zlecenie od razu — jak hub o planowanej chwili (termin „po starcie” liczony od teraz).
        const z = hala.obiekt('zlecenie', id);
        const termin = W.terminAktywacji((z && z.dane) || {}, hala.teraz());
        await hala.zapisz('zlecenie.aktywowane', id, termin ? { termin } : {});
        komunikat('Zlecone — dział dostał powiadomienie', 'ok');
      }
      if (b.dataset.akcja === 'zwroc') {
        const cala = /całą/.test(b.textContent);
        const uwagi = await Panel.zapytajTekst({ tytul: cala ? 'Zwrócić całą listę do działu?' : 'Zwrócić do działu?', etykieta: 'Co jeszcze trzeba zrobić?', wymagany: true, przycisk: cala ? 'Zwróć całą' : 'Zwróć' });
        if (!uwagi) return;
        await hala.zapisz('zlecenie.zwrocone', id, { uwagi });
        komunikat('Zwrócone do działu', 'ok');
      }
      if (b.dataset.akcja === 'jako-stale' && Panel.widoki.stale) Panel.widoki.stale.zZlecenia(hala.obiekt('zlecenie', id));
    } catch (e) { komunikat(komunikatBledu(e), 'blad'); }
  }

  // ------------------------------------------------------------ okna: nowe zlecenie i zgłoszenie awarii

  const opcje = (lista, pusta) => (pusta !== undefined ? `<option value="">${esc(pusta)}</option>` : '')
    + lista.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('');
  const linieLista = () => Object.entries(hala.slowniki.linie || {})
    .sort(([, a], [, b]) => ((a || {}).kolejnosc || 999) - ((b || {}).kolejnosc || 999))
    .map(([k, v]) => [k, (v && v.nazwa) || k]);
  const maszynyLinii = linia => Object.entries(hala.slowniki.maszyny || {}).filter(([, m]) => !linia || (m || {}).linia === linia)
    .map(([k, m]) => [k, `${(m && m.nazwa) || k} (${k})`])
    .sort(([, a], [, b]) => a.localeCompare(b, 'pl', { numeric: true }));
  /* 2026-10-12: w zakładzie z jedną linią (właściciel wyznacza tylko maszyny) pola linii w oknach są zbędne — chowamy
     je (klasa pole-linii); wartość zostaje w ukrytym polu, więc zapis zmienionego zlecenia czy osoby jej nie gubi. */
  /* Skan QR maszyny (2026-10-13) da się wymagać tylko z wybraną maszyną — bez niej pole jest wyłączone i odznaczone. */
  const pokazSkan = f => {
    const jest = !!f.maszyna.value;
    f.wymagaj_skanu.disabled = !jest;
    if (!jest) f.wymagaj_skanu.checked = false;
    f.querySelector('[data-bez-maszyny]').hidden = jest;
  };
  Panel.pokazSkan = pokazSkan;
  const pokazPolaLinii = korzen => {
    const wiele = W.wieleLinii(hala.slowniki);
    for (const el of korzen.querySelectorAll('.pole-linii')) el.hidden = !wiele;
    return wiele;
  };

  function otworzOkno(okno) {
    const f = okno.querySelector('form');
    f.querySelector('.blad').hidden = true;
    okno.showModal();
    [...f.querySelectorAll('input, select, textarea')].find(e => !e.closest('[hidden]'))?.focus();
  }
  for (const okno of document.querySelectorAll('dialog.okno')) {
    okno.querySelector('[data-zamknij]').addEventListener('click', () => okno.close());
    // showModal() daje fokus pierwszemu elementowi, który go przyjmie. W długim oknie, gdzie jedyny taki element to „Zamknij”
    // na samym dole (Role i uprawnienia, Kody QR, dzień w kalendarzu), okno otwierało się przewinięte do końca.
    okno.showModal = function () { HTMLDialogElement.prototype.showModal.call(this); this.scrollTop = 0; };
  }

  /* Pole datetime-local podaje czas ZAKŁADU (Europe/Warsaw), a nie strefę monitora — hub trzyma UTC. */
  function lokalnyNaIso(tekst) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(tekst || '');
    return m ? new Date(Hala.zLokalnego(+m[1], +m[2], +m[3], +m[4], +m[5])).toISOString() : null;
  }

  // Nowe zlecenie: dział → podpowiedź osób z ról tego działu; linia → maszyny tej linii.
  const fz = $('formularz-zlecenia');
  function osobyDzialu(kod) {
    const dzial = ((hala.kontrakt.stale || {}).dzialy || []).find(d => d.kod === kod);
    return (hala.pracownicy || []).filter(p => p.aktywny !== false && dzial && (p.role || []).some(r => dzial.role.includes(r)))
      .map(p => [p.id, p.nazwa]);
  }
  /* „Nowe zlecenie” — puste albo wypełnione zleceniem stałym („Zleć teraz”, D31). Wymagania domyślnie zaznaczone:
     egzekwowanie ma być zasadą, a kierownik odznacza je świadomie. D47: zlecenie zaplanowane wcześniej (zanim UI etap 2
     zabrał „Zaplanuj na” z tego okna — dziś powtarzalne zadania na później to Zlecenia stałe) zmienia się tym samym oknem
     (edycja = obiekt zlecenia; dział, linia i maszyna wtedy bez zmian). */
  function pokazPlan() {
    const plan = !!fz.edycja.value;
    // 2026-10-27 („widok przyszłych zleceń zleconych na kolejne dni”): nowe zlecenie też można zaplanować na wybrany dzień
    // (kierownik zakładu) — dział zobaczy je dopiero wtedy, a kalendarz Zleceń pokazuje je wcześniej.
    const naPozniej = plan || mozeWyslac('zlecenie.zaplanowane');
    $('zlecenie-plan').hidden = !naPozniej;
    $('zlecenie-plan').querySelector('legend').textContent = plan ? 'Zaplanuj na' : 'Zleć dopiero później (opcjonalnie)';
    $('zlecenie-termin').hidden = plan;
    $('zlecenie-od').hidden = plan;
    $('zlecenie-termin-po').hidden = !(naPozniej && (plan || fz.plan_dzien.value));
    const w = W.planZFormularza({ dzien: fz.plan_dzien.value, godzina: fz.plan_godzina.value, zmiany: hala.slowniki.zmiany, teraz: hala.teraz() });
    $('zlecenie-plan-opis').textContent = !naPozniej ? '' : !fz.plan_dzien.value ? (plan ? 'Wybierz dzień startu.' : 'Puste = zlecenie idzie do działu od razu.')
      : w.blad ? w.blad : `Dział zobaczy je ${w.opis} i wtedy dostanie powiadomienie.`;
    fz.querySelector('button[type="submit"]').textContent = plan ? 'Zapisz' : fz.plan_dzien.value ? 'Zaplanuj' : 'Zleć';
  }
  /* D55: „Dla kogo” — osoby działu do zaznaczenia (każda dostaje własne zlecenie); „Na zmianę” — zmiany ze słownika. */
  /* D56: maszyny zlecenia jako lista do zaznaczenia (kilka naraz); ukryte pole „maszyna” = pierwsza zaznaczona (skan, plan). */
  function rysujMaszynyZlecenia(zaznaczone) {
    const el = document.querySelector('#zlecenie-maszyny [data-maszyny]');
    el.innerHTML = maszynyLinii(fz.linia.value).map(([k, n]) => `<label class="zaznacz"><input type="checkbox" name="maszyny" value="${esc(k)}" ${(zaznaczone || []).includes(k) ? 'checked' : ''}> ${esc(n)}</label>`).join('')
      || '<span class="slaby">Brak maszyn — dodaj je w Administracja → Maszyny.</span>';
    synchMaszyny();
  }
  function synchMaszyny() {
    const pierwsza = (fz.querySelector('input[name="maszyny"]:checked') || {}).value || '';
    if (![...fz.maszyna.options].some(o => o.value === pierwsza)) fz.maszyna.insertAdjacentHTML('beforeend', `<option value="${esc(pierwsza)}"></option>`);
    fz.maszyna.value = pierwsza;
    pokazSkan(fz);
  }
  /* D76: działy, którym zalogowana osoba zleca (lider UR i kierownik KJ — tylko swój), i „Też dla działów” (kilka naraz). */
  const roleJa = () => (hala.pracownik && hala.pracownik.role) || [];
  const dzialyZlecajacego = () => W.dzialyDoZlecania(hala.kontrakt.stale || {}, roleJa());
  Panel.dzialyZlecajacego = dzialyZlecajacego;
  function rysujTezDzialy(zaznaczone) {
    const inne = dzialyZlecajacego().filter(d => d.kod !== fz.dzial.value && d.kod !== 'kierownik');
    $('zlecenie-tez').hidden = !inne.length || !!fz.edycja.value;
    $('zlecenie-tez').querySelector('[data-tez]').innerHTML = inne.map(d => `<label class="zaznacz"><input type="checkbox" name="tez_dzialy" value="${esc(d.kod)}" ${(zaznaczone || []).includes(d.kod) ? 'checked' : ''}> ${esc(d.nazwa)}</label>`).join('');
  }
  function rysujOsobyZlecenia(zaznaczone) {
    $('zlecenie-osoby').querySelector('legend').textContent = W.opisDlaKogo(fz.dzial.value, hala.kontrakt.stale || {}, roleJa());
    const el = document.querySelector('#zlecenie-osoby [data-osoby]');
    const osoby = osobyDzialu(fz.dzial.value);
    el.innerHTML = osoby.map(([id, n]) => `<label class="zaznacz"><input type="checkbox" name="osoby" value="${esc(id)}" ${(zaznaczone || []).includes(id) ? 'checked' : ''}> ${esc(n)}${
      Hala.naUrlopie && Hala.naUrlopie(hala.slowniki, id, W.dzienZakladu(hala.teraz())) ? ' <span class="slaby">(urlop)</span>' : ''}</label>`).join('')
      || '<span class="slaby">Nikt w tym dziale nie ma konta.</span>';
  }
  function rysujZmianyZlecenia(wybrana) {
    const zm = hala.slowniki.zmiany || {};
    fz.na_zmiane.innerHTML = '<option value="">teraz (bez zmiany)</option>' + Object.keys(zm).map(nr => {
      const z = W.naZmiane(nr, hala.slowniki, hala.teraz(), fz.dzial.value);
      // Późniejszą zmianę planuje tylko kierownik zakładu (D47) — liderzy UR i kierownicy KJ widzą tylko trwającą.
      return z && (z.biezaca || mozeWyslac('zlecenie.zaplanowane')) ? `<option value="${esc(nr)}">${esc(z.opis)}</option>` : '';
    }).join('');
    fz.na_zmiane.value = wybrana || '';
    opisZmianyZlecenia();
  }
  function opisZmianyZlecenia() {
    const z = fz.na_zmiane.value ? W.naZmiane(fz.na_zmiane.value, hala.slowniki, hala.teraz(), fz.dzial.value) : null;
    const p = $('zlecenie-zmiana-opis');
    p.hidden = !z;
    if (z) p.textContent = z.biezaca ? `Zlecenie od razu, termin — koniec zmiany (${W.godzina(z.koniec)}), chyba że wpiszesz inny.`
      : `Dział zobaczy je o ${W.godzina(z.start)} (start zmiany) i dostanie powiadomienie; termin — koniec zmiany, chyba że wpiszesz inny.`;
  }
  let poZapisieZlecenia = null, wstepneZgloszenie = null;
  Panel.noweZlecenie = (wstepne, edycja, poZapisie) => {
    poZapisieZlecenia = poZapisie || null;
    wstepneZgloszenie = (!edycja && wstepne && wstepne.zgloszenie) || null;
    const w = edycja ? Object.assign({}, edycja.dane, { pilne: (edycja.dane || {}).priorytet === 'pilne' }) : (wstepne || {});
    fz.reset();
    // D76: lider UR i kierownik KJ zlecają tylko swojemu działowi; zmiana zaplanowanego pokazuje dział zlecenia (pole i tak zablokowane).
    const dzialyOkna = edycja ? ((hala.kontrakt.stale || {}).dzialy || []) : dzialyZlecajacego();
    fz.dzial.innerHTML = opcje(dzialyOkna.map(d => [d.kod, d.nazwa]));
    if (w.dzial) fz.dzial.value = w.dzial;
    pokazPolaLinii(fz);
    fz.linia.innerHTML = opcje(linieLista(), '— każda —');
    fz.linia.value = w.linia || '';
    fz.maszyna.innerHTML = opcje(maszynyLinii(fz.linia.value), '— żadna —');
    fz.maszyna.value = w.maszyna || '';
    fz.wykonawca.innerHTML = opcje(osobyDzialu(fz.dzial.value), '— cały dział —');
    fz.wykonawca.value = w.wykonawca || '';
    fz.edycja.value = edycja ? edycja.id : '';
    rysujOsobyZlecenia(w.wykonawca ? [w.wykonawca] : []);
    rysujTezDzialy([]);
    rysujMaszynyZlecenia(Array.isArray(w.maszyny) && w.maszyny.length ? w.maszyny : (w.maszyna ? [w.maszyna] : []));
    fz.czynnosc.value = w.czynnosc || '';
    $('zlecenie-czynnosc').hidden = !w.czynnosc;          // D72: typ czynności tylko, gdy przyszedł z zapisanego
    Panel.podpowiedziCzynnosci();
    $('zlecenie-maszyny').hidden = !!edycja;
    rysujZmianyZlecenia(edycja ? '' : (w.zmiana || ''));
    $('zlecenie-kto').hidden = !edycja;
    $('zlecenie-osoby').hidden = !!edycja;
    $('zlecenie-zmiana').hidden = !!edycja;
    fz.tytul.value = w.tytul || '';
    fz.opis.value = w.opis || '';
    fz.pilne.checked = !!w.pilne;
    if (wstepne) { fz.wymagaj_zdjecia.checked = !!w.wymagaj_zdjecia; fz.wymagaj_notatki.checked = !!w.wymagaj_notatki; fz.wymagaj_skanu.checked = !!w.wymagaj_skanu; }
    fz.termin.value = w.termin ? W.poleCzasu(w.termin) : '';
    fz.od.value = w.od ? W.poleCzasu(w.od) : '';
    fz.stale.value = edycja ? '' : (w.stale || '');
    fz.edycja.value = edycja ? edycja.id : '';
    if (edycja) { fz.wymagaj_zdjecia.checked = !!w.wymagaj_zdjecia; fz.wymagaj_notatki.checked = !!w.wymagaj_notatki; fz.wymagaj_skanu.checked = !!w.wymagaj_skanu; }
    pokazSkan(fz);
    // „Zapisz też na później” — tylko przy całkiem nowym zleceniu (nie z zapisanego, nie przy zmianie planu) i z prawem zapisu.
    $('zlecenie-zapisz-tez').hidden = !!edycja || !!w.stale || !mozeZapisacStale();
    // „Więcej opcji” rozwinięte, gdy coś w środku jest już wypełnione (W.wiecejOpcjiZlecenia) — inaczej zwinięte.
    $('zlecenie-wiecej').open = W.wiecejOpcjiZlecenia(wstepne, !!edycja);
    const start = edycja ? Date.parse(w.zaplanowane_na) : NaN;
    fz.plan_dzien.value = isNaN(start) ? '' : W.poleCzasu(start).slice(0, 10);
    fz.plan_godzina.value = isNaN(start) ? '' : W.poleCzasu(start).slice(11, 16);
    let po = w.termin_po_min;
    if (edycja && !(typeof po === 'number' && po >= 1) && w.termin && !isNaN(start)) {
      // Termin „na sztywno” z planu → ten sam termin jako „po starcie”: przesunięcie dnia startu przesunie i termin.
      const r = Math.round((Date.parse(w.termin) - start) / 60000);
      if (r >= 1) po = r;
    }
    const wDniach = typeof po === 'number' && po >= 1440 && po % 1440 === 0;
    fz.termin_po.value = typeof po === 'number' && po >= 1 ? String(wDniach ? po / 1440 : Math.round(po / 6) / 10) : '';
    fz.termin_po_jedn.value = wDniach ? 'dni' : 'godz';
    for (const pole of ['dzial', 'linia', 'maszyna']) fz[pole].disabled = !!edycja;
    $('zlecenie-zdjecie').hidden = !!edycja;
    $('zlecenie-ze-stalego').hidden = !w.stale || !!edycja;
    $('zlecenie-ze-stalego').textContent = w.stale ? 'Z zapisanego zlecenia — termin dla bieżącej zmiany, możesz go zmienić. Zlecisz je tak ile razy trzeba.' : '';
    $('t-okno-zlecenia').textContent = edycja ? 'Zmień zaplanowane zlecenie' : w.stale ? 'Zleć teraz' : 'Nowe zlecenie';
    pokazPlan();
    otworzOkno($('okno-zlecenia'));
  };
  fz.plan_dzien.addEventListener('input', pokazPlan);
  fz.plan_godzina.addEventListener('input', pokazPlan);
  Panel.opcje = opcje;
  Panel.linieLista = linieLista;
  Panel.maszynyLinii = maszynyLinii;
  Panel.pokazPolaLinii = pokazPolaLinii;
  Panel.osobyDzialu = osobyDzialu;
  /* D72: jedna lista podpowiedzi „Co zrobić” (gotowe czynności + zapisane) dla wszystkich okien zleceń. */
  Panel.podpowiedziCzynnosci = () => {
    $('podpowiedzi-czynnosci').innerHTML = W.podpowiedziCzynnosci(hala.slowniki)
      .map(c => `<option value="${esc(c.nazwa)}">${esc([c.zdjecie ? 'zdjęcie' : '', c.notatka ? 'notatka' : ''].filter(Boolean).join(', '))}</option>`).join('');
  };
  $('nowe-zlecenie').addEventListener('click', () => Panel.noweZlecenie(null));
  $('pulpit-nowe-zlecenie').addEventListener('click', () => Panel.noweZlecenie(null));
  // D72: podpowiedź z zapisanych uzupełnia pusty opis — kierownik opisuje po swojemu, jeśli chce inaczej.
  // Właściciel 2026-10-15: „opisuję (jeśli chcę inaczej niż jak są zapisane) i wybieram, co wymagam” — podpowiedź ustawia
  // swoje domyślne wymagania (📷 📝), kierownik je potem zmienia; tak samo w checkliście i w „Nowe zapisane”.
  fz.tytul.addEventListener('change', () => {
    const c = W.gotowaCzynnosc(fz.tytul.value, hala.slowniki);
    if (!c) return;
    if (c.opis && !fz.opis.value.trim()) fz.opis.value = c.opis;
    fz.wymagaj_zdjecia.checked = !!c.zdjecie; fz.wymagaj_notatki.checked = !!c.notatka;
  });
  // Każde zamknięcie okna zdejmuje blokadę pól edycji — następne „Nowe zlecenie” zaczyna od zwykłego formularza.
  $('okno-zlecenia').addEventListener('close', () => { for (const pole of ['dzial', 'linia', 'maszyna']) fz[pole].disabled = false; });
  fz.dzial.addEventListener('change', () => {
    fz.wykonawca.innerHTML = opcje(osobyDzialu(fz.dzial.value), '— cały dział —');
    rysujOsobyZlecenia([]);
    rysujZmianyZlecenia(fz.na_zmiane.value);          // D104: zmiany Magazynu mają własne godziny
    rysujTezDzialy([...fz.querySelectorAll('input[name="tez_dzialy"]:checked')].map(x => x.value));
  });
  fz.na_zmiane.addEventListener('change', opisZmianyZlecenia);
  $('okno-zlecenia').addEventListener('close', () => { poZapisieZlecenia = null; });
  fz.linia.addEventListener('change', () => { fz.maszyna.innerHTML = opcje(maszynyLinii(fz.linia.value), '— żadna —'); rysujMaszynyZlecenia([]); });
  $('zlecenie-maszyny').addEventListener('change', synchMaszyny);
  fz.maszyna.addEventListener('change', () => pokazSkan(fz));
  fz.addEventListener('submit', W.przyWysylce(async ev => {
    ev.preventDefault();
    const blad = t => { const b = fz.querySelector('.blad'); b.textContent = t; b.hidden = false; };
    const dane = { tytul: fz.tytul.value.trim(), dzial: fz.dzial.value, priorytet: fz.pilne.checked ? 'pilne' : 'normalny',
                   wymagaj_zdjecia: fz.wymagaj_zdjecia.checked, wymagaj_notatki: fz.wymagaj_notatki.checked };
    for (const pole of ['opis', 'linia', 'maszyna', 'wykonawca', 'stale']) if (fz[pole].value.trim()) dane[pole] = fz[pole].value.trim();
    // D56: kilka maszyn — lista `maszyny`, `maszyna` = pierwsza; czynność, która zaliczy zlecenie sama.
    const maszynyZ = [...fz.querySelectorAll('input[name="maszyny"]:checked')].map(x => x.value);
    if (!fz.edycja.value) {
      if (maszynyZ.length) dane.maszyna = maszynyZ[0]; else delete dane.maszyna;
      if (maszynyZ.length > 1) dane.maszyny = maszynyZ;
      if (fz.czynnosc.value) dane.czynnosc = fz.czynnosc.value;
    }
    if (fz.wymagaj_skanu.checked && dane.maszyna) dane.wymagaj_skanu = true;
    const edycja = fz.edycja.value;
    try {
      if (edycja) {
        // Zmiana planu (D47): wszystkie pola do zmiany naraz — puste czyści (null), dział, linia i maszyna zostają.
        const plan = W.planZFormularza({ dzien: fz.plan_dzien.value, godzina: fz.plan_godzina.value, zmiany: hala.slowniki.zmiany, teraz: hala.teraz() });
        if (plan.blad) { blad(plan.blad); return; }
        if (!plan.na) { blad('Wybierz dzień startu — albo zamknij okno i użyj „Zleć teraz”.'); return; }
        const po = W.terminPoZFormularza(fz.termin_po.value, fz.termin_po_jedn.value);
        if (po.blad) { blad(po.blad); return; }
        await hala.zapisz('zlecenie.plan_zmieniony', edycja, { tytul: dane.tytul, opis: dane.opis || '', priorytet: dane.priorytet,
          wykonawca: dane.wykonawca || '', zaplanowane_na: plan.na, termin_po_min: po.min, termin: null,
          wymagaj_zdjecia: dane.wymagaj_zdjecia, wymagaj_notatki: dane.wymagaj_notatki, wymagaj_skanu: fz.wymagaj_skanu.checked });
        $('okno-zlecenia').close();
        komunikat(`Zmienione — zleci się ${plan.opis}`, 'ok');
        return;
      }
      // UI etap 2: nowe zlecenie idzie do działu od razu. D55: „Na zmianę” — trwająca zmiana: od razu z terminem do jej
      // końca; późniejsza: zaplanowane na jej start (dział zobaczy je wtedy). Kilka osób — każda dostaje osobne zlecenie.
      if (fz.termin.value) dane.termin = lokalnyNaIso(fz.termin.value);
      if (fz.od.value) {
        dane.od = lokalnyNaIso(fz.od.value);
        if (dane.termin && Date.parse(dane.od) >= Date.parse(dane.termin)) { blad('„Od kiedy można zrobić” musi być wcześniej niż termin.'); return; }
      }
      delete dane.wykonawca;
      const osoby = [...fz.querySelectorAll('input[name="osoby"]:checked')].map(x => x.value);
      // Zaplanowane na wybrany dzień (zamiast „Na zmianę”): zlecenie.zaplanowane z godziną startu i terminem po starcie.
      let planNa = null, planPo = null;
      if (fz.plan_dzien.value) {
        const pl = W.planZFormularza({ dzien: fz.plan_dzien.value, godzina: fz.plan_godzina.value, zmiany: hala.slowniki.zmiany, teraz: hala.teraz() });
        if (pl.blad) { blad(pl.blad); return; }
        if (!mozeWyslac('zlecenie.zaplanowane')) { blad('Na później zleca tylko Kierownik.'); return; }
        planNa = pl.na;
        planPo = W.terminPoZFormularza(fz.termin_po.value, fz.termin_po_jedn.value);
        if (planPo.blad) { blad(planPo.blad); return; }
      }
      const zm = fz.na_zmiane.value && !planNa ? W.naZmiane(fz.na_zmiane.value, hala.slowniki, hala.teraz(), fz.dzial.value) : null;
      if (zm) dane.zmiana = fz.na_zmiane.value;
      if (wstepneZgloszenie) dane.zgloszenie = wstepneZgloszenie;
      if (zm && !zm.biezaca && !mozeWyslac('zlecenie.zaplanowane')) { blad('Na późniejszą zmianę zleca tylko kierownik — wybierz „teraz”.'); return; }
      if (planNa && dane.termin && Date.parse(dane.termin) <= Date.parse(planNa)) { blad('Termin musi być po dniu i godzinie startu.'); return; }
      const ids = [];
      // D76: „Też dla działów” — każdy dział swoje; zlecenie kierownika zakładu dla UR/KJ bez osoby — do kierownika działu.
      const tez = [...fz.querySelectorAll('input[name="tez_dzialy"]:checked')].map(x => x.value);
      const doZapisu = W.zleceniaDzialow(dane, { dzialy: [dane.dzial, ...tez], osoby, role: roleJa(), stale: hala.kontrakt.stale || {} });
      if (!doZapisu.length) { blad('Ten dział zleca Kierownik — wybierz swój dział.'); return; }
      // Zdjęcia wysyłamy dopiero po wszystkich sprawdzeniach — błąd w formularzu nie zostawia osieroconych plików.
      const zdjeciaIds = await zdjeciaPola(fz.zdjecie);
      for (const d1 of doZapisu) {
        if (zdjeciaIds.length) d1.zdjecia = zdjeciaIds;
        const id = hala.nowyId();
        if (planNa) {
          d1.zaplanowane_na = planNa;
          if (!d1.termin && planPo.min) d1.termin_po_min = planPo.min;
          await hala.zapisz('zlecenie.zaplanowane', id, d1);
        } else if (zm && !zm.biezaca) {
          d1.zaplanowane_na = new Date(zm.start).toISOString();
          if (!d1.termin) d1.termin_po_min = Math.max(1, Math.round((zm.koniec - zm.start) / 60000));
          await hala.zapisz('zlecenie.zaplanowane', id, d1);
        } else {
          if (zm && !d1.termin) d1.termin = new Date(zm.koniec).toISOString();
          await hala.zapisz('zlecenie.utworzone', id, d1);
        }
        ids.push(id);
      }
      if (poZapisieZlecenia) { const fn = poZapisieZlecenia; poZapisieZlecenia = null; await fn(ids[0]); }
      // „Zapisz też na później” (2026-10-13): zapisane POJEDYNCZE — kierownik zleca je znowu „Zleć teraz”, ile razy chce.
      let zapisane = false;
      if (!$('zlecenie-zapisz-tez').hidden && fz.zapisz_tez.checked) {
        const s = W.stalyZFormularza(Object.assign(W.stalyZZlecenia({ dane }), { aktywny: true }), hala.slowniki, null, hala.pracownik.id);
        if (!s.bledy.length) {
          await hala.zapisz('slownik.zapisany', `zlecenia_stale/${s.kod}`, { slownik: 'zlecenia_stale', klucz: s.kod, wartosc: s.wartosc });
          zapisane = true;
        }
      }
      $('okno-zlecenia').close();
      const doKier = doZapisu.some(d => d.do_kierownika);
      komunikat(`${ids.length > 1 ? (tez.length ? `Zlecone ${ids.length} — każdy dział ma swoje` : `Zlecone ${ids.length} osobom`)
        : planNa ? `Zaplanowane — dział zobaczy je ${W.planZFormularza({ dzien: fz.plan_dzien.value, godzina: fz.plan_godzina.value, zmiany: hala.slowniki.zmiany, teraz: 0 }).opis || ''}`
        : zm && !zm.biezaca ? `Zaplanowane — dział zobaczy je o ${W.godzina(zm.start)}` : doKier ? 'Zlecone — kierownik działu je rozdzieli' : 'Zlecone'}${zapisane ? ' i zapisane w „Zapisane”' : ''}`, 'ok');
      Panel.pokazZlecenia('otwarte', 'biezace');
    } catch (e) { blad(komunikatBledu(e)); }
  }));

  // Zgłoszenie awarii z Panelu — trafia do UR jak od lidera (awaria.zgloszona).
  const fa = $('formularz-awarii');
  const MASZYNA_WYBIERZ = '— wybierz —';

  /* Pole zdjęcia (hala.css → .hala-zdjecie): przycisk „📷 Dodaj zdjęcie” zamiast surowego „Wybierz plik / Nie wybrano
     pliku”. Po wyborze — miniatura, nazwa pliku i „Zmień zdjęcie”; reset formularza (nowe okno) wraca do pustego. */
  /* Właściciel 2026-10-26: „opcje dodawania większej ilości zdjęć do zlecenia”. Telefon robi jedno zdjęcie na raz, więc
     pole zbiera je w kolejce (do MAKS_ZDJEC_FORMULARZA, jak przy wykonaniu w zlecenia.js): każde ma miniaturę i ✕. Pliki
     czyta zdjeciaPola(input) przy wysyłce. */
  const MAKS_ZDJEC_FORMULARZA = 9;                    // właściciel 2026-11-24: „Limit to 9 zdjęć”
  const plikiPola = new WeakMap();
  /* D91: maks() — ile nowych zdjęć jeszcze wolno (okno „Zmień” liczy też zdjęcia już dołączone do zlecenia);
     bez opcji — MAKS_ZDJEC_FORMULARZA. Zwraca pokaz(), żeby okno mogło przerysować licznik po zmianie listy obok. */
  function poleZdjecia(input, opcje) {
    const maksNowych = () => Math.max(0, opcje && opcje.maks ? opcje.maks() : MAKS_ZDJEC_FORMULARZA);
    const pole = input.closest('.hala-zdjecie');
    const napis = pole.querySelector('[data-zdjecie-napis]'), img = pole.querySelector('.hala-zdjecie-miniatura');
    const nazwa = pole.querySelector('.hala-zdjecie-nazwa');
    const pusto = { napis: napis.innerHTML, nazwa: nazwa.textContent };
    const pliki = [];
    plikiPola.set(input, pliki);
    const miniatury = document.createElement('div');
    miniatury.className = 'hala-zdjecie-lista';
    pole.appendChild(miniatury);
    let adresy = [];
    img.hidden = true;                                        // jedna duża miniatura zastąpiona listą
    const pokaz = () => {
      adresy.forEach(a => URL.revokeObjectURL(a)); adresy = [];
      miniatury.textContent = '';
      pliki.forEach((plik, i) => {
        const a = URL.createObjectURL(plik); adresy.push(a);
        const poz = document.createElement('span'); poz.className = 'hala-zdjecie-poz';
        const im = document.createElement('img'); im.alt = ''; im.src = a;
        const x = document.createElement('button'); x.type = 'button'; x.className = 'maly'; x.innerHTML = ik('zamknij'); x.setAttribute('aria-label', 'Usuń zdjęcie');
        x.addEventListener('click', () => { pliki.splice(i, 1); pokaz(); });
        poz.append(im, x); miniatury.appendChild(poz);
      });
      const maks = maksNowych();
      if (pliki.length > maks) pliki.length = maks;             // po dołożeniu w liście obok nie przekraczamy limitu
      napis.innerHTML = !maks && !pliki.length ? ik('aparat') + 'Komplet' : !pliki.length ? pusto.napis : pliki.length < maks ? ik('aparat') + 'Dodaj kolejne' : ik('aparat') + 'Komplet';
      nazwa.textContent = pliki.length ? `${pliki.length} z ${maks}` : pusto.nazwa;
      input.disabled = pliki.length >= maks;
    };
    input.addEventListener('change', () => {
      for (const plik of Array.from(input.files || [])) if (pliki.length < maksNowych()) pliki.push(plik);
      input.value = '';                                       // kolejne zdjęcie z tego samego pola nie zastąpi poprzednich
      pokaz();
    });
    // „reset” przychodzi PRZED wyczyszczeniem pól — stan czytamy chwilę później.
    input.form.addEventListener('reset', () => setTimeout(() => { pliki.length = 0; pokaz(); }, 0));
    return pokaz;
  }
  async function zdjeciaPola(input) {
    const ids = [];
    for (const plik of plikiPola.get(input) || []) ids.push(await hala.dodajPlik(plik));
    return ids;
  }
  poleZdjecia(fz.zdjecie);
  poleZdjecia(fa.zdjecie);
  // D91: to samo pole w oknie „Zmień” trwającego zlecenia (stale.js) — tam limit liczy też zdjęcia już dołączone.
  Panel.poleZdjecia = poleZdjecia;
  Panel.zdjeciaPola = zdjeciaPola;
  Panel.MAKS_ZDJEC_FORMULARZA = MAKS_ZDJEC_FORMULARZA;
  $('menu-awaria').addEventListener('click', () => {
    // Bez maszyn w oknie nie ma czego wybrać (przegląd 2026-10-12) — mówimy, gdzie je dodać, zamiast otwierać puste okno.
    const brak = W.brakMaszyn(hala.slowniki);
    if (brak) { komunikat(brak, 'uwaga'); return; }
    fa.reset();
    const wiele = pokazPolaLinii(fa);
    // Schowane pole nie może być wymagane: przeglądarka nie pokaże przy nim błędu, tylko po cichu wstrzyma „Zgłoś do UR”.
    fa.linia.required = wiele;
    fa.linia.innerHTML = opcje(linieLista());
    // Szlif UI 2026-10-12: maszyna NIE jest wybrana z góry — pierwsza z listy po cichu szła do UR, gdy kierownik
    // zapomniał zmienić pole. „— wybierz —” ma pustą wartość, więc required każe wybrać.
    fa.maszyna.innerHTML = opcje(maszynyLinii(wiele ? fa.linia.value : ''), MASZYNA_WYBIERZ);
    pokazDuplikatAwarii();
    // Jedna linia (D51): zatrzymujący priorytet nazywa się „Maszyna stoi” (W.priorytetyDoWyboru).
    fa.priorytet.innerHTML = opcje(W.priorytetyDoWyboru(hala.kontrakt.stale, hala.slowniki));
    otworzOkno($('okno-awarii'));
  });
  fa.linia.addEventListener('change', () => { fa.maszyna.innerHTML = opcje(maszynyLinii(fa.linia.value), MASZYNA_WYBIERZ); pokazDuplikatAwarii(); });
  /* Etap 6b: wybrana maszyna ma już otwartą awarię → „Maszyna X ma już otwartą awarię od 14:20 (Jan K.). Dodać do niej?”.
     Tylko podpowiedź — przycisk wysyłki zostaje i zgłasza osobną awarię; bez danych o awariach (offline) podpowiedzi nie ma. */
  function pokazDuplikatAwarii() {
    const box = $('awaria-duplikat'), wyslij = fa.querySelector('[type="submit"]');
    const a = Hala.otwartaAwariaMaszyny(hala.obiekty('awaria'), fa.maszyna.value);
    const moze = Hala.mozeDopisacDoAwarii(hala.pracownik, hala.kontrakt);
    box.hidden = !a;
    wyslij.textContent = a ? (moze ? 'Zgłoś osobną' : 'Zgłoś mimo to') : 'Zgłoś do Utrzymania Ruchu';
    if (!a) return;
    box.querySelector('p').textContent = Hala.podpowiedzODuplikacie(a, { slowniki: hala.slowniki, pracownicy: hala.pracownicy, mozeDopisac: moze });
    box.querySelector('[data-dopisz]').hidden = !moze;
  }
  fa.maszyna.addEventListener('change', pokazDuplikatAwarii);
  $('awaria-duplikat').querySelector('[data-dopisz]').addEventListener('click', W.przyWysylce(async () => {
    const a = Hala.otwartaAwariaMaszyny(hala.obiekty('awaria'), fa.maszyna.value);
    if (!a) { pokazDuplikatAwarii(); return; }
    try {
      // Notatka i zdjęcia trafiają do otwartej awarii jako notatka dla UR (awaria.komentarz) — bez drugiego licznika przestoju.
      const dane = { tekst: fa.opis.value.trim() || 'Ponowne zgłoszenie — maszyna dalej nie działa.' };
      { const ids = await zdjeciaPola(fa.zdjecie); if (ids.length) dane.zdjecia = ids; }
      await hala.zapisz('awaria.komentarz', a.id, dane);
      $('okno-awarii').close();
      komunikat(`Dodane do otwartej awarii${a.numer ? ' ' + a.numer : ''}`, 'ok');
    } catch (e) { const b = fa.querySelector('.blad'); b.textContent = komunikatBledu(e); b.hidden = false; }
  }));
  fa.addEventListener('submit', W.przyWysylce(async ev => {
    ev.preventDefault();
    if (!fa.maszyna.value) { const b = fa.querySelector('.blad'); b.textContent = 'Wybierz maszynę.'; b.hidden = false; fa.maszyna.focus(); return; }
    try {
      // D47: zdjęcie i notatka nieobowiązkowe — bez nich zgłoszenie idzie tak samo (przestój liczy się od „Zgłoś”).
      // Pole linii schowane (jedna linia) — awaria idzie na linię maszyny.
      const linia = W.wieleLinii(hala.slowniki) ? fa.linia.value : (((hala.slowniki.maszyny || {})[fa.maszyna.value] || {}).linia || fa.linia.value);
      const dane = { linia, maszyna: fa.maszyna.value, priorytet: fa.priorytet.value };
      if (fa.opis.value.trim()) dane.opis = fa.opis.value.trim();
      { const ids = await zdjeciaPola(fa.zdjecie); if (ids.length) dane.zdjecia = ids; }
      await hala.zapisz('awaria.zgloszona', hala.nowyId(), dane);
      $('okno-awarii').close();
      document.querySelector('.zakladki [data-widok="na-zywo"]').click();
    } catch (e) { const b = fa.querySelector('.blad'); b.textContent = komunikatBledu(e); b.hidden = false; }
  }));

  // ------------------------------------------------------------ sygnał: nowe zatrzymanie albo alert jakości

  /* Kierownik nie patrzy na monitor bez przerwy. Nowe zatrzymanie i nowy alert jakości (Quality Alert) migają
     na ekranie przez minutę i (gdy dźwięk jest włączony) dają krótki sygnał. Dźwięk przeglądarka
     wpuszcza dopiero po kliknięciu albo klawiszu na stronie — dlatego przycisk w nagłówku mówi,
     kiedy trzeba kliknąć. Na monitorze w biurze można tego uniknąć flagą Chrome (INSTRUKCJA §7). */
  const KLUCZ_DZWIEKU = 'hala.panel.dzwiek';
  const MIGANIE_MS = 60000;
  let znaneAlarmy = null;
  const swiezeDo = new Map();
  const swieze = klucz => (swiezeDo.get(klucz) || 0) > Date.now();
  const GD = () => window.GKDzwieki;
  const dzwiekGotowy = () => !!GD() && GD().gotowy();

  function dzwiekWlaczony() {
    const zapis = pamiec.czytaj(KLUCZ_DZWIEKU);
    // D55 (właściciel 2026-10-13: „wszyscy mają słyszeć pilne zadania i awarie”) — domyślnie włączony; wyłącza 🔕.
    return zapis === null ? true : zapis === '1';
  }
  // Wspólny zestaw dźwięków (gk-dzwieki.js) słucha przełącznika Panelu — 🔕 wycisza wszystko, także wibrację.
  if (GD()) GD().wlaczony(dzwiekWlaczony);

  function odblokujDzwiek() {
    if (GD()) {
      GD().odblokuj();
      const k = GD().kontekst();
      if (k && !k.panelRysuje) { k.panelRysuje = true; k.addEventListener('statechange', rysujDzwiek); }
    }
    rysujDzwiek();
  }
  for (const zd of ['pointerdown', 'keydown']) document.addEventListener(zd, odblokujDzwiek, { passive: true });

  function rysujDzwiek() {
    const b = $('dzwiek');
    const wl = dzwiekWlaczony();
    const czeka = wl && !dzwiekGotowy();
    // Napis „Włącz dźwięk” w nagłówku został tylko na koncie ekranu (monitor nie ma baneru); reszta ma jeden sposób włączenia — baner.
    const ekranKonto = !!(hala.pracownik && (hala.pracownik.role || []).includes('ekran'));
    b.innerHTML = wl ? (czeka && ekranKonto ? ik('alerty', 18) + '<span class="dz-napis">Włącz dźwięk</span>' : ik('alerty', 18)) : ik('dzwonek-wyl', 18);
    const co = W.wieleLinii(hala.slowniki) ? 'zatrzymaniu linii' : 'zatrzymaniu maszyny';
    b.title = wl ? (czeka ? 'Włącz dźwięk — kliknij, żeby przeglądarka wpuściła dźwięk' : `Dźwięk przy awarii (${co} — mocniej), pilnym zleceniu i alercie jakości włączony`) : 'Dźwięk wyłączony';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(wl));
    b.classList.toggle('czeka', czeka);
    // Wyraźny pasek u góry, gdy dźwięk nie zadziała (wyłączony albo zablokowany przez przeglądarkę). Znika sam, gdy dźwięk działa;
    // konto ekranu (monitor w biurze, nikt nie klika) go nie dostaje — ma „Włącz dźwięk” w nagłówku i flagę Chrome.
    const ekran = !!(hala.pracownik && (hala.pracownik.role || []).includes('ekran'));
    const pasek = $('pasek-dzwieku');
    const pokaz = !ekran && !!hala.pracownik && (!wl || czeka);
    pasek.hidden = !pokaz;
    if (pokaz) pasek.title = wl ? 'Przeglądarka blokuje dźwięk — nie usłyszysz awarii ani pilnych zleceń' : 'Dźwięk wyłączony — nie usłyszysz awarii ani pilnych zleceń';
  }

  $('dzwiek').addEventListener('click', () => {
    // Kliknięcie w „Kliknij” tylko odblokowuje dźwięk; kolejne przełącza.
    if (dzwiekWlaczony() && dzwiekGotowy()) pamiec.zapisz(KLUCZ_DZWIEKU, '0');
    else pamiec.zapisz(KLUCZ_DZWIEKU, '1');
    odblokujDzwiek();
    if (dzwiekWlaczony()) setTimeout(() => { if (GD()) GD().zagraj('pilne'); rysujDzwiek(); }, 150);
  });

  // Przycisk na pasku: jeden klik włącza i odblokowuje (to samo co „Włącz dźwięk” w nagłówku, ale bez przełączania z powrotem na wyłączony).
  $('pasek-dzwieku-wlacz').addEventListener('click', () => {
    pamiec.zapisz(KLUCZ_DZWIEKU, '1');
    odblokujDzwiek();
    setTimeout(() => { if (GD()) GD().zagraj('pilne'); rysujDzwiek(); }, 150);
  });

  // D55: awarie (każda, zatrzymanie — mocniej) i pilne zadania kierownika — dwa różne dźwięki ze wspólnego dzialania.js.
  // D59: także incydent i sytuacja potencjalnie wypadkowa (BHP) — gong jak pilne zadanie.
  if (window.HalaDzwieki) window.HalaDzwieki.sledz(hala, { awarie: true, bhp: true, zlecenia: () => ({ dzial: 'kierownik' }), wlaczony: dzwiekWlaczony });
  // D77: reakcje kierownika przy zadaniach, które ta osoba robi w Panelu („▶ Wykonaj”); konto ekranu — bez (reakcje.js).
  if (window.HalaReakcje) window.HalaReakcje.sledz(hala);
  // D94: „Zamknąć zmianę?” także dla kierownika/menedżera, który sam przyjął checklistę zmianową.
  if (window.HalaZlecenia && window.HalaZlecenia.pilnujZamkniecia) window.HalaZlecenia.pilnujZamkniecia(hala, {});

  function sprawdzAlarmy(wiersze, incydenty) {
    const a = W.noweAlarmy(znaneAlarmy, wiersze, incydenty);
    znaneAlarmy = a.znane;
    if (!a.nowe.length) return;
    for (const n of a.nowe) swiezeDo.set((n.rodzaj === 'alert' ? 'alert|' : 'awaria|') + n.id, Date.now() + MIGANIE_MS);
    // Alert jakości: „pilne” ze wspólnego zestawu (dawny osobny sygnał 2 × 660 Hz był trzecim dźwiękiem spoza D55).
    if (a.nowe.some(n => n.rodzaj === 'alert') && !a.nowe.some(n => n.rodzaj === 'zatrzymanie') && GD()) GD().zagraj('pilne');
    setTimeout(narysuj, MIGANIE_MS + 100);            // zdjąć miganie, gdy nic innego nie przerysuje
  }

  // ------------------------------------------------------------ monitor bez myszy: długie listy

  /* Na monitorze listy przewijają się w swoich sekcjach, a monitor nie ma myszy. Dopisek „jeszcze N”
     mówi, że coś jest niżej, a na koncie ekranu listy same przewijają się stronami co 12 s. */
  const LISTY_JESZCZE = [['lista-awarii', 'jeszcze-awarie', 'awarie']];
  function pokazJeszcze() {
    for (const [lista, znacznik, rodzaj] of LISTY_JESZCZE) {
      const el = $(lista), dol = el.scrollTop + el.clientHeight;
      let n = 0;
      for (const c of el.children) if (c.offsetTop + c.offsetHeight > dol + 4) n++;
      $(znacznik).hidden = !n;
      const napis = W.napisJeszcze(n, rodzaj);
      $(znacznik).innerHTML = napis ? ik('szewron-dol', 14) + esc(napis) : '';   // „▼ Przewiń — jeszcze 2 awarie”
    }
  }
  // UI etap 4: dopisek da się kliknąć — przewija listę o stronę (na komputerze nie każdy szuka kółkiem w karcie).
  for (const [lista, znacznik] of LISTY_JESZCZE)
    $(znacznik).addEventListener('click', () => { const el = $(lista); el.scrollTo({ top: el.scrollTop + el.clientHeight - 40, behavior: 'smooth' }); });
  for (const lista of ['lista-awarii']) $(lista).addEventListener('scroll', pokazJeszcze, { passive: true });

  setInterval(() => {
    if (!document.body.classList.contains('tryb-ekran') || widokAktywny !== 'na-zywo') return;
    for (const el of [$('lista-awarii')]) {
      if (el.scrollHeight - el.clientHeight < 8) { el.scrollTop = 0; continue; }
      const koniec = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      el.scrollTo({ top: koniec ? 0 : el.scrollTop + el.clientHeight - 40, behavior: 'smooth' });
    }
  }, 12000);

  /* Co sekundę tylko liczniki przestoju i zegar — pełne przerysowanie co 20 s,
     bo kolory kafelków zmieniają się z upływem czasu, a nie tylko po zdarzeniu. */
  function tik() {
    if (!hala.zalogowany()) return;
    const teraz = hala.teraz();
    for (const el of document.querySelectorAll('.licznik-przestoju[data-od]')) {
      const od = +el.dataset.od;
      if (od) el.textContent = W.licznik(teraz - od);
    }
    $('zegar').textContent = W.godzina(teraz);
    if (hala.polaczenie.strumien || (hala.polaczenie.dociaganie && !hala.polaczenie.blad)) zapamietajPolaczenie(teraz);
  }
  setInterval(tik, 1000);
  setInterval(narysuj, 20000);

  // ------------------------------------------------------------ pasek połączenia (D15)

  function zapamietajPolaczenie(teraz) {
    ostatnioPolaczony = teraz;
    // Zapis co minutę wystarczy — pasek pokazuje HH:MM.
    if (!zapamietajPolaczenie.ostatni || teraz - zapamietajPolaczenie.ostatni > 60000) {
      zapamietajPolaczenie.ostatni = teraz;
      pamiec.zapisz(KLUCZ_POLACZENIA, String(teraz));
    }
  }

  /* Pasek (KONTRAKT §9): treść liczy W.pasekPolaczenia — „Brak połączenia od…”, „N czeka na wysłanie” (etap 3),
     „Nie wysłane: N” zawsze (D64 — ta sama nazwa co w Liderze, UR i KJ). Dotknięcie otwiera listę z powodami. */
  let kolejka = { oczekuje: 0, moje: 0, odrzucone: 0 };
  function rysujPasek(p) {
    const pasek = $('pasek');
    const zalogowany = hala.zalogowany();
    // Strumień działa albo sieć go zatrzymuje, ale hub odpowiada — dane są świeże, zapamiętujemy chwilę połączenia.
    if (zalogowany && (p.strumien || (p.dociaganie && !p.blad))) zapamietajPolaczenie(hala.teraz());
    // Tuż po otwarciu strumień dopiero się łączy — bez okresu łaski każde odświeżenie strony mignęłoby fałszywym „Brak połączenia”.
    const laska = Date.now() - START < START_LASKA_MS && p.online && !p.blad;
    const w = W.pasekPolaczenia({ zalogowany, polaczenie: p, kolejka, laska, ostatnio: ostatnioPolaczony, teraz: hala.teraz() });
    pasek.className = 'hala-polaczenie ' + w.klasa;
    pasek.textContent = w.tekst;
    pasek.disabled = !(kolejka.odrzucone || kolejka.plikiOdrzucone);            // D64: przycisk jak w Liderze, UR i KJ (dotknięcie — lista „Nie wysłane”)
  }
  $('pasek').addEventListener('click', () => { if (hala.zalogowany() && (kolejka.odrzucone || kolejka.plikiOdrzucone)) pokazOdrzucone(); });

  // ------------------------------------------------------------ monitor w biurze

  /* Monitor nie może gasnąć po 10 minutach. Wake Lock działa tylko na https/localhost
     i przepada po schowaniu karty — dlatego ponawiamy go po powrocie na kartę.     */
  let blokada = null;
  async function trzymajEkranWlaczony(wlacz) {
    if (!wlacz || !('wakeLock' in navigator)) return;
    try { if (!blokada) { blokada = await navigator.wakeLock.request('screen'); blokada.addEventListener('release', () => { blokada = null; }); } }
    catch (e) { /* brak zgody albo http — monitor ustawia się wtedy w systemie */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && document.body.classList.contains('tryb-ekran')) trzymajEkranWlaczony(true);
  });

  // ------------------------------------------------------------ start

  hala.na('zmiana', narysuj);
  hala.na('slowniki', narysuj);
  hala.na('sesja', pokazSesje);
  hala.na('polaczenie', rysujPasek);
  hala.na('kolejka', k => {
    kolejka = k; rysujPasek(hala.polaczenie); rysujPlakietkiAdministracji();
    const konto = document.getElementById('hala-okno-konta');
    if (konto && konto.open) otworzKonto();          // „Czeka na wysłanie” i „Odrzucone” na bieżąco
    if ($('okno-odrzucone').open) rysujOdrzucone();
  });
  /* Hub nie przyjął zapisu kierownika (np. brak uprawnień, zła maszyna) albo przyjął bez zmiany stanu (ktoś był
     szybszy) — wcześniej Panel milczał i kierownik myślał, że zlecenie poszło. */
  hala.na('odrzucone', ({ zdarzenie, powod }) => komunikat(`${zdarzenie ? nazwaTypu(zdarzenie.typ) : 'Zdjęcie'} — serwer nie przyjął: ${powod}`, 'blad'));
  hala.na('ucieto', ({ typ, pokazano, razem }) => komunikat(`Pokazano ${pokazano} z ${razem} (${typ}) — zawęź filtry, bo liczby mogą być niepełne.`, 'uwaga'));
  hala.na('konflikt', ({ zdarzenie, uwaga }) => komunikat(`${zdarzenie ? nazwaTypu(zdarzenie.typ) : 'Zapis'}: ${uwaga} — sprawdź, co jest teraz.`, 'uwaga'));

  await hala.start();
  pokazSesje();
  rysujPasek(hala.polaczenie);
  // Po okresie łaski pasek musi powiedzieć prawdę, nawet gdy hala.js nie zgłosił jeszcze żadnej zmiany.
  setTimeout(() => rysujPasek(hala.polaczenie), START_LASKA_MS + 500);

  // Nowa wersja: odświeża sama (monitor w biurze z sesją 90 dni też), ale nie przy otwartym oknie (aktualizacja.js).
  HalaAktualizacja.pilnuj({ komunikat });
})();
