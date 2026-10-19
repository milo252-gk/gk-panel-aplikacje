/* Panel Kierownika — rysowanie i połączenie z hubem.

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
  const Panel = window.Panel = { hala, W, $, esc, widoki: {}, narysuj: () => narysuj(), komunikatBledu: e => komunikatBledu(e) };

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
    // Zapis tylko tam, gdzie kontrakt pozwala roli (konto ekranu i kierownik KJ nie zgłaszają awarii).
    $('menu-awaria').hidden = !(z && mozeWyslac('awaria.zgloszona'));
    $('nowe-zlecenie').hidden = !(z && mozeWyslac('zlecenie.utworzone'));
    // D49: kierownik zakładu, kierownik UR i KJ też — ale tylko „Pracownicy” ze swoim zespołem (administracja.js).
    // UI etap 3: Checklisty są częścią Administracji — menu widać też samemu edytującemu szablony.
    $('menu-administracja').hidden = !(z && W.czesciAdministracji(Panel.dostepAdministracji()).length);
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
    'awaria.zgloszona': 'Zgłoszenie awarii', 'zlecenie.utworzone': 'Nowe zlecenie', 'zlecenie.zamkniete': 'Zamknięcie zlecenia',
    'zlecenie.zwrocone': 'Zwrot zlecenia', 'zlecenie.anulowane': 'Anulowanie zlecenia', 'zlecenie.wykonane': 'Wykonanie zlecenia',
    'slownik.zapisany': 'Zmiana w administracji', 'slownik.usuniety': 'Usunięcie w administracji',
  };
  function nazwaTypu(typ) {
    if (NAZWY_TYPOW[typ]) return NAZWY_TYPOW[typ];
    const spec = hala.kontrakt && hala.kontrakt.zdarzenia[typ];
    return (spec && spec.opis) ? spec.opis.split(/[.—(]/)[0].trim() : typ;
  }

  /* „Moje konto” — JEDNO okno z Liderem, UR i KJ (../wspolne/konto.js → HalaKonto.mojeKonto, STYL-GK §3 runda 2):
     ten sam wygląd, szerokość 440 px, Wygląd, Zmień PIN/hasło, Dane w tym urządzeniu, „wersja X”, Zamknij + Wyloguj.
     Rzecz Panelu (dodatki): Powiadomienia — push, gdy zlecenie tej osoby jest po terminie (wspólna sekcja z Liderem).
     Monitor w biurze (konto ekranu) nikomu nic nie zleca — nie ma czego mu przypominać, nie ma też Zmień PIN. */
  function otworzKonto() {
    const ekran = (hala.pracownik && hala.pracownik.role || []).includes('ekran');
    HalaKonto.mojeKonto(hala, {
      aplikacja: 'panel', komunikat, wyloguj, odrzucone: pokazOdrzucone,
      dodatki: ekran ? null : el => {
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
    $('lista-odrzuconych').innerHTML = lista.length ? `<p class="slaby">Wprowadź je jeszcze raz, poprawiając to, co mówi powód, a potem usuń z listy.</p>
      <ul class="lista-odrzuconych">${lista.map(o => `<li><b>${esc(nazwaTypu(o.zd.typ))}</b> <span class="slaby">${esc(W.dataKrotka(o.zd.czas))} ${esc(W.godzina(o.zd.czas))}</span>
        <div class="blad">${esc(o.powod)}</div>
        <button type="button" class="maly" data-usun-odrzucone="${esc(o.id)}">Usuń z listy</button></li>`).join('')}</ul>` : '<p class="slaby">Brak.</p>';
  }
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
    return { admin: role.includes('admin'), zespol: HalaZespol.zarzadzaKontami(role, (hala.kontrakt || {}).stale),
             szablony: role.some(r => zapisSzablonow.includes(r)), urlopy: role.some(r => zapisUrlopow.includes(r)) };
  };

  const WIDOKI = ['na-zywo', 'zlecenia', 'wskazniki', 'raporty', 'administracja', 'wiecej'];
  for (const b of document.querySelectorAll('.zakladki button[data-widok]')) {
    b.addEventListener('click', () => {
      widokAktywny = b.dataset.widok;
      for (const x of document.querySelectorAll('.zakladki button[data-widok]')) x.setAttribute('aria-selected', String(x === b));
      for (const w of WIDOKI) $(w).hidden = widokAktywny !== w;
      narysuj();
    });
  }

  // D74 „☰ Więcej”: przejście do widoku (klik w jego zakładkę — także schowaną na telefonie) albo „Nie wysłane”.
  for (const b of document.querySelectorAll('#wiecej [data-idz]')) {
    b.addEventListener('click', () => {
      if (b.dataset.idz === 'niewyslane') { pokazOdrzucone(); return; }
      const z = document.querySelector(`.zakladki [data-widok="${b.dataset.idz}"]`);
      if (z) z.click();
    });
  }
  function rysujWiecej() {
    $('wiecej-administracja').hidden = $('menu-administracja').hidden;
    const n = (kolejka && kolejka.odrzucone) || 0;
    $('wiecej-niewyslane').textContent = n ? `Nie wysłane (${n})` : 'Nie wysłane';
    $('plakietka-wiecej').hidden = !n;
    $('plakietka-wiecej').textContent = n ? String(n) : '';
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
      ? `<b>${esc(z.nazwa)}</b> <span>${esc(z.od)}–${esc(z.do)}</span> <span class="slaby">zostało ${esc(Hala.formatCzasu(z.zostaloMs))}</span>`
      : '<span class="slaby">Poza zmianą</span>';                // D64: ten sam tekst co Lider, UR i KJ
    $('zegar').textContent = W.godzina(d.teraz);
  }

  function rysujKafelki(d, awarie) {
    const kafelki = W.obchody({
      slowniki: d.slowniki, pracownicy: d.pracownicy, zmiana: d.zmiana, teraz: d.teraz, stale: d.stale,
      prog: hala.ustawienie('prog_zolty_min', 30), awarie,
      zmianaLinii: klucz => hala.obiekt('zmiana_linii', klucz), zlecenia: hala.obiekty('zlecenie'),
    });
    $('kafelki').innerHTML = kafelki.map(k => {
      const proc = k.wszystkie ? Math.round(k.zrobione * 100 / k.wszystkie) : 0;
      const stan = k.zamknieta ? 'Raport wysłany' : k.wirtualna ? 'Nie otwarta' : (k.lider || 'Otwarta');
      const opoz = k.opoznione.slice(0, 3).map(p => `<li>${esc(p.godz)} ${esc(p.nazwa)}</li>`).join('')
        + (k.opoznione.length > 3 ? `<li>+${k.opoznione.length - 3} więcej</li>` : '');
      // UI etap 4: zatrzymana maszyna na „zielonym” (obchód na czas) kafelku myliła — kafelek dostaje czerwony obrys (.stoi).
      return `<article class="kafelek kolor-${esc(k.kolor)}${k.zatrzymania ? ' stoi' : ''}">
        <header><h3>${esc(k.naglowek)}</h3>${k.zatrzymania ? `<span class="znacznik alarm">⛔ Stoi: ${k.zatrzymania}</span>` : k.awarie ? `<span class="znacznik uwaga">Awarie: ${k.awarie}</span>` : ''}</header>
        <div class="stan-zmiany ${k.wirtualna ? 'nieotwarta' : ''}">${esc(stan)}</div>
        <div class="postep" role="progressbar" aria-valuemin="0" aria-valuemax="${k.wszystkie}" aria-valuenow="${k.zrobione}"><span style="width:${proc}%"></span></div>
        <div class="liczby"><b>${k.zrobione}/${k.wszystkie}</b>${k.najblizsza ? ` <span>Następne ${esc(k.najblizsza.godz)} · ${esc(k.najblizsza.nazwa)}</span>` : k.wszystkie ? ' <span>Wszystko zrobione</span>' : ' <span>Brak planu</span>'}</div>
        ${k.opoznione.length ? `<ul class="opoznione" aria-label="Opóźnione">${opoz}</ul>` : ''}
      </article>`;
    }).join('') || `<p class="pusto">${esc(W.pustyObchod(d.slowniki, d.zmiana))}</p>`;
    return kafelki;
  }

  function rysujAwarie(wiersze) {
    const stoi = wiersze.filter(w => w.zatrzymuje).length;
    $('licznik-awarii').innerHTML = wiersze.length
      ? `${stoi ? `<span class="znacznik alarm">Zatrzymane: ${stoi}</span> ` : ''}<span class="znacznik info">Aktywne: ${wiersze.length}</span>` : '';
    $('lista-awarii').innerHTML = wiersze.map(w => `
      <article class="awaria ${w.zatrzymuje ? 'zatrzymanie' : ''} ${w.czeka && w.czeka.alarm ? 'alarm-potwierdzenia' : ''} ${swieze('awaria|' + w.id) ? 'nowy' : ''}">
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
          ${w.zdjecia.length ? `<div class="zdjecia">${w.zdjecia.map(id => `<button type="button" class="miniatura" data-zdjecie="${esc(id)}" data-podpis="${esc([w.maszynaNazwa, w.opis].filter(Boolean).join(' · '))}" aria-label="Powiększ zdjęcie awarii"><img data-plik="${esc(id)}" alt=""></button>`).join('')}</div>` : ''}
        </div>
        <div class="numer slaby">${esc(w.numer)}<br> od ${esc(w.godzZgloszenia)}</div>
      </article>`).join('') || '<p class="pusto ok">Brak aktywnych awarii</p>';
    for (const e of $('lista-awarii').querySelectorAll('img[data-plik]'))
      hala.adresPliku(e.dataset.plik).then(u => { e.src = u; }).catch(() => {});
  }

  function statusKlasa(status) {
    return { zgloszona: 'alarm', przyjeta: 'uwaga', w_trakcie: 'info', wstrzymana: 'neutral', oczekuje_potwierdzenia: 'ok' }[status] || 'neutral';
  }

  /* D59: otwarte zgłoszenia BHP stoją na górze sekcji „Jakość i BHP” (każdej zmiany, aż kierownik je zamknie) —
     dotknięcie otwiera listę ⛑ BHP w Zleceniach. */
  function rysujJakosc(w, bhp) {
    const ileBhp = (bhp || []).length;
    $('licznik-jakosci').innerHTML = w.lista.length + ileBhp ? `<span class="znacznik alarm">${w.lista.length + ileBhp}</span>` : '';
    $('lista-jakosci').innerHTML = (bhp || []).map(b => `
      <button type="button" class="incydent bhp" data-bhp="${esc(b.id)}">
        <div class="rodzaj"><span class="znacznik ${b.pilne ? 'alarm' : 'uwaga'}">BHP: ${esc(b.rodzajNazwa)}</span> <span class="slaby">${esc(b.numer)} · ${esc(b.kiedyOpis)}</span></div>
        <div class="tytul">${[b.liniaNazwa, b.stanowiskoNazwa].filter(Boolean).map(x => `<b>${esc(x)}</b>`).join(' · ')}${b.kto ? ` <span class="slaby">${esc(b.kto)}</span>` : ''}</div>
        ${b.opis ? `<div class="slaby tekst-opisu">${esc(b.opis)}</div>` : ''}
      </button>`).join('') + (w.lista.map(i => i.rodzaj === 'alert' ? `
      <article class="incydent alert ${swieze('alert|' + i.id) ? 'nowy' : ''}">
        <div class="rodzaj"><span class="znacznik alarm">Alert jakości</span> <span class="slaby">${esc(i.numer)} · ${esc(i.godz)}</span></div>
        <div class="tytul"><b>${esc(i.tytul)}</b></div>
        <div class="potwierdzenia ${i.brakuje.length ? '' : 'komplet'}">Potwierdzenia liderów ${i.potwierdzone.length}/${i.linie.length}${i.brakujeNazwy.length ? ` <span class="slaby">— brak: ${esc(i.brakujeNazwy.join(', '))}</span>` : ''}</div>
      </article>` : `
      <article class="incydent partia">
        <div class="rodzaj"><span class="znacznik uwaga">Partia brakowa</span> <span class="slaby">${esc(i.numer)} · ${esc(i.godz)}</span></div>
        <div class="tytul">${[i.liniaNazwa ? `<b>${esc(i.liniaNazwa)}</b>` : '', i.wyrob ? esc(i.wyrob) : '', i.ilosc !== null ? `${esc(i.ilosc)} szt.` : '']
          .filter(Boolean).join(' · ')}${i.zlecenie ? ` <span class="slaby">zlec. ${esc(i.zlecenie)}</span>` : ''}</div>
        ${i.powod ? `<div class="slaby tekst-opisu">${esc(i.powod)}</div>` : ''}
      </article>`).join('') || (ileBhp ? '' : '<p class="pusto ok">Brak incydentów na tej zmianie</p>'));
    const wcz = [];
    if (w.wczesniej.alerty) wcz.push(`alerty: ${w.wczesniej.alerty}`);
    if (w.wczesniej.partie) wcz.push(`partie brakowe: ${w.wczesniej.partie}`);
    $('wczesniej').hidden = !wcz.length;
    $('wczesniej').textContent = wcz.length ? `Nadal aktywne z wcześniejszych zmian — ${wcz.join(', ')}` : '';
    // UI etap 4: pusta Jakość nie zabiera pół ekranu — staje cienkim paskiem, a Awarie dostają całą szerokość (panel.css).
    $('na-zywo').classList.toggle('bez-jakosci', !w.lista.length && !wcz.length && !ileBhp);
  }
  $('lista-jakosci').addEventListener('click', ev => { if (ev.target.closest('[data-bhp]')) Panel.pokazZlecenia('do-zamkniecia', 'biezace', 'bhp'); });

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
          ${r.bhp ? `<dt>BHP</dt><dd>${esc(r.bhp)} ${r.bhp === 1 ? 'zgłoszenie' : r.bhp < 5 ? 'zgłoszenia' : 'zgłoszeń'} <button type="button" class="maly" data-bhp-raport>⛑ Zobacz zgłoszenia BHP</button></dd>` : ''}
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
                               stale: d.stale, teraz: d.teraz, alarmMin: hala.ustawienie('alarm_potwierdzenia_min', 30) });
    const jakosc = W.incydenty({ partie: hala.obiekty('partia'), alerty: hala.obiekty('alert'), slowniki: d.slowniki, zmiana: d.zmiana, teraz: d.teraz });
    sprawdzAlarmy(wiersze, jakosc.lista);
  }

  let zaplanowane = false;
  function narysuj() {
    try { rysujWiecej(); } catch (e) { /* kolejka jeszcze nieznana przy pierwszym rysowaniu */ }
    if (document.hidden) sygnalWTle();
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
                                 teraz: d.teraz, alarmMin: hala.ustawienie('alarm_potwierdzenia_min', 30) });
      const jakosc = W.incydenty({ partie: hala.obiekty('partia'), alerty: hala.obiekty('alert'), slowniki: d.slowniki, zmiana: d.zmiana, teraz: d.teraz });
      sprawdzAlarmy(wiersze, jakosc.lista);
      const bhpOtwarte = W.bhpLista({ zgloszenia: hala.obiekty('bhp_zgloszenie', g => g.status === 'otwarte'), slowniki: d.slowniki,
                                      pracownicy: d.pracownicy, stale: d.stale });
      const zlecenia = hala.obiekty('zlecenie');
      const doZamkniecia = zlecenia.filter(z => z.status === 'wykonane' || z.status === 'odrzucone').length;
      $('plakietka-zlecen').hidden = !doZamkniecia;
      $('plakietka-zlecen').textContent = doZamkniecia || '';
      if (widokAktywny === 'na-zywo') {
        const linie = rysujKafelki(d, awarie);
        rysujAwarie(wiersze);
        rysujJakosc(jakosc, bhpOtwarte);
        rysujLiczby(W.kafelki({ kafelkiLinii: linie, wierszeAwarii: wiersze, incydenty: jakosc, zlecenia, teraz: d.teraz, bezRaportu: bezRaportu(d),
                                slowniki: d.slowniki, bhp: bhpOtwarte.length, urzadzenia }));
        pokazJeszcze();
      } else if (widokAktywny === 'zlecenia') {
        rysujZlecenia(d, zlecenia);
        if ($('okno-wykonania').open && Panel.widoki.zgloszenia) Panel.widoki.zgloszenia.odswiezWykonanie();
      } else if (widokAktywny === 'wskazniki') {
        if (Panel.widoki.wskazniki) Panel.widoki.wskazniki.rysuj(d);
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
    $('kafelki-liczb').innerHTML = w.spokoj ? '<p class="spokoj">✓ Wszystko w porządku — nic nie stoi, nic nie czeka</p>' : w.kafelki.map(k => `
      <button type="button" class="${esc(k.klasa)}" data-kafel="${esc(k.kod)}"><span class="etykieta">${esc(k.etykieta)}</span><b>${k.liczba}</b>${k.dopisek ? `<span class="dopisek">${esc(k.dopisek)}</span>` : ''}</button>`).join('');
  }
  // Kafelki zleceń prowadzą do zleceń — „po terminie” do „W toku”, gdzie spóźnione stoją na górze z ⏰ (UI etap 2:
  // osobnego filtra „Po terminie” już nie ma). Reszta jest na tym samym ekranie.
  $('kafelki-liczb').addEventListener('click', ev => {
    const k = ev.target.closest('[data-kafel]');
    if (k && k.dataset.kafel === 'zlecenia') Panel.pokazZlecenia(null, 'biezace');
    if (k && k.dataset.kafel === 'po-terminie') Panel.pokazZlecenia('otwarte', 'biezace');
    if (k && k.dataset.kafel === 'bez-raportu') document.querySelector('.zakladki [data-widok="raporty"]').click();
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
      <p class="slaby">Zapisy wyślą się, gdy ta osoba zaloguje się na swoim telefonie. Na wspólnym telefonie wyśle je też kierownik albo administrator: Moje konto → „Zapisy innych osób” → Wyślij.</p>
      <div class="hala-okno-przyciski"><button type="submit" class="glowny">Zamknij</button></div></form>`;
    if (!d.open) d.showModal();
  }

  // ------------------------------------------------------------ zlecenia dla działów (kierownik)

  let filtrZlecen = 'otwarte', trybZlecen = 'biezace';
  /* Wybór filtra, trybu (biezace | stale) i rodzaju z zewnątrz (kafelek „Zlecenia po terminie” na pulpicie, push, BHP).
     Rodzaj podany — tylko ten (np. BHP); bez rodzaju — filtr rodzaju czyszczony, żeby kafelek pokazał wszystko. */
  Panel.pokazZlecenia = (filtr, tryb, rodzaj) => {
    if (filtr) filtrZlecen = filtr;
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
    if (!hala.zalogowany() || !['#zlecenia', '#administracja', '#checklisty', '#bhp'].includes(location.hash)) return;
    const adres = location.hash;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* stary adres zostanie — bez szkody */ }
    // #administracja = dotknięty alarm huba (etap 2: kopia, adres na Pages, token, miejsce) — tylko administrator ma ten widok.
    // Nad częściami świeci czerwona wstęga, a przy każdym alarmie „Pokaż” prowadzi tam, gdzie się go naprawia.
    if (adres === '#administracja') { if (!$('menu-administracja').hidden) $('menu-administracja').click(); return; }
    // #checklisty — dawna pozycja menu (UI etap 3: część Administracji); stare zakładki i linki dalej trafiają w szablony.
    if (adres === '#checklisty') {
      // D60: szablony checklisty lidera są w Zlecenia → 💾 Zapisane (stare zakładki i linki trafiają tam).
      Panel.pokazZlecenia(null, 'stale');
      return;
    }
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

  function klasaZlecenia(status) {
    return { nowe: 'info', przyjete: 'info', wykonane: 'ok', odrzucone: 'uwaga', zamkniete: 'neutral', anulowane: 'neutral',
             przepadlo: 'alarm', zaplanowane: 'neutral' }[status] || 'neutral';
  }

  const PUSTE_ZLECENIA = { otwarte: 'Żadne zadanie nie jest w toku', 'do-zamkniecia': 'Nic nie czeka na przyjęcie',
                           zamkniete: 'Brak zamkniętych zadań w wybranym okresie' };

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
  const filtry = { dzial: '', osoba: '', okres: 2, spoznione: false, rodzaj: '' };
  let starsze = { od: null, lista: [], wczytuje: false };
  async function wczytajStarsze(dni) {
    const od = new Date(hala.teraz() - dni * 86400000).toISOString();
    if (starsze.wczytuje || (starsze.od && starsze.od <= od)) return;
    starsze.wczytuje = true;
    try {
      const w = await hala.pobierzStan('zlecenie', { aktywne: 0, od, limit: 5000 });
      starsze = { od, lista: w.obiekty || [], wczytuje: false };
    } catch (e) { starsze.wczytuje = false; komunikat('Starszych zleceń nie wczytano — ' + komunikatBledu(e), 'uwaga'); }
    narysuj();
  }
  Panel.zleceniaOkresu = async dni => { await wczytajStarsze(dni); return starsze.lista; };
  function listaZOkresem(lista) {
    if (filtrZlecen !== 'zamkniete' || filtry.okres <= 2 || !starsze.od) return lista;
    const od = hala.teraz() - filtry.okres * 86400000;
    const jest = new Set(lista.map(z => z.id));
    return lista.concat(starsze.lista.filter(z => !jest.has(z.id) && Date.parse(z.zmieniono || (z.dane || {}).czas_zlecenia) >= od));
  }
  /* D76: kierownik UR/KJ widzi domyślnie zlecenia swojego działu i to, co sam zlecił („Mój dział i moje”); „wszystkie”
     działa jak dotąd — to filtr, nie blokada. Domyślny ustawiamy raz na zalogowaną osobę. */
  const mojeDzialy = () => { const z = Hala.dzialyKierownika(roleJa(), (hala.kontrakt.stale || {}).dzialy || []); return z && z.length ? z : null; };
  function rysujFiltry(d) {
    const f = $('filtry-zlecen');
    const dz = (d.stale && d.stale.dzialy) || [];
    const moje = mojeDzialy(), ja = hala.pracownik && hala.pracownik.id;
    if (filtry.dlaOsoby !== ja) { filtry.dlaOsoby = ja; filtry.dzial = moje ? W.MOJE_DZIALY : ''; }
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
    $('filtr-okres').hidden = filtrZlecen !== 'zamkniete';
    const noweR = '<option value="">wszystkie</option>' + W.RODZAJE_ZADAN.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');
    if (f.rodzaj.dataset.html !== noweR) { f.rodzaj.innerHTML = noweR; f.rodzaj.dataset.html = noweR; }
    f.rodzaj.value = filtry.rodzaj;
  }
  $('filtry-zlecen').addEventListener('change', ev => {
    const f = $('filtry-zlecen');
    Object.assign(filtry, { dzial: f.dzial.value, osoba: f.osoba.value, okres: +f.okres.value || 2, spoznione: f.spoznione.checked,
                            rodzaj: f.rodzaj.value });
    if (ev.target === f.okres && filtry.okres > 2) wczytajStarsze(filtry.okres);
    narysuj();
  });
  $('filtry-zlecen').addEventListener('submit', ev => ev.preventDefault());

  function rysujZlecenia(d, lista) {
    for (const b of document.querySelectorAll('#tryb-zlecen [data-tryb]')) b.setAttribute('aria-pressed', String(b.dataset.tryb === trybZlecen));
    for (const b of document.querySelectorAll('#filtr-zlecen [data-filtr]')) b.setAttribute('aria-pressed', String(b.dataset.filtr === filtrZlecen));
    // D60 (właściciel 2026-10-14: „oznaczaj rodzaje zleceń, a nie dziel je na kategorie — wszystko z tego jest zadaniem”):
    // dwa tryby — Zadania (jedna lista wszystkich rodzajów, znacznik + filtr „Rodzaj”) i Zapisane (wszystkie wzory, także
    // checklisty lidera, wcześniej w Administracji). Zgłoszenia, narzędzia i BHP — wiersze z zgloszenia.js.
    const ZG = Panel.widoki.zgloszenia;
    for (const t of ['biezace', 'stale', 'kalendarz']) $(`zlecenia-${t}`).hidden = trybZlecen !== t;
    $('nowe-zlecenie').hidden = !(trybZlecen === 'biezace' && mozeWyslac('zlecenie.utworzone'));
    $('nowe-stale').hidden = !(trybZlecen === 'stale' && mozeZapisacStale());
    $('nowa-checklista-zlecen').hidden = $('nowe-stale').hidden;
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
                                  teraz: d.teraz, filtr: filtrZlecen, ja: hala.pracownik }).map(z => Object.assign(z, { html: wierszZlecenia(z) }));
    const inne = ZG ? ZG.wiersze(d, filtrZlecen) : [];
    const fm = Object.assign({}, filtry, { mojeDzialy: mojeDzialy() || [], ja: hala.pracownik && hala.pracownik.id });
    const wiersze = W.polaczZadania(W.filtrujZlecenia(zlecenia, fm), W.filtrujZlecenia(inne, fm));
    // Liczby na chipach — kierownik widzi od razu, ile jest w toku (⏰ ile po terminie) i ile czeka na niego (także
    // zgłoszenia, narzędzia i BHP). Po terminie, przepadłe (D35) i pilne BHP — chip na czerwono.
    for (const c of W.chipyZlecen(lista, d.teraz, ZG ? ZG.liczby() : null)) {
      const b = document.querySelector(`#filtr-zlecen [data-filtr="${c.filtr}"]`);
      if (!b) continue;
      if (b.textContent !== c.napis) b.textContent = c.napis;
      b.classList.toggle('spoznione', c.alarm);
    }
    $('lista-zlecen').innerHTML = wiersze.map(w => w.html).join('') || `<p class="pusto">${PUSTE_ZLECENIA[filtrZlecen] || 'Brak zadań'}</p>`;
    // Zdjęcie: lokalny plik (jeszcze w kolejce) albo z huba — adres daje hala.js.
    for (const e of $('lista-zlecen').querySelectorAll('img[data-plik]'))
      hala.adresPliku(e.dataset.plik).then(u => { e.src = u; }).catch(() => {});
  }

  /* Wiersz zlecenia na jednej liście (D60: znacznik rodzaju; zadanie dla kierownika — „▶ Wykonaj”). */
  const zdjeciaWiersza = (ids, etykieta, podpis) => ids.length ? `<div class="zdjecia"><span class="slaby">${esc(etykieta)}</span>${ids.map(id =>
    `<button type="button" class="miniatura" data-zdjecie="${esc(id)}" data-podpis="${esc(podpis)}" aria-label="Powiększ zdjęcie"><img data-plik="${esc(id)}" alt=""></button>`).join('')}</div>` : '';
  function wierszZlecenia(z) {
    const kier = mozeWyslac('zlecenie.zamkniete');
    const stale = mozeZapisacStale();
    const zdjecia = zdjeciaWiersza;
    const ja = hala.pracownik && hala.pracownik.id;
    const zrob = z.rodzaj === 'kierownik' && z.otwarte && ((hala.pracownik && hala.pracownik.role) || []).some(r => r === 'kierownik' || r === 'admin')
      && (!z.wykonawcaId || z.wykonawcaId === ja);
    const rodzajNapis = z.checklista ? `☑ Checklista ${z.checklista.gotowe}/${z.checklista.wszystkie}` : W.nazwaRodzaju(z.rodzaj);
    // D67: pozycje checklisty — kierownik widzi, co odhaczone, co pominięte (z powodem) i co zostało.
    const ZNAK = { wykonana: '✓', pominieta: '–', czeka: '○' };
    const pozycje = z.pozycje.length ? `<details class="pozycje-zlecenia"${z.doZamkniecia ? ' open' : ''}><summary>Pozycje (${z.checklista.gotowe}/${z.checklista.wszystkie})</summary>
      <ul>${z.pozycje.map(p => `<li class="stan-${esc(p.stan)}"><span aria-hidden="true">${ZNAK[p.stan]}</span> ${p.godz ? `<span class="slaby">${esc(p.godz)}</span> ` : ''}${esc(p.nazwa)}${p.powod ? ` <span class="slaby">— pominięte: ${esc(p.powod)}</span>` : ''}${p.uwagi ? ` <span class="slaby">— ${esc(p.uwagi)}</span>` : ''}</li>`).join('')}</ul></details>` : '';
    return `
      <article class="zlecenie ${z.pilne ? 'pilne' : ''} ${z.poTerminie ? 'po-terminie' : ''}" data-rodzaj="zlecenie" data-id="${esc(z.id)}">
        <div class="opis">
          <div class="tytul"><button type="button" class="tytul-historii" data-akcja="historia" title="Historia: kto, kiedy, notatki i zdjęcia">${esc(z.tytul)}</button> <span class="slaby">${esc(z.numer)}</span>${z.naZmiane ? ` <span class="znacznik neutral">${esc(z.naZmiane)}</span>` : ''}</div>
          ${window.HalaZlecenia ? window.HalaZlecenia.krokiStatusu(z.status) : ''}
          ${z.postep && z.otwarte ? `<div class="postep-zlecenia">▶ W toku: ${esc(z.postep.opis)} <span class="slaby">(ostatnio ${esc(z.postep.ostatni)})</span></div>` : ''}
          ${z.czynnosc && z.otwarte ? `<div class="slaby">${z.czynnosc === 'proba' ? '🔬 zaliczy się samo po próbie jakościowej' : '🔧 zaliczy się samo po przeglądzie UR'}</div>` : ''}
          <div class="szczegoly">
            <span class="znacznik rodzaj-zadania">${esc(rodzajNapis)}</span>
            <span class="znacznik ${klasaZlecenia(z.status)}">${esc(z.zaplanowane && z.zaplanowaneNa ? `Zaplanowane na ${z.zaplanowaneNa}` : z.etykieta)}</span>
            ${z.pilne ? '<span class="znacznik alarm">Pilne</span>' : ''}
            ${z.spoznienie ? `<span class="znacznik alarm">${esc(z.spoznienie)}</span>` : ''}
            <span class="znacznik neutral">${esc(z.dzialNazwa)}</span>
            ${z.liniaNazwa ? `<span>${esc(z.liniaNazwa)}</span>` : ''}${z.maszyna ? `<span>· ${esc(z.maszyna)}</span>` : ''}
            ${z.kto ? `<span>· ${esc(z.kto)}</span>` : z.wykonawca ? `<span>· dla: ${esc(z.wykonawca)}</span>` : ''}
            ${z.doKierownika ? '<span class="znacznik uwaga" title="Kierownik działu je przekaże albo rozdzieli">Do rozdzielenia</span>' : ''}
            ${z.wymagajZdjecia ? `<span title="${z.zdjecia.length ? 'Dział dodał zdjęcie' : 'Dział musi dodać zdjęcie'}">📷${z.zdjecia.length ? '✓' : ''}</span>` : ''}${z.wymagajNotatki ? `<span title="${z.notatka ? 'Dział napisał notatkę' : 'Dział musi napisać notatkę'}">📝${z.notatka ? '✓' : ''}</span>` : ''}${z.wymagajSkanu ? `<span title="${z.zeskanowano ? 'Dział zeskanował kod QR maszyny' : 'Dział musi zeskanować kod QR maszyny'}">▣${z.zeskanowano ? '✓' : ''}</span>` : ''}
          </div>
          ${z.opis ? `<div class="slaby tekst-opisu">${esc(z.opis)}</div>` : ''}
          ${pozycje}
          ${/* D76: komu kierownik działu rozdzielił zlecenie i ile już zrobione (✓ zrobione, ▶ w robocie, ✗ nie może, ○ czeka). */
            z.rozdzial ? `<div class="postep-zlecenia">Rozdzielone: <b>${esc(z.rozdzial.tekst)}</b> — ${z.rozdzial.osoby.map(o =>
              `<span class="${o.znak === '✓' ? 'tekst-ok' : o.znak === '✗' ? 'tekst-alarm' : ''}">${esc(o.znak)} ${esc(o.kto)}</span>`).join(', ')}</div>` : ''}
          ${/* D76 (właściciel 2026-10-19): wgląd w postęp dla upoważnionych (W.rozdzialZlecenia → czesci) — każda część: stan,
               kiedy zrobiona, notatka, zdjęcia, powód „Nie mogę”. Zwinięte, rozwinięte przy „Do przyjęcia”. */
            z.rozdzial && z.rozdzial.czesci && z.rozdzial.czesci.length ? `<details class="pozycje-zlecenia czesci-zlecenia"${z.doZamkniecia ? ' open' : ''}><summary>Części — szczegóły</summary>
            <ul>${z.rozdzial.czesci.map(c => `<li class="stan-${c.znak === '✓' ? 'wykonana' : 'czeka'}"><span aria-hidden="true">${esc(c.znak)}</span> <b>${esc(c.kto)}</b> <span class="slaby">— ${esc(c.stan)}${c.kiedy ? ` ${esc(c.kiedy)}` : ''}</span>${c.powod ? ` <span class="tekst-alarm">— ${esc(c.powod)}</span>` : ''}${c.notatka ? `<div class="slaby">📝 ${esc(c.notatka)}</div>` : ''}${zdjecia(c.zdjecia, '', [z.tytul, c.kto, c.notatka].filter(Boolean).join(' · '))}</li>`).join('')}</ul></details>` : ''}
          ${z.odpowiedz ? `<div class="odpowiedz">${esc(z.odpowiedz)}</div>` : ''}
          ${z.notatka ? `<div class="odpowiedz">📝 ${esc(z.notatka)}</div>` : ''}
          ${z.uwagiZwrotu && z.otwarte ? `<div class="slaby">Zwrócone: ${esc(z.uwagiZwrotu)}</div>` : ''}
          ${zdjecia(z.zdjecia, 'Od działu:', [z.tytul, z.kto, z.notatka].filter(Boolean).join(' · '))}${zdjecia(z.zdjeciaKierownika, 'Do zlecenia:', z.tytul)}
        </div>
        ${z.zaplanowane ? `<div class="numer slaby">zleci się<br><b class="tekst-planu">${esc(z.zaplanowaneNa || '—')}</b><br>${esc(z.terminPlanu)}${z.zlecil ? `<br>${esc(z.zlecil)}` : ''}</div>`
          : `<div class="numer slaby">${esc(z.zleconoDzien)} ${esc(z.zlecono)}${z.zlecil ? `<br>${esc(z.zlecil)}` : ''}${z.termin ? `<br><span class="${z.poTerminie ? 'tekst-alarm' : ''}">termin ${esc(z.termin)}</span>` : ''}</div>`}
        <div class="akcje">
          ${zrob ? '<button type="button" class="maly glowny" data-akcja="wykonaj">▶ Wykonaj</button>' : ''}
          ${/* D76: kierownik działu (UR, KJ) w Panelu — te same okna co w aplikacji działu (dzialania.js). */
            z.dzialania.przekaz ? `<button type="button" class="maly${z.doKierownika ? ' glowny' : ''}" data-akcja="przekaz">Przekaż</button>` : ''}
          ${z.dzialania.rozdziel ? '<button type="button" class="maly" data-akcja="rozdziel">Rozdziel</button>' : ''}
          ${z.moznaZmienic ? `<button type="button" class="maly" data-akcja="zmien-plan">Zmień</button>
            <button type="button" class="maly glowny" data-akcja="zlec-teraz" title="Zleć od razu — dział dostanie powiadomienie">Zleć teraz</button>` : ''}
          ${kier && z.doZamkniecia ? `<button type="button" class="maly glowny" data-akcja="zamknij">${z.status === 'wykonane' ? 'Przyjmij' : 'Zamknij'}</button>
            <button type="button" class="maly" data-akcja="zwroc">Zwróć</button>` : ''}
          ${kier && z.moznaAnulowac ? '<button type="button" class="maly" data-akcja="anuluj">Anuluj</button>' : ''}
          ${stale && !z.stale && !z.zaplanowane ? '<button type="button" class="maly" data-akcja="jako-stale" title="Zapisz, żeby zlecać je znowu (pojedynczo albo według harmonogramu)">💾 Zapisz</button>' : ''}
        </div>
      </article>`;
  }

  /* Zdjęcie od działu w dużym rozmiarze — kierownik ocenia wykonanie, a miniatura 64 px nic nie mówi. */
  Panel.pokazZdjecie = (id, podpis) => pokazZdjecie(id, podpis);
  async function pokazZdjecie(id, podpis) {
    $('zdjecie-duze').src = await hala.adresPliku(id);
    $('zdjecie-opis').textContent = podpis || '';
    $('okno-zdjecia').showModal();
  }

  /* Pytanie o tekst (powód zwrotu, anulowania) w oknie aplikacji. null = Anuluj. */
  Panel.zapytajTekst = ({ tytul, etykieta, wymagany, przycisk }) => new Promise(ok => {
    const o = $('okno-tekstu'), f = $('formularz-tekstu');
    let wynik = null;
    $('t-okno-tekstu').textContent = tytul;
    $('tekst-etykieta').textContent = etykieta;
    $('tekst-tak').textContent = przycisk || 'OK';
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
  $('lista-awarii').addEventListener('click', ev => {
    const foto = ev.target.closest('[data-zdjecie]');
    if (foto) pokazZdjecie(foto.dataset.zdjecie, foto.dataset.podpis);
  });
  $('lista-zlecen').addEventListener('click', async ev => {
    const foto = ev.target.closest('[data-zdjecie]');
    if (foto) { pokazZdjecie(foto.dataset.zdjecie, foto.dataset.podpis); return; }
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    const wiersz = b.closest('[data-id]');
    const id = wiersz.dataset.id;
    // D60: zgłoszenie, narzędzia, BHP — ta sama lista, ich przyciski obsługuje zgloszenia.js.
    if (wiersz.dataset.rodzaj && wiersz.dataset.rodzaj !== 'zlecenie') { await Panel.widoki.zgloszenia.akcja(wiersz.dataset.rodzaj, b.dataset.akcja, id, b); return; }
    try {
      if (b.dataset.akcja === 'wykonaj') { Panel.widoki.zgloszenia.wykonaj(id); return; }
      if (b.dataset.akcja === 'historia') { if (window.HalaDzialania) window.HalaDzialania.historia(hala, 'zlecenie', id); return; }
      if ((b.dataset.akcja === 'przekaz' || b.dataset.akcja === 'rozdziel') && window.HalaDzialania) {
        window.HalaDzialania[b.dataset.akcja](hala, id, { gotowe: t => komunikat(t, 'ok') });
        return;
      }
      if (b.dataset.akcja === 'zamknij') {
        await hala.zapisz('zlecenie.zamkniete', id, {});
        komunikat(b.textContent.trim() === 'Przyjmij' ? 'Przyjęte — zlecenie zamknięte' : 'Zamknięte', 'ok');
      }
      if (b.dataset.akcja === 'anuluj') {
        const powod = await Panel.zapytajTekst({ tytul: 'Anulować zlecenie?', etykieta: 'Dlaczego? (można zostawić puste)', przycisk: 'Anuluj zlecenie' });
        if (powod === null) return;
        await hala.zapisz('zlecenie.anulowane', id, powod ? { powod } : {});
      }
      if (b.dataset.akcja === 'zmien-plan') Panel.noweZlecenie(null, hala.obiekt('zlecenie', id));
      if (b.dataset.akcja === 'zlec-teraz') {
        // D47: zaplanowane zlecenie od razu — jak hub o planowanej chwili (termin „po starcie” liczony od teraz).
        const z = hala.obiekt('zlecenie', id);
        const termin = W.terminAktywacji((z && z.dane) || {}, hala.teraz());
        await hala.zapisz('zlecenie.aktywowane', id, termin ? { termin } : {});
        komunikat('Zlecone — dział dostał powiadomienie', 'ok');
      }
      if (b.dataset.akcja === 'zwroc') {
        const uwagi = await Panel.zapytajTekst({ tytul: 'Zwrócić do działu?', etykieta: 'Co jeszcze trzeba zrobić?', wymagany: true, przycisk: 'Zwróć' });
        if (!uwagi) return;
        await hala.zapisz('zlecenie.zwrocone', id, { uwagi });
        komunikat('Zwrócone do działu', 'ok');
      }
      if (b.dataset.akcja === 'jako-stale' && Panel.widoki.stale) Panel.widoki.stale.zZlecenia(hala.obiekt('zlecenie', id));
    } catch (e) { komunikat(komunikatBledu(e), 'blad'); }
  });

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
    $('zlecenie-plan').hidden = !plan;
    $('zlecenie-termin').hidden = plan;
    $('zlecenie-termin-po').hidden = !plan;
    const w = W.planZFormularza({ dzien: fz.plan_dzien.value, godzina: fz.plan_godzina.value, zmiany: hala.slowniki.zmiany, teraz: hala.teraz() });
    $('zlecenie-plan-opis').textContent = !plan ? '' : !fz.plan_dzien.value ? 'Wybierz dzień startu.'
      : w.blad ? w.blad : `Dział zobaczy je ${w.opis} i wtedy dostanie powiadomienie.`;
    fz.querySelector('button[type="submit"]').textContent = plan ? 'Zapisz zmiany' : 'Zleć';
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
  /* D76: działy, którym zalogowana osoba zleca (kierownik UR/KJ — tylko swój), i „Też dla działów” (kilka naraz). */
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
      const z = W.naZmiane(nr, hala.slowniki, hala.teraz());
      // Późniejszą zmianę planuje tylko kierownik zakładu (D47) — kierownicy UR i KJ widzą tylko trwającą.
      return z && (z.biezaca || mozeWyslac('zlecenie.zaplanowane')) ? `<option value="${esc(nr)}">${esc(z.opis)}</option>` : '';
    }).join('');
    fz.na_zmiane.value = wybrana || '';
    opisZmianyZlecenia();
  }
  function opisZmianyZlecenia() {
    const z = fz.na_zmiane.value ? W.naZmiane(fz.na_zmiane.value, hala.slowniki, hala.teraz()) : null;
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
    // D76: kierownik UR/KJ zleca tylko swojemu działowi; zmiana zaplanowanego pokazuje dział zlecenia (pole i tak zablokowane).
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
    $('zlecenie-ze-stalego').textContent = w.stale ? '🔁 Z zapisanego zlecenia — termin dla bieżącej zmiany, możesz go zmienić. Zlecisz je tak ile razy trzeba.' : '';
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
      .map(c => `<option value="${esc(c.nazwa)}">${esc([c.zdjecie ? '📷' : '', c.notatka ? '📝' : ''].join(''))}</option>`).join('');
  };
  $('nowe-zlecenie').addEventListener('click', () => Panel.noweZlecenie(null));
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
      if (fz.zdjecie.files[0]) dane.zdjecia = [await hala.dodajPlik(fz.zdjecie.files[0])];
      delete dane.wykonawca;
      const osoby = [...fz.querySelectorAll('input[name="osoby"]:checked')].map(x => x.value);
      const zm = fz.na_zmiane.value ? W.naZmiane(fz.na_zmiane.value, hala.slowniki, hala.teraz()) : null;
      if (zm) dane.zmiana = fz.na_zmiane.value;
      if (wstepneZgloszenie) dane.zgloszenie = wstepneZgloszenie;
      if (zm && !zm.biezaca && !mozeWyslac('zlecenie.zaplanowane')) { blad('Na późniejszą zmianę zleca tylko kierownik — wybierz „teraz”.'); return; }
      const ids = [];
      // D76: „Też dla działów” — każdy dział swoje; zlecenie kierownika zakładu dla UR/KJ bez osoby — do kierownika działu.
      const tez = [...fz.querySelectorAll('input[name="tez_dzialy"]:checked')].map(x => x.value);
      const doZapisu = W.zleceniaDzialow(dane, { dzialy: [dane.dzial, ...tez], osoby, role: roleJa(), stale: hala.kontrakt.stale || {} });
      if (!doZapisu.length) { blad('Ten dział zleca kierownik zakładu — wybierz swój dział.'); return; }
      for (const d1 of doZapisu) {
        const id = hala.nowyId();
        if (zm && !zm.biezaca) {
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
        : zm && !zm.biezaca ? `Zaplanowane — dział zobaczy je o ${W.godzina(zm.start)}` : doKier ? 'Zlecone — kierownik działu je rozdzieli' : 'Zlecone'}${zapisane ? ' i zapisane w „💾 Zapisane”' : ''}`, 'ok');
      Panel.pokazZlecenia('otwarte', 'biezace');
    } catch (e) { blad(komunikatBledu(e)); }
  }));

  // Zgłoszenie awarii z Panelu — trafia do UR jak od lidera (awaria.zgloszona).
  const fa = $('formularz-awarii');
  const MASZYNA_WYBIERZ = '— wybierz —';

  /* Pole zdjęcia (hala.css → .hala-zdjecie): przycisk „📷 Dodaj zdjęcie” zamiast surowego „Wybierz plik / Nie wybrano
     pliku”. Po wyborze — miniatura, nazwa pliku i „Zmień zdjęcie”; reset formularza (nowe okno) wraca do pustego. */
  function poleZdjecia(input) {
    const pole = input.closest('.hala-zdjecie');
    const napis = pole.querySelector('[data-zdjecie-napis]'), img = pole.querySelector('.hala-zdjecie-miniatura');
    const nazwa = pole.querySelector('.hala-zdjecie-nazwa');
    const pusto = { napis: napis.textContent, nazwa: nazwa.textContent };
    let adres = null;
    const pokaz = () => {
      const plik = input.files && input.files[0];
      if (adres) { URL.revokeObjectURL(adres); adres = null; }
      if (plik) adres = URL.createObjectURL(plik);
      img.hidden = !adres;
      if (adres) img.src = adres; else img.removeAttribute('src');
      napis.textContent = plik ? '📷 Zmień zdjęcie' : pusto.napis;
      nazwa.textContent = plik ? plik.name : pusto.nazwa;
    };
    input.addEventListener('change', pokaz);
    // „reset” przychodzi PRZED wyczyszczeniem pól — stan czytamy chwilę później.
    input.form.addEventListener('reset', () => setTimeout(pokaz, 0));
  }
  poleZdjecia(fz.zdjecie);
  poleZdjecia(fa.zdjecie);
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
    // Jedna linia (D51): zatrzymujący priorytet nazywa się „Maszyna stoi” (W.priorytetyDoWyboru).
    fa.priorytet.innerHTML = opcje(W.priorytetyDoWyboru(hala.kontrakt.stale, hala.slowniki));
    otworzOkno($('okno-awarii'));
  });
  fa.linia.addEventListener('change', () => { fa.maszyna.innerHTML = opcje(maszynyLinii(fa.linia.value), MASZYNA_WYBIERZ); });
  fa.addEventListener('submit', W.przyWysylce(async ev => {
    ev.preventDefault();
    if (!fa.maszyna.value) { const b = fa.querySelector('.blad'); b.textContent = 'Wybierz maszynę.'; b.hidden = false; fa.maszyna.focus(); return; }
    try {
      // D47: zdjęcie i notatka nieobowiązkowe — bez nich zgłoszenie idzie tak samo (przestój liczy się od „Zgłoś”).
      // Pole linii schowane (jedna linia) — awaria idzie na linię maszyny.
      const linia = W.wieleLinii(hala.slowniki) ? fa.linia.value : (((hala.slowniki.maszyny || {})[fa.maszyna.value] || {}).linia || fa.linia.value);
      const dane = { linia, maszyna: fa.maszyna.value, priorytet: fa.priorytet.value };
      if (fa.opis.value.trim()) dane.opis = fa.opis.value.trim();
      if (fa.zdjecie.files[0]) dane.zdjecia = [await hala.dodajPlik(fa.zdjecie.files[0])];
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
    b.textContent = wl ? (czeka ? '🔔 Kliknij' : '🔔') : '🔕';
    const co = W.wieleLinii(hala.slowniki) ? 'zatrzymaniu linii' : 'zatrzymaniu maszyny';
    b.title = wl ? (czeka ? 'Kliknij, żeby przeglądarka wpuściła dźwięk' : `Dźwięk przy awarii (${co} — mocniej), pilnym zadaniu i alercie jakości włączony`) : 'Dźwięk wyłączony';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(wl));
    b.classList.toggle('czeka', czeka);
  }

  $('dzwiek').addEventListener('click', () => {
    // Kliknięcie w „Kliknij” tylko odblokowuje dźwięk; kolejne przełącza.
    if (dzwiekWlaczony() && dzwiekGotowy()) pamiec.zapisz(KLUCZ_DZWIEKU, '0');
    else pamiec.zapisz(KLUCZ_DZWIEKU, '1');
    odblokujDzwiek();
    if (dzwiekWlaczony()) setTimeout(() => { if (GD()) GD().zagraj('pilne'); rysujDzwiek(); }, 150);
  });

  // D55: awarie (każda, zatrzymanie — mocniej) i pilne zadania kierownika — dwa różne dźwięki ze wspólnego dzialania.js.
  // D59: także incydent i sytuacja potencjalnie wypadkowa (BHP) — gong jak pilne zadanie.
  if (window.HalaDzwieki) window.HalaDzwieki.sledz(hala, { awarie: true, bhp: true, zlecenia: () => ({ dzial: 'kierownik' }), wlaczony: dzwiekWlaczony });
  // D77: reakcje kierownika przy zadaniach, które ta osoba robi w Panelu („▶ Wykonaj”); konto ekranu — bez (reakcje.js).
  if (window.HalaReakcje) window.HalaReakcje.sledz(hala);

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
  const LISTY_JESZCZE = [['lista-awarii', 'jeszcze-awarie', 'awarie'], ['lista-jakosci', 'jeszcze-jakosc', 'jakosc']];
  function pokazJeszcze() {
    for (const [lista, znacznik, rodzaj] of LISTY_JESZCZE) {
      const el = $(lista), dol = el.scrollTop + el.clientHeight;
      let n = 0;
      for (const c of el.children) if (c.offsetTop + c.offsetHeight > dol + 4) n++;
      $(znacznik).hidden = !n;
      $(znacznik).textContent = W.napisJeszcze(n, rodzaj);   // „▼ Przewiń — jeszcze 2 awarie”
    }
  }
  // UI etap 4: dopisek da się kliknąć — przewija listę o stronę (na komputerze nie każdy szuka kółkiem w karcie).
  for (const [lista, znacznik] of LISTY_JESZCZE)
    $(znacznik).addEventListener('click', () => { const el = $(lista); el.scrollTo({ top: el.scrollTop + el.clientHeight - 40, behavior: 'smooth' }); });
  for (const lista of ['lista-awarii', 'lista-jakosci']) $(lista).addEventListener('scroll', pokazJeszcze, { passive: true });

  setInterval(() => {
    if (!document.body.classList.contains('tryb-ekran') || widokAktywny !== 'na-zywo') return;
    for (const el of [$('lista-awarii'), $('lista-jakosci')]) {
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
    pasek.disabled = !kolejka.odrzucone;            // D64: przycisk jak w Liderze, UR i KJ (dotknięcie — lista „Nie wysłane”)
  }
  $('pasek').addEventListener('click', () => { if (hala.zalogowany() && kolejka.odrzucone) pokazOdrzucone(); });

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
    kolejka = k; rysujPasek(hala.polaczenie); rysujWiecej();
    const konto = document.getElementById('hala-okno-konta');
    if (konto && konto.open) otworzKonto();          // „Czeka na wysłanie” i „Odrzucone” na bieżąco
    if ($('okno-odrzucone').open) rysujOdrzucone();
  });
  /* Hub nie przyjął zapisu kierownika (np. brak uprawnień, zła maszyna) albo przyjął bez zmiany stanu (ktoś był
     szybszy) — wcześniej Panel milczał i kierownik myślał, że zlecenie poszło. */
  hala.na('odrzucone', ({ zdarzenie, powod }) => komunikat(`${zdarzenie ? nazwaTypu(zdarzenie.typ) : 'Zdjęcie'} — serwer nie przyjął: ${powod}`, 'blad'));
  hala.na('konflikt', ({ zdarzenie, uwaga }) => komunikat(`${zdarzenie ? nazwaTypu(zdarzenie.typ) : 'Zapis'}: ${uwaga} — sprawdź, co jest teraz.`, 'uwaga'));

  await hala.start();
  pokazSesje();
  rysujPasek(hala.polaczenie);
  // Po okresie łaski pasek musi powiedzieć prawdę, nawet gdy hala.js nie zgłosił jeszcze żadnej zmiany.
  setTimeout(() => rysujPasek(hala.polaczenie), START_LASKA_MS + 500);

  // Nowa wersja: odświeża sama (monitor w biurze z sesją 90 dni też), ale nie przy otwartym oknie (aktualizacja.js).
  HalaAktualizacja.pilnuj({ komunikat });
})();
