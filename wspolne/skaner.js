/* Hala — wspólny skaner kodów (KONTRAKT §10). Dla Lidera, UR, KJ i Panelu.

     const tekst = await HalaSkaner.skanuj({ tytul: 'Zeskanuj stanowisko' });  // null = anulowano
     const stop  = HalaSkaner.nasluchujCzytnika(tekst => …);                     // czytnik USB/BT „jak klawiatura”

   Skąd kod:
     * aparat telefonu — BarcodeDetector (Chrome na Androidzie). Gdzie go nie ma
       (Safari na iPhonie, Firefox), zapasowy dekoder ZXing z pliku skaner-zxing.js
       leżącego obok tego pliku (w repozytorium, bo zakład bywa za zaporą; Apache-2.0).
       Aplikacja, która używa skanera, trzyma skaner-zxing.js w ZASOBACH swojego sw.js.
       Brak obu albo brak zgody na aparat → okno zostaje, działa pole ręczne;
     * czytnik kodów podłączony do telefonu/komputera — „pisze” jak klawiatura:
       seria znaków szybsza niż palec, zakończona Enterem;
     * zawsze: pole do ręcznego wpisania kodu (zamazana etykieta, rękawice, http).

   Formaty obowiązkowe: QR, Code128, EAN-13, Code39 (przewodniki produkcyjne,
   identyfikatory, kody HALA:… na stanowiskach i maszynach).

   Aparat działa tylko na https:// albo localhost — w sieci firmowej po http
   okno od razu mówi, żeby wpisać kod ręcznie albo użyć czytnika.

   Plik nie zależy od hala.js. Wygląd: zmienne z hala.css, własny mały arkusz
   wstrzykiwany raz (klasy .hala-skaner-…), żeby nie ruszać hala.css.          */

