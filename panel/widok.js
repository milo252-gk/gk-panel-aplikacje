/* Panel Kierownika — co pokazać (bez rysowania).

   Czyste funkcje: dostają obiekty ze stanu huba (hala.obiekty…), słowniki i
   „teraz”, a oddają gotowe wiersze do narysowania. Nie dotykają DOM ani sieci,
   więc testy (panel/testy/widok-testy.js) liczą je w Node dokładnie tak, jak
   liczy je ekran w biurze.

   Wszystkie reguły, które dzielimy z innymi aplikacjami (kolor checklisty,
   przestój, zmiany, czas zakładu), bierzemy z Hala.* — Panel nie może liczyć
   „po swojemu”, bo kierownik porównuje go z telefonem lidera i mechanika.    */

(function (global) {
  'use strict';

  const H = () => global.Hala;
  const MIN = 60000;

  const nazwaPracownika = (pracownicy, id) => {
    if (!id) return null;
    const p = (pracownicy || []).find(x => x.id === id);
    return p ? p.nazwa : id;
  };

  const liniePosortowane = slowniki =>
    Object.entries((slowniki && slowniki.linie) || {})
      .sort(([ka, a], [kb, b]) => ((a && a.kolejnosc) || 999) - ((b && b.kolejnosc) || 999) || ka.localeCompare(kb))
      .map(([kod, w]) => ({ kod, nazwa: (w && w.nazwa) || kod }));

  const nazwaLinii = (slowniki, kod) => (((slowniki || {}).linie || {})[kod] || {}).nazwa || kod || '—';
  /* D51: zakład z jedną (schowaną) linią „Hala” — jej nazwa przy awarii, raporcie czy osobie to szum („WT-02 · Hala”).
     Pusto, gdy linia jest jedna; nazwa, gdy w słowniku są dwie albo więcej (starsze dane, zakład testowy). */
  const liniaWidoczna = (slowniki, kod) => (wieleLinii(slowniki) ? nazwaLinii(slowniki, kod) : '');

  /* Godzina zakładu (Europe/Warsaw), niezależnie od strefy ustawionej w monitorze. */
  function godzina(chwila) {
    if (chwila === null || chwila === undefined || chwila === '') return '—';
    const ms = typeof chwila === 'number' ? chwila : Date.parse(chwila);
    if (isNaN(ms)) return '—';
    const l = H().lokalny(ms);
    return `${String(l.godz).padStart(2, '0')}:${String(l.min).padStart(2, '0')}`;
  }

  function dataKrotka(chwila) {
    const ms = typeof chwila === 'number' ? chwila : Date.parse(chwila);
    if (isNaN(ms)) return '—';
    const l = H().lokalny(ms);
    return `${String(l.dzien).padStart(2, '0')}.${String(l.miesiac).padStart(2, '0')}`;
  }

  /* „2026-09-25/III” → „25.09 · Zmiana III” (nazwa ze słownika zmian, gdy jest). */
  function opisZmiany(idZmiany, slowniki) {
    const m = /^(\d{4})-(\d{2})-(\d{2})\/(.+)$/.exec(idZmiany || '');
    if (!m) return idZmiany || '—';
    const z = ((slowniki || {}).zmiany || {})[m[4]];
    return `${m[3]}.${m[2]} · ${(z && z.nazwa) || 'Zmiana ' + m[4]}`;
  }

  // ------------------------------------------------------------ obchody liderów

  /* Kafelek na linię. Lider, który nie otworzył zmiany, nie wysłał jeszcze migawki
     pozycji — wtedy bierzemy pozycje z szablonu (KONTRAKT §6.2), żeby kafelek sam
     zrobił się czerwony po terminie pierwszej pozycji. To samo, gdy lider odhacza
     bez otwarcia zmiany (checklista.* zakłada obiekt „auto”, ale bez pozycji):
     wtedy zostawiamy jego odhaczenia i dokładamy pozycje z szablonu.            */
  function obchody({ slowniki, pracownicy, zmianaLinii, zmiana, teraz, prog, awarie, stale }) {
    if (!zmiana) return [];
    const zatrzymuje = kodyZatrzymujace(stale);
    const wiele = wieleLinii(slowniki);
    return liniePosortowane(slowniki).map(({ kod, nazwa }) => {
      const klucz = `${kod}/${zmiana.id}`;
      const zl = zmianaLinii(klucz);
      let doKoloru = zl;
      const wirtualna = !zl || !((zl.dane || {}).pozycje || []).length;
      if (wirtualna) {
        const pozycje = H().pozycjeZSzablonu(H().szablonDla(slowniki, kod, zmiana.nr), zmiana);
        doKoloru = { dane: Object.assign({}, (zl && zl.dane) || {}, { pozycje }) };
      }
      const k = H().kolorChecklisty(doKoloru, teraz, prog);
      const naLinii = (awarie || []).filter(a => a.aktywny && a.linia === kod);
      return {
        linia: kod, nazwa, klucz,
        // Jedna linia (D51): kafelek to po prostu checklista lidera — nazwa „Hala” nic tu nie mówi.
        naglowek: wiele ? nazwa : 'Checklista lidera',
        kolor: k.kolor, zrobione: k.zrobione, wszystkie: k.wszystkie,
        otwarta: !!(zl && zl.status === 'otwarta' && !wirtualna),
        zamknieta: !!(zl && zl.status === 'zamknieta'),
        wirtualna,
        lider: nazwaPracownika(pracownicy, zl && zl.dane && zl.dane.lider),
        najblizsza: k.najblizsza ? { nazwa: k.najblizsza.nazwa, godz: godzina(k.najblizsza.termin),
                                     zaMin: Math.max(0, Math.round((Date.parse(k.najblizsza.termin) - teraz) / MIN)) } : null,
        opoznione: k.opoznione.map(p => ({ nazwa: p.nazwa, godz: godzina(p.termin) })),
        awarie: naLinii.length,
        zatrzymania: naLinii.filter(a => zatrzymuje.has((a.dane || {}).priorytet)).length,
      };
    });
  }

  // ------------------------------------------------------------ aktywne awarie

  function kodyZatrzymujace(stale) {
    const lista = (stale && stale.priorytety) || [{ kod: 'zatrzymanie', zatrzymuje: true }];
    return new Set(lista.filter(p => p.zatrzymuje).map(p => p.kod));
  }

  /* Nazwa priorytetu na ekranie. Kontrakt mówi „Zatrzymanie linii”, ale w zakładzie z jedną (schowaną) linią stoi
     maszyna, nie linia — kierownik widzi „Maszyna stoi”. Kod priorytetu się nie zmienia (UR, raporty, wskaźniki). */
  const MASZYNA_STOI = 'Maszyna stoi';
  function nazwaPriorytetu(p, slowniki) {
    if (!p) return '—';
    return p.zatrzymuje && !wieleLinii(slowniki) ? MASZYNA_STOI : (p.nazwa || p.kod || '—');
  }
  /* Opcje „Priorytet” w oknie „Zgłoś awarię”: [[kod, nazwa]] w kolejności kontraktu. */
  function priorytetyDoWyboru(stale, slowniki) {
    return ((stale && stale.priorytety) || []).map(p => [p.kod, nazwaPriorytetu(p, slowniki)]);
  }

  /* Najpierw zatrzymania linii, potem od najdłuższego przestoju (KONTRAKT §6.1).
     Awaria, którą UR skończył, a lider nie potwierdził dłużej niż
     alarm_potwierdzenia_min, dostaje alarm — linia pewnie już stoi „na papierze”. */
  function awarie({ awarie: lista, slowniki, pracownicy, stale, teraz, alarmMin }) {
    const zatrzymuje = kodyZatrzymujace(stale);
    const priorytety = new Map(((stale && stale.priorytety) || []).map(p => [p.kod, p]));
    const powody = new Map(((stale && stale.powody_wstrzymania) || []).map(p => [p.kod, p.nazwa]));
    const maszyny = (slowniki && slowniki.maszyny) || {};
    const wiersze = (lista || []).filter(a => a && a.aktywny).map(a => {
      const d = a.dane || {};
      const p = priorytety.get(d.priorytet) || { kod: d.priorytet, nazwa: d.priorytet || '—', zatrzymuje: zatrzymuje.has(d.priorytet) };
      let etykieta = a.etykieta || a.status;
      if (a.status === 'wstrzymana' && d.powod_wstrzymania)
        etykieta = `Wstrzymana — ${powody.get(d.powod_wstrzymania) || d.powod_wstrzymania}`;
      let czeka = null;
      if (a.status === 'oczekuje_potwierdzenia' && d.czas_zakonczenia_ur) {
        const min = Math.floor((teraz - Date.parse(d.czas_zakonczenia_ur)) / MIN);
        czeka = { min: Math.max(0, min), alarm: min >= (alarmMin === undefined ? 30 : alarmMin) };
      }
      return {
        id: a.id, numer: a.numer || '—', oczekuje: !!a._oczekuje,
        maszyna: d.maszyna || '—', maszynaNazwa: (maszyny[d.maszyna] || {}).nazwa || d.maszyna || '—',
        linia: a.linia, liniaNazwa: liniaWidoczna(slowniki, a.linia),       // jedna linia — pusto (wiersz: samo „WT-02”)
        priorytet: p.kod, priorytetNazwa: nazwaPriorytetu(p, slowniki), zatrzymuje: zatrzymuje.has(d.priorytet),
        status: a.status, etykieta,
        mechanik: nazwaPracownika(pracownicy, d.mechanik),
        opis: d.opis || '',
        zdjecia: [].concat(d.zdjecia || []),            // D47: zdjęcie ze zgłoszenia (nieobowiązkowe)
        czasZgloszenia: d.czas_zgloszenia || null,
        godzZgloszenia: godzina(d.czas_zgloszenia),
        przestojMs: H().przestojMs(a, teraz),
        czeka,
      };
    });
    return wiersze.sort((x, y) => (y.zatrzymuje - x.zatrzymuje) || ((y.przestojMs || 0) - (x.przestojMs || 0)));
  }

  // ------------------------------------------------------------ incydenty jakościowe

  const wOknie = (czas, zmiana) => {
    const t = Date.parse(czas);
    return !isNaN(t) && t >= Date.parse(zmiana.od) && t < Date.parse(zmiana.do);
  };

  /* Partie brakowe i nowe alerty jakości (Quality Alert) z BIEŻĄCEJ zmiany (specyfikacja 2.1).
     Aktywne z wcześniejszych zmian tylko liczymy — kierownik ma wiedzieć, że są,
     ale lista „co się dziś stało” nie może nimi zarosnąć.                       */
  function incydenty({ partie, alerty, slowniki, zmiana, teraz }) {
    const wynik = { lista: [], wczesniej: { partie: 0, alerty: 0 } };
    if (!zmiana) return wynik;
    const wszystkieLinie = liniePosortowane(slowniki).map(l => l.kod);
    const wyroby = (slowniki && slowniki.wyroby) || {};
    for (const p of partie || []) {
      if (!p || p.status !== 'brakowa') continue;
      const d = p.dane || {};
      if (!wOknie(d.czas_oznaczenia, zmiana)) { wynik.wczesniej.partie++; continue; }
      wynik.lista.push({
        rodzaj: 'partia', id: p.id, numer: p.numer || '—', czas: d.czas_oznaczenia, godz: godzina(d.czas_oznaczenia),
        linia: p.linia || d.linia, liniaNazwa: liniaWidoczna(slowniki, p.linia || d.linia),
        wyrob: d.wyrob ? ((wyroby[d.wyrob] || {}).nazwa || d.wyrob) : null,
        zlecenie: d.zlecenie || d.partia || null, ilosc: d.ilosc === undefined ? null : d.ilosc, powod: d.powod || '',
      });
    }
    // Etap 3: alert po dacie „ważny do” jest jak wycofany (Hala.alertAktywny) — nie świeci i nie liczy się do „wcześniej”.
    const t = teraz === undefined ? Date.now() : teraz;
    for (const a of alerty || []) {
      if (!a || !H().alertAktywny(a, t)) continue;
      const d = a.dane || {};
      if (!wOknie(d.czas_publikacji, zmiana)) { wynik.wczesniej.alerty++; continue; }
      const linie = (d.linie && d.linie.length) ? d.linie : wszystkieLinie;     // pusta lista = wszystkie linie
      const potw = d.potwierdzenia || {};
      wynik.lista.push({
        rodzaj: 'alert', id: a.id, numer: a.numer || '—', czas: d.czas_publikacji, godz: godzina(d.czas_publikacji),
        tytul: d.tytul || '', wszystkieLinie: !(d.linie && d.linie.length),
        linie, potwierdzone: linie.filter(l => potw[l]), brakuje: linie.filter(l => !potw[l]),
        // Jedna linia: „brak: Hala” nic nie mówi — samo „0/1” wystarczy.
        brakujeNazwy: wieleLinii(slowniki) ? linie.filter(l => !potw[l]).map(l => nazwaLinii(slowniki, l)) : [],
      });
    }
    wynik.lista.sort((x, y) => String(y.czas).localeCompare(String(x.czas)));
    return wynik;
  }

  // ------------------------------------------------------------ zmiany bez raportu (etap 3)

  /* Zakończone zmiany z ostatnich `godzin` (domyślnie 48 — tyle danych trzyma Panel) bez raportu końcowego
     (zmiana.raport) dla linii, które miały otwartą zmianę (obiekt zmiana_linii) albo szablon checklisty. Wcześniej
     kierownik widział tylko raporty, które przyszły — brak raportu nie zostawiał śladu. Najnowsze na górze;
     najpierw te, które lider otworzył (zaczął i nie skończył), potem nieotwarte. `otwarta` = lider wysłał
     zmiana.rozpoczeta (migawka pozycji) — samo odhaczenie bez otwarcia (obiekt „auto” bez pozycji) to nieotwarta. */
  function zmianyBezRaportu({ zmianaLinii, slowniki, pracownicy, teraz, godzin }) {
    const zmiany = (slowniki && slowniki.zmiany && Object.keys(slowniki.zmiany).length) ? slowniki.zmiany : null;
    const okresy = [];
    let t = teraz - (godzin || 48) * 3600000;
    for (let i = 0; t < teraz && i < 200; i++) {
      const z = H().zmianaDla(t, zmiany);
      if (!z) { t += 15 * MIN; continue; }
      if (Date.parse(z.do) <= teraz) okresy.push(z);
      t = Math.max(Date.parse(z.do), t + MIN);
    }
    const wynik = [];
    for (const z of okresy) {
      for (const l of liniePosortowane(slowniki)) {
        const zl = zmianaLinii(`${l.kod}/${z.id}`);
        if (zl && zl.dane && zl.dane.raport) continue;
        const szablon = H().szablonDla(slowniki, l.kod, z.nr);
        if (!zl && !(szablon && (szablon.pozycje || []).length)) continue;
        wynik.push({ klucz: `${l.kod}/${z.id}`, linia: l.kod, liniaNazwa: liniaWidoczna(slowniki, l.kod), zmiana: z.id, zmianaOpis: opisZmiany(z.id, slowniki),
                     koniec: z.do, otwarta: !!(zl && ((zl.dane || {}).pozycje || []).length), lider: zl ? nazwaPracownika(pracownicy, (zl.dane || {}).lider) : null });
      }
    }
    return wynik.sort((a, b) => (b.otwarta - a.otwarta) || Date.parse(b.koniec) - Date.parse(a.koniec) || a.liniaNazwa.localeCompare(b.liniaNazwa, 'pl'));
  }

  // ------------------------------------------------------------ raporty zmian (D16)

  const liczbaLubNull = v => (typeof v === 'number' && isFinite(v) ? v : null);

  function raporty({ zmianyLinii, slowniki, pracownicy, limit }) {
    return (zmianyLinii || [])
      .filter(z => z && z.status === 'zamknieta' && z.dane && z.dane.raport)
      .map(z => {
        const d = z.dane, r = d.raport || {};
        const [linia, ...reszta] = String(z.id).split('/');
        const idZmiany = r.zmiana || d.zmiana || reszta.join('/');
        const ch = r.checklista || {};
        const aw = Array.isArray(r.awarie) ? r.awarie : [];
        const pr = r.proby || {};
        return {
          klucz: z.id, czas: d.czas_zamkniecia || z.zmieniono,
          linia: r.linia || z.linia || linia, liniaNazwa: liniaWidoczna(slowniki, r.linia || z.linia || linia),
          zmiana: idZmiany, zmianaOpis: opisZmiany(idZmiany, slowniki),
          lider: nazwaPracownika(pracownicy, r.lider || d.lider),
          // Podsumowanie pisze telefon lidera, a hub sprawdza tylko, że to obiekt — liczby muszą być liczbami,
          // inaczej tekst z raportu trafiłby do innerHTML Panelu kierownika (XSS).
          checklista: { zrobione: liczbaLubNull(ch.zrobione), wszystkie: liczbaLubNull(ch.wszystkie),
                        opoznione: Array.isArray(ch.opoznione) ? ch.opoznione.length : 0, pominiete: Array.isArray(ch.pominiete) ? ch.pominiete.length : 0 },
          obsada: r.obsada || null,
          // Raport wersja 2 (etap 3) niesie przestój LINII (nakładające się awarie raz, przycięty do zmiany);
          // stary raport (wersja 1) go nie ma — wtedy jak dotąd suma przestojów awarii.
          awarie: aw.length, przestojMin: (r.wersja >= 2 && typeof r.przestoj_min === 'number') ? r.przestoj_min : aw.reduce((s, a) => s + (+a.przestoj_min || 0), 0),
          awarieLista: aw.map(a => ({ numer: a.numer || '—', maszyna: a.maszyna || '—', przestojMin: +a.przestoj_min || 0 })),
          proby: { liczba: liczbaLubNull(pr.liczba) || 0, sprawdzone: liczbaLubNull(pr.sprawdzone) || 0, braki: liczbaLubNull(pr.braki) || 0,
                   proc: liczbaLubNull(pr.sprawdzone) ? Math.round((liczbaLubNull(pr.braki) || 0) * 1000 / pr.sprawdzone) / 10 : null },
          bhp: (r.bhp && liczbaLubNull(r.bhp.zgloszenia)) || 0,
          uwagi: r.uwagi || '',
        };
      })
      .sort((x, y) => String(y.czas).localeCompare(String(x.czas)))
      .slice(0, limit || 30);
  }

  // ------------------------------------------------------------ zlecenia od kierownika (2026-09-28)

  const OTWARTE = new Set(['nowe', 'przyjete']);
  const DO_ZAMKNIECIA = new Set(['wykonane', 'odrzucone']);

  const poTerminie = (z, teraz) => {
    const t = Date.parse((z.dane || {}).termin);
    return !isNaN(t) && OTWARTE.has(z.status) && t < teraz;
  };

  /* Wiersze zleceń. UI etap 2 (właściciel 2026-10-12) — trzy filtry zamiast sześciu:
     'otwarte' = „W toku” (dział jeszcze robi; także po terminie i zaplanowane na później — D47, dział ich jeszcze nie widzi)
     | 'do-zamkniecia' = „Do przyjęcia” (dział skończył albo nie może — kierownik przyjmuje albo zwraca)
     | 'zamkniete' (także przepadłe zadania zmianowe — D35); inny filtr = wszystkie.
     Po terminie, przepadłe i zaplanowane to znaczniki na wierszu, nie osobne listy: kierownik widzi je tam, gdzie i tak
     patrzy. Kolejność: po terminie (najdłużej spóźnione) na górze — tam prowadzi kafelek „Zlecenia po terminie” i push —
     potem przepadłe, pilne, najstarsze; zaplanowane na samym dole, od najbliższego startu.
     ja = zalogowana osoba: moznaAnulowac — zlecenia kierownika zakładu nie anuluje kierownik UR/KJ (D45, Hala.moznaAnulowacZlecenie). */
  function zlecenia({ zlecenia: lista, slowniki, pracownicy, stale, teraz, filtr, ja }) {
    const dzialy = new Map(((stale && stale.dzialy) || []).map(d => [d.kod, d.nazwa]));
    const maszyny = (slowniki && slowniki.maszyny) || {};
    const szablony = (slowniki && slowniki.zlecenia_stale) || {};
    const pasuje = z => filtr === 'otwarte' ? OTWARTE.has(z.status) || z.status === 'zaplanowane'
      : filtr === 'do-zamkniecia' ? DO_ZAMKNIECIA.has(z.status)
      : filtr === 'zamkniete' ? !z.aktywny : true;
    const zZakladu = ((ja && ja.role) || []).some(r => r === 'kierownik' || r === 'admin');
    return (lista || []).filter(z => z && pasuje(z)).map(z => {
      const d = z.dane || {};
      const termin = d.termin ? Date.parse(d.termin) : NaN;
      const kto = d.wykonal || d.odrzucil || d.przyjal || d.wykonawca || null;
      const po = poTerminie(z, teraz);
      // Wykonane po terminie też widać — kierownik egzekwuje, więc spóźnienie nie znika z chwilą wysłania.
      const wykonano = Date.parse(d.czas_wykonania);
      const spoznioneWykonanie = DO_ZAMKNIECIA.has(z.status) && !isNaN(termin) && !isNaN(wykonano) && wykonano > termin;
      const przepadlo = z.status === 'przepadlo';
      const zaplanowane = z.status === 'zaplanowane';
      const start = Date.parse(d.zaplanowane_na);
      return {
        id: z.id, numer: z.numer || '—', status: z.status, etykieta: z.etykieta || z.status,
        tytul: d.tytul || '', opis: d.opis || '',
        dzial: d.dzial, dzialNazwa: dzialy.get(d.dzial) || d.dzial || '—',
        liniaNazwa: d.linia ? liniaWidoczna(slowniki, d.linia) || null : null,
        maszyna: d.maszyna ? ((maszyny[d.maszyna] || {}).nazwa || d.maszyna) : null,
        pilne: d.priorytet === 'pilne',
        kto: nazwaPracownika(pracownicy, kto),
        wykonawca: nazwaPracownika(pracownicy, d.wykonawca),
        zlecil: nazwaPracownika(pracownicy, d.zlecil),
        zlecono: godzina(d.czas_zlecenia), zleconoDzien: dataKrotka(d.czas_zlecenia),
        termin: isNaN(termin) ? null : `${dataKrotka(termin)} ${godzina(termin)}`,
        poTerminie: po,
        // ⏰ — znacznik „po terminie” na wierszu (UI etap 2: osobnego filtra już nie ma).
        spoznienie: po ? `⏰ spóźnione o ${H().formatCzasu(teraz - termin)}`
          : spoznioneWykonanie ? `wykonane ${H().formatCzasu(wykonano - termin)} po terminie`
          : przepadlo ? `niezrobione do końca zmiany (${godzina(d.wazne_do || d.czas_przepadniecia)})` : null,
        przepadlo,
        odpowiedz: d.powod_odrzucenia ? `Nie może: ${d.powod_odrzucenia}` : null,
        notatka: d.uwagi_wykonania || null,
        uwagiZwrotu: d.uwagi_zwrotu || null,
        wymagajZdjecia: d.wymagaj_zdjecia === true, wymagajNotatki: d.wymagaj_notatki === true,
        stale: d.stale || null, staleNazwa: d.stale ? ((szablony[d.stale] || {}).tytul || d.stale) : null,
        zdjeciaKierownika: [].concat(d.zdjecia || []),
        zdjecia: [].concat(d.zdjecia_wykonania || []),
        otwarte: OTWARTE.has(z.status), doZamkniecia: DO_ZAMKNIECIA.has(z.status),
        moznaAnulowac: (OTWARTE.has(z.status) || zaplanowane) && H().moznaAnulowacZlecenie(z, ja, pracownicy),
        // D47: zaplanowane — kiedy hub je zleci i jaki dostanie termin; zmienia i „Zleć teraz” tylko kierownik zakładu (admin).
        zaplanowane, zaplanowaneMs: zaplanowane && !isNaN(start) ? start : null,
        zaplanowaneNa: zaplanowane && !isNaN(start) ? `${dataDluga(start)} ${godzina(start)}` : null,
        terminPlanu: zaplanowane ? opisTerminuPlanu(d) : null,
        moznaZmienic: zaplanowane && zZakladu,
        czas: d.czas_zlecenia || d.czas_zaplanowania || z.zmieniono, terminMs: isNaN(termin) ? null : termin,
      };
    }).sort((a, b) => (a.zaplanowane - b.zaplanowane)
      || (a.zaplanowane && b.zaplanowane ? (a.zaplanowaneMs || 0) - (b.zaplanowaneMs || 0) : 0)
      || (b.poTerminie - a.poTerminie) || (a.poTerminie && b.poTerminie ? a.terminMs - b.terminMs : 0)
      || (b.przepadlo - a.przepadlo)
      || (b.pilne - a.pilne) || String(a.czas).localeCompare(String(b.czas)));
  }

  /* Napisy trzech chipów filtra zleceń (UI etap 2). Liczby jak dotąd przy „W toku” i „Do przyjęcia”; to, co miało
     własne czerwone chipy, zostaje sygnałem na chipie swojej listy — „W toku · 5 · ⏰ 2” (po terminie) i „Zamknięte ·
     przepadło 1” (D35, dwie ostatnie doby) na czerwono (alarm), żeby egzekwowanie nie zniknęło razem z filtrami. */
  function chipyZlecen(lista, teraz) {
    const l = (lista || []).filter(Boolean);
    const wToku = l.filter(z => OTWARTE.has(z.status) || z.status === 'zaplanowane').length;
    const po = l.filter(z => poTerminie(z, teraz)).length;
    const doPrzyjecia = l.filter(z => DO_ZAMKNIECIA.has(z.status)).length;
    const przepadlo = l.filter(z => z.status === 'przepadlo').length;
    return [
      { filtr: 'otwarte', napis: `W toku${wToku ? ` · ${wToku}` : ''}${po ? ` · ⏰ ${po}` : ''}`, alarm: po > 0 },
      { filtr: 'do-zamkniecia', napis: `Do przyjęcia${doPrzyjecia ? ` · ${doPrzyjecia}` : ''}`, alarm: false },
      { filtr: 'zamkniete', napis: `Zamknięte${przepadlo ? ` · przepadło ${przepadlo}` : ''}`, alarm: przepadlo > 0 },
    ];
  }

  /* Czy w oknie „Nowe zlecenie” rozwinąć „Więcej opcji” (UI etap 2). Na co dzień zwinięte — kierownik wpisuje co, dział,
     kto i termin. Rozwinięte, gdy w środku jest już coś wypełnione, żeby nie wysłać zlecenia z polem, którego nie widział:
     zmiana zaplanowanego (edycja), „Zleć teraz” ze zlecenia stałego, opis, linia, maszyna, pilne albo wymagania inne niż
     domyślne (zdjęcie i notatka wymagane). */
  function wiecejOpcjiZlecenia(w, edycja) {
    if (edycja) return true;
    const d = w || {};
    const inneNizDomyslne = k => d[k] !== undefined && d[k] !== true;
    return !!(d.stale || String(d.opis || '').trim() || d.linia || d.maszyna || d.pilne
              || inneNizDomyslne('wymagaj_zdjecia') || inneNizDomyslne('wymagaj_notatki'));
  }

  // ------------------------------------------------------------ zlecenia zaplanowane (D47)

  const DOBA = 24 * 3600000;
  /* DD.MM.RRRR (data zakładu) — zaplanowane zlecenia bywają za miesiące, więc z rokiem. */
  function dataDluga(t) {
    const ms = typeof t === 'number' ? t : Date.parse(t);
    if (isNaN(ms)) return '—';
    const l = H().lokalny(ms);
    return `${String(l.dzien).padStart(2, '0')}.${String(l.miesiac).padStart(2, '0')}.${l.rok}`;
  }
  /* „termin 2 h po starcie”, „termin 3 d po starcie”, „termin 12.12 14:00” albo „bez terminu”. */
  function opisTerminuPlanu(d) {
    const po = d.termin_po_min;
    if (typeof po === 'number' && isFinite(po) && po >= 1) {
      const tekst = po % 1440 === 0 ? `${po / 1440} d` : po % 60 === 0 ? `${po / 60} h` : H().formatCzasu(po * 60000);
      return `termin ${tekst} po starcie`;
    }
    const t = Date.parse(d.termin);
    return isNaN(t) ? 'bez terminu' : `termin ${dataDluga(t)} ${godzina(t)}`;
  }

  /* Start pierwszej zmiany dnia (RRRR-MM-DD) — ta sama reguła co zlecenia stałe „raz dziennie” (Hala.wystapieniaStale). */
  function startPierwszejZmiany(dzien, zmiany) {
    const w = H().wystapieniaStale('plan', { harmonogram: { rodzaj: 'codziennie' }, termin: { rodzaj: 'koniec_zmiany' } }, dzien, zmiany)[0];
    return w ? Date.parse(w.start) : NaN;
  }

  /* „Zaplanuj na” z formularza (D47): dzień + godzina (pusto = start pierwszej zmiany tego dnia) → {na: ISO, opis} albo
     {blad}. Pusty dzień = bez planu ({na: null} — zlecenie od razu). Najwyżej rok naprzód; chwila z przeszłości to błąd. */
  function planZFormularza({ dzien, godzina: g, zmiany, teraz }) {
    if (!dzien) return { na: null };
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dzien);
    if (!m) return { blad: 'Wybierz dzień z kalendarza.' };
    let ms;
    if (g) {
      const gm = /^(\d{1,2}):(\d{2})$/.exec(g);
      if (!gm || +gm[1] > 23 || +gm[2] > 59) return { blad: 'Godzina w postaci GG:MM, np. 06:00.' };
      ms = H().zLokalnego(+m[1], +m[2], +m[3], +gm[1], +gm[2]);
    } else {
      ms = startPierwszejZmiany(dzien, zmiany);
      if (isNaN(ms)) ms = H().zLokalnego(+m[1], +m[2], +m[3], 6, 0);
    }
    if (!(ms > teraz)) return { blad: 'Ta chwila już minęła — wybierz późniejszą albo wyczyść „Zaplanuj na”, żeby zlecić od razu.' };
    if (ms > teraz + 366 * DOBA) return { blad: 'Najwyżej rok naprzód.' };
    return { na: new Date(ms).toISOString(), opis: `${dataDluga(ms)} ${godzina(ms)}` };
  }

  /* Termin względny „po starcie” (liczba + jednostka: godz albo dni) → {min} (null = bez) albo {blad}. */
  function terminPoZFormularza(ile, jednostka) {
    if (ile === '' || ile === null || ile === undefined) return { min: null };
    const n = Number(String(ile).replace(',', '.'));
    if (!isFinite(n) || n <= 0) return { blad: 'Termin po starcie — liczba większa od zera.' };
    const min = Math.round(n * (jednostka === 'dni' ? 1440 : 60));
    if (min < 1 || min > 366 * 1440) return { blad: 'Termin po starcie — od 1 minuty do roku.' };
    return { min };
  }

  /* Termin przy „Zleć teraz” (D47) — bliźniak termin_aktywacji w hubie: termin_po_min od planowanego startu, a gdy
     kierownik zleca wcześniej — od teraz (wcześniejsza z dwóch chwil); bez niego termin z planu albo żaden. */
  function terminAktywacji(d, teraz) {
    const po = d && d.termin_po_min;
    if (typeof po === 'number' && isFinite(po) && po >= 1) {
      const start = Date.parse(d.zaplanowane_na);
      return new Date((isNaN(start) ? teraz : Math.min(start, teraz)) + po * 60000).toISOString();
    }
    return (d && d.termin) || null;
  }

  /* Kafelki na górze „Na żywo” (jak pulpit GK Flota): liczba i kolor — co wymaga uwagi kierownika. */
  function kafelki({ kafelkiLinii, wierszeAwarii, incydenty: inc, zlecenia: lista, teraz, bezRaportu, slowniki }) {
    // „Stoi linii” liczy LINIE (etap 3): dwie zatrzymane maszyny na jednej linii to jedna stojąca linia.
    // D51: zakład z jedną linią (slowniki podane, linia jedna) — liczą się MASZYNY, a kafelek mówi „Maszyna stoi”.
    const naMaszyny = slowniki !== undefined && !wieleLinii(slowniki);
    const stoi = new Set((wierszeAwarii || []).filter(w => w.zatrzymuje).map(w => (naMaszyny ? w.maszyna : w.linia))).size;
    const opoznione = (kafelkiLinii || []).filter(k => k.kolor === 'czerwony').length;
    const jakosc = ((inc && inc.lista) || []).length;
    const otwarte = (lista || []).filter(z => OTWARTE.has(z.status)).length;
    const doZamkniecia = (lista || []).filter(z => DO_ZAMKNIECIA.has(z.status)).length;
    const spoznione = (lista || []).filter(z => poTerminie(z, teraz === undefined ? Date.now() : teraz)).length;
    const klasa = (n, zla) => (!n ? 'zero' : zla);
    return [
      { kod: 'stoi', etykieta: naMaszyny ? MASZYNA_STOI : 'Stoi linii', liczba: stoi, klasa: klasa(stoi, 'pilne') },
      { kod: 'awarie', etykieta: 'Aktywne awarie', liczba: (wierszeAwarii || []).length, klasa: klasa((wierszeAwarii || []).length, 'uwaga') },
      { kod: 'obchody', etykieta: 'Opóźnione obchody', liczba: opoznione, klasa: klasa(opoznione, 'pilne') },
      { kod: 'jakosc', etykieta: 'Jakość — zmiana', liczba: jakosc, klasa: klasa(jakosc, 'uwaga') },
      // „do przyjęcia” — tak samo jak chip w Zleceniach (kierownik przyjmuje albo zwraca); dwie nazwy jednej listy myliły.
      // UI etap 3: krótka etykieta „Zlecenia” + dopisek pod liczbą — „ZLECENIA · 1 DO PRZYJĘCIA” łamało się w wąskim kafelku.
      { kod: 'zlecenia', etykieta: doZamkniecia ? 'Zlecenia' : 'Zlecenia w toku', dopisek: doZamkniecia ? `${doZamkniecia} do przyjęcia` : null,
        liczba: otwarte + doZamkniecia, klasa: doZamkniecia ? 'dobrze' : klasa(otwarte, 'uwaga') },
      { kod: 'po-terminie', etykieta: 'Zlecenia po terminie', liczba: spoznione, klasa: klasa(spoznione, 'pilne') },
    ].concat(bezRaportu === undefined ? [] : [
      // Etap 3: OTWARTE zmiany bez raportu końcowego (2 doby) — to sygnał dla kierownika; nieotwarte z szablonem
      // (np. po weekendzie) to szum, więc są tylko w „Raporty”, zwinięte. Klik prowadzi do „Raporty”.
      { kod: 'bez-raportu', etykieta: 'Zmiany bez raportu', liczba: (bezRaportu || []).filter(b => b.otwarta).length,
        klasa: klasa((bezRaportu || []).filter(b => b.otwarta).length, 'uwaga') }]);
  }

  /* Które kafelki pokazać (szlif UI 2026-10-12): rząd zer na monitorze to szum, w którym ginie jedyna ważna liczba —
     zostają tylko kafelki z liczbą większą od zera. Gdy nie zostaje żaden, ekran mówi spokojnie „Wszystko w porządku”
     (spokoj = true), zamiast pustego miejsca, które wyglądałoby na błąd. */
  function kafelkiDoPokazania(lista) {
    const widoczne = (lista || []).filter(k => k && k.liczba > 0);
    return { kafelki: widoczne, spokoj: !widoczne.length };
  }

  // ------------------------------------------------------------ zlecenia stałe (D31)

  const DNI = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];
  const DNI_NAZWY = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];
  const zmianySl = slowniki => {
    const z = (slowniki && slowniki.zmiany) || {};
    return Object.keys(z).length ? z : { I: { nazwa: 'Zmiana I', od: '06:00', do: '14:00' }, II: { nazwa: 'Zmiana II', od: '14:00', do: '22:00' },
                                          III: { nazwa: 'Zmiana III', od: '22:00', do: '06:00' } };
  };

  /* [1,2,3,4,5] → „pn–pt”, [1,3,5] → „pn, śr, pt”, wszystkie → „codziennie”. */
  function dniPoLudzku(dni) {
    const d = [...new Set(dni || [])].filter(x => x >= 1 && x <= 7).sort((a, b) => a - b);
    if (d.length === 7) return 'codziennie';
    const czesci = [];
    for (let i = 0; i < d.length;) {
      let j = i;
      while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
      if (j - i >= 2) czesci.push(`${DNI[d[i] - 1]}–${DNI[d[j] - 1]}`);
      else for (let k = i; k <= j; k++) czesci.push(DNI[d[k] - 1]);
      i = j + 1;
    }
    return czesci.join(', ') || '—';
  }

  /* Harmonogram jednym zdaniem (lista zleceń stałych): „pn–pt, zmiana I, do 10:00”,
     „codziennie, każda zmiana, do końca zmiany”, „1. dnia miesiąca, do końca zmiany”. */
  function harmonogramPoLudzku(s, slowniki) {
    const h = (s && s.harmonogram) || {}, t = (s && s.termin) || {};
    if (h.rodzaj === 'reczny') return 'ręcznie („Zleć teraz”)';
    const kiedy = h.rodzaj === 'codziennie' ? 'codziennie' : h.rodzaj === 'dni_tygodnia' ? dniPoLudzku(h.dni)
      : h.rodzaj === 'miesiecznie' ? `${h.dzien_miesiaca}. dnia miesiąca` : '—';
    const wszystkie = Object.keys(zmianySl(slowniki));
    const zm = (h.zmiany || []).filter(z => wszystkie.includes(z));
    const zmiany = !zm.length ? null : wszystkie.every(z => zm.includes(z)) ? 'każda zmiana'
      : `${zm.length === 1 ? 'zmiana' : 'zmiany'} ${wszystkie.filter(z => zm.includes(z)).join(', ')}`;
    const termin = t.rodzaj === 'godzina' ? `do ${t.godzina}` : t.rodzaj === 'minuty' ? `w ciągu ${H().formatCzasu((+t.minuty || 0) * MIN)}` : 'do końca zmiany';
    return [kiedy, zmiany, termin].filter(Boolean).join(', ');
  }

  /* „dziś”, „jutro” albo „pn 05.10” — dzień zakładu względem teraz. */
  function dzienPoLudzku(ms, teraz) {
    const a = H().lokalny(ms), b = H().lokalny(teraz);
    const dni = Math.round((Date.UTC(a.rok, a.miesiac - 1, a.dzien) - Date.UTC(b.rok, b.miesiac - 1, b.dzien)) / 86400000);
    if (dni === 0) return 'dziś';
    if (dni === 1) return 'jutro';
    return `${DNI[(new Date(Date.UTC(a.rok, a.miesiac - 1, a.dzien)).getUTCDay() + 6) % 7]} ${dataKrotka(ms)}`;
  }

  /* Następne wystąpienie (do dwóch miesięcy w przód) albo to, które trwa — tę samą regułę liczy hub
     (Hala.wystapieniaStale ↔ hala.py: wystapienia_stale). null: wstrzymane, ręczne albo nic w zasięgu. */
  function nastepneWystapienie(kod, s, teraz, slowniki) {
    if (!s || s.aktywny === false) return null;
    const l = H().lokalny(teraz);
    for (let i = -1; i <= 62; i++) {
      const data = new Date(Date.UTC(l.rok, l.miesiac - 1, l.dzien + i)).toISOString().slice(0, 10);
      let lista;
      try { lista = H().wystapieniaStale(kod, s, data, zmianySl(slowniki)); } catch (e) { return null; }
      for (const w of lista) {
        const start = Date.parse(w.start), termin = Date.parse(w.termin);
        if (termin <= teraz) continue;
        const trwa = start <= teraz;
        return { start, termin, trwa, klucz: w.klucz,
                 opis: trwa ? `trwa — ${H().opisTerminu(termin, teraz).tekst}` : `${dzienPoLudzku(start, teraz)} ${godzina(start)}` };
      }
    }
    return null;
  }

  // Linia „*” = osobne zlecenie na każdą linię (hub: LINIA_KAZDA, D34).
  const LINIA_KAZDA = '*';

  /* Zadania cykliczne mistrza i lidera podane przez właściciela 2026-10-02 (D34). Częstotliwości i terminy to
     ustawienia domyślne — kierownik zmienia je w Panelu („Zmień”). Dokumenty (premia, RCP, plan, wydajności, urlopy)
     zamyka notatka; to, co widać na hali, także zdjęcie. Lider: każda linia osobno, każda zmiana pn–pt.
     D35: „Ustaw ludzi na maszyny” (dawne lider-obsada) to TYLKO pozycja obsady w checkliście lidera — nie zlecenie. */
  const PN_PT = [1, 2, 3, 4, 5];
  const ZESTAW_STARTOWY = [
    { kod: 'mistrz-premia', tytul: 'Wylicz premię zespołu', dzial: 'mistrz', zdjecie: false,
      opis: 'Za poprzedni miesiąc. W notatce: wynik albo gdzie leży zestawienie.',
      harmonogram: { rodzaj: 'miesiecznie', dzien_miesiaca: 1, zmiany: [] }, termin: { rodzaj: 'minuty', minuty: 3 * 24 * 60 } },
    { kod: 'mistrz-jakosc', tytul: 'Sprawdź jakość na liniach', dzial: 'mistrz', zdjecie: true,
      opis: 'Wyroby na każdej linii. W notatce: co znalazłeś i co zlecono.',
      harmonogram: { rodzaj: 'dni_tygodnia', dni: PN_PT, zmiany: [] }, termin: { rodzaj: 'koniec_zmiany' } },
    { kod: 'mistrz-plan', tytul: 'Zaplanuj produkcję', dzial: 'mistrz', zdjecie: false,
      opis: 'Plan na następny dzień: linie, wyroby, obsada.',
      harmonogram: { rodzaj: 'dni_tygodnia', dni: PN_PT, zmiany: [] }, termin: { rodzaj: 'koniec_zmiany' } },
    { kod: 'mistrz-bhp', tytul: 'Obchód BHP', dzial: 'mistrz', zdjecie: true,
      opis: 'Przejścia, osłony, gaśnice, środki ochrony. Zdjęcie każdej nieprawidłowości.',
      harmonogram: { rodzaj: 'dni_tygodnia', dni: PN_PT, zmiany: [] }, termin: { rodzaj: 'godzina', godzina: '10:00' } },
    { kod: 'mistrz-rcp', tytul: 'Sprawdź RCP', dzial: 'mistrz', zdjecie: false,
      opis: 'Odbicia z poprzedniej doby. W notatce: braki i spóźnienia.',
      harmonogram: { rodzaj: 'dni_tygodnia', dni: PN_PT, zmiany: [] }, termin: { rodzaj: 'godzina', godzina: '09:00' } },
    { kod: 'mistrz-wydajnosc', tytul: 'Sprawdź wydajności', dzial: 'mistrz', zdjecie: false,
      opis: 'Wykonanie linii względem norm kierownika. W notatce: odchylenia i przyczyny.',
      harmonogram: { rodzaj: 'dni_tygodnia', dni: PN_PT, zmiany: [] }, termin: { rodzaj: 'koniec_zmiany' } },
    { kod: 'mistrz-urlopy', tytul: 'Zbierz wnioski urlopowe', dzial: 'mistrz', zdjecie: false,
      opis: 'W notatce: kto i na kiedy.',
      harmonogram: { rodzaj: 'dni_tygodnia', dni: [5], zmiany: [] }, termin: { rodzaj: 'koniec_zmiany' } },
    { kod: 'lider-ustawienia', tytul: 'Sprawdź ustawienia maszyn', dzial: 'produkcja', linia: '*', zdjecie: true,
      opis: 'Parametry zgodne z kartą. W notatce: co poprawiono.',
      harmonogram: { rodzaj: 'dni_tygodnia', dni: PN_PT, zmiany: ['I', 'II', 'III'] }, termin: { rodzaj: 'minuty', minuty: 60 } },
    { kod: 'lider-jakosc', tytul: 'Sprawdź jakość produktów', dzial: 'produkcja', linia: '*', zdjecie: true,
      opis: 'Wyroby z każdej maszyny na linii. W notatce: wynik.',
      harmonogram: { rodzaj: 'dni_tygodnia', dni: PN_PT, zmiany: ['I', 'II', 'III'] }, termin: { rodzaj: 'minuty', minuty: 240 } },
    { kod: 'lider-proby', tytul: 'Wykonaj próby technologiczne', dzial: 'produkcja', linia: '*', zdjecie: true,
      opis: 'Według planu prób. W notatce: wynik i parametry.',
      harmonogram: { rodzaj: 'dni_tygodnia', dni: PN_PT, zmiany: ['I', 'II', 'III'] }, termin: { rodzaj: 'koniec_zmiany' } },
  ];

  /* Te z zestawu, których jeszcze nie ma (po kodzie) — przycisk dodaje tylko brakujące, więc drugi klik niczego nie
     dubluje, a usunięte zadanie wraca dopiero na wyraźne życzenie. Zmiany, których nie ma w słowniku, odpadają. */
  function brakujaceZestawu(slowniki, autor) {
    const jest = (slowniki && slowniki.zlecenia_stale) || {};
    const zmiany = zmianySl(slowniki);
    return ZESTAW_STARTOWY.filter(z => !jest[z.kod]).map(z => {
      const harmonogram = Object.assign({}, z.harmonogram, { zmiany: z.harmonogram.zmiany.filter(n => zmiany[n]) });
      const wartosc = { tytul: z.tytul, opis: z.opis, dzial: z.dzial, priorytet: 'normalny', wymagaj_zdjecia: z.zdjecie,
                        wymagaj_notatki: true, harmonogram, termin: Object.assign({}, z.termin), aktywny: true, autor };
      if (z.linia) wartosc.linia = z.linia;
      return { kod: z.kod, wartosc };
    });
  }

  /* Czy autor wpisu może zlecać (jak hub w automat_zlecen): aktywny i z rolą z zlecenie.utworzone albo admin. Inaczej
     hub pomija wystąpienia z wpisem tylko w swoim dzienniku — kierownik nie wiedział, że zlecenie stałe przestało
     działać (etap 3). roleZlecajacych = kontrakt.zdarzenia['zlecenie.utworzone'].role; null = nie sprawdzamy ról. */
  function autorNieZleca(s, pracownicy, roleZlecajacych) {
    const a = (pracownicy || []).find(x => x.id === (s && s.autor));
    if (!a || a.aktywny === false) return 'autor nieaktywny';
    if (roleZlecajacych && !(a.role || []).some(r => r === 'admin' || roleZlecajacych.includes(r))) return 'autor bez roli kierownika';
    return null;
  }

  /* Aktywne zlecenia stałe, które zleca ta osoba — ostrzeżenie przy wyłączaniu konta albo odbieraniu roli. */
  function staleAutora(slowniki, id) {
    return Object.entries((slowniki && slowniki.zlecenia_stale) || {})
      .filter(([, s]) => s && s.autor === id && s.aktywny !== false)
      .map(([kod, s]) => ({ kod, tytul: s.tytul || kod }));
  }

  /* Administracja: zapis osoby, po którym jej zlecenia stałe przestałyby się zlecać (wyłączenie, odebrana rola). */
  function ostrzezenieAutora(slowniki, osoba, dane, roleZlecajacych) {
    if (!osoba) return null;
    const lista = staleAutora(slowniki, osoba.id);
    if (!lista.length) return null;
    const zleca = dane.aktywny !== false && (dane.role || []).some(r => r === 'admin' || (roleZlecajacych || []).includes(r));
    if (zleca) return null;
    const tytuly = lista.slice(0, 3).map(s => `„${s.tytul}”`).join(', ') + (lista.length > 3 ? ` i ${lista.length - 3} więcej` : '');
    return `${osoba.nazwa} zleca zlecenia stałe (${lista.length}): ${tytuly}. Po zapisie przestaną się zlecać — kierownik musi `
      + 'otworzyć każde w Zlecenia → Zlecenia stałe i kliknąć „Zmień” (zostanie autorem).';
  }

  /* Lista „Zlecenia stałe”: aktywne na górze, potem po tytule. */
  function zleceniaStale({ slowniki, pracownicy, stale, teraz, roleZlecajacych }) {
    const dzialy = new Map(((stale && stale.dzialy) || []).map(d => [d.kod, d.nazwa]));
    const maszyny = (slowniki && slowniki.maszyny) || {};
    return Object.entries((slowniki && slowniki.zlecenia_stale) || {}).map(([kod, s]) => {
      const nast = nastepneWystapienie(kod, s, teraz, slowniki);
      return {
        kod, tytul: s.tytul || kod, opis: s.opis || '',
        dzialNazwa: dzialy.get(s.dzial) || s.dzial || '—',
        // D51: przy jednej linii jej pola są schowane — „każda linia osobno” ani nazwa jedynej linii nic tu nie mówią.
        liniaNazwa: !wieleLinii(slowniki) ? null : s.linia === LINIA_KAZDA ? 'każda linia osobno' : s.linia ? nazwaLinii(slowniki, s.linia) : null,
        maszyna: s.maszyna ? ((maszyny[s.maszyna] || {}).nazwa || s.maszyna) : null,
        osoba: nazwaPracownika(pracownicy, s.wykonawca),
        harmonogram: harmonogramPoLudzku(s, slowniki),
        wymagajZdjecia: s.wymagaj_zdjecia === true, wymagajNotatki: s.wymagaj_notatki === true,
        pilne: s.priorytet === 'pilne', aktywny: s.aktywny !== false, reczny: ((s.harmonogram || {}).rodzaj || 'reczny') === 'reczny',
        nastepne: nast ? nast.opis : null,
        autor: nazwaPracownika(pracownicy, s.autor),
        nieZleca: s.aktywny !== false ? autorNieZleca(s, pracownicy, roleZlecajacych || null) : null,
      };
    }).sort((a, b) => (b.aktywny - a.aktywny) || a.tytul.localeCompare(b.tytul, 'pl'));
  }

  /* Formularz okna „Zlecenie stałe” → { bledy, kod, wartosc } dla slownik.zapisany zlecenia_stale/<kod>.
     Te same zasady sprawdza hub (blad_zlecenia_stalego) — tu, żeby człowiek dostał błąd przy polu. */
  function stalyZFormularza(f, slowniki, istniejacyKod, autor) {
    const bledy = [];
    const tytul = String(f.tytul || '').trim().replace(/\s+/g, ' ');
    if (!tytul) bledy.push('Napisz, co zrobić.');
    if (tytul.length > 200) bledy.push('Tytuł może mieć najwyżej 200 znaków.');
    if (!f.dzial) bledy.push('Wybierz dział.');
    if (f.linia === LINIA_KAZDA && String(f.maszyna || '').trim()) bledy.push('„Każda linia osobno” bez jednej maszyny — usuń maszynę albo wybierz linię.');
    const rodzaj = ['reczny', 'codziennie', 'dni_tygodnia', 'miesiecznie'].includes(f.rodzaj) ? f.rodzaj : 'codziennie';
    const harmonogram = { rodzaj };
    if (rodzaj !== 'reczny') {
      harmonogram.zmiany = [].concat(f.zmiany || []).filter(z => zmianySl(slowniki)[z]);
      if (rodzaj === 'dni_tygodnia') {
        harmonogram.dni = [...new Set([].concat(f.dni || []).map(Number))].filter(x => x >= 1 && x <= 7).sort((a, b) => a - b);
        if (!harmonogram.dni.length) bledy.push('Zaznacz co najmniej jeden dzień tygodnia.');
      }
      if (rodzaj === 'miesiecznie') {
        const d = parseInt(f.dzien_miesiaca, 10);
        if (!(d >= 1 && d <= 31)) bledy.push('Dzień miesiąca to liczba od 1 do 31.');
        harmonogram.dzien_miesiaca = d;
      }
    }
    const tr = ['koniec_zmiany', 'godzina', 'minuty'].includes(f.termin_rodzaj) ? f.termin_rodzaj : 'koniec_zmiany';
    const termin = { rodzaj: tr };
    if (tr === 'godzina') {
      const g = String(f.godzina || '').trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(g)) bledy.push('Godzina terminu jako GG:MM, np. 10:00.');
      termin.godzina = g;
    }
    if (tr === 'minuty') {
      const m = parseInt(f.minuty, 10);
      if (!(m >= 1 && m <= 10080)) bledy.push('Minuty od startu zmiany: liczba od 1 do 10080.');
      termin.minuty = m;
    }
    const wartosc = { tytul, dzial: f.dzial, priorytet: f.pilne ? 'pilne' : 'normalny',
                      wymagaj_zdjecia: !!f.wymagaj_zdjecia, wymagaj_notatki: !!f.wymagaj_notatki,
                      harmonogram, termin, aktywny: f.aktywny !== false, autor };
    for (const pole of ['opis', 'linia', 'maszyna', 'wykonawca']) { const v = String(f[pole] || '').trim(); if (v) wartosc[pole] = v; }
    const zajete = Object.keys((slowniki && slowniki.zlecenia_stale) || {}).filter(k => k !== istniejacyKod);
    const kod = istniejacyKod || kodZNazwy(tytul || 'zlecenie', zajete);
    return { bledy, kod, wartosc };
  }

  /* Zlecenie stałe ze słownika → pola okna. */
  function stalyDoFormularza(s) {
    const h = (s && s.harmonogram) || {}, t = (s && s.termin) || {};
    return { tytul: s.tytul || '', opis: s.opis || '', dzial: s.dzial || 'produkcja', linia: s.linia || '', maszyna: s.maszyna || '',
             wykonawca: s.wykonawca || '', pilne: s.priorytet === 'pilne',
             wymagaj_zdjecia: s.wymagaj_zdjecia !== false, wymagaj_notatki: s.wymagaj_notatki !== false,
             rodzaj: h.rodzaj || 'codziennie', dni: h.dni || [1, 2, 3, 4, 5], dzien_miesiaca: h.dzien_miesiaca || 1, zmiany: h.zmiany || [],
             termin_rodzaj: t.rodzaj || 'koniec_zmiany', godzina: t.godzina || '', minuty: t.minuty || 60, aktywny: s.aktywny !== false };
  }

  /* „Zapisz jako zlecenie stałe” przy zwykłym zleceniu (jak „Zapisz jako szablon” w GK Trasy): te same pola,
     codziennie raz na zmianę I, a termin — godzina z terminu zlecenia (gdy był), inaczej koniec zmiany. */
  function stalyZZlecenia(z) {
    const d = (z && z.dane) || {};
    const t = Date.parse(d.termin);
    return stalyDoFormularza({ tytul: d.tytul, opis: d.opis, dzial: d.dzial, linia: d.linia, maszyna: d.maszyna, wykonawca: d.wykonawca,
                               priorytet: d.priorytet, wymagaj_zdjecia: d.wymagaj_zdjecia !== false, wymagaj_notatki: d.wymagaj_notatki !== false,
                               harmonogram: { rodzaj: 'codziennie', zmiany: [] },
                               termin: isNaN(t) ? { rodzaj: 'koniec_zmiany' } : { rodzaj: 'godzina', godzina: godzina(t) } });
  }

  /* Termin dla „Zleć teraz”: koniec bieżącej zmiany, najbliższa taka godzina zakładu albo N minut od teraz. */
  function terminTeraz(s, zmiana, teraz) {
    const t = (s && s.termin) || {};
    if (t.rodzaj === 'minuty') return teraz + (+t.minuty || 0) * MIN;
    if (t.rodzaj === 'godzina') {
      const m = /^(\d{1,2}):(\d{2})$/.exec(t.godzina || '');
      if (m) {
        const l = H().lokalny(teraz);
        let ms = H().zLokalnego(l.rok, l.miesiac, l.dzien, +m[1], +m[2]);
        // Jutro = następny dzień KALENDARZA zakładu, nie „teraz + 24 h”: doba zmiany czasu ma 23 albo 25 h, a wtedy
        // +24 h trafiało w złą datę (25.10 o 00:30 z terminem 00:15 — termin już miniony; przegląd 2026-10-06).
        if (ms <= teraz) ms = H().zLokalnego(l.rok, l.miesiac, l.dzien + 1, +m[1], +m[2]);
        return ms;
      }
    }
    return zmiana ? Date.parse(zmiana.do) : teraz + 8 * 3600 * 1000;
  }

  /* Pola okna „Nowe zlecenie” wypełnione zleceniem stałym („Zleć teraz”). */
  function zlecenieZeStalego(kod, s, terminMs) {
    // „Każda linia osobno” robi hub; ręczne „Zleć teraz” to jedno zlecenie — dla wszystkich liderów (P8).
    return { tytul: s.tytul || '', opis: s.opis || '', dzial: s.dzial, linia: s.linia === LINIA_KAZDA ? '' : s.linia || '', maszyna: s.maszyna || '',
             wykonawca: s.wykonawca || '', pilne: s.priorytet === 'pilne', wymagaj_zdjecia: s.wymagaj_zdjecia === true,
             wymagaj_notatki: s.wymagaj_notatki === true, stale: kod, termin: terminMs };
  }

  /* Czas zakładu dla pola datetime-local („2026-10-01T14:00”). */
  function poleCzasu(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '';
    const l = H().lokalny(ms), d = n => String(n).padStart(2, '0');
    return `${l.rok}-${d(l.miesiac)}-${d(l.dzien)}T${d(l.godz)}:${d(l.min)}`;
  }

  // ------------------------------------------------------------ administracja (2026-09-28)

  /* „Krzysztof  Hamrol” → „krzysztof hamrol” — tak jak hub porównuje login (hala.py → login_z_nazwy). */
  function loginZNazwy(t) {
    const PL = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
    return String(t || '').toLowerCase().replace(/[ąćęłńóśźż]/g, z => PL[z]).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');
  }

  /* linieNazwy: linie osoby nazwami — przy jednej linii pusto (D51: „Hala” przy każdym liderze to szum). */
  function pracownicyAdmin({ lista, szukaj, nieaktywni, stale, slowniki }) {
    const role = (stale && stale.role) || {};
    const s = loginZNazwy(szukaj);
    return (lista || []).filter(p => (nieaktywni || p.aktywny !== false) && (!s || loginZNazwy(p.nazwa).includes(s) || loginZNazwy(p.id).includes(s)))
      .map(p => Object.assign({}, p, { roleNazwy: (p.role || []).map(r => role[r] || r),
                                       linieNazwy: (p.linie || []).map(l => liniaWidoczna(slowniki, l)).filter(Boolean) }))
      .sort((a, b) => (b.zablokowany - a.zablokowany) || (b.aktywny !== false) - (a.aktywny !== false) || a.nazwa.localeCompare(b.nazwa, 'pl'));
  }

  // Ta sama lista co hub (hala.py → PINY_ODRZUCANE, D35): każda cyfra powtórzona 4–8 razy i proste ciągi. Od D46 tylko dla
  // konta samego ekranu — PIN osoby (4 cyfry) może być dowolny, także 1234 i 0000 (właściciel 2026-10-08).
  const OCZYWISTE_PINY = new Set(['1234', '4321', '1122', '2580', '123456', '654321', '12345678', '87654321']);
  const oczywistyPin = p => /^(\d)\1{3,7}$/.test(p) || OCZYWISTE_PINY.has(p);
  // Biuro i administrator GK Trasy / GK Flota (D32, GK-KONTA.md §1): hasło min. 8 znaków zamiast PIN-u.
  const ROLE_BIUROWE = ['trasy_biuro', 'trasy_admin', 'flota_biuro', 'flota_admin'];
  const biuroTransportu = role => [].concat(role || []).some(r => ROLE_BIUROWE.includes(r));

  /* Role w grupach do okna osoby: „Produkcja i jakość”, „GK Trasy”, „GK Flota”, „Marketing” (stale.grupy_rol w kontrakcie).
     Rola spoza grup (np. nowa w kontrakcie) trafia do pierwszej grupy — żadna nie może zniknąć z okna.
     dozwolone (D49): role, które nadaje zarządzający zespołem (zakres z huba) — tylko one; null = administrator, wszystkie.
     Opisy grup (hierarchia, hasło biura) są dla administratora — zarządzający widzi same swoje role. */
  function grupyRol(stale, dozwolone) {
    const role = (stale && stale.role) || {};
    const grupy = ((stale && stale.grupy_rol) || [{ nazwa: 'Role', role: Object.keys(role) }])
      .map(g => ({ nazwa: g.nazwa, opis: g.opis || '', role: (g.role || []).filter(r => role[r]).map(r => ({ kod: r, nazwa: role[r] })) }));
    const w = new Set(grupy.flatMap(g => g.role.map(r => r.kod)));
    for (const [kod, nazwa] of Object.entries(role)) if (!w.has(kod) && grupy.length) grupy[0].role.push({ kod, nazwa });
    if (Array.isArray(dozwolone))
      for (const g of grupy) { g.role = g.role.filter(r => dozwolone.includes(r.kod)); g.opis = ''; }
    return grupy.filter(g => g.role.length);
  }

  /* Formularz osoby → dane dla POST /api/v1/admin/pracownik albo lista błędów po polsku.
     istniejacy = null przy nowej osobie; wszyscy = pełna lista (unikalny login i imię i nazwisko). */
  function pracownikZFormularza(f, istniejacy, wszyscy) {
    const bledy = [];
    const nazwa = String(f.nazwa || '').trim().replace(/\s+/g, ' ');
    if (nazwa.split(' ').length < 2) bledy.push('Podaj imię i nazwisko — to jest login pracownika.');
    const inni = (wszyscy || []).filter(p => !istniejacy || p.id !== istniejacy.id);
    const loginy = p => [p.nazwa].concat(p.loginy || []).map(loginZNazwy);
    if (nazwa && inni.some(p => p.aktywny !== false && loginy(p).includes(loginZNazwy(nazwa))))
      bledy.push(`Osoba „${nazwa}” już jest. Imię i nazwisko to login — dopisz coś, np. „${nazwa} 2”.`);
    let id = istniejacy ? istniejacy.id : loginZNazwy(nazwa).replace(/ /g, '.').replace(/[^a-z0-9.]/g, '');
    if (!istniejacy && id) { const baza = id; let i = 2; while (inni.some(p => p.id === id)) id = `${baza}${i++}`; }
    const role = [].concat(f.role || []).filter(Boolean);
    if (!role.length) bledy.push('Zaznacz co najmniej jedną rolę.');
    // D43: człowiek — hasło (startowe haslo123 albo wpisane przez administratora) + PIN 4 cyfry (nieobowiązkowy);
    // konto samego ekranu — jeden PIN 4–8 cyfr (bez hasła).
    const ekran = role.length === 1 && role[0] === 'ekran';
    const pin = String(f.pin || '').trim();
    const haslo = String(f.haslo || '').trim();
    if (ekran) {
      if (!pin && (!istniejacy || !istniejacy.ekran)) bledy.push('Konto ekranu potrzebuje PIN-u (4–8 cyfr).');
      if (pin && !/^\d{4,8}$/.test(pin)) bledy.push('PIN ekranu to 4–8 cyfr.');
    } else if (pin && !/^\d{4}$/.test(pin)) bledy.push('PIN to dokładnie 4 cyfry.');
    if (ekran && pin && oczywistyPin(pin)) bledy.push('Ten PIN jest zbyt oczywisty — wybierz inny.');
    const startowe = !ekran && (!istniejacy || f.haslo_startowe === true);
    if (startowe && haslo) {
      const b = bladHasla(haslo, nazwa, true);
      if (b) bledy.push('Hasło startowe: ' + b);
    }
    // Hub nie zna długości hasła sprzed D43 (import z programu) — rola biura dochodzi tylko z hasłem startowym.
    if (biuroTransportu(role) && istniejacy && !startowe && !istniejacy.dlugie_haslo)
      bledy.push('Rola biura GK Trasy / GK Flota wymaga hasła min. 8 znaków — kliknij „Ustaw hasło startowe”.');
    const telefon = String(f.telefon || '').trim();
    if (!/^[0-9+()\- ]{0,30}$/.test(telefon)) bledy.push('Telefon: cyfry, spacje, + i myślnik, np. 600 100 200.');
    const dane = { id, nazwa, role, linie: [].concat(f.linie || []).filter(Boolean), aktywny: f.aktywny !== false, telefon };
    if (pin) dane.pin = pin;
    if (startowe && haslo) dane.haslo = haslo;
    if (istniejacy && startowe) dane.haslo_startowe = true;
    const karta = String(f.karta || '').trim();
    if (karta) dane.karta = karta; else if (f.usun_karte) dane.usun_karte = true;
    return { bledy, dane };
  }

  /* Hasło według reguł huba (hala.py → blad_hasla, D43 §1, D46) — tekst błędu albo null: min. 8 znaków (najwyżej 128), nie
     haslo123 (startowe: wolno samo haslo123). Oczywiste, powtórzony znak i imię/nazwisko wolno (D46, właściciel 2026-10-08). */
  function bladHasla(haslo, nazwa, startowe) {
    const h = String(haslo || '').trim();
    if (h.length < 8) return 'min. 8 znaków (litery, cyfry, znaki) — albo zostaw puste (haslo123).';
    if (h.length > 128) return 'najwyżej 128 znaków.';
    if (!startowe && h.toLowerCase() === 'haslo123') return '„haslo123” to hasło startowe — wpisz inne.';
    return null;
  }

  /* Stan hasła i PIN-u osoby w Administracji (D43): znacznik na liście (pusty = nic do zrobienia) i zdanie w oknie osoby.
     p: wiersz GET /admin/pracownicy ({ekran, haslo_do_zmiany, pin_do_zmiany, ma_pin, ma_haslo}). D46: po „Resetuj PIN”
     — PIN startowy 1234, osoba ustawi nowy przy logowaniu. */
  function stanHasla(p) {
    if (!p) return { znacznik: '', klasa: '', opis: '' };
    if (p.ekran) return p.ma_pin ? { znacznik: '', klasa: '', opis: 'Konto ekranu — jeden PIN (4–8 cyfr).' }
      : { znacznik: 'bez PIN-u', klasa: 'tekst-alarm', opis: 'Konto ekranu bez PIN-u — wpisz go i zapisz.' };
    if (p.haslo_do_zmiany) return { znacznik: 'hasło startowe', klasa: 'slaby',
      opis: 'Hasło startowe — przy pierwszym logowaniu osoba ustawi własne hasło' + (p.ma_pin ? ' (PIN już jest).' : ' i PIN.') };
    if (!p.ma_pin) return { znacznik: 'bez PIN-u', klasa: 'slaby', opis: 'Hasło ustawione, PIN-u jeszcze nie ma — osoba ustawi go przy logowaniu.' };
    if (p.pin_do_zmiany) return { znacznik: 'PIN startowy', klasa: 'slaby',
      opis: 'PIN zresetowany (startowy 1234) — przy następnym logowaniu osoba ustawi nowy.' };
    return { znacznik: '', klasa: '', opis: 'Hasło i PIN ustawione.' };
  }

  /* Status połączenia programu (Administracja → Połączenia GK) po ludzku. lokalny (D42): klucz zrobił hub dla programu
     na tym komputerze i położył go w pliku połączenia — nikt go nie wkleja. */
  function polaczenieGK(p, teraz) {
    if (!p || !p.klucz) return { stan: 'Brak klucza', kolor: 'neutral', opis: 'Program na tym komputerze połączy się sam, gdy ruszy. '
      + 'Na innym komputerze: utwórz klucz i wpisz go w ustawieniach programu.' };
    if (!p.wlaczone) return { stan: 'Wyłączone', kolor: 'neutral', opis: 'Program nie pobiera kont i nie połączy się sam. '
      + 'Włącza je „Połącz na tym komputerze” albo nowy klucz.' };
    const skad = p.lokalny ? 'Program na tym komputerze — połączony sam (bez klucza do wklejania)' : 'Klucz wpisany ręcznie';
    if (!p.ostatnio) return { stan: 'Czeka na program', kolor: 'uwaga', opis: `${skad}. Program jeszcze się nie odezwał.` };
    const min = Math.round((teraz - Date.parse(p.ostatnio)) / 60000);
    return { stan: min <= 15 ? 'Działa' : 'Cisza', kolor: min <= 15 ? 'ok' : 'uwaga',
             opis: `${skad} · ostatnio ${min < 1 ? 'przed chwilą' : min < 120 ? `${min} min temu` : `${Math.round(min / 60)} h temu`}` +
                   ` · instalacja ${p.instancja ? 'przypięta' : 'nieprzypięta'} · kont: ${p.konta}` };
  }

  /* GK Trasy i GK Flota na stronie telefonów (D42): hub wysyła ich aplikacje i adres.json na Pages z plików, które programy
     zapisują na tym komputerze. d.programy = GET /api/v1/admin/dostep → programy. */
  function programyNaPages(d, teraz) {
    const kiedy = iso => kiedyKrotko(iso, teraz);
    return ((d && d.programy) || []).map(p => {
      const n = p.na_pages || {}, plik = p.plik || {};
      let stan, kolor, opis;
      if (p.stan === 'wylaczone') { stan = 'Nie dotyczy'; kolor = 'neutral'; opis = 'Ten serwer nie widzi programów z tego komputera (dane testowe).'; }
      else if (p.stan === 'brak' || !p.plik) { stan = 'Brak programu'; kolor = 'neutral'; opis = `${p.nazwa} nie działa na tym komputerze albo jeszcze się nie zgłosił (zgłasza się sam przy starcie).`; }
      else if (p.stan === 'bez_tunelu') { stan = 'Bez tunelu'; kolor = 'uwaga'; opis = `${p.nazwa} nie ma tunelu — telefony spoza firmy go nie znajdą. Włącz tunel w ustawieniach programu.`; }
      else if (p.blad) { stan = p.stan === 'bez_tokenu' ? 'Bez tokenu' : 'Błąd'; kolor = 'alarm'; opis = p.blad; }
      else if (p.stan === 'aktualne') { stan = 'Aktualne'; kolor = 'ok'; opis = `Na Pages wersja ${n.wersja_aplikacji || '?'} (wysłana ${kiedy(n.opublikowano)}), adres danych wpisany ${kiedy(n.adres_zmieniono)}.`; }
      else { stan = 'Wysyłam'; kolor = 'uwaga'; opis = 'Nowy adres albo nowa wersja programu — serwer wysyła je na Pages sam, chwilę to trwa.'; }
      return { program: p.program, nazwa: p.nazwa, stan, kolor, opis, adres: p.adres || '', adres_danych: plik.adres || '',
               na_pages: !!n.opublikowano };
    });
  }

  /* Dostęp z telefonów (D33): stan tunelu, wersji na GitHub Pages i adresu w konfiguracja.json po ludzku —
     z tym, co zrobić. d = odpowiedź GET /api/v1/admin/dostep. */
  /* „dziś 11:58” albo „01.10 17:00” w czasie zakładu. */
  function kiedyKrotko(iso, teraz) {
    if (!iso) return '';
    const l = H().lokalny(Date.parse(iso)), n = H().lokalny(teraz);
    const g = `${String(l.godz).padStart(2, '0')}:${String(l.min).padStart(2, '0')}`;
    return l.rok === n.rok && l.miesiac === n.miesiac && l.dzien === n.dzien ? `dziś ${g}` : `${String(l.dzien).padStart(2, '0')}.${String(l.miesiac).padStart(2, '0')} ${g}`;
  }

  function dostepZTelefonow(d, teraz) {
    const t = (d && d.tunel) || {}, p = (d && d.pages) || {}, u = (d && d.ustawienia) || {};
    const kiedy = iso => kiedyKrotko(iso, teraz);
    let tunel;
    if (t.wstrzymany) tunel = { stan: 'Wstrzymany', kolor: 'neutral', opis: t.wstrzymany };
    else if ((t.ustawiony || t.tryb) === 'brak') tunel = { stan: 'Wyłączony', kolor: 'neutral',
      opis: 'Telefony spoza sieci firmowej nie połączą się z serwerem. Włącz tunel: Ustawienia → Tunel i GitHub.' };
    else if (t.stan === 'dziala') tunel = { stan: 'Działa', kolor: 'ok', opis: t.tryb === 'staly' ? 'Tunel stały — adres się nie zmienia.'
      : 'Adres zmienia się po każdym uruchomieniu serwera — serwer wpisuje go na GitHub, a telefony znajdują go same.' };
    else if (t.stan === 'blad') tunel = { stan: 'Błąd', kolor: 'alarm', opis: t.blad || 'Tunel nie działa.' };
    else tunel = { stan: 'Łączy się', kolor: 'uwaga', opis: 'Za chwilę pojawi się adres (pierwsze włączenie pobiera program tunelu).' };
    tunel.adres = t.stan === 'dziala' ? t.adres || '' : '';
    // Strażnik tunelu (D39): hub co 2 min pyta siebie przez tunel jak telefon — „działa” cloudflared to jeszcze nie
    // działający tunel (Cloudflare potrafi skasować nazwę po cichu).
    const s = (d && d.straznik) || {};
    const proby = n => `${n} ${n === 1 ? 'próba' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'próby' : 'prób'}`;
    const godz = iso => kiedy(iso).replace(/^dziś /, '');     // „sprawdzony 11:58”, z innego dnia „04.10 17:00”
    tunel.straznik = null;
    if (tunel.stan === 'Wyłączony' || tunel.stan === 'Wstrzymany') { /* strażnik śpi razem z tunelem */ }
    else if (s.wynik === 'odpowiada') tunel.straznik = { kolor: 'ok', tekst: `Sprawdzony ${godz(s.sprawdzony)} — odpowiada.` };
    else if (s.wynik === 'brak_internetu') tunel.straznik = { kolor: 'uwaga',
      tekst: `Brak internetu w biurze (sprawdzony ${godz(s.sprawdzony)}) — nowy tunel serwer uruchomi, gdy internet wróci.` };
    else if (s.wynik === 'nie_odpowiada' || s.nie_odpowiada_od) {
      tunel.straznik = { kolor: 'alarm', tekst: `Nie odpowiada od ${godz(s.nie_odpowiada_od)} (${proby(s.proby || 0)})` +
        (s.restarty ? ` — serwer uruchomił nowy tunel ${s.restarty}×.` : ' — po 3 próbach serwer uruchomi nowy tunel.') +
        (s.powod ? ` Ostatnio: ${s.powod}.` : '') };
      if (t.stan === 'dziala') { tunel.stan = 'Nie odpowiada'; tunel.kolor = 'alarm'; }
    }

    const wersje = Object.entries(p.wersje || {});
    const stare = wersje.filter(([, w]) => w.na_pages !== w.biezaca).map(([app]) => (app === 'wspolne' ? 'pliki wspólne' : app));
    let wersja;
    if (!wersje.some(([, w]) => w.na_pages)) wersja = { stan: 'Nie wysłano', kolor: 'uwaga',
      opis: 'Wyślij aplikacje na GitHub — inaczej telefony nie mają czego otworzyć pod adresami niżej.' };
    else if (p.aktualne) wersja = { stan: 'Aktualna', kolor: 'ok', opis: 'Na GitHub Pages jest ta sama wersja aplikacji co na serwerze.' };
    else wersja = { stan: 'Starsza wersja', kolor: 'alarm', opis: `Wyślij aplikacje na GitHub — na Pages jest starsza wersja (${stare.join(', ')}).` };
    const o = p.opublikowano;
    wersja.ostatnio = o ? `Wysłano ${kiedy(o.czas)}${o.kto ? ` (${o.kto})` : ''}` : '';

    const c = p.cichy || {};
    let adres;
    if (!u.github_token_ustawiony) adres = { kolor: 'uwaga', opis: 'Bez tokenu GitHub serwer nie wpisze nowego adresu tunelu na Pages — wklej go w Ustawienia → Tunel i GitHub.' };
    else if (c.blad) adres = { kolor: 'alarm', opis: `Adresu nie udało się wpisać na GitHub (${kiedy(c.czas)}): ${c.blad}` };
    else if (tunel.adres && p.adres_huba === tunel.adres) adres = { kolor: 'ok', opis: `Telefony dostają bieżący adres serwera (wpisany ${kiedy(c.czas)}).` };
    else if (tunel.adres) adres = { kolor: 'uwaga', opis: 'Bieżącego adresu tunelu jeszcze nie ma na GitHub — serwer wpisuje go sam, chwilę to trwa.' };
    else adres = { kolor: 'neutral', opis: p.adres_huba ? `Na GitHub jest adres ${p.adres_huba} — zadziała, gdy ruszy tunel.` : '' };

    let powod = '';
    if (p.trwa) powod = 'Wysyłka trwa…';
    else if (!u.github_token_ustawiony) powod = 'Najpierw wklej token GitHub: Ustawienia → Tunel i GitHub.';
    else if (!tunel.adres) powod = 'Najpierw musi działać tunel — bez niego aplikacje na Pages nie mają gdzie wysyłać danych.';
    return { tunel, wersja, adres, wyslij: { mozna: !powod, powod }, aplikacje: p.aplikacje || [], strona: p.adres || '' };
  }

  /* Logowanie z internetu (D35) po ludzku: alarm sieci zakładu (z tym, co zrobić), licznik złych PIN-ów z internetu
     i konta zablokowane z internetu. l = GET /api/v1/admin/dostep → logowanie. alarm.wpis = co dopisać do sieci zakładu
     przyciskiem „Wpisz mój adres” (IPv6 jako sieć /64); pusty, gdy hub nie widzi stąd adresu internetu. */
  function logowanieZInternetu(l, teraz) {
    l = l || {};
    const wpis = l.twoj_wpis || l.twoj_adres || '';
    let alarm = null;
    if (l.alarm === 'lokalny') alarm = { wpis: '', opis: `Sieć zakładu nie jest ustawiona, a telefony łączą się przez internet. `
      + `Ten komputer łączy się z sieci lokalnej (${l.twoj_adres || '?'}), więc serwer nie widzi stąd adresu internetu biura. `
      + 'Otwórz Panel z adresu na GitHub Pages (kod QR niżej) na komputerze w biurze i tam naciśnij „Wpisz mój adres”.' };
    else if (l.alarm === 'pusta') alarm = { wpis, opis: 'Sieć zakładu nie jest ustawiona, a telefony łączą się przez internet — '
      + `złe PIN-y obcych mogą zablokować logowanie telefonom w firmie. Jesteś teraz w firmowej sieci? Wpisz jej adres: ${wpis}.` };
    else if (l.alarm === 'inny_adres') alarm = { wpis, opis: `Łączysz się z adresu ${wpis}, którego nie ma w sieci zakładu `
      + `(${(l.siec_zakladu || []).join(', ')}). Jesteś teraz w firmowej sieci (np. biuro dostało nowy adres)? Dopisz go.` };
    const n = l.zle_proby_godzina || 0;
    const licznik = { tekst: `Złe PIN-y z internetu w ostatniej godzinie: ${n}`, kolor: n >= 30 ? 'alarm' : n ? 'uwaga' : 'ok' };
    const zablokowane = (l.zablokowane || []).map(z => ({ id: z.id, nazwa: z.nazwa || z.id, konto: z.rodzaj === 'konto',
      opis: z.rodzaj === 'konto' ? `zablokowane z internetu do ${kiedyKrotko(z.do, teraz)} albo do odblokowania — w firmowym wifi loguje się`
        : `z internetu czeka do ${kiedyKrotko(z.do, teraz)} (10 złych PIN-ów)` }));
    return { alarm, licznik, zablokowane };
  }

  /* Kopie poza komputerem (etap 2) — formularz → { bledy, dane } dla POST /api/v1/admin/kopie. Hub i tak sprawdza folder
     na dysku (czy jest, czy da się pisać, czy to nie katalog żywej bazy); tu tylko to, co widać od razu. */
  function kopieZFormularza(f) {
    const bledy = [];
    const folder = String(f.kopia_folder || '').trim().replace(/^"(.*)"$/, '$1');
    // Pełna ścieżka: C:\…, \\serwer\…, /Volumes/… — względna wylądowałaby obok programu, czyli na tym samym dysku.
    if (folder && !/^([A-Za-z]:[\\/]|\\\\|\/)/.test(folder)) bledy.push('Folder kopii: pełna ścieżka, np. E:\\GK-kopie albo folder OneDrive.');
    const mies = String(f.retencja_zdjec_mies === undefined || f.retencja_zdjec_mies === null ? '' : f.retencja_zdjec_mies).trim();
    if (mies && !(/^\d+$/.test(mies) && +mies >= 1 && +mies <= 120)) bledy.push('Przechowywanie zdjęć: liczba miesięcy 1–120 albo puste pole (bez kasowania).');
    return { bledy, dane: { kopia_folder: folder, retencja_zdjec_mies: mies ? String(+mies) : '' } };
  }

  /* Stan kopii po ludzku (GET /api/v1/admin/kopie) — kolor jak alarm huba: brak folderu, folder niedostępny,
     ostatnia udana starsza niż 26 h albo żadna z błędem = alarm. */
  function stanKopii(k, teraz) {
    k = k || {};
    const u = k.ustawienia || {}, s = k.stan || {};
    const kiedy = iso => kiedyKrotko(iso, teraz);
    let stan, kolor, opis;
    const wiekH = s.ostatnia_udana ? (teraz - Date.parse(s.ostatnia_udana)) / 3600000 : null;
    if (!u.kopia_folder) { stan = 'Nie ustawione'; kolor = 'alarm'; opis = 'Kopie leżą tylko na tym komputerze — padnięty dysk zabierze bazę razem z nimi. Wpisz folder niżej.'; }
    else if (s.trwa) { stan = 'Kopiuję…'; kolor = 'uwaga'; opis = 'Pierwsza kopia zdjęć może potrwać kilka minut.'; }
    else if (!s.folder_dostepny) { stan = 'Folder niedostępny'; kolor = 'alarm'; opis = `Nie ma folderu ${u.kopia_folder} — podłącz dysk zewnętrzny (albo sprawdź OneDrive/Dysk Google).`; }
    else if (wiekH === null) { stan = s.blad ? 'Błąd' : 'Czeka'; kolor = s.blad ? 'alarm' : 'uwaga'; opis = s.blad || 'Pierwsza kopia zrobi się sama w ciągu kilku minut (albo „Zrób kopię teraz”).'; }
    else if (wiekH > 26) { stan = 'Stara'; kolor = 'alarm'; opis = `Ostatnia udana ${kiedy(s.ostatnia_udana)}.${s.blad ? ' ' + s.blad : ''}`; }
    else { stan = 'Aktualna'; kolor = 'ok'; opis = `Ostatnia udana ${kiedy(s.ostatnia_udana)}${s.plik ? ` (${s.plik})` : ''}.${s.blad ? ' Ostatnia próba: ' + s.blad : ''}`; }
    const mb = b => `${Math.max(1, Math.round((b || 0) / 1048576))} MB`;
    return { stan, kolor, opis, kopie: (s.kopie || []).map(p => `${p.plik.replace(/^hala-|\.db$/g, '')} · ${mb(p.rozmiar)}`),
             lokalna: s.lokalna ? `Kopia na tym komputerze (co godzinę): ${kiedy(s.lokalna)}` : '' };
  }

  /* Gdzie w Administracji naprawia się alarm (UI etap 2): część (chip) i miejsce w niej. Dostęp z telefonów jest od
     teraz w „Serwis” — tekst z huba („Administracja → Dostęp z telefonów”) poprawiamy tutaj, bo te same zdania idą też
     w pushu, a hub i Panel mają mówić o tym samym miejscu. Miejsce na dysku i tunel bez odpowiedzi naprawia się poza
     Panelem — tunel prowadzi do stanu tunelu, miejsce nigdzie. */
  const GDZIE_ALARMU = {
    pages: { czesc: 'serwis', sekcja: 'dostep' }, tunel: { czesc: 'serwis', sekcja: 'dostep' },
    token: { czesc: 'ustawienia', sekcja: 'formularz-dostepu' }, kopia: { czesc: 'ustawienia', sekcja: 'formularz-kopii' },
  };
  const gdzieAlarmu = kod => GDZIE_ALARMU[kod] || (/^pages_/.test(String(kod || '')) ? GDZIE_ALARMU.pages : null);

  /* Alarmy huba dla administratora (GET /api/v1/admin/alarmy) → wstęga nad Administracją. Kolejność: najpierw to,
     co odcina telefony (adres huba, token), potem kopie i miejsce. gdzie — przycisk „Pokaż” przy alarmie. */
  function alarmyAdmina(lista) {
    const waga = { pages: 0, pages_trasy: 0, pages_flota: 0, token: 1, kopia: 2, miejsce: 3 };
    return (lista || []).slice().sort((a, b) => (waga[a.kod] ?? 9) - (waga[b.kod] ?? 9))
      .map(a => ({ kod: a.kod, tytul: a.tytul || 'Alarm',
                   opis: String(a.opis || '').replace(/Administracja → (📱 )?Dostęp z telefonów/g, 'Administracja → Serwis → Dostęp z telefonów'),
                   gdzie: gdzieAlarmu(a.kod) }));
  }

  /* Formularz „Tunel i GitHub” → { bledy, dane } dla POST /api/v1/admin/dostep. Puste pole tokenu = bez zmian
     (token nigdy nie wraca do przeglądarki). Te same reguły sprawdza hub. */
  function dostepZFormularza(f, ustawienia) {
    const bledy = [], u = ustawienia || {};
    const tryb = String(f.tunel_tryb || 'brak');
    if (!['brak', 'szybki', 'staly'].includes(tryb)) bledy.push('Wybierz tryb tunelu.');
    const dane = { tunel_tryb: tryb };
    const adres = String(f.tunel_adres || '').trim().replace(/\/+$/, '').toLowerCase();
    if (adres && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d{2,5})?$/.test(adres)) bledy.push('Adres tunelu stałego: https://nazwa.domena.pl (bez ścieżki).');
    dane.tunel_adres = adres;
    const tokenCf = String(f.tunel_token || '').trim();
    if (tryb === 'staly' && !adres) bledy.push('Tryb stały: wpisz adres tunelu nadany w panelu Cloudflare.');
    if (tryb === 'staly' && !tokenCf && (!u.tunel_token_ustawiony || f.usun_tunel_token)) bledy.push('Tryb stały: wklej token tunelu z panelu Cloudflare.');
    let repo = String(f.github_repo || '').trim().replace(/^https:\/\/github\.com\//i, '').replace(/^\/+|\/+$/g, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/.test(repo)) bledy.push('Repozytorium: właściciel/nazwa, np. milo252-gk/gk-panel-aplikacje.');
    dane.github_repo = repo;
    const tokenGh = String(f.github_token || '').trim();
    if (tokenGh && !/^[\x21-\x7e]{20,4000}$/.test(tokenGh)) bledy.push('Token GitHub wygląda na źle wklejony — skopiuj go jeszcze raz w całości.');
    if (tokenGh) dane.github_token = tokenGh;
    if (tokenCf) dane.tunel_token = tokenCf;
    const wyczysc = [];
    if (f.usun_github_token && !tokenGh) wyczysc.push('github_token');
    if (f.usun_tunel_token && !tokenCf) wyczysc.push('tunel_token');
    if (wyczysc.length) dane.wyczysc = wyczysc;
    return { bledy, dane };
  }

  const RE_KOD = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

  /* 2026-10-12 (właściciel): w Panelu wyznacza się tylko maszyny, nie linie. Lider, UR, awarie i obchody dalej
     liczą na linii, więc maszyny stoją na jednej linii-hali, której w Panelu nie widać. Wybór linii wraca dopiero,
     gdy słownik ma dwie albo więcej (starsze dane, zakład testowy). */
  const LINIA_HALI = { kod: 'HALA', nazwa: 'Hala' };
  const wieleLinii = slowniki => Object.keys((slowniki && slowniki.linie) || {}).length > 1;
  // Linia nowej maszyny bez wybranej linii: pierwsza ze słownika (kolejność), a bez żadnej — hala.
  function liniaDomyslna(slowniki) {
    const l = Object.entries((slowniki && slowniki.linie) || {})
      .sort(([, a], [, b]) => ((a || {}).kolejnosc || 999) - ((b || {}).kolejnosc || 999));
    return l.length ? l[0][0] : LINIA_HALI.kod;
  }

  /* Linia albo maszyna → { klucz, wartosc, nowaLinia? } dla slownik.zapisany. Kod to napis na etykiecie QR —
     przy istniejącej pozycji się go nie zmienia (etykiety już wiszą). nowaLinia — hala do zapisania przed pierwszą
     maszyną (słownik linii pusty). */
  function pozycjaZFormularza(rodzaj, f, slowniki, istniejacyKod) {
    const bledy = [];
    const kod = istniejacyKod || String(f.kod || '').trim().toUpperCase();
    // D51: w Panelu zakłada się tylko maszyny — przykłady kodów linii i stanowisk (L4, L1-S3) tylko myliły.
    if (!RE_KOD.test(kod)) bledy.push(rodzaj === 'maszyny' ? 'Kod: wielkie litery, cyfry i myślnik, np. FH6-1 albo WT-03.'
      : 'Kod: wielkie litery, cyfry i myślnik, np. L4, L1-S3 albo WT-03.');
    const sl = (slowniki && slowniki[rodzaj]) || {};
    const byl = istniejacyKod ? sl[kod] || {} : {};
    if (!istniejacyKod && sl[kod]) bledy.push(`Kod ${kod} już jest.`);
    const nazwa = String(f.nazwa || '').trim();
    if (!nazwa) bledy.push('Podaj nazwę.');
    // Kod QR zostaje, jaki był — mógł przyjść z naklejek zastanych w zakładzie (pole qr słownika, KONTRAKT §10).
    const qr = byl.qr || `HALA:${{ linie: 'L', stanowiska: 'S', maszyny: 'M' }[rodzaj]}:${kod}`;
    let wartosc, nowaLinia = null;
    if (rodzaj === 'linie') {
      const k = parseInt(f.kolejnosc, 10);
      wartosc = { nazwa, kolejnosc: isNaN(k) ? (byl.kolejnosc || Object.keys(sl).length + 1) : k, qr };
    } else {
      const linie = (slowniki && slowniki.linie) || {};
      // Maszyna bez wybranej linii (Panel jej nie pokazuje) zostaje na swojej, a nowa idzie na linię domyślną.
      const linia = f.linia || (rodzaj === 'maszyny' ? (linie[byl.linia] ? byl.linia : liniaDomyslna(slowniki)) : '');
      if (rodzaj === 'maszyny' && !f.linia && !linie[linia])
        nowaLinia = { klucz: linia, wartosc: { nazwa: LINIA_HALI.nazwa, kolejnosc: 1, qr: `HALA:L:${linia}` } };
      if (!linia || (!linie[linia] && !nowaLinia)) bledy.push(rodzaj === 'maszyny' ? 'Wybierz linię maszyny.' : 'Wybierz linię stanowiska.');
      wartosc = { nazwa, linia, qr };
      if (rodzaj === 'maszyny') {
        const typ = String(f.typ || '').trim().toLowerCase();
        if (typ) wartosc.typ = typ;
        const st = ((slowniki && slowniki.stanowiska) || {})[f.stanowisko];
        // stanowiskoZachowane: stanowisko przepisane ze słownika, którego od D51 nie ma w oknie maszyny. Gdy go już nie ma
        // albo maszyna przechodzi na inną linię — odpada po cichu; błąd o polu, którego nie widać, blokował zapis na zawsze.
        if (f.stanowisko && (!st || st.linia !== linia)) { if (!f.stanowiskoZachowane) bledy.push('Stanowisko musi być na tej samej linii co maszyna.'); }
        else if (f.stanowisko) wartosc.stanowisko = f.stanowisko;
      }
    }
    return { bledy, klucz: kod, wartosc, nowaLinia };
  }

  /* Godziny zmian → zapisy słownika zmiany/<nr>. Hub i tak odrzuci zły zapis godziny, ale człowiek ma
     dostać błąd przy polu, a nie „odrzucone” z huba. */
  function zmianyZFormularza(wiersze) {
    const bledy = [], wynik = [], nr = new Set();
    const hhmm = t => /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(String(t || '').trim());
    for (const w of wiersze || []) {
      const k = String(w.nr || '').trim();
      if (!/^[A-Za-z0-9]{1,4}$/.test(k)) { bledy.push(`Numer zmiany „${k}”: 1–4 litery lub cyfry, np. I, II, III.`); continue; }
      if (nr.has(k)) { bledy.push(`Zmiana ${k} jest dwa razy.`); continue; }
      nr.add(k);
      if (!hhmm(w.od) || !hhmm(w.do)) { bledy.push(`Zmiana ${k}: godziny jako HH:MM, np. 06:00 i 14:00.`); continue; }
      wynik.push({ nr: k, wartosc: { nazwa: String(w.nazwa || '').trim() || `Zmiana ${k}`, od: w.od.trim(), do: w.do.trim() } });
    }
    if (!wynik.length && !bledy.length) bledy.push('Zakład musi mieć co najmniej jedną zmianę.');
    if (!bledy.length) bledy.push(...pokrycieDoby(wynik));
    return { bledy, zmiany: wynik };
  }

  /* Zmiany mają razem pokryć dobę bez luk i bez nakładania (etap 3). Luka = zdarzenia bez zmiany (raporty, „ta zmiana”
     w Panelu, zadania zmianowe tracą swoją zmianę); nakładanie = Hala.zmianaDla bierze pierwszą pasującą i druga zmiana
     „znika” na część godzin. Minuty od północy; zmiana przez północ (22:00–06:00) to dwa kawałki. */
  function pokrycieDoby(zmiany) {
    const min = t => { const [g, m] = t.split(':').map(Number); return g * 60 + m; };
    const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const kawalki = [], bledy = [];
    for (const z of zmiany) {
      const od = min(z.wartosc.od) % 1440, d = min(z.wartosc.do);
      // „24:00” przy starcie o północy to cała doba; poza tym koniec ≤ początek = przez północ.
      const dlugosc = od === 0 && d === 1440 ? 1440 : ((d - od) % 1440 + 1440) % 1440;
      if (!dlugosc) { bledy.push(`Zmiana ${z.nr}: początek i koniec to ta sama godzina.`); continue; }
      if (od + dlugosc <= 1440) kawalki.push([od, od + dlugosc, z.nr]);
      else { kawalki.push([od, 1440, z.nr]); kawalki.push([0, od + dlugosc - 1440, z.nr]); }
    }
    if (bledy.length) return bledy;
    kawalki.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const luki = [];
    let koniec = 0, ostatnia = null;
    for (const [od, d, nr] of kawalki) {
      if (od > koniec) luki.push([koniec, od]);
      else if (od < koniec && nr !== ostatnia) bledy.push(`Zmiany ${ostatnia} i ${nr} nachodzą na siebie (${hhmm(od)}–${hhmm(Math.min(koniec, d))}). Popraw godziny.`);
      if (d > koniec) { koniec = d; ostatnia = nr; }
    }
    if (koniec < 1440) luki.push([koniec, 1440]);
    // Luka przez północ (22:00–24:00 i 00:00–06:00) to jedna luka 22:00–06:00.
    if (luki.length > 1 && luki[0][0] === 0 && luki[luki.length - 1][1] === 1440) luki[0] = [luki.pop()[0], luki[0][1]];
    for (const [a, b] of luki) bledy.push(`Luka ${hhmm(a)}–${hhmm(b)} — żadna zmiana jej nie obejmuje. Przesuń godziny albo dodaj zmianę.`);
    return bledy;
  }

  /* Numer zmiany, który znika ze słownika (zmiana nazwy „III” na „N”, usunięcie), a jest w szablonach checklist albo
     w zleceniach stałych — tam przestanie pasować (szablon i zadania tej zmiany po cichu przestaną działać). */
  function uzyciaZmian(slowniki, noweNumery) {
    const obecne = Object.keys((slowniki && slowniki.zmiany) || {});
    const znikaja = obecne.filter(nr => !(noweNumery || []).includes(nr));
    const wynik = [];
    for (const nr of znikaja) {
      const szablony = Object.entries((slowniki && slowniki.szablony_checklist) || {})
        .filter(([, s]) => ((s && s.zmiany) || []).includes(nr)).map(([k, s]) => s.nazwa || k);
      const stale = Object.entries((slowniki && slowniki.zlecenia_stale) || {})
        .filter(([, s]) => (((s && s.harmonogram) || {}).zmiany || []).includes(nr)).map(([k, s]) => s.tytul || k);
      if (szablony.length || stale.length)
        wynik.push(`Zmiana ${nr} znika, a używają jej: ${[...szablony.map(n => `szablon „${n}”`), ...stale.map(n => `zlecenie stałe „${n}”`)].join(', ')}.`);
    }
    return wynik;
  }

  /* Ustawienia — te same zakresy co ZAKRESY_USTAWIEN w hubie (hala.py; panel/testy/testuj.py pilnuje, że są równe).
     Puste pole albo liczba spoza zakresu = błąd przy polu, a nie „odrzucone” z huba po fakcie (etap 3). */
  const ZAKRESY_USTAWIEN = { prog_zolty_min: [0, 480], prog_brakow_proc: [0, 100], alarm_potwierdzenia_min: [1, 1440],
                             sesja_godz: [1, 72], sesja_ekran_dni: [1, 365] };
  function ustawieniaZFormularza(f, obecne) {
    const bledy = {}, zmiany = [];
    for (const [k, v] of Object.entries(f || {})) {
      let wartosc = String(v === undefined || v === null ? '' : v).trim();
      if (ZAKRESY_USTAWIEN[k]) {
        const [lo, hi] = ZAKRESY_USTAWIEN[k];
        const n = Number(wartosc.replace(',', '.'));
        if (wartosc === '') { bledy[k] = `Wpisz liczbę od ${lo} do ${hi}.`; continue; }
        if (!isFinite(n) || n < lo || n > hi) { bledy[k] = `Liczba od ${lo} do ${hi}.`; continue; }
        wartosc = n;
      }
      if ((((obecne || {})[k]) || {}).wartosc !== wartosc) zmiany.push([k, wartosc]);
    }
    return { bledy, zmiany };
  }

  /* Wynik zapisu, na który czekamy na przyjęcie przez hub (Panel.zapiszWHubie): „Zapisane.” dopiero, gdy hub przyjął. */
  function wynikZapisu(w) {
    if (!w || w.zmian === 0) return { klasa: 'ok', tekst: 'Nic się nie zmieniło.' };
    if ((w.odrzucone || []).length) return { klasa: 'blad', tekst: `Serwer nie przyjął: ${w.odrzucone.map(o => o.powod).join('; ')}` };
    if (w.czeka) return { klasa: 'uwaga', tekst: 'Czeka na wysłanie — zapisze się, gdy serwer odpowie (pasek u góry pokazuje kolejkę).' };
    return { klasa: 'ok', tekst: 'Zapisane.' };
  }

  // ------------------------------------------------------------ szablony checklist lidera (2026-09-28)

  /* Typy pozycji — tak je obsługuje Aplikacja Lidera (lider/web/zmiana.js). */
  const TYPY_POZYCJI = [
    ['obsada', 'Raport obsady'], ['obchod', 'Obchód linii (skan QR)'], ['bhp', 'Audyt BHP'],
    ['proba', 'Próba jakościowa'], ['zadanie', 'Zadanie'], ['przekazanie', 'Przekazanie zmiany'],
  ];

  /* „0:30” / „7:45” / „90” → minuty od startu zmiany (null = zły zapis). */
  function minutyZTekstu(t) {
    const s = String(t === undefined || t === null ? '' : t).trim();
    let m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (m && +m[2] < 60) return +m[1] * 60 + +m[2];
    m = /^\d{1,4}$/.exec(s);
    return m ? +s : null;
  }
  const tekstZMinut = min => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

  /* Godzina pozycji dla zmiany „HH:MM” (podgląd w edytorze): start zmiany + minuty. */
  function godzinaPozycji(odZmiany, min) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(odZmiany || '');
    if (!m || min === null) return '—';
    const t = (+m[1] * 60 + +m[2] + min) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }

  /* Dla kogo szablon: „Wszystkie linie · wszystkie zmiany”, „Linia 1 · Zmiana III”. */
  function zakresSzablonu(s, slowniki) {
    const linie = (s.linie || []).map(l => nazwaLinii(slowniki, l));
    const zmiany = (s.zmiany || []).map(z => (((slowniki || {}).zmiany || {})[z] || {}).nazwa || `Zmiana ${z}`);
    // D51: przy jednej linii Panel nie pokazuje linii nigdzie — „Wszystkie linie” mówiłoby o czymś, czego kierownik nie widzi.
    if (!wieleLinii(slowniki)) return zmiany.length ? zmiany.join(', ') : 'Wszystkie zmiany';
    return `${linie.length ? linie.join(', ') : 'Wszystkie linie'} · ${zmiany.length ? zmiany.join(', ') : 'wszystkie zmiany'}`;
  }

  function szablonyLista(slowniki) {
    return Object.entries((slowniki && slowniki.szablony_checklist) || {})
      .map(([kod, s]) => ({ kod, nazwa: s.nazwa || kod, zakres: zakresSzablonu(s, slowniki), pozycji: (s.pozycje || []).length,
                            ocena: ((s.linie || []).length ? 2 : 0) + ((s.zmiany || []).length ? 1 : 0) }))
      .sort((a, b) => a.ocena - b.ocena || a.nazwa.localeCompare(b.nazwa, 'pl'));
  }

  const kodZNazwy = (n, zajete) => {
    let k = loginZNazwy(n).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pozycja';
    const baza = k; let i = 2;
    while (zajete.includes(k)) k = `${baza}-${i++}`;
    return k;
  };

  /* Formularz edytora → { bledy, kod, wartosc } dla slownik.zapisany szablony_checklist/<kod>.
     f = { nazwa, linie[], zmiany[], pozycje: [{ id?, nazwa, typ, termin ('0:30'), cel? }] }.
     Id istniejących pozycji zostają (liderzy mają odhaczenia pod tym id), nowe biorą się z nazwy.
     Przekazanie zmiany ma zawsze id „przekazanie” — po nim Aplikacja Lidera je rozpoznaje. */
  function szablonZFormularza(f, slowniki, istniejacyKod) {
    const bledy = [];
    const nazwa = String(f.nazwa || '').trim();
    if (!nazwa) bledy.push('Podaj nazwę szablonu.');
    const linie = [].concat(f.linie || []).filter(Boolean).sort();
    const zmiany = [].concat(f.zmiany || []).filter(Boolean).sort();
    const inne = Object.entries((slowniki && slowniki.szablony_checklist) || {}).filter(([k]) => k !== istniejacyKod);
    const takiSam = inne.find(([, s]) => JSON.stringify([...(s.linie || [])].sort()) === JSON.stringify(linie)
                                         && JSON.stringify([...(s.zmiany || [])].sort()) === JSON.stringify(zmiany));
    if (takiSam) bledy.push(`Ten sam zakres (${zakresSzablonu({ linie, zmiany }, slowniki)}) ma już szablon „${takiSam[1].nazwa || takiSam[0]}” — zmień linie albo zmiany.`);
    const pozycje = [], zajete = [];
    let przekazan = 0;
    (f.pozycje || []).forEach((p, i) => {
      const n = String(p.nazwa || '').trim();
      if (!n) { bledy.push(`Pozycja ${i + 1}: podaj nazwę.`); return; }
      const min = minutyZTekstu(p.termin);
      if (min === null || min > 24 * 60) { bledy.push(`${n}: termin jako godziny:minuty od startu zmiany, np. 0:30 albo 7:45.`); return; }
      const typ = TYPY_POZYCJI.some(([k]) => k === p.typ) ? p.typ : 'zadanie';
      let id = typ === 'przekazanie' ? 'przekazanie' : (p.id && p.id !== 'przekazanie' ? p.id : kodZNazwy(n, zajete.concat(['przekazanie'])));
      if (typ === 'przekazanie' && ++przekazan > 1) { bledy.push('Przekazanie zmiany może być tylko jedno.'); return; }
      if (zajete.includes(id)) id = kodZNazwy(n, zajete);
      zajete.push(id);
      const poz = { id, nazwa: n, typ: typ === 'przekazanie' ? 'zadanie' : typ, termin_min: min };
      if (typ === 'obchod') poz.wymaga_qr = true;
      const cel = String(p.cel || '').trim().toUpperCase();
      if (cel && typ === 'obchod') poz.cel = cel;
      pozycje.push(poz);
    });
    if (!pozycje.length && !bledy.length) bledy.push('Dodaj co najmniej jedną pozycję.');
    pozycje.sort((a, b) => a.termin_min - b.termin_min);
    // Etap 3: termin po końcu najkrótszej zmiany z zakresu wypadałby na następnej zmianie (u innego lidera) — błąd.
    // W noc przejścia na czas letni zmiana obejmująca 02:00 trwa godzinę krócej — wtedy tylko ostrzegamy.
    const ostrzezenia = [];
    const dl = dlugosciZmian(slowniki, zmiany);
    if (dl.length && pozycje.length) {
      const najkrotsza = dl.reduce((a, b) => (b.min < a.min ? b : a));
      const ostatnia = pozycje[pozycje.length - 1];
      if (ostatnia.termin_min > najkrotsza.min)
        bledy.push(`${ostatnia.nazwa}: termin ${tekstZMinut(ostatnia.termin_min)} wypada po końcu zmiany ${najkrotsza.nr} (trwa ${tekstZMinut(najkrotsza.min)}). Skróć termin albo zawęź zmiany.`);
      else for (const z of dl.filter(x => x.przez2)) {
        const za = pozycje.filter(p => p.termin_min > z.min - 60);
        if (za.length) ostrzezenia.push(`W noc zmiany czasu na letni zmiana ${z.nr} trwa godzinę krócej (${tekstZMinut(z.min - 60)}) — ${za.map(p => `„${p.nazwa}”`).join(', ')} wypadnie wtedy po jej końcu.`);
      }
    }
    const kod = istniejacyKod || kodZNazwy(nazwa, inne.map(([k]) => k));
    return { bledy, ostrzezenia, kod, wartosc: { nazwa, linie, zmiany, pozycje } };
  }

  /* Długość zmian zakresu w zwykłej dobie (minuty) i czy zmiana obejmuje 02:00 (noc zmiany czasu). Puste = wszystkie. */
  function dlugosciZmian(slowniki, numery) {
    const zm = zmianySl(slowniki);
    const min = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
    return ((numery && numery.length) ? numery : Object.keys(zm)).filter(nr => zm[nr]).map(nr => {
      const od = min(zm[nr].od), d = min(zm[nr].do);
      if (od === null || d === null) return null;
      const dlugosc = ((d - od) % 1440 + 1440) % 1440 || 1440;
      const przez2 = ((120 - od) % 1440 + 1440) % 1440 < dlugosc;
      return { nr, min: dlugosc, przez2 };
    }).filter(Boolean);
  }

  /* Szablon ze słownika → wiersze edytora (termin jako „0:30”, przekazanie jako osobny typ). */
  function szablonDoFormularza(s) {
    return { nazwa: s.nazwa || '', linie: s.linie || [], zmiany: s.zmiany || [],
             pozycje: (s.pozycje || []).map(p => ({ id: p.id, nazwa: p.nazwa, typ: p.id === 'przekazanie' ? 'przekazanie' : (p.typ || 'zadanie'),
                                                    termin: tekstZMinut(p.termin_min || 0), cel: p.cel || '' })) };
  }

  // ------------------------------------------------------------ wskaźniki (2026-09-28, decyzja właściciela)

  /* Okres wskaźników: bieżąca zmiana, dziś albo wczoraj (doba ZAKŁADU, nie strefa monitora). */
  function oknoWskaznikow(rodzaj, teraz, zmiana) {
    if (rodzaj === 'zmiana') return zmiana ? { od: Date.parse(zmiana.od), do: Date.parse(zmiana.do), nazwa: zmiana.nazwa } : null;
    const l = H().lokalny(teraz);
    const polnoc = H().zLokalnego(l.rok, l.miesiac, l.dzien, 0, 0);
    const doba = 24 * 3600000;
    // Dodajemy 25 h i bierzemy północ tamtego dnia — przejście na czas letni/zimowy ma dobę 23 albo 25 h.
    const nastepna = (ms) => { const n = H().lokalny(ms + doba + 3600000); return H().zLokalnego(n.rok, n.miesiac, n.dzien, 0, 0); };
    if (rodzaj === 'wczoraj') {
      const w = H().lokalny(polnoc - 3600000);
      return { od: H().zLokalnego(w.rok, w.miesiac, w.dzien, 0, 0), do: polnoc, nazwa: 'Wczoraj' };
    }
    return { od: polnoc, do: nastepna(polnoc), nazwa: 'Dziś' };
  }

  /* Liczby dla kierownika — JEDNA funkcja liczenia: Hala.wskaznikiOkresu (awarie przez Hala.kpiAwarii, próby, zlecenia;
     bliźniak wskazniki_okresu w hubie — D37, D47: jedne liczby). Krótkie okresy liczy Panel z pamięci (2 doby), a „Zakres”
     — hub (GET /api/v1/panel/wskazniki) i podaje gotowe podsumowanie (`gotowe`) tej samej postaci. Tu tylko nazwy,
     procenty i kolejność do ekranu — tak samo dla obu źródeł. Definicje: wspolne/klient/miary.js (podpowiedzi „i”). */
  function wskazniki({ awarie: la, proby: lp, zlecenia: lz, slowniki, pracownicy, stale, teraz, okno, gotowe }) {
    const s = gotowe || H().wskaznikiOkresu({ awarie: la, proby: lp, zlecenia: lz },
                                           { od: okno.od, do: okno.do, teraz, zatrzymujace: [...kodyZatrzymujace(stale)] });
    const k = s.awarie;
    const zKpi = new Map(k.linie.map(l => [l.kod, l]));
    // Wszystkie linie ze słownika (także bez awarii — pusty pasek to też informacja), potem spoza słownika.
    const linie = liniePosortowane(slowniki).map(l => l.kod).concat(k.linie.map(l => l.kod).filter(kod => !((slowniki && slowniki.linie) || {})[kod]))
      .map(kod => { const x = zKpi.get(kod) || {};
        return { kod, nazwa: nazwaLinii(slowniki, kod), awarie: x.liczba || 0, zatrzymania: x.zatrzymania || 0,
                 przestojMs: x.przestojMs || 0, mttrMs: x.mttrMs === undefined ? null : x.mttrMs }; });
    // D51: przy jednej linii „Przestój na linię” to jeden pasek zawsze na 100 % — zamiast niego przestój na maszynę
    // (te same liczby z kpiAwarii → maszyny; tylko maszyny z awarią albo przestojem w okresie, najdłuższy przestój wyżej).
    const naMaszyne = !wieleLinii(slowniki);
    const slMaszyn = (slowniki && slowniki.maszyny) || {};
    const maszyny = (k.maszyny || []).map(x => ({ kod: x.kod, nazwa: (slMaszyn[x.kod] || {}).nazwa || x.kod, awarie: x.liczba || 0,
      zatrzymania: x.zatrzymania || 0, przestojMs: x.przestojMs || 0, mttrMs: x.mttrMs === undefined ? null : x.mttrMs }));
    // Pasek liczony z tego, co widać: „0 min” (20 s przestoju) to pusty pasek, a nie pełny obok samych zer.
    const minuty = ms => Math.max(0, Math.floor((ms || 0) / 60000));
    const zPaskiem = lista => { const maks = Math.max(0, ...lista.map(x => minuty(x.przestojMs)));
      return lista.map(x => Object.assign(x, { proc: maks ? Math.round(minuty(x.przestojMs) * 100 / maks) : 0 })); };
    zPaskiem(linie); zPaskiem(maszyny);

    const { liczba: proby, sprawdzone, braki } = s.proby;
    const katalog = (slowniki && slowniki.katalog_wad) || {};
    const sumaWad = s.proby.wady.reduce((suma, x) => suma + x.ile, 0);
    const pareto = s.proby.wady.slice(0, 5)
      .map(({ kod, ile }) => ({ kod, nazwa: (katalog[kod] || {}).nazwa || kod, ile, proc: sumaWad ? Math.round(ile * 100 / sumaWad) : 0 }));

    // Terminowość zleceń (D31) — reguły w Hala.wskaznikiOkresu; tu procent i kolejność (najgorsze najpierw).
    const dzialy = new Map(((stale && stale.dzialy) || []).map(d => [d.kod, d.nazwa]));
    const t = s.zlecenia.terminowosc;
    const zProcentem = (lista, nazwa) => lista.map(g => ({ kod: g.kod, nazwa: nazwa(g.kod), wTerminie: g.wTerminie, poTerminie: g.poTerminie,
                                                         proc: Math.round(g.wTerminie * 100 / (g.wTerminie + g.poTerminie)) }))
      .sort((a, b) => a.proc - b.proc || a.nazwa.localeCompare(b.nazwa, 'pl'));
    const razem = t.wTerminie + t.poTerminie;
    return {
      awarie: k.liczba, zatrzymania: k.zatrzymania, przestojMs: k.przestojMs, mttrMs: k.mttrMs, reakcjaMs: k.reakcjaMs, mtbfMs: k.mtbfMs,
      linie, maksPrzestojMs: Math.max(0, ...linie.map(x => x.przestojMs)), naMaszyne, maszyny,
      proby, sprawdzone, braki, brakiProc: sprawdzone ? Math.round(braki * 1000 / sprawdzone) / 10 : null, pareto,
      zlecenia: s.zlecenia.liczba, zleceniaWykonane: s.zlecenia.wykonane,
      terminowosc: { wTerminie: t.wTerminie, poTerminie: t.poTerminie, proc: razem ? Math.round(t.wTerminie * 100 / razem) : null,
                     dzialy: zProcentem(t.dzialy, kod => dzialy.get(kod) || kod),
                     osoby: zProcentem(t.osoby, kod => nazwaPracownika(pracownicy, kod)) },
    };
  }

  /* Okno „Zakres” (D47) — skąd liczby: z pamięci Panelu, gdy zakres zaczyna się najwcześniej wczoraj (tyle Panel trzyma:
     dni 2), inaczej z huba. Ten sam wynik, bo obie strony liczą tą samą regułą (Hala.wskaznikiOkresu ↔ wskazniki_okresu). */
  function zakresZPamieci(okno, teraz) {
    const wczoraj = oknoWskaznikow('wczoraj', teraz, null);
    return !!okno && okno.od >= wczoraj.od;
  }

  // ------------------------------------------------------------ licznik i alarm na monitorze

  /* Licznik przestoju „na żywo”: do godziny z sekundami (4:07), bo „0 min” przez pierwszą minutę
     wygląda na monitorze jak zawieszony. Od godziny — jak wszędzie w systemie (Hala.formatCzasu). */
  const licznik = ms => H().formatLicznika(ms);

  /* Co jest NOWE od poprzedniego rysowania: zatrzymanie (linii albo maszyny) albo alert jakości. Przy pierwszym
     rysowaniu (znane === null) niczego nie ogłaszamy — to, co już było, kierownik zobaczy na ekranie,
     a sygnał po każdym odświeżeniu strony przestałby cokolwiek znaczyć. */
  function noweAlarmy(znane, wierszeAwarii, incydentyLista) {
    const teraz = new Map();
    for (const w of wierszeAwarii || []) if (w.zatrzymuje) teraz.set('awaria|' + w.id, { rodzaj: 'zatrzymanie', id: w.id, opis: [w.maszynaNazwa, w.liniaNazwa].filter(Boolean).join(' · ') });
    for (const i of incydentyLista || []) if (i.rodzaj === 'alert') teraz.set('alert|' + i.id, { rodzaj: 'alert', id: i.id, opis: i.tytul });
    const nowe = znane ? Array.from(teraz).filter(([k]) => !znane.has(k)).map(([, v]) => v) : [];
    return { nowe, znane: new Set(teraz.keys()) };
  }

  // ------------------------------------------------------------ pasek połączenia (KONTRAKT §9)

  /* Treść paska: nic przy działającym strumieniu; „Odświeżanie co kilka sekund”, gdy sieć zatrzymuje strumień;
     przy braku połączenia od kiedy i — etap 3 — „N czeka na wysłanie” (zapisy kierownika w kolejce, KONTRAKT §9);
     „Odrzucone: N — dotknij” zawsze. ostatnio = ms ostatniego połączenia, laska = zaraz po starcie (łączy się). */
  function pasekPolaczenia({ zalogowany, polaczenie, kolejka, laska, ostatnio, teraz }) {
    const p = polaczenie || {}, k = kolejka || {};
    let klasa = 'ok', tekst = '';
    if (zalogowany && !p.strumien) {
      if (p.dociaganie && !p.blad) { klasa = 'kolejka'; tekst = 'Odświeżanie co kilka sekund — sieć nie przepuszcza zmian na żywo'; }
      else {
        klasa = p.online ? 'brak-huba' : 'offline';
        tekst = laska || !ostatnio ? 'Łączenie z serwerem…'
          : `Brak połączenia od ${dataKrotka(ostatnio) === dataKrotka(teraz) ? '' : dataKrotka(ostatnio) + ' '}${godzina(ostatnio)} — dane mogą być nieaktualne`;
        if (k.moje) tekst += ` · ${k.moje} czeka na wysłanie`;
      }
    }
    if (zalogowany && k.odrzucone) { klasa = 'odrzucone'; tekst = (tekst ? tekst + ' · ' : '') + `Odrzucone: ${k.odrzucone} — dotknij`; }
    return { klasa, tekst };
  }

  // ------------------------------------------------------------ Administracja: ponowne wczytanie po błędzie

  /* Czy część Administracji (pracownicy, Połączenia GK, dostęp z telefonów) wczytać teraz: nic jeszcze nie przyszło
     i nie było błędu — tak; był błąd (hub chwilowo nie odpowiadał) — ponów co PONOW_PO_BLEDZIE_MS. Wcześniej błąd
     wstrzymywał wczytywanie na zawsze: „Brak połączenia z hubem” wisiało do przeładowania strony, choć hub już
     dawno działał, a przycisku „Odśwież” nie było (rysuje się dopiero po udanym wczytaniu; przegląd 2026-10-06). */
  const PONOW_PO_BLEDZIE_MS = 15000;
  function wczytacPonownie(blad, czasBledu, teraz) {
    return !blad || teraz - (czasBledu || 0) >= PONOW_PO_BLEDZIE_MS;
  }

  // ------------------------------------------------------------ jedno wysłanie naraz

  /* Formularz wysyłany raz (przegląd 2026-10-06): drugie dotknięcie „Wyślij”, zanim pierwszy zapis skończy się w telefonie
     (zdjęcie się zmniejsza, IndexedDB zapisuje), dawało DRUGIE zdarzenie — dwie awarie tej samej maszyny (dwa liczniki
     przestoju, mechanik jedzie dwa razy), dwie próby, dwa zlecenia. UR i KJ mają to od dawna (W.raz). preventDefault
     zawsze od razu — także dla dotknięcia, które zignorujemy (inaczej przeglądarka wysłałaby formularz sama). */
  function raz(fn) {
    let trwa = false;
    return async function (...argumenty) {
      if (trwa) return undefined;
      trwa = true;
      try { return await fn.apply(this, argumenty); } finally { trwa = false; }
    };
  }
  function przyWysylce(fn) {
    const r = raz(fn);
    return function (ev) {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      return r.call(this, ev);
    };
  }

  // ------------------------------------------------------------ puste ekrany i błędy (przegląd 2026-10-12)

  /* Bez maszyn nie da się zgłosić awarii (okno „Zgłoś awarię” nie ma czego wybrać) — mówimy, gdzie je dodać. null = są.
     Od D51 w Panelu zakłada się tylko maszyny; pierwsza zakłada też linię „Hala”. */
  function brakMaszyn(slowniki) {
    return Object.keys((slowniki && slowniki.maszyny) || {}).length ? null : 'Brak maszyn — dodaj je: Administracja → Maszyny.';
  }

  /* Napis zamiast kafelków obchodów. Obchody są puste także poza godzinami zmian (zmiana = null) — wtedy „brak linii”
     wprowadzał w błąd, a „Dodaj je w administracji” od D51 nie ma gdzie zrobić (linii w Panelu się nie zakłada). */
  function pustyObchod(slowniki, zmiana) {
    if (!zmiana) return 'Teraz nie trwa żadna zmiana.';
    return brakMaszyn(slowniki) || 'Brak linii w słowniku.';
  }

  /* Błąd → zdanie dla kierownika. fetch bez sieci rzuca TypeError (angielski tekst przeglądarki), przerwane zapytanie
     AbortError — to brak połączenia. Zwykły Error bez kodu HTTP to błąd z telefonu z polskim tekstem (np. hala.zapisz:
     brak wymaganego zdjęcia) — wcześniej też wychodził jako „Brak połączenia z hubem”, choć sieć była w porządku. */
  function tekstBledu(e) {
    const polaczenie = 'Brak połączenia z serwerem. Sprawdź sieć i spróbuj jeszcze raz.';
    if (!e || e instanceof TypeError) return polaczenie;
    if (!e.kod) return e.name === 'Error' && e.message ? e.message : polaczenie;
    if (e.ustawione) return e.message;               // D43: hasło i PIN ustawione, ale rola nie otwiera Panelu
    if (e.kod === 403 && e.powod) return e.message;  // np. stara_wersja — tekst huba mówi, co zrobić
    if (e.kod === 403) return 'To konto nie ma dostępu do Panelu. Zaloguj się kontem kierownika albo ekranu.';
    if (e.kod === 429) return e.message || 'Za dużo prób. Odczekaj 5 minut i spróbuj ponownie.';
    return e.message;
  }

  // ------------------------------------------------------------ pasek zmiany

  function opisBiezacejZmiany(zmiana, teraz) {
    if (!zmiana) return null;
    return { id: zmiana.id, nazwa: zmiana.nazwa, od: godzina(zmiana.od), do: godzina(zmiana.do),
             zostaloMs: Math.max(0, Date.parse(zmiana.do) - teraz) };
  }

  // ------------------------------------------------------------ UI etap 3 (2026-10-12, ocena właściciela)

  /* Liczba z ułamkiem po polsku: 3.6 → „3,6” (Wskaźniki, raporty zmian). Kropka w „3.6 %” to zapis angielski. */
  const procent = n => (n === null || n === undefined ? '—' : String(n).replace('.', ','));

  /* Części Administracji dla tej osoby, w kolejności chipów. Checklisty (szablony obchodów lidera) zeszły z górnego menu
     do Administracji — zmienia się je raz na kilka tygodni, a w menu zabierały miejsce codziennym pozycjom.
     admin — wszystko; zespol (D49: kierownik zakładu / UR / KJ) — Pracownicy; szablony (kontrakt: zapis
     szablony_checklist) — Checklisty. */
  function czesciAdministracji({ admin, zespol, szablony } = {}) {
    const c = [];
    if (admin || zespol) c.push('pracownicy');
    if (admin) c.push('maszyny', 'ustawienia');
    if (admin || szablony) c.push('checklisty');
    if (admin) c.push('serwis');
    return c;
  }
  /* Część do pokazania: wybrana, jeśli wolno, inaczej pierwsza dostępna (kierownik bez Pracowników — od razu Checklisty). */
  const czescAdministracji = (chciana, dostepne) => ((dostepne || []).includes(chciana) ? chciana : ((dostepne || [])[0] || 'pracownicy'));

  const PanelWidok = { procent, czesciAdministracji, czescAdministracji, obchody, awarie, incydenty, raporty, zmianyBezRaportu, pasekPolaczenia, autorNieZleca, staleAutora, ostrzezenieAutora,
                       pokrycieDoby, uzyciaZmian, ZAKRESY_USTAWIEN, ustawieniaZFormularza, wynikZapisu, dlugosciZmian, opisBiezacejZmiany, godzina, dataKrotka, opisZmiany, licznik, noweAlarmy,
                       zlecenia, kafelki, DNI_NAZWY, dniPoLudzku, harmonogramPoLudzku, nastepneWystapienie, zleceniaStale, stalyZFormularza, ZESTAW_STARTOWY, brakujaceZestawu, LINIA_KAZDA,
                       stalyDoFormularza, stalyZZlecenia, terminTeraz, wczytacPonownie, raz, przyWysylce, PONOW_PO_BLEDZIE_MS, zlecenieZeStalego, poleCzasu, loginZNazwy, pracownicyAdmin, pracownikZFormularza, stanHasla, bladHasla, pozycjaZFormularza, LINIA_HALI, wieleLinii, liniaDomyslna, grupyRol, biuroTransportu, polaczenieGK, programyNaPages, dostepZTelefonow, logowanieZInternetu, dostepZFormularza, kopieZFormularza, stanKopii, alarmyAdmina, chipyZlecen, wiecejOpcjiZlecenia,
                       zmianyZFormularza, oknoWskaznikow, wskazniki, zakresZPamieci, planZFormularza, terminPoZFormularza, terminAktywacji, opisTerminuPlanu, dataDluga, startPierwszejZmiany, TYPY_POZYCJI, minutyZTekstu, godzinaPozycji, zakresSzablonu, szablonyLista, szablonZFormularza, szablonDoFormularza,
                       brakMaszyn, pustyObchod, tekstBledu, kafelkiDoPokazania, nazwaPriorytetu, priorytetyDoWyboru, MASZYNA_STOI };
  global.PanelWidok = PanelWidok;
  if (typeof module !== 'undefined' && module.exports) module.exports = PanelWidok;
})(typeof window !== 'undefined' ? window : globalThis);
