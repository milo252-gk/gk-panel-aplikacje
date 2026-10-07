/* GK Panel Kierownika — wspólne okno „Zmień PIN” (D32: jedno konto we wszystkich aplikacjach GK).

   Jedno okno dla Panelu, Lidera, UR i KJ (wszędzie z „Moje konto” — ikona osoby w nagłówku, niżej mojeKonto) — ten sam wygląd i te same
   słowa, jak Wygląd (motyw.js). Aplikacja woła:
       HalaKonto.zmienPin(hala, { komunikat: (tekst, rodzaj) => … })   // obietnica: true = zmieniony, false = anulowano
   albo dorysowuje przycisk:  HalaKonto.przycisk(el, hala, { komunikat })   // <button>Zmień PIN</button>

   Reguły (te same co w hubie — hala.py → blad_sekretu): PIN 4–8 cyfr; osoba z rolą biura GK Trasy / GK Flota —
   hasło min. 8 znaków (litery też). Hub i tak sprawdza wszystko jeszcze raz; tu tylko podpowiadamy od razu.
   Okno to <dialog> w warstwie górnej — działa nad każdym ekranem aplikacji (także nad oknem menu Lidera).
   Wygląd: hala.css → .hala-okno. Bez sieci zmiany nie ma (hub musi sprawdzić obecny PIN) — mówimy to wprost. */

