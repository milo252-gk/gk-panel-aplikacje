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
  const nazwaWady = (slowniki, kod) => (((slowniki || {}).katalog_wad || {})[kod] || {}).nazwa || kod;

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
    if (!f.linia) b.push('Zeskanuj stanowisko albo wybierz je z listy.');
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

  /* Brudnopis próby może przeleżeć zmianę (skan 13:55, zapis 14:30 albo następnego dnia). Próba liczy się
     do zmiany z chwili skanu, więc w planie bieżącej zmiany by jej nie było — kontroler musi o tym wiedzieć. */
  function skanZInnejZmiany(czasSkanu, zmiana) {
    if (!czasSkanu || !zmiana) return false;
    return !wOknie(czasSkanu, zmiana.od, zmiana.do);
  }

  // ------------------------------------------------------------ plan próbkowania

  const wOknie = (chwila, od, do_) => { const t = ms(chwila); return t >= ms(od) && t < ms(do_); };
  const czasProby = p => (p.dane && p.dane.czas_rozpoczecia) || p.utworzono;

  /* Plan zmiany: stanowiska z plan_probkowania, ile prób KJ zrobiono w oknie zmiany.
     Liczą się tylko próby KJ (zrodlo === 'kj') — próby lidera to jego obchód, nie plan KJ. */
  function planZmiany({ slowniki, proby, zmiana }) {
    const plan = (slowniki || {}).plan_probkowania || {};
    const zrobione = {};
    let pozaPlanem = 0;
    for (const p of proby || []) {
      if (!zmiana || !p.dane || p.dane.zrodlo !== 'kj' || !wOknie(czasProby(p), zmiana.od, zmiana.do)) continue;
      const st = p.dane.stanowisko;
      if (st && plan[st]) zrobione[st] = (zrobione[st] || 0) + 1; else pozaPlanem++;
    }
    const grupy = new Map();
    for (const l of linie(slowniki)) grupy.set(l.kod, { linia: l.kod, nazwa: l.nazwa, stanowiska: [] });
    for (const [kod, w] of Object.entries(plan)) {
      const naZmiane = Math.max(0, liczba(w && w.na_zmiane));
      if (!naZmiane) continue;
      const liniaKod = (w && w.linia) || (((slowniki || {}).stanowiska || {})[kod] || {}).linia || '?';
      if (!grupy.has(liniaKod)) grupy.set(liniaKod, { linia: liniaKod, nazwa: nazwaLinii(slowniki, liniaKod), stanowiska: [] });
      const z = zrobione[kod] || 0;
      grupy.get(liniaKod).stanowiska.push({ kod, nazwa: nazwaStanowiska(slowniki, kod), zrobione: z, plan: naZmiane,
                                            gotowe: z >= naZmiane });
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

  /* Próby z bieżącej zmiany (najnowsze na górze) do listy pod planem. */
  function probyZmiany({ proby, zmiana, slowniki, zrodlo }) {
    return (proby || [])
      .filter(p => p.dane && (!zrodlo || p.dane.zrodlo === zrodlo) && zmiana && wOknie(czasProby(p), zmiana.od, zmiana.do))
      .sort((a, b) => ms(czasProby(b)) - ms(czasProby(a)))
      .map(p => ({ id: p.id, czas: czasProby(p), linia: p.linia || p.dane.linia, liniaNazwa: nazwaLinii(slowniki, p.linia || p.dane.linia),
                   stanowisko: nazwaStanowiska(slowniki, p.dane.stanowisko), zlecenie: ((p.dane.zlecenie || {}).numer) || null,
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
        return { kod, nazwa: nazwaWady(slowniki, kod), wycofana: !katalog[kod], ilosc,
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
      return { id: a.id, numer: numer(a), tytul: a.dane.tytul, aktywny: a.status === 'aktywny', status: a.status,
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

  /* Komunikat po rejestracji: do której linii poszła (liderzy tej linii dostają powiadomienie, etap 3). */
  const komunikatReklamacji = (slowniki, linia) => `Reklamacja przekazana liderom: ${nazwaLinii(slowniki, linia)}`;

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

  const katalogWad = slowniki => posortowane((slowniki || {}).katalog_wad).map(w => ({ kod: w.kod, nazwa: w.nazwa || w.kod,
    kategoria: w.kategoria || null, kolejnosc: w.kolejnosc === undefined ? null : w.kolejnosc }));

  global.KJWidok = {
    raz, odmiana, liczba, linie, nazwaLinii, nazwaStanowiska, nazwaWyrobu, nazwaWady, nazwaPracownika, godzina, data, kiedy, numer,
    koniecDnia, mozna, sumaWad, MAKS_ZDJEC, skanZInnejZmiany, bledyProby, daneProby, podpowiedzPartii, powodPartii, korektaProby,
    liczbaZPola, korektaZFormularza, dzisZakladu, probyLiderowPonadProgiem, komunikatReklamacji,
    planZmiany, probyZmiany, pareto, okres, linieAlertu, postepAlertu, bledyAlertu, daneAlertu, listaAlertow,
    liniaWyrobu, bledyReklamacji, daneReklamacji, odczytyReklamacji, listaReklamacji, listaPartii, partieZmiany, kodZNazwy, katalogWad,
  };
})(typeof window !== 'undefined' ? window : globalThis);
