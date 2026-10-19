/* Hala — wspólne działania wszystkich aplikacji hali (D55, prośby właściciela 2026-10-13). Dla Lidera, UR, KJ i Panelu.

     HalaDzwieki.zagraj('awaria' | 'pilne', mocno?)    // dwa RÓŻNE dźwięki (GKDzwieki z gk-dzwieki.js — ładowany wcześniej)
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

  /* Dźwięki gra wspólny GKDzwieki (gk-dzwieki.js — miękkie dzwonki jak powiadomienia w telefonie, właściciel 2026-10-16:
     „mniej jak 8-bitowe gry, a faktyczne powiadomienia”). Dwa sygnały da się rozróżnić bez patrzenia (D55: „to mają
     być 2 osobne dźwięki”): AWARIA — szybki dzwonek alarmowy (zatrzymanie — gęściej, trzy serie), PILNE ZADANIE —
     „ding-dong” jak dzwonek do drzwi. Tu zostaje tylko zgodność wstecz: zagraj('awaria', mocno). */
  const G = () => global.GKDzwieki;
  const kontekst = () => (G() ? G().kontekst() : null);
  function odblokuj() { if (G()) G().odblokuj(); }

  /* rodzaj: 'awaria' | 'pilne' (albo inny rodzaj GKDzwieki: info, sukces, blad, zatrzymanie); mocno = zatrzymanie.
     Zwraca, czy zagrało (false = brak dźwięku albo jeszcze nie odblokowany — aplikacja pokazuje pasek „dotknij”). */
  function zagraj(rodzaj, mocno) {
    if (!G()) return false;
    return G().zagraj(rodzaj === 'awaria' && mocno ? 'zatrzymanie' : rodzaj);
  }
  const gotowy = () => !!G() && G().gotowy();
  const WZORY = { get awaria() { return G() && G().RODZAJE.awaria; }, get pilne() { return G() && G().RODZAJE.pilne; } };

  /* Słucha hali: NOWA awaria (zgłoszona, nie przeze mnie) → syrena; NOWE pilne zlecenie dla mnie albo mojego działu
     → gong. Przy starcie i po zalogowaniu nic nie gra (to, co już było, człowiek widzi na liście). opcje.zlecenia() —
     jak w HalaZlecenia.sledz ({dzial, linia?, linie?}); null = bez gongu. opcje.wlaczony() — przełącznik aplikacji.
     opcje.bhp (D59, Panel kierownika): NOWE zgłoszenie BHP rodzaju pilnego (incydent, sytuacja potencjalnie wypadkowa —
     „pilne” w stałej rodzaje_bhp) → gong; aplikacja musi czytać typ „bhp_zgloszenie”. */
  function sledz(hala, opcje) {
    const o = opcje || {};
    const znane = new Set();
    const TYPY = ['awaria', 'zlecenie', 'bhp_zgloszenie'];
    const dopisz = () => { for (const t of TYPY) for (const x of (hala.obiekty(t) || [])) znane.add(`${t}|${x.id}|${x.status}`); };
    hala.na('sesja', () => { znane.clear(); dopisz(); });
    hala.na('zmiana', ({ typ, id, obiekt }) => {
      if (typ === '*') { dopisz(); return; }
      if (!TYPY.includes(typ) || !obiekt) return;
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
        // D76: zlecenie „do kierownika działu” słyszy tylko kierownik — reszta działu go nie widzi.
        const kierownik = ((hala.pracownik && hala.pracownik.role) || []).some(r => ['kierownik', 'kierownik_ur', 'kierownik_kj', 'admin'].includes(r));
        const tylkoKierownik = d.do_kierownika === true && !d.wykonawca && !kierownik;
        if (z && !tylkoKierownik && (d.wykonawca === ja || (d.dzial === z.dzial && (!d.wykonawca || d.wykonawca === ja)))) zagraj('pilne');
      }
      if (typ === 'bhp_zgloszenie' && o.bhp && obiekt.status === 'otwarte' && d.zglosil !== (hala.pracownik && hala.pracownik.id)
          && bhpPilne(hala.kontrakt, d.rodzaj)) zagraj('pilne');
    });
    dopisz();
  }

  /* Czy rodzaj zgłoszenia BHP jest pilny (stała rodzaje_bhp z kontraktu, pole „pilne”) — ta sama reguła co push huba. */
  const bhpPilne = (kontrakt, rodzaj) => (((kontrakt && kontrakt.stale && kontrakt.stale.rodzaje_bhp) || [])
    .some(r => r && r.kod === rodzaj && r.pilne));

  /* D64 (właściciel 2026-10-14: „jedno spójne środowisko”): pasek „🔇 Dźwięk powiadomień wyłączony — dotknij, żeby
     włączyć” — wzór z GK Utrzymanie Ruchu, teraz ten sam w Liderze i KJ (wcześniej tylko UR, a Lider i KJ nie mówiły,
     że przeglądarka trzyma dźwięk do pierwszego dotknięcia). Pod nagłówkiem, nad ekranem; znika, gdy dźwięk ruszy. */
  function pasek(hala, opcje) {
    const doc = global.document;
    if (!doc) return;
    const o = opcje || {};
    let el = doc.getElementById('hala-dzwonek');
    const pokaz = () => {
      const a = kontekst();
      el.hidden = !(hala.zalogowany() && a && a.state !== 'running');
      if (a && !a.halaPasek) { a.halaPasek = true; a.addEventListener('statechange', pokaz); }
    };
    if (!el) {
      el = doc.createElement('div');
      el.id = 'hala-dzwonek';
      el.className = 'hala-dzwonek';
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.hidden = true;
      el.innerHTML = '<span class="ikona" aria-hidden="true">🔇</span><span>Dźwięk powiadomień wyłączony — <u>dotknij, żeby włączyć</u></span>';
      const miejsce = o.przed || doc.querySelector('#aplikacja > main, #aplikacja > .ekrany');
      if (miejsce && miejsce.parentNode) miejsce.parentNode.insertBefore(el, miejsce); else doc.body.prepend(el);
      const wlacz = () => { odblokuj(); setTimeout(() => { zagraj('pilne'); pokaz(); }, 150); };
      el.addEventListener('click', wlacz);
      el.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); wlacz(); } });
      hala.na('sesja', pokaz);
      doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') pokaz(); });
    }
    pokaz();
  }

  /* „Sprawdź dźwięki” (Moje konto → Powiadomienia, we wszystkich aplikacjach hali): kolejno cały zestaw — człowiek
     słyszy każdy sygnał i wie, jak brzmi (STYL-GK §6a). */
  function sprawdz() {
    odblokuj();
    // 2026-10-19: cały zestaw po kolei (także „reakcja” kierownika, D77) — każdy rodzaj brzmi inaczej, awaria najwyraźniej.
    [['info', 150], ['sukces', 1150], ['reakcja', 2150], ['blad', 3250], ['pilne', 4250], ['awaria', 6100], ['zatrzymanie', 8800]]
      .forEach(([r, ms]) => setTimeout(() => zagraj(r), ms));
  }

  global.HalaDzwieki = { zagraj, sledz, odblokuj, gotowy, WZORY, bhpPilne, pasek, sprawdz };

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
    // Test właściciela 2026-10-13: krok wykonania (D56) pokazywał się w historii jako surowe „postep”.
    'zlecenie.postep': 'Krok wykonania',
    'zlecenie.przekazane': 'Przekazane', 'zlecenie.rozdzielone': 'Rozdzielone',       // D76
    'bhp.zgloszenie': 'Zgłoszone', 'bhp.zamkniete': 'Zamknięte przez kierownika',
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
      for (const [pole, etykieta] of [['tytul', ''], ['opis', ''], ['uwagi', 'Notatka: '], ['powod', 'Powód: '], ['co', ''], ['miejsce', 'Miejsce: '], ['dzialania', 'Działania: ']]) {
        if (typeof d[pole] === 'string' && d[pole].trim() && !(pole === 'tytul' && z.typ !== 'zgloszenie.utworzone')) teksty.push(etykieta + d[pole].trim());
      }
      if (d.skan) teksty.push(`Zeskanowano QR maszyny ${d.skan}`);
      // D76: komu kierownik działu przekazał albo rozdzielił zlecenie.
      if (z.typ === 'zlecenie.przekazane' && d.wykonawca) teksty.unshift(`Dla: ${nazwa(d.wykonawca)}`);
      if (z.typ === 'zlecenie.rozdzielone' && Array.isArray(d.wykonawcy)) teksty.unshift(`Dla: ${d.wykonawcy.map(nazwa).join(', ')}`);
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
      <div class="hala-okno-przyciski"><button type="button" data-zamknij>Zamknij</button></div></form>`);
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

  // ================================================================ D76: kierownik działu przekazuje i rozdziela
  // Właściciel 2026-10-19: „Kierownicy innych działów rozdzielają je [zadania od kierownika zakładu] między siebie i swoich
  // podwładnych.” Te same okna w GK Utrzymanie Ruchu, GK Kontrola Jakości (ekran Zleceń) i w Panelu (kierownik UR/KJ).

  /* Osoby działu zlecenia (aktywne, z rolą działu): kierownicy działu na górze — „między siebie” — potem reszta, alfabetycznie. */
  function osobyDzialu(hala, kodDzialu) {
    const dz = ((hala.kontrakt && hala.kontrakt.stale && hala.kontrakt.stale.dzialy) || []).find(x => x && x.kod === kodDzialu) || {};
    const l = H() && H().lokalny ? H().lokalny(hala.teraz()) : null, dd = n => String(n).padStart(2, '0');
    const dzien = l ? `${l.rok}-${dd(l.miesiac)}-${dd(l.dzien)}` : null;
    return (hala.pracownicy || []).filter(p => p && p.aktywny !== false && (p.role || []).some(r => (dz.role || []).includes(r)))
      .map(p => ({ id: p.id, nazwa: p.nazwa || p.id, kierownik: !!dz.rola_kierownika && (p.role || []).includes(dz.rola_kierownika),
                   urlop: !!(dzien && H().naUrlopie && H().naUrlopie(hala.slowniki, p.id, dzien)) }))
      .sort((a, b) => (b.kierownik - a.kierownik) || String(a.nazwa).localeCompare(String(b.nazwa), 'pl'));
  }
  const cssEsc = v => (global.CSS && global.CSS.escape ? global.CSS.escape(v) : String(v));
  const dopiskiOsoby = o => [o.kierownik ? 'kierownik' : '', o.urlop ? 'urlop' : ''].filter(Boolean).join(', ');

  function przekaz(hala, id, opcje) {
    const o = opcje || {};
    const z = hala.obiekt('zlecenie', id);
    if (!z) return;
    const d = z.dane || {};
    const osoby = osobyDzialu(hala, d.dzial).filter(x => x.id !== d.wykonawca);
    okno(`<form method="dialog"><h2>Przekaż zlecenie</h2>
      <p class="hala-okno-opis">${esc(d.tytul || '')}${d.wykonawca ? ` · teraz: ${esc(nazwaOsoby(hala, d.wykonawca))}` : ''}</p>
      <fieldset><legend>Komu</legend>${osoby.map(x => `<label class="hala-zespol-zaznacz"><input type="radio" name="osoba" value="${esc(x.id)}" required>
        ${esc(x.nazwa)}${dopiskiOsoby(x) ? ` <span class="slaby">(${esc(dopiskiOsoby(x))})</span>` : ''}</label>`).join('') || '<p class="hala-okno-opis">Nikt inny w dziale nie ma konta.</p>'}</fieldset>
      <label>Uwagi (opcjonalnie)<textarea name="uwagi" rows="2" maxlength="2000"></textarea></label>
      <p class="hala-okno-blad" hidden></p>
      <div class="hala-okno-przyciski"><button type="button" data-zamknij>Anuluj</button><button type="submit" class="glowny">Przekaż</button></div></form>`,
    (dlg, zamknij) => {
      const f = dlg.querySelector('form');
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const b = f.querySelector('[type="submit"]');
        if (b.disabled) return;
        const osoba = (f.querySelector('input[name="osoba"]:checked') || {}).value;
        if (!osoba) { bladOkna(dlg, 'Wybierz osobę.'); return; }
        b.disabled = true;
        try {
          const dane = { wykonawca: osoba };
          if (f.uwagi.value.trim()) dane.uwagi = f.uwagi.value.trim();
          await hala.zapisz('zlecenie.przekazane', id, dane);
          zamknij();
          if (o.gotowe) o.gotowe(`Przekazane: ${nazwaOsoby(hala, osoba)} dostał(a) powiadomienie`);
        } catch (e) { bladOkna(dlg, (e && e.message) || 'Nie udało się zapisać.'); b.disabled = false; }
      });
    });
  }

  function rozdziel(hala, id, opcje) {
    const o = opcje || {};
    const z = hala.obiekt('zlecenie', id);
    if (!z) return;
    const d = z.dane || {};
    const juz = new Set(((H() && H().postepRozdzialu && H().postepRozdzialu(z, hala.obiekty('zlecenie'))) || { czesci: [] }).czesci.map(c => c.wykonawca));
    const osoby = osobyDzialu(hala, d.dzial);
    okno(`<form method="dialog"><h2>Rozdziel zlecenie</h2>
      <p class="hala-okno-opis">${esc(d.tytul || '')} — każda zaznaczona osoba dostaje swoją część. Całość będzie zrobiona, gdy zrobią wszyscy.</p>
      <fieldset><legend>Komu</legend>${osoby.map(x => `<label class="hala-zespol-zaznacz"><input type="checkbox" name="osoby" value="${esc(x.id)}" ${juz.has(x.id) ? 'disabled' : ''}>
        ${esc(x.nazwa)}${dopiskiOsoby(x) || juz.has(x.id) ? ` <span class="slaby">(${esc([dopiskiOsoby(x), juz.has(x.id) ? 'już ma część' : ''].filter(Boolean).join(', '))})</span>` : ''}</label>
        <input name="czesc-${esc(x.id)}" maxlength="500" placeholder="Jego część (opcjonalnie), np. hala A" aria-label="Część: ${esc(x.nazwa)}" hidden>`).join('')
        || '<p class="hala-okno-opis">Nikt w dziale nie ma konta.</p>'}</fieldset>
      <p class="hala-okno-blad" hidden></p>
      <div class="hala-okno-przyciski"><button type="button" data-zamknij>Anuluj</button><button type="submit" class="glowny">Rozdziel</button></div></form>`,
    (dlg, zamknij) => {
      const f = dlg.querySelector('form');
      // Pole „część” pokazuje się przy zaznaczonej osobie — bez tego okno dla 10 osób to 10 pustych pól.
      f.addEventListener('change', ev => {
        if (ev.target.name !== 'osoby') return;
        const pole = f.querySelector(`input[name="czesc-${cssEsc(ev.target.value)}"]`);
        if (pole) { pole.hidden = !ev.target.checked; if (ev.target.checked) pole.focus(); }
      });
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const b = f.querySelector('[type="submit"]');
        if (b.disabled) return;
        const wybrani = [...f.querySelectorAll('input[name="osoby"]:checked')].map(x => x.value);
        if (!wybrani.length) { bladOkna(dlg, 'Zaznacz osoby.'); return; }
        if (wybrani.length === 1 && !juz.size) { bladOkna(dlg, 'Jedna osoba — użyj „Przekaż”.'); return; }
        const czesci = {};
        for (const os of wybrani) { const p = f.querySelector(`input[name="czesc-${cssEsc(os)}"]`); if (p) czesci[os] = p.value; }
        b.disabled = true;
        try {
          const r = global.HalaZlecenia.daneRozdzialu(z, wybrani, czesci, () => hala.nowyId());
          // Najpierw części, potem „rozdzielone” — hub sprawdza, że każda część już jest (kolejka wysyła po kolei).
          for (const c of r.czesci) await hala.zapisz('zlecenie.utworzone', c.id, c.dane);
          await hala.zapisz('zlecenie.rozdzielone', id, r.rozdzielone);
          zamknij();
          if (o.gotowe) o.gotowe(`Rozdzielone na ${r.czesci.length} ${r.czesci.length < 5 ? 'osoby' : 'osób'} — każda dostała powiadomienie`);
        } catch (e) { bladOkna(dlg, (e && e.message) || 'Nie udało się zapisać.'); b.disabled = false; }
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
    // D56: zlecenie może mieć kilka maszyn — wystarczy, że ta jest wśród nich.
    return (wiersze || []).filter(w => w.doZrobienia && ((w.maszyny && w.maszyny.length ? w.maszyny : [w.maszyna]).includes(maszyna)));
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
    // Kod wpisany z naklejki („WT-01”) = skan HALA:M:WT-01 (Hala.kodZeSkanu).
    const k = H().odczytajKod(H().kodZeSkanu ? H().kodZeSkanu(tekst, hala.slowniki) : tekst, hala.slowniki);
    if (k.rodzaj !== 'maszyny' || !k.wpis) { if (o.komunikat) o.komunikat('To nie jest kod maszyny z tego zakładu.'); return; }
    menuMaszyny(hala, k.kod, o);
  }

  /* D56 (właściciel 2026-10-13: „niech skanowanie QR będzie bardziej na wierzchu — teraz trzeba go szukać”): pływający
     przycisk „▣ Skanuj” na każdym ekranie aplikacji działu (nad dolnym paskiem). Skan maszyny → menu: Wykonaj zadanie
     (skan od razu zapisany w zleceniu jako krok, potem ekran Zleceń), Zgłoś awarię, Zgłoś nieprawidłowość.
     opcje: { zlecenia: () => {dzial, linia?}, otworzZlecenia: () => …, komunikat: t => …, awaria?: maszyna => … }. */
  function przyciskSkanu(hala, opcje) {
    const o = opcje || {};
    const doc = global.document;
    if (!doc || !global.HalaSkaner) return null;
    let b = doc.getElementById('hala-skan-fab');
    if (!b) {
      b = doc.createElement('button');
      b.type = 'button'; b.id = 'hala-skan-fab'; b.className = 'hala-skan-fab';
      doc.body.classList.add('hala-ma-skan');          // D64: miejsce pod listą i nad komunikatami (hala.css)
      b.setAttribute('aria-label', 'Skanuj kod QR maszyny');
      b.innerHTML = '<span aria-hidden="true">▣</span> Skanuj';
      doc.body.appendChild(b);
    }
    const pokaz = () => { b.hidden = !hala.zalogowany(); };
    hala.na('sesja', pokaz);
    pokaz();
    b.onclick = () => {
      if (!hala.zalogowany()) { pokaz(); return; }
      skanujMaszyne(hala, { zlecenia: o.zlecenia, komunikat: o.komunikat, gotowe: o.komunikat, awaria: o.awaria,
        wykonaj: async (zid, maszyna) => {
          const t = global.HalaZlecenia ? await global.HalaZlecenia.zaliczSkan(hala, zid, maszyna) : '';
          if (o.otworzZlecenia) o.otworzZlecenia();
          if (o.komunikat && t) o.komunikat(t);
        } });
    };
    return b;
  }

  global.HalaDzialania = { przyciskSkanu, historia, wierszeHistorii, zglos, odlozNarzedzia, odbierzNarzedzia, zglosAwarie, menuMaszyny,
                           zadaniaMaszyny, skanujMaszyne, dzialOsoby, OPISY_ZDARZEN, przekaz, rozdziel, osobyDzialu };
  if (typeof module !== 'undefined' && module.exports) module.exports = { HalaDzwieki: global.HalaDzwieki, HalaDzialania: global.HalaDzialania };
})(typeof window !== 'undefined' ? window : globalThis);
