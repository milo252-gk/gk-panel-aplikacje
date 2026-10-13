/* Hala — wspólne działania wszystkich aplikacji hali (D55, prośby właściciela 2026-10-13). Dla Lidera, UR, KJ i Panelu.

     HalaDzwieki.zagraj('awaria' | 'pilne')            // dwa RÓŻNE dźwięki: awaria (syrena) i pilne zadanie (gong)
     HalaDzwieki.sledz(hala, { awarie: true, zlecenia: () => ({ dzial, linia? }), wlaczony: () => bool })
     HalaDzialania.historia(hala, 'zlecenie', id)      // okno: kto, kiedy, notatki i zdjęcia — cała droga zlecenia
     HalaDzialania.zglos(hala, { maszyna?, dzial })     // zgłoszenie nieprawidłowości do kierownika zakładu
     HalaDzialania.odlozNarzedzia(hala)                 // mistrz: zużyte narzędzia w miejscu odbioru, ze zdjęciem
     HalaDzialania.skanujMaszyne(hala, opcje)           // skan QR → „Wykonaj zadanie / Zgłoś awarię / Zgłoś nieprawidłowość”

   Okna to <dialog class="hala-okno"> (hala.css) — jedno wyglądające tak samo w każdej aplikacji. Zapis wyłącznie przez
   hala.js (hala.zapisz, hala.dodajPlik), więc działa też bez sieci (kolejka telefonu). Czyste funkcje (testy:
   wspolne/testy/reduktor-testy.js): HalaDzialania.wierszeHistorii, HalaDzialania.zadaniaMaszyny. */
