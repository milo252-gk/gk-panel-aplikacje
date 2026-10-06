/* Aplikacja Kontroli Jakości — rdzeń: logowanie, pasek połączenia, nawigacja,
   wspólne klocki ekranów (liczniki ±, zdjęcia, okna, komunikaty).

   Całą łączność, pracę bez sieci i pamięć w telefonie daje hala.js. Tu jest
   tylko: zaloguj → słuchaj zmian → narysuj ekran z adresu (#plan, #alert/<id>…).
   Co pokazać, liczy widok.js (KJWidok). Ekrany rejestrują się w KJ.ekrany
   z osobnych plików (alerty.js, proba.js, reklamacje.js, analiza.js, katalog.js),
   a start rusza po ich wczytaniu (DOMContentLoaded).                            */

(function (global) {
  'use strict';

  const W = global.KJWidok;
  const $ = id => document.getElementById(id);
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const hala = global.Hala.utworz({ aplikacja: 'kj', typy: ['proba', 'partia', 'alert', 'reklamacja', 'zlecenie'], dni: 30 });

  const KJ = global.KJ = { hala, W, $, esc, ekrany: {}, biezacy: null };

  // ------------------------------------------------------------ uprawnienia i dane

  KJ.mozna = (typ, slownik) => W.mozna(hala.kontrakt, hala.pracownik, typ, slownik);
  KJ.kierownikKJ = () => !!hala.pracownik && (hala.pracownik.role || []).some(r => r === 'kierownik_kj' || r === 'admin');
  KJ.prog = () => Number(hala.ustawienie('prog_brakow_proc', 5));

  // ------------------------------------------------------------ komunikaty i okna

  let komunikatZegar = null;
  /* rodzaj: ok (zielony) | alarm (czerwony) | uwaga (żółty) | bez rodzaju — ciemny, informacja. Wygląd w hala.css. */
  KJ.komunikat = (tekst, rodzaj) => {
    const k = $('komunikat');
    k.textContent = tekst;
    k.className = 'komunikat ' + (rodzaj || '');
    k.hidden = false;
    // Okno (<dialog>) leży w warstwie górnej — komunikat wchodzi nad nie jako popover (hala.css → .komunikaty).
    const pudlo = $('komunikaty');
    if (pudlo.showPopover) { try { pudlo.hidePopover(); } catch (e) { /* nie był otwarty */ } try { pudlo.showPopover(); } catch (e) { /* stara przeglądarka */ } }
    clearTimeout(komunikatZegar);
    komunikatZegar = setTimeout(() => { k.hidden = true; }, rodzaj === 'alarm' ? 7000 : 3500);
  };

  /* Okno z pytaniem. przyciski: [{tekst, wartosc, glowny?, alarm?}]. Zwraca wartość
     klikniętego przycisku, a przy „Wstecz”/Esc — null. Pola w treści czyta wywołujący
     z wyniku (formularz przekazuje FormData w polu dane).                          */
  KJ.okno = ({ tytul, tresc, przyciski }) => new Promise(ok => {
    const o = $('okno');
    const lista = przyciski || [{ tekst: 'OK', wartosc: true, glowny: true }];
    // Przycisk z wartością false (Anuluj) nie wysyła formularza — inaczej Enter w polu
    // tekstowym „kliknąłby” pierwszy przycisk, czyli właśnie Anuluj.
    o.innerHTML = `<form class="okno-tresc">
      <h2>${esc(tytul)}</h2><div class="okno-cialo">${tresc || ''}</div>
      <p class="blad" hidden></p>
      <div class="okno-przyciski">${lista.map((p, i) =>
        `<button type="${p.wartosc === false ? 'button' : 'submit'}" value="${i}" class="${p.glowny ? 'glowny' : ''} ${p.alarm ? 'alarm' : ''}">${esc(p.tekst)}</button>`).join('')}</div></form>`;
    const f = o.querySelector('form');
    const zamknij = wynik => { o.close(); o.innerHTML = ''; ok(wynik); };
    for (const b of f.querySelectorAll('button[type="button"][value]')) b.addEventListener('click', () => zamknij({ wartosc: false, dane: new FormData(f) }));
    f.addEventListener('submit', ev => {
      const i = ev.submitter && ev.submitter.value !== undefined ? +ev.submitter.value : lista.findIndex(p => p.wartosc !== false);
      const p = lista[i];
      if (p && p.sprawdz) {
        const blad = p.sprawdz(new FormData(f));
        if (blad) { ev.preventDefault(); const b = f.querySelector('.blad'); b.textContent = blad; b.hidden = false; return; }
      }
      ev.preventDefault();
      zamknij(p ? { wartosc: p.wartosc, dane: new FormData(f) } : null);
    });
    o.oncancel = ev => { ev.preventDefault(); zamknij(null); };      // Esc / „wstecz” — jedna obsługa na okno
    o.showModal();
    const pierwsze = o.querySelector('input, textarea, select');
    if (pierwsze) pierwsze.focus();
  });

  /* Obsługa „Zapisz” formularza: raz naraz (W.raz) i przycisk wyszarzony na czas zapisu,
     żeby kontroler widział, że dotknięcie zadziałało. */
  KJ.przyZapisie = (form, zapisz) => {
    const raz = W.raz(async () => {
      const przyciski = form.querySelectorAll('button[type="submit"]');
      przyciski.forEach(b => { b.disabled = true; });
      try { await zapisz(form); } finally { przyciski.forEach(b => { b.disabled = false; }); }
    });
    form.addEventListener('submit', ev => { ev.preventDefault(); raz(); });
    // Enter w polu (klawiatura telefonu „Dalej/OK” albo czytnik kodów kończący Enterem) NIE zapisuje całego
    // formularza — czytnik w polu zlecenia zapisywał próbę bez wad i zdjęć.
    form.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.type !== 'submit') ev.preventDefault();
    });
  };

  KJ.potwierdz = async (tytul, tresc, tak) => {
    const w = await KJ.okno({ tytul, tresc: tresc ? `<p>${esc(tresc)}</p>` : '', przyciski: [
      { tekst: 'Anuluj', wartosc: false }, { tekst: tak || 'Tak', wartosc: true, glowny: true }] });
    return !!(w && w.wartosc);
  };

  // ------------------------------------------------------------ zdjęcia

  /* Zdjęcie jednym dotknięciem: aparat → zmniejszenie → kolejka plików w telefonie.
     Zwraca id pliku (do pola typu „pliki”) albo null. Plik jedzie do huba przed
     zdarzeniem, które go wskazuje — pilnuje tego hala.js.                          */
  let wyborZdjecia = null;
  $('plik-zdjecia').addEventListener('change', async ev => {
    const plik = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    const r = wyborZdjecia; wyborZdjecia = null;
    if (!r) return;
    if (!plik) return r(null);
    try { r(await hala.dodajPlik(plik)); }
    catch (e) { KJ.komunikat(e.message || 'Nie udało się zapisać zdjęcia. Spróbuj jeszcze raz.', 'alarm'); r(null); }
  });
  // Anulowanie wyboru pliku nie wysyła 'change' — bez 'cancel' obietnica wisiałaby do następnego zdjęcia.
  $('plik-zdjecia').addEventListener('cancel', () => { const r = wyborZdjecia; wyborZdjecia = null; if (r) r(null); });
  KJ.zrobZdjecie = () => new Promise(ok => {
    if (wyborZdjecia) wyborZdjecia(null);
    wyborZdjecia = ok;
    $('plik-zdjecia').click();
  });

  /* Miniatury: <img data-plik="id"> dostaje adres dopiero po odczycie (lokalny blob
     albo plik z huba) — KJ.wypelnijZdjecia(kontener) po każdym narysowaniu.       */
  KJ.miniatury = (ids, usuwalne) => (ids || []).map(id =>
    `<figure class="miniatura"><img data-plik="${esc(id)}" alt="Zdjęcie">${usuwalne
      ? `<button type="button" class="usun-zdjecie" data-usun-zdjecie="${esc(id)}" aria-label="Usuń zdjęcie">×</button>` : ''}</figure>`).join('');
  KJ.wypelnijZdjecia = async kontener => {
    for (const img of (kontener || document).querySelectorAll('img[data-plik]:not([src])')) {
      try { img.src = await hala.adresPliku(img.dataset.plik); } catch (e) { /* bez podglądu */ }
    }
  };
  // Dotknięcie miniatury = zdjęcie na cały ekran.
  document.addEventListener('click', ev => {
    const img = ev.target.closest && ev.target.closest('figure.miniatura img, .zdjecie-duze img');
    if (!img || !img.src) return;
    KJ.okno({ tytul: 'Zdjęcie', tresc: `<img class="podglad-zdjecia" src="${esc(img.src)}" alt="Zdjęcie">` });
  });

  // ------------------------------------------------------------ licznik ±

  /* Duży licznik dla rękawic: − [liczba] +. Wartość czyta i zapisuje ekran przez
     data-licznik="nazwa"; zdarzenie 'input' leci z pola jak przy zwykłym wpisywaniu. */
  KJ.licznik = (nazwa, wartosc, opis, male) =>
    `<div class="licznik ${male ? 'male' : ''}" data-licznik="${esc(nazwa)}">
      ${opis ? `<span class="licznik-opis">${esc(opis)}</span>` : ''}
      <button type="button" data-krok="-1" aria-label="Mniej">−</button>
      <input type="number" inputmode="numeric" min="0" step="1" name="${esc(nazwa)}" value="${esc(wartosc)}" aria-label="${esc(opis || nazwa)}">
      <button type="button" data-krok="1" aria-label="Więcej">+</button>
    </div>`;
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('.licznik button[data-krok]');
    if (!b) return;
    const pole = b.parentElement.querySelector('input');
    pole.value = Math.max(0, (parseInt(pole.value, 10) || 0) + (+b.dataset.krok));
    // Ekran może odróżnić „+” od pisania z klawiatury (np. brak z „+” podnosi sprawdzone, literówka — nie).
    pole.dataset.zPrzycisku = '1';
    pole.dispatchEvent(new Event('input', { bubbles: true }));
    delete pole.dataset.zPrzycisku;
  });

  // ------------------------------------------------------------ skaner

  KJ.skanuj = async (tytul, podpowiedz) => {
    if (!global.HalaSkaner) { KJ.komunikat('Brak skanera. Odśwież aplikację.', 'alarm'); return null; }
    return global.HalaSkaner.skanuj({ tytul, podpowiedz });
  };

  // ------------------------------------------------------------ nawigacja

  KJ.ekran = (nazwa, def) => { KJ.ekrany[nazwa] = def; };
  // Zlecenia od kierownika (Panel → dział „kj”): wspólny ekran z wspolne/zlecenia.js.
  KJ.ekran('zlecenia', { rysuj: el => global.HalaZlecenia.rysuj(el, hala, { dzial: 'kj' }) });
  global.HalaZlecenia.sledz(hala, () => ({ dzial: 'kj' }), z => KJ.komunikat(`Nowe zlecenie od kierownika: ${(z.dane || {}).tytul || ''}`));
  KJ.idz = adres => { if (location.hash !== '#' + adres) location.hash = adres; else pokazEkran(); };

  function adres() {
    const [nazwa, ...reszta] = (location.hash.replace(/^#/, '') || 'plan').split('/');
    // Zepsute „%” w adresie (np. ręcznie wpisane) nie może wywrócić nawigacji — wtedy bez parametru.
    let parametr = null;
    try { parametr = reszta.map(decodeURIComponent).join('/') || null; } catch (e) { parametr = null; }
    return { nazwa: KJ.ekrany[nazwa] ? nazwa : 'plan', parametr };
  }

  function pokazEkran() {
    if (!hala.zalogowany()) return;
    const a = adres();
    const def = KJ.ekrany[a.nazwa];
    KJ.biezacy = Object.assign({ def }, a);
    const zakladka = def.zakladka || a.nazwa;
    for (const l of document.querySelectorAll('.nawigacja a')) {
      if (l.dataset.ekran === zakladka) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
    }
    const el = $('ekran');
    el.className = 'ekran ekran-' + a.nazwa;
    try {
      const wynik = def.rysuj(el, a.parametr);
      if (wynik && wynik.catch) wynik.catch(pokazBlad);
    } catch (e) { pokazBlad(e); }
    KJ.wypelnijZdjecia(el);
    if (!def.formularz) el.scrollTop = 0;
  }
  function pokazBlad(e) {
    console.error(e);
    $('ekran').innerHTML = `<p class="pusto blad">Coś poszło nie tak: ${esc(e && e.message)}. Wróć do planu i spróbuj jeszcze raz.</p>`;
  }
  global.addEventListener('hashchange', () => { pokazEkran(); global.scrollTo(0, 0); });

  /* Strumień przyniósł zmianę: ekrany do czytania rysujemy od nowa, a formularze
     tylko odświeżają swoje fragmenty (odswiez) — inaczej kontrolerowi znikałby
     tekst w trakcie pisania.                                                    */
  let zaplanowane = false, zmianySlownikow = false, czekaNaFokus = false;
  /* powod: 'slowniki' (zmienił się słownik), 'wymus' (ekran sam prosi o przerysowanie, np. po zmianie filtra). */
  let wymus = false;
  KJ.odswiez = powod => {
    if (powod === 'slowniki') zmianySlownikow = true;
    if (powod === 'wymus') wymus = true;
    if (zaplanowane) return;
    zaplanowane = true;
    requestAnimationFrame(() => {
      zaplanowane = false;
      const slowniki = zmianySlownikow; zmianySlownikow = false;
      if (wymus) { wymus = false; powod = 'wymus'; }
      if (!hala.zalogowany() || !KJ.biezacy) return;
      rysujNaglowek();
      const def = KJ.biezacy.def, el = $('ekran');
      // Formularz odświeżamy tylko po zmianie słowników (nowe stanowisko, wada) — każde zdarzenie z hali
      // zwijało rozwinięte „Wybierz z listy” i zamykało otwartą listę wyrobów.
      if (def.formularz) { if (slowniki && def.odswiez) def.odswiez(el, KJ.biezacy.parametr); return; }
      // Otwarta lista wyboru (filtr Pareto) — nie podmieniamy jej spod palca; odświeżymy po wyjściu z pola.
      const a = document.activeElement;
      if (powod !== 'wymus' && a && el.contains(a) && /^(SELECT|INPUT|TEXTAREA)$/.test(a.tagName)) {
        if (!czekaNaFokus) { czekaNaFokus = true; el.addEventListener('focusout', () => { czekaNaFokus = false; KJ.odswiez(); }, { once: true }); }
        return;
      }
      // Rozwinięte sekcje („Wycofane”, „Co było w zapisie”) zostają rozwinięte po przerysowaniu.
      const rozwiniete = new Set(Array.from(el.querySelectorAll('details[open] > summary')).map(x => x.textContent.replace(/\d+/g, '#')));
      const y = global.scrollY;
      try { def.rysuj(el, KJ.biezacy.parametr); } catch (e) { pokazBlad(e); }
      for (const x of el.querySelectorAll('details > summary')) if (rozwiniete.has(x.textContent.replace(/\d+/g, '#'))) x.parentElement.open = true;
      KJ.wypelnijZdjecia(el);
      global.scrollTo(0, y);
    });
  };

  function rysujNaglowek() {
    const z = hala.zmianaTeraz();
    $('zmiana').innerHTML = z ? `<b>${esc(z.nazwa)}</b> <span>${esc(W.godzina(z.od))}–${esc(W.godzina(z.do))}</span>` : '';
    $('kto').textContent = hala.pracownik ? hala.pracownik.nazwa : '';
    $('menu-kto').textContent = $('kto').textContent;   // nagłówek menu na komputerze, jak w GK Trasy
  }

  // ------------------------------------------------------------ logowanie

  function komunikatBledu(e) {
    // fetch bez sieci rzuca TypeError z angielskim tekstem przeglądarki — zamieniamy na instrukcję.
    if (!e || e instanceof TypeError || !e.kod) return 'Brak połączenia z hubem. Sprawdź sieć i spróbuj jeszcze raz.';
    if (e.kod === 403) return 'To konto nie ma dostępu do Kontroli Jakości. Zaloguj się kontem kontrolera albo kierownika KJ.';
    // 400/401/429: hub mówi po polsku i co zrobić („Złe imię i nazwisko albo PIN”, blokada na 5 minut) — wprost (D24).
    return e.message || 'Nie udało się zalogować. Spróbuj jeszcze raz.';
  }

  /* Logowanie identyfikatorem i PIN-em (D24). Identyfikator = kod z karty (aparat, czytnik „piszący” jak
     klawiatura) albo login. Skan tylko WPISUJE kod w pole — PIN i tak trzeba podać. Enter z czytnika
     w polu identyfikatora przenosi do PIN-u, zamiast wysyłać formularz bez PIN-u. */
  $('formularz-logowania').addEventListener('submit', async ev => {
    ev.preventDefault();
    const ident = $('identyfikator').value.trim().replace(/^HALA:P:/i, '');
    const pin = $('pin').value.trim();
    if (ident && !pin) { $('pin').focus(); return; }
    if (!ident) {          // STYL-GK §2: to samo zdanie co w hubie i w GK Trasy / GK Flota
      $('blad-logowania').textContent = 'Wpisz imię i nazwisko oraz PIN albo hasło.'; $('blad-logowania').hidden = false;
      $('identyfikator').focus(); return;
    }
    const blad = $('blad-logowania');
    blad.hidden = true;
    for (const b of document.querySelectorAll('#formularz-logowania button')) b.disabled = true;
    const wyczysc = () => { $('identyfikator').value = ''; $('pin').value = ''; };
    try {
      // Sam PIN przechodzi tylko w trybie przejściowym huba; w ścisłym hub sam odpowie, że brak identyfikatora.
      await hala.zaloguj(ident ? { identyfikator: ident, pin } : { pin });
      wyczysc();
      pokazSesje();
    } catch (e) {
      // Hub przyjął logowanie, a potknęło się wczytywanie stanu — sesja jest, resztę dociągnie synchronizacja.
      if (hala.zalogowany()) { wyczysc(); pokazSesje(); return; }
      blad.textContent = komunikatBledu(e);
      blad.hidden = false;
      $('pin').value = '';
      $('pin').focus();
    } finally {
      for (const b of document.querySelectorAll('#formularz-logowania button')) b.disabled = false;
    }
  });
  $('skanuj-karte').addEventListener('click', async () => {
    const t = await KJ.skanuj('Zeskanuj identyfikator', 'Numer karty');
    if (!t) return;
    $('identyfikator').value = t.replace(/^HALA:P:/i, '');
    $('pin').focus();
  });

  async function wyloguj() {
    const k = hala.stanKolejki().moje;
    if (k && !(await KJ.potwierdz('Wylogować?', `Czeka na wysłanie: ${k}. Wyślą się, gdy znowu zalogujesz się na tym urządzeniu.`, 'Wyloguj'))) return;
    await hala.wyloguj();
    pokazSesje();
  }
  $('menu-wyloguj').addEventListener('click', wyloguj);   // stopka menu na komputerze, jak w GK Trasy
  /* „Moje konto” (👤 w nagłówku, STYL-GK §3): wspólne okno z ../wspolne/konto.js — imię i nazwisko, Wygląd, Zmień PIN,
     dane w tym urządzeniu, wersja, Wyloguj. Wcześniej goły „Wyloguj” w nagłówku, a Motyw i PIN pod „Więcej”. */
  $('konto').addEventListener('click', () => global.HalaKonto.mojeKonto(hala, {
    aplikacja: 'kj', komunikat: (t, r) => KJ.komunikat(t, r), wyloguj, odrzucone: () => KJ.idz('odrzucone') }));

  function pokazSesje() {
    const z = hala.zalogowany();
    $('logowanie').hidden = z;
    $('aplikacja').hidden = !z;
    document.body.classList.toggle('kierownik-kj', z && KJ.kierownikKJ());
    rysujPasek();
    if (z) { rysujNaglowek(); pokazEkran(); } else if (global.matchMedia && global.matchMedia('(pointer: fine)').matches) { setTimeout(() => $('identyfikator').focus(), 0); }   // na telefonie fokus = klawiatura zasłania pół ekranu
  }

  // ------------------------------------------------------------ pasek połączenia (KONTRAKT §9)

  let kolejka = { oczekuje: 0, moje: 0, odrzucone: 0 };
  const START = Date.now(), LASKA_MS = 5000;

  function rysujPasek() {
    const p = hala.polaczenie, pasek = $('pasek');
    const czesci = [];
    let klasa = 'ok';
    if (hala.zalogowany()) {
      // Tuż po otwarciu strumień dopiero się łączy — bez okresu łaski każde odświeżenie mignęłoby „Brak sieci”.
      const laska = Date.now() - START < LASKA_MS && p.online && !p.blad;
      // Dociąganie: sieć (np. szybki tunel) trzyma strumień, więc zmiany przychodzą co kilka sekund.
      // To NIE jest brak połączenia — zapisy wychodzą normalnie.
      const dociaganie = !p.strumien && p.dociaganie && !p.blad;
      if (dociaganie) {
        klasa = 'kolejka';
        czesci.push('Odświeżanie co kilka sekund' + (kolejka.moje ? ` · wysyłam: ${kolejka.moje}` : ''));
      } else if (!p.strumien && !laska) {
        klasa = p.online ? 'brak-huba' : 'offline';
        czesci.push(p.online ? 'Brak połączenia z hubem' + (kolejka.moje ? ` — ${kolejka.moje} czeka na wysłanie` : '')
          : 'Brak sieci — zapisy zostają w telefonie' + (kolejka.moje ? ` (${kolejka.moje})` : ''));   // STYL-GK §6, jak Lider
      } else if (kolejka.moje) {
        // Tylko zapisy zalogowanej osoby — cudze (poprzednia osoba na tym telefonie) czekają na jej powrót.
        klasa = 'kolejka';
        czesci.push(`Wysyłam: ${kolejka.moje}`);
      }
      if (kolejka.odrzucone) { klasa = 'odrzucone'; czesci.push(`Odrzucone: ${kolejka.odrzucone} — dotknij`); }
    }
    pasek.className = 'hala-polaczenie ' + klasa;
    pasek.textContent = czesci.join(' · ');
    pasek.disabled = !kolejka.odrzucone;
  }
  $('pasek').addEventListener('click', () => { if (kolejka.odrzucone) KJ.idz('odrzucone'); });

  // Odrzucone przez hub: nic nie znika samo — człowiek czyta powód i decyduje (KONTRAKT §5.2).
  KJ.ekran('odrzucone', {
    zakladka: 'wiecej',
    async rysuj(el) {
      el.innerHTML = '<h1>Odrzucone przez hub</h1><div class="lista" id="lista-odrzuconych"><p class="pusto">Wczytuję…</p></div>';
      const lista = await hala.odrzucone();
      $('lista-odrzuconych').innerHTML = lista.map(o => `
        <article class="karta">
          <div><b>${esc(opisTypu(o.zd.typ))}</b> <span class="slaby">${esc(W.kiedy(o.zd.czas, hala.teraz()))}</span></div>
          <p class="blad">${esc(o.powod)}</p>
          <details><summary>Co było w zapisie</summary><pre>${esc(JSON.stringify(o.zd.dane, null, 1))}</pre></details>
          <button type="button" data-usun-odrzucone="${esc(o.id)}">Usuń z listy</button>
        </article>`).join('') || '<p class="pusto ok">Nic nie zostało odrzucone</p>';
    },
  });
  document.addEventListener('click', async ev => {
    const b = ev.target.closest && ev.target.closest('[data-usun-odrzucone]');
    if (!b) return;
    if (!(await KJ.potwierdz('Usunąć z listy?', 'Ten zapis nie trafił do huba. Po usunięciu trzeba go wprowadzić jeszcze raz.', 'Usuń'))) return;
    await hala.usunOdrzucone(b.dataset.usunOdrzucone);
    pokazEkran();
  });

  function opisTypu(typ) {
    const spec = hala.kontrakt && hala.kontrakt.zdarzenia[typ];
    return (spec && spec.opis) ? spec.opis.split(/[.—(]/)[0].trim() : typ;
  }


  // ------------------------------------------------------------ „Więcej”

  /* Jeden przycisk na powiadomienia: zgoda przeglądarki i push przy zamkniętej aplikacji (D28) naraz.
     Gdzie push nie działa (http, iPhone poza ekranem początkowym), zostają powiadomienia przy otwartej aplikacji
     (`lokalne` — aplikacja sama je pokazuje). Stan pyta przeglądarkę, więc rysujemy później. */
  async function rysujPush(el, komunikat, lokalne) {
    const s = await hala.push.stan();
    const zgoda = 'Notification' in window ? Notification.permission : 'brak';
    const ok = t => `<p class="tekst-ok">${t}</p>`;
    const przycisk = (co, t) => `<button type="button" class="glowny szeroki" data-push="${co}">${t}</button>`;
    el.innerHTML = s === 'wlaczone' ? ok('Włączone — także przy zamkniętej aplikacji') + '<button type="button" class="szeroki" data-push="wylacz">Wyłącz</button>'
      : s === 'zablokowane' || zgoda === 'denied' ? '<p class="tekst-uwaga">Zablokowane — zezwól na powiadomienia w ustawieniach przeglądarki dla tej strony.</p>'
      : s === 'wylaczone' ? (lokalne && zgoda === 'granted' ? ok('Włączone, gdy aplikacja jest otwarta') + przycisk('wlacz', 'Włącz też przy zamkniętej aplikacji')
                                                             : przycisk('wlacz', 'Włącz powiadomienia'))
      : (lokalne && zgoda === 'granted' ? ok('Włączone, gdy aplikacja jest otwarta') : lokalne && zgoda === 'default' ? przycisk('zgoda', 'Włącz powiadomienia') : '')
        + '<p class="slaby">Przy zamkniętej aplikacji: potrzebny adres https, a na iPhonie aplikacja dodana do ekranu początkowego (iOS 16.4+).</p>';
    const b = el.querySelector('[data-push]');
    if (b) b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        if (b.dataset.push === 'zgoda') await Notification.requestPermission();
        else await hala.push[b.dataset.push]();
      } catch (e) { komunikat(e.message || 'Nie udało się. Spróbuj jeszcze raz.'); }
      rysujPush(el, komunikat, lokalne);
    });
  }

  KJ.ekran('wiecej', {
    rysuj(el) {
      el.innerHTML = `<h1>Więcej</h1>
        <nav class="menu">
          <a class="przycisk" href="#pareto">Pareto wad</a>
          <a class="przycisk" href="#partie">Partie brakowe</a>
          <a class="przycisk" href="#katalog">${KJ.kierownikKJ() ? 'Katalog, wyroby, plan' : 'Katalog wad'}</a>
          <a class="przycisk" href="#odrzucone">Odrzucone przez hub${kolejka.odrzucone ? ` (${kolejka.odrzucone})` : ''}</a>
        </nav>
        <h2>Powiadomienia</h2>
        <p class="slaby">Zlecenia od kierownika — także przy zamkniętej aplikacji.</p>
        <div id="push"></div>
        <p class="slaby stopka">Zalogowany: ${esc(hala.pracownik && hala.pracownik.nazwa)} · <span id="wersja">klient ${esc(hala.wersja)}</span></p>`;
      global.HalaAktualizacja.wpiszWersje(el.querySelector('#wersja'), 'kj');
      rysujPush(el.querySelector('#push'), t => KJ.komunikat(t, 'alarm'));
    },
  });

  // ------------------------------------------------------------ start

  hala.na('zmiana', () => KJ.odswiez());
  // Plakietka „Zlecenia”: ile zleceń od kierownika czeka na KJ.
  const plakietkaZlecen = () => { const e = document.getElementById('licznik-zlecen'); const n = global.HalaZlecenia.doZrobienia(hala, { dzial: 'kj' });
    e.hidden = !n; e.textContent = n > 99 ? '99+' : String(n); };
  hala.na('zmiana', plakietkaZlecen);
  hala.na('sesja', plakietkaZlecen);
  hala.na('slowniki', () => KJ.odswiez('slowniki'));
  hala.na('sesja', pokazSesje);
  hala.na('polaczenie', rysujPasek);
  hala.na('kolejka', k => { kolejka = k; rysujPasek(); });
  hala.na('odrzucone', ({ powod }) => KJ.komunikat(`Hub nie przyjął zapisu: ${powod}`, 'alarm'));
  /* Konflikt = ktoś (inny telefon) zmienił to wcześniej. Zapis jest w historii, stan się nie zmienił —
     mówimy to po ludzku, a techniczny powód huba zostaje w konsoli. */
  hala.na('konflikt', ({ zdarzenie, uwaga }) => {
    console.warn('konflikt', zdarzenie && zdarzenie.typ, uwaga);
    KJ.komunikat('Ktoś zmienił to wcześniej na innym telefonie. Twój zapis jest w historii, ale stan się nie zmienił — sprawdź, co jest teraz.', 'uwaga');
  });

  document.addEventListener('DOMContentLoaded', async () => {
    await hala.start();
    pokazSesje();
    setTimeout(rysujPasek, LASKA_MS + 500);
    // Zegar zmiany i kolory planu zmieniają się z upływem czasu, nie tylko po zdarzeniu.
    setInterval(() => { rysujNaglowek(); if (KJ.biezacy && !KJ.biezacy.def.formularz) KJ.odswiez(); }, 60000);
    // Nowa wersja: odświeża sama, ale nie przy otwartym oknie ani formularzu (aktualizacja.js).
    global.HalaAktualizacja.pilnuj({ komunikat: KJ.komunikat, zajety: () => !!(KJ.biezacy && KJ.biezacy.def.formularz) });
  });
})(window);
