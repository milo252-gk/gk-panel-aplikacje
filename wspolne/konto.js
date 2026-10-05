/* GK Panel Kierownika — wspólne okno „Zmień PIN” (D32: jedno konto we wszystkich aplikacjach GK).

   Jedno okno dla Panelu (okno konta 👤), Lidera (menu), UR i KJ („Więcej”) — ten sam wygląd i te same słowa,
   jak Motyw (motyw.js). Aplikacja woła:
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

  global.HalaKonto = { zmienPin, przycisk, bledyPinu, biuro };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.HalaKonto;
})(typeof window !== 'undefined' ? window : globalThis);
