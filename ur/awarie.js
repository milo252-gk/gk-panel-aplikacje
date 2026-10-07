/* Awarie (utrzymanie reaktywne): lista zadań mechaników na żywo i karta awarii
   z przyciskami następnego kroku. Każdy przycisk = jedno zdarzenie kontraktu
   (KONTRAKT §6.1); ostatni krok (potwierdzenie) robi lider w swojej aplikacji.

   Zapis nigdy nie czeka na sieć: hala.zapisz wkłada zdarzenie do kolejki w telefonie
   i ekran od razu pokazuje nowy status (widok optymistyczny). Czas zdarzenia to chwila
   dotknięcia — w trybie samolotowym hub dostanie ją taką, jaka była na hali.        */

(function (global) {
  'use strict';

  const UR = global.UR, W = UR.W, hala = UR.hala, esc = UR.esc;

  const KLASA_STATUSU = { zgloszona: 'alarm', przyjeta: 'uwaga', w_trakcie: 'info', wstrzymana: 'neutral', oczekuje_potwierdzenia: 'ok', zamknieta: 'ok', anulowana: 'neutral' };
  // Czerwień „stoi linia” tylko, dopóki awaria trwa — zamknięta już nie zatrzymuje linii.
  const klasaPriorytetu = w => (!w.aktywny ? '' : w.stoi ? 'zatrzymanie' : w.priorytet === 'ograniczenie' ? 'ograniczenie' : '');
  const stoi = w => w.stoi;
  const KLUCZ_FILTRA = 'hala.ur.filtrAwarii';
  const filtr = {
    czytaj() { try { return localStorage.getItem(KLUCZ_FILTRA) || 'wszystkie'; } catch (e) { return 'wszystkie'; } },
    zapisz(v) { try { localStorage.setItem(KLUCZ_FILTRA, v); } catch (e) { /* bez pamięci też działa */ } },
  };

  function licznik(w) {
    // Licznik biegnie (data-od), dopóki lider nie potwierdzi; po zamknięciu stoi na wyniku.
    const biegnie = w.aktywny && w.czasZgloszenia;
    return `<span ${biegnie ? `data-od="${esc(Date.parse(w.czasZgloszenia))}"` : ''}>${esc(Hala.formatLicznika(w.przestojMs))}</span>`;
  }

  function kartaListy(w) {
    return `<a class="karta awaria ${klasaPriorytetu(w)} ${w.moja ? 'moja' : ''} ${esc(w.status)}" href="#awaria/${encodeURIComponent(w.id)}">
      <div class="przestoj">${licznik(w)}<small>${w.aktywny ? 'przestój' : esc(w.etykieta)}</small></div>
      <div class="maszyna"><b>${esc(w.maszynaNazwa)}</b> <span class="slaby">${esc(w.maszyna)} · ${esc(w.liniaNazwa)}</span></div>
      <div class="znaczniki">
        <span class="znacznik ${KLASA_STATUSU[w.status] || 'neutral'}">${esc(w.etykieta)}${w.powodWstrzymania ? ': ' + esc(w.powodWstrzymania) : ''}</span>
        ${stoi(w) ? '<span class="znacznik alarm">Stoi linia</span>' : `<span class="slaby">${esc(w.priorytetNazwa)}</span>`}
        ${w.mechanikNazwa ? `<span>${w.moja ? '<b>Ty</b>' : esc(w.mechanikNazwa)}</span>` : ''}
        ${w.czekaMs !== null ? `<span class="slaby">${w.czekaMs >= 60000 ? `lider nie potwierdził od ${esc(Hala.formatCzasu(w.czekaMs))}` : 'czeka na lidera — przed chwilą'}</span>` : ''}
        <span class="slaby">${esc(w.numer)} · ${esc(W.godzina(w.czasZgloszenia))}</span>
      </div>
      ${w.opis ? `<div class="opis-awarii">${esc(w.opis)}</div>` : ''}
    </a>`;
  }

  // ------------------------------------------------------------ lista

  UR.ekran('awarie', {
    rysuj(el) {
      const k = UR.kontekst();
      const f = filtr.czytaj();
      const wszystkie = hala.obiekty('awaria');
      const lista = W.listaAwarii(Object.assign({ awarie: wszystkie, filtr: f }, k));
      const aktywne = W.listaAwarii(Object.assign({ awarie: wszystkie }, k));
      const ileStoi = aktywne.filter(w => w.zatrzymuje).length;
      const zamkniete = W.ostatnioZamkniete(Object.assign({ awarie: wszystkie, dni: 2 }, k));
      el.innerHTML = `
        <div class="tytul-ekranu"><h1>Awarie</h1>
          <div class="wiersz">${ileStoi ? `<span class="znacznik alarm">Stoi: ${ileStoi}</span>` : ''}<span class="znacznik info">Aktywne: ${aktywne.length}</span></div></div>
        <div class="wybor filtr" id="filtr-awarii">${[['wszystkie', 'Wszystkie'], ['wolne', 'Nieprzyjęte'], ['moje', 'Moje']].map(([kod, n]) =>
          `<button type="button" data-filtr="${kod}" aria-pressed="${f === kod}">${n}</button>`).join('')}</div>
        <div class="lista">${lista.map(kartaListy).join('') ||
          `<p class="pusto ok">${f === 'moje' ? 'Nie masz przypisanych awarii' : f === 'wolne' ? 'Wszystkie awarie są przyjęte' : 'Brak aktywnych awarii'}</p>`}</div>
        ${zamkniete.length ? `<details class="archiwum"><summary>Zamknięte w ostatnich 2 dniach (${zamkniete.length})</summary>
          <div class="lista">${zamkniete.map(kartaListy).join('')}</div></details>` : ''}`;
      // Zaległe zlecenia od kierownika na samej górze (wspólna karta z ../wspolne/zlecenia.js) — przed listą awarii,
      // bo to, co miało być zrobione wcześniej, ma pierwszeństwo (jak „Zaległe dostawy” w GK Trasy).
      const miejsce = document.createElement('div');
      el.prepend(miejsce);
      global.HalaZlecenia.rysujZalegle(miejsce, hala, { dzial: 'ur' }, () => UR.idz('zlecenia'));
      el.querySelector('#filtr-awarii').addEventListener('click', ev => {
        const b = ev.target.closest('[data-filtr]');
        if (!b) return;
        filtr.zapisz(b.dataset.filtr);
        UR.odswiez('wymus');
      });
    },
  });

  // ------------------------------------------------------------ karta awarii

  /* Historia z huba — tylko z siecią (hala.historia). Pamiętamy ją per awaria na czas oglądania,
     żeby przerysowanie po każdym zdarzeniu nie pytało huba od nowa.                           */
  const historie = new Map();
  async function wczytajHistorie(id, wymus) {
    if (historie.has(id) && !wymus) return historie.get(id);
    try {
      const h = await hala.historia('awaria', id);
      historie.set(id, h);
      return h;
    } catch (e) { return null; }
  }

  function szczegoly(a, w, k) {
    const d = a.dane || {};
    const wiersze = [
      ['Numer', w.numer],
      ['Linia', w.liniaNazwa + (w.stanowiskoNazwa ? ` · ${w.stanowiskoNazwa}` : '')],
      ['Zgłosił', `${w.zglosil || '—'} · ${W.kiedy(w.czasZgloszenia, k.teraz)}`],
      ['Priorytet', w.priorytetNazwa + (w.priorytetZgloszony ? ` (zgłoszony: ${w.priorytetZgloszony})` : '')],
      ['Typ usterki', w.typUsterki || '—'],
      ['Mechanik', w.mechanikNazwa ? (w.moja ? 'Ty' : w.mechanikNazwa) : '—'],
      ['Reakcja', w.reakcjaMs !== null ? Hala.formatCzasu(w.reakcjaMs) : '—'],
      ['Naprawa', w.naprawaMs !== null ? Hala.formatCzasu(w.naprawaMs) : '—'],
    ];
    if (d.opis_wstrzymania) wiersze.push(['Wstrzymana', d.opis_wstrzymania]);
    if (d.opis_naprawy) wiersze.push(['Co zrobiono', d.opis_naprawy]);
    if (d.czesci) wiersze.push(['Części', d.czesci]);
    if (d.powod_anulowania) wiersze.push(['Powód anulowania', d.powod_anulowania]);
    if (d.uwagi_potwierdzenia) wiersze.push(['Uwagi lidera', d.uwagi_potwierdzenia]);
    for (const o of d.odrzucenia || []) wiersze.push(['Lider: nie działa', `${o.powod || ''} (${W.kiedy(o.czas, k.teraz)})`]);
    return `<dl class="szczegoly">${wiersze.map(([t, v]) => `<dt>${esc(t)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  }

  function rysujKarte(el, id) {
    const a = hala.obiekt('awaria', id);
    if (!a) {
      el.innerHTML = `<a class="wstecz" href="#awarie">‹ Awarie</a><p class="pusto">Nie ma takiej awarii w telefonie. Wróć do listy.</p>`;
      return;
    }
    const k = UR.kontekst();
    const w = W.wierszAwarii(a, k);
    const akcje = W.akcjeAwarii(a, k);
    const d = a.dane || {};
    const komentarze = d.komentarze || [];
    el.innerHTML = `
      <a class="wstecz" href="#awarie">‹ Awarie</a>
      <section class="karta naglowek-awarii ${klasaPriorytetu(w)}">
        <div class="maszyna"><b>${esc(w.maszynaNazwa)}</b> <span class="slaby">${esc(w.maszyna)}</span></div>
        <div class="licznik-duzy" aria-label="Przestój">${licznik(w)}</div>
        <div class="wiersz">
          <span class="znacznik ${KLASA_STATUSU[w.status] || 'neutral'}">${esc(w.etykieta)}${w.powodWstrzymania ? ': ' + esc(w.powodWstrzymania) : ''}</span>
          ${stoi(w) ? '<span class="znacznik alarm">Stoi linia</span>' : ''}
          ${w.oczekuje ? '<span class="slaby">czeka na wysłanie</span>' : ''}
        </div>
        ${w.opis ? `<p class="tekst">${esc(w.opis)}</p>` : ''}
        ${(d.zdjecia || []).length ? `<div class="zdjecia">${UR.miniatury(d.zdjecia)}</div>` : ''}
      </section>
      ${a.status === 'oczekuje_potwierdzenia' ? `<p class="czeka-na-lidera">Czeka na potwierdzenie lidera od <span data-od="${esc(Date.parse(d.czas_zakonczenia_ur))}">${esc(Hala.formatLicznika(w.czekaMs))}</span></p>` : ''}
      <div class="akcje">${akcje.map(x => `<button type="button" data-krok="${esc(x.typ)}" class="${x.glowny ? (x.zielony ? 'zielony' : 'glowny') : ''} ${x.alarm ? 'alarm' : ''}">${esc(x.tekst)}</button>`).join('')}</div>
      ${szczegoly(a, w, k)}
      ${(d.zdjecia_naprawy || []).length ? `<h2>Zdjęcia po naprawie</h2><div class="zdjecia">${UR.miniatury(d.zdjecia_naprawy)}</div>` : ''}
      ${komentarze.length ? `<h2>Notatki</h2><div class="lista">${komentarze.map(c => `<div class="karta"><div class="slaby">${esc(W.nazwaPracownika(k.pracownicy, c.autor))} · ${esc(W.kiedy(c.czas, k.teraz))}</div><div class="tekst">${esc(c.tekst)}</div>${(c.zdjecia || []).length ? `<div class="zdjecia">${UR.miniatury(c.zdjecia)}</div>` : ''}</div>`).join('')}</div>` : ''}
      <details class="grupa" id="historia"><summary>Historia</summary><div id="historia-tresc"><p class="slaby">Rozwiń, żeby wczytać z huba.</p></div></details>`;
    el.querySelector('.akcje').addEventListener('click', ev => {
      const b = ev.target.closest('[data-krok]');
      if (b) wykonaj(b.dataset.krok, a.id, b);
    });
    const hist = el.querySelector('#historia');
    hist.addEventListener('toggle', () => { if (hist.open) pokazHistorie(a.id, true); });
    if (historie.has(a.id)) pokazHistorie(a.id, false);
  }

  async function pokazHistorie(id, wymus) {
    const t = document.getElementById('historia-tresc');
    if (!t) return;
    if (wymus) t.innerHTML = '<p class="slaby">Wczytuję…</p>';
    const h = await wczytajHistorie(id, wymus);
    const t2 = document.getElementById('historia-tresc');
    if (!t2) return;
    if (!h) { t2.innerHTML = '<p class="slaby">Historia jest dostępna z siecią. Spróbuj, gdy wróci zasięg.</p>'; return; }
    t2.innerHTML = `<ol class="historia">${W.historiaAwarii(h, UR.kontekst()).map(x =>
      `<li><span>${esc(x.kiedy)}</span><span>${esc(x.co)}</span><span class="kto">${esc(x.kto || '')}</span>${x.uwaga ? `<span class="uwaga">Bez zmiany stanu: ${esc(x.uwaga)}</span>` : ''}</li>`).join('')}</ol>`;
  }

  /* Podpis stanu karty: przerysowujemy tylko, gdy zmieniła się TA awaria (albo słowniki).
     Hala przysyła zdarzenia wszystkich awarii — przerysowanie przy każdym zabierałoby
     mechanikowi przycisk spod palca. Licznik przestoju i tak tyka sam (data-od). */
  const podpis = id => { const a = hala.obiekt('awaria', id); return a ? JSON.stringify([a.seq, a.status, !!a._oczekuje, a.numer, a.dane, (hala.pracownicy || []).length]) : ''; };
  let ostatniPodpis = '';

  UR.ekran('awaria', {
    zakladka: 'awarie',
    rysuj(el, id) { ostatniPodpis = podpis(id); rysujKarte(el, id); },
    odswiez(el, id) {
      // Zmiana z huba: nie przerysowujemy spod palca otwartego okna (np. formularz zakończenia).
      if (document.getElementById('okno').open) return;
      const teraz = podpis(id);
      if (teraz === ostatniPodpis) return;
      ostatniPodpis = teraz;
      const byla = el.querySelector('#historia');
      const otwarta = byla && byla.open;
      const y = global.scrollY;
      rysujKarte(el, id);
      UR.wypelnijZdjecia(el);
      if (otwarta) { el.querySelector('#historia').open = true; historie.delete(id); pokazHistorie(id, true); }
      global.scrollTo(0, y);
    },
  });

  // ------------------------------------------------------------ kroki (zdarzenia)

  async function zapisz(typ, id, dane, dobrze) {
    try {
      await hala.zapisz(typ, id, dane || {});
      UR.brzeczyk.ok();
      if (dobrze) UR.komunikat(dobrze);
      return true;
    } catch (e) {
      UR.komunikat(e.message || 'Nie udało się zapisać. Spróbuj jeszcze raz.', 'alarm');
      return false;
    }
  }

  const wykonaj = W.raz(async (typ, id) => {
    const a = hala.obiekt('awaria', id);
    if (!a) return;
    // Drugie dotknięcie trafia w przycisk, zanim karta się przerysowała: krok sprawdzamy na bieżącym
    // (optymistycznym) stanie — „Jadę, Jadę” nie wysyła dwóch zdarzeń i nie kończy się konfliktem.
    const krok = W.akcjeAwarii(a, UR.kontekst()).find(k => k.typ === typ);
    if (!krok) return;
    if (krok.przejmuje) {
      const p = W.pytaniePrzejecia(hala.pracownicy, krok.przejmuje);
      if (!(await UR.potwierdz(p.tytul, p.tresc, p.przycisk))) return;
    }
    const maszyna = (a.dane || {}).maszyna;
    const stale = UR.stale();
    switch (typ) {
      case 'awaria.przyjeta':
        await zapisz(typ, id, {}, 'Przyjęta — jedziesz do maszyny');
        break;

      case 'awaria.naprawa_rozpoczeta': {
        // Skan QR zalecany (dowód obecności). Bez skanu — tylko po świadomym „Zacznij bez skanu”.
        const qr = await UR.skanujMaszyne(maszyna, `Zeskanuj ${W.nazwaMaszyny(hala.slowniki, maszyna)}`);
        if (qr) { await zapisz(typ, id, { qr }, 'Naprawa w toku'); break; }
        if (await UR.potwierdz('Zacząć bez skanu?', 'Skan maszyny potwierdza, że jesteś na miejscu. Bez niego zapiszemy start naprawy bez dowodu obecności.', 'Zacznij bez skanu')) {
          await zapisz(typ, id, {}, 'Naprawa w toku');
        }
        break;
      }

      case 'awaria.wstrzymana': {
        const powody = (stale.powody_wstrzymania || []).map(p => ({ kod: p.kod, nazwa: p.nazwa }));
        const w = await UR.okno({
          tytul: 'Wstrzymaj naprawę',
          tresc: `<p class="slaby">Licznik przestoju biegnie dalej.</p>${UR.chipy('powod', powody, [])}
            <label>Opis (opcjonalnie)<textarea name="opis" rows="2" maxlength="1000" placeholder="np. numer zamówienia części" data-bez-fokusu></textarea></label>`,
          przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: 'Wstrzymaj', wartosc: true, glowny: true,
            sprawdz: f => (f.get('powod') ? null : 'Wybierz powód.') }],
        });
        if (!w || !w.wartosc) break;
        const dane = { powod: w.dane.get('powod') };
        if (String(w.dane.get('opis') || '').trim()) dane.opis = String(w.dane.get('opis')).trim();
        await zapisz(typ, id, dane, 'Wstrzymana');
        break;
      }

      case 'awaria.wznowiona':
        await zapisz(typ, id, {}, 'Wznowiona — naprawa w toku');
        break;

      case 'awaria.zakonczona_ur':
        await zakoncz(a);
        break;

      case 'awaria.sklasyfikowana': {
        const d = a.dane || {};
        const w = await UR.okno({
          tytul: 'Typ i priorytet',
          tresc: `<h3>Typ usterki</h3>${UR.chipy('typ_usterki', stale.typy_usterek || [], d.typ_usterki ? [d.typ_usterki] : [])}
            <h3>Priorytet</h3>${UR.chipy('priorytet', stale.priorytety || [], d.priorytet ? [d.priorytet] : [])}
            ${d.priorytet_zgloszony ? `<p class="slaby">Lider zgłosił: ${esc(W.priorytetInfo(stale, d.priorytet_zgloszony).nazwa)} — zostaje w historii.</p>` : ''}`,
          przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: 'Zapisz', wartosc: true, glowny: true,
            sprawdz: f => (f.get('typ_usterki') || f.get('priorytet') ? null : 'Wybierz typ albo priorytet.') }],
        });
        if (!w || !w.wartosc) break;
        const dane = {};
        if (w.dane.get('typ_usterki') && w.dane.get('typ_usterki') !== d.typ_usterki) dane.typ_usterki = w.dane.get('typ_usterki');
        if (w.dane.get('priorytet') && w.dane.get('priorytet') !== d.priorytet) dane.priorytet = w.dane.get('priorytet');
        if (!Object.keys(dane).length) { UR.komunikat('Bez zmian.'); break; }
        await zapisz(typ, id, dane, 'Zapisane');
        break;
      }

      case 'awaria.przypisana': {
        const lista = W.mechanicy(hala.pracownicy, UR.ja());
        if (!lista.length) { UR.komunikat('Nie ma komu przekazać — brak innych mechaników.', 'uwaga'); break; }
        const w = await UR.okno({
          tytul: 'Przekaż koledze',
          tresc: UR.chipy('mechanik', lista.map(p => ({ kod: p.id, nazwa: p.nazwa })), []),
          przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: 'Przekaż', wartosc: true, glowny: true,
            sprawdz: f => (f.get('mechanik') ? null : 'Wybierz osobę.') }],
        });
        if (!w || !w.wartosc) break;
        await zapisz(typ, id, { mechanik: w.dane.get('mechanik') }, `Przekazana: ${W.nazwaPracownika(hala.pracownicy, w.dane.get('mechanik'))}`);
        break;
      }

      case 'awaria.komentarz': {
        const w = await UR.okno({
          tytul: 'Notatka do awarii',
          tresc: `<label>Treść<textarea name="tekst" rows="3" maxlength="2000"></textarea></label>${UR.poleZdjec('zdjecia', [])}`,
          przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: 'Dodaj', wartosc: true, glowny: true,
            sprawdz: f => (String(f.get('tekst') || '').trim() ? null : 'Wpisz treść notatki.') }],
        });
        if (!w || !w.wartosc) break;
        const dane = { tekst: String(w.dane.get('tekst')).trim() };
        const zdj = UR.zdjeciaZ(w.dane, 'zdjecia');
        if (zdj.length) dane.zdjecia = zdj;
        await zapisz(typ, id, dane, 'Notatka dodana');
        break;
      }

      case 'awaria.anulowana': {
        const w = await UR.okno({
          tytul: 'Fałszywy alarm?',
          tresc: `<p class="slaby">Awaria zniknie z listy, a przestój stanie na tej chwili.</p>
            ${UR.chipy('gotowy', W.POWODY_ANULOWANIA.map(p => ({ kod: p, nazwa: p })), [])}
            <label>Albo opisz<input name="powod" maxlength="${W.MAKS_POWODU}" data-bez-fokusu></label>`,
          przyciski: [{ tekst: 'Wróć', wartosc: false }, { tekst: 'Anuluj awarię', wartosc: true, alarm: true,
            // Limit huba liczy się dla całości (gotowy + opis), nie tylko dla wpisanego pola.
            sprawdz: f => W.powodAnulowania(f.get('gotowy'), f.get('powod')).blad }],
        });
        if (!w || !w.wartosc) break;
        const { powod } = W.powodAnulowania(w.dane.get('gotowy'), w.dane.get('powod'));
        await zapisz(typ, id, { powod }, 'Awaria anulowana');
        break;
      }
      default:
        break;
    }
  });

  /* „Zakończ naprawę”: gotowe opisy (dotknięcie) + dopisek, typ usterki, części, zdjęcia.
     Formularz żyje w brudnopisie od pierwszego dotknięcia — rozładowany telefon albo zamknięta
     karta nie kasuje opisu (specyfikacja: ciągły auto-zapis).                               */
  async function zakoncz(a) {
    const stale = UR.stale();
    const klucz = `zakonczenie:${a.id}`;
    const b = (await hala.brudnopis.odczytaj(klucz)) || {};
    const d = a.dane || {};
    const typ = b.typ_usterki !== undefined ? b.typ_usterki : (d.typ_usterki || '');
    const w = await UR.okno({
      tytul: 'Zakończ naprawę',
      tresc: `<h3>Co zrobiono</h3>${UR.chipy('gotowe', W.GOTOWE_OPISY.map(x => ({ kod: x, nazwa: x })), b.gotowe || [], true)}
        <label>Dopisek<textarea name="dopisek" rows="2" maxlength="1500" data-bez-fokusu>${esc(b.dopisek || '')}</textarea></label>
        <h3>Typ usterki</h3>${UR.chipy('typ_usterki', stale.typy_usterek || [], typ ? [typ] : [])}
        <label>Części (opcjonalnie)<input name="czesci" maxlength="1000" value="${esc(b.czesci || '')}" placeholder="np. czujnik PNP M12, 2 szt." data-bez-fokusu></label>
        <h3>Zdjęcia (opcjonalnie)</h3>${UR.poleZdjec('zdjecia', b.zdjecia || [])}
        <p class="slaby">Potem lider potwierdzi, że linia ruszyła — do tego czasu przestój biegnie.</p>`,
      przyciski: [{ tekst: 'Anuluj', wartosc: false }, { tekst: 'Zakończ naprawę', wartosc: true, zielony: true,
        sprawdz: f => W.bledyZakonczenia(formularz(f))[0] || null }],
      przy: form => form.addEventListener('input', () => hala.brudnopis.zapisz(klucz, formularz(new FormData(form)))),
    });
    if (!w) return;                                  // Esc / wstecz — brudnopis zostaje na później
    if (!w.wartosc) return;
    const f = formularz(w.dane);
    if (await zapisz('awaria.zakonczona_ur', a.id, W.daneZakonczenia(f), 'Zakończona — czeka na potwierdzenie lidera')) {
      await hala.brudnopis.usun(klucz);              // dopiero gdy zdarzenie jest w kolejce (KONTRAKT §9)
    }
  }
  function formularz(f) {
    return { gotowe: UR.lista(f, 'gotowe'), dopisek: f.get('dopisek') || '', typ_usterki: f.get('typ_usterki') || '',
             czesci: f.get('czesci') || '', zdjecia: UR.zdjeciaZ(f, 'zdjecia') };
  }
})(window);
