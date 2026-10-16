/* GK Panel Kierownika — wspólne okna konta: „Zmień hasło”, „Zmień PIN”, „Ustaw hasło i PIN” po pierwszym logowaniu
   i pole sekretu na ekranie logowania (D32: jedno konto we wszystkich aplikacjach GK; D43: hasło raz na 16 godzin na
   urządzeniu, na co dzień PIN 4 cyfry).

   Jedno okno dla Panelu, Lidera, UR i KJ (wszędzie z „Moje konto” — ikona osoby w nagłówku, niżej mojeKonto) — ten sam wygląd i te same
   słowa, jak Wygląd (motyw.js). Aplikacja woła:
       HalaKonto.zaloguj(hala, { identyfikator, pin }, { komunikat })   // jak hala.zaloguj; hasło startowe → okno „Ustaw hasło i PIN”
       HalaKonto.poleLogowania({ hala, ident, sekret, etykieta, przelacz, naZmiane })   // „Hasło (raz na 16 godzin…)” / „PIN (4 cyfry)”
       HalaKonto.zmienHaslo(hala, { komunikat }) / HalaKonto.zmienPin(hala, { komunikat })   // true = zmienione, false = anulowano
   albo dorysowuje przyciski:  HalaKonto.przycisk(el, hala, { komunikat })   // „Zmień hasło” i „Zmień PIN”

   Reguły (te same co w hubie — hala.py → blad_hasla, blad_pinu): hasło min. 8 znaków (najwyżej 128), byle nie hasło startowe
   haslo123 — oczywiste wolno (D46); PIN dokładnie 4 cyfry, dowolne (D46 — także 1234, 0000). Hub i tak sprawdza wszystko jeszcze raz; tu tylko podpowiadamy od razu.
   Okna to <dialog> w warstwie górnej — działają nad każdym ekranem aplikacji (także nad oknem menu Lidera).
   Wygląd: hala.css → .hala-okno. Bez sieci zmiany nie ma (hub musi sprawdzić obecny sekret) — mówimy to wprost. */