(function (global) {
  'use strict';

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const H = () => global.Hala;

  // ================================================================ dźwięki

  /* Dwa sygnały, które da się rozróżnić bez patrzenia (właściciel: „wszyscy mają słyszeć pilne zadania i awarie —
     to mają być 2 osobne dźwięki”): AWARIA — ostra syrena (prostokąt, wysoko–nisko, przy zatrzymaniu trzy serie),
     PILNE ZADANIE — miękki gong w górę (sinus, trzy dźwięki). Przeglądarka gra dopiero po pierwszym dotknięciu
     strony — kontekst odblokowujemy przy każdym dotknięciu i klawiszu. */
  const WZORY = {
    awaria: [[1320, 0, 180, 'square'], [990, 220, 180, 'square'], [1320, 440, 220, 'square']],
    pilne: [[659, 0, 220, 'sine'], [880, 240, 220, 'sine'], [1175, 480, 420, 'sine']],
  };
  const WIBRACJE = { awaria: [400, 150, 400, 150, 400], pilne: [150, 100, 150] };
  let audio = null;
  function kontekst() {
    if (!audio) { const K = global.AudioContext || global.webkitAudioContext; if (!K) return null; try { audio = new K(); } catch (e) { return null; } }
    return audio;
  }
  function odblokuj() { const a = kontekst(); if (a && a.state === 'suspended') a.resume().catch(() => {}); }
  if (global.document) for (const zd of ['pointerdown', 'keydown']) global.document.addEventListener(zd, odblokuj, { capture: true, passive: true });

  function ton(a, hz, odMs, dlMs, typ, glosnosc) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = typ; o.frequency.value = hz;
    const t0 = a.currentTime + 0.02 + odMs / 1000;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(glosnosc, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dlMs / 1000);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + dlMs / 1000 + 0.05);
  }

  /* rodzaj: 'awaria' | 'pilne'; mocno = zatrzymanie (trzy serie syreny). Zwraca, czy zagrało (false = brak dźwięku
     w przeglądarce albo jeszcze nie odblokowany — aplikacja pokazuje wtedy pasek „Dotknij, żeby włączyć dźwięk”). */
  function zagraj(rodzaj, mocno) {
    const wzor = WZORY[rodzaj];
    if (!wzor) return false;
    try { global.navigator && global.navigator.vibrate && global.navigator.vibrate(WIBRACJE[rodzaj]); } catch (e) { /* bez wibracji */ }
    const a = kontekst();
    if (!a) return false;
    if (a.state !== 'running') { a.resume().catch(() => {}); return false; }
    const serie = rodzaj === 'awaria' && mocno ? 3 : 1;
    for (let s = 0; s < serie; s++) for (const [hz, od, dl, typ] of wzor) ton(a, hz, s * 700 + od, dl, typ, rodzaj === 'awaria' ? 0.35 : 0.3);
    return true;
  }
  const gotowy = () => { const a = kontekst(); return !!a && a.state === 'running'; };

  /* Słucha hali: NOWA awaria (zgłoszona, nie przeze mnie) → syrena; NOWE pilne zlecenie dla mnie albo mojego działu
     → gong. Przy starcie i po zalogowaniu nic nie gra (to, co już było, człowiek widzi na liście). opcje.zlecenia() —
     jak w HalaZlecenia.sledz ({dzial, linia?, linie?}); null = bez gongu. opcje.wlaczony() — przełącznik aplikacji. */
  function sledz(hala, opcje) {
    const o = opcje || {};
    const znane = new Set();
    const dopisz = () => { for (const t of ['awaria', 'zlecenie']) for (const x of (hala.obiekty(t) || [])) znane.add(`${t}|${x.id}|${x.status}`); };
    hala.na('sesja', () => { znane.clear(); dopisz(); });
    hala.na('zmiana', ({ typ, id, obiekt }) => {
      if (typ === '*') { dopisz(); return; }
      if ((typ !== 'awaria' && typ !== 'zlecenie') || !obiekt) return;
      const klucz = `${typ}|${id}|${obiekt.status}`;
      if (znane.has(klucz)) return;
      znane.add(klucz);
      if (obiekt._oczekuje || (o.wlaczony && !o.wlaczony())) return;            // własny zapis z tego telefonu
      const d = obiekt.dane || {};
      if (typ === 'awaria' && o.awarie !== false && obiekt.status === 'zgloszona' && obiekt.aktywny !== false
          && d.zglosil !== (hala.pracownik && hala.pracownik.id)) {
        const stoi = ((hala.kontrakt && hala.kontrakt.stale && hala.kontrakt.stale.priorytety) || []).some(p => p.kod === d.priorytet && p.zatrzymuje);
        zagraj('awaria', stoi);
      }
      if (typ === 'zlecenie' && obiekt.status === 'nowe' && d.priorytet === 'pilne' && o.zlecenia) {
        const z = o.zlecenia();
        const ja = hala.pracownik && hala.pracownik.id;
        if (z && (d.wykonawca === ja || (d.dzial === z.dzial && (!d.wykonawca || d.wykonawca === ja)))) zagraj('pilne');
      }
    });
    dopisz();
  }

  global.HalaDzwieki = { zagraj, sledz, odblokuj, gotowy, WZORY };

  // ================================================================ okno (wspólne)

  /* Jedno okno na raz: tworzone przy pierwszym użyciu, treść podmieniana. zamknij() — po zapisie albo „Anuluj”. */
  function okno(html, przy) {
    let d = global.document.getElementById('hala-dzialania-okno');
    if (!d) {
      d = global.document.createElement('dialog');
      d.id = 'hala-dzialania-okno';
      d.className = 'hala-okno hala-dzialania';
      global.document.body.appendChild(d);
    }
    if (d.open) d.close();
    d.innerHTML = html;
    const zamknij = () => { if (d.open) d.close(); };
    for (const b of d.querySelectorAll('[data-zamknij]')) b.addEventListener('click', zamknij);
    if (przy) przy(d, zamknij);
    d.showModal();
    return { d, zamknij };
  }

  const nazwaOsoby = (hala, id) => { if (!id) return ''; const p = (hala.pracownicy || []).find(x => x.id === id); return p ? p.nazwa : id; };
  const nazwaMaszyny = (sl, kod) => ((((sl || {}).maszyny || {})[kod] || {}).nazwa || kod || '');

  function czasPoLudzku(t) {
    const ms = Date.parse(t);
    if (isNaN(ms) || !H() || !H().lokalny) return '';
    const l = H().lokalny(ms), d = n => String(n).padStart(2, '0');
    return `${d(l.dzien)}.${d(l.miesiac)} ${d(l.godz)}:${d(l.min)}`;
  }

  /* Pole zdjęcia: przycisk ze wspólnego hala.css (.hala-zdjecie) z miniaturą. wymagane — napis i czerwona ramka. */
  const poleZdjecia = (nazwa, wymagane) => `<div class="hala-zdjecie">
      <label class="hala-zdjecie-przycisk"><input name="${nazwa}" type="file" accept="image/*" capture="environment"
        aria-label="Zdjęcie"><span data-napis>📷 ${wymagane ? 'Zrób zdjęcie (wymagane)' : 'Dodaj zdjęcie'}</span></label>
      <img class="hala-zdjecie-miniatura" alt="" hidden><span class="hala-zdjecie-nazwa">${wymagane ? '' : '(opcjonalnie)'}</span></div>`;
  function podlaczZdjecie(f, nazwa) {
    const input = f.querySelector(`input[name="${nazwa}"]`);
    if (!input) return;
    const pole = input.closest('.hala-zdjecie'), img = pole.querySelector('img'), napis = pole.querySelector('[data-napis]');
    input.addEventListener('change', () => {
      const plik = input.files && input.files[0];
      if (img.src) { try { URL.revokeObjectURL(img.src); } catch (e) { /* – */ } }
      img.hidden = !plik;
      if (plik) { img.src = URL.createObjectURL(plik); napis.textContent = '📷 Zmień zdjęcie'; }
    });
  }

  function bladOkna(d, tekst) { const b = d.querySelector('.hala-okno-blad'); if (b) { b.textContent = tekst; b.hidden = !tekst; } }

  // ================================================================ historia (zlecenie i inne obiekty)

  const OPISY_ZDARZEN = {
    'zlecenie.utworzone': 'Zlecone', 'zlecenie.zaplanowane': 'Zaplanowane', 'zlecenie.plan_zmieniony': 'Plan zmieniony',
    'zlecenie.aktywowane': 'Zlecone (z planu)', 'zlecenie.przyjete': 'Przyjęte — „Biorę”', 'zlecenie.wykonane': 'Zrobione',
    'zlecenie.odrzucone': '„Nie mogę”', 'zlecenie.zwrocone': 'Zwrócone przez kierownika', 'zlecenie.zamkniete': 'Przyjęte przez kierownika',
    'zlecenie.anulowane': 'Anulowane', 'zlecenie.przepadlo': 'Minął koniec zmiany',
    'zgloszenie.utworzone': 'Zgłoszone', 'zgloszenie.przyjete': 'Przyjęte przez kierownika', 'zgloszenie.odrzucone': 'Odrzucone',
    'narzedzia.odlozone': 'Odłożone do odbioru', 'narzedzia.odebrane': 'Odebrane',
  };

  /* Zdarzenia obiektu → wiersze historii (czysta funkcja): {kiedy, kto, co, teksty[], zdjecia[], spoznienie}.
     Spóźnienie przy „Zrobione”: wykonane po terminie zlecenia (termin z utworzenia, planu albo aktywacji). */
  function wierszeHistorii(zdarzenia, { pracownicy, H: Hh } = {}) {
    const nazwa = id => { if (!id) return ''; const p = (pracownicy || []).find(x => x.id === id); return p ? p.nazwa : (id === 'system' ? 'Serwer (automat)' : id); };
    let termin = null;
    return (zdarzenia || []).map(z => {
      const d = z.dane || {};
      if (d.termin) termin = Date.parse(d.termin);
      const teksty = [];
      for (const [pole, etykieta] of [['tytul', ''], ['opis', ''], ['uwagi', 'Notatka: '], ['powod', 'Powód: '], ['co', ''], ['miejsce', 'Miejsce: ']]) {
        if (typeof d[pole] === 'string' && d[pole].trim() && !(pole === 'tytul' && z.typ !== 'zgloszenie.utworzone')) teksty.push(etykieta + d[pole].trim());
      }
      if (d.skan) teksty.push(`Zeskanowano QR maszyny ${d.skan}`);
      let spoznienie = null;
      const czas = Date.parse(z.czas);
      if (z.typ === 'zlecenie.wykonane' && termin && !isNaN(czas) && czas > termin && Hh && Hh.formatCzasu) spoznienie = `spóźnione o ${Hh.formatCzasu(czas - termin)}`;
      return { kiedy: z.czas, kto: nazwa(z.autor), co: OPISY_ZDARZEN[z.typ] || z.typ.split('.').pop().replace(/_/g, ' '),
               teksty, zdjecia: [].concat(d.zdjecia || []), spoznienie, uwaga: z.uwaga || null };
    });
  }

  async function historia(hala, typ, id, opcje) {
    const o = opcje || {};
    const obiekt = hala.obiekt(typ, id) || {};
    const tytul = o.tytul || (obiekt.dane || {}).tytul || (obiekt.dane || {}).co || 'Historia';
    const { d } = okno(`<form method="dialog"><h2>${esc(tytul)}</h2>
      <p class="hala-okno-opis">${esc(obiekt.numer || '')}${obiekt.etykieta ? ` · ${esc(obiekt.etykieta)}` : ''}</p>
      <div class="hala-historia" data-lista><p class="hala-okno-opis">Wczytuję historię…</p></div>
      <div class="hala-okno-przyciski"><button type="button" class="glowny" data-zamknij>Zamknij</button></div></form>`);
    const lista = d.querySelector('[data-lista]');
    try {
      const wiersze = wierszeHistorii(await hala.historia(typ, id), { pracownicy: hala.pracownicy, H: H() });
      lista.innerHTML = wiersze.map(w => `<div class="hala-historia-wiersz">
          <div class="hala-historia-gora"><b>${esc(w.co)}</b><span>${esc(czasPoLudzku(w.kiedy))}</span></div>
          <div class="hala-okno-opis">${esc(w.kto)}${w.spoznienie ? ` · <span class="hala-historia-spoznione">${esc(w.spoznienie)}</span>` : ''}</div>
          ${w.teksty.map(t => `<p class="hala-historia-tekst">${esc(t)}</p>`).join('')}
          ${w.zdjecia.length ? `<div class="hala-zlecenie-zdjecia">${w.zdjecia.map(z => `<a data-plik="${esc(z)}" target="_blank" rel="noopener"><img class="hala-zlecenie-foto" data-plik="${esc(z)}" alt="Zdjęcie" loading="lazy"></a>`).join('')}</div>` : ''}
        </div>`).join('') || '<p class="hala-okno-opis">Brak zdarzeń.</p>';
      for (const el of lista.querySelectorAll('[data-plik]')) hala.adresPliku(el.dataset.plik).then(u => { if (el.tagName === 'IMG') el.src = u; else el.href = u; }).catch(() => {});
    } catch (e) {
      lista.innerHTML = `<p class="hala-okno-blad">${esc(e && e.kod === 0 ? 'Historia wymaga połączenia z serwerem.' : (e && e.message) || 'Nie udało się wczytać historii.')}</p>`;
    }
  }

  // ================================================================ zgłoszenie nieprawidłowości

  /* Dział zgłoszenia = dział osoby (pierwsza rola z kontraktu stale.dzialy). */
  function dzialOsoby(hala) {
    const role = (hala.pracownik && hala.pracownik.role) || [];
    const d = ((hala.kontrakt && hala.kontrakt.stale && hala.kontrakt.stale.dzialy) || []).find(x => (x.role || []).some(r => role.includes(r)));
    return d ? d.kod : null;
  }

  function opcjeMaszyn(sl, wybrana) {
    return '<option value="">— żadna —</option>' + Object.entries((sl && sl.maszyny) || {})
      .sort(([, a], [, b]) => String((a || {}).nazwa || '').localeCompare(String((b || {}).nazwa || ''), 'pl', { numeric: true }))
      .map(([k, m]) => `<option value="${esc(k)}" ${k === wybrana ? 'selected' : ''}>${esc((m && m.nazwa) || k)} (${esc(k)})</option>`).join('');
  }

  function zglos(hala, opcje) {
    const o = opcje || {};
    okno(`<form method="dialog"><h2>Zgłoś nieprawidłowość</h2>
      <p class="hala-okno-opis">Trafi do kierownika zakładu — przyjmie je (i zrobi zlecenie) albo odrzuci z powodem.</p>
      <label>Co jest nie tak?<input name="tytul" required maxlength="200" placeholder="np. Cieknie olej spod osłony"></label>
      <label>Maszyna (opcjonalnie)<select name="maszyna">${opcjeMaszyn(hala.slowniki, o.maszyna)}</select></label>
      <label>Szczegóły (opcjonalnie)<textarea name="opis" rows="3" maxlength="4000"></textarea></label>
      ${poleZdjecia('zdjecie', false)}
      <p class="hala-okno-blad" hidden></p>
      <div class="hala-okno-przyciski"><button type="button" data-zamknij>Anuluj</button><button type="submit" class="glowny">Wyślij do kierownika</button></div></form>`,
    (d, zamknij) => {
      const f = d.querySelector('form');
      podlaczZdjecie(f, 'zdjecie');
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const b = f.querySelector('[type="submit"]');
        if (b.disabled) return;
        b.disabled = true;
        try {
          const dane = { tytul: f.tytul.value.trim() };
          if (!dane.tytul) throw new Error('Napisz, co jest nie tak.');
          const dzial = o.dzial || dzialOsoby(hala);
          if (dzial) dane.dzial = dzial;
          if (f.opis.value.trim()) dane.opis = f.opis.value.trim();
          if (f.maszyna.value) {
            dane.maszyna = f.maszyna.value;
            const l = ((hala.slowniki.maszyny || {})[dane.maszyna] || {}).linia;
            if (l) dane.linia = l;
          }
          if (f.zdjecie.files[0]) dane.zdjecia = [await hala.dodajPlik(f.zdjecie.files[0])];
          await hala.zapisz('zgloszenie.utworzone', hala.nowyId(), dane);
          zamknij();
          if (o.gotowe) o.gotowe('Zgłoszone — kierownik dostał powiadomienie');
        } catch (e) { bladOkna(d, (e && e.message) || 'Nie udało się wysłać.'); b.disabled = false; }
      });
    });
  }

  // ================================================================ narzędzia do odbioru (mistrz → kierownik)

  const KLUCZ_MIEJSCA = 'hala.narzedzia.miejsce';
  const czytajMiejsce = () => { try { return global.localStorage.getItem(KLUCZ_MIEJSCA) || ''; } catch (e) { return ''; } };

  function odlozNarzedzia(hala, opcje) {
    const o = opcje || {};
    okno(`<form method="dialog"><h2>🧰 Odłóż zużyte narzędzia</h2>
      <p class="hala-okno-opis">Zrób zdjęcie narzędzi w miejscu odbioru. Kierownik zakładu dostanie powiadomienie i potwierdzi odbiór zdjęciem.</p>
      <label>Co odkładasz?<input name="co" required maxlength="200" placeholder="np. 3 frezy Ø12, piła tarczowa"></label>
      <label>Gdzie (miejsce odbioru)<input name="miejsce" maxlength="200" value="${esc(czytajMiejsce())}" placeholder="np. regał przy biurze mistrza"></label>
      <label>Uwagi (opcjonalnie)<textarea name="uwagi" rows="2" maxlength="2000"></textarea></label>
      ${poleZdjecia('zdjecie', true)}
      <p class="hala-okno-blad" hidden></p>
      <div class="hala-okno-przyciski"><button type="button" data-zamknij>Anuluj</button><button type="submit" class="glowny">Odłożone</button></div></form>`,
    (d, zamknij) => {
      const f = d.querySelector('form');
      podlaczZdjecie(f, 'zdjecie');
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const b = f.querySelector('[type="submit"]');
        if (b.disabled) return;
        try {
          if (!f.co.value.trim()) throw new Error('Napisz, co odkładasz.');
          if (!f.zdjecie.files[0]) throw new Error('Zrób zdjęcie odłożonych narzędzi — bez niego kierownik nie potwierdzi odbioru.');
          b.disabled = true;
          const dane = { co: f.co.value.trim(), zdjecia: [await hala.dodajPlik(f.zdjecie.files[0])] };
          if (f.miejsce.value.trim()) { dane.miejsce = f.miejsce.value.trim(); try { global.localStorage.setItem(KLUCZ_MIEJSCA, dane.miejsce); } catch (e) { /* – */ } }
          if (f.uwagi.value.trim()) dane.uwagi = f.uwagi.value.trim();
          await hala.zapisz('narzedzia.odlozone', hala.nowyId(), dane);
          zamknij();
          if (o.gotowe) o.gotowe('Zapisane — kierownik odbierze narzędzia');
        } catch (e) { bladOkna(d, (e && e.message) || 'Nie udało się zapisać.'); b.disabled = false; }
      });
    });
  }

  /* Kierownik: odbiór narzędzi — zdjęcie obowiązkowe (Panel). */
  function odbierzNarzedzia(hala, id, opcje) {
    const o = opcje || {};
    const n = hala.obiekt('narzedzia', id) || {};
    okno(`<form method="dialog"><h2>Odbiór narzędzi</h2>
      <p class="hala-okno-opis">${esc((n.dane || {}).co || '')}${(n.dane || {}).miejsce ? ` · ${esc(n.dane.miejsce)}` : ''}</p>
      ${poleZdjecia('zdjecie', true)}
      <label>Uwagi (opcjonalnie)<textarea name="uwagi" rows="2" maxlength="2000"></textarea></label>
      <p class="hala-okno-blad" hidden></p>
      <div class="hala-okno-przyciski"><button type="button" data-zamknij>Anuluj</button><button type="submit" class="glowny">Odebrałem</button></div></form>`,
    (d, zamknij) => {
      const f = d.querySelector('form');
      podlaczZdjecie(f, 'zdjecie');
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const b = f.querySelector('[type="submit"]');
        if (b.disabled) return;
        try {
          if (!f.zdjecie.files[0]) throw new Error('Zrób zdjęcie odebranych narzędzi.');
          b.disabled = true;
          const dane = { zdjecia: [await hala.dodajPlik(f.zdjecie.files[0])] };
          if (f.uwagi.value.trim()) dane.uwagi = f.uwagi.value.trim();
          await hala.zapisz('narzedzia.odebrane', id, dane);
          zamknij();
          if (o.gotowe) o.gotowe('Odbiór potwierdzony');
        } catch (e) { bladOkna(d, (e && e.message) || 'Nie udało się zapisać.'); b.disabled = false; }
      });
    });
  }

  // ================================================================ awaria ze skanu (UR, KJ — Lider ma swój formularz)

  function zglosAwarie(hala, maszyna, opcje) {
    const o = opcje || {};
    const sl = hala.slowniki || {};
    const prio = ((hala.kontrakt && hala.kontrakt.stale && hala.kontrakt.stale.priorytety) || []).slice().sort((a, b) => (a.kolejnosc || 9) - (b.kolejnosc || 9));
    okno(`<form method="dialog"><h2>⚠️ Zgłoś awarię</h2>
      <p class="hala-okno-opis">${esc(nazwaMaszyny(sl, maszyna))} (${esc(maszyna)}) — trafi do UR.</p>
      <fieldset><legend>Jak bardzo?</legend>${prio.map((p, i) => `<label class="hala-zespol-zaznacz"><input type="radio" name="priorytet" value="${esc(p.kod)}" ${i === 0 ? 'checked' : ''}> ${esc(p.zatrzymuje && Object.keys(sl.linie || {}).length <= 1 ? 'Maszyna stoi' : p.nazwa)}</label>`).join('')}</fieldset>
      <label>Co się dzieje? (opcjonalnie)<textarea name="opis" rows="2" maxlength="2000"></textarea></label>
      ${poleZdjecia('zdjecie', false)}
      <p class="hala-okno-blad" hidden></p>
      <div class="hala-okno-przyciski"><button type="button" data-zamknij>Anuluj</button><button type="submit" class="glowny">Zgłoś do UR</button></div></form>`,
    (d, zamknij) => {
      const f = d.querySelector('form');
      podlaczZdjecie(f, 'zdjecie');
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const b = f.querySelector('[type="submit"]');
        if (b.disabled) return;
        b.disabled = true;
        try {
          const m = (sl.maszyny || {})[maszyna] || {};
          const linia = m.linia || Object.keys(sl.linie || {})[0];
          if (!linia) throw new Error('Maszyna nie ma linii — popraw ją w Panelu (Administracja → Maszyny).');
          const dane = { linia, maszyna, priorytet: (f.querySelector('input[name="priorytet"]:checked') || {}).value || 'drobna' };
          if (m.stanowisko) dane.stanowisko = m.stanowisko;
          if (f.opis.value.trim()) dane.opis = f.opis.value.trim();
          if (f.zdjecie.files[0]) dane.zdjecia = [await hala.dodajPlik(f.zdjecie.files[0])];
          await hala.zapisz('awaria.zgloszona', hala.nowyId(), dane);
          zamknij();
          if (o.gotowe) o.gotowe('Awaria zgłoszona — UR dostało powiadomienie');
        } catch (e) { bladOkna(d, (e && e.message) || 'Nie udało się zgłosić.'); b.disabled = false; }
      });
    });
  }

  // ================================================================ menu po skanie QR maszyny

  /* Otwarte zlecenia działu dla tej maszyny (czysta funkcja): te, które dział może teraz zrobić. Używa
     HalaZlecenia.wiersze — te same filtry co ekran Zleceń (dział, linia, osoba, urlop). */
  function zadaniaMaszyny(wiersze, maszyna) {
    return (wiersze || []).filter(w => w.doZrobienia && w.maszyna === maszyna);
  }

  function menuMaszyny(hala, maszyna, opcje) {
    const o = opcje || {};
    const sl = hala.slowniki || {};
    const HZ = global.HalaZlecenia;
    const zadania = HZ && o.zlecenia ? zadaniaMaszyny(HZ.wierszeDla(hala, o.zlecenia()), maszyna) : [];
    const mozeAwarie = ((hala.kontrakt.zdarzenia['awaria.zgloszona'] || {}).role || []).some(r => ((hala.pracownik || {}).role || []).includes(r))
      || ((hala.pracownik || {}).role || []).includes('admin');
    okno(`<form method="dialog"><h2>${esc(nazwaMaszyny(sl, maszyna))}</h2>
      <p class="hala-okno-opis">Kod ${esc(maszyna)} — co chcesz zrobić?</p>
      <div class="hala-menu-maszyny">
        <button type="button" class="glowny" data-co="zadanie" ${zadania.length ? '' : 'disabled'}>✅ Wykonaj zadanie${zadania.length ? ` (${zadania.length})` : ' — brak zadań'}</button>
        <div data-zadania hidden>${zadania.map(z => `<button type="button" data-zlecenie="${esc(z.id)}">${esc(z.tytul)}<span class="hala-okno-opis"> ${esc(z.numer)}${z.terminOpis ? ` · ${esc(z.terminOpis)}` : ''}</span></button>`).join('')}</div>
        ${mozeAwarie ? '<button type="button" class="czerwony" data-co="awaria">⚠️ Zgłoś awarię</button>' : ''}
        <button type="button" data-co="zgloszenie">📝 Zgłoś nieprawidłowość</button>
      </div>
      <div class="hala-okno-przyciski"><button type="button" data-zamknij>Zamknij</button></div></form>`,
    (d, zamknij) => {
      d.addEventListener('click', ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        if (b.dataset.zlecenie) { zamknij(); if (o.wykonaj) o.wykonaj(b.dataset.zlecenie, maszyna); return; }
        if (b.dataset.co === 'zadanie') {
          if (zadania.length === 1) { zamknij(); if (o.wykonaj) o.wykonaj(zadania[0].id, maszyna); return; }
          d.querySelector('[data-zadania]').hidden = false;
        }
        if (b.dataset.co === 'awaria') { zamknij(); if (o.awaria) o.awaria(maszyna); else zglosAwarie(hala, maszyna, { gotowe: o.gotowe }); }
        if (b.dataset.co === 'zgloszenie') { zamknij(); zglos(hala, { maszyna, gotowe: o.gotowe }); }
      });
    });
  }

  /* Przycisk „▣ Skanuj maszynę”: skaner (skaner.js) → kod maszyny → menu. Zły kod — komunikat i koniec. */
  async function skanujMaszyne(hala, opcje) {
    const o = opcje || {};
    if (!global.HalaSkaner) { if (o.komunikat) o.komunikat('Brak skanera. Odśwież aplikację.'); return; }
    const tekst = await global.HalaSkaner.skanuj({ tytul: 'Zeskanuj kod QR maszyny', podpowiedz: 'Naklejka z kodem na maszynie' });
    if (tekst === null || tekst === undefined) return;
    const k = H().odczytajKod(tekst, hala.slowniki);
    if (k.rodzaj !== 'maszyny' || !k.wpis) { if (o.komunikat) o.komunikat('To nie jest kod maszyny z tego zakładu.'); return; }
    menuMaszyny(hala, k.kod, o);
  }

  global.HalaDzialania = { historia, wierszeHistorii, zglos, odlozNarzedzia, odbierzNarzedzia, zglosAwarie, menuMaszyny,
                           zadaniaMaszyny, skanujMaszyne, dzialOsoby, OPISY_ZDARZEN };
  if (typeof module !== 'undefined' && module.exports) module.exports = { HalaDzwieki: global.HalaDzwieki, HalaDzialania: global.HalaDzialania };
})(typeof window !== 'undefined' ? window : globalThis);
