/* Panel Kierownika — etykiety QR do druku (2026-09-28). Bez naklejek z kodami HALA:L/S/M na liniach, stanowiskach
   i maszynach nie ruszą obchody ze skanem ani zgłoszenia awarii ze skanu, więc drukuje je administrator z Panelu.

   Kod QR robi koder z biblioteki ZXing (wspolne/klient/skaner-zxing.js — ta sama, która je czyta; licencja Apache-2.0),
   rysujemy go sami jako SVG: ostry w druku w każdym rozmiarze, bez obrazków i bez sieci.

   Właściciel 2026-10-20: „Daj mi drukować każdy kod QR osobno, jak i wszystkie z kategorii zbiorczo. Upewnij się, że
   w panelu kierownika do druku są wszystkie kody QR.” Stąd kategorie (`kategorie`) — wszystko, co aplikacje hali skanują
   (KONTRAKT §10): maszyny, linie, stanowiska, punkty skanu w zadaniach i obchodach UR, identyfikatory osób (HALA:P —
   logowanie skanem w Liderze, UR i KJ). Druk zawsze tym samym arkuszem (`dokument`) w ukrytej ramce
   (`HalaKonto.drukujArkusz`) — jak kody aplikacji; dawny druk całej strony Panelu z CSS druku znikł.
   Czyste funkcje (testy: panel/testy/widok-testy.js — kod zakodowany i odczytany z powrotem przez ZXing). */

