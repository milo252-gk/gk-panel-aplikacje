/* Hala — wspólny klient dla aplikacji Lidera, UR, KJ i Panelu.

   Jedyne miejsce, w którym aplikacja rozmawia z hubem. Aplikacje NIE wołają
   fetch('/api/…') same — robią to przez ten plik, bo tylko tu jest komplet
   zasad pracy offline:

     * każda zmiana to ZDARZENIE wkładane najpierw do kolejki w telefonie
       (IndexedDB), a dopiero potem wysyłane — zapis nigdy nie czeka na sieć;
     * ekran od razu pokazuje skutek, bo ta sama reguła, którą liczy hub
       (zastosuj), działa tu na kopii stanu + zdarzeniach z kolejki;
     * zdjęcia leżą w telefonie, dopóki hub ich nie potwierdzi;
     * zdarzenie, którego hub nie przyjął, ląduje w „odrzuconych” z powodem
       i NIC stamtąd nie znika samo;
     * wysyłamy tylko zapisy zalogowanej osoby — telefon bywa wspólny.

   Ładowanie: zwykły <script src="…/wspolne/hala.js"></script> (jak w GK Flota),
   potem globalny obiekt Hala. Opis użycia: wspolne/KONTRAKT.md §8.

   Bliźniaki w hubie (wspolne/hub/hala.py) — zmieniasz jedno, zmieniasz drugie
   i dopisujesz przypadek do wspolne/testy/wektory-reduktora.json:
     zastosuj            <-> zastosuj
     brakWymagan         <-> brak_wymagan
     przesuniecieZakladu <-> przesuniecie_zakladu
     zmianaDla           <-> zmiana_dla
     wystapieniaStale    <-> wystapienia_stale
     jestKonflikt        <-> jest_konflikt
     kpiAwarii           <-> kpi_awarii   (etap 3: jedne liczby awarii; MTBF klasyczne — D44)
     wskaznikiOkresu     <-> wskazniki_okresu (D47: Panel → Wskaźniki, „Zakres” liczy hub)
     alertAktywny        <-> alert_aktywny
     moznaAnulowacZlecenie <-> blad_anulowania_zlecenia (D45)                  */