(function (global) {
  'use strict';

  const ROLE_BIUROWE = ['trasy_biuro', 'trasy_admin', 'flota_biuro', 'flota_admin'];
  // Ta sama lista co hub (hala.py → PINY_ODRZUCANE, D35): każda cyfra powtórzona 4–8 razy i proste ciągi.
  const OCZYWISTE = ['1234', '4321', '1122', '2580', '123456', '654321', '12345678', '87654321'];
  const oczywisty = p => /^(\d)\1{3,7}$/.test(p) || OCZYWISTE.includes(p);

  const biuro = pracownik => !!pracownik && (pracownik.role || []).some(r => ROLE_BIUROWE.includes(r));

  /* Błędy formularza po polsku (pusta lista = można wysłać). Czysta funkcja — testy: reduktor-testy.js. */
  function bledyPinu({ stary, nowy, powtorz, biuro: jestBiuro }) {
    const b = [];
    stary = String(stary || '').trim(); nowy = String(nowy || '').trim(); powtorz = String(powtorz || '').trim();
    if (!stary) b.push(jestBiuro ? 'Wpisz obecne hasło.' : 'Wpisz obecny PIN.');
    if (jestBiuro) {
      if (nowy.length < 8) b.push('Nowe hasło: min. 8 znaków (litery, cyfry, znaki) — masz rolę biura GK Trasy albo GK Flota.');
    } else if (!/^\d{4,8}$/.test(nowy)) b.push('Nowy PIN to 4–8 cyfr.');
    if (nowy && oczywisty(nowy.toLowerCase())) b.push('Ten PIN jest zbyt oczywisty — wybierz inny.');
    if (nowy && stary && nowy === stary) b.push('Nowy musi być inny niż obecny.');
    if (nowy && powtorz !== nowy) b.push('Powtórzony nie zgadza się z nowym.');
    return b;
  }

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function okno() {
    let o = document.getElementById('hala-okno-pinu');
    if (o) return o;
    o = document.createElement('dialog');
    o.id = 'hala-okno-pinu';
    o.className = 'hala-okno';
    o.setAttribute('aria-labelledby', 'hala-okno-pinu-tytul');
    document.body.appendChild(o);
    return o;
  }

  function zmienPin(hala, opcje) {
    const o = Object.assign({ komunikat: null }, opcje || {});
    const jestBiuro = biuro(hala.pracownik);
    const slowo = jestBiuro ? 'hasło' : 'PIN';
    // Biuro: zwykła klawiatura (litery); reszta: klawiatura cyfr, ale pole przyjmie też litery z klawiatury komputera.
    const tryb = jestBiuro ? 'text' : 'numeric';
    const d = okno();
    d.innerHTML = `
      <form method="dialog" autocomplete="off">
        <h2 id="hala-okno-pinu-tytul">Zmień ${slowo}</h2>
        <p class="hala-okno-opis">${esc(hala.pracownik ? hala.pracownik.nazwa : '')} · ten sam ${slowo} we wszystkich aplikacjach GK.
          ${jestBiuro ? 'Hasło min. 8 znaków.' : 'PIN 4–8 cyfr.'} Inne zalogowane urządzenia trzeba będzie zalogować od nowa.</p>
        <label>Obecny ${slowo}<input name="stary" type="password" inputmode="${tryb}" autocomplete="current-password" maxlength="128"></label>
        <label>Nowy ${slowo}<input name="nowy" type="password" inputmode="${tryb}" autocomplete="new-password" maxlength="128"></label>
        <label>Powtórz nowy<input name="powtorz" type="password" inputmode="${tryb}" autocomplete="new-password" maxlength="128"></label>
        <p class="hala-okno-blad" role="alert" hidden></p>
        <div class="hala-okno-przyciski"><button type="button" data-anuluj>Anuluj</button><button class="glowny" type="submit">Zmień ${slowo}</button></div>
      </form>`;
    const f = d.querySelector('form');
    const blad = d.querySelector('.hala-okno-blad');
    const pokaz = t => { blad.textContent = t; blad.hidden = !t; };
    return new Promise(gotowe => {
      let zmieniony = false;
      d.querySelector('[data-anuluj]').addEventListener('click', () => d.close());
      d.addEventListener('close', () => { f.reset(); gotowe(zmieniony); }, { once: true });
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const w = { stary: f.stary.value, nowy: f.nowy.value, powtorz: f.powtorz.value, biuro: jestBiuro };
        const bledy = bledyPinu(w);
        if (bledy.length) { pokaz(bledy.join(' ')); return; }
        const przycisk = f.querySelector('button[type=submit]');
        przycisk.disabled = true;
        try {
          await hala.zmienPin(w.stary.trim(), w.nowy.trim());
          zmieniony = true;
          d.close();
          if (o.komunikat) o.komunikat(`${jestBiuro ? 'Hasło zmienione' : 'PIN zmieniony'} — działa we wszystkich aplikacjach GK.`, 'ok');
        } catch (e) {
          pokaz(!e || e instanceof TypeError || !e.kod ? 'Zmiana PIN-u wymaga połączenia z hubem. Sprawdź sieć i spróbuj jeszcze raz.'
            : e.message);
          if (e && e.kod === 403) { f.stary.value = ''; f.stary.focus(); }
        } finally {
          przycisk.disabled = false;
        }
      });
      d.showModal();
    });
  }

  /* Przycisk „Zmień PIN” (albo „Zmień hasło”) do wstawienia obok Motywu. Konto ekranu go nie dostaje —
     PIN monitora zmienia administrator. */
  function przycisk(el, hala, opcje) {
    if (!el) return null;
    const p = hala.pracownik;
    if (!p || ((p.role || []).length === 1 && p.role[0] === 'ekran')) { el.innerHTML = ''; return null; }
    el.innerHTML = `<button type="button" class="hala-zmien-pin">${biuro(p) ? 'Zmień hasło' : 'Zmień PIN'}</button>`;
    const b = el.querySelector('button');
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
     (i rola), Wygląd, Zmień PIN, rzeczy tej aplikacji (dodatki), Dane w tym urządzeniu, wersja, Wyloguj. Jak „Moje konto”
     w GK Trasy i GK Flota — osoba z kilkoma programami szuka tego samego w tym samym miejscu.
       HalaKonto.mojeKonto(hala, { aplikacja: 'ur', komunikat, wyloguj: async () => …, odrzucone: () => …,
                                   dodatki: el => … })
     wyloguj — wylogowanie aplikacji (pyta o kolejkę, rysuje ekran logowania); odrzucone — otwiera listę odrzuconych
     (przycisk widać, gdy coś jest); dodatki(el) — dorysowuje części tej aplikacji (Lider: linia, powiadomienia). */

  const WYGLAD = [['auto', 'Jak w telefonie'], ['jasny', 'Jasny'], ['ciemny', 'Ciemny']];

  /* Treść okna (czysta funkcja — testy: reduktor-testy.js). dane: {nazwa, role: [nazwy], wyglad, czeka, cudze,
     odrzucone, zOdrzuconymi, pin} → HTML. */
  function trescKonta(dane) {
    const d = dane || {};
    return `<form method="dialog" autocomplete="off">
        <h2 id="hala-okno-konta-tytul">Moje konto</h2>
        <p class="hala-konto-kto"><b>${esc(d.nazwa || '—')}</b>${(d.role || []).length ? `<span>${esc(d.role.join(', '))}</span>` : ''}</p>
        <fieldset><legend>Wygląd</legend>
          <div class="hala-wybor" role="group" aria-label="Wygląd">${WYGLAD.map(([k, n]) =>
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
                               czeka: k.moje || 0, cudze: Math.max(0, (k.oczekuje || 0) - (k.moje || 0)), odrzucone,
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

  global.HalaKonto = { zmienPin, przycisk, bledyPinu, biuro, mojeKonto, trescKonta, IKONA_KONTA, powiadomienia, trescPowiadomien };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.HalaKonto;
})(typeof window !== 'undefined' ? window : globalThis);
