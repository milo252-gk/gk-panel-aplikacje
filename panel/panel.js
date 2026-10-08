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

  const hala = Hala.utworz({ aplikacja: 'panel', typy: ['awaria', 'zmiana_linii', 'partia', 'alert', 'zlecenie', 'proba'], dni: 2 });
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
    const dlugo = rodzaj === 'blad' ? 7000 : 3500;
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
    $('kto').textContent = z && hala.pracownik ? hala.pracownik.nazwa : '';
    $('menu-kto').textContent = $('kto').textContent;
    // Zapis tylko tam, gdzie kontrakt pozwala roli (konto ekranu i kierownik KJ nie zgłaszają awarii).
    $('menu-awaria').hidden = !(z && mozeWyslac('awaria.zgloszona'));
    $('nowe-zlecenie').hidden = !(z && mozeWyslac('zlecenie.utworzone'));
    // D49: kierownik zakładu, kierownik UR i KJ też — ale tylko „Pracownicy” ze swoim zespołem (administracja.js).
    $('menu-administracja').hidden = !(z && HalaZespol.zarzadzaKontami(hala.pracownik.role, (hala.kontrakt || {}).stale));
    // Szablony checklist może zmieniać, komu kontrakt pozwala zapisywać ten słownik (kierownik, admin).
    const zapisSzablonow = (((hala.kontrakt || {}).slowniki || {}).szablony_checklist || {}).zapis || [];
    $('menu-checklisty').hidden = !(z && (hala.pracownik.role || []).some(r => r === 'admin' || zapisSzablonow.includes(r)));
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

  function komunikatBledu(e) {
    // fetch bez sieci rzuca TypeError z angielskim tekstem przeglądarki — zamieniamy na instrukcję.
    if (!e || e instanceof TypeError || !e.kod) return 'Brak połączenia z hubem. Sprawdź sieć i spróbuj jeszcze raz.';
    if (e.ustawione) return e.message;               // D43: hasło i PIN ustawione, ale rola nie otwiera Panelu
    if (e.kod === 403 && e.powod) return e.message;  // np. stara_wersja — tekst huba mówi, co zrobić
    if (e.kod === 403) return 'To konto nie ma dostępu do Panelu. Zaloguj się kontem kierownika albo ekranu.';
    if (e.kod === 429) return e.message || 'Za dużo prób. Odczekaj 5 minut i spróbuj ponownie.';
    return e.message;
  }

  /* Logowanie identyfikatorem i hasłem albo PIN-em (D24, D43): identyfikator to kod z karty (czytnik „pisze” go jak
     klawiatura i kończy Enterem) albo login — konto monitora w biurze nie ma karty. Enter z czytnika
     przenosi do drugiego pola, zamiast wysyłać pusty sekret. Drugie pole: „Hasło (raz na 12 godzin na tym
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
      // D43: 12 h minęło albo 5 złych PIN-ów — hala.js zapomniał znacznik, pole wraca do hasła.
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
    if (!k && ekran && !(await Panel.potwierdz('Wylogować ekran?', 'Trzeba będzie wpisać identyfikator i PIN ekranu ponownie.', 'Wyloguj'))) return;
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
  for (const b of document.querySelectorAll('.zakladki > button')) if (!b.title) b.title = b.textContent.trim();

  const WIDOKI = ['na-zywo', 'zlecenia', 'wskazniki', 'raporty', 'checklisty', 'administracja'];
  for (const b of document.querySelectorAll('.zakladki button[data-widok]')) {
    b.addEventListener('click', () => {
      widokAktywny = b.dataset.widok;
      for (const x of document.querySelectorAll('.zakladki button[data-widok]')) x.setAttribute('aria-selected', String(x === b));
      for (const w of WIDOKI) $(w).hidden = widokAktywny !== w;
      narysuj();
    });
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
      : '<span class="slaby">Poza godzinami zmian</span>';
    $('zegar').textContent = W.godzina(d.teraz);
  }

  function rysujKafelki(d, awarie) {
    const kafelki = W.obchody({
      slowniki: d.slowniki, pracownicy: d.pracownicy, zmiana: d.zmiana, teraz: d.teraz, stale: d.stale,
      prog: hala.ustawienie('prog_zolty_min', 30), awarie,
      zmianaLinii: klucz => hala.obiekt('zmiana_linii', klucz),
    });
    $('kafelki').innerHTML = kafelki.map(k => {
      const proc = k.wszystkie ? Math.round(k.zrobione * 100 / k.wszystkie) : 0;
      const stan = k.zamknieta ? 'Raport wysłany' : k.wirtualna ? 'Nie otwarta' : (k.lider || 'Otwarta');
      const opoz = k.opoznione.slice(0, 3).map(p => `<li>${esc(p.godz)} ${esc(p.nazwa)}</li>`).join('')
        + (k.opoznione.length > 3 ? `<li>+${k.opoznione.length - 3} więcej</li>` : '');
      return `<article class="kafelek kolor-${esc(k.kolor)}">
        <header><h3>${esc(k.nazwa)}</h3>${k.zatrzymania ? `<span class="znacznik alarm">Stoi: ${k.zatrzymania}</span>` : k.awarie ? `<span class="znacznik uwaga">Awarie: ${k.awarie}</span>` : ''}</header>
        <div class="stan-zmiany ${k.wirtualna ? 'nieotwarta' : ''}">${esc(stan)}</div>
        <div class="postep" role="progressbar" aria-valuemin="0" aria-valuemax="${k.wszystkie}" aria-valuenow="${k.zrobione}"><span style="width:${proc}%"></span></div>
        <div class="liczby"><b>${k.zrobione}/${k.wszystkie}</b>${k.najblizsza ? ` <span>Następne ${esc(k.najblizsza.godz)} · ${esc(k.najblizsza.nazwa)}</span>` : k.wszystkie ? ' <span>Wszystko zrobione</span>' : ' <span>Brak planu</span>'}</div>
        ${k.opoznione.length ? `<ul class="opoznione" aria-label="Opóźnione">${opoz}</ul>` : ''}
      </article>`;
    }).join('') || '<p class="pusto">Brak linii w słowniku. Dodaj je w administracji.</p>';
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
          <div class="maszyna"><b>${esc(w.maszynaNazwa)}</b> <span class="slaby">${esc(w.maszyna)} · ${esc(w.liniaNazwa)}</span></div>
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

  function rysujJakosc(w) {
    $('licznik-jakosci').innerHTML = w.lista.length ? `<span class="znacznik alarm">${w.lista.length}</span>` : '';
    $('lista-jakosci').innerHTML = w.lista.map(i => i.rodzaj === 'alert' ? `
      <article class="incydent alert ${swieze('alert|' + i.id) ? 'nowy' : ''}">
        <div class="rodzaj"><span class="znacznik alarm">Quality Alert</span> <span class="slaby">${esc(i.numer)} · ${esc(i.godz)}</span></div>
        <div class="tytul"><b>${esc(i.tytul)}</b></div>
        <div class="potwierdzenia ${i.brakuje.length ? '' : 'komplet'}">Potwierdzenia liderów ${i.potwierdzone.length}/${i.linie.length}${i.brakuje.length ? ` <span class="slaby">— brak: ${esc(i.brakujeNazwy.join(', '))}</span>` : ''}</div>
      </article>` : `
      <article class="incydent partia">
        <div class="rodzaj"><span class="znacznik uwaga">Partia brakowa</span> <span class="slaby">${esc(i.numer)} · ${esc(i.godz)}</span></div>
        <div class="tytul"><b>${esc(i.liniaNazwa)}</b>${i.wyrob ? ` · ${esc(i.wyrob)}` : ''}${i.ilosc !== null ? ` · ${esc(i.ilosc)} szt.` : ''}${i.zlecenie ? ` <span class="slaby">zlec. ${esc(i.zlecenie)}</span>` : ''}</div>
        ${i.powod ? `<div class="slaby tekst-opisu">${esc(i.powod)}</div>` : ''}
      </article>`).join('') || '<p class="pusto ok">Brak incydentów na tej zmianie</p>';
    const wcz = [];
    if (w.wczesniej.alerty) wcz.push(`alerty: ${w.wczesniej.alerty}`);
    if (w.wczesniej.partie) wcz.push(`partie brakowe: ${w.wczesniej.partie}`);
    $('wczesniej').hidden = !wcz.length;
    $('wczesniej').textContent = wcz.length ? `Nadal aktywne z wcześniejszych zmian — ${wcz.join(', ')}` : '';
  }

  /* Lista raportów jest przerysowywana przy każdym zdarzeniu i co 20 s — bez tej
     pamięci rozwinięty raport zwijałby się kierownikowi w trakcie czytania.   */
  const otwarteRaporty = new Set();
  $('lista-raportow').addEventListener('toggle', ev => {
    const k = ev.target.dataset && ev.target.dataset.klucz;
    if (k) { if (ev.target.open) otwarteRaporty.add(k); else otwarteRaporty.delete(k); }
  }, true);

  // Przerysowanie co 20 s nie może zwijać sekcji, którą kierownik właśnie rozwinął.
  let nieotwarteRozwiniete = false;
  $('bez-raportu').addEventListener('toggle', ev => { if (ev.target.matches('details.nieotwarte')) nieotwarteRozwiniete = ev.target.open; }, true);
  const bezRaportu = d => W.zmianyBezRaportu({ zmianaLinii: klucz => hala.obiekt('zmiana_linii', klucz), slowniki: d.slowniki,
                                                pracownicy: d.pracownicy, teraz: d.teraz });

  function rysujRaporty(d) {
    // Etap 3: zakończone zmiany bez raportu końcowego (2 doby) nad raportami — brak raportu też jest informacją.
    // Otwarte (lider zaczął i nie skończył) — na wierzchu; nieotwarte z szablonem (po weekendzie to szum) — zwinięte.
    const brak = bezRaportu(d), otw = brak.filter(b => b.otwarta), nieotw = brak.filter(b => !b.otwarta);
    const wiersz = b => `<li><span class="kiedy">${esc(b.zmianaOpis)}</span> <b>${esc(b.liniaNazwa)}</b>
        ${b.otwarta ? '<span class="znacznik alarm">otwarta, bez raportu</span>' : ''}${b.lider ? ` <span class="slaby">${esc(b.lider)}</span>` : ''}</li>`;
    $('bez-raportu').hidden = !brak.length;
    $('bez-raportu').innerHTML = !brak.length ? '' : `
      ${otw.length ? `<h3>Zmiany bez raportu <span class="znacznik uwaga">${otw.length}</span></h3>
        <ul class="lista-bez-raportu">${otw.map(wiersz).join('')}</ul>` : ''}
      ${nieotw.length ? `<details class="nieotwarte" ${nieotwarteRozwiniete ? 'open' : ''}><summary>Nieotwarte (z szablonem checklisty): ${nieotw.length}</summary>
        <ul class="lista-bez-raportu">${nieotw.map(wiersz).join('')}</ul></details>` : ''}`;
    const lista = W.raporty({ zmianyLinii: hala.obiekty('zmiana_linii'), slowniki: d.slowniki, pracownicy: d.pracownicy });
    $('lista-raportow').innerHTML = lista.map(r => `
      <details class="raport" data-klucz="${esc(r.klucz)}" ${otwarteRaporty.has(r.klucz) ? 'open' : ''}>
        <summary>
          <span class="kiedy">${esc(r.zmianaOpis)}</span>
          <b>${esc(r.liniaNazwa)}</b>
          <span class="slaby">${esc(r.lider || '')}</span>
          <span class="skrot">
            ${r.checklista.wszystkie !== null ? `<span class="znacznik ${r.checklista.opoznione ? 'uwaga' : 'ok'}">Checklista ${r.checklista.zrobione}/${r.checklista.wszystkie}${r.checklista.opoznione ? ` · ${r.checklista.opoznione} po czasie` : ''}</span>` : ''}
            ${r.awarie ? `<span class="znacznik alarm">Awarie ${r.awarie} · ${esc(Hala.formatCzasu(r.przestojMin * 60000))}</span>` : '<span class="znacznik ok">Bez awarii</span>'}
            ${r.proby.liczba ? `<span class="znacznik ${r.proby.braki ? 'uwaga' : 'ok'}">Braki ${r.proby.braki}/${r.proby.sprawdzone}</span>` : ''}
            ${r.bhp ? `<span class="znacznik alarm">BHP ${r.bhp}</span>` : ''}
          </span>
        </summary>
        <dl>
          ${r.obsada ? `<dt>Obsada</dt><dd>${esc(r.obsada.obecna ?? '—')} z ${esc(r.obsada.planowana ?? '—')}</dd>` : ''}
          <dt>Checklista</dt><dd>${r.checklista.wszystkie !== null ? `${r.checklista.zrobione}/${r.checklista.wszystkie}, opóźnione: ${r.checklista.opoznione}, pominięte: ${r.checklista.pominiete}` : '—'}</dd>
          <dt>Awarie</dt><dd>${r.awarieLista.map(a => `${esc(a.numer)} ${esc(a.maszyna)} (${esc(Hala.formatCzasu(a.przestojMin * 60000))})`).join(', ') || 'brak'}</dd>
          <dt>Próby</dt><dd>${r.proby.liczba ? `${r.proby.liczba}, sprawdzone ${r.proby.sprawdzone}, braki ${r.proby.braki}${r.proby.proc !== null ? ` (${r.proby.proc} %)` : ''}` : 'brak'}</dd>
          ${r.uwagi ? `<dt>Uwagi lidera</dt><dd>${esc(r.uwagi)}</dd>` : ''}
          <dt>Zamknięta</dt><dd>${esc(W.dataKrotka(r.czas))} ${esc(W.godzina(r.czas))}</dd>
        </dl>
      </details>`).join('') || '<p class="pusto">Brak raportów z ostatnich dwóch dni</p>';
  }

  let zaplanowane = false;
  function narysuj() {
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
      const zlecenia = hala.obiekty('zlecenie');
      const doZamkniecia = zlecenia.filter(z => z.status === 'wykonane' || z.status === 'odrzucone').length;
      $('plakietka-zlecen').hidden = !doZamkniecia;
      $('plakietka-zlecen').textContent = doZamkniecia || '';
      if (widokAktywny === 'na-zywo') {
        const linie = rysujKafelki(d, awarie);
        rysujAwarie(wiersze);
        rysujJakosc(jakosc);
        rysujLiczby(W.kafelki({ kafelkiLinii: linie, wierszeAwarii: wiersze, incydenty: jakosc, zlecenia, teraz: d.teraz, bezRaportu: bezRaportu(d) }));
        pokazJeszcze();
      } else if (widokAktywny === 'zlecenia') {
        rysujZlecenia(d, zlecenia);
      } else if (widokAktywny === 'wskazniki') {
        if (Panel.widoki.wskazniki) Panel.widoki.wskazniki.rysuj(d);
      } else if (widokAktywny === 'checklisty') {
        if (Panel.widoki.checklisty) Panel.widoki.checklisty.rysuj(d);
      } else if (widokAktywny === 'administracja') {
        if (Panel.widoki.administracja) Panel.widoki.administracja.rysuj(d);
      } else {
        rysujRaporty(d);
      }
    });
  }

  // ------------------------------------------------------------ pulpit: kafelki liczb (jak GK Flota)

  function rysujLiczby(lista) {
    $('kafelki-liczb').innerHTML = lista.map(k => `
      <button type="button" class="${esc(k.klasa)}" data-kafel="${esc(k.kod)}"><span class="etykieta">${esc(k.etykieta)}</span><b>${k.liczba}</b></button>`).join('');
  }
  // Kafelki zleceń prowadzą do zleceń (po terminie — od razu z tym filtrem) — reszta jest na tym samym ekranie.
  $('kafelki-liczb').addEventListener('click', ev => {
    const k = ev.target.closest('[data-kafel]');
    if (k && k.dataset.kafel === 'zlecenia') Panel.pokazZlecenia(null, 'biezace');
    if (k && k.dataset.kafel === 'po-terminie') Panel.pokazZlecenia('po-terminie', 'biezace');
    if (k && k.dataset.kafel === 'bez-raportu') document.querySelector('.zakladki [data-widok="raporty"]').click();
  });

  // ------------------------------------------------------------ zlecenia dla działów (kierownik)

  let filtrZlecen = 'otwarte', trybZlecen = 'biezace';
  /* Wybór filtra albo trybu z zewnątrz (kafelek „Po terminie” na pulpicie). */
  Panel.pokazZlecenia = (filtr, tryb) => {
    if (filtr) filtrZlecen = filtr;
    if (tryb) trybZlecen = tryb;
    document.querySelector('.zakladki [data-widok="zlecenia"]').click();
  };
  /* Adres #zlecenia = dotknięte powiadomienie „Po terminie” (hala-push-sw.js otwiera ./#zlecenia albo przysyła
     otwartemu Panelowi {typ:'otworz'}): od razu Zlecenia z filtrem „Po terminie”. Adres czyścimy, żeby następne
     powiadomienie z tym samym adresem znowu zadziałało, a odświeżenie strony nie przełączało widoku. Przed
     zalogowaniem adres czeka — pokazSesje woła to jeszcze raz po zalogowaniu. */
  function obsluzAdres() {
    if (!hala.zalogowany() || !['#zlecenia', '#administracja'].includes(location.hash)) return;
    const adres = location.hash;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* stary adres zostanie — bez szkody */ }
    // #administracja = dotknięty alarm huba (etap 2: kopia, adres na Pages, token, miejsce) — tylko administrator ma ten widok.
    if (adres === '#administracja') { if (!$('menu-administracja').hidden) $('menu-administracja').click(); return; }
    Panel.pokazZlecenia('po-terminie', 'biezace');
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

  const PUSTE_ZLECENIA = { otwarte: 'Żadne zlecenie nie jest w toku', 'po-terminie': 'Nic nie jest po terminie',
                           'do-zamkniecia': 'Nic nie czeka na przyjęcie', zaplanowane: 'Nic nie jest zaplanowane na później',
                           przepadle: 'Żadne zadanie zmianowe nie przepadło (ostatnie dwa dni)',
                           zamkniete: 'Brak zamkniętych zleceń z ostatnich dwóch dni' };

  const mozeZapisacStale = () => {
    const role = (hala.pracownik && hala.pracownik.role) || [];
    const zapis = (((hala.kontrakt || {}).slowniki || {}).zlecenia_stale || {}).zapis || [];
    return role.some(r => r === 'admin' || zapis.includes(r));
  };
  Panel.mozeZapisacStale = mozeZapisacStale;

  function rysujZlecenia(d, lista) {
    for (const b of document.querySelectorAll('#tryb-zlecen [data-tryb]')) b.setAttribute('aria-pressed', String(b.dataset.tryb === trybZlecen));
    for (const b of document.querySelectorAll('#filtr-zlecen [data-filtr]')) b.setAttribute('aria-pressed', String(b.dataset.filtr === filtrZlecen));
    $('zlecenia-biezace').hidden = trybZlecen !== 'biezace';
    $('zlecenia-stale').hidden = trybZlecen !== 'stale';
    $('nowe-zlecenie').hidden = !(trybZlecen === 'biezace' && mozeWyslac('zlecenie.utworzone'));
    $('nowe-stale').hidden = !(trybZlecen === 'stale' && mozeZapisacStale());
    if (trybZlecen === 'stale') { if (Panel.widoki.stale) Panel.widoki.stale.rysuj(d); return; }
    const wiersze = W.zlecenia({ zlecenia: lista, slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz, filtr: filtrZlecen,
                                 ja: hala.pracownik });
    // Liczby na chipach — kierownik widzi od razu, ile jest po terminie i ile czeka na niego.
    for (const b of document.querySelectorAll('#filtr-zlecen [data-filtr]')) {
      const n = W.zlecenia({ zlecenia: lista, slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz, filtr: b.dataset.filtr }).length;
      if (!b.dataset.napis) b.dataset.napis = b.textContent;
      b.textContent = b.dataset.filtr !== 'zamkniete' && n ? `${b.dataset.napis} · ${n}` : b.dataset.napis;
      // Po terminie i przepadłe (D35) — na czerwono: to jest do dopilnowania, a nie tylko do przeczytania.
      b.classList.toggle('spoznione', (b.dataset.filtr === 'po-terminie' || b.dataset.filtr === 'przepadle') && n > 0);
    }
    const kier = mozeWyslac('zlecenie.zamkniete');
    const stale = mozeZapisacStale();
    const zdjecia = (ids, etykieta, podpis) => ids.length ? `<div class="zdjecia"><span class="slaby">${esc(etykieta)}</span>${ids.map(id =>
      `<button type="button" class="miniatura" data-zdjecie="${esc(id)}" data-podpis="${esc(podpis)}" aria-label="Powiększ zdjęcie"><img data-plik="${esc(id)}" alt=""></button>`).join('')}</div>` : '';
    $('lista-zlecen').innerHTML = wiersze.map(z => `
      <article class="zlecenie ${z.pilne ? 'pilne' : ''} ${z.poTerminie ? 'po-terminie' : ''}" data-id="${esc(z.id)}">
        <div class="opis">
          <div class="tytul"><b>${esc(z.tytul)}</b> <span class="slaby">${esc(z.numer)}</span>${z.stale ? ` <span class="slaby" title="Ze zlecenia stałego">🔁</span>` : ''}</div>
          <div class="szczegoly">
            <span class="znacznik ${klasaZlecenia(z.status)}">${esc(z.zaplanowane && z.zaplanowaneNa ? `Zaplanowane na ${z.zaplanowaneNa}` : z.etykieta)}</span>
            ${z.pilne ? '<span class="znacznik alarm">Pilne</span>' : ''}
            ${z.spoznienie ? `<span class="znacznik alarm">${esc(z.spoznienie)}</span>` : ''}
            <span class="znacznik neutral">${esc(z.dzialNazwa)}</span>
            ${z.liniaNazwa ? `<span>${esc(z.liniaNazwa)}</span>` : ''}${z.maszyna ? `<span>· ${esc(z.maszyna)}</span>` : ''}
            ${z.kto ? `<span>· ${esc(z.kto)}</span>` : z.wykonawca ? `<span>· dla: ${esc(z.wykonawca)}</span>` : ''}
            ${z.wymagajZdjecia ? '<span title="Dział musi dodać zdjęcie">📷</span>' : ''}${z.wymagajNotatki ? '<span title="Dział musi napisać notatkę">📝</span>' : ''}
          </div>
          ${z.opis ? `<div class="slaby tekst-opisu">${esc(z.opis)}</div>` : ''}
          ${z.odpowiedz ? `<div class="odpowiedz">${esc(z.odpowiedz)}</div>` : ''}
          ${z.notatka ? `<div class="odpowiedz">📝 ${esc(z.notatka)}</div>` : ''}
          ${z.uwagiZwrotu && z.otwarte ? `<div class="slaby">Zwrócone: ${esc(z.uwagiZwrotu)}</div>` : ''}
          ${zdjecia(z.zdjecia, 'Od działu:', [z.tytul, z.kto, z.notatka].filter(Boolean).join(' · '))}${zdjecia(z.zdjeciaKierownika, 'Do zlecenia:', z.tytul)}
        </div>
        ${z.zaplanowane ? `<div class="numer slaby">zleci się<br><b class="tekst-planu">${esc(z.zaplanowaneNa || '—')}</b><br>${esc(z.terminPlanu)}${z.zlecil ? `<br>${esc(z.zlecil)}` : ''}</div>`
          : `<div class="numer slaby">${esc(z.zleconoDzien)} ${esc(z.zlecono)}${z.zlecil ? `<br>${esc(z.zlecil)}` : ''}${z.termin ? `<br><span class="${z.poTerminie ? 'tekst-alarm' : ''}">termin ${esc(z.termin)}</span>` : ''}</div>`}
        <div class="akcje">
          ${z.moznaZmienic ? `<button type="button" class="maly" data-akcja="zmien-plan">Zmień</button>
            <button type="button" class="maly glowny" data-akcja="zlec-teraz" title="Zleć od razu — dział dostanie powiadomienie">Zleć teraz</button>` : ''}
          ${kier && z.doZamkniecia ? `<button type="button" class="maly glowny" data-akcja="zamknij">${z.status === 'wykonane' ? 'Przyjmij' : 'Zamknij'}</button>
            <button type="button" class="maly" data-akcja="zwroc">Zwróć</button>` : ''}
          ${kier && z.moznaAnulowac ? '<button type="button" class="maly" data-akcja="anuluj">Anuluj</button>' : ''}
          ${stale && !z.stale && !z.zaplanowane ? '<button type="button" class="maly" data-akcja="jako-stale" title="Zapisz jako zlecenie stałe">🔁 Jako stałe</button>' : ''}
        </div>
      </article>`).join('') || `<p class="pusto ${filtrZlecen === 'po-terminie' || filtrZlecen === 'przepadle' ? 'ok' : ''}">${PUSTE_ZLECENIA[filtrZlecen]}</p>`;
    // Zdjęcie: lokalny plik (jeszcze w kolejce) albo z huba — adres daje hala.js.
    for (const e of $('lista-zlecen').querySelectorAll('img[data-plik]'))
      hala.adresPliku(e.dataset.plik).then(u => { e.src = u; }).catch(() => {});
  }

  /* Zdjęcie od działu w dużym rozmiarze — kierownik ocenia wykonanie, a miniatura 64 px nic nie mówi. */
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
    const id = b.closest('[data-id]').dataset.id;
    try {
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
    .map(([k, m]) => [k, `${(m && m.nazwa) || k} (${k})`]);

  function otworzOkno(okno) {
    const f = okno.querySelector('form');
    f.querySelector('.blad').hidden = true;
    okno.showModal();
    f.querySelector('input, select, textarea').focus();
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
     egzekwowanie ma być zasadą, a kierownik odznacza je świadomie. D47: kierownik zakładu może je „Zaplanować na” później,
     a zaplanowane — zmienić tym samym oknem (edycja = obiekt zlecenia; dział, linia i maszyna wtedy bez zmian). */
  const mozePlanowac = () => mozeWyslac('zlecenie.zaplanowane');
  function pokazPlan() {
    const plan = !!fz.plan_dzien.value || !!fz.edycja.value;
    $('zlecenie-termin').hidden = plan;
    $('zlecenie-termin-po').hidden = !plan;
    const w = W.planZFormularza({ dzien: fz.plan_dzien.value, godzina: fz.plan_godzina.value, zmiany: hala.slowniki.zmiany, teraz: hala.teraz() });
    $('zlecenie-plan-opis').textContent = !fz.plan_dzien.value ? 'Puste — zlecenie idzie do działu od razu.'
      : w.blad ? w.blad : `Dział zobaczy je ${w.opis} i wtedy dostanie powiadomienie.`;
    fz.querySelector('button[type="submit"]').textContent = fz.edycja.value ? 'Zapisz zmiany' : fz.plan_dzien.value ? 'Zaplanuj' : 'Zleć';
  }
  Panel.noweZlecenie = (wstepne, edycja) => {
    const w = edycja ? Object.assign({}, edycja.dane, { pilne: (edycja.dane || {}).priorytet === 'pilne' }) : (wstepne || {});
    fz.reset();
    fz.dzial.innerHTML = opcje(((hala.kontrakt.stale || {}).dzialy || []).map(d => [d.kod, d.nazwa]));
    if (w.dzial) fz.dzial.value = w.dzial;
    fz.linia.innerHTML = opcje(linieLista(), '— każda —');
    fz.linia.value = w.linia || '';
    fz.maszyna.innerHTML = opcje(maszynyLinii(fz.linia.value), '— żadna —');
    fz.maszyna.value = w.maszyna || '';
    fz.wykonawca.innerHTML = opcje(osobyDzialu(fz.dzial.value), '— cały dział —');
    fz.wykonawca.value = w.wykonawca || '';
    fz.tytul.value = w.tytul || '';
    fz.opis.value = w.opis || '';
    fz.pilne.checked = !!w.pilne;
    if (wstepne) { fz.wymagaj_zdjecia.checked = !!w.wymagaj_zdjecia; fz.wymagaj_notatki.checked = !!w.wymagaj_notatki; }
    fz.termin.value = w.termin ? W.poleCzasu(w.termin) : '';
    fz.stale.value = edycja ? '' : (w.stale || '');
    fz.edycja.value = edycja ? edycja.id : '';
    if (edycja) { fz.wymagaj_zdjecia.checked = !!w.wymagaj_zdjecia; fz.wymagaj_notatki.checked = !!w.wymagaj_notatki; }
    // Plan (D47): tylko kierownik zakładu (i admin) i nie dla „Zleć teraz” ze zlecenia stałego.
    $('zlecenie-plan').hidden = !(edycja || (mozePlanowac() && !w.stale));
    $('zlecenie-plan').querySelector('legend').textContent = edycja ? 'Zaplanuj na' : 'Zaplanuj na (opcjonalnie — puste = zleć od razu)';
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
    $('zlecenie-ze-stalego').textContent = w.stale ? '🔁 Ze zlecenia stałego — termin dla bieżącej zmiany, możesz go zmienić.' : '';
    $('t-okno-zlecenia').textContent = edycja ? 'Zmień zaplanowane zlecenie' : w.stale ? 'Zleć teraz' : 'Nowe zlecenie';
    pokazPlan();
    otworzOkno($('okno-zlecenia'));
  };
  fz.plan_dzien.addEventListener('input', pokazPlan);
  fz.plan_godzina.addEventListener('input', pokazPlan);
  Panel.opcje = opcje;
  Panel.linieLista = linieLista;
  Panel.maszynyLinii = maszynyLinii;
  Panel.osobyDzialu = osobyDzialu;
  $('nowe-zlecenie').addEventListener('click', () => Panel.noweZlecenie(null));
  // Każde zamknięcie okna zdejmuje blokadę pól edycji — następne „Nowe zlecenie” zaczyna od zwykłego formularza.
  $('okno-zlecenia').addEventListener('close', () => { for (const pole of ['dzial', 'linia', 'maszyna']) fz[pole].disabled = false; });
  fz.dzial.addEventListener('change', () => { fz.wykonawca.innerHTML = opcje(osobyDzialu(fz.dzial.value), '— cały dział —'); });
  fz.linia.addEventListener('change', () => { fz.maszyna.innerHTML = opcje(maszynyLinii(fz.linia.value), '— żadna —'); });
  fz.addEventListener('submit', W.przyWysylce(async ev => {
    ev.preventDefault();
    const blad = t => { const b = fz.querySelector('.blad'); b.textContent = t; b.hidden = false; };
    const dane = { tytul: fz.tytul.value.trim(), dzial: fz.dzial.value, priorytet: fz.pilne.checked ? 'pilne' : 'normalny',
                   wymagaj_zdjecia: fz.wymagaj_zdjecia.checked, wymagaj_notatki: fz.wymagaj_notatki.checked };
    for (const pole of ['opis', 'linia', 'maszyna', 'wykonawca', 'stale']) if (fz[pole].value.trim()) dane[pole] = fz[pole].value.trim();
    const edycja = fz.edycja.value;
    const plan = (edycja || fz.plan_dzien.value)
      ? W.planZFormularza({ dzien: fz.plan_dzien.value, godzina: fz.plan_godzina.value, zmiany: hala.slowniki.zmiany, teraz: hala.teraz() }) : { na: null };
    if (plan.blad) { blad(plan.blad); return; }
    if (edycja && !plan.na) { blad('Wybierz dzień startu — albo zamknij okno i użyj „Zleć teraz”.'); return; }
    const po = plan.na ? W.terminPoZFormularza(fz.termin_po.value, fz.termin_po_jedn.value) : { min: null };
    if (po.blad) { blad(po.blad); return; }
    if (!plan.na && fz.termin.value) dane.termin = lokalnyNaIso(fz.termin.value);
    try {
      if (edycja) {
        // Zmiana planu (D47): wszystkie pola do zmiany naraz — puste czyści (null), dział, linia i maszyna zostają.
        await hala.zapisz('zlecenie.plan_zmieniony', edycja, { tytul: dane.tytul, opis: dane.opis || '', priorytet: dane.priorytet,
          wykonawca: dane.wykonawca || '', zaplanowane_na: plan.na, termin_po_min: po.min, termin: null,
          wymagaj_zdjecia: dane.wymagaj_zdjecia, wymagaj_notatki: dane.wymagaj_notatki });
        $('okno-zlecenia').close();
        komunikat(`Zmienione — zleci się ${plan.opis}`, 'ok');
        return;
      }
      if (fz.zdjecie.files[0]) dane.zdjecia = [await hala.dodajPlik(fz.zdjecie.files[0])];
      if (plan.na) {
        delete dane.stale;
        await hala.zapisz('zlecenie.zaplanowane', hala.nowyId(), Object.assign(dane, { zaplanowane_na: plan.na }, po.min ? { termin_po_min: po.min } : {}));
        $('okno-zlecenia').close();
        komunikat(`Zaplanowane — dział zobaczy je ${plan.opis}`, 'ok');
        Panel.pokazZlecenia('zaplanowane', 'biezace');
        return;
      }
      await hala.zapisz('zlecenie.utworzone', hala.nowyId(), dane);
      $('okno-zlecenia').close();
      komunikat('Zlecone', 'ok');
      Panel.pokazZlecenia('otwarte', 'biezace');
    } catch (e) { blad(komunikatBledu(e)); }
  }));

  // Zgłoszenie awarii z Panelu — trafia do UR jak od lidera (awaria.zgloszona).
  const fa = $('formularz-awarii');
  $('menu-awaria').addEventListener('click', () => {
    fa.reset();
    fa.linia.innerHTML = opcje(linieLista());
    fa.maszyna.innerHTML = opcje(maszynyLinii(fa.linia.value));
    fa.priorytet.innerHTML = opcje(((hala.kontrakt.stale || {}).priorytety || []).map(p => [p.kod, p.nazwa]));
    otworzOkno($('okno-awarii'));
  });
  fa.linia.addEventListener('change', () => { fa.maszyna.innerHTML = opcje(maszynyLinii(fa.linia.value)); });
  fa.addEventListener('submit', W.przyWysylce(async ev => {
    ev.preventDefault();
    try {
      // D47: zdjęcie i notatka nieobowiązkowe — bez nich zgłoszenie idzie tak samo (przestój liczy się od „Zgłoś”).
      const dane = { linia: fa.linia.value, maszyna: fa.maszyna.value, priorytet: fa.priorytet.value };
      if (fa.opis.value.trim()) dane.opis = fa.opis.value.trim();
      if (fa.zdjecie.files[0]) dane.zdjecia = [await hala.dodajPlik(fa.zdjecie.files[0])];
      await hala.zapisz('awaria.zgloszona', hala.nowyId(), dane);
      $('okno-awarii').close();
      document.querySelector('.zakladki [data-widok="na-zywo"]').click();
    } catch (e) { const b = fa.querySelector('.blad'); b.textContent = komunikatBledu(e); b.hidden = false; }
  }));

  // ------------------------------------------------------------ sygnał: nowe zatrzymanie linii albo Quality Alert

  /* Kierownik nie patrzy na monitor bez przerwy. Nowe zatrzymanie linii i nowy Quality Alert migają
     na ekranie przez minutę i (gdy dźwięk jest włączony) dają krótki sygnał. Dźwięk przeglądarka
     wpuszcza dopiero po kliknięciu albo klawiszu na stronie — dlatego przycisk w nagłówku mówi,
     kiedy trzeba kliknąć. Na monitorze w biurze można tego uniknąć flagą Chrome (INSTRUKCJA §7). */
  const KLUCZ_DZWIEKU = 'hala.panel.dzwiek';
  const MIGANIE_MS = 60000;
  let znaneAlarmy = null;
  const swiezeDo = new Map();
  const swieze = klucz => (swiezeDo.get(klucz) || 0) > Date.now();
  let dzwiekKontekst = null;

  function dzwiekWlaczony() {
    const zapis = pamiec.czytaj(KLUCZ_DZWIEKU);
    // Domyślnie włączony tylko na monitorze (konto ekranu) — tablet kierownika na naradzie ma milczeć.
    return zapis === null ? document.body.classList.contains('tryb-ekran') : zapis === '1';
  }

  function odblokujDzwiek() {
    try {
      const K = window.AudioContext || window.webkitAudioContext;
      if (!dzwiekKontekst && K) dzwiekKontekst = new K();
      if (dzwiekKontekst && dzwiekKontekst.state === 'suspended') dzwiekKontekst.resume().then(rysujDzwiek, () => {});
    } catch (e) { /* bez WebAudio zostaje samo miganie */ }
    rysujDzwiek();
  }
  for (const zd of ['pointerdown', 'keydown']) document.addEventListener(zd, odblokujDzwiek, { passive: true });

  function rysujDzwiek() {
    const b = $('dzwiek');
    const wl = dzwiekWlaczony();
    const czeka = wl && (!dzwiekKontekst || dzwiekKontekst.state !== 'running');
    b.textContent = wl ? (czeka ? '🔔 Kliknij' : '🔔') : '🔕';
    b.title = wl ? (czeka ? 'Kliknij, żeby przeglądarka wpuściła dźwięk' : 'Dźwięk przy zatrzymaniu linii włączony') : 'Dźwięk wyłączony';
    b.setAttribute('aria-pressed', String(wl));
    b.classList.toggle('czeka', czeka);
  }

  $('dzwiek').addEventListener('click', () => {
    // Kliknięcie w „Kliknij” tylko odblokowuje dźwięk; kolejne przełącza.
    if (dzwiekWlaczony() && dzwiekKontekst && dzwiekKontekst.state === 'running') pamiec.zapisz(KLUCZ_DZWIEKU, '0');
    else pamiec.zapisz(KLUCZ_DZWIEKU, '1');
    odblokujDzwiek();
    if (dzwiekWlaczony()) zagraj('alert');
  });

  function zagraj(rodzaj) {
    if (!dzwiekWlaczony() || !dzwiekKontekst || dzwiekKontekst.state !== 'running') return;
    // Zatrzymanie: trzy wysokie, alert jakości: dwa niższe — da się rozróżnić bez patrzenia.
    const tony = rodzaj === 'zatrzymanie' ? [880, 880, 880] : [660, 660];
    const t0 = dzwiekKontekst.currentTime;
    tony.forEach((hz, i) => {
      const osc = dzwiekKontekst.createOscillator(), g = dzwiekKontekst.createGain();
      osc.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.3);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + i * 0.3 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.3 + 0.2);
      osc.connect(g).connect(dzwiekKontekst.destination);
      osc.start(t0 + i * 0.3);
      osc.stop(t0 + i * 0.3 + 0.22);
    });
  }

  function sprawdzAlarmy(wiersze, incydenty) {
    const a = W.noweAlarmy(znaneAlarmy, wiersze, incydenty);
    znaneAlarmy = a.znane;
    if (!a.nowe.length) return;
    for (const n of a.nowe) swiezeDo.set((n.rodzaj === 'alert' ? 'alert|' : 'awaria|') + n.id, Date.now() + MIGANIE_MS);
    zagraj(a.nowe.some(n => n.rodzaj === 'zatrzymanie') ? 'zatrzymanie' : 'alert');
    setTimeout(narysuj, MIGANIE_MS + 100);            // zdjąć miganie, gdy nic innego nie przerysuje
  }

  // ------------------------------------------------------------ monitor bez myszy: długie listy

  /* Na monitorze listy przewijają się w swoich sekcjach, a monitor nie ma myszy. Dopisek „jeszcze N”
     mówi, że coś jest niżej, a na koncie ekranu listy same przewijają się stronami co 12 s. */
  function pokazJeszcze() {
    for (const [lista, znacznik] of [['lista-awarii', 'jeszcze-awarie'], ['lista-jakosci', 'jeszcze-jakosc']]) {
      const el = $(lista), dol = el.scrollTop + el.clientHeight;
      let n = 0;
      for (const c of el.children) if (c.offsetTop + c.offsetHeight > dol + 4) n++;
      $(znacznik).hidden = !n;
      $(znacznik).textContent = n ? `▼ jeszcze ${n}` : '';
    }
  }
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
     „Odrzucone: N” zawsze. Dotknięcie przy odrzuconych otwiera konto z listą i powodami. */
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
    kolejka = k; rysujPasek(hala.polaczenie);
    const konto = document.getElementById('hala-okno-konta');
    if (konto && konto.open) otworzKonto();          // „Czeka na wysłanie” i „Odrzucone” na bieżąco
    if ($('okno-odrzucone').open) rysujOdrzucone();
  });
  /* Hub nie przyjął zapisu kierownika (np. brak uprawnień, zła maszyna) albo przyjął bez zmiany stanu (ktoś był
     szybszy) — wcześniej Panel milczał i kierownik myślał, że zlecenie poszło. */
  hala.na('odrzucone', ({ zdarzenie, powod }) => komunikat(`${zdarzenie ? nazwaTypu(zdarzenie.typ) : 'Zdjęcie'} — hub nie przyjął: ${powod}`, 'blad'));
  hala.na('konflikt', ({ zdarzenie, uwaga }) => komunikat(`${zdarzenie ? nazwaTypu(zdarzenie.typ) : 'Zapis'}: ${uwaga} — sprawdź, co jest teraz.`, 'uwaga'));

  await hala.start();
  pokazSesje();
  rysujPasek(hala.polaczenie);
  // Po okresie łaski pasek musi powiedzieć prawdę, nawet gdy hala.js nie zgłosił jeszcze żadnej zmiany.
  setTimeout(() => rysujPasek(hala.polaczenie), START_LASKA_MS + 500);

  // Nowa wersja: odświeża sama (monitor w biurze z sesją 90 dni też), ale nie przy otwartym oknie (aktualizacja.js).
  HalaAktualizacja.pilnuj({ komunikat });
})();
