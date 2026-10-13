/* Aplikacja KJ — co pokazać i co wolno zapisać (bez rysowania).

   Czyste funkcje: dostają obiekty ze stanu (hala.obiekty…), słowniki i „teraz”,
   a oddają gotowe wiersze albo listę błędów formularza. Nie dotykają DOM ani
   sieci, więc kj/testy/widok-testy.js liczy je w Node / JavaScriptCore dokładnie
   tak, jak liczy je telefon kontrolera.

   Reguły wspólne z innymi aplikacjami (zmiany, czas zakładu) bierzemy z Hala.* —
   KJ nie może liczyć „po swojemu”, bo lider i Panel patrzą na te same próby.   */

(function (global) {
  'use strict';

  const H = () => global.Hala;

  // ------------------------------------------------------------ drobiazgi

  const liczba = v => (typeof v === 'number' && isFinite(v) ? v : (v === '' || v === null || v === undefined ? 0 : Number(v)));

  const posortowane = (slownik, domyslnaKolejnosc) =>
    Object.entries(slownik || {})
      .sort(([ka, a], [kb, b]) => (((a && a.kolejnosc) || domyslnaKolejnosc || 999) - ((b && b.kolejnosc) || domyslnaKolejnosc || 999)) || ka.localeCompare(kb, 'pl'))
      .map(([kod, w]) => Object.assign({ kod }, w || {}));

  const linie = slowniki => posortowane((slowniki || {}).linie).map(l => ({ kod: l.kod, nazwa: l.nazwa || l.kod }));
  const nazwaLinii = (slowniki, kod) => (((slowniki || {}).linie || {})[kod] || {}).nazwa || kod || '—';
  const nazwaStanowiska = (slowniki, kod) => (((slowniki || {}).stanowiska || {})[kod] || {}).nazwa || kod || '—';
  const nazwaWyrobu = (slowniki, kod) => (((slowniki || {}).wyroby || {})[kod] || {}).nazwa || null;
  const WADA_INNA = { kod: 'inne', nazwa: 'Brak / inna wada' };      // D56: braki także bez katalogu wad
  const nazwaWady = (slowniki, kod) => (((slowniki || {}).katalog_wad || {})[kod] || {}).nazwa || (kod === WADA_INNA.kod ? WADA_INNA.nazwa : kod);

  function nazwaPracownika(pracownicy, id) {
    if (!id) return null;
    const p = (pracownicy || []).find(x => x.id === id);
    return p ? p.nazwa : id;
  }

  const ms = chwila => (typeof chwila === 'number' ? chwila : Date.parse(chwila));

  /* Godzina zakładu (Europe/Warsaw), niezależnie od strefy ustawionej w telefonie. */
  function godzina(chwila) {
    if (chwila === null || chwila === undefined || chwila === '') return '—';
    const t = ms(chwila);
    if (isNaN(t)) return '—';
    const l = H().lokalny(t);
    return `${String(l.godz).padStart(2, '0')}:${String(l.min).padStart(2, '0')}`;
  }

  function data(chwila) {
    const t = ms(chwila);
    if (isNaN(t)) return '—';
    const l = H().lokalny(t);
    return `${String(l.dzien).padStart(2, '0')}.${String(l.miesiac).padStart(2, '0')}`;
  }

  /* Data z rokiem „15.10.2026” (STYL-GK §6) — „Ważny do” alertu to data, którą liderzy czytają dosłownie;
     samo „15.10” bez roku na przełomie roku myliło. */
  function dataPelna(chwila) {
    if (chwila === null || chwila === undefined || chwila === '') return '—';
    const t = ms(chwila);
    if (isNaN(t)) return '—';
    const l = H().lokalny(t);
    return `${String(l.dzien).padStart(2, '0')}.${String(l.miesiac).padStart(2, '0')}.${l.rok}`;
  }

  /* „dziś 14:05” / „24.09 14:05” — kontroler przegląda listy z kilku dni. */
  function kiedy(chwila, teraz) {
    if (chwila === null || chwila === undefined || chwila === '') return '—';
    return (teraz !== undefined && data(chwila) === data(teraz) ? '' : data(chwila) + ' ') + godzina(chwila);
  }

  /* Numer QA-/RK-/PB-… nadaje hub przy synchronizacji. Wcześniej „—” (KONTRAKT §5.3). */
  const numer = obiekt => (obiekt && obiekt.numer) || '—';

  /* Pole daty z formularza (RRRR-MM-DD, dzień w zakładzie) → koniec tego dnia w UTC.
     „Ważny do 30.09” znaczy do północy zakładu, a nie do 02:00 czasu UTC. */
  function koniecDnia(tekst) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tekst || '');
    if (!m) return null;
    const nastepny = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1));
    return new Date(H().zLokalnego(nastepny.getUTCFullYear(), nastepny.getUTCMonth() + 1, nastepny.getUTCDate(), 0, 0) - 1).toISOString();
  }

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

  /* Jedno wykonanie naraz: drugie dotknięcie „Zapisz” w trakcie zapisu jest ignorowane.
     Kontroler w rękawicach często trafia dwa razy — bez tego powstawały dwie próby. */
  function raz(fn) {
    let trwa = false;
    return async function (...argumenty) {
      if (trwa) return undefined;
      trwa = true;
      try { return await fn.apply(this, argumenty); } finally { trwa = false; }
    };
  }

  /* „1 zmiana”, „3 zmiany”, „5 zmian”, „22 zmiany”, „12 zmian”. */
  function odmiana(n, jedna, kilka, wiele) {
    const d = Math.abs(n) % 10, s = Math.abs(n) % 100;
    if (n === 1) return jedna;
    return d >= 2 && d <= 4 && !(s >= 12 && s <= 14) ? kilka : wiele;
  }

  // ------------------------------------------------------------ próba

  const sumaWad = wady => Object.values(wady || {}).reduce((s, n) => s + Math.max(0, liczba(n)), 0);

  /* Pole liczby tak, jak je wpisano: '' = 0, a „12,5”, „-5”, „abc” zostają błędne i bledyProby mówi o nich,
     zamiast po cichu zamieniać je na 0 albo 12 (parseInt). Wspólne dla formularza próby i korekty (etap 3). */
  const liczbaZPola = v => { const t = String(v === null || v === undefined ? '' : v).trim(); return t === '' ? 0 : Number(t.replace(',', '.')); };

  /* Okno „Korekta próby” → formularz jak przy zapisie (pole(nazwa) = wartość pola). Wcześniej parseInt||0 zamieniał
     „12,5” na 12, a „abc” na 0 — korekta zapisywała coś innego, niż wpisał kontroler. */
  function korektaZFormularza(pole, katalog, linia) {
    const f = { linia, sprawdzone: liczbaZPola(pole('sprawdzone')), braki: liczbaZPola(pole('braki')), wady: {},
                wnioski: String(pole('wnioski') || ''), dzialania: String(pole('dzialania') || '') };
    for (const w of katalog || []) { const n = liczbaZPola(pole('wada:' + w.kod)); if (n) f.wady[w.kod] = n; }
    return f;
  }

  /* Formularz próby → lista błędów (pusta = można zapisać). Zgodne liczy aplikacja
     (sprawdzone − braki), więc „zgodne + braki = sprawdzone” trzyma się z definicji;
     sprawdzamy je i tak, bo korekta może przyjść z innej drogi. */
  /* Hub przyjmuje najwyżej 20 plików w jednym polu typu „pliki” — 21. zdjęcie odrzuciłoby całą próbę. */
  const MAKS_ZDJEC = 20;

  function bledyProby(f) {
    const b = [];
    if ((f.zdjecia || []).length > MAKS_ZDJEC) b.push(`Najwyżej ${MAKS_ZDJEC} zdjęć — usuń nadmiarowe.`);
    const spr = liczba(f.sprawdzone), br = liczba(f.braki);
    const podaneZgodne = f.zgodne !== undefined;
    const zg = podaneZgodne ? liczba(f.zgodne) : spr - br;
    if (!f.linia) b.push('Zeskanuj stanowisko albo maszynę albo wybierz miejsce z listy.');
    const wady = Object.values(f.wady || {}).map(liczba);
    if (![spr, br].concat(podaneZgodne ? [zg] : [], wady).every(n => Number.isInteger(n) && n >= 0)) b.push('Liczby sztuk muszą być całe i nieujemne.');
    else {
      if (spr <= 0) b.push('Podaj, ile sztuk sprawdzono.');
      if (br > spr) b.push('Braków nie może być więcej niż sprawdzonych sztuk.');
      else if (zg + br !== spr) b.push('Zgodne + braki muszą dać liczbę sprawdzonych.');
      if (sumaWad(f.wady) > br) b.push('Wad jest więcej niż braków — dodaj braki albo zmniejsz wady.');
    }
    return b;
  }

  /* Formularz → dane zdarzenia proba.zarejestrowana (tylko pola z kontraktu, bez pustych). */
  function daneProby(f) {
    const spr = liczba(f.sprawdzone), br = liczba(f.braki);
    const d = { linia: f.linia, sprawdzone: spr, zgodne: spr - br, braki: br,
                wady: Object.entries(f.wady || {}).filter(([, n]) => liczba(n) > 0).map(([kod, n]) => ({ kod, ilosc: liczba(n) })),
                zdjecia: (f.zdjecia || []).slice() };
    if (f.stanowisko) d.stanowisko = f.stanowisko;
    if (f.qr) d.qr = f.qr;
    if (f.czas_rozpoczecia) d.czas_rozpoczecia = f.czas_rozpoczecia;
    const zl = {};
    if (f.zlecenie && String(f.zlecenie).trim()) zl.numer = String(f.zlecenie).trim();
    if (f.zdjecie_zlecenia) zl.zdjecie = f.zdjecie_zlecenia;
    if (Object.keys(zl).length) d.zlecenie = zl;
    if (f.wyrob) d.wyrob = f.wyrob;
    if (f.wnioski && f.wnioski.trim()) d.wnioski = f.wnioski.trim();
    if (f.dzialania && f.dzialania.trim()) d.dzialania = f.dzialania.trim();
    return d;
  }

  /* Podpowiedź partii brakowej (D13): próg z ustawień, decyzja należy do kontrolera. */
  function podpowiedzPartii(proba, progProc) {
    const spr = liczba(proba && proba.sprawdzone), br = liczba(proba && proba.braki);
    if (!(spr > 0) || !(br > 0)) return null;
    const proc = br * 100 / spr;
    return proc + 1e-9 >= progProc ? { proc: Math.round(proc * 10) / 10, prog: progProc } : null;
  }

  /* Powód do partii brakowej podpowiedziany z próby — kontroler może go zmienić. */
  function powodPartii(proba, slowniki) {
    const p = podpowiedzPartii(proba, 0);
    const wady = (proba.wady || []).map(w => `${nazwaWady(slowniki, w.kod)} ${w.ilosc}`).join(', ');
    return `Braki ${proba.braki}/${proba.sprawdzone} szt.${p ? ` (${String(p.proc).replace('.', ',')} %)` : ''}${wady ? ': ' + wady : ''}`;
  }

  /* Korekta próby: tylko pola, które naprawdę się zmieniły (proba.skorygowana scala podane). */
  function korektaProby(stara, f) {
    const nowa = daneProby(Object.assign({}, f, { linia: stara.linia }));
    const zmiany = {};
    // Wady porównujemy jako mapę kod → ilość: zapisana kolejność to kolejność stukania w kafelki,
    // a korekta układa je wg katalogu — ta sama treść w innej kolejności to NIE zmiana.
    const wadyMapa = w => JSON.stringify(Object.entries((w || []).reduce((m, x) => { m[x.kod] = (m[x.kod] || 0) + liczba(x.ilosc); return m; }, {}))
      .filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
    for (const k of ['sprawdzone', 'zgodne', 'braki', 'wady', 'wnioski', 'dzialania']) {
      const a = k === 'wady' ? wadyMapa(stara.wady) : JSON.stringify(stara[k] === undefined ? null : stara[k]);
      const b = k === 'wady' ? wadyMapa(nowa.wady) : JSON.stringify(nowa[k] === undefined ? null : nowa[k]);
      if (a !== b) zmiany[k] = nowa[k] === undefined ? '' : nowa[k];
    }
    return zmiany;
  }

  // ------------------------------------------------------------ miejsce próby (stanowisko, maszyna albo linia)

  /* D51 (2026-10-12): w zakładzie jest jedna linia („Hala”) i same maszyny, bez stanowisk — Panel wyznacza tylko
     maszyny. Próba szła wcześniej WYŁĄCZNIE ze stanowiska (linia brana ze stanowiska), więc bez stanowisk nie dało się
     jej zapisać. Teraz miejsce to stanowisko, maszyna (etykieta QR drukowana w Panelu, jak u lidera) albo cała linia. */
  const LINIA_W_LISCIE = 'linia:';

  /* Jedyna linia ze słownika (kod) albo null — przy jednej linii nie każemy jej wybierać (jak Panel od D51). */
  const jedynaLinia = slowniki => { const l = linie(slowniki); return l.length === 1 ? l[0].kod : null; };

  /* „Kod nieczytelny? Wybierz z listy”: stanowiska, a linie bez stanowisk — jako „cała linia”. */
  function miejscaDoWyboru(slowniki) {
    const st = (slowniki || {}).stanowiska || {};
    const zeStanowiskami = new Set(Object.values(st).map(s => s && s.linia));
    const jednaLinia = linie(slowniki).length === 1;   // UI etap 3: przy jednej linii jej nazwa w każdym wierszu to szum
    return Object.entries(st).sort(([a], [b]) => a.localeCompare(b, 'pl'))
      .map(([k, s]) => ({ wartosc: k, opis: `${jednaLinia ? '' : nazwaLinii(slowniki, s && s.linia) + ' · '}${(s && s.nazwa) || k}` }))
      .concat(linie(slowniki).filter(l => !zeStanowiskami.has(l.kod)).map(l => ({ wartosc: LINIA_W_LISCIE + l.kod, opis: `${l.nazwa} · cała linia` })));
  }

  /* Wartość z listy → miejsce {linia, stanowisko} bez skanu (qr: null); nieznana → null. */
  function miejsceZWyboru(wartosc, slowniki) {
    const w = String(wartosc || '');
    if (w.startsWith(LINIA_W_LISCIE)) {
      const l = w.slice(LINIA_W_LISCIE.length);
      return ((slowniki || {}).linie || {})[l] ? { linia: l, stanowisko: null, maszyna: null, qr: null } : null;
    }
    const s = ((slowniki || {}).stanowiska || {})[w];
    return s && s.linia ? { linia: s.linia, stanowisko: w, maszyna: null, qr: null } : null;
  }

  /* Przy jednej linii bez stanowisk miejsce jest oczywiste — formularz próby ustawia je sam, BEZ godziny startu
     (ta przychodzi ze skanu albo z wyboru; bez niej czasem próby jest chwila zapisu, a nie otwarcia formularza). */
  function domyslneMiejsce(slowniki) {
    const m = miejscaDoWyboru(slowniki);
    return m.length === 1 && m[0].wartosc.startsWith(LINIA_W_LISCIE) ? m[0].wartosc.slice(LINIA_W_LISCIE.length) : null;
  }

  /* Napis przycisku skanu: bez stanowisk w słowniku na hali wiszą tylko etykiety maszyn. */
  const napisSkanu = slowniki => (Object.keys((slowniki || {}).stanowiska || {}).length ? 'Skanuj stanowisko' : 'Skanuj maszynę');

  /* Wynik Hala.odczytajKod(tekst) → miejsce {linia, stanowisko, maszyna, qr} albo {blad}. qr = zeskanowany tekst
     (dowód obecności, KONTRAKT §10) tylko dla kodu HALA:… albo qr ze słownika; kod wpisany bez przedrostka
     („WT-01”, „L1-S2”) przyjmujemy, ale „bez skanu”. */
  function miejsceZeSkanu(k, slowniki) {
    const sl = slowniki || {};
    const st = sl.stanowiska || {}, masz = sl.maszyny || {}, lin = sl.linie || {};
    if (!k) return { blad: 'Nie odczytano kodu. Spróbuj jeszcze raz albo wybierz miejsce z listy.' };
    let rodzaj = k.rodzaj, wpis = k.wpis, qr = k.surowy || null;
    const kod = k.kod;
    if (!rodzaj) {
      qr = null;
      if (st[kod]) { rodzaj = 'stanowiska'; wpis = st[kod]; }
      else if (masz[kod]) { rodzaj = 'maszyny'; wpis = masz[kod]; }
      else if (lin[kod]) { rodzaj = 'linie'; wpis = lin[kod]; }
      else return { blad: `Nie znam kodu „${kod}”. Zeskanuj etykietę maszyny albo stanowiska albo wybierz miejsce z listy.` };
    }
    if (rodzaj === 'pracownik') return { blad: 'To kod identyfikatora, a nie miejsca kontroli. Zeskanuj etykietę maszyny albo stanowiska.' };
    if (rodzaj === 'stanowiska') {
      if (!wpis) return { blad: `Nie znam stanowiska „${kod}”. Sprawdź kod albo wybierz miejsce z listy.` };
      if (!wpis.linia) return { blad: `Stanowisko „${wpis.nazwa || kod}” nie ma linii w słowniku — zgłoś to administratorowi albo wybierz miejsce z listy.` };
      return { linia: wpis.linia, stanowisko: kod, maszyna: null, qr };
    }
    if (rodzaj === 'maszyny') {
      if (!wpis) return { blad: `Nie znam maszyny „${kod}”. Sprawdź kod albo wybierz miejsce z listy.` };
      // Stanowisko maszyny tylko wtedy, gdy jest w słowniku (D51: Panel ich nie zakłada, stare zostają przy maszynach).
      const stanowisko = wpis.stanowisko && st[wpis.stanowisko] ? wpis.stanowisko : null;
      const linia = wpis.linia || (stanowisko && st[stanowisko].linia) || jedynaLinia(sl);
      if (!linia) return { blad: `Maszyna „${wpis.nazwa || kod}” nie ma linii w słowniku — zgłoś to administratorowi albo wybierz miejsce z listy.` };
      return { linia, stanowisko, maszyna: kod, qr };
    }
    if (rodzaj === 'linie') {
      if (!wpis) return { blad: `Nie znam linii „${kod}”. Sprawdź kod albo wybierz miejsce z listy.` };
      return { linia: kod, stanowisko: null, maszyna: null, qr };
    }
    return { blad: `Nie znam kodu „${kod}”. Zeskanuj etykietę maszyny albo stanowiska albo wybierz miejsce z listy.` };
  }

  /* Nazwa miejsca próby: stanowisko, bez niego maszyna (pole maszyna formularza albo qr „HALA:M:…”), a bez niej
     linia. Na liście prób bez stanowiska stało „—”, co kontrolerowi nic nie mówiło. */
  function nazwaMiejsca(slowniki, d) {
    const x = d || {};
    if (x.stanowisko) return nazwaStanowiska(slowniki, x.stanowisko);
    const m = x.maszyna || (/^HALA:M:(.+)$/i.exec(String(x.qr || '')) || [])[1];
    if (m) return ((((slowniki || {}).maszyny || {})[m]) || {}).nazwa || m;
    return nazwaLinii(slowniki, x.linia);
  }

  /* Brudnopis próby może przeleżeć zmianę (skan 13:55, zapis 14:30 albo następnego dnia). Próba liczy się
     do zmiany z chwili skanu, więc w planie bieżącej zmiany by jej nie było — kontroler musi o tym wiedzieć. */
  function skanZInnejZmiany(czasSkanu, zmiana) {
    if (!czasSkanu || !zmiana) return false;
    return !wOknie(czasSkanu, zmiana.od, zmiana.do);
  }

  // ------------------------------------------------------------ plan próbkowania

  const wOknie = (chwila, od, do_) => { const t = ms(chwila); return t >= ms(od) && t < ms(do_); };
  const czasProby = p => (p.dane && p.dane.czas_rozpoczecia) || p.utworzono;

  /* Wpis planu „na całą linię” (D51 — zakład bez stanowisk): klucz = kod linii, wartość {linia, na_zmiane} BEZ pola
     stanowisko. Wpisy stanowisk zawsze mają pole stanowisko (tak je zapisuje katalog), więc stare plany się nie mylą,
     a stara wersja aplikacji pokaże taki wpis najwyżej jako stanowisko o kodzie linii. */
  const wpisLinii = (kod, w) => !!w && !w.stanowisko && w.linia === kod;

  /* Plan zmiany: stanowiska (albo całe linie) z plan_probkowania, ile prób KJ zrobiono w oknie zmiany.
     Liczą się tylko próby KJ (zrodlo === 'kj') — próby lidera to jego obchód, nie plan KJ. Próba bez stanowiska
     z planu (np. ze skanu maszyny) zalicza plan swojej linii, jeśli linia ma plan „na całą linię”. */
  function planZmiany({ slowniki, proby, zmiana }) {
    const plan = (slowniki || {}).plan_probkowania || {};
    const zrobione = {}, zrobioneLinii = {};
    let pozaPlanem = 0;
    for (const p of proby || []) {
      if (!zmiana || !p.dane || p.dane.zrodlo !== 'kj' || !wOknie(czasProby(p), zmiana.od, zmiana.do)) continue;
      const st = p.dane.stanowisko, lin = p.linia || p.dane.linia;
      if (st && plan[st] && !wpisLinii(st, plan[st])) zrobione[st] = (zrobione[st] || 0) + 1;
      else if (lin && wpisLinii(lin, plan[lin])) zrobioneLinii[lin] = (zrobioneLinii[lin] || 0) + 1;
      else pozaPlanem++;
    }
    const grupy = new Map();
    for (const l of linie(slowniki)) grupy.set(l.kod, { linia: l.kod, nazwa: l.nazwa, stanowiska: [] });
    for (const [kod, w] of Object.entries(plan)) {
      const naZmiane = Math.max(0, liczba(w && w.na_zmiane));
      if (!naZmiane) continue;
      const calaLinia = wpisLinii(kod, w);
      const liniaKod = (w && w.linia) || (((slowniki || {}).stanowiska || {})[kod] || {}).linia || '?';
      if (!grupy.has(liniaKod)) grupy.set(liniaKod, { linia: liniaKod, nazwa: nazwaLinii(slowniki, liniaKod), stanowiska: [] });
      const z = (calaLinia ? zrobioneLinii[kod] : zrobione[kod]) || 0;
      grupy.get(liniaKod).stanowiska.push({ kod, nazwa: calaLinia ? 'Cała linia' : nazwaStanowiska(slowniki, kod), calaLinia,
                                            zrobione: z, plan: naZmiane, gotowe: z >= naZmiane });
    }
    const wynik = [];
    let wszystkie = 0, gotowe = 0;
    for (const g of grupy.values()) {
      if (!g.stanowiska.length) continue;
      // Najpierw to, co czeka — kontroler idzie od góry listy.
      g.stanowiska.sort((a, b) => (a.gotowe - b.gotowe) || a.kod.localeCompare(b.kod, 'pl'));
      g.zrobione = g.stanowiska.reduce((s, x) => s + Math.min(x.zrobione, x.plan), 0);
      g.plan = g.stanowiska.reduce((s, x) => s + x.plan, 0);
      wszystkie += g.plan; gotowe += g.zrobione;
      wynik.push(g);
    }
    return { linie: wynik, zrobione: gotowe, plan: wszystkie, pozaPlanem };
  }

  /* Wiersze edycji planu (kierownik KJ): na linii ze stanowiskami — stanowiska, na linii bez nich — jeden wiersz
     „Cała linia”. pole = nazwa pola formularza (z przedrostkiem, żeby kod linii nie zderzył się z kodem stanowiska),
     klucz = klucz w słowniku, wartosc = wpis bez na_zmiane. */
  function wierszePlanu(slowniki) {
    const plan = (slowniki || {}).plan_probkowania || {};
    const st = Object.entries((slowniki || {}).stanowiska || {});
    const kody = pokazKody(slowniki);
    return linie(slowniki).map(l => {
      const ze = st.filter(([, s]) => s && s.linia === l.kod).sort(([a], [b]) => a.localeCompare(b, 'pl'));
      const pozycje = ze.length
        ? ze.map(([k, s]) => ({ pole: k, klucz: k, nazwa: kody ? `${s.nazwa || k} (${k})` : (s.nazwa || k), wartosc: { linia: l.kod, stanowisko: k },
                                na_zmiane: (plan[k] && !wpisLinii(k, plan[k]) && liczba(plan[k].na_zmiane)) || 0 }))
        : [{ pole: LINIA_W_LISCIE + l.kod, klucz: l.kod, nazwa: 'Cała linia', wartosc: { linia: l.kod },
             na_zmiane: (wpisLinii(l.kod, plan[l.kod]) && liczba(plan[l.kod].na_zmiane)) || 0 }];
      return { linia: l.kod, nazwa: l.nazwa, pozycje };
    });
  }

  /* Próby z bieżącej zmiany (najnowsze na górze) do listy pod planem. */
  function probyZmiany({ proby, zmiana, slowniki, zrodlo }) {
    return (proby || [])
      .filter(p => p.dane && (!zrodlo || p.dane.zrodlo === zrodlo) && zmiana && wOknie(czasProby(p), zmiana.od, zmiana.do))
      .sort((a, b) => ms(czasProby(b)) - ms(czasProby(a)))
      .map(p => ({ id: p.id, czas: czasProby(p), linia: p.linia || p.dane.linia, liniaNazwa: nazwaLinii(slowniki, p.linia || p.dane.linia),
                   stanowisko: nazwaMiejsca(slowniki, Object.assign({ linia: p.linia }, p.dane)), zlecenie: ((p.dane.zlecenie || {}).numer) || null,
                   sprawdzone: p.dane.sprawdzone, braki: p.dane.braki, oczekuje: !!p._oczekuje,
                   proc: p.dane.sprawdzone ? Math.round(p.dane.braki * 1000 / p.dane.sprawdzone) / 10 : null }));
  }

  /* Próby LIDERÓW z bieżącej zmiany z % braków ≥ progu (ustawienia.prog_brakow_proc), jeszcze bez partii brakowej
     (etap 3). Lider nie oznacza partii — to decyzja kontrolera (D13); wcześniej KJ widział te próby tylko w Pareto,
     więc partia z obchodu lidera nie trafiała na Panel. */
  function probyLiderowPonadProgiem({ proby, partie, zmiana, slowniki, prog }) {
    const zPartia = new Set((partie || []).map(p => p && p.dane && p.dane.proba).filter(Boolean));
    return probyZmiany({ proby, zmiana, slowniki, zrodlo: 'lider' })
      .filter(p => !zPartia.has(p.id) && podpowiedzPartii({ sprawdzone: p.sprawdzone, braki: p.braki }, prog));
  }

  // ------------------------------------------------------------ Pareto

  /* Pareto wad: suma wady[].ilosc po kodzie, malejąco, z procentem skumulowanym.
     Filtry: okres [od, do), linia, stanowisko, wyrób, źródło ('kj' / 'lider' / '' = oba, D11). */
  function pareto({ proby, slowniki, od, do: do_, linia, stanowisko, wyrob, zrodlo }) {
    const sumy = {};
    let liczbaProb = 0, sprawdzone = 0, braki = 0;
    for (const p of proby || []) {
      const d = p.dane || {};
      if (od && do_ && !wOknie(czasProby(p), od, do_)) continue;
      if (zrodlo && d.zrodlo !== zrodlo) continue;
      if (linia && (p.linia || d.linia) !== linia) continue;
      if (stanowisko && d.stanowisko !== stanowisko) continue;
      if (wyrob && d.wyrob !== wyrob) continue;
      liczbaProb++; sprawdzone += liczba(d.sprawdzone); braki += liczba(d.braki);
      for (const w of d.wady || []) if (w && w.kod) sumy[w.kod] = (sumy[w.kod] || 0) + Math.max(0, liczba(w.ilosc));
    }
    const katalog = (slowniki || {}).katalog_wad || {};
    const suma = Object.values(sumy).reduce((s, n) => s + n, 0);
    let narast = 0;
    const wiersze = Object.entries(sumy).filter(([, n]) => n > 0)
      .sort(([ka, a], [kb, b]) => (b - a) || ka.localeCompare(kb, 'pl'))
      .map(([kod, ilosc]) => {
        narast += ilosc;
        return { kod, nazwa: nazwaWady(slowniki, kod), wycofana: !katalog[kod] && kod !== WADA_INNA.kod, ilosc,
                 proc: Math.round(ilosc * 1000 / suma) / 10, skumulowany: Math.round(narast * 1000 / suma) / 10 };
      });
    return { wiersze, suma, liczbaProb, sprawdzone, braki,
             procBrakow: sprawdzone ? Math.round(braki * 1000 / sprawdzone) / 10 : null };
  }

  /* Okresy Pareto liczone od „teraz” i zmiany z hala.zmianaTeraz(). */
  function okres(nazwa, teraz, zmiana) {
    const DZIEN = 86400000;
    if (nazwa === 'zmiana') {
      // Poza godzinami zmian „ta zmiana” jest pusta — nie wolno po cichu pokazać 30 dni pod tym przyciskiem.
      if (zmiana) return { od: zmiana.od, do: zmiana.do };
      const t = new Date(teraz).toISOString();
      return { od: t, do: t };
    }
    if (nazwa === 'dzis') {
      const l = H().lokalny(teraz);
      const od = H().zLokalnego(l.rok, l.miesiac, l.dzien, 0, 0);
      return { od: new Date(od).toISOString(), do: new Date(teraz + 1).toISOString() };
    }
    const dni = nazwa === '7' ? 7 : 30;
    return { od: new Date(teraz - dni * DZIEN).toISOString(), do: new Date(teraz + 1).toISOString() };
  }

  /* Stopka Pareto mówi o WYBRANYM okresie — stało zawsze „z ostatnich 30 dni”, także przy „7 dni” i „Ta zmiana”. */
  function stopkaPareto(nazwa) {
    const z = { zmiana: 'z tej zmiany', dzis: 'z dzisiaj', 7: 'z ostatnich 7 dni', 30: 'z ostatnich 30 dni' }[nazwa] || 'z ostatnich 30 dni';
    return `Dane ${z} — z prób zapisanych w tym telefonie.`;
  }

  /* Kolor paska planu zmiany: w trakcie zmiany neutralny — niezrobiony plan o 7:00 to nie błąd, a czerwony pasek od
     początku zmiany uczył, że czerwień nic nie znaczy. Czerwony dopiero w ostatniej godzinie zmiany (albo po niej)
     bez wykonanego planu; zielony, gdy plan zrobiony. Bez zmiany (poza godzinami) i bez planu — neutralny. */
  const OSTATNIA_GODZINA_MS = 60 * 60000;
  function stanPaskaPlanu(plan, zmiana, teraz) {
    if (!plan || !plan.plan) return '';
    if (plan.zrobione >= plan.plan) return 'komplet';
    return zmiana && ms(zmiana.do) - teraz <= OSTATNIA_GODZINA_MS ? 'alarm' : '';
  }

  // ------------------------------------------------------------ alerty

  /* Linie, których dotyczy alert: pusta lista = wszystkie linie ze słownika. */
  const linieAlertu = (alert, slowniki) => {
    const l = (alert.dane && alert.dane.linie) || [];
    return l.length ? l.slice() : linie(slowniki).map(x => x.kod);
  };

  function postepAlertu(alert, slowniki, pracownicy) {
    const lin = linieAlertu(alert, slowniki);
    const pot = (alert.dane && alert.dane.potwierdzenia) || {};
    const wiersze = lin.map(kod => {
      const p = pot[kod];
      return { linia: kod, nazwa: nazwaLinii(slowniki, kod), potwierdzone: !!p,
               kto: p ? nazwaPracownika(pracownicy, p.autor) : null, czas: p ? p.czas : null, uwagi: p ? p.uwagi || null : null };
    });
    const potwierdzone = wiersze.filter(w => w.potwierdzone).length;
    return { wiersze, potwierdzone, wszystkie: wiersze.length, komplet: potwierdzone === wiersze.length && wiersze.length > 0 };
  }

  /* teraz (opcjonalnie): „Ważny do” z przeszłości to alert, który już przy publikacji jest nieważny — Lider i Panel
     traktują go jak wycofany (Hala.alertAktywny, etap 3), więc nikt by go nie zobaczył. */
  function bledyAlertu(f, teraz) {
    const b = [];
    if (!(f.tytul || '').trim()) b.push('Wpisz tytuł.');
    if (!(f.opis || '').trim()) b.push('Opisz problem.');
    if (!(f.instrukcja || '').trim()) b.push('Wpisz instrukcję dla operatora.');
    if ((f.tytul || '').length > 200) b.push('Tytuł może mieć najwyżej 200 znaków.');
    if ((f.wazny_do || '').trim()) {
      const wd = koniecDnia(f.wazny_do.trim());
      if (!wd) b.push('„Ważny do” — wybierz datę z kalendarza.');
      else if (teraz !== undefined && ms(wd) <= teraz) b.push('„Ważny do” już minął — wybierz dzisiejszą albo późniejszą datę (albo zostaw puste).');
    }
    return b;
  }

  /* Dzisiejsza data ZAKŁADU (RRRR-MM-DD) — najwcześniejszy „Ważny do” w kalendarzu formularza. */
  function dzisZakladu(teraz) {
    const l = H().lokalny(teraz);
    return `${l.rok}-${String(l.miesiac).padStart(2, '0')}-${String(l.dzien).padStart(2, '0')}`;
  }

  /* Pola zdjęć alertu są typu „pliki”, czyli LISTA id — nawet przy jednym zdjęciu. */
  function daneAlertu(f) {
    const d = { tytul: f.tytul.trim(), opis: f.opis.trim(), instrukcja: f.instrukcja.trim(), linie: (f.linie || []).slice() };
    if (f.zdjecie_wzorcowe) d.zdjecie_wzorcowe = [f.zdjecie_wzorcowe];
    if (f.zdjecie_wady) d.zdjecie_wady = [f.zdjecie_wady];
    if (f.wyrob) d.wyrob = f.wyrob;
    const wd = koniecDnia(f.wazny_do);
    if (wd) d.wazny_do = wd;
    return d;
  }

  function listaAlertow({ alerty, slowniki, pracownicy, teraz }) {
    return (alerty || []).map(a => {
      const p = postepAlertu(a, slowniki, pracownicy);
      const wd = a.dane.wazny_do;
      // Po „Ważny do” lider go nie widzi ani nie potwierdzi (Hala.alertAktywny) — na liście KJ to archiwum, nie aktywny.
      const wygasl = a.status === 'aktywny' && teraz !== undefined && !H().alertAktywny(a, teraz);
      return { id: a.id, numer: numer(a), tytul: a.dane.tytul, aktywny: a.status === 'aktywny' && !wygasl, status: a.status, wygasl, waznyDo: wd || null,
               etykieta: a.etykieta, czas: a.dane.czas_publikacji || a.utworzono, oczekuje: !!a._oczekuje,
               potwierdzone: p.potwierdzone, wszystkie: p.wszystkie, komplet: p.komplet,
               brakuje: p.wiersze.filter(w => !w.potwierdzone).map(w => w.nazwa),
               wszystkieLinie: !((a.dane.linie || []).length),
               przeterminowany: !!(wd && teraz !== undefined && ms(wd) < teraz) };
    }).sort((a, b) => (b.aktywny - a.aktywny) || ms(b.czas) - ms(a.czas));
  }

  // ------------------------------------------------------------ reklamacje

  /* Linia reklamacji podpowiadana ze słownika wyrobów (D14) — zatwierdza człowiek. */
  const liniaWyrobu = (slowniki, kodWyrobu) => ((((slowniki || {}).wyroby || {})[kodWyrobu] || {}).linia) || null;

  function bledyReklamacji(f) {
    const b = [];
    if ((f.zdjecia || []).length > MAKS_ZDJEC) b.push(`Najwyżej ${MAKS_ZDJEC} zdjęć — usuń nadmiarowe.`);
    if (!(f.kod_wyrobu || '').trim()) b.push('Podaj kod wyrobu.');
    if (!f.linia) b.push('Wybierz linię — to jej liderzy dostaną reklamację.');
    if (!(f.opis || '').trim()) b.push('Opisz wadę zgłoszoną przez klienta.');
    return b;
  }

  function daneReklamacji(f) {
    const d = { linia: f.linia, kod_wyrobu: f.kod_wyrobu.trim(), opis: f.opis.trim(), zdjecia: (f.zdjecia || []).slice() };
    if ((f.partia || '').trim()) d.partia = f.partia.trim();
    if ((f.klient || '').trim()) d.klient = f.klient.trim();
    return d;
  }

  /* Komunikat po rejestracji: do której linii poszła (liderzy tej linii dostają powiadomienie, etap 3).
     wyslana === false (zapis czeka w telefonie): nie wolno mówić „przekazana” — liderzy jeszcze jej nie mają. */
  const komunikatReklamacji = (slowniki, linia, wyslana) => (wyslana === false
    ? `Reklamacja zapisana — trafi do liderów (${nazwaLinii(slowniki, linia)}), gdy wróci połączenie`
    : `Reklamacja przekazana liderom: ${nazwaLinii(slowniki, linia)}`);

  /* Linia reklamacji po zmianie kodu wyrobu (stan formularza f: linia, liniaRecznie, liniaZWyrobu).
     - wyrób ze słownika podpowiada linię, chyba że kontroler świadomie wybrał inną przy znanym wyrobie;
     - podpowiedź z wyrobu, który przestał pasować (poprawiony kod), znika — nie zostaje po cichu stara linia;
     - przy jednej linii jest ona wybrana od razu (D51). */
  function liniaPoWyrobie(f, liniaZWyrobu, jedyna) {
    const n = Object.assign({}, f);
    if (liniaZWyrobu) { if (!n.liniaRecznie) { n.linia = liniaZWyrobu; n.liniaZWyrobu = true; } }
    else if (n.liniaZWyrobu) { n.linia = ''; n.liniaZWyrobu = false; }
    if (!n.linia && jedyna) n.linia = jedyna;
    return n;
  }

  /* Linia dotknięta ręcznie. „Ręcznie” (nie nadpisze jej podpowiedź) tylko wtedy, gdy wyrób już jest znany i ma inną
     linię — linia wybrana PRZED wpisaniem kodu wyrobu blokowała wcześniej podpowiedź na zawsze, bez ostrzeżenia. */
  const liniaKliknieta = (f, linia, liniaZWyrobu) =>
    Object.assign({}, f, { linia, liniaRecznie: !!liniaZWyrobu && linia !== liniaZWyrobu, liniaZWyrobu: false });

  /* „Odczytał: Anna” / „Odczytali: Anna, Piotr”. */
  const naglowekOdczytow = n => (n > 1 ? 'Odczytali' : 'Odczytał');

  /* Kto z liderów odczytał reklamację (mapa odczyty kluczowana autorem). */
  function odczytyReklamacji(r, pracownicy) {
    return Object.entries((r.dane && r.dane.odczyty) || {})
      .map(([autor, w]) => ({ autor, kto: nazwaPracownika(pracownicy, autor), czas: (w && w.czas) || null }))
      .sort((a, b) => ms(a.czas) - ms(b.czas));
  }

  function listaReklamacji({ reklamacje, slowniki, pracownicy }) {
    return (reklamacje || []).map(r => {
      const o = odczytyReklamacji(r, pracownicy);
      return { id: r.id, numer: numer(r), otwarta: r.status === 'otwarta', etykieta: r.etykieta,
               wyrob: r.dane.kod_wyrobu, wyrobNazwa: nazwaWyrobu(slowniki, r.dane.kod_wyrobu), klient: r.dane.klient || null,
               linia: r.linia || r.dane.linia, liniaNazwa: nazwaLinii(slowniki, r.linia || r.dane.linia),
               czas: r.dane.czas_rejestracji || r.utworzono, odczyty: o, oczekuje: !!r._oczekuje };
    }).sort((a, b) => (b.otwarta - a.otwarta) || ms(b.czas) - ms(a.czas));
  }

  // ------------------------------------------------------------ partie brakowe

  function listaPartii({ partie, slowniki }) {
    return (partie || []).map(p => ({
      id: p.id, numer: numer(p), aktywna: p.status === 'brakowa', etykieta: p.etykieta,
      linia: p.linia || p.dane.linia, liniaNazwa: nazwaLinii(slowniki, p.linia || p.dane.linia),
      zlecenie: p.dane.zlecenie || null, partia: p.dane.partia || null, wyrob: p.dane.wyrob || null,
      ilosc: p.dane.ilosc === undefined ? null : p.dane.ilosc, powod: p.dane.powod || '',
      czas: p.dane.czas_oznaczenia || p.utworzono, proba: p.dane.proba || null, oczekuje: !!p._oczekuje,
    })).sort((a, b) => (b.aktywna - a.aktywna) || ms(b.czas) - ms(a.czas));
  }

  /* „Ilość w partii” (opcjonalna): puste = brak, inaczej liczba całych sztuk. Wcześniej parseInt zamieniał po cichu
     „12,5” na 12 i „1e3” na 1 — wbrew zasadzie z liczbaZPola. null = dobrze. */
  function bladIlosci(v) {
    if (String(v === null || v === undefined ? '' : v).trim() === '') return null;
    const n = liczbaZPola(v);
    return Number.isInteger(n) && n >= 0 ? null : 'Ilość w partii: liczba całych sztuk, np. 200 (albo zostaw puste).';
  }

  /* Plan zmiany pokazuje partie z BIEŻĄCEJ zmiany (tak jak Panel); starsze aktywne tylko liczymy —
     po miesiącu pracy lista pod planem miała kilkaset kart. */
  function partieZmiany(lista, zmiana) {
    const tej = [], starsze = [];
    for (const p of lista || []) (zmiana && wOknie(p.czas, zmiana.od, zmiana.do) ? tej : starsze).push(p);
    return { tej, starsze };
  }

  // ------------------------------------------------------------ katalog (kierownik KJ)

  /* Kod nowej wady z nazwy: „Brak komponentu” → „brak_komponentu”. Kod jest kluczem
     historii Pareto, więc raz nadany nigdy się nie zmienia — zmienia się tylko nazwa. */
  function kodZNazwy(nazwa, istniejace) {
    const PL = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
    let kod = String(nazwa || '').toLowerCase().replace(/[ąćęłńóśźż]/g, c => PL[c])
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'wada';
    const zajete = new Set(istniejace || []);
    if (!zajete.has(kod)) return kod;
    for (let i = 2; ; i++) if (!zajete.has(`${kod}_${i}`)) return `${kod}_${i}`;
  }

  /* Pole „Kolejność” w oknie wady: nowa wada — następna wolna, zmieniana — jej własna albo PUSTE. Wcześniej wada bez
     kolejności dostawała przy samej zmianie nazwy „następną” i jej kafelek skakał na koniec listy (także u lidera). */
  function kolejnoscWOknie(wada, katalog, edycja) {
    if (edycja) return wada && wada.kolejnosc !== undefined && wada.kolejnosc !== null ? String(wada.kolejnosc) : '';
    return String((katalog || []).reduce((m, x) => Math.max(m, x.kolejnosc || 0), 0) + 1);
  }

  // ------------------------------------------------------------ teksty i zapis

  /* Liczba z ułamkiem po polsku: 2.5 → „2,5”. */
  const procent = n => String(n).replace('.', ',');

  /* „2 z 3 braków”, ale „1 z 1 braku”. */
  const opisWad = (suma, braki) => `${suma} z ${braki} ${odmiana(braki, 'braku', 'braków', 'braków')}`;

  /* Czy zapis wyjdzie do huba od razu: strumień albo dociąganie (szybki tunel — zapisy wychodzą normalnie, tylko
     zmiany od innych przychodzą co kilka sekund; ta sama reguła co pasek w kj.js). Bez tego alert w trybie dociągania
     mówił „wyśle się, gdy wróci sieć”, choć już poszedł. */
  const wysylaNaZywo = p => !!p && (!!p.strumien || (!!p.dociaganie && !p.blad));

  /* Komunikat, gdy zapis w telefonie się nie udał (hala.zapisz rzuca: nikt nie zalogowany, brak wymaganego pola —
     po polsku; pamięć telefonu pełna — DOMException po angielsku). Wcześniej błąd ginął bez słowa. */
  function komunikatBleduZapisu(e) {
    // hala.zapisz rzuca zwykłe Error z polskim zdaniem; DOMException (QuotaExceededError…) i TypeError mają inne name.
    const polski = !!e && e.name === 'Error' && !!e.message;
    return polski ? `Nie zapisano: ${e.message}`
                  : 'Nie zapisano — telefon nie przyjął zapisu (np. brak miejsca). Spróbuj jeszcze raz; formularz został w telefonie.';
  }

  const katalogWad = slowniki => posortowane((slowniki || {}).katalog_wad).map(w => ({ kod: w.kod, nazwa: w.nazwa || w.kod,
    kategoria: w.kategoria || null, kolejnosc: w.kolejnosc === undefined ? null : w.kolejnosc }));
  /* Kafelki wad w próbie: katalog + zawsze „Brak / inna wada” (pusty katalog nie blokuje braków). Edytor katalogu — bez niej. */
  const wadyDoProby = slowniki => { const k = katalogWad(slowniki); return k.some(w => w.kod === WADA_INNA.kod) ? k : k.concat([Object.assign({ kategoria: null, kolejnosc: null }, WADA_INNA)]); };

  // ------------------------------------------------------------ UI etap 2 (2026-10-12, wybór właściciela)

  /* Próba: braki = suma kafelków wad (bez osobnego licznika „Braki” — kontroler liczył je dwa razy). Pole `braki`
     w zdarzeniu zostaje (kontrakt, Pareto, Panel) — z sumą. Brudnopis sprzed zmiany (z ręcznymi brakami) też liczy się
     od nowa z wad, żeby nie zapisać liczby, której na ekranie już nie widać. */
  const brakiZWad = f => Object.assign({}, f, { braki: sumaWad((f || {}).wady) });

  /* „Pomiń” przy próbie lidera ponad progiem: tylko chowa wiersz u TEGO kontrolera do końca zmiany — bez zdarzenia
     (decyzja „nie oznaczam partii” nie jest faktem dla Panelu, a kolega na drugim telefonie może zdecydować inaczej).
     Jeden wpis w telefonie { klucz: <osoba>|<zmiana>, ids } — nowa zmiana albo inna osoba zaczyna od pustej listy,
     więc nic się nie zbiera. */
  const kluczPominietych = (ja, zmiana) => `${ja || '-'}|${(zmiana && zmiana.id) || '-'}`;
  function pominiete(zapis, klucz) {
    return new Set(zapis && zapis.klucz === klucz && Array.isArray(zapis.ids) ? zapis.ids : []);
  }
  function pomin(zapis, klucz, id) {
    const ids = pominiete(zapis, klucz);
    if (id) ids.add(id);
    return { klucz, ids: Array.from(ids) };
  }
  const bezPominietych = (lista, zapis, klucz) => { const p = pominiete(zapis, klucz); return (lista || []).filter(x => !p.has(x.id)); };

  /* Zlecenia od kierownika na Planie (zamiast osobnej zakładki): sekcja tylko, gdy coś jest do zrobienia. */
  const pokazZleceniaNaPlanie = doZrobienia => Number(doZrobienia) > 0;

  // ------------------------------------------------------------ UI etap 3 (2026-10-12, ocena właściciela)

  /* Ile prób zmiany pokazać pod planem bez rozwijania. Lista rosła przez całą zmianę (40 prób = długie przewijanie
     do partii i prób liderów); kontroler patrzy na ostatnie, starsze są za „Pokaż wszystkie (N)”. */
  const NAJNOWSZYCH_PROB = 5;
  const najnowsze = (lista, wszystkie, ile = NAJNOWSZYCH_PROB) => {
    const l = lista || [];
    return { widoczne: wszystkie ? l : l.slice(0, ile), ukryte: wszystkie ? 0 : Math.max(0, l.length - ile) };
  };

  /* Kody stanowisk i linii (L1-S1) przy nazwach tylko, gdy linii jest kilka — przy jednej linii (zakład GK) kod nic
     nie mówi kontrolerowi, a zabiera miejsce w wierszu. */
  const pokazKody = slowniki => linie(slowniki).length > 1;

  /* „▸ Więcej” w próbie (zlecenie, przewodnik, wyrób) zwinięte, chyba że coś już w nim wpisano — inaczej kontroler
     nie zobaczyłby, że brudnopis ma zlecenie. */
  const wiecejProbyOtwarte = f => !!(f && (String(f.zlecenie || '').trim() || f.wyrob || f.zdjecie_zlecenia));

  /* Nazwa linii przed godziną na karcie próby — albo '' (UI etap 4). Przy jednej linii w zakładzie („Hala”, D51)
     powtarzanie jej przy każdej próbie nic nie mówi; przy próbie na całej linii miejsce już JEST linią. */
  const liniaPrzyProbie = (p, slowniki) => (!p || jedynaLinia(slowniki) || p.stanowisko === p.liniaNazwa ? '' : p.liniaNazwa || '');

  global.KJWidok = {
    raz, odmiana, liczba, linie, nazwaLinii, nazwaStanowiska, nazwaWyrobu, nazwaWady, nazwaPracownika, godzina, data, dataPelna, kiedy, numer,
    koniecDnia, mozna, sumaWad, MAKS_ZDJEC, skanZInnejZmiany, bledyProby, daneProby, podpowiedzPartii, powodPartii, korektaProby,
    liczbaZPola, korektaZFormularza, dzisZakladu, probyLiderowPonadProgiem, komunikatReklamacji,
    planZmiany, stanPaskaPlanu, probyZmiany, pareto, okres, stopkaPareto, linieAlertu, postepAlertu, bledyAlertu, daneAlertu, listaAlertow,
    liniaWyrobu, bledyReklamacji, daneReklamacji, odczytyReklamacji, listaReklamacji, listaPartii, partieZmiany, kodZNazwy, katalogWad, wadyDoProby, WADA_INNA,
    jedynaLinia, miejscaDoWyboru, miejsceZWyboru, domyslneMiejsce, napisSkanu, miejsceZeSkanu, nazwaMiejsca, wierszePlanu,
    liniaPoWyrobie, liniaKliknieta, naglowekOdczytow, bladIlosci, kolejnoscWOknie, procent, opisWad, wysylaNaZywo, komunikatBleduZapisu,
    brakiZWad, kluczPominietych, pominiete, pomin, bezPominietych, pokazZleceniaNaPlanie,
    NAJNOWSZYCH_PROB, najnowsze, pokazKody, wiecejProbyOtwarte, liniaPrzyProbie,
  };
})(typeof window !== 'undefined' ? window : globalThis);
