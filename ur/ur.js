/* Aplikacja Utrzymania Ruchu — rdzeń: logowanie, pasek połączenia, nawigacja,
   wspólne klocki ekranów (okna, komunikaty, zdjęcia, skaner) i powiadomienia.

   Całą łączność, pracę bez sieci i pamięć w telefonie daje hala.js. Tu jest
   tylko: zaloguj → słuchaj zmian → narysuj ekran z adresu (#awarie, #awaria/<id>…).
   Co pokazać, liczy widok.js (URWidok). Ekrany rejestrują się w UR.ekrany z osobnych
   plików (awarie.js, przeglady.js, kpi.js, plan.js), a start rusza po ich wczytaniu.
   Wzór: kj/web/kj.js — ten sam układ, żeby kto zna KJ, znał UR.                  */

(function (global) {
  'use strict';

  const W = global.URWidok;
  const $ = id => document.getElementById(id);
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 30 dni: KPI z telefonu (instrukcja §5) i „zrealizowane ostatnio” w przeglądach.
  const hala = global.Hala.utworz({ aplikacja: 'ur', typy: ['awaria', 'przeglad', 'licznik_maszyny', 'zlecenie'], dni: 30 });

  const UR = global.UR = { hala, W, $, esc, ekrany: {}, biezacy: null };

  // ------------------------------------------------------------ kto i co może

  UR.ja = () => (hala.pracownik ? hala.pracownik.id : null);
  UR.mozna = (typ, slownik) => W.mozna(hala.kontrakt, hala.pracownik, typ, slownik);
  UR.kierownikUR = () => !!hala.pracownik && (hala.pracownik.role || []).some(r => r === 'kierownik_ur' || r === 'admin');
  UR.stale = () => (hala.kontrakt && hala.kontrakt.stale) || {};
  UR.kontekst = () => ({ slowniki: hala.slowniki, pracownicy: hala.pracownicy, stale: UR.stale(), teraz: hala.teraz(),
                         ja: UR.ja(), kontrakt: hala.kontrakt, pracownik: hala.pracownik });

  /* Adresy rozszerzenia UR (/api/v1/ur/…: KPI za długie okresy, generator planu). hala.js nie ma
     jeszcze publicznej metody na trasy rozszerzeń — prośba 2026-09-25-ur-zapytanie-rozszerzenia.md.
     Do czasu decyzji jedno przejście przez wewnętrzne api klienta (ten sam token, adres huba, korekta
     zegara) — nigdy własny fetch. Bez sieci rzuca błąd jak każde zapytanie.                     */
  UR.zapytaj = (metoda, sciezka, cialo) => (hala.zapytaj ? hala.zapytaj(metoda, sciezka, cialo) : hala._wewn.api(metoda, sciezka, cialo));

  // ------------------------------------------------------------ komunikaty i okna

  let komunikatZegar = null;
  /* rodzaj: ok (zielony) | alarm (czerwony) | uwaga (żółty) | bez rodzaju — ciemny, informacja. Wygląd w hala.css. */
  UR.komunikat = (tekst, rodzaj) => {
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

  /* Okno z pytaniem. przyciski: [{tekst, wartosc, glowny?, alarm?, sprawdz?(FormData)}]. Zwraca
     {wartosc, dane: FormData} klikniętego przycisku, a przy „Wstecz”/Esc — null. przy(okno) —
     opcjonalnie: podpięcie zachowań w treści (chipy, zdjęcia) zaraz po otwarciu.            */
  UR.okno = ({ tytul, tresc, przyciski, przy }) => new Promise(ok => {
    const o = $('okno');
    const lista = przyciski || [{ tekst: 'OK', wartosc: true, glowny: true }];
    // Przycisk z wartością false (Anuluj) nie wysyła formularza — inaczej Enter w polu
    // tekstowym „kliknąłby” pierwszy przycisk, czyli właśnie Anuluj.
    o.innerHTML = `<form class="okno-tresc">
      <h2>${esc(tytul)}</h2><div class="okno-cialo">${tresc || ''}</div>
      <p class="blad" hidden></p>
      <div class="okno-przyciski">${lista.map((p, i) =>
        `<button type="${p.wartosc === false ? 'button' : 'submit'}" value="${i}" class="${p.glowny ? 'glowny' : ''} ${p.zielony ? 'zielony' : ''} ${p.alarm ? 'alarm' : ''}">${esc(p.tekst)}</button>`).join('')}</div></form>`;
    const f = o.querySelector('form');
    const zamknij = wynik => { o.close(); o.innerHTML = ''; ok(wynik); };
    for (const b of f.querySelectorAll('button[type="button"][value]')) b.addEventListener('click', () => zamknij({ wartosc: false, dane: new FormData(f) }));
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const i = ev.submitter && ev.submitter.value !== undefined ? +ev.submitter.value : lista.findIndex(p => p.wartosc !== false);
      const p = lista[i];
      if (p && p.sprawdz) {
        const blad = p.sprawdz(new FormData(f), f);
        if (blad) { const b = f.querySelector('.blad'); b.textContent = blad; b.hidden = false; return; }
      }
      zamknij(p ? { wartosc: p.wartosc, dane: new FormData(f), form: f } : null);
    });
    // Enter w polu tekstowym nie wysyła okna (czytnik kodów kończy Enterem) — tylko przycisk.
    f.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') ev.preventDefault(); });
    o.oncancel = ev => { ev.preventDefault(); zamknij(null); };      // Esc / „wstecz” — jedna obsługa na okno
    o.showModal();
    if (przy) przy(f);
    UR.wypelnijZdjecia(o);
    // showModal sam stawia fokus na pierwszym polu, a to na telefonie otwiera klawiaturę i zasłania
    // połowę okna. Pole dostaje fokus tylko, gdy pisanie jest głównym zadaniem okna (bez data-bez-fokusu).
    const pierwsze = o.querySelector('textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio])');
    if (pierwsze && pierwsze.dataset.bezFokusu === undefined) pierwsze.focus();
    else { const b = o.querySelector('.okno-przyciski button'); if (b) b.focus(); }
  });

  UR.potwierdz = async (tytul, tresc, tak, alarm) => {
    const w = await UR.okno({ tytul, tresc: tresc ? `<p>${esc(tresc)}</p>` : '', przyciski: [
      { tekst: 'Anuluj', wartosc: false }, { tekst: tak || 'Tak', wartosc: true, glowny: !alarm, alarm: !!alarm }] });
    return !!(w && w.wartosc);
  };

  /* Chipy w oknie: <div class="chipy" data-pole="nazwa" data-wiele?> z <button data-wartosc>.
     Wybór trafia do ukrytego pola (wiele — oddzielone „\n”), więc FormData ma go jak zwykłe pole. */
  UR.chipy = (nazwa, opcje, wybrane, wiele) => {
    const zazn = new Set([].concat(wybrane || []));
    return `<div class="chipy" data-pole="${esc(nazwa)}" ${wiele ? 'data-wiele' : ''}>${opcje.map(o =>
      `<button type="button" data-wartosc="${esc(o.kod)}" aria-pressed="${zazn.has(o.kod)}">${esc(o.nazwa)}</button>`).join('')}</div>
      <input type="hidden" name="${esc(nazwa)}" value="${esc(Array.from(zazn).join('\n'))}">`;
  };
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('.chipy button[data-wartosc]');
    if (!b) return;
    const grupa = b.parentElement, wiele = grupa.hasAttribute('data-wiele');
    const wlaczony = b.getAttribute('aria-pressed') !== 'true';
    if (!wiele) for (const x of grupa.querySelectorAll('button')) x.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-pressed', String(wlaczony));
    const pole = grupa.parentElement.querySelector(`input[type=hidden][name="${grupa.dataset.pole}"]`);
    if (pole) {
      pole.value = Array.from(grupa.querySelectorAll('button[aria-pressed="true"]')).map(x => x.dataset.wartosc).join('\n');
      pole.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  UR.lista = (dane, nazwa) => String(dane.get(nazwa) || '').split('\n').filter(Boolean);

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
    catch (e) { UR.komunikat(e.message || 'Nie udało się zapisać zdjęcia. Spróbuj jeszcze raz.', 'alarm'); r(null); }
  });
  // Anulowanie wyboru pliku nie wysyła 'change' — bez 'cancel' obietnica wisiałaby do następnego zdjęcia.
  $('plik-zdjecia').addEventListener('cancel', () => { const r = wyborZdjecia; wyborZdjecia = null; if (r) r(null); });
  UR.zrobZdjecie = () => new Promise(ok => {
    if (wyborZdjecia) wyborZdjecia(null);
    wyborZdjecia = ok;
    $('plik-zdjecia').click();
  });

  UR.miniatury = (ids, usuwalne) => (ids || []).map(id =>
    `<figure class="miniatura"><img data-plik="${esc(id)}" alt="Zdjęcie">${usuwalne
      ? `<button type="button" class="usun-zdjecie" data-usun-zdjecie="${esc(id)}" aria-label="Usuń zdjęcie">×</button>` : ''}</figure>`).join('');
  UR.wypelnijZdjecia = async kontener => {
    for (const img of (kontener || document).querySelectorAll('img[data-plik]:not([src])')) {
      try { img.src = await hala.adresPliku(img.dataset.plik); } catch (e) { /* bez podglądu */ }
    }
  };

  /* Pole zdjęć w formularzu: <div class="zdjecia" data-zdjecia="klucz"> z miniaturami i „+ Zdjęcie”.
     Ids trzyma ukryte pole (JSON), więc przechodzą przez FormData i brudnopis jak tekst.  */
  UR.poleZdjec = (nazwa, ids) => `<div class="zdjecia" data-zdjecia="${esc(nazwa)}">${UR.miniatury(ids, true)}
      <button type="button" class="zrob-zdjecie" data-dodaj-zdjecie><span class="ikona" aria-hidden="true">📷</span>Zdjęcie</button>
      <input type="hidden" name="${esc(nazwa)}" value="${esc(JSON.stringify(ids || []))}"></div>`;
  UR.zdjeciaZ = (dane, nazwa) => { try { return JSON.parse(dane.get(nazwa) || '[]'); } catch (e) { return []; } };
  document.addEventListener('click', async ev => {
    const dodaj = ev.target.closest && ev.target.closest('[data-dodaj-zdjecie]');
    const usun = ev.target.closest && ev.target.closest('[data-usun-zdjecie]');
    const pole = (dodaj || usun) && (dodaj || usun).closest('[data-zdjecia]');
    if (!pole) {
      const img = ev.target.closest && ev.target.closest('figure.miniatura img');
      if (img && img.src && !$('okno').open) UR.okno({ tytul: 'Zdjęcie', tresc: `<img class="podglad-zdjecia" src="${esc(img.src)}" alt="Zdjęcie">` });
      return;
    }
    const ukryte = pole.querySelector('input[type=hidden]');
    let ids = []; try { ids = JSON.parse(ukryte.value || '[]'); } catch (e) { ids = []; }
    if (usun) ids = ids.filter(x => x !== usun.dataset.usunZdjecie);
    if (dodaj) {
      if (ids.length >= W.MAKS_ZDJEC) { UR.komunikat(`Najwyżej ${W.MAKS_ZDJEC} zdjęć.`, 'uwaga'); return; }
      const id = await UR.zrobZdjecie();
      if (!id) return;
      ids.push(id);
    }
    ukryte.value = JSON.stringify(ids);
    pole.querySelectorAll('figure.miniatura').forEach(f => f.remove());
    pole.insertAdjacentHTML('afterbegin', UR.miniatury(ids, true));
    UR.wypelnijZdjecia(pole);
    ukryte.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // ------------------------------------------------------------ skaner

  UR.skanuj = async (tytul, podpowiedz) => {
    if (!global.HalaSkaner) { UR.komunikat('Brak skanera. Odśwież aplikację.', 'alarm'); return null; }
    return global.HalaSkaner.skanuj({ tytul, podpowiedz });
  };

  /* Skan maszyny jako dowód obecności (awaria „Na miejscu”, start przeglądu). Zła maszyna
     jest odrzucana w telefonie, zanim cokolwiek pójdzie do huba. Zwraca tekst skanu albo null. */
  UR.skanujMaszyne = async (maszyna, tytul) => {
    for (;;) {
      const t = await UR.skanuj(tytul || 'Zeskanuj maszynę', `Kod ${maszyna}`);
      if (t === null) return null;
      const s = W.sprawdzMaszyne(t, hala.slowniki, maszyna);
      if (s.ok) return t;
      UR.brzeczyk.blad();
      const w = await UR.okno({ tytul: 'Zła maszyna', tresc: `<p class="blad">${esc(s.blad)}</p>`,
        przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: 'Skanuj jeszcze raz', wartosc: true, glowny: true }] });
      if (!w || !w.wartosc) return null;
    }
  };

  // ------------------------------------------------------------ powiadomienia (przy otwartej aplikacji)

  /* Mechanik ma telefon w kieszeni i hałas wokół: dźwięk + wibracja + powiadomienie systemowe.
     Przy ZAMKNIĘTEJ aplikacji potrzebny jest Web Push (DECYZJE O4) — właściciel: później.
     Dźwięk z WebAudio (bez pliku): przeglądarka gra dopiero po pierwszym dotknięciu strony,
     dlatego pasek „Dotknij, żeby włączyć dźwięk”.                                          */
  let audio = null;
  function kontekstAudio() {
    if (!audio) { const K = global.AudioContext || global.webkitAudioContext; if (!K) return null; audio = new K(); }
    return audio;
  }
  function ton(czestotliwosc, odMs, dlugoscMs, glosnosc) {
    const a = kontekstAudio();
    if (!a || a.state !== 'running') return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'square'; o.frequency.value = czestotliwosc;
    const t0 = a.currentTime + odMs / 1000;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(glosnosc, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dlugoscMs / 1000);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + dlugoscMs / 1000 + 0.05);
  }
  UR.brzeczyk = {
    awaria(pilna) {
      // Zatrzymanie linii: trzy serie wysokich tonów; reszta — dwa tony. Słychać w hałasie hali.
      const serie = pilna ? 3 : 1;
      for (let s = 0; s < serie; s++) { ton(1320, s * 700, 180, 0.35); ton(990, s * 700 + 220, 180, 0.35); ton(1320, s * 700 + 440, 220, 0.35); }
      try { navigator.vibrate && navigator.vibrate(pilna ? [400, 150, 400, 150, 400, 150, 800] : [300, 120, 300]); } catch (e) { /* bez wibracji */ }
    },
    blad() { ton(220, 0, 300, 0.25); try { navigator.vibrate && navigator.vibrate([80, 60, 80]); } catch (e) { /* – */ } },
    ok() { ton(880, 0, 90, 0.15); try { navigator.vibrate && navigator.vibrate(40); } catch (e) { /* – */ } },
  };
  function odblokujDzwiek() {
    const a = kontekstAudio();
    if (a && a.state !== 'running') a.resume().catch(() => {});
    setTimeout(pokazDzwonek, 300);
  }
  function pokazDzwonek() {
    const a = kontekstAudio();
    $('dzwonek').hidden = !hala.zalogowany() || !a || a.state === 'running';
  }
  document.addEventListener('pointerdown', odblokujDzwiek, true);
  $('dzwonek').addEventListener('click', () => { odblokujDzwiek(); UR.brzeczyk.ok(); });

  UR.powiadomienia = {
    dostepne: () => 'Notification' in global,
    stan: () => ('Notification' in global ? Notification.permission : 'brak'),
    async wlacz() {
      if (!('Notification' in global)) return 'brak';
      try { return await Notification.requestPermission(); } catch (e) { return Notification.permission; }
    },
    async pokaz(p) {
      if (!('Notification' in global) || Notification.permission !== 'granted') return;
      const opcje = { body: p.tresc, tag: 'awaria-' + (p.obiekt || ''), renotify: true, requireInteraction: !!p.pilna,
                      icon: 'ikona-192.png', badge: 'ikona.svg', data: { adres: W.adresPowiadomienia(p) } };
      // Przez service worker, bo „new Notification” nie działa na Androidzie; bez workera (http) — wprost.
      try {
        const rej = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (rej) { await rej.showNotification(p.tytul, opcje); return; }
      } catch (e) { /* niżej */ }
      try { const n = new Notification(p.tytul, opcje); n.onclick = () => { global.focus(); location.hash = W.adresPowiadomienia(p); n.close(); }; } catch (e) { /* – */ }
    },
  };
  // Dotknięcie powiadomienia (przez service worker) → karta awarii.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', ev => {
      if (ev.data && ev.data.typ === 'otworz' && ev.data.adres) { global.focus(); location.hash = ev.data.adres; }
    });
  }

  /* Nowe zdarzenie z huba (strumień albo dociągnięcie po powrocie sieci). Po otwarciu aplikacji
     hala.js dociąga zaległe zdarzenia — o starych awariach nie dzwonimy (lista i tak je pokazuje),
     a kilka naraz składamy w jedno powiadomienie.                                             */
  let paczkaPowiadomien = [], paczkaZegar = null;
  hala.na('zdarzenie', z => {
    if (!hala.zalogowany()) return;
    const p = W.powiadomienie(z, UR.kontekst());
    if (!p || !W.swieze(z, hala.teraz())) return;
    paczkaPowiadomien.push(p);
    clearTimeout(paczkaZegar);
    paczkaZegar = setTimeout(() => {
      const lista = paczkaPowiadomien; paczkaPowiadomien = [];
      const pilna = lista.some(x => x.pilna);
      UR.brzeczyk.awaria(pilna);
      if (lista.length === 1) { UR.powiadomienia.pokaz(lista[0]); UR.komunikat(lista[0].tytul, pilna ? 'alarm' : 'uwaga'); }
      else {
        UR.powiadomienia.pokaz({ tytul: `Nowe awarie: ${lista.length}`, tresc: lista.map(x => x.tytul).join(' · '), pilna, obiekt: '' });
        UR.komunikat(`Nowe awarie: ${lista.length}`, pilna ? 'alarm' : 'uwaga');
      }
      migajTytulem(lista.length);
    }, 400);
  });

  // Tytuł karty mruga, dopóki mechanik nie wróci do aplikacji (karta w tle przeglądarki).
  const TYTUL = document.title;
  let mruganie = null;
  function migajTytulem(n) {
    if (document.visibilityState === 'visible') return;
    clearInterval(mruganie);
    let i = 0;
    mruganie = setInterval(() => { document.title = i++ % 2 ? TYTUL : `(${n}) Awaria!`; }, 1000);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { clearInterval(mruganie); document.title = TYTUL; }
  });

  // ------------------------------------------------------------ nawigacja

  UR.ekran = (nazwa, def) => { UR.ekrany[nazwa] = def; };
  // Zlecenia od kierownika (Panel → dział „ur”): wspólny ekran z wspolne/zlecenia.js.
  UR.ekran('zlecenia', { rysuj: el => global.HalaZlecenia.rysuj(el, hala, { dzial: 'ur' }) });
  global.HalaZlecenia.sledz(hala, () => ({ dzial: 'ur' }), z => UR.komunikat(`Nowe zlecenie od kierownika: ${(z.dane || {}).tytul || ''}`));
  UR.idz = adres => { if (location.hash !== '#' + adres) location.hash = adres; else pokazEkran(); };

  // #awaria/<id> bez tej awarii w telefonie (np. dotknięty push przed synchronizacją) → lista (URWidok.ekranZAdresu).
  const adres = () => W.ekranZAdresu(location.hash, Object.keys(UR.ekrany), id => !!hala.obiekt('awaria', id));

  function pokazEkran() {
    if (!hala.zalogowany()) return;
    const a = adres();
    const def = UR.ekrany[a.nazwa];
    UR.biezacy = Object.assign({ def }, a);
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
    UR.wypelnijZdjecia(el);
  }
  function pokazBlad(e) {
    console.error(e);
    $('ekran').innerHTML = `<p class="pusto blad">Coś poszło nie tak: ${esc(e && e.message)}. Wróć do listy awarii i spróbuj jeszcze raz.</p>`;
  }
  global.addEventListener('hashchange', () => { pokazEkran(); global.scrollTo(0, 0); });

  /* Strumień przyniósł zmianę: ekran rysujemy od nowa (raz na klatkę), ale nie spod palca —
     otwarte okno, pole w trakcie pisania i rozwinięte sekcje zostają.                  */
  let zaplanowane = false, czekaNaFokus = false, wymus = false;
  /* Palec na ekranie: przerysowanie między dotknięciem a puszczeniem podmienia przycisk i „click”
     nie przychodzi — mechanik w rękawicy musi dotknąć drugi raz (błąd z przeglądu kodu). Czekamy,
     aż palec zejdzie z ekranu, i dopiero wtedy rysujemy. */
  let palec = false, poPalcu = false;
  document.addEventListener('pointerdown', () => { palec = true; }, true);
  const puscil = () => { palec = false; if (poPalcu) { poPalcu = false; setTimeout(() => UR.odswiez(), 60); } };
  document.addEventListener('pointerup', puscil, true);
  document.addEventListener('pointercancel', puscil, true);
  UR.odswiez = powod => {
    if (powod === 'wymus') wymus = true;
    if (palec) { poPalcu = true; return; }
    if (zaplanowane) return;
    zaplanowane = true;
    requestAnimationFrame(() => {
      zaplanowane = false;
      const w = wymus; wymus = false;
      if (!hala.zalogowany() || !UR.biezacy) return;
      // Lista stała zamiast karty z powiadomienia, bo awarii jeszcze nie było — doszła, więc pokazujemy jej kartę.
      if (UR.biezacy.zastepczy && UR.biezacy.czeka && hala.obiekt('awaria', UR.biezacy.czeka)) { pokazEkran(); return; }
      rysujNaglowek();
      rysujPlakietki();
      const def = UR.biezacy.def, el = $('ekran');
      if (def.odswiez) { def.odswiez(el, UR.biezacy.parametr); return; }      // ekran sam wie, co podmienić
      const a = document.activeElement;
      if (!w && a && el.contains(a) && /^(SELECT|INPUT|TEXTAREA)$/.test(a.tagName)) {
        if (!czekaNaFokus) { czekaNaFokus = true; el.addEventListener('focusout', () => { czekaNaFokus = false; UR.odswiez(); }, { once: true }); }
        return;
      }
      const rozwiniete = new Set(Array.from(el.querySelectorAll('details[open] > summary')).map(x => x.textContent.replace(/\d+/g, '#')));
      const y = global.scrollY;
      try { def.rysuj(el, UR.biezacy.parametr); } catch (e) { pokazBlad(e); }
      for (const x of el.querySelectorAll('details > summary')) if (rozwiniete.has(x.textContent.replace(/\d+/g, '#'))) x.parentElement.open = true;
      UR.wypelnijZdjecia(el);
      global.scrollTo(0, y);
    });
  };

  function rysujNaglowek() {
    const z = hala.zmianaTeraz();
    $('zmiana').innerHTML = z ? `<b>${esc(z.nazwa)}</b> <span>${esc(W.godzina(z.od))}–${esc(W.godzina(z.do))}</span>` : '';
    $('kto').textContent = hala.pracownik ? hala.pracownik.nazwa : '';
    $('menu-kto').textContent = $('kto').textContent;   // nagłówek menu na komputerze, jak w GK Trasy
  }

  /* Plakietki na zakładkach: ile awarii czeka na przyjęcie i ile przeglądów jest opóźnionych. */
  function rysujPlakietki() {
    const nowe = hala.obiekty('awaria', a => a.aktywny && a.status === 'zgloszona').length;
    const teraz = hala.teraz();
    const opoz = hala.obiekty('przeglad', p => p.aktywny && W.statusPrzegladu(p, teraz).kod === 'opozniony').length;
    const ustaw = (id, n) => { const e = $(id); e.hidden = !n; e.textContent = n > 99 ? '99+' : String(n); };
    ustaw('licznik-nowych', nowe);
    ustaw('licznik-opoznionych', opoz);
    ustaw('licznik-zlecen', global.HalaZlecenia.doZrobienia(hala, { dzial: 'ur' }));
  }

  // ------------------------------------------------------------ logowanie

  function komunikatBledu(e) {
    // fetch bez sieci rzuca TypeError z angielskim tekstem przeglądarki — zamieniamy na instrukcję.
    if (!e || e instanceof TypeError || !e.kod) return 'Brak połączenia z hubem. Sprawdź sieć i spróbuj jeszcze raz.';
    if (e.kod === 403) return 'To konto nie ma dostępu do Utrzymania Ruchu. Zaloguj się kontem mechanika albo kierownika UR.';
    // 400/401/429 hub opisuje po polsku i mówi, co zrobić (D24: „Złe imię i nazwisko albo PIN”, blokada na 5 min).
    return e.message || 'Nie udało się zalogować. Sprawdź identyfikator i PIN.';
  }
  UR.komunikatBledu = komunikatBledu;

  /* Logowanie identyfikatorem i PIN-em (D24): identyfikator to kod z karty (aparat albo czytnik „piszący”
     jak klawiatura i kończący Enterem) albo login. Enter z czytnika przenosi do PIN-u, zamiast wysyłać
     pusty PIN. Sam PIN (bez identyfikatora) przechodzi tylko w trybie przejściowym huba. */
  async function zaloguj() {
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
    try {
      await hala.zaloguj(ident ? { identyfikator: ident, pin } : { pin });
      $('identyfikator').value = ''; $('pin').value = '';
      pokazSesje();
    } catch (e) {
      // Hub przyjął logowanie, a potknęło się wczytywanie stanu — sesja jest, resztę dociągnie synchronizacja.
      if (hala.zalogowany()) { $('identyfikator').value = ''; $('pin').value = ''; pokazSesje(); return; }
      blad.textContent = komunikatBledu(e);
      blad.hidden = false;
      $('pin').value = '';
      $('pin').focus();
    } finally {
      for (const b of document.querySelectorAll('#formularz-logowania button')) b.disabled = false;
    }
  }

  $('formularz-logowania').addEventListener('submit', ev => { ev.preventDefault(); zaloguj(); });
  // Skan karty aparatem wpisuje identyfikator i przenosi do PIN-u — nie loguje od razu (D24).
  $('skanuj-karte').addEventListener('click', async () => {
    const t = await UR.skanuj('Zeskanuj identyfikator', 'Numer karty');
    if (!t) return;
    $('identyfikator').value = t.replace(/^HALA:P:/i, '');
    $('pin').focus();
  });

  async function wyloguj() {
    const k = hala.stanKolejki().moje;
    if (k && !(await UR.potwierdz('Wylogować?', `Czeka na wysłanie: ${k}. Wyślą się, gdy znowu zalogujesz się na tym urządzeniu.`, 'Wyloguj'))) return;
    await hala.wyloguj();
    pokazSesje();
  }
  $('menu-wyloguj').addEventListener('click', wyloguj);   // stopka menu na komputerze, jak w GK Trasy
  /* „Moje konto” (👤 w nagłówku, STYL-GK §3): wspólne okno z ../wspolne/konto.js — imię i nazwisko, Wygląd, Zmień PIN,
     dane w tym urządzeniu, wersja, Wyloguj. Wcześniej goły „Wyloguj” w nagłówku, a Motyw i PIN pod „Więcej”. */
  $('konto').addEventListener('click', () => global.HalaKonto.mojeKonto(hala, {
    aplikacja: 'ur', komunikat: (t, r) => UR.komunikat(t, r), wyloguj, odrzucone: () => UR.idz('odrzucone') }));

  function pokazSesje() {
    const z = hala.zalogowany();
    if (!z) { clearInterval(mruganie); document.title = TYTUL; }      // po „Wyjdź” tytuł nie woła już o awarie
    $('logowanie').hidden = z;
    $('aplikacja').hidden = !z;
    document.body.classList.toggle('kierownik-ur', z && UR.kierownikUR());
    rysujPasek();
    pokazDzwonek();
    if (z) { rysujNaglowek(); rysujPlakietki(); pokazEkran(); } else if (global.matchMedia && global.matchMedia('(pointer: fine)').matches) { setTimeout(() => $('identyfikator').focus(), 0); }   // na telefonie fokus = klawiatura zasłania pół ekranu
  }

  // ------------------------------------------------------------ pasek połączenia (KONTRAKT §9)

  let kolejka = { oczekuje: 0, moje: 0, odrzucone: 0 };
  const START = Date.now(), LASKA_MS = 5000;

  function rysujPasek() {
    const p = hala.polaczenie, pasek = $('pasek');
    const czesci = [];
    let klasa = 'ok';
    if (hala.zalogowany()) {
      const laska = Date.now() - START < LASKA_MS && p.online && !p.blad;
      if (!p.strumien && p.dociaganie && !p.blad) {
        // Sieć zatrzymuje strumień, ale hub odpowiada — zmiany przychodzą co kilka sekund. To nie „brak połączenia”.
        klasa = 'kolejka';
        czesci.push('Odświeżanie co kilka sekund' + (kolejka.moje ? ` — wysyłam: ${kolejka.moje}` : ''));
      } else if (!p.strumien && !laska) {
        klasa = p.online ? 'brak-huba' : 'offline';
        czesci.push(p.online ? 'Brak połączenia z hubem' + (kolejka.moje ? ` — ${kolejka.moje} czeka na wysłanie` : '')
          : 'Brak sieci — zapisy zostają w telefonie' + (kolejka.moje ? ` (${kolejka.moje})` : ''));   // STYL-GK §6, jak Lider
      } else if (kolejka.moje) {
        klasa = 'kolejka';
        czesci.push(`Wysyłam: ${kolejka.moje}`);
      }
      if (kolejka.odrzucone) { klasa = 'odrzucone'; czesci.push(`Odrzucone: ${kolejka.odrzucone} — dotknij`); }
    }
    pasek.className = 'hala-polaczenie ' + klasa;
    pasek.textContent = czesci.join(' · ');
    pasek.disabled = !kolejka.odrzucone;
  }
  $('pasek').addEventListener('click', () => { if (kolejka.odrzucone) UR.idz('odrzucone'); });
  UR.online = () => !!hala.polaczenie.strumien || !!(hala.polaczenie.dociaganie && !hala.polaczenie.blad) || (hala.polaczenie.online && !hala.polaczenie.blad);

  // Odrzucone przez hub: nic nie znika samo — człowiek czyta powód i decyduje (KONTRAKT §5.2).
  UR.ekran('odrzucone', {
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
    odswiez() { /* lista czyta IndexedDB — przerysowanie na każde zdarzenie migałoby */ },
  });
  document.addEventListener('click', async ev => {
    const b = ev.target.closest && ev.target.closest('[data-usun-odrzucone]');
    if (!b) return;
    if (!(await UR.potwierdz('Usunąć z listy?', 'Ten zapis nie trafił do huba. Po usunięciu trzeba go wprowadzić jeszcze raz.', 'Usuń', true))) return;
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

  UR.ekran('wiecej', {
    rysuj(el) {
      el.innerHTML = `<h1>Więcej</h1>
        <nav class="menu">
          <a class="przycisk" href="#liczniki">Liczniki maszyn (motogodziny, cykle)</a>
          ${UR.kierownikUR() ? '<a class="przycisk" href="#plan">Plan przeglądów: karty i harmonogram</a>' : ''}
          <a class="przycisk" href="#odrzucone">Odrzucone przez hub${kolejka.odrzucone ? ` (${kolejka.odrzucone})` : ''}</a>
        </nav>
        <h2>Powiadomienia o awariach</h2>
        <p class="slaby">Dźwięk i wibracja działają, gdy aplikacja jest otwarta (także w tle).</p>
        <div id="push"></div>
        <button type="button" class="szeroki" id="test-dzwieku" style="margin-top:10px">Sprawdź dźwięk</button>
        <p class="slaby stopka">Zalogowany: ${esc(hala.pracownik && hala.pracownik.nazwa)} · <span id="wersja">klient ${esc(hala.wersja)}</span></p>`;
      global.HalaAktualizacja.wpiszWersje(el.querySelector('#wersja'), 'ur');
      rysujPush(el.querySelector('#push'), t => UR.komunikat(t, 'alarm'), true);
      el.querySelector('#test-dzwieku').addEventListener('click', () => { odblokujDzwiek(); setTimeout(() => UR.brzeczyk.awaria(true), 150); });
    },
  });

  // ------------------------------------------------------------ start

  hala.na('zmiana', () => UR.odswiez());
  hala.na('slowniki', () => UR.odswiez());
  hala.na('sesja', pokazSesje);
  hala.na('polaczenie', rysujPasek);
  hala.na('kolejka', k => { kolejka = k; rysujPasek(); });
  /* Opis naprawy nie może przepaść: brudnopis „Zakończ naprawę” kasujemy, gdy zdarzenie jest w kolejce,
     a hub może je potem odrzucić albo zapisać bez skutku (ktoś zamknął awarię wcześniej). Wtedy wraca
     do brudnopisu — mechanik zobaczy go przy następnym „Zakończ” (błąd z przeglądu kodu). */
  function zachowajOpisNaprawy(zd) {
    if (!zd || zd.typ !== 'awaria.zakonczona_ur') return false;
    const d = zd.dane || {};
    hala.brudnopis.zapisz(`zakonczenie:${zd.obiekt}`, { gotowe: [], dopisek: d.opis_naprawy || '', typ_usterki: d.typ_usterki || '',
                                                       czesci: d.czesci || '', zdjecia: d.zdjecia || [] });
    return true;
  }
  hala.na('odrzucone', ({ zdarzenie, powod }) => {
    UR.brzeczyk.blad();
    UR.komunikat(`Hub nie przyjął zapisu: ${powod}${zachowajOpisNaprawy(zdarzenie) ? ' Opis naprawy zachowany.' : ''}`, 'alarm');
  });
  /* Konflikt (KONTRAKT §5.2): hub zapisał, ale stan się nie zmienił — najczęściej drugi mechanik
     był szybszy. Stan po nim dociąga synchronizacja, więc komunikat składamy chwilę później. */
  hala.na('konflikt', ({ zdarzenie, uwaga }) => {
    // Przegląd z planu, który już jest (drugi generator) — to nie sprawa człowieka.
    if (zdarzenie && zdarzenie.typ === 'przeglad.zaplanowany') return;
    setTimeout(() => {
      const spec = hala.kontrakt && hala.kontrakt.zdarzenia[zdarzenie.typ];
      const ob = spec ? hala.obiekt(spec.obiekt, zdarzenie.obiekt) : null;
      const tekst = (W.komunikatKonfliktu(zdarzenie, ob, UR.kontekst()) || `Zapisane, ale bez zmiany stanu: ${uwaga}`) +
        (zachowajOpisNaprawy(zdarzenie) ? ' Opis naprawy zachowany.' : '');
      UR.brzeczyk.blad();
      UR.komunikat(tekst, 'uwaga');
      UR.odswiez('wymus');
    }, 800);
  });

  document.addEventListener('DOMContentLoaded', async () => {
    await hala.start();
    pokazSesje();
    setTimeout(rysujPasek, LASKA_MS + 500);
    // Liczniki przestoju co sekundę (tylko liczby), pełne przerysowanie co minutę (opóźnienia przeglądów).
    setInterval(() => {
      if (!hala.zalogowany()) return;
      const teraz = hala.teraz();
      for (const e of document.querySelectorAll('[data-od]')) {
        const od = +e.dataset.od;
        if (od) e.textContent = Hala.formatLicznika(teraz - od);
      }
    }, 1000);
    setInterval(() => { rysujNaglowek(); rysujPlakietki(); UR.odswiez(); }, 60000);
    // Nowa wersja: odświeża sama, ale nie przy otwartym oknie ani formularzu (aktualizacja.js).
    global.HalaAktualizacja.pilnuj({ komunikat: UR.komunikat, zajety: () => !!(UR.biezacy && UR.biezacy.def.formularz) });
  });
})(window);
