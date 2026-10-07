/* Aplikacja Lidera — co pokazać (bez rysowania).

   Czyste funkcje: dostają obiekty stanu (hala.obiekty…), słowniki i „teraz”,
   a oddają gotowe wiersze, błędy formularzy albo raport. Nie dotykają DOM ani
   sieci, więc lider/testy/widok-testy.js liczy je w Node / JavaScriptCore
   dokładnie tak, jak liczy je telefon.

   Reguły wspólne z innymi aplikacjami (kolor checklisty, przestój, zmiany, czas
   zakładu, odczyt kodu) bierzemy WYŁĄCZNIE z Hala.* — kierownik porównuje pasek
   w telefonie lidera z kafelkiem na Panelu i muszą mówić to samo.              */

(function (global) {
  'use strict';

  const H = () => global.Hala;
  const MIN = 60000;
  const ms = chwila => (typeof chwila === 'number' ? chwila : Date.parse(chwila));

  // ------------------------------------------------------------ drobiazgi

  function godzina(chwila) {
    if (chwila === null || chwila === undefined || chwila === '') return '—';
    const t = ms(chwila);
    if (isNaN(t)) return '—';
    const l = H().lokalny(t);
    return `${String(l.godz).padStart(2, '0')}:${String(l.min).padStart(2, '0')}`;
  }

  function dataKrotka(chwila) {
    const t = ms(chwila);
    if (isNaN(t)) return '—';
    const l = H().lokalny(t);
    return `${String(l.dzien).padStart(2, '0')}.${String(l.miesiac).padStart(2, '0')}`;
  }

  /* „2026-09-25/III” → „25.09 · Zmiana III”. */
  function opisZmiany(idZmiany, slowniki) {
    const m = /^(\d{4})-(\d{2})-(\d{2})\/(.+)$/.exec(idZmiany || '');
    if (!m) return idZmiany || '—';
    const z = ((slowniki || {}).zmiany || {})[m[4]];
    return `${m[3]}.${m[2]} · ${(z && z.nazwa) || 'Zmiana ' + m[4]}`;
  }

  /* Polska odmiana po liczebniku: 1 osoba, 2 osoby, 5 osób, 22 osoby, 12 osób. */
  function liczebnik(n, jeden, kilka, wiele) {
    const d = Math.abs(n) % 100, j = Math.abs(n) % 10;
    const slowo = n === 1 ? jeden : (j >= 2 && j <= 4 && !(d >= 12 && d <= 14)) ? kilka : wiele;
    return `${n} ${slowo}`;
  }

  const nazwaPracownika = (pracownicy, id) => {
    if (!id) return null;
    const p = (pracownicy || []).find(x => x.id === id);
    return p ? p.nazwa : id;
  };

  const nazwaLinii = (slowniki, kod) => (((slowniki || {}).linie || {})[kod] || {}).nazwa || kod || '—';

  function liniePosortowane(slowniki, najpierw) {
    const moje = najpierw || [];
    return Object.entries((slowniki && slowniki.linie) || {})
      .sort(([ka, a], [kb, b]) => (moje.includes(kb) - moje.includes(ka)) ||
        ((a && a.kolejnosc) || 999) - ((b && b.kolejnosc) || 999) || ka.localeCompare(kb))
      .map(([kod, w]) => ({ kod, nazwa: (w && w.nazwa) || kod, moja: moje.includes(kod) }));
  }

  /* Linie mistrza (decyzja właściciela 2026-10-07, D34): mistrz z liniami zaznaczonymi w Panelu → Administracja widzi
     w GK Lider TYLKO te linie — wybór linii, a za wybraną linią obchody (checklista), awarie i jakość — i tylko zlecenia
     tych linii (albo bez linii). Bez zaznaczenia — wszystkie (null), jak dotąd. Lider i każdy inny → null: lider wybiera
     dowolną linię (przesunięcie) jak dotąd. Push hub kieruje tą samą regułą (na_linii w hala.py). Linie spoza słownika
     (usunięte) się nie liczą. */
  function linieMistrza(pracownik, slowniki) {
    const role = (pracownik && pracownik.role) || [];
    if (!role.includes('mistrz')) return null;
    const sl = slowniki && slowniki.linie;
    const linie = ((pracownik && pracownik.linie) || []).filter(l => !sl || sl[l]);
    return linie.length ? linie : null;
  }

  const liniaWidoczna = (slowniki, pracownik, linia) => {
    const lm = linieMistrza(pracownik, slowniki);
    return !lm || lm.includes(linia);
  };

  /* Lista „Na której linii pracujesz?”: moje pierwsze; mistrz z liniami — tylko one; mistrz bez linii — wszystkie jako
     jego (bez dopisku „przesunięcie”: cały zakład to jego teren). */
  function linieDoWyboru(slowniki, pracownik) {
    const lm = linieMistrza(pracownik, slowniki);
    const role = (pracownik && pracownik.role) || [];
    const lista = liniePosortowane(slowniki, (pracownik && pracownik.linie) || []).filter(l => !lm || lm.includes(l.kod));
    return role.includes('mistrz') && !lm ? lista.map(l => Object.assign(l, { moja: true })) : lista;
  }

  /* Czyje zlecenia pokazuje aplikacja (D34): mistrz — dział „mistrz”, bez zawężenia do wybranej linii (przełożony
     liderów), ale tylko swoich linii, gdy ma je zaznaczone (`linie`, 2026-10-07); lider i każdy inny — „produkcja”
     na wybranej linii. Osoba z obiema rolami jest mistrzem: jego zadań nikt inny nie zrobi, a zlecenia linii mają
     swojego lidera. */
  function dzialZlecen(pracownik, linia, slowniki) {
    const role = (pracownik && pracownik.role) || [];
    if (!role.includes('mistrz')) return { dzial: 'produkcja', linia };
    const lm = linieMistrza(pracownik, slowniki);
    return lm ? { dzial: 'mistrz', linie: lm } : { dzial: 'mistrz' };
  }

  /* Linia na starcie: zapamiętana (przesunięcie), inaczej pierwsza z przypisanych, inaczej pierwsza w zakładzie.
     Mistrz z liniami: zapamiętana spoza nich się nie liczy (np. zostało z czasu, gdy jeszcze nie miał linii). */
  function liniaStartowa(slowniki, pracownik, zapamietana) {
    const linie = (slowniki && slowniki.linie) || {};
    if (zapamietana && linie[zapamietana] && liniaWidoczna(slowniki, pracownik, zapamietana)) return zapamietana;
    const moje = ((pracownik && pracownik.linie) || []).filter(l => linie[l]);
    if (moje.length) return moje[0];
    const wszystkie = liniePosortowane(slowniki);
    return wszystkie.length ? wszystkie[0].kod : null;
  }

  const wpisySlownika = (slowniki, nazwa, linia) =>
    Object.entries(((slowniki || {})[nazwa]) || {})
      .filter(([, w]) => w && (!linia || w.linia === linia))
      .map(([kod, w]) => Object.assign({ kod }, w))
      .sort((a, b) => ((a.kolejnosc || 999) - (b.kolejnosc || 999)) || String(a.kod).localeCompare(String(b.kod), 'pl'));   // L1-S1, L1-S2… jak na hali

  const maszynyLinii = (slowniki, linia) => wpisySlownika(slowniki, 'maszyny', linia);
  const stanowiskaLinii = (slowniki, linia) => wpisySlownika(slowniki, 'stanowiska', linia);
  const wyrobyLinii = (slowniki, linia) => wpisySlownika(slowniki, 'wyroby', linia);
  const katalogWad = slowniki => wpisySlownika(slowniki, 'katalog_wad');

  // ------------------------------------------------------------ zmiany

  const kluczZmiany = (linia, zmiana) => `${linia}/${typeof zmiana === 'string' ? zmiana : zmiana.id}`;

  /* Zmiana tuż przed podaną — minuta przed jej początkiem. Tak samo liczy hub i hala.js,
     więc zmiana III przez północ i noc zmiany czasu wychodzą same, bez arytmetyki dat. */
  function poprzedniaZmiana(zmiana, zmiany) {
    if (!zmiana || !zmiana.od) return null;
    return H().zmianaDla(ms(zmiana.od) - MIN, zmiany);
  }

  /* Pełny opis zmiany o danym id (od–do). Szukamy chwili w dniu jej początku, dla której
     Hala.zmianaDla zwraca to id — bez własnego czytania godzin (słownik bywa pusty, wtedy
     hala.js bierze godziny domyślne) i bez własnej arytmetyki dat.                          */
  function zmianaPoId(id, zmiany) {
    const m = /^(\d{4})-(\d{2})-(\d{2})\/(.+)$/.exec(id || '');
    if (!m) return null;
    const polnoc = H().zLokalnego(+m[1], +m[2], +m[3], 0, 0);
    // 27 h, nie 24: doba zmiany czasu ma 25 h (25.10.2026 — 24 h od północy to dopiero 23:00, a zmiana od 22:45 przepadała
    // i formularz szedł do bieżącej zmiany), a zmiana zaczęta po 23:30 widać dopiero po północy (przegląd 2026-10-06).
    // Nadmiar nic nie psuje — liczy się tylko zmiana o tym id.
    for (let i = 0; i < 54; i++) {
      const z = H().zmianaDla(polnoc + i * 30 * MIN, zmiany);
      if (z && z.id === id) return z;
    }
    return null;
  }

  /* Zmiany na tej linii bez raportu, które jeszcze można zamknąć (ekran „Koniec”): otwarte (z migawką pozycji), skończone
     najwyżej RAPORT_ZALEGLY_MS temu; najnowsze na górze. Wysłać może KAŻDY z rolą z reguły zmiana.raport (lider tej linii,
     mistrz, kierownik; admin) — nie tylko ten, kto zmianę otworzył, i nie tylko na następnej zmianie: lider poszedł do domu,
     telefon padł, przyszedł dzień wolny, a kierownik ma dostać raport (recenzja 2026-10-05). Wcześniej warunek
     `lider === ja` i tylko poprzednia zmiana — raport przepadał. Po 24 h zmianę widać już tylko na Panelu („bez raportu”). */
  const RAPORT_ZALEGLY_MS = 24 * 60 * MIN;
  function zalegleRaporty(zmianyLinii, { linia, teraz, zmiany, pracownik, kontrakt }) {
    const role = (pracownik && pracownik.role) || [];
    const spec = kontrakt && kontrakt.zdarzenia && kontrakt.zdarzenia['zmiana.raport'];
    if (!spec || !role.some(r => r === 'admin' || (spec.role || []).includes(r))) return [];
    return (zmianyLinii || [])
      .filter(z => z && z.status === 'otwarta' && z.linia === linia && (((z.dane || {}).pozycje) || []).length)
      .map(zl => ({ zl, zmiana: zmianaPoId((zl.dane || {}).zmiana, zmiany) }))
      .filter(x => x.zmiana && ms(x.zmiana.do) <= teraz && teraz - ms(x.zmiana.do) <= RAPORT_ZALEGLY_MS)
      .sort((a, b) => ms(b.zmiana.od) - ms(a.zmiana.od));
  }

  /* Granica zmiany (etap 1, recenzja 2026-10-02): do której zmiany i linii idzie formularz, ustalamy RAZ — przy
     otwarciu — i trzymamy w parametrach okna (brudnopis, przeżywa przeładowanie karty). Wysyłka bierze tylko to.
     Inaczej raport zaczęty 13:55 i wysłany 14:01 trafiłby do zmiany II, a obsada spisana na koniec zmiany — do
     następnego lidera. parametry.zmianaId / .linia już ustalone (okno wstało po przeładowaniu, raport poprzedniej
     zmiany z ekranu „Koniec”) wygrywają; puste = bieżąca zmiana i linia w chwili otwarcia.                    */
  function kontekstFormularza(parametry, zmianaTeraz, liniaTeraz) {
    const p = parametry || {};
    return { zmianaId: p.zmianaId || (zmianaTeraz && zmianaTeraz.id) || '', linia: p.linia || liniaTeraz || '' };
  }

  /* Klucz brudnopisu próby jakościowej — z ZMIANĄ (przegląd 2026-10-06). Id pozycji checklisty powtarzają się co zmianę,
     a „start” i QR to tylko wartości domyślne: brudnopis porzucony wczoraj (okno zamknięte ✕) wstawał dziś przy tej samej
     pozycji z wczorajszym czasem rozpoczęcia i wczorajszym skanem — KJ liczyła taką próbę do złej zmiany. */
  function kluczBrudnopisuProby(linia, zmianaId, pozycja) {
    return `proba:${linia}:${zmianaId || '-'}:${pozycja || 'dodatkowa'}`;
  }

  /* Czy zmiana na linii ma pozycję o tym id — odhaczamy tylko pozycje TEJ zmiany (migawka z jej otwarcia). */
  function pozycjaZmiany(zmianaLinii, id) {
    return !!id && (((zmianaLinii && zmianaLinii.dane) || {}).pozycje || []).some(p => p && p.id === id);
  }

  // ------------------------------------------------------------ checklista

  /* Wiersze checklisty + podsumowanie. Kolor i liczby WYŁĄCZNIE z Hala.kolorChecklisty. */
  function checklista(zmianaLinii, teraz, prog) {
    const k = H().kolorChecklisty(zmianaLinii, teraz, prog);
    const d = (zmianaLinii && zmianaLinii.dane) || {};
    const wyk = d.wykonane || {}, pom = d.pominiete || {};
    const opoz = new Set(k.opoznione.map(p => p.id)), blis = new Set(k.bliskie.map(p => p.id));
    const wiersze = (d.pozycje || []).map(p => {
      const stan = wyk[p.id] ? 'wykonana' : pom[p.id] ? 'pominieta' : opoz.has(p.id) ? 'opozniona' : blis.has(p.id) ? 'bliska' : 'czeka';
      const wpis = wyk[p.id] || pom[p.id] || null;
      return { id: p.id, nazwa: p.nazwa, typ: p.typ || 'zadanie', wymaga_qr: !!p.wymaga_qr, cel: p.cel || null,
               termin: p.termin, godz: godzina(p.termin), stan, wpis,
               poTerminie: stan === 'wykonana' && wpis && wpis.czas && ms(wpis.czas) > ms(p.termin),
               zaMin: stan === 'czeka' || stan === 'bliska' ? Math.round((ms(p.termin) - teraz) / MIN) : null };
    }).sort((a, b) => ms(a.termin) - ms(b.termin));
    return {
      kolor: k.kolor, zrobione: k.zrobione, wszystkie: k.wszystkie,
      proc: k.wszystkie ? Math.round(k.zrobione * 100 / k.wszystkie) : 0,
      najblizsza: k.najblizsza ? { id: k.najblizsza.id, nazwa: k.najblizsza.nazwa, godz: godzina(k.najblizsza.termin),
                                   zaMin: Math.round((ms(k.najblizsza.termin) - teraz) / MIN) } : null,
      opoznione: k.opoznione.length, bliskie: k.bliskie.map(p => p.id),
      wiersze,
    };
  }

  /* Czy zeskanowany kod potwierdza obecność na tej linii / przy tym celu pozycji.
     odczyt = Hala.odczytajKod(tekst, slowniki).                                  */
  function kodDlaLinii(odczyt, linia, cel) {
    if (!odczyt || !odczyt.rodzaj || odczyt.rodzaj === 'pracownik') {
      return { ok: false, powod: 'Nieznany kod. Zeskanuj naklejkę HALA na stanowisku albo maszynie.' };
    }
    if (cel) {
      if (odczyt.kod === cel) return { ok: true };
      return { ok: false, powod: `To nie ten punkt obchodu. Zeskanuj kod: ${cel}.` };
    }
    const liniaKodu = odczyt.rodzaj === 'linie' ? odczyt.kod : (odczyt.wpis && odczyt.wpis.linia) || null;
    if (!liniaKodu) return { ok: false, powod: 'Tego kodu nie ma w słowniku. Zeskanuj inną naklejkę albo zgłoś to administratorowi.' };
    if (liniaKodu !== linia) return { ok: false, powod: `Ten kod jest z linii ${liniaKodu}. Zeskanuj kod na linii ${linia}.` };
    return { ok: true };
  }

  /* Pozycje, o których trzeba przypomnieć (żółte), a jeszcze nie przypomniano. */
  function doPrzypomnienia(wynikChecklisty, przypomniane) {
    const juz = przypomniane || new Set();
    return wynikChecklisty.wiersze.filter(w => w.stan === 'bliska' && !juz.has(w.id));
  }

  // ------------------------------------------------------------ awarie

  const KOLEJNOSC_STATUSOW = { oczekuje_potwierdzenia: 0, zgloszona: 1, przyjeta: 2, w_trakcie: 3, wstrzymana: 4 };

  /* Awarie linii (albo zgłoszone przeze mnie na innej linii) — gotowe do narysowania. */
  function awarie(lista, o) {
    const stale = o.stale || {};
    const prio = {};
    for (const p of stale.priorytety || []) prio[p.kod] = p;
    const powody = {};
    for (const p of stale.powody_wstrzymania || []) powody[p.kod] = p.nazwa;
    return (lista || [])
      .filter(a => a.linia === o.linia || (o.ja && a.dane && a.dane.zglosil === o.ja))
      .map(a => {
        const d = a.dane || {};
        const p = prio[d.priorytet] || {};
        const m = ((o.slowniki || {}).maszyny || {})[d.maszyna];
        return {
          id: a.id, numer: a.numer || '—', status: a.status, etykieta: a.etykieta || a.status, aktywny: a.aktywny,
          maszyna: d.maszyna, maszynaNazwa: (m && m.nazwa) || d.maszyna || '—', linia: a.linia,
          opis: d.opis || '', priorytet: d.priorytet, priorytetNazwa: p.nazwa || d.priorytet || '—', zatrzymuje: !!p.zatrzymuje,
          mechanik: nazwaPracownika(o.pracownicy, d.mechanik),
          powodWstrzymania: d.powod_wstrzymania ? (powody[d.powod_wstrzymania] || d.powod_wstrzymania) : null,
          opisNaprawy: d.opis_naprawy || null,
          czasZgloszenia: d.czas_zgloszenia, godzZgloszenia: godzina(d.czas_zgloszenia),
          przestojMs: H().przestojMs(a, o.teraz),
          doPotwierdzenia: a.status === 'oczekuje_potwierdzenia',
          mozeAnulowac: a.status === 'zgloszona' || a.status === 'przyjeta',
          czeka: !!a._oczekuje,
          odrzucenia: (d.odrzucenia || []).length,
        };
      })
      .sort((x, y) => (x.aktywny === y.aktywny ? 0 : x.aktywny ? -1 : 1) ||
        ((KOLEJNOSC_STATUSOW[x.status] ?? 9) - (KOLEJNOSC_STATUSOW[y.status] ?? 9)) ||
        (y.zatrzymuje - x.zatrzymuje) || String(x.czasZgloszenia).localeCompare(String(y.czasZgloszenia)));
  }

  /* Aktywna awaria tej maszyny (najstarsza) — przy zgłoszeniu pytamy, czy dopisać się do niej, czy zgłosić nową (etap 3).
     Dwa zgłoszenia tej samej przerwy dublowały przestój i liczbę awarii, a mechanik jechał dwa razy. */
  function aktywnaAwariaMaszyny(lista, maszyna) {
    if (!maszyna) return null;
    return (lista || []).filter(a => a && a.aktywny && (a.dane || {}).maszyna === maszyna)
      .sort((a, b) => String((a.dane || {}).czas_zgloszenia).localeCompare(String((b.dane || {}).czas_zgloszenia)))[0] || null;
  }

  function pytanieODuplikat(a) {
    const kto = a.numer ? `#${a.numer}` : `zgłoszona ${godzina((a.dane || {}).czas_zgloszenia)}`;
    return `Ta maszyna ma już zgłoszoną awarię (${kto}${a.etykieta ? ', ' + a.etykieta.toLowerCase() : ''}) — dopisać się do niej czy zgłosić nową?`;
  }

  /* Błędy formularza awarii — pokazywane przed zapisem, żeby hub nie odrzucił zgłoszenia. */
  function sprawdzAwarie(f, stale) {
    const bledy = [];
    if (!f.maszyna) bledy.push('Wybierz maszynę.');
    if (!(stale && (stale.priorytety || []).some(p => p.kod === f.priorytet))) bledy.push('Wybierz priorytet.');
    if (!String(f.opis || '').trim()) bledy.push('Opisz krótko problem.');
    return bledy;
  }

  // ------------------------------------------------------------ jakość

  const dotyczyLinii = (alert, linia) => {
    const l = (alert.dane && alert.dane.linie) || [];
    return !l.length || l.includes(linia);
  };

  /* Alerty, które blokują ekran lidera: aktywne, dla mojej linii, jeszcze niepotwierdzone przez moją linię.
     Najstarszy pierwszy — potwierdza się je po kolei. Etap 3: alert po dacie „ważny do” jest jak wycofany
     (Hala.alertAktywny) — nie blokuje ekranu nocnej zmiany, która przyszła już po jego ważności.          */
  function alertyDoPotwierdzenia(alerty, linia, teraz) {
    const t = teraz === undefined ? Date.now() : teraz;
    return (alerty || [])
      .filter(a => H().alertAktywny(a, t) && dotyczyLinii(a, linia) && !((a.dane && a.dane.potwierdzenia) || {})[linia])
      .sort((a, b) => String((a.dane || {}).czas_publikacji || a.utworzono).localeCompare(String((b.dane || {}).czas_publikacji || b.utworzono)));
  }

  function alertyLinii(alerty, linia, teraz) {
    const t = teraz === undefined ? Date.now() : teraz;
    return (alerty || []).filter(a => dotyczyLinii(a, linia))
      .map(a => ({ id: a.id, numer: a.numer || '—', tytul: (a.dane || {}).tytul || '—', aktywny: H().alertAktywny(a, t),
                   wygasl: a.status === 'aktywny' && !H().alertAktywny(a, t),
                   potwierdzony: !!(((a.dane || {}).potwierdzenia || {})[linia]),
                   potwierdzenie: (((a.dane || {}).potwierdzenia || {})[linia]) || null,
                   czas: (a.dane || {}).czas_publikacji || a.utworzono }))
      .sort((a, b) => (a.potwierdzony - b.potwierdzony) || (b.aktywny - a.aktywny) || String(b.czas).localeCompare(String(a.czas)));
  }

  function proby(lista, linia, zrodlo, slowniki) {
    const wady = (slowniki && slowniki.katalog_wad) || {};
    return (lista || []).filter(p => p.linia === linia && (!zrodlo || (p.dane || {}).zrodlo === zrodlo))
      .map(p => {
        const d = p.dane || {};
        return { id: p.id, czas: p.utworzono, godz: godzina(p.utworzono), dzien: dataKrotka(p.utworzono),
                 stanowisko: (((slowniki || {}).stanowiska || {})[d.stanowisko] || {}).nazwa || d.stanowisko || '',
                 sprawdzone: d.sprawdzone, zgodne: d.zgodne, braki: d.braki, zrodlo: d.zrodlo,
                 proc: d.sprawdzone ? Math.round(d.braki * 1000 / d.sprawdzone) / 10 : null,
                 wady: (d.wady || []).map(w => `${(wady[w.kod] || {}).nazwa || w.kod} ${w.ilosc}`),
                 zlecenie: (d.zlecenie && d.zlecenie.numer) || '', wnioski: d.wnioski || '', dzialania: d.dzialania || '',
                 czeka: !!p._oczekuje };
      })
      .sort((a, b) => String(b.czas).localeCompare(String(a.czas)));
  }

  function reklamacje(lista, linia, ja) {
    return (lista || []).filter(r => r.linia === linia)
      .map(r => {
        const d = r.dane || {};
        return { id: r.id, numer: r.numer || '—', otwarta: r.status === 'otwarta', opis: d.opis || '', klient: d.klient || '',
                 wyrob: d.kod_wyrobu || '', partia: d.partia || '', czas: d.czas_rejestracji || r.utworzono,
                 przeczytana: !!((d.odczyty || {})[ja]), zdjecia: d.zdjecia || [] };
      })
      .sort((a, b) => (a.przeczytana - b.przeczytana) || (b.otwarta - a.otwarta) || String(b.czas).localeCompare(String(a.czas)));
  }

  /* KONTRAKT §6.3: zgodne + braki = sprawdzone, suma wad ≤ braki, wady tylko z katalogu. */
  function sprawdzProbe(f, slowniki) {
    const bledy = [];
    const liczba = v => (v === '' || v === null || v === undefined ? NaN : Number(v));
    const s = liczba(f.sprawdzone), z = liczba(f.zgodne), b = liczba(f.braki);
    const calk = v => Number.isInteger(v) && v >= 0;
    if (!calk(s) || s < 1) bledy.push('Wpisz, ile sztuk sprawdzono.');
    if (!calk(z)) bledy.push('Wpisz liczbę sztuk zgodnych.');
    if (!calk(b)) bledy.push('Wpisz liczbę braków (0, gdy brak).');
    if (calk(s) && calk(z) && calk(b) && z + b !== s) bledy.push(`Zgodne + braki = ${z + b}, a sprawdzono ${s}. Popraw liczby.`);
    const katalog = (slowniki && slowniki.katalog_wad) || {};
    let suma = 0;
    for (const w of f.wady || []) {
      if (!katalog[w.kod]) bledy.push(`Wady „${w.kod}” nie ma w katalogu.`);
      if (!Number.isInteger(w.ilosc) || w.ilosc < 1) bledy.push('Ilość wady musi być liczbą większą od zera.');
      suma += w.ilosc || 0;
    }
    if (calk(b) && suma > b) bledy.push(`Wad (${suma}) jest więcej niż braków (${b}).`);
    return bledy;
  }

  // ------------------------------------------------------------ raport końcowy (KONTRAKT §6.4)

  const wZmianie = (czas, zmiana) => !!czas && ms(czas) >= ms(zmiana.od) && ms(czas) < ms(zmiana.do);

  /* Raport składany z tego, co telefon ma w hala.obiekty(…). Pola zgodnie z §6.4;
     Panel czyta je wszystkie jako opcjonalne, brak pokazuje jako „—”.             */
  function raport(o) {
    const { linia, zmiana, teraz } = o;
    const zl = o.zmianaLinii || { dane: {} };
    const d = zl.dane || {};
    const k = H().kolorChecklisty(zl, teraz, 0);
    const wyk = d.wykonane || {}, pom = d.pominiete || {};
    const opoznione = (d.pozycje || []).filter(p =>
      (wyk[p.id] && wyk[p.id].czas && ms(wyk[p.id].czas) > ms(p.termin)) ||
      (!wyk[p.id] && !pom[p.id] && ms(p.termin) < teraz)).map(p => p.id);

    // Awarie, których przestój zachodzi na tę zmianę (także zgłoszone wcześniej i wciąż aktywne). Etap 3 (D37, raport
    // wersja 2): anulowane (fałszywy alarm) pomijamy, a przestój liczy Hala — przycięty do godzin TEJ zmiany (noc, która
    // przeszła na rano, nie dubluje się w obu raportach), „teraz” najwyżej do końca zmiany (raport za zmianę I wysłany
    // o 14:30 nie dolicza pół godziny zmiany II). Nowe pole przestoj_min = przestój LINII (nakładające się awarie raz).
    const awarieZmiany = (o.awarie || []).filter(a => {
      const ad = a.dane || {};
      if (a.linia !== linia || a.status === 'anulowana' || !ad.czas_zgloszenia || ms(ad.czas_zgloszenia) >= ms(zmiana.do)) return false;
      return !ad.czas_potwierdzenia || ms(ad.czas_potwierdzenia) >= ms(zmiana.od);
    }).sort((a, b) => String(a.dane.czas_zgloszenia).localeCompare(String(b.dane.czas_zgloszenia)));
    const doKonca = Math.min(teraz, ms(zmiana.do));
    const linii = H().kpiAwarii(o.awarie || [], { od: zmiana.od, do: zmiana.do, teraz: doKonca, linia });

    const probyZmiany = (o.proby || []).filter(p => p.linia === linia && wZmianie(p.utworzono, zmiana));
    const obsada = d.obsada || null;
    return {
      wersja: 2,
      linia, zmiana: zmiana.id, lider: o.lider,
      obsada: { planowana: obsada ? obsada.planowana : null, obecna: obsada ? obsada.obecna : null,
                zdarzenia: (d.zdarzenia_obsady || []).length },
      checklista: { zrobione: k.zrobione, wszystkie: k.wszystkie, opoznione, pominiete: Object.keys(pom) },
      awarie: awarieZmiany.map(a => ({
        id: a.id, numer: a.numer || null, maszyna: a.dane.maszyna, status: a.status,
        przestoj_min: Math.floor(H().przestojWOknieMs(a, zmiana.od, zmiana.do, doKonca) / MIN) })),
      przestoj_min: Math.floor(linii.przestojMs / MIN),
      proby: { liczba: probyZmiany.length,
               sprawdzone: probyZmiany.reduce((s, p) => s + (p.dane.sprawdzone || 0), 0),
               braki: probyZmiany.reduce((s, p) => s + (p.dane.braki || 0), 0) },
      alerty_potwierdzone: (o.alerty || []).filter(a => {
        const p = ((a.dane || {}).potwierdzenia || {})[linia];
        return p && wZmianie(p.czas, zmiana);
      }).map(a => a.id),
      bhp: { zgloszenia: (o.bhp || []).filter(b => b.linia === linia && wZmianie((b.dane || {}).czas_zgloszenia, zmiana)).length },
      uwagi: String(o.uwagi || '').trim(),
    };
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

  /* Odpowiedź tekstowa z okna L.zapytaj (powód, notatka, działania BHP). Hub odrzuca pole dłuższe niż `maks` z kontraktu
     (hala.py: pole bez `maks` — 10000) i zapis wraca jako „odrzucony”, a wpisany tekst przepada. Dlatego okno bierze limit
     z kontraktu (maxlength + licznik) i sprawdza go przed zapisem (przegląd 2026-10-07). Pola, którego kontrakt nie zna
     (np. kontrakt jeszcze niewczytany), pilnujemy najmniejszym limitem z kontraktu — 1000. */
  function maksPola(kontrakt, typ, pole) {
    const p = ((((kontrakt || {}).zdarzenia || {})[typ] || {}).pola || {})[pole];
    if (!p) return 1000;
    return typeof p.maks === 'number' && p.maks > 0 ? p.maks : 10000;
  }
  const licznikZnakow = (tekst, maks) => `${String(tekst || '').length} / ${maks}`;
  function sprawdzOdpowiedz(tekst, { wymagane, maks } = {}) {
    const t = String(tekst || '').trim();
    if (wymagane && !t) return { tekst: t, blad: 'Wpisz odpowiedź.' };
    if (maks && t.length > maks) return { tekst: t, blad: `Za długie: ${liczebnik(t.length, 'znak', 'znaki', 'znaków')}, najwyżej ${maks}. Skróć tekst.` };
    return { tekst: t, blad: null };
  }

  /* Ekran z adresu dotkniętego powiadomienia (data.adres z huba, np. '#zlecenia', '#jakosc') — jak w UR, KJ i Panelu.
     Lider nie trzyma ekranu w adresie strony, więc '#…' zamieniamy na nazwę ekranu; pusty albo nieznany → null (ekran
     zostaje). Przegląd 2026-10-07: dotknięcie pusha „Zlecenie od kierownika” tylko otwierało aplikację. */
  function ekranZAdresu(adres, ekrany) {
    const nazwa = String(adres || '').replace(/^#/, '').split('/')[0];
    return nazwa && (ekrany || []).includes(nazwa) ? nazwa : null;
  }

  global.LiderWidok = {
    maksPola, licznikZnakow, sprawdzOdpowiedz, ekranZAdresu,
    godzina, dataKrotka, opisZmiany, liczebnik, nazwaPracownika, nazwaLinii, liniePosortowane, liniaStartowa, dzialZlecen,
    linieMistrza, liniaWidoczna, linieDoWyboru, maszynyLinii, stanowiskaLinii, wyrobyLinii, katalogWad,
    kluczZmiany, poprzedniaZmiana, zmianaPoId, zalegleRaporty, RAPORT_ZALEGLY_MS, kontekstFormularza, pozycjaZmiany, kluczBrudnopisuProby,
    checklista, kodDlaLinii, doPrzypomnienia,
    awarie, sprawdzAwarie, aktywnaAwariaMaszyny, pytanieODuplikat,
    alertyDoPotwierdzenia, alertyLinii, proby, reklamacje, sprawdzProbe,
    raport, raz, przyWysylce,
  };
})(typeof window !== 'undefined' ? window : globalThis);