(function (global) {
  'use strict';

  const WERSJA_KLIENTA = '0.15.0';
  const PACZKA = 50;                 // zdarzeń na jedno POST
  // Bez limitu prób: zdarzenie to fakt z hali, więc błąd SIECI nigdy go nie wyrzuca —
  // czeka do skutku. Do „odrzuconych” trafia tylko to, czego hub świadomie nie przyjął.

  // ---------------------------------------------------------------- drobiazgi

  function uuid() {
    // crypto.randomUUID istnieje tylko w bezpiecznym kontekście (https / localhost),
    // a aplikacja bywa otwierana z http://192.168… — getRandomValues działa wszędzie.
    if (global.crypto && global.crypto.randomUUID) {
      try { return global.crypto.randomUUID(); } catch (e) { /* niżej */ }
    }
    const b = new Uint8Array(16);
    global.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  const kopia = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  function iso(d) { return new Date(d).toISOString(); }

  /* Login jak w hubie (hala.py → login_z_nazwy, GK-KONTA §1): „Krzysztof  Hamrol”, „krzysztof.hamrol” → „krzysztof hamrol”.
     Tu tylko klucz mapy znaczników urządzenia (D43) — osobę i tak wskazuje hub. */
  function loginZNazwy(tekst) {
    return String(tekst === null || tekst === undefined ? '' : tekst).toLowerCase().replace(/ł/g, 'l')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');
  }

  function bezpiecznyLocalStorage() {
    // Safari w trybie prywatnym rzuca już przy samym dotknięciu localStorage.
    // Próbny odczyt klucza „hala.*”: na GitHub Pages wszystkie programy GK dzielą jedno źródło i jeden localStorage (D33)
    // — hala nie dotyka kluczy bez swojego przedrostka (pilnuje tego t_dostep.py → WspolneZrodlo).
    try { const s = global.localStorage; s.getItem('hala.urzadzenie'); return s; } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- czas zakładu

  function ostatniaNiedziela(rok, miesiac) {          // miesiac 1..12, zwraca ms UTC 01:00
    const d = new Date(Date.UTC(rok, miesiac - 1, 31, 1, 0));
    while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() - 1);
    return d.getTime();
  }

  function przesuniecieZakladu(ms) {                  // Europe/Warsaw, reguła UE
    const rok = new Date(ms).getUTCFullYear();
    const letni = ostatniaNiedziela(rok, 3) <= ms && ms < ostatniaNiedziela(rok, 10);
    return (letni ? 2 : 1) * 3600000;
  }

  /* Pola lokalnej daty zakładu (niezależnie od strefy telefonu). */
  function lokalny(ms) {
    const d = new Date(ms + przesuniecieZakladu(ms));
    return { rok: d.getUTCFullYear(), miesiac: d.getUTCMonth() + 1, dzien: d.getUTCDate(),
             godz: d.getUTCHours(), min: d.getUTCMinutes(), ms: d.getTime() };
  }

  function zLokalnego(rok, miesiac, dzien, godz, min) {  // -> ms UTC
    const naiwny = Date.UTC(rok, miesiac - 1, dzien, godz, min);
    for (const h of [2, 1]) {
      const k = naiwny - h * 3600000;
      if (k + przesuniecieZakladu(k) === naiwny) return k;
    }
    return naiwny - 3600000;
  }

  const ZMIANY_DOMYSLNE = { I: { nazwa: 'Zmiana I', od: '06:00', do: '14:00' },
                            II: { nazwa: 'Zmiana II', od: '14:00', do: '22:00' },
                            III: { nazwa: 'Zmiana III', od: '22:00', do: '06:00' } };

  function zmianaDla(chwila, zmiany) {
    const ms = typeof chwila === 'number' ? chwila : new Date(chwila).getTime();
    const loc = lokalny(ms);
    const lista = zmiany && Object.keys(zmiany).length ? zmiany : ZMIANY_DOMYSLNE;
    for (const [nr, z] of Object.entries(lista)) {
      // Jedna reguła godziny z hubem (hhmm ↔ _hhmm): zła godzina = zmiana pominięta po obu stronach.
      const m1 = hhmm(z && z.od), m2 = hhmm(z && z.do);
      if (!m1 || !m2) continue;
      for (const wstecz of [0, 1]) {
        const dzienMs = Date.UTC(loc.rok, loc.miesiac - 1, loc.dzien - wstecz);
        const d = new Date(dzienMs);
        const [r, mi, dz] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
        const startN = Date.UTC(r, mi - 1, dz, m1[0], m1[1]);
        let koniecN = Date.UTC(r, mi - 1, dz, m2[0], m2[1]);
        if (koniecN <= startN) koniecN += 86400000;
        if (startN <= loc.ms && loc.ms < koniecN) {
          const e = new Date(koniecN);
          const data = `${r}-${String(mi).padStart(2, '0')}-${String(dz).padStart(2, '0')}`;
          return { id: `${data}/${nr}`, nr, nazwa: z.nazwa || nr,
                   od: iso(zLokalnego(r, mi, dz, m1[0], m1[1])),
                   // godziny z e, nie z m2: '24:00' to już 00:00 następnego dnia
                   do: iso(zLokalnego(e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate(), e.getUTCHours(), e.getUTCMinutes())) };
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- reduktor (bliźniak hala.py)

  function kluczMapy(regula, dane, meta) {
    const k = regula.klucz;
    const v = k in dane ? dane[k] : meta[k];
    return v === undefined || v === null ? null : String(v);
  }

  const puste = v => v === undefined || v === null || (typeof v === 'string' && !v.trim())
    || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

  /* Reguła „wymagane_jesli” (D31): pole zdarzenia jest wymagane, gdy OBIEKT ma znacznik — kierownik zaznaczył
     „Wymagaj zdjęcia”, więc „zlecenie.wykonane” bez zdjęcia nie przejdzie. Zwraca powód (po polsku, z instrukcją)
     albo null. Hub takie zdarzenie odrzuca, a h.zapisz nie wkłada go nawet do kolejki. Przejście niedozwolone
     (zlecenie anulowane) to dalej zwykły konflikt. Bliźniak: hala.py → brak_wymagan. */
  function brakWymagan(kontrakt, stan, zd) {
    const spec = kontrakt.zdarzenia[zd.typ];
    if (!spec || !spec.wymagane_jesli || !stan) return null;
    if (spec.z && !spec.z.includes(stan.status)) return null;
    const d = stan.dane || {}, dane = zd.dane || {};
    const powody = Object.entries(spec.wymagane_jesli).filter(([pole, w]) => d[w.gdy] === true && puste(dane[pole])).map(([, w]) => w.powod);
    return powody.join('; ') || null;
  }

  /* Pole `uwaga` zdarzenia niesie dwie różne rzeczy: konflikt (hub zapisał fakt, ale stan się NIE zmienił) albo
     niewiarygodny czas telefonu (stan się zmienił, tylko z czasem huba — etap 1). Konflikt idzie w uwadze pierwszy,
     więc sama uwaga o czasie to dokładnie UWAGA_CZASU. Powiadomienia (UR, push w hubie) milkną tylko przy konflikcie.
     Bliźniak: hala.py → jest_konflikt. */
  const UWAGA_CZASU = 'czas telefonu niewiarygodny — przyjęto czas huba';
  const jestKonflikt = uwaga => !!uwaga && uwaga !== UWAGA_CZASU;

  function zastosuj(kontrakt, stan, zd) {
    const spec = kontrakt.zdarzenia[zd.typ];
    if (!spec) return [stan, `nieznany typ zdarzenia '${zd.typ}'`];
    const ob = kontrakt.obiekty[spec.obiekt];
    const tworzy = spec.tworzy === undefined ? false : spec.tworzy;
    const nowy = !stan;
    if (nowy) {
      if (tworzy !== true && tworzy !== 'auto') return [null, 'brak obiektu — zdarzenie zapisane, stan bez zmian'];
      stan = { typ: spec.obiekt, id: zd.obiekt, status: null, linia: null, utworzono: zd.czas, dane: {} };
    } else {
      if (tworzy === true) return [stan, 'obiekt już istnieje — zdarzenie zapisane, stan bez zmian'];
      if (spec.z && !spec.z.includes(stan.status))
        return [stan, `niedozwolone przejście ze statusu '${stan.status}' — zdarzenie zapisane, stan bez zmian`];
      const brak = brakWymagan(kontrakt, stan, zd);
      if (brak) return [stan, brak];
    }
    const s = kopia(stan);
    const d = s.dane;
    const dane = zd.dane || {};
    const meta = { czas: zd.czas, autor: zd.autor, aplikacja: zd.aplikacja,
                   czas_serwera: zd.czas_serwera === undefined ? null : zd.czas_serwera, zdarzenie: zd.id };
    if (nowy) for (const [cel, zr] of Object.entries(spec.kopiuj || {})) if (zr in dane) d[cel] = kopia(dane[zr]);
    let scal = spec.scal || [];
    if (Array.isArray(scal)) scal = Object.fromEntries(scal.map(k => [k, k]));
    for (const [cel, zr] of Object.entries(scal)) {
      if (zr === '@dane') d[cel] = kopia(dane);
      else if (zr in dane) d[cel] = kopia(dane[zr]);
    }
    for (const [cel, zr] of Object.entries(spec.znaczniki || {})) d[cel] = meta[zr] === undefined ? null : meta[zr];
    for (const [cel, zr] of Object.entries(spec.znaczniki_pierwsze || {}))
      if (d[cel] === undefined || d[cel] === null) d[cel] = meta[zr] === undefined ? null : meta[zr];
    for (const [pole, pola] of Object.entries(spec.dopisz || {})) {
      const wpis = {};
      for (const p of pola) if (p in dane) wpis[p] = kopia(dane[p]);
      Object.assign(wpis, { autor: meta.autor, czas: meta.czas, zdarzenie: meta.zdarzenie });
      (d[pole] = d[pole] || []).push(wpis);
    }
    if (spec.mapa) {
      const k = kluczMapy(spec.mapa, dane, meta);
      if (k !== null) {
        const wpis = {};
        for (const p of spec.mapa.pola || []) if (p in dane) wpis[p] = kopia(dane[p]);
        Object.assign(wpis, { autor: meta.autor, czas: meta.czas, zdarzenie: meta.zdarzenie });
        (d[spec.mapa.pole] = d[spec.mapa.pole] || {})[k] = wpis;
      }
    }
    if (spec.usun_z_mapy) {
      const k = kluczMapy(spec.usun_z_mapy, dane, meta);
      const m = d[spec.usun_z_mapy.pole];
      if (k !== null && m && typeof m === 'object' && !Array.isArray(m)) delete m[k];
    }
    for (const pole of spec.zeruj || []) delete d[pole];
    if (spec.na) s.status = spec.na;
    if (s.status === null) s.status = Object.keys(ob.statusy)[0];
    if (nowy && typeof dane.linia === 'string') s.linia = dane.linia;     // linię ustala zdarzenie tworzące
    s.zmieniono = zd.czas;
    s.seq = zd.seq === undefined ? null : zd.seq;
    s.aktywny = !(ob.koncowe || []).includes(s.status);
    return [s, null];
  }

  // ---------------------------------------------------------------- reguły wspólne dla aplikacji

  /* Szablon checklisty dla linii i zmiany: najpierw dopasowany wprost, potem ogólny. */
  function szablonDla(slowniki, linia, nrZmiany) {
    const wszystkie = Object.entries((slowniki || {}).szablony_checklist || {});
    const pasuje = ([, s]) => (!s.linie || !s.linie.length || s.linie.includes(linia)) &&
                              (!s.zmiany || !s.zmiany.length || s.zmiany.includes(nrZmiany));
    const ocena = ([, s]) => (s.linie && s.linie.length ? 2 : 0) + (s.zmiany && s.zmiany.length ? 1 : 0);
    const kandydaci = wszystkie.filter(pasuje).sort((a, b) => ocena(b) - ocena(a));
    return kandydaci.length ? { kod: kandydaci[0][0], ...kandydaci[0][1] } : null;
  }

  /* Migawka pozycji z bezwzględnymi terminami — idzie w zdarzeniu zmiana.rozpoczeta. */
  function pozycjeZSzablonu(szablon, zmiana) {
    if (!szablon || !zmiana) return [];
    const start = Date.parse(zmiana.od);
    return (szablon.pozycje || []).map(p => ({
      id: p.id, nazwa: p.nazwa, typ: p.typ || 'zadanie', wymaga_qr: !!p.wymaga_qr, cel: p.cel || null,
      termin: iso(start + (p.termin_min || 0) * 60000) }));
  }

  /* Kolor kafelka / paska lidera. JEDNA definicja dla Lidera i Panelu:
       czerwony — jest pozycja po terminie, niewykonana i niepominięta,
       żółty    — termin którejś pozycji wypada w ciągu progZoltyMin minut,
       zielony  — reszta,
       szary    — brak pozycji (lider nie otworzył zmiany i nie ma szablonu).  */
  function kolorChecklisty(zmianaLinii, teraz, progZoltyMin) {
    const tms = typeof teraz === 'number' ? teraz : Date.now();
    const prog = (progZoltyMin === undefined ? 30 : progZoltyMin) * 60000;
    const d = (zmianaLinii && zmianaLinii.dane) || {};
    const pozycje = d.pozycje || [];
    const wyk = d.wykonane || {}, pom = d.pominiete || {};
    const wynik = { kolor: 'szary', zrobione: 0, wszystkie: pozycje.length, opoznione: [], bliskie: [], najblizsza: null };
    if (!pozycje.length) return wynik;
    for (const p of pozycje) {
      if (wyk[p.id] || pom[p.id]) { wynik.zrobione++; continue; }
      const t = Date.parse(p.termin);
      if (t < tms) wynik.opoznione.push(p);
      else {
        if (t - tms <= prog) wynik.bliskie.push(p);
        if (!wynik.najblizsza || t < Date.parse(wynik.najblizsza.termin)) wynik.najblizsza = p;
      }
    }
    wynik.kolor = wynik.opoznione.length ? 'czerwony' : wynik.bliskie.length ? 'zolty' : 'zielony';
    return wynik;
  }

  /* Czasy awarii (ms). Przestój: od zgłoszenia do potwierdzenia lidera, 24/7 bez
     przerw. Naprawa (MTTR): od zgłoszenia do zakończenia przez UR. Reakcja: do przyjęcia. */
  function przestojMs(awaria, teraz) {
    const d = (awaria && awaria.dane) || {};
    if (!d.czas_zgloszenia) return null;
    const koniec = d.czas_potwierdzenia || d.czas_anulowania;
    return (koniec ? Date.parse(koniec) : (teraz || Date.now())) - Date.parse(d.czas_zgloszenia);
  }
  function czasNaprawyMs(awaria) {
    const d = (awaria && awaria.dane) || {};
    return d.czas_zgloszenia && d.czas_zakonczenia_ur ? Date.parse(d.czas_zakonczenia_ur) - Date.parse(d.czas_zgloszenia) : null;
  }
  function czasReakcjiMs(awaria) {
    const d = (awaria && awaria.dane) || {};
    return d.czas_zgloszenia && d.czas_przyjecia ? Date.parse(d.czas_przyjecia) - Date.parse(d.czas_zgloszenia) : null;
  }

  /* ---------------------------------------------------------------- wskaźniki awarii (etap 3, D37)

     JEDNE liczby na każdym ekranie: Panel (Wskaźniki), UR (KPI w telefonie), raport zmiany lidera i KPI z huba
     (ur/serwer/rozszerzenie.py) liczą je tą jedną funkcją. Bliźniak: kpi_awarii w hala.py; wspólne przypadki:
     testy/wektory-reduktora.json → kpi_awarii. Wcześniej każdy ekran liczył po swojemu i kierownik widział trzy
     różne przestoje tej samej zmiany. Reguły (KONTRAKT §6.1):
       * anulowana awaria (fałszywy alarm) nie liczy się NIGDZIE — ani do liczby, ani do przestoju, ani do reakcji;
       * liczba, MTTR, reakcja, MTBF, zatrzymania i typy — awarie ZGŁOSZONE w oknie [od, do);
       * przestój — przedział [zgłoszenie, potwierdzenie lidera) (trwająca: do „teraz”) PRZYCIĘTY do okna, także dla
         zamkniętej i dla zgłoszonej przed oknem (noc, która przeszła na ranną zmianę, liczy się rannej zmianie od 6:00);
       * dwie nakładające się awarie tej samej maszyny nie dublują przestoju — suma przedziałów bez nakładania, osobno
         na maszynę i na linię (linia stoi raz, nawet gdy stoją na niej dwie maszyny); przestój ogółem = suma po liniach;
       * MTBF (klasyczne, D44 — decyzja właściciela 2026-10-07) — średni czas PRACY maszyny między awariami
         ZATRZYMUJĄCYMI (priorytet z zatrzymuje: true): od potwierdzenia naprawy jednej do zgłoszenia następnej;
         zgłoszenie, które przyszło, gdy poprzednia awaria zatrzymująca tej maszyny jeszcze trwała, to ta sama przerwa;
         awarie bez zatrzymania nie przerywają czasu pracy;
       * czasy w ms, średnie z ułamkiem w dół; na minuty ekran zamienia RAZ, też w dół (formatCzasu, raport lidera).
     od / do / teraz: ISO albo ms; brak od/do = bez granicy. zatrzymujace: kody priorytetów z zatrzymuje: true.   */
  const msChwili = v => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? v : Date.parse(v));

  function przedzialPrzestoju(awaria, teraz) {
    if (!awaria || awaria.status === 'anulowana') return null;
    const d = awaria.dane || {};
    const start = msChwili(d.czas_zgloszenia);
    if (start === null || isNaN(start)) return null;
    const k = msChwili(d.czas_potwierdzenia);
    const koniec = k !== null && !isNaN(k) ? k : teraz;
    return [start, Math.max(start, koniec)];
  }

  /* Suma przedziałów przyciętych do [od, do) — nakładające się liczą się raz. */
  function sumaPrzedzialow(przedzialy, od, do_) {
    const lista = [];
    for (const [a, b] of przedzialy) {
      const s = od === null ? a : Math.max(a, od), k = do_ === null ? b : Math.min(b, do_);
      if (k > s) lista.push([s, k]);
    }
    lista.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let suma = 0, s = null, k = null;
    for (const [a, b] of lista) {
      if (s === null || a > k) { if (s !== null) suma += k - s; s = a; k = b; } else if (b > k) k = b;
    }
    return s === null ? suma : suma + k - s;
  }

  /* Przestój jednej awarii w oknie (raport zmiany: noc przechodząca na rano liczy się każdej zmianie po kawałku). */
  function przestojWOknieMs(awaria, od, do_, teraz) {
    const p = przedzialPrzestoju(awaria, msChwili(teraz) === null ? Date.now() : msChwili(teraz));
    return p ? sumaPrzedzialow([p], msChwili(od), msChwili(do_)) : 0;
  }

  /* Jeden podpis MTBF na każdym ekranie (Panel → Wskaźniki, UR → KPI) — D44. */
  const OPIS_MTBF = 'MTBF — średni czas pracy między awariami zatrzymującymi';

  function kpiAwarii(awarie, opcje) {
    const o = opcje || {};
    const od = msChwili(o.od), do_ = msChwili(o.do);
    const teraz = msChwili(o.teraz) === null ? Date.now() : msChwili(o.teraz);
    const zatrzymuje = new Set(o.zatrzymujace || []);
    const srednia = l => (l.length ? Math.floor(l.reduce((s, x) => s + x, 0) / l.length) : null);
    const wOknie = t => (od === null || t >= od) && (do_ === null || t < do_);
    const liniaAw = a => a.linia || (a.dane || {}).linia || '—';
    const maszynaAw = a => (a.dane || {}).maszyna || '—';
    const wszystkie = [];
    for (const a of awarie || []) {
      if (!a || (o.maszyna && maszynaAw(a) !== o.maszyna) || (o.linia && liniaAw(a) !== o.linia)) continue;
      const p = przedzialPrzestoju(a, teraz);
      if (p) wszystkie.push({ a, d: a.dane || {}, p, zgloszona: wOknie(p[0]) });
    }
    const naprawa = x => (x.d.czas_zakonczenia_ur ? msChwili(x.d.czas_zakonczenia_ur) - x.p[0] : null);
    const reakcja = x => (x.d.czas_przyjecia ? msChwili(x.d.czas_przyjecia) - x.p[0] : null);
    const liczby = (lista, f) => lista.map(f).filter(v => v !== null && !isNaN(v));
    // Czas pracy między przerwami jednej maszyny (D44): tylko awarie zatrzymujące; od potwierdzenia naprawy do
    // następnego zgłoszenia; zgłoszenie w trakcie trwającej przerwy = ta sama przerwa.
    const czasyPracy = lista => {
      const p = lista.filter(x => zatrzymuje.has(x.d.priorytet)).map(x => x.p).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const przerwy = [];
      for (const [s, k] of p) {
        const ost = przerwy[przerwy.length - 1];
        if (ost && s < ost[1]) ost[1] = Math.max(ost[1], k); else przerwy.push([s, k]);
      }
      return przerwy.slice(1).map((b, i) => b[0] - przerwy[i][1]);
    };
    const grupy = klucz => {
      const g = new Map();
      for (const x of wszystkie) { const k = klucz(x.a); if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
      return g;
    };
    const kolejnosc = (a, b) => (b.przestojMs - a.przestojMs) || (b.liczba - a.liczba) || (a.kod < b.kod ? -1 : a.kod > b.kod ? 1 : 0);
    const zatrzymania = l => l.filter(x => zatrzymuje.has(x.d.priorytet)).length;

    const maszyny = [], wszystkieOdstepy = [];
    for (const [kod, lista] of grupy(maszynaAw)) {
      const zgl = lista.filter(x => x.zgloszona), o2 = czasyPracy(zgl);
      const przestojMs = sumaPrzedzialow(lista.map(x => x.p), od, do_);
      wszystkieOdstepy.push(...o2);
      if (!zgl.length && !przestojMs) continue;
      maszyny.push({ kod, linia: liniaAw(lista[0].a), liczba: zgl.length, zatrzymania: zatrzymania(zgl), przestojMs,
                     mttrMs: srednia(liczby(zgl, naprawa)), mtbfMs: srednia(o2), reakcjaMs: srednia(liczby(zgl, reakcja)) });
    }
    maszyny.sort(kolejnosc);
    const linie = [];
    for (const [kod, lista] of grupy(liniaAw)) {
      const zgl = lista.filter(x => x.zgloszona);
      const przestojMs = sumaPrzedzialow(lista.map(x => x.p), od, do_);
      if (!zgl.length && !przestojMs) continue;
      linie.push({ kod, liczba: zgl.length, zatrzymania: zatrzymania(zgl), przestojMs, mttrMs: srednia(liczby(zgl, naprawa)) });
    }
    linie.sort(kolejnosc);
    const zgl = wszystkie.filter(x => x.zgloszona);
    const typy = new Map();
    for (const x of zgl) { const k = x.d.typ_usterki || 'brak'; typy.set(k, (typy.get(k) || 0) + 1); }
    const naprawy = liczby(zgl, naprawa);
    return {
      liczba: zgl.length, zakonczone: naprawy.length, zatrzymania: zatrzymania(zgl),
      mttrMs: srednia(naprawy), reakcjaMs: srednia(liczby(zgl, reakcja)), mtbfMs: srednia(wszystkieOdstepy),
      przestojMs: linie.reduce((s, l) => s + l.przestojMs, 0),
      maszyny, linie,
      typy: Array.from(typy, ([kod, liczba]) => ({ kod, liczba }))
        .sort((a, b) => (b.liczba - a.liczba) || (a.kod < b.kod ? -1 : a.kod > b.kod ? 1 : 0)),
    };
  }

  /* Wskaźniki za okres — Panel → Wskaźniki (D37, D47): awarie (kpiAwarii), próby i zlecenia JEDNĄ funkcją. Krótkie okresy
     (zmiana, dziś, wczoraj) liczy Panel z pamięci, „Zakres” (do 366 dni) — hub tą samą regułą (bliźniak wskazniki_okresu,
     wektory wektory-reduktora.json → wskazniki_okresu), więc liczby są te same, skąd by nie przyszły. Okno [od, do):
       * próby — rozpoczęte w oknie (`czas_rozpoczecia`, bez niego `utworzono`): liczba, sprawdzone, braki, wady {kod, ile}
         (ilość 0 albo brak = 1 sztuka, jak dotąd na Panelu);
       * zlecenia — zlecone w oknie (`czas_zlecenia`; zaplanowane, jeszcze nie zlecone — D47 — go nie mają): liczba,
         wykonane (wykonane + zamknięte), terminowość z tych, które mają termin: w terminie = wykonane do terminu; po terminie
         = wykonane później, otwarte po minionym terminie albo przepadłe (D35); otwarte przed terminem, anulowane i „nie może”
         się nie liczą. Ogółem, na dział i na wskazaną osobę (`wykonawca`), listy po kodzie.
     Nazwy (linie, działy, osoby) i procenty dokłada ekran.                                                              */
  const liczbaPola = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const poKodzie = (a, b) => (a.kod < b.kod ? -1 : a.kod > b.kod ? 1 : 0);
  function wskaznikiOkresu(dane, opcje) {
    const o = opcje || {}, d0 = dane || {};
    const od = msChwili(o.od), do_ = msChwili(o.do);
    const teraz = msChwili(o.teraz) === null ? Date.now() : msChwili(o.teraz);
    const wOknie = v => { const t = msChwili(v || null); return t !== null && !isNaN(t) && (od === null || t >= od) && (do_ === null || t < do_); };
    const awarie = kpiAwarii(d0.awarie, { od, do: do_, teraz, zatrzymujace: o.zatrzymujace });
    let proby = 0, sprawdzone = 0, braki = 0;
    const wady = new Map();
    for (const p of d0.proby || []) {
      if (!p) continue;
      const d = p.dane || {};
      if (!wOknie(d.czas_rozpoczecia || p.utworzono)) continue;
      proby++; sprawdzone += liczbaPola(d.sprawdzone); braki += liczbaPola(d.braki);
      for (const x of d.wady || []) if (x && x.kod) wady.set(x.kod, (wady.get(x.kod) || 0) + (liczbaPola(x.ilosc) || 1));
    }
    const zl = (d0.zlecenia || []).filter(z => z && wOknie((z.dane || {}).czas_zlecenia));
    const ogolem = { wTerminie: 0, poTerminie: 0 }, dzialy = new Map(), osoby = new Map();
    const dolicz = (mapa, kod, wynik) => {
      if (kod === null || kod === undefined || kod === '') return;
      const g = mapa.get(kod) || mapa.set(kod, { kod, wTerminie: 0, poTerminie: 0 }).get(kod);
      if (wynik) g.wTerminie++; else g.poTerminie++;
    };
    for (const z of zl) {
      const d = z.dane || {}, t = msChwili(d.termin || null), wyk = msChwili(d.czas_wykonania || null);
      if (t === null || isNaN(t)) continue;
      let wynik = null;
      if ((z.status === 'wykonane' || z.status === 'zamkniete') && wyk !== null && !isNaN(wyk)) wynik = wyk <= t;
      else if ((z.status === 'nowe' || z.status === 'przyjete') && t < teraz) wynik = false;
      else if (z.status === 'przepadlo') wynik = false;
      if (wynik === null) continue;
      if (wynik) ogolem.wTerminie++; else ogolem.poTerminie++;
      dolicz(dzialy, d.dzial, wynik);
      dolicz(osoby, d.wykonawca, wynik);
    }
    return {
      awarie,
      proby: { liczba: proby, sprawdzone, braki,
               wady: Array.from(wady, ([kod, ile]) => ({ kod, ile })).sort((a, b) => (b.ile - a.ile) || poKodzie(a, b)) },
      zlecenia: { liczba: zl.length, wykonane: zl.filter(z => z.status === 'wykonane' || z.status === 'zamkniete').length,
                  terminowosc: { wTerminie: ogolem.wTerminie, poTerminie: ogolem.poTerminie,
                                 dzialy: Array.from(dzialy.values()).sort(poKodzie), osoby: Array.from(osoby.values()).sort(poKodzie) } },
    };
  }

  /* Quality Alert po dacie „ważny do” jest jak wycofany (etap 3): lider go nie potwierdza, Panel go nie świeci.
     Status w kontrakcie dalej „aktywny” (nikt nie wysłał alert.wycofany) — o ważności decyduje czas. */
  function alertAktywny(alert, teraz) {
    if (!alert || alert.status !== 'aktywny') return false;
    const wd = msChwili(((alert.dane || {}).wazny_do) || null);
    return wd === null || isNaN(wd) || wd > (msChwili(teraz) === null ? Date.now() : msChwili(teraz));
  }

  /* D45 (O9, decyzja właściciela 2026-10-07): zlecenie wydane przez kierownika zakładu (rola `kierownik`) albo admina
     anuluje tylko kierownik albo admin — kierownik UR/KJ nie (hub i tak odrzuci: ODMOWA_ANULOWANIA). Role tego, kto zlecił,
     z hala.pracownicy (także osoba usunięta). Tylko reguła „kto” — status (nowe/przyjęte) sprawdza ekran. Bliźniak:
     blad_anulowania_zlecenia w hala.py. */
  const ROLE_ZAKLADU = ['kierownik', 'admin'];
  function moznaAnulowacZlecenie(zlecenie, pracownik, pracownicy) {
    const zlecil = ((zlecenie && zlecenie.dane) || {}).zlecil;
    const osoba = (pracownicy || []).find(p => p && p.id === zlecil);
    const zZakladu = role => (role || []).some(r => ROLE_ZAKLADU.includes(r));
    return !zZakladu(osoba && osoba.role) || zZakladu(pracownik && pracownik.role);
  }

  /* Licznik, który tyka na ekranie (przestój, czekanie na lidera): do godziny z sekundami („4:07”),
     bo „0 min” przez pierwszą minutę wygląda na zawieszony. Od godziny — jak formatCzasu. */
  function formatLicznika(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '—';
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s >= 3600) return formatCzasu(ms);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function formatCzasu(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '—';
    const min = Math.max(0, Math.floor(ms / 60000));
    const dni = Math.floor(min / 1440), godz = Math.floor((min % 1440) / 60), m = min % 60;
    if (dni) return `${dni} d ${godz} h`;
    if (godz) return `${godz} h ${String(m).padStart(2, '0')} min`;
    return `${m} min`;
  }

  const dwie = n => String(n).padStart(2, '0');

  /* Termin zlecenia po ludzku, ten sam w Panelu i w ekranie działu (D31): „do 14:00 (za 25 min)”,
     „po terminie o 1 h 20 min”. Inny dzień niż dziś — z datą („do 02.10 10:00”). null = bez terminu. */
  function opisTerminu(termin, teraz) {
    if (termin === null || termin === undefined || termin === '') return null;
    const t = typeof termin === 'number' ? termin : Date.parse(termin);
    if (isNaN(t)) return null;
    const tms = typeof teraz === 'number' ? teraz : Date.now();
    const l = lokalny(t), n = lokalny(tms);
    const godz = `${dwie(l.godz)}:${dwie(l.min)}`;
    const kiedy = l.rok === n.rok && l.miesiac === n.miesiac && l.dzien === n.dzien ? godz : `${dwie(l.dzien)}.${dwie(l.miesiac)} ${godz}`;
    if (t < tms) return { tekst: `po terminie o ${formatCzasu(tms - t)}`, po: true, kiedy };
    return { tekst: `do ${kiedy} (za ${formatCzasu(t - tms)})`, po: false, kiedy };
  }

  /* 'HH:MM' -> [g, m]; '24:00' = koniec doby. Bliźniak _hhmm w hala.py — ta sama reguła (tylko tekst, 1–2 cyfry ASCII,
     dwukropek, 2 cyfry; bez spacji i znaków), inaczej hub i telefon liczą różne zmiany (wektory: zmiany). */
  function hhmm(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(typeof t === 'string' ? t : '');
    if (!m || +m[1] > 24 || +m[2] > 59 || (+m[1] === 24 && +m[2] > 0)) return null;
    return [+m[1], +m[2]];
  }

  /* Wystąpienia zlecenia stałego, które ZACZYNAJĄ SIĘ danego dnia zakładu ('RRRR-MM-DD'): [{klucz, zmiana, start,
     termin}] (ISO UTC). Bliźniak hubu (hala.py → wystapienia_stale), który z tego robi zlecenia; Panel liczy tym
     „następne wystąpienie”. Puste „zmiany” = raz dziennie na start pierwszej zmiany doby; w krótszym miesiącu
     „31.” = ostatni dzień; termin „godzina” to najbliższa taka godzina po starcie (nocna zmiana — następny dzień). */
  function wystapieniaStale(kod, szablon, data, zmiany) {
    const h = (szablon && szablon.harmonogram) || {};
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data || '');
    if (!m) return [];
    const [r, mi, dz] = [+m[1], +m[2], +m[3]];
    const dzienTygodnia = (new Date(Date.UTC(r, mi - 1, dz)).getUTCDay() + 6) % 7 + 1;      // poniedziałek = 1
    const ostatni = new Date(Date.UTC(r, mi, 0)).getUTCDate();
    let pasuje = false;
    if (h.rodzaj === 'codziennie') pasuje = true;
    else if (h.rodzaj === 'dni_tygodnia') pasuje = (h.dni || []).includes(dzienTygodnia);
    else if (h.rodzaj === 'miesiecznie') pasuje = dz === Math.min(parseInt(h.dzien_miesiaca, 10) || 1, ostatni);
    if (!pasuje) return [];
    const lista = Object.entries(zmiany && Object.keys(zmiany).length ? zmiany : ZMIANY_DOMYSLNE)
      .map(([nr, z]) => [nr, hhmm(z && z.od), hhmm(z && z.do)]).filter(x => x[1] && x[2])
      .sort((a, b) => (a[1][0] * 60 + a[1][1]) - (b[1][0] * 60 + b[1][1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const wybrane = (h.zmiany || []).filter(z => typeof z === 'string');
    const zm = wybrane.length ? lista.filter(z => wybrane.includes(z[0])) : lista.slice(0, 1);
    const t = (szablon && szablon.termin) || {};
    const zNaiwnego = n => { const d = new Date(n); return zLokalnego(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()); };
    return zm.map(([nr, [g1, m1], [g2, m2]]) => {
      const startN = Date.UTC(r, mi - 1, dz, g1, m1);
      let koniecN = Date.UTC(r, mi - 1, dz, g2, m2);
      if (koniecN <= startN) koniecN += 86400000;
      const start = zNaiwnego(startN);
      let termin;
      if (t.rodzaj === 'godzina') {
        const gm = hhmm(t.godzina);
        if (!gm) throw new Error(`zła godzina terminu '${t.godzina}'`);
        let tN = Date.UTC(r, mi - 1, dz, gm[0], gm[1]);
        if (tN <= startN) tN += 86400000;
        termin = zNaiwnego(tN);
      } else if (t.rodzaj === 'minuty') termin = start + (parseInt(t.minuty, 10) || 0) * 60000;
      else termin = zNaiwnego(koniecN);
      return { klucz: `${kod}|${data}|${wybrane.length ? nr : '-'}`, zmiana: `${data}/${nr}`, start: iso(start), termin: iso(termin) };
    });
  }

  /* Tekst ze skanera (kamera albo czytnik-klawiatura) -> co to jest.
     Kody systemu: HALA:M:WT-01 (maszyna), HALA:S:… (stanowisko), HALA:L:… (linia),
     HALA:P:… (identyfikator pracownika). Kody zastane szukamy w polu 'qr' słowników. */
  function odczytajKod(tekst, slowniki) {
    const t = String(tekst || '').trim();
    const rodzaje = { M: 'maszyny', S: 'stanowiska', L: 'linie', P: 'pracownik' };
    const m = /^HALA:([MSLP]):(.+)$/i.exec(t);
    if (m) {
      const sl = rodzaje[m[1].toUpperCase()];
      const wpis = sl === 'pracownik' ? null : ((slowniki || {})[sl] || {})[m[2]] || null;
      return { rodzaj: sl, kod: m[2], wpis, surowy: t };
    }
    for (const sl of ['maszyny', 'stanowiska', 'linie']) {
      for (const [kod, w] of Object.entries((slowniki || {})[sl] || {}))
        if (w && w.qr && w.qr === t) return { rodzaj: sl, kod, wpis: w, surowy: t };
    }
    return { rodzaj: null, kod: t, wpis: null, surowy: t };
  }

  // ---------------------------------------------------------------- IndexedDB

  function otworzBaze(nazwa) {
    return new Promise((ok, zle) => {
      const z = indexedDB.open(nazwa, 1);
      z.onupgradeneeded = () => {
        const db = z.result;
        // Każdy magazyn warunkowo — przy podniesieniu wersji istniejący rzuciłby ConstraintError.
        if (!db.objectStoreNames.contains('kolejka')) db.createObjectStore('kolejka', { keyPath: 'nr', autoIncrement: true });
        if (!db.objectStoreNames.contains('odrzucone')) db.createObjectStore('odrzucone', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('pamiec')) db.createObjectStore('pamiec', { keyPath: 'klucz' });
        if (!db.objectStoreNames.contains('pliki')) db.createObjectStore('pliki', { keyPath: 'id' });
      };
      z.onsuccess = () => ok(z.result);
      z.onerror = () => zle(z.error);
    });
  }

  /* Czekamy na oncomplete TRANSAKCJI, nie na onsuccess żądania — żądanie melduje
     sukces przed zatwierdzeniem, a telefon wygaszony w tej szczelinie gubi zapis. */
  function dzialanie(db, magazyn, tryb, praca) {
    return new Promise((ok, zle) => {
      const t = db.transaction(magazyn, tryb);
      const z = praca(t.objectStore(magazyn));
      t.oncomplete = () => ok(z ? z.result : undefined);
      t.onerror = () => zle(t.error);
      t.onabort = () => zle(t.error || new Error('Zapis w telefonie przerwany'));
    });
  }

  // ---------------------------------------------------------------- zdjęcia

  async function zmniejszZdjecie(plik, maks, jakosc) {
    let obraz;
    try {
      obraz = await createImageBitmap(plik, { imageOrientation: 'from-image' });
    } catch (e) {
      obraz = await new Promise((ok, zle) => {
        const img = new Image();
        img.onload = () => ok(img);
        img.onerror = () => zle(new Error('Nie da się odczytać zdjęcia (format HEIC? ustaw w aparacie „Najbardziej zgodne”)'));
        img.src = URL.createObjectURL(plik);
      });
    }
    const w = obraz.width, h = obraz.height;
    const skala = Math.min(1, maks / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * skala); c.height = Math.round(h * skala);
    c.getContext('2d').drawImage(obraz, 0, 0, c.width, c.height);
    return new Promise(ok => c.toBlob(ok, 'image/jpeg', jakosc));
  }

  // ---------------------------------------------------------------- klient

  function utworz(opcje) {
    // ciszaStrumieniaMs: po tylu ms bez żadnego bajtu (hub pinguje co 15 s) strumień uznajemy za martwy.
    // czekajWitajMs: hub wysyła „witaj” od razu po otwarciu; bez niego sieć zatrzymuje strumień (buforuje),
    // więc przechodzimy na dociąganie co dociaganieMs, a strumienia próbujemy znowu po ponowStrumienMs.
    // sprawdzAdresCoMs: najczęściej co tyle ms czytamy konfiguracja.json po błędach sieci (D33: adres tunelu się zmienia).
    const o = Object.assign({ aplikacja: null, typy: [], dni: 3, hub: null, ciszaStrumieniaMs: 45000,
                              czekajWitajMs: 5000, dociaganieMs: 4000, ponowStrumienMs: 300000,
                              sprawdzAdresCoMs: 30000 }, opcje || {});
    if (!o.aplikacja) throw new Error('Hala.utworz: podaj aplikacja');
    const ls = bezpiecznyLocalStorage();
    const sluchacze = {};
    const stanSerwera = new Map();       // 'typ|id' -> obiekt (ostatni stan z huba)
    let db = null, hub = '', token = null, seq = 0, synchronizuje = false, strumienAktywny = false;
    let przesuniecieZegara = 0, kolejkaCache = [], widok = null;
    /* Epoka bazy (etap 2): hub nadaje ją bazie, a przywrócenie z kopii (hala.py --przywroc) — nową. Inna epoka = inna
       historia zdarzeń: kursor seq z telefonu nic już nie znaczy (kopia ma mniej zdarzeń, a nowe dostaną numery, które
       telefon „już widział” i pominąłby po cichu). Wtedy pełne wczytanie — także na monitorze z sesją na 90 dni, który
       inaczej nigdy go nie robi. Telefon bez zapamiętanej epoki (klient sprzed 0.10.0) wczyta wszystko raz. */
    let epoka = null;
    const innaEpoka = e => typeof e === 'string' && e !== '' && e !== epoka;

    const h = {
      aplikacja: o.aplikacja, pracownik: null, kontrakt: null, slowniki: {}, pracownicy: [],
      // dociaganie: strumień zatrzymany przez sieć, zmiany przychodzą co kilka sekund (nie „na żywo”, ale nie brak połączenia).
      polaczenie: { online: navigator.onLine, strumien: false, dociaganie: false, ostatniaSynchronizacja: null, blad: null, bladPlikow: null },
      wersja: WERSJA_KLIENTA,
    };

    // --- zdarzenia dla aplikacji
    h.na = (nazwa, fn) => { (sluchacze[nazwa] = sluchacze[nazwa] || new Set()).add(fn); return () => sluchacze[nazwa].delete(fn); };
    function emituj(nazwa, szczegoly) {
      for (const fn of sluchacze[nazwa] || []) { try { fn(szczegoly); } catch (e) { console.error(e); } }
    }

    // --- pamięć
    const pamiec = {
      czytaj: k => dzialanie(db, 'pamiec', 'readonly', s => s.get(k)).then(w => (w ? w.wartosc : undefined)),
      zapisz: (k, v) => dzialanie(db, 'pamiec', 'readwrite', s => s.put({ klucz: k, wartosc: v })),
      usun: k => dzialanie(db, 'pamiec', 'readwrite', s => s.delete(k)),
    };
    let zapisStanuTimer = null;
    function zapiszStanPozniej() {
      clearTimeout(zapisStanuTimer);
      zapisStanuTimer = setTimeout(() => {
        pamiec.zapisz('stan', Array.from(stanSerwera.values())).catch(console.error);
        pamiec.zapisz('seq', seq).catch(console.error);
      }, 400);
    }

    // --- adres huba: opcja > ręczne nadpisanie > konfiguracja.json obok aplikacji (GitHub Pages) > ten sam adres
    /* Na GitHub Pages (D33) aplikacja leży pod stałym adresem, a hub pod adresem tunelu, który zmienia się po każdym
       restarcie komputera w biurze. Hub sam wpisuje nowy adres do konfiguracja.json obok aplikacji — tu go czytamy:
       przy starcie i po kolejnych błędach sieci (sprawdzAdresHuba). Na samym hubie pliku nie ma (404) — zostaje
       ten sam adres. zrodloHuba mówi, czy wolno adres zmieniać sami (opcja i ręczne nadpisanie — nie). */
    let zrodloHuba = 'ten-sam';
    async function czytajKonfiguracje(limitMs) {
      if (typeof location === 'undefined' || typeof URL === 'undefined') return null;
      const stop = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const zegar = stop ? setTimeout(() => stop.abort(), limitMs) : null;
      try {
        // ?t=…: Pages stoi za pamięcią podręczną (CDN, do 10 min) — bez tego po restarcie tunelu telefon dostawałby
        // jeszcze stary adres, mimo cache: 'no-store' po stronie przeglądarki.
        const r = await fetch(new URL('../konfiguracja.json?t=' + Date.now(), location.href).href,
                              { cache: 'no-store', signal: stop ? stop.signal : undefined });
        if (!r.ok) return null;
        const k = await r.json();
        return k && typeof k.hub === 'string' && /^https?:\/\//.test(k.hub) ? k.hub.replace(/\/$/, '') : null;
      } catch (e) { return null; /* offline albo brak pliku */ }
      finally { if (zegar) clearTimeout(zegar); }
    }
    async function ustalHub() {
      if (o.hub !== null) { zrodloHuba = 'opcja'; return o.hub.replace(/\/$/, ''); }
      const reczny = ls && ls.getItem('hala.hub');
      if (reczny) { zrodloHuba = 'reczny'; return reczny.replace(/\/$/, ''); }
      const z = await czytajKonfiguracje(2500);
      if (z) { await pamiec.zapisz('hub', z); zrodloHuba = 'konfiguracja'; return z; }
      const zapamietany = await pamiec.czytaj('hub');
      zrodloHuba = zapamietany ? 'pamiec' : 'ten-sam';
      return zapamietany ? zapamietany.replace(/\/$/, '') : '';
    }

    /* Błędy sieci liczymy po kolei; od drugiego z rzędu (jedno mrugnięcie wifi to nie powód) pytamy plik adresu —
       nie częściej niż co o.sprawdzAdresCoMs (30 s), bo przy prawdziwym braku sieci pytalibyśmy w kółko. Nowy adres:
       zapis w pamięci telefonu, strumień od nowa pod nowym adresem, kolejka jedzie dalej (to ta sama IndexedDB —
       źródło aplikacji się nie zmienia, zmienia się tylko adres huba). */
    let bledySieci = 0, ostatnieSprawdzenie = 0, sprawdzanie = null, synchronizujPonownie = false;
    function bladSieci() { bledySieci++; if (bledySieci >= 2) h.sprawdzAdresHuba().catch(() => {}); }
    /* Odpowiedź, która nie przyszła od huba: brak JSON-a przy 404/5xx (Cloudflare 530/1033 po zgaszonym tunelu,
       502 bramy, strona 404 GitHub Pages przy pustym adresie). Hub zawsze odpowiada JSON-em {"blad": …}. */
    const toNieHub = (status, dane) => status === 530 || (!dane && (status === 404 || status >= 500));

    function podajHubWorkerowi(rej) {
      if (rej && rej.active) rej.active.postMessage({ typ: 'hala-push-hub', hub: hub || location.origin });
    }

    h.sprawdzAdresHuba = async wymus => {
      if (zrodloHuba === 'opcja' || zrodloHuba === 'reczny') return false;
      if (sprawdzanie) return sprawdzanie;
      if (!wymus && Date.now() - ostatnieSprawdzenie < o.sprawdzAdresCoMs) return false;
      ostatnieSprawdzenie = Date.now();
      sprawdzanie = (async () => {
        const nowy = await czytajKonfiguracje(5000);
        if (!nowy || nowy === hub) return false;
        const stary = hub;
        hub = nowy; zrodloHuba = 'konfiguracja'; bledySieci = 0;
        await pamiec.zapisz('hub', nowy);
        emituj('hub', { stary, nowy });
        przerwijBiezacyStrumien();                     // strumień do starego adresu — od nowa pod nowym, bez czekania
        // Trwająca wysyłka idzie jeszcze pod stary adres i padnie — kolejka rusza pod nowy zaraz po niej, nie za 20 s.
        if (synchronizuje) synchronizujPonownie = true; else h.synchronizuj();
        // Service worker pyta hub o treść powiadomień sam — niech zna nowy adres od razu.
        try { if (pushMozliwy()) podajHubWorkerowi(await navigator.serviceWorker.getRegistration()); } catch (e) { /* bez workera */ }
        return true;
      })();
      try { return await sprawdzanie; } finally { sprawdzanie = null; }
    };

    function urzadzenie() {
      let u = ls && ls.getItem('hala.urzadzenie');
      if (!u) { u = uuid(); if (ls) ls.setItem('hala.urzadzenie', u); }
      return u;
    }

    async function api(metoda, sciezka, cialo, extra) {
      const nag = Object.assign({ 'X-Hala-Urzadzenie': urzadzenie() }, (extra && extra.naglowki) || {});
      const tokenZapytania = token;
      if (tokenZapytania) nag.Authorization = 'Bearer ' + tokenZapytania;
      let body = cialo;
      if (cialo !== undefined && !(cialo instanceof Blob)) { nag['Content-Type'] = 'application/json'; body = JSON.stringify(cialo); }
      const t0 = Date.now();
      let r;
      try { r = await fetch(hub + sciezka, { method: metoda, headers: nag, body, cache: 'no-store' }); }
      catch (e) { bladSieci(); throw e; }
      let dane = null;
      try { dane = await r.json(); } catch (e) { dane = null; }
      if (toNieHub(r.status, dane)) bladSieci(); else bledySieci = 0;
      if (dane && dane.czas_serwera) przesuniecieZegara = Date.parse(dane.czas_serwera) - (t0 + Date.now()) / 2;
      // 401 dotyczy sesji, z którą zapytanie wyszło. Spóźniona odpowiedź na zapytanie osoby,
      // która już wyszła, nie może wylogować następnej osoby na tym samym telefonie.
      if (r.status === 401 && tokenZapytania && token === tokenZapytania && !(extra && extra.bezSesji)) { await utracSesje(); }
      // odHuba: odpowiedź to JSON huba ({"blad": …}). 4xx BEZ niego to bramka po drodze (Cloudflare, proxy), nie decyzja
      // huba — wysyłka pliku traktuje to jak błąd sieci i ponawia, zamiast odrzucić plik na zawsze.
      // powod: pole „kod” huba (D43: wymagane_haslo, zly_pin, stara_wersja…) — e.kod zostaje kodem HTTP jak dotąd.
      if (!r.ok) { const e = new Error((dane && dane.blad) || `HTTP ${r.status}`); e.kod = r.status; e.odHuba = !!(dane && typeof dane === 'object');
        e.powod = (dane && typeof dane.kod === 'string') ? dane.kod : null; throw e; }
      return dane;
    }

    async function utracSesje() {
      token = null;
      await pamiec.usun('token');
      emituj('sesja', { zalogowany: false, pracownik: h.pracownik });
    }

    // --- widok = stan huba + zdarzenia z kolejki (optymistycznie)
    function przeliczWidok() {
      widok = new Map(stanSerwera);
      if (!h.kontrakt) return;
      for (const w of kolejkaCache) {
        const zd = w.zd;
        const spec = h.kontrakt.zdarzenia[zd.typ];
        if (!spec) continue;
        const klucz = spec.obiekt + '|' + zd.obiekt;
        const [nowy, konflikt] = zastosuj(h.kontrakt, widok.get(klucz) || null,
          Object.assign({ autor: w.autor, aplikacja: o.aplikacja }, zd));
        if (nowy && !konflikt) widok.set(klucz, Object.assign(nowy, { _oczekuje: true, numer: (widok.get(klucz) || {}).numer || null,
          etykieta: ((h.kontrakt.obiekty[nowy.typ] || {}).statusy || {})[nowy.status] || nowy.status }));
      }
    }

    h.obiekty = (typ, filtr) => {
      if (!widok) przeliczWidok();
      const lista = [];
      for (const [k, v] of widok) if (k.startsWith(typ + '|') && (!filtr || filtr(v))) lista.push(v);
      return lista.sort((a, b) => String(b.zmieniono).localeCompare(String(a.zmieniono)));
    };
    h.obiekt = (typ, id) => { if (!widok) przeliczWidok(); return widok.get(typ + '|' + id) || null; };
    /* Pełna historia obiektu (wszystkie jego zdarzenia) — tylko z sieci, na żądanie. */
    h.historia = async (typ, id) =>
      (await api('GET', `/api/v1/stan/${encodeURIComponent(typ)}/${encodeURIComponent(id)}?historia=1`)).obiekt.historia;
    /* Zapytanie do trasy rozszerzenia własnej aplikacji (<app>/serwer/rozszerzenie.py, KONTRAKT §7.1),
       np. hala.zapytaj('GET', '/api/v1/ur/kpi?od=…'). Tylko z siecią, bez kolejki — to odczyt albo
       polecenie, a nie fakt z hali (fakty idą przez hala.zapisz). Błąd huba rzuca Error z .kod jak reszta. */
    h.zapytaj = (metoda, sciezka, cialo) => {
      const wlasna = `/api/v1/${o.aplikacja}/`;
      // „..” przeglądarka rozwija przed wysłaniem — /api/v1/ur/../admin/… trafiłoby poza rozszerzenie.
      if (typeof sciezka !== 'string' || !sciezka.startsWith(wlasna) || /\/\.\.?(\/|$|\?)|\/\//.test(sciezka))
        return Promise.reject(new Error(`hala.zapytaj: tylko trasy rozszerzenia tej aplikacji (${wlasna}…)`));
      return api(metoda, sciezka, cialo);
    };
    /* Trasy administracji huba (/api/v1/admin/…: pracownicy, odblokowanie konta) — ekran administracji w Panelu.
       Uprawnienie sprawdza hub (tylko rola admin); tu pilnujemy tylko, żeby metoda nie była furtką do innych tras. */
    h.admin = (metoda, sciezka, cialo) => {
      if (typeof sciezka !== 'string' || !sciezka.startsWith('/api/v1/admin/') || /\/\.\.?(\/|$|\?)|\/\//.test(sciezka))
        return Promise.reject(new Error('hala.admin: tylko trasy /api/v1/admin/…'));
      return api(metoda, sciezka, cialo);
    };
    /* Zmiana własnego PIN-u (D32, D43 §4): obecne hasło ALBO obecny PIN + nowy PIN (4 cyfry). Hub kończy INNE sesje tej
       osoby i zaufanie urządzeń (po PIN-ie — oprócz tego: wysyłamy jego znacznik; po haśle — to dostaje nowy). Tylko
       z siecią. Zły obecny sekret to 403 (nie 401 — sesja trwa), błąd ma tekst po polsku do pokazania wprost. */
    h.zmienPin = async (stary, nowy) => {
      const z = h.pracownik ? znacznikDla(h.pracownik.nazwa) : null;
      const r = await api('POST', '/api/v1/zmien-pin', { stary: String(stary || ''), nowy: String(nowy || ''), znacznik: z ? z.znacznik : null });
      if (r && r.znacznik) zapamietajZnacznik(r, [h.pracownik.nazwa, h.pracownik.id]);
      return r;
    };
    /* Zmiana własnego hasła (D43 §4): obecne hasło + nowe. Hub kończy inne sesje i zaufanie WSZYSTKICH urządzeń osoby,
       a to urządzenie dostaje nowy znacznik (12 h) — zapisujemy go od razu. */
    h.zmienHaslo = async (stare, nowe) => {
      const r = await api('POST', '/api/v1/zmien-haslo', { stare: String(stare || ''), nowe: String(nowe || '') });
      if (r && r.znacznik && h.pracownik) {
        zapomnijOsobe(h.pracownik);
        zapamietajZnacznik(r, [h.pracownik.nazwa, h.pracownik.id]);
      }
      return r;
    };
    /* Zestawienie CSV z huba (GET /api/v1/eksport/<rodzaj>.csv?od=&do=) jako plik w urządzeniu. Plik idzie z tokenem
       w nagłówku (nie w adresie — adres zostaje w historii i dziennikach), więc fetch → blob → link „download”.
       Tylko z siecią: bez niej rzuca błąd jak każde zapytanie (aplikacja mówi „potrzebne połączenie z hubem”). */
    h.pobierz = async (sciezka, nazwaPliku) => {
      if (typeof sciezka !== 'string' || !sciezka.startsWith('/api/v1/eksport/') || /\/\.\.?(\/|$|\?)|\/\//.test(sciezka))
        throw new Error('hala.pobierz: tylko zestawienia /api/v1/eksport/…');
      const nag = { 'X-Hala-Urzadzenie': urzadzenie() };
      const tokenZapytania = token;
      if (tokenZapytania) nag.Authorization = 'Bearer ' + tokenZapytania;
      let r;
      try { r = await fetch(hub + sciezka, { method: 'GET', headers: nag, cache: 'no-store' }); }
      catch (e) { bladSieci(); throw e; }
      if (!r.ok) {
        let dane = null;
        try { dane = await r.json(); } catch (e) { dane = null; }
        if (toNieHub(r.status, dane)) bladSieci();
        if (r.status === 401 && tokenZapytania && token === tokenZapytania) await utracSesje();
        const e = new Error((dane && dane.blad) || `HTTP ${r.status}`); e.kod = r.status; throw e;
      }
      const plik = await r.blob();
      const z = /filename="([^"]+)"/.exec(r.headers && r.headers.get ? r.headers.get('Content-Disposition') || '' : '');
      const nazwa = nazwaPliku || (z && z[1]) || 'gk-zestawienie.csv';
      if (typeof document !== 'undefined' && document.createElement && typeof URL !== 'undefined' && URL.createObjectURL) {
        const adres = URL.createObjectURL(plik);
        const a = document.createElement('a');
        a.href = adres; a.download = nazwa; a.rel = 'noopener'; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(adres), 10000);   // przeglądarka musi zdążyć zacząć zapis
      }
      return { nazwa, rozmiar: plik.size };
    };
    h.etykieta = (typ, status) => ((h.kontrakt && h.kontrakt.obiekty[typ]) || { statusy: {} }).statusy[status] || status;

    function przyjmijStan(stan) {
      if (!stan) return false;
      if (stan.typ === 'slownik') {
        const d = stan.dane || {};
        if (!h.slowniki[d.slownik]) h.slowniki[d.slownik] = {};
        if (stan.aktywny) h.slowniki[d.slownik][d.klucz] = d.wartosc; else delete h.slowniki[d.slownik][d.klucz];
        pamiec.zapisz('slowniki', h.slowniki).catch(console.error);
        emituj('slowniki', { slownik: d.slownik, klucz: d.klucz });
        return false;
      }
      if (o.typy.length && !o.typy.includes(stan.typ)) return false;
      const byl = stanSerwera.get(stan.typ + '|' + stan.id);
      if (byl && byl.seq !== null && stan.seq !== null && stan.seq < byl.seq) return false;   // starsza migawka
      stanSerwera.set(stan.typ + '|' + stan.id, stan);
      return true;
    }

    /* Zamknięte obiekty starsze niż okno o.dni wypadają z pamięci — tak jak przy pełnym wczytaniu.
       Pełne wczytanie jest tylko przy logowaniu, a monitor w biurze ma sesję na 90 dni: bez tego
       stan rósłby bez końca i przy każdym zdarzeniu zapisywał się cały do IndexedDB. */
    let ostatnieCiecie = 0;
    function przytnijStan() {
      if (Date.now() - ostatnieCiecie < 600000) return;
      ostatnieCiecie = Date.now();
      const granica = iso(Date.now() - o.dni * 86400000);
      for (const [k, s] of stanSerwera) if (!s.aktywny && s.zmieniono && s.zmieniono < granica) stanSerwera.delete(k);
    }

    function przyjmijZdarzenia(lista) {
      const zmienione = [];
      for (const w of lista) {
        // Strumień i dociąganie działają równolegle — to samo zdarzenie potrafi przyjść dwa razy,
        // a spóźniona odpowiedź dociągania niesie starszy stan. Kursor seq rozstrzyga.
        if (w.zdarzenie.seq <= seq) continue;
        seq = w.zdarzenie.seq;
        if (przyjmijStan(w.stan)) zmienione.push(w.stan);
        emituj('zdarzenie', w.zdarzenie);
      }
      if (lista.length) {
        przytnijStan();
        przeliczWidok();
        zapiszStanPozniej();
        for (const s of zmienione) emituj('zmiana', { typ: s.typ, id: s.id, obiekt: h.obiekt(s.typ, s.id) });
      }
    }

    // --- pełne wczytanie stanu (start albo zbyt duża luka)
    async function wczytajWszystko() {
      const od = iso(Date.now() - o.dni * 86400000);
      // NAJMNIEJSZY seq z odpowiedzi: zdarzenia, które wpadły między pobraniem typu A i B,
      // zostaną dociągnięte jeszcze raz — ponowne przyjęcie stanu niczego nie psuje, pominięcie tak.
      const sl = await wczytajSlowniki();
      let nowySeq = sl.seq;
      const nowe = new Map();
      for (const typ of o.typy) {
        const r = await api('GET', `/api/v1/stan/${encodeURIComponent(typ)}?aktywne=1&od=${encodeURIComponent(od)}&limit=5000`);
        for (const s of r.obiekty) nowe.set(s.typ + '|' + s.id, s);
        nowySeq = Math.min(nowySeq, r.seq);
      }
      stanSerwera.clear();
      for (const [k, v] of nowe) stanSerwera.set(k, v);
      seq = nowySeq;
      // Epokę zapamiętujemy dopiero PO wczytaniu — przerwane wczytanie (sieć mrugnęła) powtórzy się przy następnym razie.
      const przywrocona = epoka !== null && innaEpoka(sl.epoka);
      if (typeof sl.epoka === 'string' && sl.epoka) { epoka = sl.epoka; await pamiec.zapisz('epoka', epoka); }
      przeliczWidok();
      zapiszStanPozniej();
      emituj('zmiana', { typ: '*' });
      if (przywrocona) {
        emituj('epoka', { epoka });
        odnowPush();                          // hub po przywróceniu ma nowy klucz powiadomień (kopia jest bez sekretów)
      }
    }

    async function wczytajSlowniki() {
      const r = await api('GET', '/api/v1/slowniki');
      h.slowniki = r.slowniki; h.pracownicy = r.pracownicy;
      await pamiec.zapisz('slowniki', h.slowniki);
      await pamiec.zapisz('pracownicy', h.pracownicy);
      emituj('slowniki', {});
      return { seq: r.seq, epoka: r.epoka };
    }

    async function wczytajKontrakt() {
      h.kontrakt = await api('GET', '/api/v1/kontrakt');
      await pamiec.zapisz('kontrakt', h.kontrakt);
    }

    // --- kolejka
    async function odswiezKolejke() {
      kolejkaCache = await dzialanie(db, 'kolejka', 'readonly', s => s.getAll());
      przeliczWidok();
      const odrz = await dzialanie(db, 'odrzucone', 'readonly', s => s.count());
      // moje = zapisy zalogowanej osoby — tylko te wysyłamy; cudze czekają na jej powrót (telefon bywa wspólny).
      emituj('kolejka', { oczekuje: kolejkaCache.length, moje: mojeWKolejce(), odrzucone: odrz });
    }

    h.nowyId = uuid;

    /* Zapis zdarzenia. Wraca od razu — sieć jest sprawą kolejki.
       obiekt: uuid nowego obiektu (h.nowyId()) albo klucz istniejącego.     */
    h.zapisz = async (typ, obiekt, dane, opcjeZapisu) => {
      if (!h.pracownik) throw new Error('Nikt nie jest zalogowany');
      if (h.kontrakt && !h.kontrakt.zdarzenia[typ]) throw new Error(`Nieznany typ zdarzenia: ${typ}`);
      // Wymagane zdjęcie / notatka (D31): hub i tak by odrzucił — mówimy od razu, zanim zapis trafi do kolejki.
      if (h.kontrakt) {
        const brak = brakWymagan(h.kontrakt, h.obiekt(h.kontrakt.zdarzenia[typ].obiekt, obiekt), { typ, dane: dane || {} });
        if (brak) throw new Error(brak);
      }
      // Czas zegara telefonu POPRAWIONY o znane przesunięcie względem huba (h.teraz), a nie surowy Date.now(): zapis
      // potrafi poleżeć w kolejce, a zegar w tym czasie przestawić się (ręcznie, po restarcie) — korekta z „wyslano”
      // w chwili wysyłki liczyłaby wtedy przesunięcie z innego zegara niż ten, który podał czas zdarzenia.
      const zd = { id: uuid(), typ, obiekt, czas: iso((opcjeZapisu && opcjeZapisu.czas) || h.teraz()), dane: dane || {} };
      await dzialanie(db, 'kolejka', 'readwrite', s => s.add({ zd, autor: h.pracownik.id, proby: 0, dodano: iso(Date.now()) }));
      await odswiezKolejke();
      const spec = h.kontrakt && h.kontrakt.zdarzenia[typ];
      if (spec) emituj('zmiana', { typ: spec.obiekt, id: obiekt, obiekt: h.obiekt(spec.obiekt, obiekt) });
      h.synchronizuj();
      return zd;
    };

    /* Zdjęcie (albo PDF) do kolejki. Zwraca id do wpisania w pole typu 'pliki'. */
    h.dodajPlik = async (plik, opcjePliku) => {
      const op = Object.assign({ maks: 1600, jakosc: 0.8 }, opcjePliku || {});
      let blob = plik;
      if (plik.type && plik.type.startsWith('image/') && op.maks) blob = await zmniejszZdjecie(plik, op.maks, op.jakosc);
      const id = uuid();
      await dzialanie(db, 'pliki', 'readwrite', s => s.put({ id, blob, mime: blob.type || plik.type, wyslany: false, autor: h.pracownik && h.pracownik.id }));
      h.synchronizuj();
      return id;
    };

    const adresyLokalne = new Map();
    h.adresPliku = async id => {
      if (adresyLokalne.has(id)) return adresyLokalne.get(id);
      const w = await dzialanie(db, 'pliki', 'readonly', s => s.get(id));
      if (w && w.blob) { const u = URL.createObjectURL(w.blob); adresyLokalne.set(id, u); return u; }
      return `${hub}/api/v1/pliki/${encodeURIComponent(id)}`;
    };

    h.odrzucone = () => dzialanie(db, 'odrzucone', 'readonly', s => s.getAll());
    h.usunOdrzucone = async id => { await dzialanie(db, 'odrzucone', 'readwrite', s => s.delete(id)); await odswiezKolejke(); };
    const mojeWKolejce = () => (h.pracownik ? kolejkaCache.filter(w => w.autor === h.pracownik.id).length : 0);
    h.stanKolejki = () => ({ oczekuje: kolejkaCache.length, moje: mojeWKolejce(), pozycje: kolejkaCache.map(w => w.zd) });

    // --- synchronizacja: najpierw pliki, potem zdarzenia, potem to, co nowego w hubie
    h.synchronizuj = async () => {
      if (synchronizuje || !token || !db) return;
      synchronizuje = true;
      try {
        const pliki = await dzialanie(db, 'pliki', 'readonly', s => s.getAll());
        let bladPlikow = null;
        for (const p of pliki.filter(p => !p.wyslany && !p.odrzucony && (!p.autor || p.autor === h.pracownik.id))) {
          try {
            await api('PUT', `/api/v1/pliki/${encodeURIComponent(p.id)}`, p.blob, { naglowki: { 'Content-Type': p.mime || 'image/jpeg' } });
            p.wyslany = true; p.wyslanyKiedy = Date.now();
          } catch (e) {
            if (e.kod === 401) throw e;                  // sesja skończona — nic dalej nie pójdzie
            // Kłopot huba albo drogi, a nie pliku: 5xx (507 = pełny dysk, dobowy limit), brak odpowiedzi, 4xx bez JSON-a
            // (strona błędu Cloudflare, bramy) — plik czeka w telefonie i pójdzie później. Przerywamy tylko PLIKI:
            // zdarzenia (np. zgłoszenie awarii) idą dalej — zdjęcie dojdzie, gdy hub znowu je przyjmie (etap 1).
            if (!e.kod || e.kod >= 500 || !e.odHuba) { bladPlikow = e; break; }
            // Hub świadomie nie przyjął pliku (typ, rozmiar): plik zostaje w telefonie z powodem.
            p.odrzucony = e.message;
            emituj('odrzucone', { plik: p.id, powod: e.message });
          }
          await dzialanie(db, 'pliki', 'readwrite', s => s.put(p));
        }
        let moje = kolejkaCache.filter(w => w.autor === h.pracownik.id);
        let rozmiar = PACZKA;
        while (moje.length) {
          const paczka = moje.slice(0, rozmiar);
          let r;
          try {
            // „wyslano” w tej samej skali co czas zdarzeń (h.teraz) — hub dorzuca tylko różnicę, której telefon jeszcze nie znał.
            r = await api('POST', '/api/v1/zdarzenia', { wyslano: iso(h.teraz()), zdarzenia: paczka.map(w => w.zd) });
          } catch (e) {
            if (e.kod === 413 && rozmiar > 1) { rozmiar = Math.ceil(rozmiar / 2); continue; }   // za duża paczka — dzielimy
            throw e;
          }
          const wyniki = new Map(r.wyniki.map(w => [w.id, w]));
          await new Promise((ok, zle) => {
            const t = db.transaction(['kolejka', 'odrzucone'], 'readwrite');
            for (const w of paczka) {
              const wynik = wyniki.get(w.zd.id);
              if (!wynik) continue;
              if (wynik.status === 'odrzucone') t.objectStore('odrzucone').put({ id: w.zd.id, zd: w.zd, powod: wynik.powod, kiedy: iso(Date.now()) });
              t.objectStore('kolejka').delete(w.nr);
              // Konflikt (stan się nie zmienił) aplikacje pokazują jako „ktoś zmienił to wcześniej”; sam poprawiony czas
              // telefonu (etap 1) to nie konflikt — osobny sygnał 'uwaga', żeby nie straszyć człowieka nieprawdą.
              if (wynik.uwaga) emituj(jestKonflikt(wynik.uwaga) ? 'konflikt' : 'uwaga', { zdarzenie: w.zd, uwaga: wynik.uwaga });
            }
            t.oncomplete = ok; t.onerror = () => zle(t.error);
            t.onabort = () => zle(t.error || new Error('Zapis w telefonie przerwany (brak miejsca?)'));
          });
          for (const w of paczka) { const x = wyniki.get(w.zd.id); if (x && x.status === 'odrzucone') emituj('odrzucone', { zdarzenie: w.zd, powod: x.powod }); }
          await odswiezKolejke();
          moje = kolejkaCache.filter(w => w.autor === h.pracownik.id);
          if (paczka.every(w => !wyniki.has(w.zd.id))) break;       // hub nic nie rozpoznał — nie kręcimy się w kółko
        }
        await dociagnij();
        h.polaczenie.ostatniaSynchronizacja = iso(Date.now());
        h.polaczenie.blad = null;
        // Zdarzenia doszły, zdjęcia czekają — osobne pole, bo `blad` aplikacje czytają jako „brak połączenia z hubem”.
        // Kolejna synchronizacja (co 20 s) ponowi pliki.
        h.polaczenie.bladPlikow = bladPlikow ? bladPlikow.message : null;
      } catch (e) {
        h.polaczenie.blad = e.message;
      } finally {
        synchronizuje = false;
        emituj('polaczenie', Object.assign({}, h.polaczenie));
        if (synchronizujPonownie) { synchronizujPonownie = false; setTimeout(() => h.synchronizuj(), 0); }
      }
    };

    async function dociagnij() {
      for (let i = 0; i < 50; i++) {
        const r = await api('GET', `/api/v1/zdarzenia?po=${seq}&stan=1&limit=500`);
        // Hub ma MNIEJ zdarzeń, niż telefon już widział: baza odtworzona z kopii albo nowa. Kursor
        // „z przyszłości” zablokowałby dociąganie na zawsze — wczytujemy wszystko od nowa. Inna epoka (etap 2) łapie
        // też przypadek, gdy przywrócona baza zdążyła już dobić do numeru, który telefon widział.
        if (innaEpoka(r.epoka) || r.ostatni_seq < seq || r.ostatni_seq - seq > 5000) { await wczytajWszystko(); return; }
        przyjmijZdarzenia(r.zdarzenia);
        if (!r.wiecej) return;
      }
    }

    // --- strumień na żywo (SSE czytane przez fetch, żeby wysłać nagłówek z tokenem)
    /* Strumień należy do sesji, która go otworzyła. Po „Wyjdź” i zalogowaniu następnej osoby
       na tym samym telefonie stary strumień (stary token) musi się zamknąć: hub przy najbliższym
       budzeniu wysłałby w nim „wylogowany”, a to wylogowałoby NOWĄ osobę. Dlatego: przerwanie
       przy wylogowaniu (AbortController) i sprawdzanie tokenu przy każdym komunikacie.       */
    let przerwijStrumien = null, obudzStrumien = null;
    /* Zmiana osoby (albo brak sieci): zamknij bieżący strumień i przerwij przerwę przed ponownym
       łączeniem — inaczej następna osoba czekała do 30 s na strumień na żywo. */
    function przerwijBiezacyStrumien() {
      if (przerwijStrumien) przerwijStrumien.abort();
      if (obudzStrumien) obudzStrumien();
    }
    async function strumien() {
      if (strumienAktywny) return;
      strumienAktywny = true;
      let przerwa = 2000;
      while (token) {
        const mojToken = token, mojHub = hub;
        const przerwij = typeof AbortController !== 'undefined' ? new AbortController() : null;
        przerwijStrumien = przerwij;
        // Strażnik ciszy: półotwarte połączenie (wifi przeskoczyło między punktami dostępowymi) nie kończy
        // read() nigdy — pasek pokazywałby „połączono”, a na ekran nic by nie przychodziło.
        let straznik = null, zegarWitaj = null, witaj = false, buforowany = false, odNowa = false;
        const pilnuj = () => { clearTimeout(straznik); if (przerwij) straznik = setTimeout(() => przerwij.abort(), o.ciszaStrumieniaMs); };
        try {
          if (!navigator.onLine) { await new Promise(ok => global.addEventListener('online', ok, { once: true })); }
          if (!h.kontrakt) await wczytajKontrakt();      // logowanie przerwane w połowie (sieć mrugnęła)
          await dociagnij();
          if (token !== mojToken) continue;
          if (hub !== mojHub) continue;                   // adres huba zmienił się w trakcie dociągania
          let r;
          try {
            r = await fetch(`${hub}/api/v1/strumien?po=${seq}`, {
              headers: { Authorization: 'Bearer ' + mojToken, 'X-Hala-Urzadzenie': urzadzenie() }, cache: 'no-store',
              signal: przerwij ? przerwij.signal : undefined });
          } catch (e) { if (!(przerwij && przerwij.signal.aborted)) bladSieci(); throw e; }
          if (r.status === 401) { if (token === mojToken) { await utracSesje(); break; } continue; }
          // Strumienia nie czytamy jako JSON — o „to nie hub” mówią same kody bram Cloudflare i strona 404/405 Pages.
          if ([404, 405, 502, 504, 521, 522, 523, 524, 530].includes(r.status)) bladSieci();
          if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
          h.polaczenie.strumien = true; emituj('polaczenie', Object.assign({}, h.polaczenie));
          przerwa = 2000;
          pilnuj();
          /* Szybki tunel Cloudflare i niektóre pośredniki oddają nagłówki, a treść trzymają (buforują SSE):
             pasek mówiłby „połączono”, a zmiany od innych nie przychodziłyby wcale. Hub wysyła „witaj”
             natychmiast — jego brak oznacza taki strumień (prośba KJ 2026-09-25-kj-tunel-sse). */
          if (przerwij) zegarWitaj = setTimeout(() => { if (!witaj) { buforowany = true; przerwij.abort(); } }, o.czekajWitajMs);
          const czytnik = r.body.getReader();
          const dekoder = new TextDecoder();
          let bufor = '', dalej = true;
          while (dalej) {
            const { value, done } = await czytnik.read();
            pilnuj();
            if (done || token !== mojToken) break;
            bufor += dekoder.decode(value, { stream: true });
            let i;
            while ((i = bufor.indexOf('\n\n')) >= 0) {
              const blok = bufor.slice(0, i); bufor = bufor.slice(i + 2);
              let nazwa = 'message', dane = '';
              for (const linia of blok.split('\n')) {
                if (linia.startsWith('event:')) nazwa = linia.slice(6).trim();
                else if (linia.startsWith('data:')) dane += linia.slice(5).trim();
              }
              if (nazwa === 'zdarzenie') przyjmijZdarzenia([JSON.parse(dane)]);
              else if (nazwa === 'witaj') {
                witaj = true; clearTimeout(zegarWitaj);
                const w = JSON.parse(dane);
                if (w.czas_serwera) przesuniecieZegara = Date.parse(w.czas_serwera) - Date.now();
                // Baza przywrócona między dociągnięciem a otwarciem strumienia: wszystko od nowa, potem strumień od nowa
                // z nowym kursorem (ten był otwarty ze starym seq i pominąłby zdarzenia o „znanych” numerach).
                if (innaEpoka(w.epoka)) { await wczytajWszystko(); odNowa = true; dalej = false; break; }
              }
              else if (nazwa === 'za_duzo') await wczytajWszystko();
              else if (nazwa === 'wylogowany') { if (token === mojToken) await utracSesje(); dalej = false; break; }
            }
          }
          try { czytnik.cancel(); } catch (e) { /* już zamknięty */ }
        } catch (e) {
          if (token === mojToken) h.polaczenie.blad = e.message;     // przerwany przy zmianie osoby — to nie błąd sieci
        } finally {
          // Zawsze zamykamy połączenie — także po błędzie w środku (zły JSON, !r.ok). Przeglądarka daje
          // ~6 połączeń na adres; kilka wiszących strumieni blokowało każde zapytanie do huba.
          clearTimeout(straznik); clearTimeout(zegarWitaj);
          if (przerwij) przerwij.abort();
        }
        h.polaczenie.strumien = false; emituj('polaczenie', Object.assign({}, h.polaczenie));
        if (!token) break;
        if (token !== mojToken) { przerwa = 2000; continue; }      // inna osoba — od razu jej własny strumień
        if (hub !== mojHub) { przerwa = 2000; continue; }          // nowy adres huba (D33) — od razu pod nowym
        if (odNowa) { przerwa = 2000; continue; }                  // nowa epoka bazy — od razu z nowym kursorem
        if (buforowany) {
          // Zamiast łączyć zatrzymany strumień w kółko (pasek migałby co 45 s): dociąganie co kilka sekund,
          // a po ponowStrumienMs jeszcze jedna próba strumienia (sieć mogła się zmienić, np. telefon wrócił na wifi).
          h.polaczenie.dociaganie = true; h.polaczenie.blad = null;
          emituj('polaczenie', Object.assign({}, h.polaczenie));
          const koniec = Date.now() + o.ponowStrumienMs;
          while (token === mojToken && hub === mojHub && Date.now() < koniec) {
            await new Promise(ok => { const t = setTimeout(ok, o.dociaganieMs); obudzStrumien = () => { clearTimeout(t); ok(); }; });
            obudzStrumien = null;
            if (token !== mojToken) break;
            try { await dociagnij(); h.polaczenie.ostatniaSynchronizacja = iso(Date.now()); h.polaczenie.blad = null; }
            catch (e) { h.polaczenie.blad = e.message; }
            emituj('polaczenie', Object.assign({}, h.polaczenie));
          }
          h.polaczenie.dociaganie = false;
          przerwa = 2000;
          continue;
        }
        await new Promise(ok => { const t = setTimeout(ok, przerwa); obudzStrumien = () => { clearTimeout(t); ok(); }; });
        obudzStrumien = null;
        przerwa = Math.min(przerwa * 2, 30000);
      }
      strumienAktywny = false;
    }

    // --- znaczniki urządzenia (D43 §2): hasło raz na 12 godzin na tym urządzeniu, na co dzień PIN 4 cyfry
    /* Hub po dobrym haśle wydaje znacznik (losowy, 12 h). Trzymamy go per osoba — na wspólnym telefonie lidera loguje
       się kilka osób — w localStorage TEJ aplikacji (klucz hala.<app>.znaczniki; na Pages wszystkie aplikacje dzielą
       źródło, więc przedrostek aplikacji, D33). Mapa: login (imię i nazwisko, karta, id — po loginZNazwy) → {znacznik, do}.
       Wylogowanie go nie kasuje — po to jest: następne logowanie tej osoby PIN-em. */
    // Klucz zawsze z przedrostkiem 'hala.' (t_dostep.py → WspolneZrodlo sprawdza wszystkie getItem/setItem).
    function czytajZnaczniki() {
      try { const m = JSON.parse((ls && ls.getItem('hala.' + o.aplikacja + '.znaczniki')) || '{}'); return m && typeof m === 'object' ? m : {}; }
      catch (e) { return {}; }
    }
    function zapiszZnaczniki(m) {
      try { if (ls) ls.setItem('hala.' + o.aplikacja + '.znaczniki', JSON.stringify(m)); } catch (e) { /* pełna pamięć — następnym razem hasło */ }
    }
    function znacznikDla(ident) {
      const k = loginZNazwy(ident);
      const w = k ? czytajZnaczniki()[k] : null;
      return w && typeof w.znacznik === 'string' && Date.parse(w.do) > h.teraz() ? w : null;
    }
    function zapamietajZnacznik(r, klucze) {
      const m = czytajZnaczniki();
      const teraz = h.teraz();
      for (const k of Object.keys(m)) if (!(Date.parse(m[k] && m[k].do) > teraz)) delete m[k];   // sprzątanie wygasłych
      for (const k of klucze.map(loginZNazwy).filter(Boolean)) m[k] = { znacznik: r.znacznik, do: r.znacznik_do };
      zapiszZnaczniki(m);
    }
    function zapomnijZnacznik(znacznik) {
      if (!znacznik) return;
      const m = czytajZnaczniki();
      for (const k of Object.keys(m)) if (m[k] && m[k].znacznik === znacznik) delete m[k];
      zapiszZnaczniki(m);
    }
    function zapomnijOsobe(p) {
      for (const k of [p && p.nazwa, p && p.id]) { const z = znacznikDla(k); if (z) zapomnijZnacznik(z.znacznik); }
    }
    /* 'pin' — ta osoba ma na tym urządzeniu ważny znacznik (pole „PIN (4 cyfry)”), inaczej 'haslo'. */
    h.trybLogowania = ident => (znacznikDla(ident) ? 'pin' : 'haslo');
    h.loginZNazwy = loginZNazwy;

    // --- sesja
    h.zalogowany = () => !!token;
    let ustawienie = null;           // sesja „tylko do ustawienia hasła i PIN-u” (D43 §3a) — tylko w pamięci
    /* dane: { identyfikator, pin } (D24; identyfikator = kod z karty albo login; „pin” to sekret — hasło albo PIN).
       D43: dokładamy znacznik urządzenia tej osoby (null, gdy go nie ma — hub wie wtedy, że klient zna D43).
       Błąd 401 „wymagane_haslo” — znacznik nieważny (12 h minęło, 5 złych PIN-ów): zapominamy go, aplikacja
       przełącza pole na hasło (HalaKonto.poleLogowania). Hasło startowe / brak PIN-u: hub daje sesję tylko do okna
       „Ustaw hasło i PIN” — rzucamy błąd z kod 'do_ustawienia' (HalaKonto.zaloguj otwiera okno i woła ustawKonto). */
    h.zaloguj = async dane => {
      const ident = String((dane && dane.identyfikator) || '');
      const z = znacznikDla(ident);
      let r;
      try {
        r = await api('POST', '/api/v1/logowanie', Object.assign({ aplikacja: o.aplikacja, znacznik: z ? z.znacznik : null }, dane),
                      { bezSesji: true });
      } catch (e) {
        if (e && e.powod === 'wymagane_haslo' && z) zapomnijZnacznik(z.znacznik);
        throw e;
      }
      if (r.znacznik) zapamietajZnacznik(r, [ident, r.pracownik && r.pracownik.nazwa, r.pracownik && r.pracownik.id]);
      if (r.do_ustawienia && r.do_ustawienia.length) {
        ustawienie = { token: r.token, pracownik: r.pracownik, doUstawienia: r.do_ustawienia.slice(), ident };
        const e = new Error('Ustaw nowe hasło i PIN.');
        e.kod = 'do_ustawienia'; e.doUstawienia = ustawienie.doUstawienia; e.pracownik = r.pracownik;
        throw e;
      }
      return zakonczLogowanie(r);
    };
    /* Okno „Ustaw hasło i PIN” po pierwszym logowaniu (D43 §3a): { haslo?, pin? } → POST /ustaw-konto tokenem sesji
       ustawienia. Hub ustawia, kończy wszystkie sesje i znaczniki osoby, daje znacznik tego urządzenia i pełną sesję
       (albo brak_dostepu, gdy rola nie otwiera tej aplikacji — wtedy błąd 403 z tekstem huba). */
    h.ustawienieKonta = () => (ustawienie ? { pracownik: ustawienie.pracownik, doUstawienia: ustawienie.doUstawienia.slice() } : null);
    h.ustawKonto = async dane => {
      if (!ustawienie) { const e = new Error('Zaloguj się ponownie'); e.kod = 401; throw e; }
      const u = ustawienie;
      const r = await api('POST', '/api/v1/ustaw-konto', { haslo: String((dane && dane.haslo) || ''), pin: String((dane && dane.pin) || '') },
                          { bezSesji: true, naglowki: { Authorization: 'Bearer ' + u.token } });
      ustawienie = null;
      if (r.znacznik) {
        zapomnijOsobe(r.pracownik);
        zapamietajZnacznik(r, [u.ident, r.pracownik && r.pracownik.nazwa, r.pracownik && r.pracownik.id]);
      }
      if (!r.token) { const e = new Error(r.brak_dostepu || 'Brak dostępu do tej aplikacji'); e.kod = 403; e.ustawione = true; throw e; }
      return zakonczLogowanie(r);
    };
    h.anulujUstawienie = () => { ustawienie = null; };
    async function zakonczLogowanie(r) {
      h.pracownik = r.pracownik;
      await pamiec.zapisz('pracownik', h.pracownik);     // najpierw osoba, potem token (patrz start)
      token = r.token;
      przerwijBiezacyStrumien();                         // zmiana osoby bez „Wyjdź”: strumień poprzedniej sesji
      await pamiec.zapisz('token', token);
      try {
        await wczytajKontrakt();
        await wczytajWszystko();                         // razem ze słownikami
      } finally {
        // Sesja jest, nawet gdy sieć mrugnęła w trakcie wczytywania: synchronizacja i strumień muszą ruszyć
        // (strumień dociągnie kontrakt i stan). Wcześniej aplikacja stała bez połączenia do przeładowania.
        emituj('sesja', { zalogowany: true, pracownik: h.pracownik });
        h.synchronizuj(); strumien();
        odnowPush();
      }
      return h.pracownik;
    }
    h.wyloguj = async () => {
      const stary = token;
      token = null;
      przerwijBiezacyStrumien();
      await pamiec.usun('token');
      // Kolejka ZOSTAJE: zapisy tej osoby poczekają, aż zaloguje się ponownie.
      emituj('sesja', { zalogowany: false, pracownik: h.pracownik });
      // Wylogowanie w hubie w tle, bez czekania: przy hubie, który nie odpowiada (wifi jest, huba nie ma),
      // „Wyjdź” wisiało do limitu TCP, a następna osoba nie mogła się zalogować.
      if (stary && navigator.onLine) {
        const naglowki = { Authorization: 'Bearer ' + stary, 'X-Hala-Urzadzenie': urzadzenie(), 'Content-Type': 'application/json' };
        // Najpierw wypisanie telefonu z powiadomień push TEJ osoby (wspólny telefon: następna osoba nie może
        // dostawać cudzych awarii), dopiero potem koniec sesji — po nim stary token już nic nie może.
        subskrypcjaPush()
          .then(sub => sub && fetch(hub + '/api/v1/push/wypisz', { method: 'POST', cache: 'no-store', headers: naglowki,
                                                                  body: JSON.stringify({ endpoint: sub.endpoint }) }))
          .catch(() => {})
          .then(() => fetch(hub + '/api/v1/wyloguj', { method: 'POST', cache: 'no-store', body: '{}', headers: naglowki }))
          .catch(() => {});
      }
    };

    // --- powiadomienia push przy zamkniętej aplikacji (O4 → D28)
    /* Telefon zapisuje się u serwera push swojej przeglądarki (klucz VAPID huba), a adres subskrypcji oddaje
       hubowi. Hub po awarii / zleceniu wysyła pusty push, a service worker aplikacji (wspolne/hala-push-sw.js)
       dociąga treść. Działa tylko pod HTTPS (albo localhost); na iPhonie — z aplikacją dodaną do ekranu
       początkowego (iOS 16.4+). */
    const pushMozliwy = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      && typeof global.PushManager !== 'undefined' && typeof global.Notification !== 'undefined';
    async function subskrypcjaPush() {
      if (!pushMozliwy()) return null;
      const rej = await navigator.serviceWorker.getRegistration();
      return rej ? rej.pushManager.getSubscription() : null;
    }
    const zB64u = t => { const b = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - t.length % 4) % 4));
      return Uint8Array.from(b, c => c.charCodeAt(0)); };

    // Worker pyta hub o treść powiadomienia sam — musi znać jego adres (hub bywa pod innym adresem niż aplikacja):
    // podajHubWorkerowi (wyżej, przy adresie huba) po włączeniu, po logowaniu i po zmianie adresu.

    h.push = {
      /* 'niedostepne' (przeglądarka/HTTP) | 'zablokowane' (odmowa w ustawieniach) | 'wlaczone' | 'wylaczone' */
      async stan() {
        if (!pushMozliwy() || !global.isSecureContext) return 'niedostepne';
        if (Notification.permission === 'denied') return 'zablokowane';
        return (await subskrypcjaPush()) && (await pamiec.czytaj('push')) ? 'wlaczone' : 'wylaczone';
      },
      async wlacz() {
        if (!pushMozliwy() || !global.isSecureContext) throw new Error('Ta przeglądarka nie obsługuje powiadomień przy zamkniętej aplikacji (potrzebne https, a na iPhonie aplikacja na ekranie początkowym).');
        if (await Notification.requestPermission() !== 'granted') throw new Error('Powiadomienia są zablokowane — zezwól na nie w ustawieniach przeglądarki dla tej strony.');
        const rej = await navigator.serviceWorker.ready;
        const { klucz } = await api('GET', '/api/v1/push/klucz');
        let sub = await rej.pushManager.getSubscription();
        if (!sub) sub = await rej.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: zB64u(klucz) });
        await api('POST', '/api/v1/push/zapisz', { subskrypcja: sub.toJSON() });
        podajHubWorkerowi(rej);
        await pamiec.zapisz('push', true);
        await pamiec.zapisz('push-klucz', klucz);
      },
      async wylacz() {
        const sub = await subskrypcjaPush();
        if (sub) {
          try { await api('POST', '/api/v1/push/wypisz', { endpoint: sub.endpoint }); } catch (e) { /* bez sieci — hub wypisze po 410 */ }
          await sub.unsubscribe();
        }
        await pamiec.zapisz('push', false);
      },
    };
    // Po zalogowaniu na telefonie z włączonymi powiadomieniami: przypisz subskrypcję do NOWEJ osoby.
    /* Etap 2: hub przywrócony z kopii ma NOWY klucz VAPID (kopia poza komputerem jest bez sekretów), a subskrypcja
       zrobiona pod starym kluczem jest martwa — telefon przestałby dostawać powiadomienia po cichu. Zgoda już jest,
       więc zapisujemy telefon pod nowym kluczem bez pytania człowieka. */
    const doB64u = bufor => btoa(String.fromCharCode.apply(null, new Uint8Array(bufor)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    async function odnowPush() {
      try {
        if (!(await pamiec.czytaj('push')) || !pushMozliwy() || Notification.permission !== 'granted') return;
        let sub = await subskrypcjaPush();
        const { klucz } = await api('GET', '/api/v1/push/klucz');
        const kluczSub = sub && sub.options && sub.options.applicationServerKey ? doB64u(sub.options.applicationServerKey)
          : await pamiec.czytaj('push-klucz');
        if (sub && kluczSub && kluczSub !== klucz) { try { await sub.unsubscribe(); } catch (e) { /* i tak zrobimy nową */ } sub = null; }
        const rej = await navigator.serviceWorker.ready;
        if (!sub) sub = await rej.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: zB64u(klucz) });
        await api('POST', '/api/v1/push/zapisz', { subskrypcja: sub.toJSON() });
        await pamiec.zapisz('push-klucz', klucz);
        podajHubWorkerowi(rej);
      } catch (e) { /* spróbujemy przy następnym logowaniu */ }
    }

    // --- brudnopisy: ciągły auto-zapis formularzy, zanim staną się zdarzeniem
    const brudnopisyCzekajace = new Map();
    let brudnopisTimer = null;
    function zrzucBrudnopisy() {
      clearTimeout(brudnopisTimer);
      const wpisy = Array.from(brudnopisyCzekajace.entries()); brudnopisyCzekajace.clear();
      return Promise.all(wpisy.map(([k, v]) => (v === undefined ? pamiec.usun(k) : pamiec.zapisz(k, v))));
    }
    const kluczB = k => `brudnopis:${h.pracownik ? h.pracownik.id : '-'}:${k}`;
    h.brudnopis = {
      /* Pisanie odkładamy o 300 ms (każdy znak nie musi iść do IndexedDB). Ważne chwile — skan (dowód obecności
         z godziną), zdjęcie — { odrazu: true }: zapis teraz, obietnica kończy się po zatwierdzeniu w telefonie.
         Bez tego przeładowanie albo padnięty telefon tuż po skanie gubiły zeskanowane stanowisko. */
      zapisz(k, v, opcjeB) {
        brudnopisyCzekajace.set(kluczB(k), kopia(v)); clearTimeout(brudnopisTimer);
        if (opcjeB && opcjeB.odrazu) return zrzucBrudnopisy();
        brudnopisTimer = setTimeout(zrzucBrudnopisy, 300);
        return Promise.resolve();
      },
      async odczytaj(k) { const kk = kluczB(k); return brudnopisyCzekajace.has(kk) ? brudnopisyCzekajace.get(kk) : pamiec.czytaj(kk); },
      usun(k) { brudnopisyCzekajace.set(kluczB(k), undefined); return zrzucBrudnopisy(); },
    };

    // --- czas
    h.teraz = () => Date.now() + przesuniecieZegara;
    h.zmianaTeraz = () => zmianaDla(h.teraz(), h.slowniki.zmiany);
    h.ustawienie = (klucz, domyslna) => {
      const w = (h.slowniki.ustawienia || {})[klucz];
      return w && w.wartosc !== undefined ? w.wartosc : domyslna;
    };

    // --- start
    h.start = async () => {
      db = await otworzBaze('hala-' + o.aplikacja);
      hub = await ustalHub();
      token = (await pamiec.czytaj('token')) || null;
      h.pracownik = (await pamiec.czytaj('pracownik')) || null;
      if (token && !h.pracownik) token = null;     // karta zamknięta między zapisem tokenu a pracownika
      h.kontrakt = (await pamiec.czytaj('kontrakt')) || null;
      h.slowniki = (await pamiec.czytaj('slowniki')) || {};
      h.pracownicy = (await pamiec.czytaj('pracownicy')) || [];
      seq = (await pamiec.czytaj('seq')) || 0;
      epoka = (await pamiec.czytaj('epoka')) || null;
      for (const s of (await pamiec.czytaj('stan')) || []) stanSerwera.set(s.typ + '|' + s.id, s);
      // Wysłane zdjęcia są już w hubie — telefon trzyma je tydzień (podgląd bez sieci), potem zwalnia miejsce.
      const tydzien = Date.now() - 7 * 86400000;
      dzialanie(db, 'pliki', 'readwrite', s => {
        s.openCursor().onsuccess = ev => {
          const k = ev.target.result;
          if (!k) return;
          if (k.value.wyslany && (k.value.wyslanyKiedy || 0) < tydzien) k.delete();
          k.continue();
        };
      }).catch(() => {});
      await odswiezKolejke();
      global.addEventListener('online', () => { h.polaczenie.online = true; emituj('polaczenie', Object.assign({}, h.polaczenie)); h.synchronizuj(); });
      global.addEventListener('offline', () => {
        h.polaczenie.online = false; emituj('polaczenie', Object.assign({}, h.polaczenie));
        if (przerwijStrumien) przerwijStrumien.abort();   // martwy strumień — po powrocie sieci połączy się od nowa
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') zrzucBrudnopisy(); else h.synchronizuj();
      });
      global.addEventListener('pagehide', zrzucBrudnopisy);
      setInterval(() => h.synchronizuj(), 20000);
      if (token) {
        // Bez sieci startujemy z pamięci telefonu; odświeżenie przyjdzie samo.
        // Inna epoka niż zapamiętana (baza przywrócona, gdy telefon/monitor był wyłączony) — wszystko od nowa od razu.
        Promise.all([wczytajKontrakt(), wczytajSlowniki()])
          .then(([, sl]) => (seq && !innaEpoka(sl.epoka) ? null : wczytajWszystko()))
          .catch(() => {})
          .finally(() => { if (token) { h.synchronizuj(); strumien(); } });
      }
      return h;
    };

    h._wewn = { api, get hub() { return hub; } };   // dla narzędzi i testów
    return h;
  }

  const Hala = {
    WERSJA: WERSJA_KLIENTA, utworz, uuid, zastosuj, brakWymagan, zmianaDla, przesuniecieZakladu, lokalny, zLokalnego,
    szablonDla, pozycjeZSzablonu, kolorChecklisty, przestojMs, czasNaprawyMs, czasReakcjiMs, formatCzasu, formatLicznika,
    odczytajKod, zmniejszZdjecie, wystapieniaStale, opisTerminu, jestKonflikt, UWAGA_CZASU,
    kpiAwarii, OPIS_MTBF, przestojWOknieMs, alertAktywny, loginZNazwy, moznaAnulowacZlecenie, wskaznikiOkresu,
  };
  global.Hala = Hala;
  if (typeof module !== 'undefined' && module.exports) module.exports = Hala;
})(typeof window !== 'undefined' ? window : globalThis);