(function (global) {
  'use strict';

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Macierz modułów QR: tablica wierszy z 0/1. Poziom korekcji M (15 %) — naklejka na hali bywa porysowana. */
  function macierz(tekst, ZX) {
    const kod = ZX.QRCodeEncoder.encode(String(tekst), ZX.QRCodeDecoderErrorCorrectionLevel.fromString('M'), null);
    const m = kod.getMatrix();
    const wynik = [];
    for (let y = 0; y < m.getHeight(); y++) {
      const wiersz = [];
      for (let x = 0; x < m.getWidth(); x++) wiersz.push(m.get(x, y) === 1 ? 1 : 0);
      wynik.push(wiersz);
    }
    return wynik;
  }

  /* SVG kodu z marginesem 4 modułów (wymóg normy — skaner potrzebuje ciszy dookoła). Jedna ścieżka zamiast
     setek prostokątów, crispEdges — bez rozmytych krawędzi w druku. */
  function svgQR(tekst, ZX) {
    const m = macierz(tekst, ZX), n = m.length, MARGINES = 4, bok = n + 2 * MARGINES;
    let d = '';
    m.forEach((wiersz, y) => wiersz.forEach((v, x) => { if (v) d += `M${x + MARGINES} ${y + MARGINES}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bok} ${bok}" shape-rendering="crispEdges" role="img" aria-label="${esc(tekst)}">`
      + `<rect width="${bok}" height="${bok}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  const RODZAJE = { linie: ['L', 'Linia'], stanowiska: ['S', 'Stanowisko'], maszyny: ['M', 'Maszyna'] };

  /* Co dać do wyboru w „Co drukować” (D51: w Panelu zakłada się tylko maszyny). Etykieta linii — tylko przy kilku liniach
     (przy jednej obchód zalicza każdy kod z hali, więc naklejka „Linia Hala” jest zbędna), stanowiska — tylko gdy jeszcze
     są w słowniku (starsze dane). Kolejność jak na arkuszu. */
  function rodzajeDoWyboru(slowniki) {
    const sl = slowniki || {};
    return ['linie', 'stanowiska', 'maszyny'].filter(r => r === 'maszyny'
      || (r === 'linie' && Object.keys(sl.linie || {}).length > 1)
      || (r === 'stanowiska' && Object.keys(sl.stanowiska || {}).length > 0));
  }

  /* Czy przed drukiem jest co wybrać (UI etap 2 — „🖨 Drukuj etykiety” w Maszynach): kilka linii (wtedy są też etykiety
     linii) albo stanowiska. Przy jednej linii i samych maszynach przycisk drukuje od razu — okienko z jednym zaznaczonym
     „Maszyny” to zbędny krok. */
  function opcjeDoWyboru(slowniki) {
    return rodzajeDoWyboru(slowniki).length > 1;
  }

  /* Co drukujemy: pozycje wybranych słowników dla wybranych linii (pusta lista = wszystkie), w kolejności linii,
     w linii: linia → stanowiska → maszyny. Kod QR z pola „qr” słownika (kody zastane w zakładzie), inaczej HALA:<litera>:<kod>.
     Maszyna (stanowisko) bez linii albo z linią spoza słownika też dostaje etykietę — na końcu, gdy drukujemy wszystkie
     linie: kod skanuje się tak samo, a „wszystkie” ma znaczyć wszystkie. */
  function pozycje(slowniki, { linie, rodzaje }) {
    const sl = slowniki || {};
    const kolejnosc = Object.entries(sl.linie || {}).sort(([ka, a], [kb, b]) => ((a || {}).kolejnosc || 999) - ((b || {}).kolejnosc || 999) || ka.localeCompare(kb));
    const wszystkie = !(linie && linie.length);
    const wybrane = new Set(wszystkie ? kolejnosc.map(([k]) => k) : linie);
    const wynik = [];
    const dodaj = (rodzaj, kod, w, liniaNazwa) => wynik.push({ rodzaj, rodzajNazwa: RODZAJE[rodzaj][1], kod, nazwa: (w && w.nazwa) || kod, liniaNazwa,
                                                               qr: (w && w.qr) || `HALA:${RODZAJE[rodzaj][0]}:${kod}` });
    for (const [kodLinii, l] of kolejnosc) {
      if (!wybrane.has(kodLinii)) continue;
      const liniaNazwa = (l && l.nazwa) || kodLinii;
      for (const rodzaj of ['linie', 'stanowiska', 'maszyny']) {
        if (!(rodzaje || []).includes(rodzaj)) continue;
        const wpisy = rodzaj === 'linie' ? [[kodLinii, l]] : Object.entries(sl[rodzaj] || {}).filter(([, w]) => (w || {}).linia === kodLinii);
        for (const [kod, w] of wpisy.sort(([a], [b]) => a.localeCompare(b))) dodaj(rodzaj, kod, w, liniaNazwa);
      }
    }
    if (wszystkie) {
      const znane = new Set(kolejnosc.map(([k]) => k));
      for (const rodzaj of ['stanowiska', 'maszyny']) {
        if (!(rodzaje || []).includes(rodzaj)) continue;
        Object.entries(sl[rodzaj] || {}).filter(([, w]) => !znane.has((w || {}).linia)).sort(([a], [b]) => a.localeCompare(b))
          .forEach(([kod, w]) => dodaj(rodzaj, kod, w, ''));
      }
    }
    return wynik;
  }

  /* Etykiety maszyn o podanych kodach (punkty skanu w zadaniach, obchód UR). Kod spoza maszyn — stanowisko albo linia
     (dawny „cel” obchodu lidera, D67 przeniósł go do pola maszyna pozycji), a nieznany — goła naklejka HALA:M:<kod>:
     zadanie i tak wymaga jej skanu. Bez powtórzeń, w kolejności podanej. */
  function etykietyKodow(slowniki, kody) {
    const sl = slowniki || {};
    const wszystkie = pozycje(sl, { linie: [], rodzaje: ['linie', 'stanowiska', 'maszyny'] });
    const wynik = [], byly = new Set();
    for (const kod of kody || []) {
      if (!kod || byly.has(kod)) continue;
      byly.add(kod);
      const p = ['maszyny', 'stanowiska', 'linie'].map(r => wszystkie.find(x => x.rodzaj === r && x.kod === kod)).find(Boolean);
      wynik.push(p || { rodzaj: 'maszyny', rodzajNazwa: RODZAJE.maszyny[1], kod, nazwa: kod, liniaNazwa: '', qr: `HALA:M:${kod}` });
    }
    return wynik;
  }

  /* Punkty skanu — gdzie aplikacje każą zeskanować konkretną maszynę: zapisane zlecenia z „▣ Wymagaj skanu” (D54, też kilka
     maszyn — D56), pozycje checklist ze skanem albo obchodem przy maszynie (D67) i karty przeglądów UR z listą maszyn
     (codzienny obchód UR). Naklejki to zwykłe etykiety maszyn — tu zebrane tam, gdzie kierownik ich szuka. */
  function punktySkanu(slowniki) {
    const sl = slowniki || {};
    const wynik = [];
    const maszynyZlecenia = s => [s.maszyna].concat(Array.isArray(s.maszyny) ? s.maszyny : []).filter(Boolean);
    for (const [kod, s] of Object.entries(sl.zlecenia_stale || {}).sort(([, a], [, b]) => String((a || {}).tytul || '').localeCompare(String((b || {}).tytul || ''), 'pl'))) {
      if (!s) continue;
      const kody = s.wymagaj_skanu === true ? maszynyZlecenia(s) : [];
      for (const p of Array.isArray(s.pozycje) ? s.pozycje : []) {
        if (p && (p.wymagaj_skanu === true || p.czynnosc === 'obchod')) kody.push(...maszynyZlecenia(p));
      }
      const etykiety = etykietyKodow(sl, kody);
      if (etykiety.length) wynik.push({ zrodlo: 'zapisane', klucz: `zapisane/${kod}`, kod, nazwa: s.tytul || kod, aktywny: s.aktywny !== false, etykiety });
    }
    // Karty UR z listą maszyn (obchód — mechanik skanuje po kolei). Karta „dla typu maszyny” to przegląd każdej maszyny
    // tego typu osobno — jej naklejki są w kategorii Maszyny; tu byłyby powtórzeniem całej hali.
    for (const [kod, k] of Object.entries(sl.karty_przegladow || {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (!k || !Array.isArray(k.maszyny)) continue;
      const etykiety = etykietyKodow(sl, k.maszyny);
      if (etykiety.length) wynik.push({ zrodlo: 'ur', klucz: `ur/${kod}`, kod, nazwa: k.nazwa || kod, aktywny: true, etykiety });
    }
    return wynik;
  }

  /* Identyfikatory osób (KONTRAKT §10: HALA:P:<identyfikator>). Lider, UR i KJ mają na ekranie logowania „Zeskanuj
     identyfikator” — skan wpisuje identyfikator, a PIN dalej trzeba podać. W kodzie jest login techniczny (id osoby): hub
     przyjmuje go jako identyfikator, a karta jest w bazie tylko jako skrót, więc jej numeru wydrukować się nie da.
     Tylko aktywne osoby z rolą jednej z tych trzech aplikacji (bez ekranu, transportu i Marketingu — tam nikt nie skanuje). */
  const APLIKACJE_ZE_SKANEM = ['lider', 'ur', 'kj'];
  function identyfikatory(pracownicy, kontrakt) {
    const apl = (kontrakt && kontrakt.aplikacje) || {};
    const role = new Set(APLIKACJE_ZE_SKANEM.flatMap(a => ((apl[a] || {}).role || [])));
    role.delete('ekran');
    return (pracownicy || []).filter(p => p && p.id && p.aktywny !== false && !p.usuniety
        && (p.role || []).some(r => (role.size ? role.has(r) : r !== 'ekran')))
      .slice().sort((a, b) => String(a.nazwa || a.id).localeCompare(String(b.nazwa || b.id), 'pl'))
      .map(p => ({ rodzaj: 'pracownicy', rodzajNazwa: 'Identyfikator', kod: p.id, nazwa: p.nazwa || p.id, liniaNazwa: '',
                   podpis: 'Identyfikator — zeskanuj przy logowaniu, potem PIN', qr: `HALA:P:${p.id}` }));
  }

  /* Wszystkie kategorie kodów do okna „🖨 Kody QR” (Więcej). Każda: {kod, nazwa, gdzie, elementy: [{klucz, nazwa, podpis,
     etykiety}]} — jeden element = jeden przycisk 🖨 (maszyna = jedna naklejka, punkt skanu = naklejki jego maszyn);
     „Drukuj wszystkie” = etykiety wszystkich elementów bez powtórzeń. Pusta kategoria znika — kierownik nie szuka
     stanowisk, których w zakładzie nie ma.
     aplikacje — wiersze HalaKonto.wierszeAplikacji z huba (GET /api/v1/aplikacje; null = jeszcze wczytuje, kategoria jest
     zawsze — wszystkie aplikacje GK, D57): element z adresem ma `aplikacja` (kod do druku karty), bez adresu — sam opis
     (GK Czytnik i GK Foto są tylko na komputerze). */
  function kategorie({ slowniki, pracownicy, kontrakt, aplikacje, bladAplikacji }) {
    const sl = slowniki || {};
    const wiele = Object.keys(sl.linie || {}).length > 1;
    const proste = (rodzaj, podpis) => pozycje(sl, { linie: [], rodzaje: [rodzaj] })
      .map(p => ({ klucz: `${rodzaj}/${p.kod}`, nazwa: p.nazwa, podpis: podpis(p), etykiety: [p] }));
    const apl = { kod: 'aplikacje', nazwa: 'Aplikacje na telefon', gdzie: 'Karta A4: kod 55 mm i jak wejść. Też: Moje konto → Kody QR aplikacji',
      blad: bladAplikacji || '', wczytuje: !bladAplikacji && (aplikacje === null || aplikacje === undefined),
      elementy: (aplikacje || []).map(a => ({ klucz: `aplikacje/${a.kod}`, nazwa: a.nazwa, aplikacja: a.adres ? a.kod : null,
        podpis: a.adres ? [a.staly ? '' : 'adres tymczasowy', a.opis].filter(Boolean).join(' · ') || a.adres
          : a.komputer ? 'Tylko na komputerze — bez kodu' : (a.opis || 'Bez adresu'), etykiety: [] })) };
    const lista = [
      apl,
      { kod: 'maszyny', nazwa: 'Maszyny', gdzie: 'Też: Administracja → Maszyny',
        elementy: proste('maszyny', p => [p.kod, wiele ? p.liniaNazwa : ''].filter(Boolean).join(' · ')) },
      { kod: 'punkty', nazwa: 'Punkty skanu w zadaniach i obchodach', gdzie: 'Naklejki maszyn, które trzeba zeskanować. Też: Zlecenia → 💾 Zapisane',
        elementy: punktySkanu(sl).map(p => ({ klucz: p.klucz, nazwa: p.zrodlo === 'ur' ? `UR: ${p.nazwa}` : p.nazwa,
          podpis: `${p.etykiety.map(e => e.kod).join(', ')}${p.aktywny ? '' : ' · wstrzymane'}`, etykiety: p.etykiety })) },
      { kod: 'linie', nazwa: 'Linie', gdzie: '', elementy: wiele ? proste('linie', p => p.kod) : [] },
      { kod: 'stanowiska', nazwa: 'Stanowiska', gdzie: '', elementy: proste('stanowiska', p => [p.kod, p.liniaNazwa].filter(Boolean).join(' · ')) },
      { kod: 'identyfikatory', nazwa: 'Identyfikatory osób', gdzie: 'Logowanie skanem w GK Lider, UR i KJ. Też: Administracja → Pracownicy',
        elementy: identyfikatory(pracownicy, kontrakt).map(p => ({ klucz: `pracownicy/${p.kod}`, nazwa: p.nazwa, podpis: p.kod, etykiety: [p] })) },
    ];
    return lista.filter(k => k.elementy.length || k.wczytuje || k.blad);
  }

  /* Etykiety elementów bez powtórzeń (ta sama maszyna w dwóch punktach skanu = jedna naklejka). */
  function etykietyElementow(elementy) {
    const byly = new Set();
    return (elementy || []).flatMap(e => e.etykiety || []).filter(p => !byly.has(p.qr) && byly.add(p.qr));
  }

  /* Siatka naklejek. svg = funkcja tekst → SVG albo obiekt ZXing (zgodność ze starszym wywołaniem). */
  function arkusz(lista, svg) {
    const rysuj = typeof svg === 'function' ? svg : t => svgQR(t, svg);
    return (lista || []).map(p => `
      <div class="etykieta etykieta-${esc(p.rodzaj)}">
        <div class="etykieta-qr">${rysuj(p.qr)}</div>
        <div class="etykieta-opis">
          <div class="etykieta-kod">${esc(p.kod)}</div>
          <div class="etykieta-nazwa">${esc(p.nazwa)}</div>
          <div class="etykieta-linia">${esc(p.podpis || (p.rodzaj === 'linie' ? 'Linia' : [p.rodzajNazwa, p.liniaNazwa].filter(Boolean).join(' · ')))}</div>
          <div class="etykieta-tekst">${esc(p.qr)}</div>
        </div>
      </div>`).join('');
  }

  /* Cały arkusz do ukrytej ramki (HalaKonto.drukujArkusz): A4, 3 kolumny, kod 26 mm. Barwy stałe — naklejka ma być
     czarno-biała na białym także przy ciemnym motywie Panelu; własny CSS, bo ramka nie widzi arkuszy aplikacji. */
  function dokument(lista, svg, tytul) {
    return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(tytul || 'Etykiety QR')}</title><style>
      @page { size: A4; margin: 10mm; }
      body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #111; background: #fff; }
      .etykiety { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
      .etykieta { display: flex; gap: 3mm; align-items: center; padding: 3mm; border: .3mm dashed #888; background: #fff;
                  break-inside: avoid; page-break-inside: avoid; }
      .etykieta-qr svg { display: block; width: 26mm; height: 26mm; }
      .etykieta-opis { min-width: 0; font-size: 8pt; line-height: 1.25; overflow-wrap: anywhere; }
      .etykieta-kod { font-size: 14pt; font-weight: 800; }
      .etykieta-nazwa { font-weight: 700; }
      .etykieta-tekst { font-family: Consolas, monospace; font-size: 7pt; color: #444; }
    </style></head><body><div class="etykiety">${arkusz(lista, svg)}</div></body></html>`;
  }

  /* Druk etykiet: koder wczytany na żądanie (360 kB) i arkusz w ukrytej ramce — ten sam mechanizm co kody aplikacji. */
  async function drukuj(lista, tytul) {
    if (!(lista || []).length) return 0;
    const K = global.HalaKonto;
    const ZX = await K.wczytajZXing();
    K.drukujArkusz(dokument(lista, t => svgQR(t, ZX), tytul));
    return lista.length;
  }

  const PanelEtykiety = { macierz, svgQR, pozycje, arkusz, dokument, drukuj, rodzajeDoWyboru, opcjeDoWyboru, etykietyKodow,
                          punktySkanu, identyfikatory, kategorie, etykietyElementow };
  global.PanelEtykiety = PanelEtykiety;
  if (typeof module !== 'undefined' && module.exports) module.exports = PanelEtykiety;
})(typeof window !== 'undefined' ? window : globalThis);
