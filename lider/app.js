/* Aplikacja Lidera — rdzeń: logowanie, linia, ekrany, pasek połączenia, okno,
   komunikaty, brudnopisy formularzy i powiadomienia.

   Ten plik jest UMOWĄ dla pozostałych (awarie.js, jakosc.js, zmiana.js,
   formularze.js): zakłada globalny obiekt Lider z narzędziami i rejestrem
   ekranów. Pliki ekranów niczego z tego nie robią po swojemu.

   Całą łączność, pracę bez sieci i pamięć w telefonie daje hala.js — tu nie ma
   ani jednego własnego zapytania do /api/ i żadnej własnej IndexedDB (pilnuje tego test). */

(function () {
  'use strict';

  const W = window.LiderWidok;
  const $ = id => document.getElementById(id);
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const START = Date.now(), LASKA_MS = 5000;

  const hala = Hala.utworz({ aplikacja: 'lider',
    typy: ['zmiana_linii', 'awaria', 'proba', 'alert', 'reklamacja', 'bhp_zgloszenie', 'zlecenie'], dni: 3 });

  // localStorage tylko przez te funkcje: w Safari prywatnym sam dostęp rzuca wyjątkiem (KONTRAKT §9: prefiks hala.lider.).
  const pamiec = {
    czytaj(k) { try { return localStorage.getItem('hala.lider.' + k); } catch (e) { return null; } },
    zapisz(k, v) { try { localStorage.setItem('hala.lider.' + k, v); } catch (e) { /* bez pamięci też działa */ } },
    usun(k) { try { localStorage.removeItem('hala.lider.' + k); } catch (e) { /* nic */ } },
  };

  const Lider = window.Lider = {
    hala, W, $, esc, pamiec,
    ekrany: {},                 // nazwa -> { rysuj() } — wypełniają pliki ekranów
    wezwania: [],               // funkcje -> [{ klasa, html, akcja }] — pasek wezwań nad każdym ekranem
    poRysowaniu: [],            // funkcje wołane po każdym przerysowaniu (np. ekran blokujący alertu)
    stan: { ekran: 'zmiana', linia: null, kolejka: { oczekuje: 0, moje: 0, odrzucone: 0 }, konflikty: [] },
  };

  // ------------------------------------------------------------ komunikaty

  /* Krótki komunikat na dole ekranu. rodzaj: ok | blad | info. Błędy wiszą dłużej.
     klucz (np. id awarii): nowy komunikat o tym samym podmienia poprzedni — przy szybkich zmianach
     statusu dymki nie piętrzą się nad listą. Naraz widać najwyżej MAKS_KOMUNIKATOW, najstarszy znika. */
  const MAKS_KOMUNIKATOW = 2;
  Lider.komunikat = (tekst, rodzaj, klucz) => {
    const pudlo = $('komunikaty');
    if (klucz) for (const s of pudlo.querySelectorAll('.komunikat')) if (s.dataset.klucz === klucz) s.remove();
    const el = document.createElement('div');
    el.className = 'komunikat ' + (rodzaj || 'info');
    el.textContent = tekst;
    if (klucz) el.dataset.klucz = klucz;
    pudlo.appendChild(el);
    while (pudlo.children.length > MAKS_KOMUNIKATOW) pudlo.firstElementChild.remove();
    setTimeout(() => el.classList.add('znika'), rodzaj === 'blad' ? 7000 : 3500);
    setTimeout(() => el.remove(), rodzaj === 'blad' ? 7600 : 4100);
  };

  /* Błędy przeglądarki są po angielsku, a czyta je lider na hali — tłumaczymy w jednym miejscu. */
  Lider.poLudzku = e => {
    if (!e || e instanceof TypeError || !e.kod) return 'Brak połączenia z hubem. Sprawdź sieć i spróbuj jeszcze raz.';
    if (e.kod === 403) return 'To konto nie ma dostępu do GK Lider. Poproś kierownika o rolę lidera albo mistrza.';
    // 400/401/429: hub mówi po polsku i wprost, co zrobić (złe imię i nazwisko albo PIN, blokada na 5 minut…).
    return e.message || 'Coś poszło nie tak. Spróbuj jeszcze raz.';
  };

  /* Zapis zdarzenia. Wraca od razu (kolejka w telefonie); błąd dotyczy tylko samego telefonu. */
  Lider.zapisz = async (typ, obiekt, dane) => {
    try {
      return await hala.zapisz(typ, obiekt, dane);
    } catch (e) {
      Lider.komunikat('Nie udało się zapisać w telefonie: ' + (e.message || e) + '. Zamknij inne karty i spróbuj ponownie.', 'blad');
      return null;
    }
  };

  /* Komunikat po zapisie: z siecią „wysłane”, bez niej — uczciwie, że czeka w telefonie. */
  Lider.poZapisie = tekst => {
    const online = hala.polaczenie.online && hala.polaczenie.strumien;
    Lider.komunikat(online ? tekst : tekst + ' — zapisane w telefonie, wyślę po powrocie sieci', 'ok');
  };

  /* Usuwa puste pola — hub i tak traktuje "" jak brak, a raport i Panel są czytelniejsze. */
  Lider.bezPustych = obj => {
    const w = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === '' || v === null || v === undefined) continue;
      if (Array.isArray(v) && !v.length) continue;
      if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) continue;
      w[k] = v;
    }
    return w;
  };

  // ------------------------------------------------------------ okno (formularze)

  let oknoZamykanie = null;

  /* Jedno okno naraz. opcje: { tytul, html, poOtwarciu(el), przyZamknieciu(), klucz, parametry }.
     klucz + parametry pozwalają otworzyć okno ponownie po zamknięciu karty (Lider.oknaPoStarcie). */
  Lider.okno = opcje => {
    if (oknoZamykanie) { const f = oknoZamykanie; oknoZamykanie = null; f(); }
    $('okno-tytul').textContent = opcje.tytul || '';
    const tresc = $('okno-tresc');
    tresc.innerHTML = opcje.html || '';
    tresc.scrollTop = 0;
    $('okno').hidden = false;
    document.body.classList.add('z-oknem');
    oknoZamykanie = opcje.przyZamknieciu || (() => {});
    if (opcje.klucz) hala.brudnopis.zapisz('okno', { klucz: opcje.klucz, parametry: opcje.parametry || {} });
    else hala.brudnopis.usun('okno');
    if (opcje.poOtwarciu) opcje.poOtwarciu(tresc);
    return tresc;
  };

  /* Pytanie tak/nie w oknie aplikacji (jak UR.potwierdz i KJ.potwierdz) — zamiast confirm() przeglądarki,
     który na telefonie wygląda obco i podpisuje się adresem strony. Zamknięcie okna (✕, Esc) = „nie”. */
  Lider.potwierdz = (tytul, tresc, tak) => new Promise(ok => {
    let wynik = false;
    Lider.okno({
      tytul,
      html: `<p>${esc(tresc)}</p><div class="przyciski-rzad"><button type="button" data-odp="nie">Anuluj</button>
        <button type="button" class="glowny" data-odp="tak">${esc(tak || 'Tak')}</button></div>`,
      poOtwarciu: el => el.querySelectorAll('[data-odp]').forEach(b => b.addEventListener('click', () => {
        wynik = b.dataset.odp === 'tak';
        Lider.zamknijOkno();
      })),
      przyZamknieciu: () => ok(wynik),
    });
  });

  Lider.zamknijOkno = () => {
    $('okno').hidden = true;
    document.body.classList.remove('z-oknem');
    $('okno-tresc').innerHTML = '';
    hala.brudnopis.usun('okno');
    if (oknoZamykanie) { const f = oknoZamykanie; oknoZamykanie = null; f(); }
  };
  Lider.oknoOtwarte = () => !$('okno').hidden;

  // Okna, które umieją wstać po zamknięciu karty (rejestrują je pliki formularzy): klucz -> fn(parametry).
  Lider.oknaPoStarcie = {};

  /* Pytanie z odpowiedzią tekstową (np. powód pominięcia). Zwraca tekst albo null.
     pole = [typ zdarzenia, pole] — limit znaków z kontraktu, ten sam co w hubie (W.maksPola): dłuższy tekst hub
     odrzuca, a lider traci to, co wpisał. maxlength nie pozwala wpisać więcej, licznik pokazuje, ile zostało. */
  Lider.zapytaj = ({ tytul, pytanie, podpowiedz, przycisk, wymagane, klasa, pole }) => new Promise(ok => {
    let odp = null;
    const maks = W.maksPola(hala.kontrakt, (pole || [])[0], (pole || [])[1]);
    Lider.okno({
      tytul,
      html: `<form class="formularz" id="f-pytanie" novalidate>
        ${pytanie ? `<p>${esc(pytanie)}</p>` : ''}
        <textarea name="tekst" rows="3" maxlength="${maks}" placeholder="${esc(podpowiedz || '')}" ${wymagane ? 'required' : ''}></textarea>
        <small class="slaby licznik-znakow" aria-live="polite">${esc(W.licznikZnakow('', maks))}</small>
        <p class="blad" data-z="blad" hidden></p>
        <button class="${klasa || 'glowny'} szeroki" type="submit">${esc(przycisk || 'OK')}</button>
      </form>`,
      poOtwarciu: el => {
        const f = el.querySelector('form');
        const licznik = f.querySelector('.licznik-znakow'), blad = f.querySelector('[data-z=blad]');
        f.tekst.focus();
        f.tekst.addEventListener('input', () => { licznik.textContent = W.licznikZnakow(f.tekst.value, maks); blad.hidden = true; });
        f.addEventListener('submit', ev => {
          ev.preventDefault();
          const w = W.sprawdzOdpowiedz(f.tekst.value, { wymagane, maks });
          if (w.blad) { blad.textContent = w.blad; blad.hidden = false; f.tekst.focus(); return; }
          odp = w.tekst;
          Lider.zamknijOkno();
        });
      },
      przyZamknieciu: () => ok(odp),
    });
  });

  // ------------------------------------------------------------ brudnopisy formularzy

  /* Formularz z ciągłym auto-zapisem (KONTRAKT §9). Stan formularza to zwykły obiekt `dane`;
     pola z atrybutem name wiążą się z nim same, resztę (zdjęcia, przyciski wyboru) moduł
     zmienia w `dane` i woła zmieniono(). Brudnopis znika dopiero po `await hala.zapisz`.   */
  Lider.formularz = async (klucz, domyslne) => {
    const zapisany = await hala.brudnopis.odczytaj(klucz);
    const dane = Object.assign({}, domyslne || {}, zapisany || {});
    const f = {
      dane, odtworzony: !!zapisany,
      zmieniono() { hala.brudnopis.zapisz(klucz, dane); },
      usun() { return hala.brudnopis.usun(klucz); },
      powiaz(el) {
        for (const pole of el.querySelectorAll('[name]')) {
          const n = pole.name;
          if (dane[n] !== undefined && dane[n] !== null) {
            if (pole.type === 'checkbox') pole.checked = !!dane[n]; else pole.value = dane[n];
          }
          const zmiana = () => { dane[n] = pole.type === 'checkbox' ? pole.checked : pole.value; f.zmieniono(); };
          pole.addEventListener('input', zmiana);
          pole.addEventListener('change', zmiana);
        }
      },
    };
    return f;
  };

  // ------------------------------------------------------------ zdjęcia

  /* Pole zdjęć: miniatury + „Zdjęcie”. lista = tablica id (hala.dodajPlik), zmieniana w miejscu. */
  Lider.poleZdjec = (kontener, lista, naZmiane, opcje) => {
    const o = Object.assign({ maks: 6, etykieta: 'Zdjęcie' }, opcje || {});
    async function rysuj() {
      const miniatury = await Promise.all(lista.map(async id => `<figure class="miniatura">
        <img src="${esc(await hala.adresPliku(id))}" alt="Zdjęcie">
        <button type="button" class="usun" data-usun="${esc(id)}" aria-label="Usuń zdjęcie">✕</button></figure>`));
      kontener.innerHTML = `<div class="zdjecia">${miniatury.join('')}
        ${lista.length < o.maks ? `<label class="przycisk dodaj-zdjecie">📷 ${esc(o.etykieta)}
          <input type="file" accept="image/*" capture="environment" hidden></label>` : ''}</div>`;
      const input = kontener.querySelector('input[type=file]');
      if (input) input.addEventListener('change', async () => {
        const plik = input.files && input.files[0];
        if (!plik) return;
        try {
          lista.push(await hala.dodajPlik(plik));
          naZmiane();
        } catch (e) {
          Lider.komunikat(e.message || 'Nie udało się dodać zdjęcia. Spróbuj jeszcze raz.', 'blad');
        }
        rysuj();
      });
      for (const b of kontener.querySelectorAll('[data-usun]')) {
        b.addEventListener('click', () => {
          const i = lista.indexOf(b.dataset.usun);
          if (i >= 0) lista.splice(i, 1);
          naZmiane();
          rysuj();
        });
      }
    }
    rysuj();
  };

  /* Zdjęcia do obejrzenia (alert, reklamacja) — adresy lokalne albo z huba. */
  Lider.galeria = async (kontener, lista, podpis) => {
    if (!lista || !lista.length) { kontener.innerHTML = ''; return; }
    const img = await Promise.all(lista.map(async id => `<a href="${esc(await hala.adresPliku(id))}" target="_blank" rel="noopener">
      <img src="${esc(await hala.adresPliku(id))}" alt="${esc(podpis || 'Zdjęcie')}"></a>`));
    kontener.innerHTML = `${podpis ? `<div class="podpis">${esc(podpis)}</div>` : ''}<div class="galeria">${img.join('')}</div>`;
  };

  // ------------------------------------------------------------ powiadomienia

  /* Przypomnienia działają przy otwartej aplikacji (także w tle karty). Android Chrome nie
     pozwala na `new Notification` na stronie — tylko przez service workera, stąd dwie drogi.
     o.adres (np. '#zlecenia') — ekran, który otworzy dotknięcie, tak samo jak push z huba (sw.js → 'otworz'). */
  Lider.powiadom = async (tytul, tresc, opcje) => {
    const o = opcje || {};
    try { if (navigator.vibrate) navigator.vibrate(o.wibracja || [200, 100, 200]); } catch (e) { /* bez wibracji */ }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && !o.zawsze) return;       // na ekranie i tak widać
    const op = { body: tresc, tag: o.tag, icon: 'ikona-192.png', renotify: !!o.tag, data: { adres: o.adres || '' } };
    try {
      const rej = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (rej) { await rej.showNotification(tytul, op); return; }
    } catch (e) { /* niżej */ }
    try {
      const n = new Notification(tytul, op);
      n.onclick = () => { window.focus(); otworzZAdresu(o.adres); n.close(); };
    } catch (e) { /* przeglądarka nie pozwala */ }
  };

  /* Dotknięte powiadomienie otwiera swój ekran — jak w UR, KJ i Panelu (przegląd 2026-10-07; wcześniej Lider tylko
     wracał na wierzch). sw.js (wspólny hala-push-sw.js) wysyła otwartemu oknu {typ:'otworz', adres}, a gdy okna nie ma,
     otwiera ./#adres — ten adres czyta start (niżej) i zaraz go czyści, żeby odświeżenie strony nie wracało na ten ekran. */
  function otworzZAdresu(adres) {
    const ekran = W.ekranZAdresu(adres, Object.keys(Lider.ekrany));
    if (ekran) Lider.pokazEkran(ekran);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ev => {
    if (ev.data && ev.data.typ === 'otworz') { window.focus(); otworzZAdresu(ev.data.adres); }
  });

  Lider.poprosOPowiadomienia = () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    } catch (e) { /* starsza przeglądarka */ }
  };

  // ------------------------------------------------------------ linia i zmiana

  Lider.linia = () => Lider.stan.linia;

  function ustalLinie() {
    const p = hala.pracownik;
    Lider.stan.linia = W.liniaStartowa(hala.slowniki, p, p && pamiec.czytaj('linia.' + p.id));
  }

  Lider.ustawLinie = linia => {
    Lider.stan.linia = linia;
    if (hala.pracownik) pamiec.zapisz('linia.' + hala.pracownik.id, linia);
    Lider.narysuj();
  };

  /* Bieżąca zmiana na mojej linii: { linia, zmiana, klucz, zl }. zmiana = null poza godzinami zmian.
     zmianaInna / liniaInna — kontekst ustalony wcześniej (formularz zapamiętał go przy otwarciu, etap 1). */
  Lider.kontekst = (zmianaInna, liniaInna) => {
    const zmiana = zmianaInna || hala.zmianaTeraz();
    const linia = liniaInna || Lider.stan.linia;
    const klucz = zmiana && linia ? W.kluczZmiany(linia, zmiana) : null;
    return { linia, zmiana, klucz, zl: klucz ? hala.obiekt('zmiana_linii', klucz) : null };
  };

  function wyborLinii() {
    const moje = (hala.pracownik && hala.pracownik.linie) || [];
    const linie = W.liniePosortowane(hala.slowniki, moje);
    Lider.okno({
      tytul: 'Na której linii pracujesz?',
      html: `<div class="lista-wyboru">${linie.map(l => `<button type="button" data-linia="${esc(l.kod)}"
          class="${l.kod === Lider.stan.linia ? 'wybrany' : ''}"><b>${esc(l.kod)}</b> ${esc(l.nazwa)}${l.moja ? '' : ' <span class="slaby">(przesunięcie)</span>'}</button>`).join('')}</div>`,
      poOtwarciu: el => el.querySelectorAll('[data-linia]').forEach(b =>
        b.addEventListener('click', () => { Lider.ustawLinie(b.dataset.linia); Lider.zamknijOkno(); })),
    });
  }

  // ------------------------------------------------------------ logowanie

  function pokazSesje() {
    const z = hala.zalogowany();
    $('logowanie').hidden = z;
    $('aplikacja').hidden = !z;
    if (!z) {
      $('blokada').hidden = true;
      if (Lider.oknoOtwarte()) { $('okno').hidden = true; document.body.classList.remove('z-oknem'); }
      rysujCzekajace();
      // Fokus tylko z myszą (czytnik kart przy komputerze) — na telefonie wyskoczyłaby klawiatura na pół ekranu.
      if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) setTimeout(() => $('identyfikator').focus(), 0);
    } else {
      ustalLinie();
      Lider.narysuj();
      przywrocOkno();
    }
    rysujPasek();
  }

  /* Telefon bywa wspólny: zapisy osoby czekają, aż zaloguje się ona sama (hala.js). `moje` liczy
     hala.js dla ostatnio zalogowanej osoby — reszta należy do kogoś jeszcze wcześniej.            */
  function rysujCzekajace() {
    const { oczekuje, moje } = Lider.stan.kolejka;
    const kto = hala.pracownik && hala.pracownik.nazwa;
    const inne = oczekuje - (moje || 0);
    const czesci = [];
    if (moje && kto) czesci.push(`${W.liczebnik(moje, 'zapis czeka', 'zapisy czekają', 'zapisów czeka')} na ${kto}`);
    if (inne > 0) czesci.push(`${W.liczebnik(inne, 'zapis czeka', 'zapisy czekają', 'zapisów czeka')} na inną osobę`);
    $('czeka-na').hidden = !czesci.length;
    $('czeka-na').textContent = czesci.length ? czesci.join(', ') + ' — wyślą się po jej zalogowaniu.' : '';
  }

  async function zaloguj(dane) {
    const blad = $('blad-logowania');
    blad.hidden = true;
    const przyciski = $('formularz-logowania').querySelectorAll('button');
    przyciski.forEach(b => { b.disabled = true; });
    Lider.poprosOPowiadomienia();         // gest użytkownika — jedyna chwila, gdy przeglądarka pozwala zapytać
    try {
      await hala.zaloguj(dane);
      $('identyfikator').value = ''; $('pin').value = '';
      pokazSesje();
    } catch (e) {
      // PIN przyjęty, potknęło się dopiero wczytywanie stanu — sesja jest, resztę dociągnie synchronizacja.
      if (hala.zalogowany()) { $('identyfikator').value = ''; $('pin').value = ''; pokazSesje(); return; }
      blad.textContent = Lider.poLudzku(e);
      blad.hidden = false;
      $('pin').value = '';
      $('pin').focus();
    } finally {
      przyciski.forEach(b => { b.disabled = false; });
    }
  }

  /* Identyfikator + PIN (D24). Enter z czytnika w polu identyfikatora przenosi do PIN-u, zamiast wysyłać
     pusty PIN. Sam PIN przechodzi tylko w trybie przejściowym huba — w ścisłym hub odpowie, czego brakuje. */
  $('formularz-logowania').addEventListener('submit', ev => {
    ev.preventDefault();
    const ident = $('identyfikator').value.trim();
    const pin = $('pin').value.trim();
    if (ident && !pin) { $('pin').focus(); return; }
    if (!ident) {          // STYL-GK §2: to samo zdanie co w hubie i w GK Trasy / GK Flota
      $('blad-logowania').textContent = 'Wpisz imię i nazwisko oraz PIN albo hasło.'; $('blad-logowania').hidden = false;
      $('identyfikator').focus(); return;
    }
    zaloguj(ident ? { identyfikator: ident, pin } : { pin });
  });
  $('formularz-logowania').querySelector('.pinpad').addEventListener('click', ev => {
    const c = ev.target.dataset && ev.target.dataset.cyfra;
    if (!c) return;
    const pole = $('pin');
    pole.value = c === 'C' ? pole.value.slice(0, -1) : (pole.value + c).slice(0, 32);
  });
  // Skan karty tylko wpisuje identyfikator — PIN i tak trzeba podać (D24).
  $('skanuj-karte').addEventListener('click', async () => {
    const t = await HalaSkaner.skanuj({ tytul: 'Zeskanuj identyfikator', podpowiedz: 'Albo wpisz numer karty' });
    if (!t) return;
    const kod = Hala.odczytajKod(t, hala.slowniki);
    $('identyfikator').value = kod.rodzaj === 'pracownik' ? kod.kod : t;
    $('pin').focus();
  });

  // ------------------------------------------------------------ menu

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

  /* „Moje konto” (👤 w nagłówku, STYL-GK §3): wspólne okno z ../wspolne/konto.js — imię i nazwisko, Wygląd, Zmień PIN,
     dane w tym urządzeniu, wersja, Wyloguj — jak w UR, KJ, Panelu i GK Trasy. Rzeczy Lidera (linia, powiadomienia,
     ostatnia synchronizacja) dorysowują się w środku (dodatki). Okno to <dialog> w warstwie górnej — przed oknem Lidera
     (Zmień linię, Odrzucone) zamykamy je, inaczej przykryłoby tamto. */
  $('menu').addEventListener('click', () => {
    HalaKonto.mojeKonto(hala, {
      aplikacja: 'lider', komunikat: Lider.komunikat, wyloguj, odrzucone: pokazOdrzucone,
      dodatki: el => {
        const ost = hala.polaczenie.ostatniaSynchronizacja;
        el.innerHTML = `<fieldset><legend>Linia</legend>
            <p class="hala-konto-drobne">${esc(W.nazwaLinii(hala.slowniki, Lider.stan.linia))}</p>
            <button type="button" data-a="linia">Zmień linię</button></fieldset>
          <fieldset><legend>Powiadomienia</legend>
            <p class="hala-konto-drobne">Przypomnienia z checklisty, Quality Alert i zlecenia od kierownika.</p>
            <div id="push"></div></fieldset>
          <p class="hala-konto-drobne">Ostatnia synchronizacja: ${esc(ost ? W.godzina(ost) : '—')}</p>`;
        el.querySelector('[data-a=linia]').addEventListener('click', () => { el.closest('dialog').close(); wyborLinii(); });
        rysujPush(el.querySelector('#push'), t => Lider.komunikat(t, 'blad'), true);
      },
    });
  });
  // Jedno wylogowanie dla okna menu i dla stopki menu na komputerze (jak „Wyloguj” w GK Trasy).
  async function wyloguj() {
    const k = Lider.stan.kolejka;
    if (k.moje && !(await Lider.potwierdz('Wylogować?', `Czeka na wysłanie: ${k.moje}. Wyślą się, gdy znowu zalogujesz się na tym urządzeniu.`, 'Wyloguj'))) return;
    Lider.zamknijOkno();
    await hala.wyloguj();
    pokazSesje();
  }
  $('menu-wyloguj').addEventListener('click', wyloguj);
  $('wybor-linii').addEventListener('click', wyborLinii);

  // ------------------------------------------------------------ odrzucone i konflikty

  const NAZWY_TYPOW = {
    'awaria.zgloszona': 'Zgłoszenie awarii', 'awaria.potwierdzona': 'Potwierdzenie naprawy',
    'awaria.potwierdzenie_odrzucone': 'Odrzucenie naprawy', 'awaria.anulowana': 'Anulowanie awarii',
    'zmiana.rozpoczeta': 'Otwarcie zmiany', 'checklista.pozycja_wykonana': 'Odhaczenie pozycji',
    'checklista.pozycja_cofnieta': 'Cofnięcie pozycji', 'checklista.pozycja_pominieta': 'Pominięcie pozycji',
    'zmiana.przekazanie': 'Przekazanie zmiany', 'zmiana.raport': 'Raport końcowy', 'zmiana.przekazanie_odczytane': 'Odczyt przekazania',
    'proba.zarejestrowana': 'Próba', 'alert.potwierdzony': 'Potwierdzenie alertu', 'reklamacja.odczytana': 'Odczyt reklamacji',
    'obsada.zgloszona': 'Obsada', 'obsada.zdarzenie': 'Zdarzenie obsady', 'bhp.audyt': 'Audyt BHP',
    'bhp.zgloszenie': 'Zgłoszenie BHP', 'bhp.zamkniete': 'Zamknięcie BHP',
  };
  Lider.nazwaTypu = typ => NAZWY_TYPOW[typ] || typ;

  async function pokazOdrzucone() {
    const lista = await hala.odrzucone();
    const konf = Lider.stan.konflikty;
    Lider.okno({
      tytul: 'Odrzucone i konflikty',
      html: `<h3>Odrzucone przez hub</h3>
        ${lista.length ? `<p class="slaby">Hub nie przyjął tych zapisów. Przepisz je jeszcze raz, poprawiając to, co mówi powód, a potem usuń z listy.</p>` : '<p class="slaby">Brak.</p>'}
        <ul class="lista-prosta">${lista.map(o => `<li><b>${esc(Lider.nazwaTypu(o.zd.typ))}</b> ${esc(W.dataKrotka(o.zd.czas))} ${esc(W.godzina(o.zd.czas))}
          <div class="tekst-alarm">${esc(o.powod)}</div>
          <details><summary>Treść</summary><pre>${esc(JSON.stringify(o.zd.dane, null, 1))}</pre></details>
          <button type="button" class="maly" data-usun="${esc(o.id)}">Usuń z listy</button></li>`).join('')}</ul>
        <h3>Konflikty (od uruchomienia)</h3>
        ${konf.length ? '<p class="slaby">Hub zapisał zdarzenie, ale stan się nie zmienił — ktoś inny zdążył wcześniej.</p>' : '<p class="slaby">Brak.</p>'}
        <ul class="lista-prosta">${konf.map(k => `<li><b>${esc(Lider.nazwaTypu(k.typ))}</b> ${esc(W.godzina(k.czas))}<div>${esc(k.uwaga)}</div></li>`).join('')}</ul>`,
      poOtwarciu: el => el.querySelectorAll('[data-usun]').forEach(b => b.addEventListener('click', async () => {
        await hala.usunOdrzucone(b.dataset.usun);
        pokazOdrzucone();
      })),
    });
  }

  // ------------------------------------------------------------ pasek połączenia (KONTRAKT §9)

  function rysujPasek() {
    const p = hala.polaczenie, k = Lider.stan.kolejka, pasek = $('pasek');
    const czesci = [];
    let klasa = 'ok';
    if (!hala.zalogowany()) {
      pasek.className = 'hala-polaczenie ok';
      pasek.textContent = '';
      rysujCzekajace();
      return;
    }
    const laska = Date.now() - START < LASKA_MS && p.online && !p.blad;
    // Wysyłamy tylko zapisy zalogowanej osoby (moje) — cudze czekają na jej powrót.
    const n = k.moje || 0;
    // Dociąganie (sieć buforuje strumień, np. szybki tunel) to NIE brak połączenia — zmiany przychodzą co kilka sekund.
    const dociaga = p.dociaganie && !p.blad;
    if (!p.online) { klasa = 'offline'; czesci.push(n ? `Brak sieci — ${n} czeka na wysłanie` : 'Brak sieci — zapisy zostają w telefonie'); }
    else if (!p.strumien && !dociaga && !laska) { klasa = 'brak-huba'; czesci.push(`Brak połączenia z hubem${n ? ` — ${n} czeka na wysłanie` : ''}`); }
    else if (n) { klasa = 'kolejka'; czesci.push(`Wysyłanie… ${n}`); }
    else if (dociaga) { klasa = 'kolejka'; czesci.push('Odświeżanie co kilka sekund'); }
    if (k.odrzucone) { klasa = 'odrzucone'; czesci.push(`Odrzucone: ${k.odrzucone} — dotknij`); }
    pasek.className = 'hala-polaczenie ' + klasa;
    pasek.textContent = czesci.join(' · ');
  }
  $('pasek').addEventListener('click', () => { if (hala.zalogowany()) pokazOdrzucone(); });

  // ------------------------------------------------------------ rysowanie

  function rysujNaglowek() {
    const linia = Lider.stan.linia;
    $('wybor-linii').innerHTML = `<b>${esc(linia || '—')}</b> <span>${esc(W.nazwaLinii(hala.slowniki, linia).replace(/^.*?—\s*/, ''))}</span> ▾`;
    const z = hala.zmianaTeraz();
    $('opis-zmiany').innerHTML = z
      ? `<b>${esc(z.nazwa)}</b> <span>${esc(W.godzina(z.od))}–${esc(W.godzina(z.do))}</span>` : '<span>Poza zmianą</span>';
    const p = hala.pracownik;
    // „Anna N. 👤” — 👤 otwiera „Moje konto” jak w pozostałych aplikacjach GK (wcześniej ☰ i osobne menu).
    $('menu').textContent = p && p.nazwa ? String(p.nazwa).split(' ').map((s, i) => (i ? s[0] + '.' : s)).join(' ') + ' 👤' : '👤';
    $('menu-kto').textContent = p ? p.nazwa : '';   // nagłówek menu na komputerze, jak w GK Trasy
  }

  function rysujWezwania() {
    const lista = [];
    for (const fn of Lider.wezwania) { try { lista.push(...(fn() || [])); } catch (e) { console.error(e); } }
    const el = $('wezwania');
    el.innerHTML = lista.map((w, i) => `<button type="button" class="wezwanie ${esc(w.klasa || '')}" data-i="${i}">${w.html}</button>`).join('');
    el.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => lista[+b.dataset.i].akcja()));
  }

  let zaplanowane = false;
  Lider.narysuj = () => {
    // Strumień potrafi przynieść kilkadziesiąt zdarzeń naraz (np. po powrocie sieci) — rysujemy raz na klatkę.
    if (zaplanowane) return;
    zaplanowane = true;
    requestAnimationFrame(() => {
      zaplanowane = false;
      if (!hala.zalogowany()) return;
      if (!Lider.stan.linia) ustalLinie();
      rysujNaglowek();
      rysujWezwania();
      for (const [nazwa, e] of Object.entries(Lider.ekrany)) {
        const el = $('ekran-' + nazwa);
        el.hidden = nazwa !== Lider.stan.ekran;
        if (!el.hidden) { try { e.rysuj(el); } catch (err) { console.error(err); el.innerHTML = `<p class="blad">Błąd ekranu: ${esc(err.message)}</p>`; } }
      }
      for (const fn of Lider.poRysowaniu) { try { fn(); } catch (e) { console.error(e); } }
    });
  };

  Lider.pokazEkran = nazwa => {
    Lider.stan.ekran = nazwa;
    for (const b of document.querySelectorAll('.dolny [data-ekran]')) {
      if (b.dataset.ekran === nazwa) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    window.scrollTo(0, 0);
    Lider.narysuj();
  };
  for (const b of document.querySelectorAll('.dolny [data-ekran]')) b.addEventListener('click', () => Lider.pokazEkran(b.dataset.ekran));

  /* Zlecenia od kierownika: wspólny ekran z wspolne/zlecenia.js. Lider — dział „produkcja”, tylko jego linia;
     mistrz (przełożony liderów, D34) — dział „mistrz”, wszystkie linie: to dwa stanowiska z osobnymi zadaniami. */
  Lider.dzialZlecen = () => W.dzialZlecen(hala.pracownik, Lider.stan.linia);
  Lider.ekrany.zlecenia = { rysuj: el => HalaZlecenia.rysuj(el, hala, Lider.dzialZlecen()) };
  Lider.poRysowaniu.push(() => Lider.plakietka('zlecenia', HalaZlecenia.doZrobienia(hala, Lider.dzialZlecen())));
  HalaZlecenia.sledz(hala, Lider.dzialZlecen, z => {
    Lider.komunikat(`Nowe zlecenie od kierownika: ${(z.dane || {}).tytul || ''}`, 'info', 'zlecenie-' + z.id);
    Lider.powiadom('Nowe zlecenie od kierownika', (z.dane || {}).tytul || '', { tag: 'zlecenie-' + z.id, adres: '#zlecenia' });
  });

  Lider.plakietka = (nazwa, liczba) => {
    const el = document.querySelector(`[data-plakietka="${nazwa}"]`);
    if (!el) return;
    el.hidden = !liczba;
    el.textContent = liczba || '';
  };

  $('okno-zamknij').addEventListener('click', () => Lider.zamknijOkno());
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && Lider.oknoOtwarte()) Lider.zamknijOkno(); });

  /* Liczniki przestoju co sekundę, pełne przerysowanie co 20 s — kolor checklisty zmienia się z upływem czasu. */
  setInterval(() => {
    if (!hala.zalogowany()) return;
    const teraz = hala.teraz();
    for (const el of document.querySelectorAll('[data-od]')) {
      const od = +el.dataset.od;
      if (od) el.textContent = Hala.formatLicznika(teraz - od);
    }
  }, 1000);
  setInterval(() => Lider.narysuj(), 20000);

  // ------------------------------------------------------------ okno po zamknięciu karty

  async function przywrocOkno() {
    const o = await hala.brudnopis.odczytaj('okno');
    if (!o || Lider.oknoOtwarte()) return;
    const fn = Lider.oknaPoStarcie[o.klucz];
    if (fn) { try { fn(o.parametry || {}); } catch (e) { console.error(e); } }
  }

  // ------------------------------------------------------------ start

  hala.na('zmiana', () => Lider.narysuj());
  hala.na('slowniki', () => Lider.narysuj());
  hala.na('sesja', () => pokazSesje());
  hala.na('polaczenie', () => rysujPasek());
  hala.na('kolejka', k => { Lider.stan.kolejka = k; rysujPasek(); });
  hala.na('odrzucone', ({ zdarzenie, plik, powod }) => {
    Lider.komunikat(`${zdarzenie ? Lider.nazwaTypu(zdarzenie.typ) : 'Zdjęcie'} — hub nie przyjął: ${powod}`, 'blad');
    rysujPasek();
  });
  hala.na('konflikt', ({ zdarzenie, uwaga }) => {
    Lider.stan.konflikty.unshift({ typ: zdarzenie.typ, czas: zdarzenie.czas, uwaga });
    Lider.stan.konflikty.length = Math.min(Lider.stan.konflikty.length, 30);
    Lider.komunikat(`${Lider.nazwaTypu(zdarzenie.typ)}: ${uwaga}`, 'blad');
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await hala.start();
    } catch (e) {
      document.body.innerHTML = `<p class="blad" style="padding:20px">Telefon nie otworzył pamięci aplikacji (${esc(e.message)}).
        Wyjdź z trybu prywatnego przeglądarki albo zwolnij miejsce i otwórz aplikację ponownie.</p>`;
      return;
    }
    // Otwarte dotknięciem powiadomienia (./#zlecenia) — ekran z adresu; bez zalogowania czeka w Lider.stan.ekran.
    if (location.hash) {
      otworzZAdresu(location.hash);
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* zostaje w adresie */ }
    }
    pokazSesje();
    setTimeout(rysujPasek, LASKA_MS + 500);   // po okresie łaski pasek mówi prawdę
    // Nowa wersja: odświeża sama, ale nie przy otwartym oknie (formularz, okno awarii) — aktualizacja.js.
    HalaAktualizacja.pilnuj({ komunikat: Lider.komunikat, zajety: () => Lider.oknoOtwarte() });
  });
})();