(function (global) {
  'use strict';

  const ROLE_BIUROWE = ['trasy_biuro', 'trasy_admin', 'flota_biuro', 'flota_admin'];
  const HASLO_STARTOWE = 'haslo123';

  const biuro = pracownik => !!pracownik && (pracownik.role || []).some(r => ROLE_BIUROWE.includes(r));
  const ekran = pracownik => !!pracownik && (pracownik.role || []).length === 1 && pracownik.role[0] === 'ekran';

  /* Błędy nowego hasła po polsku (pusta lista = można wysłać). Czysta funkcja — testy: reduktor-testy.js.
     { stare (gdy wymagane), nowe, powtorz, nazwa (imię i nazwisko osoby), wymagajStarego } */
  function bledyHasla({ stare, nowe, powtorz, nazwa, wymagajStarego }) {
    const b = [];
    stare = String(stare || '').trim(); nowe = String(nowe || '').trim(); powtorz = String(powtorz || '').trim();
    if (wymagajStarego && !stare) b.push('Wpisz obecne hasło.');
    // D46: oczywiste hasło, jeden powtórzony znak, imię i nazwisko wolno — tylko długość i nie hasło startowe.
    if (nowe.length < 8) b.push('Nowe hasło: min. 8 znaków (litery, cyfry, znaki).');
    else if (nowe.length > 128) b.push('Hasło może mieć najwyżej 128 znaków.');
    else if (nowe.toLowerCase() === HASLO_STARTOWE) b.push(`„${HASLO_STARTOWE}” to hasło startowe — wpisz nowe.`);
    if (nowe && stare && nowe === stare) b.push('Nowe hasło musi być inne niż obecne.');
    if (nowe && powtorz !== nowe) b.push('Powtórzone hasło nie zgadza się z nowym.');
    return b;
  }

  /* Błędy nowego PIN-u (D43: dokładnie 4 cyfry). { stary (obecne hasło albo PIN, gdy wymagany), nowy, powtorz,
     wymagajStarego } — czysta funkcja, testy: reduktor-testy.js. */
  function bledyPinu({ stary, nowy, powtorz, wymagajStarego }) {
    const b = [];
    stary = String(stary || '').trim(); nowy = String(nowy || '').trim(); powtorz = String(powtorz || '').trim();
    if (wymagajStarego !== false && !stary) b.push('Wpisz obecne hasło albo obecny PIN.');
    if (!/^\d{4}$/.test(nowy)) b.push('PIN to dokładnie 4 cyfry.');
    if (nowy && stary && nowy === stary) b.push('Nowy PIN musi być inny niż obecny.');
    if (nowy && powtorz !== nowy) b.push('Powtórzony PIN nie zgadza się z nowym.');
    return b;
  }

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function okno(id) {
    let o = document.getElementById(id);
    if (o) return o;
    o = document.createElement('dialog');
    o.id = id;
    o.className = 'hala-okno';
    o.setAttribute('aria-labelledby', id + '-tytul');
    document.body.appendChild(o);
    return o;
  }

  /* Brak połączenia z hubem: fetch bez odpowiedzi albo odpowiedź, która nie przyszła od huba (e.odHuba === false —
     Cloudflare 530 przy zgaszonym tunelu, 502 bramy). Wcześniej człowiek widział wtedy samo „HTTP 530”. */
  const bezSieci = e => !e || e instanceof TypeError || !e.kod || e.odHuba === false;

  /* Wspólny przebieg okna: formularz → sprawdzenie → zapytanie do huba → komunikat. wyslij(f) zwraca obietnicę;
     bledy(f) — lista błędów formularza. Obietnica okna: true = zrobione, false = anulowano. */
  function prowadzOkno(d, { bledy, wyslij, poBledzie, komunikatOk, komunikat, bezSieciTekst }) {
    const f = d.querySelector('form');
    const blad = d.querySelector('.hala-okno-blad');
    const pokaz = t => { blad.textContent = t; blad.hidden = !t; };
    return new Promise(gotowe => {
      let zrobione = false;
      d.querySelector('[data-anuluj]').addEventListener('click', () => d.close());
      d.addEventListener('close', () => { f.reset(); gotowe(zrobione); }, { once: true });
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const b = bledy(f);
        if (b.length) { pokaz(b.join(' ')); return; }
        const przycisk = f.querySelector('button[type=submit]');
        przycisk.disabled = true;
        try {
          await wyslij(f);
          zrobione = true;
          d.close();
          if (komunikat && komunikatOk) komunikat(komunikatOk, 'ok');
        } catch (e) {
          pokaz(bezSieci(e) ? bezSieciTekst : e.message);
          if (poBledzie) poBledzie(e, f);
        } finally {
          przycisk.disabled = false;
        }
      });
      d.showModal();
      const pierwsze = f.querySelector('input');
      if (pierwsze) pierwsze.focus();
    });
  }

  /* Moje konto → „Zmień hasło” (D43 §4): obecne hasło + nowe ×2. To urządzenie dostaje nowy znacznik (hala.zmienHaslo). */
  function zmienHaslo(hala, opcje) {
    const o = Object.assign({ komunikat: null }, opcje || {});
    const p = hala.pracownik || {};
    const d = okno('hala-okno-hasla');
    d.innerHTML = `
      <form method="dialog" autocomplete="off">
        <h2 id="hala-okno-hasla-tytul">Zmień hasło</h2>
        <p class="hala-okno-opis">${esc(p.nazwa || '')} · To hasło działa we wszystkich aplikacjach GK. Wpisujesz je raz na 16 godzin
          na urządzeniu, na co dzień — PIN. Min. 8 znaków. Inne urządzenia poproszą o nowe hasło.</p>
        <label>Obecne hasło<input name="stare" type="password" autocomplete="current-password" maxlength="128"></label>
        <label>Nowe hasło (min. 8 znaków)<input name="nowe" type="password" autocomplete="new-password" maxlength="128"></label>
        <label>Powtórz nowe hasło<input name="powtorz" type="password" autocomplete="new-password" maxlength="128"></label>
        <p class="hala-okno-blad" role="alert" hidden></p>
        <div class="hala-okno-przyciski"><button type="button" data-anuluj>Anuluj</button><button class="glowny" type="submit">Zmień hasło</button></div>
      </form>`;
    return prowadzOkno(d, {
      bledy: f => bledyHasla({ stare: f.stare.value, nowe: f.nowe.value, powtorz: f.powtorz.value, nazwa: p.nazwa, wymagajStarego: true }),
      wyslij: f => hala.zmienHaslo(f.stare.value.trim(), f.nowe.value.trim()),
      poBledzie: (e, f) => { if (e && e.kod === 403) { f.stare.value = ''; f.stare.focus(); } },
      komunikatOk: 'Hasło zmienione — działa we wszystkich aplikacjach GK.', komunikat: o.komunikat,
      bezSieciTekst: 'Zmiana hasła wymaga połączenia z serwerem. Sprawdź sieć i spróbuj jeszcze raz.',
    });
  }

  /* Moje konto → „Zmień PIN” (D43 §4): obecne hasło albo PIN + nowy PIN ×2 (4 cyfry). */
  function zmienPin(hala, opcje) {
    const o = Object.assign({ komunikat: null }, opcje || {});
    const p = hala.pracownik || {};
    const d = okno('hala-okno-pinu');
    d.innerHTML = `
      <form method="dialog" autocomplete="off">
        <h2 id="hala-okno-pinu-tytul">Zmień PIN</h2>
        <p class="hala-okno-opis">${esc(p.nazwa || '')} · Ten PIN działa we wszystkich aplikacjach GK — na urządzeniu, na którym
          w ciągu 16 godzin wpisano hasło. PIN to 4 cyfry. Inne zalogowane urządzenia trzeba będzie zalogować od nowa.</p>
        <label>Obecne hasło albo PIN<input name="stary" type="password" autocomplete="current-password" maxlength="128"></label>
        <label>Nowy PIN (4 cyfry)<input name="nowy" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4"></label>
        <label>Powtórz nowy PIN<input name="powtorz" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4"></label>
        <p class="hala-okno-blad" role="alert" hidden></p>
        <div class="hala-okno-przyciski"><button type="button" data-anuluj>Anuluj</button><button class="glowny" type="submit">Zmień PIN</button></div>
      </form>`;
    return prowadzOkno(d, {
      bledy: f => bledyPinu({ stary: f.stary.value, nowy: f.nowy.value, powtorz: f.powtorz.value }),
      wyslij: f => hala.zmienPin(f.stary.value.trim(), f.nowy.value.trim()),
      poBledzie: (e, f) => { if (e && e.kod === 403) { f.stary.value = ''; f.stary.focus(); } },
      komunikatOk: 'PIN zmieniony — działa we wszystkich aplikacjach GK.', komunikat: o.komunikat,
      bezSieciTekst: 'Zmiana PIN-u wymaga połączenia z serwerem. Sprawdź sieć i spróbuj jeszcze raz.',
    });
  }

  /* Treść okna „Ustaw hasło i PIN” (D43 §3a) — czysta funkcja, testy: reduktor-testy.js. doUstawienia: ['haslo','pin']. */
  function trescUstawienia({ nazwa, doUstawienia }) {
    const haslo = (doUstawienia || []).includes('haslo'), pin = (doUstawienia || []).includes('pin');
    const tytul = haslo && pin ? 'Ustaw hasło i PIN' : haslo ? 'Ustaw nowe hasło' : 'Ustaw PIN';
    return `<form method="dialog" autocomplete="off">
        <h2 id="hala-okno-ustaw-tytul">${tytul}</h2>
        <p class="hala-okno-opis">${esc(nazwa || '')} · ${haslo ? 'Hasło startowe działa tylko przy pierwszym logowaniu. ' : ''}Hasło
          wpiszesz raz na 16 godzin na tym urządzeniu, na co dzień — PIN. Oba działają we wszystkich aplikacjach GK.</p>
        ${haslo ? `<label>Nowe hasło (min. 8 znaków)<input name="haslo" type="password" autocomplete="new-password" maxlength="128"></label>
        <label>Powtórz nowe hasło<input name="haslo2" type="password" autocomplete="new-password" maxlength="128"></label>` : ''}
        ${pin ? `<label>PIN (4 cyfry)<input name="pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4"></label>
        <label>Powtórz PIN<input name="pin2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4"></label>` : ''}
        <p class="hala-okno-blad" role="alert" hidden></p>
        <div class="hala-okno-przyciski"><button type="button" data-anuluj>Anuluj</button><button class="glowny" type="submit">Zapisz i wejdź</button></div>
      </form>`;
  }

  /* Okno „Ustaw hasło i PIN” po logowaniu hasłem startowym (albo bez PIN-u). Obietnica: pracownik (zalogowany),
     false — anulowano. Błąd „brak dostępu” (konto bez roli tej aplikacji) — odrzucenie z tekstem huba. */
  function ustawKonto(hala, opcje) {
    const o = Object.assign({ komunikat: null }, opcje || {});
    const u = hala.ustawienieKonta ? hala.ustawienieKonta() : null;
    if (!u) return Promise.resolve(false);
    const d = okno('hala-okno-ustaw');
    d.innerHTML = trescUstawienia({ nazwa: u.pracownik && u.pracownik.nazwa, doUstawienia: u.doUstawienia });
    let wynik = false, bladDostepu = null;
    const nazwa = u.pracownik && u.pracownik.nazwa;
    return prowadzOkno(d, {
      bledy: f => [
        ...(f.haslo ? bledyHasla({ nowe: f.haslo.value, powtorz: f.haslo2.value, nazwa }) : []),
        ...(f.pin ? bledyPinu({ nowy: f.pin.value, powtorz: f.pin2.value, wymagajStarego: false }) : []),
      ],
      wyslij: async f => {
        try {
          wynik = await hala.ustawKonto({ haslo: f.haslo ? f.haslo.value.trim() : '', pin: f.pin ? f.pin.value.trim() : '' });
        } catch (e) {
          if (e && e.ustawione) { bladDostepu = e; return; }     // hasło i PIN zapisane — tylko ta aplikacja nie dla tej osoby
          throw e;
        }
      },
      komunikatOk: null, komunikat: o.komunikat,
      bezSieciTekst: 'Ustawienie hasła i PIN-u wymaga połączenia z serwerem. Sprawdź sieć i spróbuj jeszcze raz.',
    }).then(zrobione => {
      if (!zrobione && hala.anulujUstawienie) hala.anulujUstawienie();
      if (bladDostepu) throw bladDostepu;
      if (zrobione && o.komunikat) o.komunikat('Hasło i PIN ustawione — działają we wszystkich aplikacjach GK.', 'ok');
      return zrobione ? wynik : false;
    });
  }

  /* Logowanie z oknem pierwszego logowania (D43): jak hala.zaloguj, ale hasło startowe (albo brak PIN-u) otwiera okno
     „Ustaw hasło i PIN”; po zapisie osoba jest zalogowana. Anulowane okno → błąd „Ustaw hasło i PIN, żeby wejść.” */
  async function zaloguj(hala, dane, opcje) {
    try {
      return await hala.zaloguj(dane);
    } catch (e) {
      if (!e || e.kod !== 'do_ustawienia') throw e;
      const p = await ustawKonto(hala, opcje);
      if (!p) { const b = new Error('Ustaw nowe hasło i PIN, żeby wejść.'); b.kod = 400; throw b; }
      return p;
    }
  }

  /* Pole sekretu na ekranie logowania (D43, STYL-GK §2): osoba z ważnym znacznikiem na tym urządzeniu → „PIN (4 cyfry)”
     z klawiaturą cyfr, inaczej „Hasło (raz na 16 godzin na tym urządzeniu)” z pełną klawiaturą. Tryb liczy się przy
     każdej zmianie pola identyfikatora; przycisk przelacz (opcjonalny) zmienia go ręcznie („Zaloguj hasłem” — zapomniany
     PIN; „Zaloguj PIN-em” tylko, gdy znacznik jest). naZmiane(tryb) — np. Lider chowa klawiaturę cyfr przy haśle.
     Zwraca { tryb(), odswiez(), haslo() } — odswiez() po błędzie „wymagane_haslo” (znacznik już zapomniany). */
  const ETYKIETY = { pin: 'PIN (4 cyfry)', haslo: 'Hasło (raz na 16 godzin na tym urządzeniu)' };
  function poleLogowania({ hala, ident, sekret, etykieta, przelacz, naZmiane, slowaPrzelacznika }) {
    const slowa = Object.assign({ pin: 'Zaloguj hasłem', haslo: 'Zaloguj PIN-em' }, slowaPrzelacznika || {});
    let reczny = null, ostatni = null;
    const auto = () => (hala.trybLogowania ? hala.trybLogowania(ident.value) : 'haslo');
    function rysuj() {
      const a = auto();
      if (reczny === 'pin' && a !== 'pin') reczny = null;        // PIN-em tylko z ważnym znacznikiem
      const tryb = reczny || a;
      if (etykieta) etykieta.textContent = ETYKIETY[tryb];
      sekret.inputMode = tryb === 'pin' ? 'numeric' : 'text';
      sekret.maxLength = tryb === 'pin' ? 4 : 128;
      sekret.autocomplete = tryb === 'pin' ? 'off' : 'current-password';
      sekret.dataset.tryb = tryb;
      if (przelacz) {
        przelacz.hidden = a !== 'pin';                            // bez znacznika nie ma czego przełączać
        przelacz.textContent = tryb === 'pin' ? slowa.pin : slowa.haslo;
      }
      if (tryb !== ostatni) { ostatni = tryb; if (naZmiane) naZmiane(tryb); }
      return tryb;
    }
    ident.addEventListener('input', () => { reczny = null; rysuj(); });
    if (przelacz) przelacz.addEventListener('click', () => {
      reczny = (reczny || auto()) === 'pin' ? 'haslo' : 'pin';
      sekret.value = '';
      rysuj();
      sekret.focus();
    });
    rysuj();
    return { tryb: () => sekret.dataset.tryb, odswiez: () => { reczny = null; return rysuj(); },
             haslo: () => { reczny = 'haslo'; return rysuj(); } };
  }

  /* Przyciski „Zmień hasło” i „Zmień PIN” (D43 §4) do wstawienia w „Moje konto”. Konto ekranu ich nie dostaje —
     PIN monitora zmienia administrator. */
  function przycisk(el, hala, opcje) {
    if (!el) return null;
    const p = hala.pracownik;
    if (!p || ekran(p)) { el.innerHTML = ''; return null; }
    el.innerHTML = '<button type="button" class="hala-zmien-haslo">Zmień hasło</button><button type="button" class="hala-zmien-pin">Zmień PIN</button>';
    el.querySelector('.hala-zmien-haslo').addEventListener('click', () => zmienHaslo(hala, opcje));
    const b = el.querySelector('.hala-zmien-pin');
    b.addEventListener('click', () => zmienPin(hala, opcje));
    return b;
  }

  /* Ikona osoby na przycisku „Moje konto” w nagłówku (STYL-GK §3, runda 2): SVG w kolorze currentColor — biała na
     grafitowym pasku. Emoji 👤 Windows rysuje fioletowo i ginie na grafitowym pasku. Kształt jest kanoniczny — ten sam
     we wszystkich aplikacjach webowych GK (GK Trasy, GK Flota) — nie zmieniać tylko tutaj. Wszystkie cztery aplikacje
     (także Lider) mają go wpisany w index.html; ta stała to wzorzec, z którym t_aplikacje.py porównuje ich nagłówki,
     i ikona dla ekranu, który rysowałby nagłówek w JS. */
  const IKONA_KONTA = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" fill="currentColor"/></svg>';

  /* ---------------------------------------------------------------- „Moje konto” (STYL-GK §3, 2026-10-06)

     Jedno okno konta dla Panelu, Lidera, UR i KJ: ikona osoby w nagłówku → imię i nazwisko
     (i rola), Wygląd, Zmień hasło i Zmień PIN (D43), rzeczy tej aplikacji (dodatki), Dane w tym urządzeniu, wersja, Wyloguj. Jak „Moje konto”
     w GK Trasy i GK Flota — osoba z kilkoma programami szuka tego samego w tym samym miejscu.
       HalaKonto.mojeKonto(hala, { aplikacja: 'ur', komunikat, wyloguj: async () => …, odrzucone: () => …,
                                   dodatki: el => … })
     wyloguj — wylogowanie aplikacji (pyta o kolejkę, rysuje ekran logowania); odrzucone — otwiera listę odrzuconych
     (przycisk widać, gdy coś jest); dodatki(el) — dorysowuje części tej aplikacji (Lider: linia, powiadomienia). */

  /* Wygląd: ta sama reguła (brak wyboru = jak urządzenie), inne słowo — na telefonie „Jak w telefonie”, na komputerze
     „Jak w systemie” (STYL-GK §4; §6: na komputerze nie piszemy „telefon”). Próg jak w GK Trasy / GK Flota
     (app.js → wyborWygladu) i w hala.css: komputer od 821 px szerokości. Słowo ustala się przy otwarciu okna. */
  function naKomputerze() {
    return typeof global.matchMedia === 'function' && global.matchMedia('(min-width:821px)').matches;
  }
  const wyglady = komputer => [['auto', komputer ? 'Jak w systemie' : 'Jak w telefonie'], ['jasny', 'Jasny'], ['ciemny', 'Ciemny']];

  /* Treść okna (czysta funkcja — testy: reduktor-testy.js). dane: {nazwa, role: [nazwy], wyglad, komputer, czeka, cudze,
     odrzucone, zOdrzuconymi, pin} → HTML. komputer — szerokość komputera (naKomputerze()); bez niego słowa telefonu. */
  function trescKonta(dane) {
    const d = dane || {};
    return `<form method="dialog" autocomplete="off">
        <h2 id="hala-okno-konta-tytul">Moje konto</h2>
        <p class="hala-konto-kto"><b>${esc(d.nazwa || '—')}</b>${(d.role || []).length ? `<span>${esc(d.role.join(', '))}</span>` : ''}</p>
        <fieldset><legend>Wygląd</legend>
          <div class="hala-wybor" role="group" aria-label="Wygląd">${wyglady(d.komputer).map(([k, n]) =>
            `<button type="button" data-wyglad="${k}" aria-pressed="${d.wyglad === k}">${n}</button>`).join('')}</div>
          <p class="hala-konto-drobne">Dotyczy tego urządzenia, nie konta — zostaje po wylogowaniu.</p>
        </fieldset>
        ${d.pin ? '<div data-pin></div>' : ''}
        ${d.pin ? `<button type="button" class="hala-konto-aplikacje" data-aplikacje>${d.komputer ? '📱 Kody QR aplikacji' : '📱 Aplikacje na telefon — kody QR'}</button>` : ''}
        <div data-dodatki></div>
        <fieldset><legend>Dane w tym urządzeniu</legend>
          <p class="hala-konto-drobne" data-kolejka>Czeka na wysłanie: ${Number(d.czeka) || 0}${d.cudze ? ` (+${d.cudze} od innych osób)` : ''}</p>
          ${d.odrzucone && d.zOdrzuconymi ? `<button type="button" data-odrzucone>Nie wysłane: ${Number(d.odrzucone)}</button>` : ''}
        </fieldset>
        <p class="hala-konto-drobne" data-wersja></p>
        <div class="hala-okno-przyciski"><button type="button" data-zamknij>Zamknij</button><button type="button" class="glowny" data-wyloguj>Wyloguj</button></div>
      </form>`;
  }

  async function mojeKonto(hala, opcje) {
    const o = Object.assign({ aplikacja: hala.aplikacja, komunikat: null, wyloguj: null, odrzucone: null, dodatki: null }, opcje || {});
    let d = document.getElementById('hala-okno-konta');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'hala-okno-konta';
      d.className = 'hala-okno hala-moje-konto';
      d.setAttribute('aria-labelledby', 'hala-okno-konta-tytul');
      document.body.appendChild(d);
    }
    const p = hala.pracownik || {};
    const nazwyRol = ((hala.kontrakt && hala.kontrakt.stale && hala.kontrakt.stale.role) || {});
    const k = hala.stanKolejki ? hala.stanKolejki() : { oczekuje: 0, moje: 0 };
    let odrzucone = 0;
    try { odrzucone = (await hala.odrzucone()).length; } catch (e) { /* bez IndexedDB — nic nie pokazujemy */ }
    const ekran = (p.role || []).length === 1 && p.role[0] === 'ekran';
    const motyw = global.HalaMotyw;
    d.innerHTML = trescKonta({ nazwa: p.nazwa, role: (p.role || []).map(r => nazwyRol[r] || r), wyglad: motyw ? motyw.odczytaj() : 'auto',
                               komputer: naKomputerze(), czeka: k.moje || 0, cudze: Math.max(0, (k.oczekuje || 0) - (k.moje || 0)), odrzucone,
                               zOdrzuconymi: typeof o.odrzucone === 'function', pin: !ekran });
    if (!ekran) przycisk(d.querySelector('[data-pin]'), hala, { komunikat: o.komunikat });
    if (typeof o.dodatki === 'function') o.dodatki(d.querySelector('[data-dodatki]'));
    if (global.HalaAktualizacja) global.HalaAktualizacja.wpiszWersje(d.querySelector('[data-wersja]'), o.aplikacja);
    d.querySelector('.hala-wybor').addEventListener('click', ev => {
      const b = ev.target.closest('[data-wyglad]');
      if (!b || !motyw) return;
      if (!motyw.ustaw(b.dataset.wyglad) && o.komunikat) o.komunikat('Urządzenie nie zapamięta wyboru (tryb prywatny?) — działa do zamknięcia karty.', 'uwaga');
      for (const x of d.querySelectorAll('[data-wyglad]')) x.setAttribute('aria-pressed', String(x === b));
    });
    d.querySelector('[data-zamknij]').addEventListener('click', () => d.close());
    const ba = d.querySelector('[data-aplikacje]');
    if (ba) ba.addEventListener('click', () => { d.close(); aplikacjeNaTelefon(hala, o); });
    const bo = d.querySelector('[data-odrzucone]');
    if (bo) bo.addEventListener('click', () => { d.close(); o.odrzucone(); });
    d.querySelector('[data-wyloguj]').addEventListener('click', () => { d.close(); if (o.wyloguj) o.wyloguj(); });
    if (!d.open) d.showModal();
    return d;
  }

  /* ---------------------------------------------------------------- 📱 Aplikacje na telefon (D57, 2026-10-13)

     Właściciel: „kierownik ma mieć każdy QR do zalogowania do każdej z aplikacji; pracownicy — do swoich i do aplikacji
     na użytek każdego (GK Szkolenia, GK Czytnik)”. Lista z huba (GET /api/v1/aplikacje — według ról osoby), kod QR
     rysowany tu z koderem ZXing (skaner-zxing.js obok, jak etykiety maszyn w Panelu). Telefon skanuje aparatem i otwiera
     adres — logowanie tym samym kontem GK. GK Czytnik i GK Foto są tylko na komputerze (bez kodu). */
  function wczytajZXing() {
    if (global.ZXing) return Promise.resolve(global.ZXing);
    return new Promise((ok, zle) => {
      const s = document.createElement('script');
      s.src = '../wspolne/skaner-zxing.js';
      s.onload = () => (global.ZXing ? ok(global.ZXing) : zle(new Error('Brak kodera QR.')));
      s.onerror = () => zle(new Error('Nie udało się wczytać kodera QR. Sprawdź połączenie i spróbuj jeszcze raz.'));
      document.head.appendChild(s);
    });
  }
  /* Kod QR jako SVG (poziom korekcji M, margines 4 moduły) — ten sam sposób co PanelEtykiety.svgQR. */
  function svgQR(tekst, ZX) {
    const kod = ZX.QRCodeEncoder.encode(String(tekst), ZX.QRCodeDecoderErrorCorrectionLevel.fromString('M'), null);
    const m = kod.getMatrix(), n = m.getWidth(), MARG = 4, bok = n + 2 * MARG;
    let sciezka = '';
    for (let y = 0; y < m.getHeight(); y++) for (let x = 0; x < n; x++) if (m.get(x, y) === 1) sciezka += `M${x + MARG} ${y + MARG}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bok} ${bok}" shape-rendering="crispEdges" role="img" aria-label="${esc(tekst)}">`
      + `<rect width="${bok}" height="${bok}" fill="#fff"/><path d="${sciezka}" fill="#000"/></svg>`;
  }
  /* Wiersze okna (czysta funkcja — testy: reduktor-testy.js): z kodem (adres albo adres w firmowym wifi) albo bez. */
  function wierszeAplikacji(lista) {
    return (lista || []).map(a => {
      const adres = a.adres || a.siec || null;
      // D61: stały adres = GitHub Pages (aplikacje hali, GK Trasy, GK Flota). Tunel i adres w sieci firmy (GK Szkolenia,
      // GK Wycena) zmieniają się po ponownym uruchomieniu programu — wydrukowany kod przestaje wtedy działać.
      return { kod: a.kod || '', nazwa: a.nazwa, adres, tylkoSiec: !a.adres && !!a.siec, komputer: !!a.komputer, opis: a.opis || '',
               staly: !!adres && /^https:\/\/[^/]+\.github\.io\//.test(adres) };
    });
  }

  /* D61 (właściciel 2026-10-14: „daj mi opcję wydrukowania kodów QR do aplikacji mobilnych — jednego kodu do jednej
     aplikacji i do całości”): arkusz A4 z kodami aplikacji (czysta funkcja — testy: reduktor-testy.js). wiersze =
     wierszeAplikacji (tylko z adresem), svg = tekst → SVG kodu. Duży kod (55 mm), nazwa, jak wejść, adres; przy adresie
     tymczasowym — ostrzeżenie, żeby wydrukować go jeszcze raz po ponownym uruchomieniu programu. */
  function arkuszKodow(wiersze, svg) {
    const karty = (wiersze || []).filter(a => a && a.adres).map(a => `<section class="karta">
      <div class="qr">${svg(a.adres)}</div>
      <div class="opis"><h2>${esc(a.nazwa)}</h2>
        <p>Zeskanuj aparatem telefonu, otwórz stronę i dodaj ją do ekranu głównego.</p>
        ${a.opis ? `<p>${esc(a.opis)}</p>` : ''}
        ${a.tylkoSiec ? '<p class="uwaga">Działa tylko w firmowym wifi.</p>' : ''}
        ${a.staly ? '' : '<p class="uwaga">Adres tymczasowy — po ponownym uruchomieniu programu wydrukuj ten kod jeszcze raz.</p>'}
        <p class="adres">${esc(a.adres)}</p></div></section>`).join('');
    // Właściciel 2026-10-15: „kody QR do wszystkich aplikacji, nie tylko produkcyjnych” — arkusz wymienia też te bez kodu
    // (tylko komputer albo program w biurze nie działa), żeby nikt nie szukał brakującej karty.
    const bez = bezKodu(wiersze);
    const stopka = [bez.komputer.length ? `Tylko na komputerze (bez kodu): ${bez.komputer.map(esc).join(', ')}.` : '',
      bez.niedziala.length ? `Bez kodu — program w biurze wyłączony albo jeszcze nie na GitHub Pages: ${bez.niedziala.map(esc).join(', ')}.` : '']
      .filter(Boolean).map(x => `<p>${x}</p>`).join('');
    return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Kody QR aplikacji GK</title><style>
      @page { size: A4; margin: 12mm; }
      body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #111; background: #fff; }
      .arkusz { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
      .karta { display: grid; grid-template-rows: auto 1fr; justify-items: center; gap: 3mm; padding: 5mm; border: .3mm dashed #888;
               break-inside: avoid; page-break-inside: avoid; text-align: center; }
      .qr svg { display: block; width: 55mm; height: 55mm; }
      h2 { margin: 0 0 2mm; font-size: 16pt; }
      p { margin: 0 0 1.5mm; font-size: 9pt; line-height: 1.3; }
      .uwaga { font-weight: 700; }
      .adres { font-family: Consolas, monospace; font-size: 7.5pt; overflow-wrap: anywhere; color: #444; }
      .stopka { margin-top: 5mm; color: #444; }
    </style></head><body><div class="arkusz">${karty}</div>${stopka ? `<div class="stopka">${stopka}</div>` : ''}</body></html>`;
  }

  /* Aplikacje bez kodu QR (czysta funkcja — testy: reduktor-testy.js): komputer — GK Czytnik, GK Foto; niedziala — program
     w biurze (GK Szkolenia, GK Wycena) wyłączony albo aplikacji jeszcze nie ma na GitHub Pages. */
  function bezKodu(wiersze) {
    const lista = (wiersze || []).filter(a => a && !a.adres);
    return { komputer: lista.filter(a => a.komputer).map(a => a.nazwa), niedziala: lista.filter(a => !a.komputer).map(a => a.nazwa) };
  }

  /* Druk kodów wszystkich aplikacji konta (okno „Kody QR aplikacji” i Panel → Administracja → Serwis): lista z huba według
     ról — kierownik zakładu i administrator dostają każdą aplikację GK, nie tylko cztery aplikacje hali. Zwraca bezKodu. */
  async function drukujKodyAplikacji(hala) {
    const w = wierszeAplikacji((await hala.aplikacje()).aplikacje);
    if (!w.some(a => a.adres)) throw new Error('Żadna aplikacja nie ma jeszcze adresu — najpierw „Wyślij aplikacje na GitHub”.');
    const ZX = await wczytajZXing();
    drukujArkusz(arkuszKodow(w, t => svgQR(t, ZX)));
    return bezKodu(w);
  }

  /* Druk arkusza w ukrytej ramce — działa w każdej aplikacji GK bez jej własnego CSS druku (okno Moje konto jest wspólne). */
  function drukujArkusz(html) {
    const ramka = document.createElement('iframe');
    ramka.setAttribute('aria-hidden', 'true');
    ramka.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    const sprzatnij = () => setTimeout(() => ramka.remove(), 1000);
    ramka.onload = () => {
      const w = ramka.contentWindow;
      w.addEventListener('afterprint', sprzatnij);
      w.focus();
      w.print();
      setTimeout(() => { if (ramka.isConnected) ramka.remove(); }, 120000);   // przeglądarka bez afterprint
    };
    ramka.srcdoc = html;
    document.body.appendChild(ramka);
  }
  async function aplikacjeNaTelefon(hala, opcje) {
    let d = document.getElementById('hala-okno-aplikacji');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'hala-okno-aplikacji';
      d.className = 'hala-okno hala-moje-konto hala-aplikacje-telefon';
      d.setAttribute('aria-labelledby', 'hala-okno-aplikacji-tytul');
      document.body.appendChild(d);
    }
    // D64: tytuł jak przycisk, który je otworzył — na komputerze „Kody QR aplikacji” (STYL-GK §6: bez „telefon” na komputerze).
    d.innerHTML = `<form method="dialog"><h2 id="hala-okno-aplikacji-tytul">${naKomputerze() ? '📱 Kody QR aplikacji' : '📱 Aplikacje na telefon'}</h2>
      <p class="hala-okno-opis">Zeskanuj kod aparatem telefonu, otwórz stronę i dodaj ją do ekranu głównego. Aplikacje hali, GK Trasy
        i GK Flota — konto GK (imię i nazwisko, hasło, potem PIN); inne logowanie jest opisane przy aplikacji.</p>
      <div class="hala-aplikacje-lista" data-lista><p class="hala-okno-opis">Wczytuję…</p></div>
      <div class="hala-okno-przyciski"><button type="button" data-drukuj-wszystkie hidden>🖨 Drukuj wszystkie</button>
        <button type="button" data-zamknij>Zamknij</button></div></form>`;   /* Zamknij zawsze obrysowany (STYL-GK §3) */
    d.querySelector('[data-zamknij]').addEventListener('click', () => d.close());
    d.showModal();
    const el = d.querySelector('[data-lista]');
    try {
      const w = wierszeAplikacji((await hala.aplikacje()).aplikacje);
      el.innerHTML = w.map((a, i) => `<figure class="hala-aplikacja">
          ${a.adres ? `<div class="hala-aplikacja-qr" data-qr="${esc(a.adres)}"></div>` : `<div class="hala-aplikacja-qr brak">${a.komputer ? '💻' : '—'}</div>`}
          <figcaption><b>${esc(a.nazwa)}</b>
            ${a.adres ? `<a href="${esc(a.adres)}" target="_blank" rel="noopener">${esc(a.adres)}</a>` : ''}
            ${a.tylkoSiec ? '<span class="hala-konto-drobne">Tylko w firmowym wifi.</span>' : ''}
            ${a.opis ? `<span class="hala-konto-drobne">${esc(a.opis)}</span>` : ''}
            ${a.adres ? `<button type="button" class="hala-aplikacja-drukuj" data-drukuj="${i}">🖨 Drukuj kod</button>` : ''}</figcaption></figure>`).join('')
        || '<p class="hala-okno-opis">To konto nie ma aplikacji na telefon.</p>';
      const pola = [...el.querySelectorAll('[data-qr]')];
      if (pola.length) {
        const ZX = await wczytajZXing();
        for (const p of pola) p.innerHTML = svgQR(p.dataset.qr, ZX);
        // D61: druk — jeden kod (przycisk przy aplikacji) albo wszystkie z adresem naraz.
        const drukuj = lista => drukujArkusz(arkuszKodow(lista, t => svgQR(t, ZX)));
        const wszystkie = d.querySelector('[data-drukuj-wszystkie]');
        wszystkie.hidden = false;
        wszystkie.addEventListener('click', () => drukuj(w));
        el.addEventListener('click', ev => {
          const b = ev.target.closest('[data-drukuj]');
          if (b) drukuj([w[+b.dataset.drukuj]]);
        });
      }
    } catch (e) {
      el.innerHTML = `<p class="hala-okno-blad">${esc(e && e.kod === 0 ? 'Lista aplikacji wymaga połączenia z serwerem.' : (e && e.message) || 'Nie udało się wczytać listy.')}</p>`;
    }
  }

  /* ---------------------------------------------------------------- Powiadomienia w „Moje konto” (STYL-GK §3, runda 2)

     Jedna sekcja w Panelu i w Liderze — ten sam wygląd i te same słowa: legenda „Powiadomienia”, zdanie, o czym, i
     jeden przycisk „Włącz powiadomienia” albo stan „Włączone…”. „Zablokowane…” zwykłym tekstem 14 px w kolorze
     ostrzeżenia (--uwaga), bez natywnego checkboxa i bez drugiego nagłówka.
       HalaKonto.powiadomienia(el, hala, { opis: 'O czym…', lokalne: true, komunikat })
     lokalne — aplikacja sama pokazuje powiadomienia przy otwartej karcie (Lider), więc tam, gdzie push nie działa
     (http, iPhone poza ekranem początkowym), zgoda przeglądarki i tak się przydaje. Panel tego nie robi (kafelek
     „Zlecenia po terminie” świeci) — tam mówimy wprost, że tutaj nie działa. */

  /* Treść stanu (czysta funkcja — testy: reduktor-testy.js). stan: hala.push.stan(); zgoda: Notification.permission
     tylko w bezpiecznym kontekście (pod http://192.168… przeglądarka zgłasza „denied”, choć nikt niczego nie zablokował). */
  function trescPowiadomien({ stan, zgoda, lokalne }) {
    const ok = t => `<p class="hala-push-ok">${t}</p>`;
    const przycisk = (co, t, glowny) => `<button type="button"${glowny ? ' class="glowny"' : ''} data-push="${co}">${t}</button>`;
    const zablokowane = '<p class="hala-push-uwaga">Zablokowane — zezwól na powiadomienia w ustawieniach przeglądarki dla tej strony.</p>';
    const https = 'potrzebny adres https, a na iPhonie aplikacja dodana do ekranu początkowego (iOS 16.4+).';
    if (stan === 'wlaczone') return ok('Włączone — także przy zamkniętej aplikacji') + przycisk('wylacz', 'Wyłącz');
    if (stan === 'zablokowane' || (lokalne && zgoda === 'denied')) return zablokowane;
    if (stan === 'wylaczone') return lokalne && zgoda === 'granted'
      ? ok('Włączone, gdy aplikacja jest otwarta') + przycisk('wlacz', 'Włącz też przy zamkniętej aplikacji', true)
      : przycisk('wlacz', 'Włącz powiadomienia', true);
    if (!lokalne) return `<p class="hala-konto-drobne">Niedostępne tutaj: ${https}</p>`;
    return (zgoda === 'granted' ? ok('Włączone, gdy aplikacja jest otwarta') : zgoda === 'default' ? przycisk('zgoda', 'Włącz powiadomienia', true) : '')
      + `<p class="hala-konto-drobne">Przy zamkniętej aplikacji: ${https}</p>`;
  }

  async function powiadomienia(el, hala, opcje) {
    if (!el) return;
    const o = Object.assign({ opis: '', lokalne: false, komunikat: null }, opcje || {});
    const powiedz = (t, r) => { if (o.komunikat) o.komunikat(t, r); };
    // „Sprawdź dźwięki” (2026-10-16, jeden zestaw dźwięków GK): w tym samym miejscu w każdej aplikacji — Moje konto →
    // Powiadomienia. Gra kolejno info, pilne i awarię (HalaDzwieki.sprawdz), więc człowiek wie, jak brzmi każdy sygnał.
    const dzwieki = o.dzwieki !== false && !!(global.HalaDzwieki && global.HalaDzwieki.sprawdz);
    el.innerHTML = `<fieldset class="hala-konto-push"><legend>Powiadomienia</legend>
        ${o.opis ? `<p class="hala-konto-drobne">${esc(o.opis)}</p>` : ''}<div data-push-stan></div>
        ${dzwieki ? '<button type="button" data-test-dzwieku>🔊 Sprawdź dźwięki</button>' : ''}</fieldset>`;
    const miejsce = el.querySelector('[data-push-stan]');
    const test = el.querySelector('[data-test-dzwieku]');
    if (test) test.addEventListener('click', () => global.HalaDzwieki.sprawdz());
    const rysuj = async () => {
      let stan = 'niedostepne';
      try { stan = await hala.push.stan(); } catch (e) { /* stara przeglądarka — jak niedostępne */ }
      const zgoda = 'Notification' in global && global.isSecureContext ? global.Notification.permission : 'brak';
      miejsce.innerHTML = trescPowiadomien({ stan, zgoda, lokalne: o.lokalne });
      const b = miejsce.querySelector('[data-push]');
      if (b) b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          if (b.dataset.push === 'zgoda') await global.Notification.requestPermission();
          else {
            await hala.push[b.dataset.push]();
            powiedz(b.dataset.push === 'wlacz' ? 'Powiadomienia włączone' : 'Powiadomienia wyłączone', 'ok');
          }
        } catch (e) { powiedz((e && e.message) || 'Nie udało się. Spróbuj jeszcze raz.', 'blad'); }
        rysuj();
      });
    };
    await rysuj();
  }

  global.HalaKonto = { aplikacjeNaTelefon, wierszeAplikacji, arkuszKodow, bezKodu, drukujKodyAplikacji, svgQR, zmienPin, zmienHaslo, ustawKonto, zaloguj, poleLogowania, przycisk, bledyPinu, bledyHasla, trescUstawienia,
                       biuro, bezSieci, mojeKonto, trescKonta, IKONA_KONTA, powiadomienia, trescPowiadomien, ETYKIETY };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.HalaKonto;
})(typeof window !== 'undefined' ? window : globalThis);
