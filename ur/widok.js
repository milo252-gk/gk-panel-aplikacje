/* Aplikacja UR — co pokazać i co wolno zapisać (bez rysowania).

   Czyste funkcje: dostają obiekty ze stanu (hala.obiekty…), słowniki, kontrakt
   i „teraz”, a oddają gotowe wiersze albo listę błędów formularza. Nie dotykają
   DOM ani sieci, więc ur/testy/widok-testy.js liczy je w Node / JavaScriptCore
   dokładnie tak, jak liczy je telefon mechanika.

   Czasy awarii bierzemy WYŁĄCZNIE z Hala.przestojMs / czasNaprawyMs / czasReakcjiMs
   (D7, D8) — Panel pokazuje ten sam licznik i te same liczby muszą się zgadzać.
   KPI liczy wspólne Hala.kpiAwarii (etap 3, D37), a hub to samo przez kpi_awarii (ur/serwer/rozszerzenie.py → kpi);
   wektory ur/testy/wektory-kpi.json pilnują, że obie strony dokładają nazwy tak samo.                     */

(function (global) {
  'use strict';

  const H = () => global.Hala;

  // ------------------------------------------------------------ drobiazgi (jak w KJ)

  // Same spacje to puste pole, nie zero: Number('  ') === 0, a odczyt licznika „0 mth” po cichu zerował licznik maszyny
  // (przegląd 2026-10-06).
  const liczba = v => (typeof v === 'number' && isFinite(v) ? v
    : (v === null || v === undefined || !String(v).trim() ? NaN : Number(String(v).trim().replace(',', '.'))));

  const posortowane = slownik =>
    Object.entries(slownik || {})
      .sort(([ka, a], [kb, b]) => (((a && a.kolejnosc) || 999) - ((b && b.kolejnosc) || 999)) || ka.localeCompare(kb, 'pl'))
      .map(([kod, w]) => Object.assign({ kod }, w || {}));

  const linie = slowniki => posortowane((slowniki || {}).linie).map(l => ({ kod: l.kod, nazwa: l.nazwa || l.kod }));
  const nazwaLinii = (slowniki, kod) => (((slowniki || {}).linie || {})[kod] || {}).nazwa || kod || '—';
  const nazwaMaszyny = (slowniki, kod) => (((slowniki || {}).maszyny || {})[kod] || {}).nazwa || kod || '—';
  const nazwaStanowiska = (slowniki, kod) => (((slowniki || {}).stanowiska || {})[kod] || {}).nazwa || kod || null;
  const nazwaKarty = (slowniki, kod) => (((slowniki || {}).karty_przegladow || {})[kod] || {}).nazwa || kod || '—';

  /* Maszyny w kolejności linii, a na linii po kodzie — tak je widzi mechanik na hali. */
  function maszyny(slowniki) {
    const kolej = {};
    linie(slowniki).forEach((l, i) => { kolej[l.kod] = i; });
    return Object.entries((slowniki || {}).maszyny || {})
      .map(([kod, m]) => Object.assign({ kod }, m || {}, { nazwa: (m && m.nazwa) || kod }))
      .sort((a, b) => ((kolej[a.linia] ?? 99) - (kolej[b.linia] ?? 99)) || a.kod.localeCompare(b.kod, 'pl'));
  }

  function nazwaPracownika(pracownicy, id) {
    if (!id) return null;
    if (id === 'system') return 'Plan';            // przeglądy z harmonogramu zakłada hub
    const p = (pracownicy || []).find(x => x.id === id);
    return p ? p.nazwa : id;
  }

  const ms = chwila => (typeof chwila === 'number' ? chwila : Date.parse(chwila));
  const dwie = n => String(n).padStart(2, '0');

  /* Godzina zakładu (Europe/Warsaw), niezależnie od strefy ustawionej w telefonie. */
  function godzina(chwila) {
    if (chwila === null || chwila === undefined || chwila === '') return '—';
    const t = ms(chwila);
    if (isNaN(t)) return '—';
    const l = H().lokalny(t);
    return `${dwie(l.godz)}:${dwie(l.min)}`;
  }

  function data(chwila) {
    const t = ms(chwila);
    if (isNaN(t)) return '—';
    const l = H().lokalny(t);
    return `${dwie(l.dzien)}.${dwie(l.miesiac)}`;
  }

  /* „14:05” dziś, „24.09 14:05” wcześniej. */
  function kiedy(chwila, teraz) {
    if (chwila === null || chwila === undefined || chwila === '') return '—';
    return (teraz !== undefined && data(chwila) === data(teraz) ? '' : data(chwila) + ' ') + godzina(chwila);
  }

  /* Dzień zakładu 'RRRR-MM-DD' dla chwili — klucz przeglądu i grupowanie „dziś / tydzień”. */
  function dzienZakladu(chwila) {
    const l = H().lokalny(ms(chwila));
    return `${l.rok}-${dwie(l.miesiac)}-${dwie(l.dzien)}`;
  }

  /* 'RRRR-MM-DD' → koniec tego dnia w zakładzie (23:59:59.999) w UTC. Termin przeglądu:
     zrobiony do końca dnia terminu = „w terminie” (decyzja właściciela 2026-09-25).
     Bliźniak: rozszerzenie.py → koniec_dnia_iso. */
  function koniecDnia(tekst) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tekst || '');
    if (!m) return null;
    const nastepny = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1));
    return new Date(H().zLokalnego(nastepny.getUTCFullYear(), nastepny.getUTCMonth() + 1, nastepny.getUTCDate(), 0, 0) - 1).toISOString();
  }

  function dodajDni(tekst, n) {
    const [r, m, d] = tekst.split('-').map(Number);
    const x = new Date(Date.UTC(r, m - 1, d + n));
    return `${x.getUTCFullYear()}-${dwie(x.getUTCMonth() + 1)}-${dwie(x.getUTCDate())}`;
  }

  const numer = obiekt => (obiekt && obiekt.numer) || '—';      // AW-… / PR-… po synchronizacji (KONTRAKT §5.3)

  /* Czy osoba może wysłać zdarzenie danego typu — z kontraktu, żeby ekran nie
     obiecywał przycisku, który hub i tak odrzuci. Słowniki: prawa w slowniki.<n>.zapis. */
  function mozna(kontrakt, pracownik, typ, slownik) {
    if (!kontrakt || !pracownik) return false;
    const role = pracownik.role || [];
    if (role.includes('ekran')) return false;
    if (role.includes('admin')) return true;
    const spec = kontrakt.zdarzenia && kontrakt.zdarzenia[typ];
    if (!spec) return false;
    let dozwolone = spec.role || [];
    if (dozwolone.includes('*')) dozwolone = (((kontrakt.slowniki || {})[slownik] || {}).zapis) || [];
    return role.some(r => dozwolone.includes(r));
  }

  /* Czy zdarzenie pasuje do bieżącego statusu (reguła „z” w kontrakcie). */
  function dozwolonyZ(kontrakt, typ, status) {
    const spec = kontrakt && kontrakt.zdarzenia && kontrakt.zdarzenia[typ];
    return !!spec && (!spec.z || spec.z.includes(status));
  }

  /* Jedno wykonanie naraz: drugie dotknięcie w rękawicy w trakcie zapisu jest ignorowane. */
  function raz(fn) {
    let trwa = false;
    return async function (...argumenty) {
      if (trwa) return undefined;
      trwa = true;
      try { return await fn.apply(this, argumenty); } finally { trwa = false; }
    };
  }

  function odmiana(n, jedna, kilka, wiele) {
    const d = Math.abs(n) % 10, s = Math.abs(n) % 100;
    if (n === 1) return jedna;
    return d >= 2 && d <= 4 && !(s >= 12 && s <= 14) ? kilka : wiele;
  }

  /* Kod z nazwy: „Przegląd miesięczny” → „przeglad-miesieczny”; kolizja → „-2”, „-3”… */
  function kodZNazwy(nazwa, istniejace) {
    const mapa = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
    let kod = String(nazwa || '').toLowerCase().replace(/[ąćęłńóśźż]/g, z => mapa[z])
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pozycja';
    const zajete = new Set(istniejace || []);
    if (!zajete.has(kod)) return kod;
    let i = 2;
    while (zajete.has(`${kod}-${i}`)) i++;
    return `${kod}-${i}`;
  }

  // ------------------------------------------------------------ awarie

  const priorytetInfo = (stale, kod) => ((stale && stale.priorytety) || []).find(p => p.kod === kod) || { kod, nazwa: kod || '—', kolejnosc: 9, zatrzymuje: false };
  const nazwaZeStalej = (stale, lista, kod) => (((stale && stale[lista]) || []).find(p => p.kod === kod) || {}).nazwa || kod || null;
  const zatrzymuje = (awaria, stale) => !!priorytetInfo(stale, ((awaria && awaria.dane) || {}).priorytet).zatrzymuje;

  /* Wiersz listy / nagłówek karty awarii. Etykieta statusu z kontraktu (a.etykieta),
     żeby mechanik, lider i Panel widzieli te same słowa (D9). */
  function wierszAwarii(a, { slowniki, pracownicy, stale, teraz, ja }) {
    const d = a.dane || {};
    const pr = priorytetInfo(stale, d.priorytet);
    const w = {
      id: a.id, numer: numer(a), status: a.status, etykieta: a.etykieta || a.status, aktywny: a.aktywny !== false,
      maszyna: d.maszyna || '—', maszynaNazwa: nazwaMaszyny(slowniki, d.maszyna),
      linia: a.linia || d.linia || null, liniaNazwa: nazwaLinii(slowniki, a.linia || d.linia),
      stanowiskoNazwa: nazwaStanowiska(slowniki, d.stanowisko),
      opis: d.opis || '', priorytet: pr.kod, priorytetNazwa: pr.nazwa, zatrzymuje: !!pr.zatrzymuje, kolejnosc: pr.kolejnosc || 9,
      // „Stoi linia” tylko, dopóki awaria trwa — zamknięta z priorytetem „zatrzymanie” już linii nie zatrzymuje.
      stoi: a.aktywny !== false && !!pr.zatrzymuje,
      priorytetZgloszony: d.priorytet_zgloszony && d.priorytet_zgloszony !== d.priorytet ? priorytetInfo(stale, d.priorytet_zgloszony).nazwa : null,
      typUsterki: nazwaZeStalej(stale, 'typy_usterek', d.typ_usterki),
      powodWstrzymania: a.status === 'wstrzymana' ? nazwaZeStalej(stale, 'powody_wstrzymania', d.powod_wstrzymania) : null,
      mechanik: d.mechanik || null, mechanikNazwa: nazwaPracownika(pracownicy, d.mechanik),
      moja: !!ja && d.mechanik === ja,
      zglosil: nazwaPracownika(pracownicy, d.zglosil),
      czasZgloszenia: d.czas_zgloszenia || null,
      przestojMs: H().przestojMs(a, teraz),
      naprawaMs: H().czasNaprawyMs(a), reakcjaMs: H().czasReakcjiMs(a),
      czekaMs: a.status === 'oczekuje_potwierdzenia' && d.czas_zakonczenia_ur ? Math.max(0, teraz - ms(d.czas_zakonczenia_ur)) : null,
      oczekuje: !!a._oczekuje,
    };
    return w;
  }

  /* Lista aktywnych awarii: najpierw zatrzymania linii, potem wg priorytetu, a w nich
     od najdłuższego przestoju. filtr: 'wszystkie' | 'moje' | 'wolne' (nikt nie przyjął). */
  function listaAwarii({ awarie, slowniki, pracownicy, stale, teraz, ja, filtr }) {
    const wiersze = (awarie || []).filter(a => a.aktywny !== false)
      .map(a => wierszAwarii(a, { slowniki, pracownicy, stale, teraz, ja }))
      .filter(w => filtr === 'moje' ? w.moja : filtr === 'wolne' ? w.status === 'zgloszona' : true);
    return wiersze.sort((a, b) => (Number(b.zatrzymuje) - Number(a.zatrzymuje)) || (a.kolejnosc - b.kolejnosc) ||
      (String(a.czasZgloszenia).localeCompare(String(b.czasZgloszenia))));
  }

  /* Zamknięte / anulowane z ostatnich dni — „co się działo”, najnowsze na górze. */
  function ostatnioZamkniete({ awarie, slowniki, pracownicy, stale, teraz, dni }) {
    const granica = teraz - (dni || 2) * 86400000;
    return (awarie || []).filter(a => a.aktywny === false && ms(a.zmieniono) >= granica)
      .map(a => wierszAwarii(a, { slowniki, pracownicy, stale, teraz }))
      .sort((a, b) => String(b.czasZgloszenia).localeCompare(String(a.czasZgloszenia)));
  }

  /* Przyciski następnego kroku — tylko te, które hub przyjmie (status + rola z kontraktu).
     Kolejność = kolejność na ekranie; pierwszy „główny” jest duży. */
  const KROKI = [
    { typ: 'awaria.przyjeta', tekst: 'Jadę', glowny: true },
    { typ: 'awaria.naprawa_rozpoczeta', tekst: 'Na miejscu — skanuj maszynę', glowny: true, skan: true },
    { typ: 'awaria.wznowiona', tekst: 'Wznów naprawę', glowny: true },
    { typ: 'awaria.zakonczona_ur', tekst: 'Zakończ naprawę', glowny: true, zielony: true },
    { typ: 'awaria.wstrzymana', tekst: 'Wstrzymaj' },
    { typ: 'awaria.sklasyfikowana', tekst: 'Typ i priorytet' },
    { typ: 'awaria.przypisana', tekst: 'Przekaż koledze' },
    { typ: 'awaria.komentarz', tekst: 'Notatka' },
    { typ: 'awaria.anulowana', tekst: 'Fałszywy alarm', alarm: true },
  ];
  // Kroki, po których awaria jest MOJA (kontrakt wpisuje autora jako mechanika) — przy cudzej awarii najpierw pytanie.
  const KROKI_PRZEJMUJACE = ['awaria.przyjeta', 'awaria.naprawa_rozpoczeta', 'awaria.wznowiona', 'awaria.zakonczona_ur'];

  /* Okno przed krokiem przejmującym: „Przejąć awarię od Jana Kowalskiego?” — z imieniem, bo mechanik musi wiedzieć,
     komu zabiera robotę (i do kogo zadzwonić, zanim pojedzie). */
  function pytaniePrzejecia(pracownicy, prowadzi) {
    const kto = nazwaPracownika(pracownicy, prowadzi) || 'kolegi';
    return { tytul: `Przejąć awarię od ${kto}?`, tresc: `Awarię prowadzi ${kto}. Po tym kroku będzie Twoja.`, przycisk: 'Przejmij' };
  }
  function akcjeAwarii(awaria, { kontrakt, pracownik }) {
    // Zamknięta / anulowana: koniec pracy UR. Notatkę kontrakt by przyjął, ale na hali nikt jej już nie przeczyta.
    if (!awaria || !kontrakt || !pracownik || awaria.aktywny === false) return [];
    const st = awaria.status;
    let lista = KROKI.filter(k => dozwolonyZ(kontrakt, k.typ, st) && mozna(kontrakt, pracownik, k.typ));
    // „Zakończ” z „Mechanik w drodze” pozwala kontrakt, ale mechanik najpierw jest na miejscu —
    // pokazujemy go dopiero od „Naprawa w toku”, żeby nikt nie zamknął awarii jadąc do niej.
    if (st === 'przyjeta' || st === 'zgloszona') lista = lista.filter(k => k.typ !== 'awaria.zakonczona_ur');
    // Awarię prowadzi kolega: „Na miejscu” przejęłoby ją bez słowa (kontrakt nadpisuje mechanika) —
    // krok zostaje, ale nie jako główny i z pytaniem „przejąć?” (pole przejmuje = kto prowadzi).
    // „Jadę” też: kierownik UR przypisał zgłoszoną awarię koledze, a awaria.przyjeta wpisuje mechanikiem autora
    // (recenzja 2026-10-05).
    const prowadzi = ((awaria.dane || {}).mechanik) || null;
    const cudza = !!prowadzi && prowadzi !== pracownik.id;
    // Na liście jest tylko jeden główny krok — ten pierwszy.
    let byl = false;
    return lista.map(k => {
      const przejmuje = cudza && KROKI_PRZEJMUJACE.includes(k.typ) ? prowadzi : null;
      const g = k.glowny && !byl && !przejmuje;
      if (g) byl = true;
      return Object.assign({}, k, { glowny: g, przejmuje });
    });
  }

  /* Gotowe opisy naprawy — mechanik w rękawicach dotyka, a nie pisze (instrukcja §7). */
  const GOTOWE_OPISY = ['Wymiana części', 'Regulacja', 'Czyszczenie', 'Dokręcenie połączeń', 'Smarowanie',
    'Reset i kalibracja', 'Wymiana bezpiecznika', 'Uszczelnienie', 'Naprawa przewodu', 'Wymiana czujnika'];
  const POWODY_ANULOWANIA = ['Fałszywy alarm', 'Zgłoszenie podwójne', 'Usterka ustąpiła sama', 'Obsługa operatora, nie UR'];
  const MAKS_ZDJEC = 20;             // hub przyjmuje najwyżej 20 plików w jednym polu
  const MAKS_POWODU = 1000;          // kontrakt: awaria.anulowana → powod.maks (test: widok-testy.js)

  /* Powód „Fałszywy alarm?”: gotowy (dotknięcie) + własny opis, razem „Gotowy — opis”. Pole opisu ma maxlength 1000,
     ale gotowy dokłada do 26 znaków — 1000 wpisanych + gotowy hub odrzucał („za długie”), a awaria zostawała aktywna
     (przegląd 2026-10-07). Limit pilnujemy dla całości, przed zapisem. */
  function powodAnulowania(gotowy, wpisany) {
    const powod = [gotowy, String(wpisany || '').trim()].filter(Boolean).join(' — ');
    if (!powod) return { powod, blad: 'Wybierz albo wpisz powód.' };
    if (powod.length > MAKS_POWODU) {
      return { powod, blad: `Powód za długi: ${powod.length} znaków${gotowy ? ' razem z „' + gotowy + '”' : ''}, najwyżej ${MAKS_POWODU}. Skróć opis.` };
    }
    return { powod, blad: null };
  }

  /* Formularz „Zakończ naprawę”: { gotowe: [..], dopisek, typ_usterki, czesci, zdjecia } */
  function opisNaprawy(f) {
    const czesci = [].concat(f.gotowe || []).filter(Boolean);
    const dopisek = String(f.dopisek || '').trim();
    return (czesci.join(', ') + (czesci.length && dopisek ? '. ' : '') + dopisek).trim();
  }
  function bledyZakonczenia(f) {
    const b = [];
    const opis = opisNaprawy(f);
    if (!opis) b.push('Wybierz, co zrobiono, albo dopisz opis naprawy.');
    if (opis.length > 2000) b.push('Opis naprawy jest za długi (najwyżej 2000 znaków).');
    if (String(f.czesci || '').length > 1000) b.push('Lista części jest za długa (najwyżej 1000 znaków).');
    if ((f.zdjecia || []).length > MAKS_ZDJEC) b.push(`Najwyżej ${MAKS_ZDJEC} zdjęć — usuń nadmiarowe.`);
    return b;
  }
  function daneZakonczenia(f) {
    const d = { opis_naprawy: opisNaprawy(f) };
    if (f.typ_usterki) d.typ_usterki = f.typ_usterki;
    if (String(f.czesci || '').trim()) d.czesci = String(f.czesci).trim();
    if ((f.zdjecia || []).length) d.zdjecia = f.zdjecia.slice();
    return d;
  }

  /* Czy zeskanowany kod to ta maszyna. Kody HALA:M:… i kody zastane z pola qr słownika. */
  function sprawdzMaszyne(tekst, slowniki, oczekiwana) {
    const k = H().odczytajKod(tekst, slowniki);
    const ok = k.rodzaj === 'maszyny' && k.kod === oczekiwana;
    let blad = null;
    if (!ok) {
      if (k.rodzaj === 'maszyny') blad = `To ${nazwaMaszyny(slowniki, k.kod)} (${k.kod}), a potrzebna ${nazwaMaszyny(slowniki, oczekiwana)} (${oczekiwana}).`;
      else if (k.rodzaj) blad = `To kod ${k.rodzaj === 'stanowiska' ? 'stanowiska' : k.rodzaj === 'linie' ? 'linii' : 'identyfikatora'}, nie maszyny. Zeskanuj kod na ${nazwaMaszyny(slowniki, oczekiwana)}.`;
      else blad = `Nieznany kod „${k.kod}”. Zeskanuj kod na ${nazwaMaszyny(slowniki, oczekiwana)} (${oczekiwana}).`;
    }
    return { ok, kod: k.kod, blad };
  }

  /* Komu można przekazać awarię: mechanicy i kierownik UR, bez mnie. */
  function mechanicy(pracownicy, ja) {
    return (pracownicy || []).filter(p => p.aktywny !== false && p.id !== ja &&
      (p.role || []).some(r => r === 'mechanik' || r === 'kierownik_ur'))
      .sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
  }

  /* Konflikt z huba po ludzku (instrukcja §6 pkt 3): drugi mechanik przyjął tę samą awarię. */
  function komunikatKonfliktu(zdarzenie, awaria, { pracownicy, ja }) {
    const typ = zdarzenie && zdarzenie.typ;
    if (!typ || !typ.startsWith('awaria.')) return null;
    const d = (awaria && awaria.dane) || {};
    const nr = awaria && awaria.numer ? `${awaria.numer} ` : '';
    const kto = d.mechanik && d.mechanik !== ja ? nazwaPracownika(pracownicy, d.mechanik) : null;
    if ((typ === 'awaria.przyjeta' || typ === 'awaria.naprawa_rozpoczeta') && kto) return `Awarię ${nr}przyjął już ${kto}.`;
    if (awaria && awaria.status === 'anulowana') return `Awaria ${nr}została anulowana — nic nie zmieniono.`;
    if (awaria && awaria.status === 'zamknieta') return `Awaria ${nr}jest już zamknięta — nic nie zmieniono.`;
    return `Awaria ${nr}ma już status „${(awaria && awaria.etykieta) || '?'}” — nic nie zmieniono. Sprawdź kartę.`;
  }

  /* Czy nowe zdarzenie z huba ma zadzwonić w telefonie mechanika. Konflikt (hub zapisał fakt z `uwaga`, ale stan się
     nie zmienił — np. drugie zgłoszenie tej samej awarii z telefonu, który był offline) nie dzwoni: mechanik biegłby
     do czegoś, czego na liście nie ma (etap 1). Sam poprawiony czas telefonu (Hala.UWAGA_CZASU) konfliktem nie jest —
     awaria ze złym zegarem lidera dalej dzwoni. Bez Hala.jestKonflikt (stary hala.js) każda uwaga = konflikt. */
  function powiadomienie(z, { ja, slowniki, stale }) {
    if (!z || z.autor === ja) return null;
    if (z.uwaga && (!H() || !H().jestKonflikt || H().jestKonflikt(z.uwaga))) return null;
    const d = z.dane || {};
    if (z.typ === 'awaria.zgloszona') {
      const pr = priorytetInfo(stale, d.priorytet);
      return { tytul: pr.zatrzymuje ? `STOI: ${nazwaMaszyny(slowniki, d.maszyna)}` : `Awaria: ${nazwaMaszyny(slowniki, d.maszyna)}`,
               tresc: `${nazwaLinii(slowniki, d.linia)} · ${pr.nazwa}${d.opis ? ' — ' + d.opis : ''}`,
               pilna: !!pr.zatrzymuje, obiekt: z.obiekt };
    }
    if (z.typ === 'awaria.przypisana' && d.mechanik === ja) {
      return { tytul: 'Przekazano Ci awarię', tresc: '', pilna: false, obiekt: z.obiekt };
    }
    if (z.typ === 'awaria.potwierdzenie_odrzucone') {
      return { tytul: 'Lider: naprawa nie pomogła', tresc: d.powod || '', pilna: true, obiekt: z.obiekt };
    }
    return null;
  }

  /* Czy zdarzenie z huba jest „nowe” (dzwonić) czy zaległe (po otwarciu aplikacji — tylko lista).
     Liczy się chwila dotarcia do huba (czas_serwera), nie chwila na telefonie lidera: awaria zgłoszona
     bez zasięgu o 10:00 i wysłana o 10:12 ma zadzwonić o 10:12 (błąd z przeglądu kodu). */
  const SWIEZE_MS = 10 * 60000;
  function swieze(z, teraz) {
    const t = ms((z && (z.czas_serwera || z.czas)) || '');
    return !isNaN(t) && teraz - t <= SWIEZE_MS;
  }
  /* Dokąd prowadzi dotknięcie powiadomienia: jedna awaria → jej karta, kilka naraz → lista. */
  const adresPowiadomienia = p => (p && p.obiekt ? `#awaria/${encodeURIComponent(p.obiekt)}` : '#awarie');

  /* Ekran z adresu: '#awarie', '#awaria/<id>', '#przeglady'… → { nazwa, parametr }. „#awaria/<id>” daje też push z huba
     (recenzja 2026-10-05). Gdy tej awarii nie ma w telefonie (jeszcze nie doszła po starcie z powiadomienia albo wypadła
     z okna dni) — lista awarii z `zastepczy` i `czeka` = id: ur.js przełączy na kartę, gdy awaria dojdzie. Pusta karta
     „Nie ma takiej awarii” była ślepą uliczką. Zepsute „%” w adresie nie może wywrócić nawigacji — wtedy bez parametru. */
  function ekranZAdresu(hash, ekrany, jestAwaria) {
    const [nazwa, ...reszta] = (String(hash || '').replace(/^#/, '') || 'awarie').split('/');
    let parametr = null;
    try { parametr = reszta.map(decodeURIComponent).join('/') || null; } catch (e) { parametr = null; }
    if (!(ekrany || []).includes(nazwa)) return { nazwa: 'awarie', parametr };
    if (nazwa === 'awaria' && !(parametr && jestAwaria(parametr))) return { nazwa: 'awarie', parametr: null, zastepczy: true, czeka: parametr };
    return { nazwa, parametr };
  }

  /* Historia z huba (zdarzenia obiektu) → wiersze „kto, kiedy, co”. */
  function historiaAwarii(zdarzenia, { kontrakt, pracownicy, stale, teraz }) {
    const opis = z => {
      const d = z.dane || {};
      switch (z.typ) {
        case 'awaria.zgloszona': return `Zgłoszona: ${d.opis || ''}`;
        case 'awaria.przyjeta': return 'Jadę';
        case 'awaria.naprawa_rozpoczeta': return d.qr ? 'Na miejscu (skan maszyny)' : 'Na miejscu (bez skanu)';
        case 'awaria.wstrzymana': return `Wstrzymana: ${nazwaZeStalej(stale, 'powody_wstrzymania', d.powod) || ''}${d.opis ? ' — ' + d.opis : ''}`;
        case 'awaria.wznowiona': return 'Wznowiona';
        case 'awaria.sklasyfikowana': return `Typ: ${nazwaZeStalej(stale, 'typy_usterek', d.typ_usterki) || '—'}${d.priorytet ? ', priorytet: ' + priorytetInfo(stale, d.priorytet).nazwa : ''}`;
        case 'awaria.przypisana': return `Przekazana: ${nazwaPracownika(pracownicy, d.mechanik)}`;
        case 'awaria.zakonczona_ur': return `Zakończona przez UR: ${d.opis_naprawy || ''}`;
        case 'awaria.potwierdzona': return 'Lider potwierdził — linia ruszyła';
        case 'awaria.potwierdzenie_odrzucone': return `Lider: nie działa — ${d.powod || ''}`;
        case 'awaria.anulowana': return `Anulowana: ${d.powod || ''}`;
        case 'awaria.komentarz': return `Notatka: ${d.tekst || ''}`;
        default: return ((kontrakt && kontrakt.zdarzenia[z.typ]) || {}).opis || z.typ;
      }
    };
    return (zdarzenia || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0)).map(z => ({
      kiedy: kiedy(z.czas, teraz), kto: nazwaPracownika(pracownicy, z.autor), co: opis(z), uwaga: z.uwaga || null,
    }));
  }

  // ------------------------------------------------------------ KPI (Hala.kpiAwarii — jedne liczby, etap 3)

  /* KPI awarii w [od, do) liczy JEDNA wspólna funkcja Hala.kpiAwarii (bliźniak kpi_awarii w hubie, wektory
     wspolne/testy/wektory-reduktora.json → kpi_awarii) — te same liczby co Panel i raport zmiany lidera (D37).
     Definicje (KONTRAKT §6.1): anulowane się nie liczą; MTTR — od zgłoszenia do „Zakończona przez UR” (D8);
     reakcja — do przyjęcia; MTBF — średni czas pracy maszyny między awariami zatrzymującymi, od potwierdzenia naprawy
     do następnego zgłoszenia (D44; ponowne zgłoszenie w trakcie awarii to ta sama przerwa); przestój — przycięty do okresu, nakładające się awarie maszyny/linii liczą się raz.
     Tu dokładamy tylko nazwy ze słowników (rozszerzenie.py → kpi robi to samo w hubie). */
  function kpi({ awarie, od, do: do_, teraz, maszyna, linia, slowniki, stale }) {
    const zatrzymujace = ((stale && stale.priorytety) || []).filter(p => p.zatrzymuje).map(p => p.kod);
    const w = H().kpiAwarii(awarie, { od: od || null, do: do_ || null, teraz, maszyna: maszyna || null, linia: linia || null, zatrzymujace });
    const nazwa = (slownik, kod) => ((((slowniki || {})[slownik]) || {})[kod] || {}).nazwa || kod;
    w.maszyny = w.maszyny.map(m => Object.assign({ kod: m.kod, nazwa: nazwa('maszyny', m.kod) }, m));
    w.linie = w.linie.map(l => Object.assign({ kod: l.kod, nazwa: nazwa('linie', l.kod) }, l));
    return w;
  }

  /* Okres KPI: od początku dnia zakładu sprzed N dni do teraz. Do 30 dni liczy telefon,
     dłużej — hub (telefon trzyma tylko 30 dni awarii, Hala.utworz dni: 30). */
  const OKRESY = [{ kod: '7', nazwa: '7 dni', dni: 7 }, { kod: '30', nazwa: '30 dni', dni: 30 },
                  { kod: '90', nazwa: '90 dni', dni: 90 }, { kod: '365', nazwa: 'Rok', dni: 365 }];
  function okresKpi(kod, teraz) {
    const o = OKRESY.find(x => x.kod === kod) || OKRESY[1];
    const odDnia = dodajDni(dzienZakladu(teraz), -(o.dni - 1));
    const [r, m, d] = odDnia.split('-').map(Number);
    // doPlanu: przeglądy z terminem dziś (termin = koniec dnia) też należą do okresu — zrobiony rano liczy się od razu.
    return { kod: o.kod, nazwa: o.nazwa, od: new Date(H().zLokalnego(r, m, d, 0, 0)).toISOString(),
             do: new Date(teraz + 1000).toISOString(), doPlanu: new Date(ms(koniecDnia(dzienZakladu(teraz))) + 1).toISOString(), zHuba: o.dni > 30 };
  }

  // ------------------------------------------------------------ przeglądy

  /* Statusy pochodne (specyfikacja: Zaplanowany, W trakcie, Zrealizowany w terminie,
     Opóźniony / Przeterminowany). Liczone w aplikacji, nie w kontrakcie. */
  function statusPrzegladu(p, teraz) {
    const d = (p && p.dane) || {};
    const termin = d.termin ? ms(d.termin) : NaN;
    if (p.status === 'anulowany') return { kod: 'anulowany', nazwa: 'Anulowany', klasa: 'neutral' };
    if (p.status === 'zrealizowany') {
      const wTerminie = !isNaN(termin) && d.czas_zakonczenia && ms(d.czas_zakonczenia) <= termin;
      return wTerminie ? { kod: 'w_terminie', nazwa: 'Zrealizowany w terminie', klasa: 'ok' }
                       : { kod: 'po_terminie', nazwa: 'Zrealizowany po terminie', klasa: 'uwaga' };
    }
    if (!isNaN(termin) && termin < teraz) return { kod: 'opozniony', nazwa: 'Opóźniony', klasa: 'alarm' };
    if (p.status === 'w_trakcie') return { kod: 'w_trakcie', nazwa: 'W trakcie', klasa: 'info' };
    return { kod: 'zaplanowany', nazwa: 'Zaplanowany', klasa: 'neutral' };
  }

  const kartaDla = (slowniki, kod) => (((slowniki || {}).karty_przegladow || {})[kod]) || null;

  /* Karty pasujące do maszyny: wprost po kodzie albo po typie maszyny. */
  function kartyDlaMaszyny(slowniki, maszyna) {
    const typ = (((slowniki || {}).maszyny || {})[maszyna] || {}).typ;
    return Object.entries((slowniki || {}).karty_przegladow || {})
      .filter(([, k]) => k && ((k.maszyny || []).includes(maszyna) || (typ && k.typ_maszyny === typ)))
      .map(([kod, k]) => Object.assign({ kod }, k))
      .sort((a, b) => String(a.nazwa).localeCompare(String(b.nazwa), 'pl'));
  }

  function wierszPrzegladu(p, { slowniki, pracownicy, teraz, ja }) {
    const d = p.dane || {};
    const karta = kartaDla(slowniki, d.karta);
    const post = postepPrzegladu(p, karta);
    return {
      id: p.id, numer: numer(p), status: p.status, stan: statusPrzegladu(p, teraz),
      maszyna: d.maszyna, maszynaNazwa: nazwaMaszyny(slowniki, d.maszyna), liniaNazwa: nazwaLinii(slowniki, p.linia || d.linia),
      karta: d.karta, kartaNazwa: nazwaKarty(slowniki, d.karta), termin: d.termin || null, dzien: d.termin ? dzienZakladu(d.termin) : null,
      mechanik: d.mechanik || null, mechanikNazwa: nazwaPracownika(pracownicy, d.mechanik || d.wykonawca),
      moj: !!ja && (d.mechanik === ja || d.wykonawca === ja), postep: post, oczekuje: !!p._oczekuje,
    };
  }

  /* Zakładka „Przeglądy”: opóźnione (na górze, świecą), w trakcie, dziś, najbliższy tydzień, później,
     zrealizowane ostatnio. W grupach po terminie; moje przed cudzymi. */
  function listaPrzegladow({ przeglady, slowniki, pracownicy, teraz, ja, filtr }) {
    const dzis = dzienZakladu(teraz), zaTydzien = dodajDni(dzis, 7), tydzienTemu = teraz - 7 * 86400000;
    const g = { opoznione: [], wTrakcie: [], dzis: [], tydzien: [], pozniej: [], zrobione: [] };
    for (const p of przeglady || []) {
      const w = wierszPrzegladu(p, { slowniki, pracownicy, teraz, ja });
      if (filtr === 'moje' && !w.moj) continue;
      if (p.status === 'anulowany') continue;
      if (p.status === 'zrealizowany') { if (ms(p.zmieniono) >= tydzienTemu) g.zrobione.push(w); continue; }
      if (w.stan.kod === 'opozniony') g.opoznione.push(w);
      else if (p.status === 'w_trakcie') g.wTrakcie.push(w);
      else if (w.dzien === dzis) g.dzis.push(w);
      else if (w.dzien && w.dzien <= zaTydzien) g.tydzien.push(w);
      else g.pozniej.push(w);
    }
    const wgTerminu = (a, b) => (Number(b.moj) - Number(a.moj)) || String(a.termin).localeCompare(String(b.termin)) || String(a.maszyna).localeCompare(String(b.maszyna));
    for (const k of ['opoznione', 'wTrakcie', 'dzis', 'tydzien', 'pozniej']) g[k].sort(wgTerminu);
    g.zrobione.sort((a, b) => String(b.termin).localeCompare(String(a.termin)));
    return g;
  }

  /* Punkt pomiarowy: poza [min, max] → niezgodne (i świeci). Bez granic — zgodne. */
  function wynikPomiaru(punkt, wartosc) {
    const v = liczba(wartosc);
    if (isNaN(v)) return null;
    const min = punkt && typeof punkt.min === 'number' ? punkt.min : null;
    const max = punkt && typeof punkt.max === 'number' ? punkt.max : null;
    return (min !== null && v < min) || (max !== null && v > max) ? 'niezgodne' : 'zgodne';
  }

  function zakres(punkt) {
    const j = punkt.jednostka ? ` ${punkt.jednostka}` : '';
    const min = typeof punkt.min === 'number', max = typeof punkt.max === 'number';
    if (min && max) return `${punkt.min}–${punkt.max}${j}`;
    if (min) return `min. ${punkt.min}${j}`;
    if (max) return `maks. ${punkt.max}${j}`;
    return punkt.jednostka || '';
  }

  /* Punkt karty → dane zdarzenia przeglad.punkt albo lista błędów. f: {wynik?, wartosc?, uwagi?, zdjecia?} */
  function danePunktu(punkt, f) {
    const bledy = [];
    const d = { punkt: punkt.id };
    if (punkt.rodzaj === 'pomiar') {
      const v = liczba(f.wartosc);
      if (f.wartosc === '' || f.wartosc === null || f.wartosc === undefined || isNaN(v)) bledy.push(`${punkt.nazwa}: wpisz wartość${punkt.jednostka ? ' w ' + punkt.jednostka : ''}.`);
      else { d.wartosc = v; d.wynik = wynikPomiaru(punkt, v); }
    } else {
      if (f.wynik !== 'zgodne' && f.wynik !== 'niezgodne') bledy.push(`${punkt.nazwa}: wybierz Zgodne albo Niezgodne.`);
      else d.wynik = f.wynik;
    }
    const uwagi = String(f.uwagi || '').trim();
    if (uwagi.length > 1000) bledy.push(`${punkt.nazwa}: uwagi są za długie (najwyżej 1000 znaków).`);
    if (uwagi) d.uwagi = uwagi;
    if ((f.zdjecia || []).length > MAKS_ZDJEC) bledy.push(`Najwyżej ${MAKS_ZDJEC} zdjęć przy punkcie.`);
    if ((f.zdjecia || []).length) d.zdjecia = f.zdjecia.slice();
    return { bledy, dane: d };
  }

  /* Ile punktów karty ma wynik, które niezgodne, których brakuje. */
  function postepPrzegladu(p, karta) {
    const punkty = (karta && karta.punkty) || [];
    const wyniki = ((p && p.dane) || {}).punkty || {};
    const wynik = { wszystkie: punkty.length, zrobione: 0, niezgodne: [], brakujace: [] };
    for (const pk of punkty) {
      const w = wyniki[pk.id];
      if (w && (w.wynik || typeof w.wartosc === 'number')) {
        wynik.zrobione++;
        if (w.wynik === 'niezgodne') wynik.niezgodne.push(pk);
      } else wynik.brakujace.push(pk);
    }
    return wynik;
  }

  /* Wykonanie planu w okresie (terminy w [od, do)): ile w terminie, po terminie, opóźnionych.
     Etap 3: przegląd usunięty z planu PO terminie (np. „W trakcie”, którego nikt nie skończył) to przegląd
     niewykonany — liczy się do % jak opóźniony (usuniete_po_terminie). Usunięty przed terminem (maszyna w remoncie,
     zmiana harmonogramu) z planu po prostu znika. Czas usunięcia: czas_anulowania (ur.json 0.4.0), a w starszych
     zapisach — chwila ostatniej zmiany obiektu. */
  function wykonaniePlanu({ przeglady, od, do: do_, teraz }) {
    const odMs = ms(od), doMs = ms(do_);
    const w = { wszystkie: 0, wTerminie: 0, poTerminie: 0, opoznione: 0, usunietePoTerminie: 0, otwarte: 0, proc: null };
    for (const p of przeglady || []) {
      const t = p.dane && p.dane.termin ? ms(p.dane.termin) : NaN;
      if (isNaN(t) || t < odMs || t >= doMs) continue;
      if (p.status === 'anulowany') {
        const kiedy = ms((p.dane && p.dane.czas_anulowania) || p.zmieniono);
        if (!isNaN(kiedy) && kiedy > t) { w.wszystkie++; w.usunietePoTerminie++; }
        continue;
      }
      w.wszystkie++;
      const s = statusPrzegladu(p, teraz).kod;
      if (s === 'w_terminie') w.wTerminie++;
      else if (s === 'po_terminie') w.poTerminie++;
      else if (s === 'opozniony') w.opoznione++;
      else w.otwarte++;
    }
    // % liczymy z przeglądów, których termin już minął — przyszłe nie psują wyniku.
    const rozliczone = w.wTerminie + w.poTerminie + w.opoznione + w.usunietePoTerminie;
    w.proc = rozliczone ? Math.round(w.wTerminie * 100 / rozliczone) : null;
    return w;
  }

  /* Ręczne zaplanowanie przeglądu: {maszyna, karta, dzien 'RRRR-MM-DD', mechanik?} */
  function bledyPlanowania(f, slowniki, dzis) {
    const b = [];
    if (!f.maszyna || !(((slowniki || {}).maszyny || {})[f.maszyna])) b.push('Wybierz maszynę.');
    if (!f.karta || !kartaDla(slowniki, f.karta)) b.push('Wybierz kartę przeglądu.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.dzien || '')) b.push('Wybierz dzień przeglądu.');
    else if (dzis && f.dzien < dzis) b.push('Dzień przeglądu nie może być w przeszłości.');
    return b;
  }
  const kluczPrzegladu = (maszyna, karta, dzien) => `${maszyna}/${karta}/${dzien}`;

  // ------------------------------------------------------------ plan (kierownik UR): karty i harmonogram

  const INTERWALY = [
    { kod: 'dzien', nazwa: 'Dni', jedn: ['dzień', 'dni', 'dni'] }, { kod: 'tydzien', nazwa: 'Tygodnie', jedn: ['tydzień', 'tygodnie', 'tygodni'] },
    { kod: 'miesiac', nazwa: 'Miesiące', jedn: ['miesiąc', 'miesiące', 'miesięcy'] }, { kod: 'rok', nazwa: 'Lata', jedn: ['rok', 'lata', 'lat'] },
    { kod: 'motogodziny', nazwa: 'Motogodziny', jedn: ['mth', 'mth', 'mth'] }, { kod: 'cykle', nazwa: 'Cykle', jedn: ['cykl', 'cykle', 'cykli'] },
  ];
  function opisInterwalu(w) {
    const i = INTERWALY.find(x => x.kod === (w && w.interwal));
    if (!i) return '—';
    const n = Number(w.co) || 0;
    if (n === 1 && i.kod !== 'motogodziny' && i.kod !== 'cykle') return { dzien: 'Codziennie', tydzien: 'Co tydzień', miesiac: 'Co miesiąc', rok: 'Co rok' }[i.kod];
    return `Co ${n} ${odmiana(n, ...i.jedn)}`;
  }

  /* Formularz karty → {bledy, wartosc}. Punkty: [{id?, nazwa, rodzaj, jednostka, min, max}].
     Id punktu nadajemy raz, z nazwy, i nie zmieniamy (wyniki w przeglądach wiszą pod id). */
  function kartaZFormularza(f) {
    const b = [];
    const nazwa = String(f.nazwa || '').trim();
    if (!nazwa) b.push('Podaj nazwę karty.');
    const maszyny = [].concat(f.maszyny || []).filter(Boolean);
    const typ = String(f.typ_maszyny || '').trim();
    if (!maszyny.length && !typ) b.push('Wybierz maszyny albo typ maszyny, dla których jest karta.');
    const punkty = [];
    const zajete = (f.punkty || []).map(p => p.id).filter(Boolean);
    for (const p of f.punkty || []) {
      const n = String(p.nazwa || '').trim();
      if (!n) continue;
      const pk = { id: p.id || kodZNazwy(n, zajete.concat(punkty.map(x => x.id))), nazwa: n, rodzaj: p.rodzaj === 'pomiar' ? 'pomiar' : 'ok_nok' };
      if (pk.rodzaj === 'pomiar') {
        if (String(p.jednostka || '').trim()) pk.jednostka = String(p.jednostka).trim();
        for (const g of ['min', 'max']) {
          if (p[g] === '' || p[g] === null || p[g] === undefined) continue;
          const v = liczba(p[g]);
          if (isNaN(v)) b.push(`${n}: ${g} musi być liczbą.`); else pk[g] = v;
        }
        if (typeof pk.min === 'number' && typeof pk.max === 'number' && pk.min > pk.max) b.push(`${n}: min jest większe od max.`);
      }
      punkty.push(pk);
    }
    if (!punkty.length) b.push('Dodaj co najmniej jeden punkt kontrolny.');
    const wartosc = { nazwa, punkty };
    if (maszyny.length) wartosc.maszyny = maszyny;
    if (typ) wartosc.typ_maszyny = typ;
    return { bledy: b, wartosc };
  }

  /* Formularz harmonogramu → {bledy, klucz, wartosc}. Klucz '<maszyna>/<karta>' — jedna reguła na parę. */
  function harmonogramZFormularza(f, slowniki) {
    const b = [];
    if (!f.maszyna || !(((slowniki || {}).maszyny || {})[f.maszyna])) b.push('Wybierz maszynę.');
    if (!f.karta || !kartaDla(slowniki, f.karta)) b.push('Wybierz kartę przeglądu.');
    if (!INTERWALY.some(i => i.kod === f.interwal)) b.push('Wybierz, co ile.');
    const co = liczba(f.co);
    if (isNaN(co) || co <= 0 || (!['motogodziny', 'cykle'].includes(f.interwal) && !Number.isInteger(co))) b.push('„Co ile” to liczba większa od zera (dla dni, tygodni, miesięcy i lat — całkowita).');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.od || '')) b.push('Podaj datę pierwszego przeglądu.');
    const wartosc = { maszyna: f.maszyna, karta: f.karta, interwal: f.interwal, co, od: f.od };
    if (f.mechanik) wartosc.mechanik = f.mechanik;
    if (['motogodziny', 'cykle'].includes(f.interwal) && f.start !== '' && f.start !== undefined && f.start !== null) {
      const s = liczba(f.start);
      if (isNaN(s) || s < 0) b.push('Odczyt licznika na start to liczba ≥ 0.'); else wartosc.start = s;
    }
    return { bledy: b, klucz: `${f.maszyna}/${f.karta}`, wartosc };
  }

  function listaHarmonogramu(slowniki, pracownicy) {
    return Object.entries((slowniki || {}).harmonogram_przegladow || {})
      .map(([klucz, w]) => Object.assign({ klucz }, w, {
        maszynaNazwa: nazwaMaszyny(slowniki, w.maszyna), kartaNazwa: nazwaKarty(slowniki, w.karta), co_ile: opisInterwalu(w),
        mechanikNazwa: nazwaPracownika(pracownicy, w.mechanik), zepsuty: !kartaDla(slowniki, w.karta) || !(((slowniki || {}).maszyny || {})[w.maszyna]) }))
      .sort((a, b) => a.maszyna.localeCompare(b.maszyna, 'pl') || String(a.kartaNazwa).localeCompare(String(b.kartaNazwa), 'pl'));
  }

  /* Przykładowe karty dla typów maszyn z danych testowych i ogólna karta dla każdej innej.
     Kierownik UR wstawia je jednym dotknięciem i poprawia pod swoje maszyny. */
  const OK = (nazwa) => ({ nazwa, rodzaj: 'ok_nok' });
  const POMIAR = (nazwa, jednostka, min, max) => Object.assign({ nazwa, rodzaj: 'pomiar', jednostka }, min !== null ? { min } : {}, max !== null ? { max } : {});
  const WZORY_KART = {
    wtryskarka: ['Wtryskarka — przegląd miesięczny', [OK('Poziom oleju hydraulicznego'), POMIAR('Temperatura oleju', '°C', 30, 55),
      OK('Stan filtrów oleju'), OK('Smarowanie kolumn i zamka'), POMIAR('Ciśnienie układu', 'bar', 120, 160), OK('Test wyłączników awaryjnych'), OK('Osłony i drzwi bezpieczeństwa')]],
    robot: ['Robot — przegląd miesięczny', [OK('Przewody i złącza chwytaka'), POMIAR('Ciśnienie powietrza', 'bar', 5.5, 7), OK('Smarowanie przekładni'), OK('Test wyłącznika awaryjnego'), OK('Wygrodzenie i kurtyny')]],
    prasa: ['Prasa — przegląd tygodniowy', [OK('Poziom oleju'), POMIAR('Ciśnienie robocze', 'bar', 150, 200), OK('Wycieki'), OK('Test oburęcznego sterowania'), OK('Test wyłączników awaryjnych')]],
    zgrzewarka: ['Zgrzewarka — przegląd miesięczny', [OK('Sonotroda — stan powierzchni'), OK('Chłodzenie'), POMIAR('Ciśnienie docisku', 'bar', 3, 6), OK('Test wyłącznika awaryjnego')]],
    tester: ['Tester — przegląd tygodniowy', [OK('Szczelność przyłączy'), POMIAR('Ciśnienie próby', 'bar', 1.8, 2.2), OK('Kalibracja wzorcem'), OK('Test wyłącznika awaryjnego')]],
    etykieciarka: ['Etykieciarka — przegląd tygodniowy', [OK('Czyszczenie głowicy'), OK('Naciąg taśmy'), OK('Czujnik etykiet'), OK('Test wyłącznika awaryjnego')]],
    owijarka: ['Owijarka — przegląd miesięczny', [OK('Naciąg pasów'), OK('Smarowanie łożysk stołu'), OK('Hamulec folii'), OK('Test wyłącznika awaryjnego'), OK('Wygrodzenie')]],
  };
  function przykladowyPlan(slowniki, dzis) {
    const karty = {}, harmonogram = {};
    const zajete = Object.keys((slowniki || {}).karty_przegladow || {});
    let ogolna = null;
    for (const [kod, m] of Object.entries((slowniki || {}).maszyny || {})) {
      let kodKarty;
      if (m.typ && WZORY_KART[m.typ]) {
        kodKarty = `${m.typ}`;
        if (!karty[kodKarty] && !zajete.includes(kodKarty)) {
          const [nazwa, punkty] = WZORY_KART[m.typ];
          karty[kodKarty] = kartaZFormularza({ nazwa, typ_maszyny: m.typ, punkty }).wartosc;
        }
      } else {
        if (!ogolna) {
          ogolna = kodZNazwy('Przegląd ogólny', zajete.concat(Object.keys(karty)));
          karty[ogolna] = kartaZFormularza({ nazwa: 'Przegląd ogólny', maszyny: [kod], punkty: [OK('Stan ogólny i czystość'), OK('Wycieki'), OK('Test wyłącznika awaryjnego'), OK('Osłony')] }).wartosc;
          karty[ogolna].maszyny = [];     // maszyny dopisujemy niżej, każdą raz
        }
        kodKarty = ogolna;
        karty[ogolna].maszyny.push(kod);
      }
      const tygodniowa = /tygodniowy/.test(((WZORY_KART[m.typ] || [])[0]) || '');
      harmonogram[`${kod}/${kodKarty}`] = { maszyna: kod, karta: kodKarty, interwal: tygodniowa ? 'tydzien' : 'miesiac', co: 1, od: dzis };
    }
    return { karty, harmonogram };
  }

  // ------------------------------------------------------------ liczniki maszyn

  function listaLicznikow({ slowniki, liczniki, teraz }) {
    const wg = {};
    for (const l of liczniki || []) wg[l.id] = l;
    return maszyny(slowniki).map(m => {
      const d = (wg[m.kod] && wg[m.kod].dane) || {};
      return { kod: m.kod, nazwa: m.nazwa, liniaNazwa: nazwaLinii(slowniki, m.linia),
               motogodziny: typeof d.motogodziny === 'number' ? d.motogodziny : null,
               cykle: typeof d.cykle === 'number' ? d.cykle : null,
               kiedy: d.czas_odczytu ? kiedy(d.czas_odczytu, teraz) : null };
    });
  }

  /* Harmonogram, od którego zależy odczyt licznika przy zakończeniu (i dopisanie odczytu przy usunięciu).
     Etap 3: także przegląd ręczny albo kalendarzowy pary (maszyna + karta), dla której jest harmonogram „co N
     motogodzin/cykli” — jego zamknięcie bez odczytu blokowało generator na zawsze (baza = ostatni zamknięty
     Z ODCZYTEM, ur/serwer/rozszerzenie.py → potrzebny_licznikowy). */
  function harmonogramPrzegladu(slowniki, dane) {
    const h = ((slowniki || {}).harmonogram_przegladow) || {};
    const d = dane || {};
    const licznikowy = w => !!w && (w.interwal === 'motogodziny' || w.interwal === 'cykle');
    const wlasny = d.harmonogram ? h[d.harmonogram] || null : null;
    if (licznikowy(wlasny)) return wlasny;
    const pary = Object.keys(h).sort().map(k => h[k]).find(w => w && w.maszyna === d.maszyna && w.karta === d.karta && licznikowy(w));
    return pary || wlasny;
  }

  /* Zakończenie przeglądu „co N motogodzin/cykli” wymaga odczytu TEGO licznika — od niego generator liczy
     następny termin (bez niego przegląd zakładał się codziennie; błąd z przeglądu kodu). */
  function bladOdczytuPrzegladu(harmonogram, f) {
    const pole = harmonogram && (harmonogram.interwal === 'motogodziny' || harmonogram.interwal === 'cykle') ? harmonogram.interwal : null;
    if (!pole) return null;
    const v = f[pole];
    return v === '' || v === null || v === undefined || isNaN(liczba(v))
      ? `Ten przegląd jest liczony z ${pole === 'cykle' ? 'cykli' : 'motogodzin'} — wpisz odczyt: ${pole === 'cykle' ? 'Cykle' : 'Motogodziny'}.` : null;
  }

  function bledyLicznika(f, poprzedni) {
    const b = [], d = {};
    for (const pole of ['motogodziny', 'cykle']) {
      if (f[pole] === undefined || f[pole] === null || !String(f[pole]).trim()) continue;
      const v = liczba(f[pole]);
      if (isNaN(v) || v < 0) { b.push(`${pole === 'cykle' ? 'Cykle' : 'Motogodziny'}: liczba ≥ 0.`); continue; }
      d[pole] = v;
    }
    if (!Object.keys(d).length && !b.length) b.push('Wpisz motogodziny albo cykle.');
    const ostrzezenia = [];
    for (const pole of Object.keys(d)) {
      const stary = poprzedni && typeof poprzedni[pole] === 'number' ? poprzedni[pole] : null;
      if (stary !== null && d[pole] < stary) ostrzezenia.push(`${pole === 'cykle' ? 'Cykle' : 'Motogodziny'} mniejsze niż ostatni odczyt (${stary}). Licznik wymieniony?`);
    }
    return { bledy: b, dane: d, ostrzezenia };
  }

  global.URWidok = {
    raz, odmiana, liczba, linie, maszyny, nazwaLinii, nazwaMaszyny, nazwaKarty, nazwaPracownika, godzina, data, kiedy, numer,
    dzienZakladu, koniecDnia, dodajDni, mozna, dozwolonyZ, kodZNazwy, priorytetInfo, nazwaZeStalej, zatrzymuje,
    wierszAwarii, listaAwarii, ostatnioZamkniete, akcjeAwarii, GOTOWE_OPISY, POWODY_ANULOWANIA, MAKS_POWODU, powodAnulowania, MAKS_ZDJEC,
    opisNaprawy, bledyZakonczenia, daneZakonczenia, sprawdzMaszyne, mechanicy, komunikatKonfliktu, powiadomienie, historiaAwarii,
    kpi, OKRESY, okresKpi,
    statusPrzegladu, kartaDla, kartyDlaMaszyny, wierszPrzegladu, listaPrzegladow, wynikPomiaru, zakres, danePunktu, postepPrzegladu,
    wykonaniePlanu, bledyPlanowania, kluczPrzegladu,
    INTERWALY, opisInterwalu, kartaZFormularza, harmonogramZFormularza, listaHarmonogramu, przykladowyPlan, WZORY_KART,
    listaLicznikow, bledyLicznika, bladOdczytuPrzegladu, harmonogramPrzegladu, swieze, adresPowiadomienia, ekranZAdresu, pytaniePrzejecia, SWIEZE_MS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.URWidok;
})(typeof window !== 'undefined' ? window : globalThis);