(function (global) {
  'use strict';

  const FORMATY = ['qr_code', 'code_128', 'ean_13', 'code_39'];
  const ODSTEP_CZYTNIKA_MS = 50;      // palec nie pisze szybciej niż ~1 znak / 80 ms, czytnik 5–20 ms
  const MIN_DLUGOSC = 3;
  const CO_ILE_MS = 150;              // ile razy na sekundę pytamy dekoder — więcej tylko grzeje telefon

  const adresSkryptu = (global.document && global.document.currentScript && global.document.currentScript.src) || '';

  // ------------------------------------------------------------ czytnik-klawiatura

  /* Czysta maszyna stanów (testowana bez przeglądarki): dostaje klawisze z czasem,
     oddaje tekst, gdy seria była dość szybka, dość długa i skończyła się Enterem.
     Wolne pisanie palcem nigdy nie jest brane za skan.                           */
  function nowyCzytnik(opcje) {
    const o = Object.assign({ odstep: ODSTEP_CZYTNIKA_MS, min: MIN_DLUGOSC }, opcje || {});
    let bufor = '', ostatni = -Infinity;
    return {
      klawisz(klucz, czas) {
        if (klucz === 'Enter') {
          // Enter też musi przyjść szybko — inaczej to człowiek, który coś wpisał i zatwierdził.
          const t = czas - ostatni <= o.odstep * 4 ? bufor : '';
          bufor = ''; ostatni = -Infinity;
          return t.length >= o.min ? t : null;
        }
        if (typeof klucz !== 'string' || klucz.length !== 1) return null;   // Shift, Alt… — czytnik też je wysyła
        if (czas - ostatni > o.odstep) bufor = '';          // przerwa = nowa seria (wolne pisanie nigdy nie urośnie)
        bufor += klucz; ostatni = czas;
        return null;
      },
      reset() { bufor = ''; ostatni = -Infinity; },
    };
  }

  const edytowalny = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''));

  /* Słucha czytnika na całej stronie. Gdy kursor stoi w polu tekstowym, czytnik
     wpisuje kod w to pole (tak jak klawiatura) — wtedy nie przechwytujemy go
     drugi raz, chyba że { takzeWPolach: true }.                                  */
  function nasluchujCzytnika(fn, opcje) {
    const o = opcje || {};
    const c = nowyCzytnik(o);
    const sluchacz = ev => {
      if (!o.takzeWPolach && edytowalny(ev.target)) { c.reset(); return; }
      const tekst = c.klawisz(ev.key, ev.timeStamp || Date.now());
      if (tekst !== null) { ev.preventDefault(); fn(tekst); }
    };
    global.document.addEventListener('keydown', sluchacz, true);
    return () => global.document.removeEventListener('keydown', sluchacz, true);
  }

  // ------------------------------------------------------------ dekodery obrazu

  let zxingLadowanie = null;
  function zaladujZxing() {
    if (global.ZXing) return Promise.resolve(global.ZXing);
    if (!zxingLadowanie) {
      zxingLadowanie = new Promise(ok => {
        const s = global.document.createElement('script');
        s.src = new URL('skaner-zxing.js', adresSkryptu || global.location.href).href;
        s.onload = () => ok(global.ZXing || null);
        // Pliku nie ma (offline, zanim trafił do pamięci workera) — zostaje pole ręczne, a przy
        // następnym skanie próbujemy znowu, zamiast pamiętać porażkę do przeładowania strony.
        s.onerror = () => { zxingLadowanie = null; s.remove(); ok(null); };
        global.document.head.appendChild(s);
      });
    }
    return zxingLadowanie;
  }

  /* Detektor z jednym interfejsem: wykryj(video) → tekst albo null. */
  async function utworzDetektor() {
    if ('BarcodeDetector' in global) {
      try {
        const obslugiwane = await global.BarcodeDetector.getSupportedFormats();
        const formaty = FORMATY.filter(f => obslugiwane.includes(f));
        if (formaty.length) {
          const d = new global.BarcodeDetector({ formats: formaty });
          return { nazwa: 'BarcodeDetector', async wykryj(zrodlo) { const k = await d.detect(zrodlo); return k.length ? k[0].rawValue : null; } };
        }
      } catch (e) { /* przejdź do ZXing */ }
    }
    const Z = await zaladujZxing();
    return Z && Z.MultiFormatReader ? detektorZXing(Z) : null;
  }

  /* ZXing czyta klatkę z <video> (albo <canvas>/<img> — tak go sprawdzamy bez aparatu). */
  function detektorZXing(Z) {
    const wskazowki = new Map();
    wskazowki.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.CODE_39]);
    wskazowki.set(Z.DecodeHintType.TRY_HARDER, true);
    const czytnik = new Z.MultiFormatReader();
    czytnik.setHints(wskazowki);
    const plotno = global.document.createElement('canvas');
    return {
      nazwa: 'ZXing',
      async wykryj(zrodlo) {
        const w = zrodlo.videoWidth || zrodlo.naturalWidth || zrodlo.width, h = zrodlo.videoHeight || zrodlo.naturalHeight || zrodlo.height;
        if (!w || !h) return null;
        const skala = Math.min(1, 1024 / Math.max(w, h));   // pełna rozdzielczość tylko spowalnia JS
        plotno.width = Math.round(w * skala); plotno.height = Math.round(h * skala);
        plotno.getContext('2d', { willReadFrequently: true }).drawImage(zrodlo, 0, 0, plotno.width, plotno.height);
        try {
          const bitmapa = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(plotno)));
          return czytnik.decode(bitmapa).getText();
        } catch (e) { return null; }                       // NotFoundException = w kadrze nie ma kodu
        finally { czytnik.reset(); }
      },
    };
  }

  // ------------------------------------------------------------ okno skanera

  function wstrzyknijArkusz() {
    if (global.document.getElementById('hala-skaner-arkusz')) return;
    const s = global.document.createElement('style');
    s.id = 'hala-skaner-arkusz';
    s.textContent = `
.hala-skaner { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.92); color: #fff;
  display: flex; flex-direction: column; padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)); gap: 10px; }
.hala-skaner h2 { margin: 0; font-size: 1.2em; text-align: center; }
.hala-skaner .hala-skaner-kadr { position: relative; flex: 1; min-height: 0; border-radius: var(--promien, 10px); overflow: hidden; background: #000; }
.hala-skaner video { width: 100%; height: 100%; object-fit: cover; display: block; }
.hala-skaner .hala-skaner-celownik { position: absolute; inset: 22% 12%; border: 3px solid var(--akcent, #E0922E); border-radius: 12px; box-shadow: 0 0 0 100vmax rgba(0,0,0,.35); pointer-events: none; }
.hala-skaner .hala-skaner-info { position: absolute; left: 0; right: 0; bottom: 0; padding: 10px; text-align: center; background: rgba(0,0,0,.6); font-size: .95em; }
.hala-skaner form { display: flex; gap: 8px; }
.hala-skaner input { flex: 1; min-width: 0; }
.hala-skaner .hala-skaner-anuluj { width: 100%; background: transparent; color: #fff; border-color: #888; }`;
    global.document.head.appendChild(s);
  }

  let otwarte = null;       // jedno okno naraz — drugi skan zamyka pierwszy (anulowany)
  let przejmijWpis = false; // zamknięte okno zostawiło swój wpis w historii dla następnego
  let cofanie = null;       // trwa history.back() zamkniętego okna — następne czeka, zanim doda swój wpis

  /* history.back() jest asynchroniczne. Gdyby następne okno dodało wpis przed jego końcem, spóźnione
     „wstecz” zdjęłoby wpis NOWEGO okna i zamknęło je od razu. */
  function cofnijHistorie() {
    cofanie = new Promise(ok => {
      const koniec = () => { clearTimeout(zegar); global.removeEventListener('popstate', koniec); cofanie = null; ok(); };
      const zegar = setTimeout(koniec, 500);
      global.addEventListener('popstate', koniec);
    });
    try { global.history.back(); } catch (e) { /* trudno */ }
  }

  /* Otwiera okno z aparatem i czeka na kod. Zwraca tekst albo null (Anuluj / Wstecz). */
  function skanuj(opcje) {
    const o = Object.assign({ tytul: 'Zeskanuj kod', podpowiedz: 'Wpisz kod', reczny: true }, opcje || {});
    if (otwarte) otwarte(null, true);             // poprzednie okno oddaje nowemu swój wpis w historii
    wstrzyknijArkusz();
    const d = global.document;
    const okno = d.createElement('div');
    okno.className = 'hala-skaner';
    okno.setAttribute('role', 'dialog');
    okno.setAttribute('aria-modal', 'true');
    okno.innerHTML = `
      <h2></h2>
      <div class="hala-skaner-kadr"><video playsinline muted></video><div class="hala-skaner-celownik"></div>
        <div class="hala-skaner-info" role="status">Włączam aparat…</div></div>
      <form autocomplete="off"><input inputmode="text" enterkeyhint="done" aria-label="Kod wpisany ręcznie">
        <button class="glowny" type="submit">OK</button></form>
      <button type="button" class="hala-skaner-anuluj">Anuluj</button>`;
    okno.querySelector('h2').textContent = o.tytul;
    const pole = okno.querySelector('input');
    pole.placeholder = o.podpowiedz;
    if (!o.reczny) okno.querySelector('form').hidden = true;
    const video = okno.querySelector('video');
    const info = okno.querySelector('.hala-skaner-info');
    // Fokus w oknie (nie w polu — klawiatura telefonu zasłoniłaby aparat). Bez tego czytnik-klawiatura
    // pisałby w pole schowane pod oknem (np. numer zlecenia), a jego Enter wysłałby tamten formularz.
    const poprzedniFokus = d.activeElement;
    okno.tabIndex = -1;
    d.body.appendChild(okno);
    try { okno.focus({ preventScroll: true }); } catch (e) { okno.focus(); }

    return new Promise(rozwiaz => {
      let strumien = null, koniec = false, zegar = null, wpisHistorii = false;
      const stopCzytnik = nasluchujCzytnika(t => zakoncz(t), { takzeWPolach: false });

      /* JEDYNE wyjście z okna — każda droga (Anuluj, Esc, wstecz, kod z aparatu, z czytnika, z pola,
         drugi skan) przechodzi tędy. Flaga `koniec` sprawia, że działa raz, a własny wpis w historii
         zdejmujemy dokładnie raz: podwójne history.back() cofało kontrolera z formularza próby do planu. */
      function zakoncz(tekst, zastapione) {
        if (koniec) return;
        koniec = true; otwarte = null;
        clearTimeout(zegar); stopCzytnik();
        global.removeEventListener('popstate', wstecz);
        if (strumien) strumien.getTracks().forEach(t => t.stop());   // bez tego aparat świeci dalej
        okno.remove();
        if (poprzedniFokus && poprzedniFokus.focus && d.contains(poprzedniFokus)) { try { poprzedniFokus.focus({ preventScroll: true }); } catch (e) { /* trudno */ } }
        if (zastapione) przejmijWpis = wpisHistorii;
        else if (wpisHistorii && global.history.state && global.history.state.halaSkaner) cofnijHistorie();
        if (tekst !== null && global.navigator.vibrate) global.navigator.vibrate(60);
        rozwiaz(tekst === null ? null : String(tekst).trim() || null);
      }
      otwarte = zakoncz;

      // Przycisk „wstecz” w telefonie zamyka skaner, a nie całą aplikację. Przeglądarka już zdjęła
      // nasz wpis, więc zakoncz() nie może cofać drugi raz.
      const wstecz = () => { wpisHistorii = false; zakoncz(null); };
      const przejmij = przejmijWpis; przejmijWpis = false;
      if (przejmij && global.history.state && global.history.state.halaSkaner) {
        wpisHistorii = true; global.addEventListener('popstate', wstecz);
      } else {
        (async () => {
          if (cofanie) await cofanie;
          if (koniec) return;
          try { global.history.pushState({ halaSkaner: true }, ''); wpisHistorii = true; global.addEventListener('popstate', wstecz); } catch (e) { /* bez historii też działa */ }
        })();
      }

      okno.querySelector('.hala-skaner-anuluj').addEventListener('click', () => zakoncz(null));
      okno.querySelector('form').addEventListener('submit', ev => { ev.preventDefault(); if (pole.value.trim()) zakoncz(pole.value); });
      okno.addEventListener('keydown', ev => { if (ev.key === 'Escape') zakoncz(null); });

      (async () => {
        const md = global.navigator.mediaDevices;
        if (!global.isSecureContext || !md || !md.getUserMedia) {
          info.textContent = 'Aparat działa tylko przez https. Wpisz kod albo użyj czytnika.';
          return;
        }
        // Najpierw aparat, potem dekoder — osobno. Razem (Promise.all) aparat świecił po „Anuluj”,
        // dopóki wolna sieć nie dociągnęła 360 KB ZXing, a błąd dekodera gubił włączony strumień.
        let s;
        try {
          s = await md.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        } catch (e) {
          if (!koniec) info.textContent = e && e.name === 'NotAllowedError'
            ? 'Brak zgody na aparat. Zezwól w ustawieniach przeglądarki albo wpisz kod.'
            : 'Aparat niedostępny. Wpisz kod albo użyj czytnika.';
          return;
        }
        if (koniec) { s.getTracks().forEach(t => t.stop()); return; }
        strumien = s;
        video.srcObject = strumien;
        try { await video.play(); } catch (e) { /* autoplay — obraz ruszy po dotknięciu */ }
        let detektor = null;
        try { detektor = await utworzDetektor(); } catch (e) { detektor = null; }
        if (koniec) return;
        if (!detektor) { info.textContent = 'Ta przeglądarka nie czyta kodów z aparatu. Wpisz kod albo użyj czytnika.'; return; }
        info.textContent = 'Nakieruj aparat na kod';
        const petla = async () => {
          if (koniec) return;
          let t = null;
          try { if (video.readyState >= 2) t = await detektor.wykryj(video); } catch (e) { t = null; }
          if (koniec) return;                      // okno zamknięte w trakcie odczytu klatki
          if (t) zakoncz(t); else zegar = setTimeout(petla, CO_ILE_MS);
        };
        petla();
      })();
    });
  }

  global.HalaSkaner = { skanuj, nasluchujCzytnika, nowyCzytnik, FORMATY,
    // do sprawdzania dekodera na obrazie bez aparatu: (await HalaSkaner._zxing()).wykryj(canvas)
    _zxing: async () => { const Z = await zaladujZxing(); return Z ? detektorZXing(Z) : null; } };
})(typeof window !== 'undefined' ? window : globalThis);
