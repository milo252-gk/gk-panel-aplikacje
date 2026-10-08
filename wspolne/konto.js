/* GK Panel Kierownika — wspólne okna konta: „Zmień hasło”, „Zmień PIN”, „Ustaw hasło i PIN” po pierwszym logowaniu
   i pole sekretu na ekranie logowania (D32: jedno konto we wszystkich aplikacjach GK; D43: hasło raz na 12 godzin na
   urządzeniu, na co dzień PIN 4 cyfry).

   Jedno okno dla Panelu, Lidera, UR i KJ (wszędzie z „Moje konto” — ikona osoby w nagłówku, niżej mojeKonto) — ten sam wygląd i te same
   słowa, jak Wygląd (motyw.js). Aplikacja woła:
       HalaKonto.zaloguj(hala, { identyfikator, pin }, { komunikat })   // jak hala.zaloguj; hasło startowe → okno „Ustaw hasło i PIN”
       HalaKonto.poleLogowania({ hala, ident, sekret, etykieta, przelacz, naZmiane })   // „Hasło (raz na 12 godzin…)” / „PIN (4 cyfry)”
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

  const bezSieci = e => !e || e instanceof TypeError || !e.kod;

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
        <p class="hala-okno-opis">${esc(p.nazwa || '')} · To hasło działa we wszystkich aplikacjach GK. Wpisujesz je raz na 12 godzin
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
      bezSieciTekst: 'Zmiana hasła wymaga połączenia z hubem. Sprawdź sieć i spróbuj jeszcze raz.',
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
          w ciągu 12 godzin wpisano hasło. PIN to 4 cyfry. Inne zalogowane urządzenia trzeba będzie zalogować od nowa.</p>
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
      bezSieciTekst: 'Zmiana PIN-u wymaga połączenia z hubem. Sprawdź sieć i spróbuj jeszcze raz.',
    });
  }

  /* Treść okna „Ustaw hasło i PIN” (D43 §3a) — czysta funkcja, testy: reduktor-testy.js. doUstawienia: ['haslo','pin']. */
  function trescUstawienia({ nazwa, doUstawienia }) {
    const haslo = (doUstawienia || []).includes('haslo'), pin = (doUstawienia || []).includes('pin');
    const tytul = haslo && pin ? 'Ustaw hasło i PIN' : haslo ? 'Ustaw nowe hasło' : 'Ustaw PIN';
    return `<form method="dialog" autocomplete="off">
        <h2 id="hala-okno-ustaw-tytul">${tytul}</h2>
        <p class="hala-okno-opis">${esc(nazwa || '')} · ${haslo ? 'Hasło startowe działa tylko przy pierwszym logowaniu. ' : ''}Hasło
          wpiszesz raz na 12 godzin na tym urządzeniu, na co dzień — PIN. Oba działają we wszystkich aplikacjach GK.</p>
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
      bezSieciTekst: 'Ustawienie hasła i PIN-u wymaga połączenia z hubem. Sprawdź sieć i spróbuj jeszcze raz.',
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
     z klawiaturą cyfr, inaczej „Hasło (raz na 12 godzin na tym urządzeniu)” z pełną klawiaturą. Tryb liczy się przy
     każdej zmianie pola identyfikatora; przycisk przelacz (opcjonalny) zmienia go ręcznie („Zaloguj hasłem” — zapomniany
     PIN; „Zaloguj PIN-em” tylko, gdy znacznik jest). naZmiane(tryb) — np. Lider chowa klawiaturę cyfr przy haśle.
     Zwraca { tryb(), odswiez(), haslo() } — odswiez() po błędzie „wymagane_haslo” (znacznik już zapomniany). */
  const ETYKIETY = { pin: 'PIN (4 cyfry)', haslo: 'Hasło (raz na 12 godzin na tym urządzeniu)' };
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
     we wszystkich aplikacjach webowych GK (GK Trasy, GK Flota) — nie zmieniać tylko tutaj. Aplikacje wstawiają go
     w index.html; Lider rysuje nagłówek w JS (app.js), więc bierze stałą stąd. */
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
        <div data-dodatki></div>
        <fieldset><legend>Dane w tym urządzeniu</legend>
          <p class="hala-konto-drobne" data-kolejka>Czeka na wysłanie: ${Number(d.czeka) || 0}${d.cudze ? ` (+${d.cudze} innej osoby)` : ''}</p>
          ${d.odrzucone && d.zOdrzuconymi ? `<button type="button" data-odrzucone>Odrzucone przez hub: ${Number(d.odrzucone)}</button>` : ''}
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
    const bo = d.querySelector('[data-odrzucone]');
    if (bo) bo.addEventListener('click', () => { d.close(); o.odrzucone(); });
    d.querySelector('[data-wyloguj]').addEventListener('click', () => { d.close(); if (o.wyloguj) o.wyloguj(); });
    if (!d.open) d.showModal();
    return d;
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
    el.innerHTML = `<fieldset class="hala-konto-push"><legend>Powiadomienia</legend>
        ${o.opis ? `<p class="hala-konto-drobne">${esc(o.opis)}</p>` : ''}<div data-push-stan></div></fieldset>`;
    const miejsce = el.querySelector('[data-push-stan]');
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

  global.HalaKonto = { zmienPin, zmienHaslo, ustawKonto, zaloguj, poleLogowania, przycisk, bledyPinu, bledyHasla, trescUstawienia,
                       biuro, mojeKonto, trescKonta, IKONA_KONTA, powiadomienia, trescPowiadomien, ETYKIETY };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.HalaKonto;
})(typeof window !== 'undefined' ? window : globalThis);
