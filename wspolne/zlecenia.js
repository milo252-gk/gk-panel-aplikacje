/* Zlecenia od kierownika — wspólny ekran działów (Lider = produkcja, UR, KJ). Decyzja właściciela 2026-09-28:
   kierownik w Panelu zleca zadania działom, a dział je przyjmuje, wykonuje albo zgłasza, że nie może.
   D31 (2026-10-01): kierownik może wymagać zdjęcia i notatki — jak dowód dostawy w GK Trasy, bez nich „Wyślij”
   jest nieaktywny (a hub i tak by odrzucił). 2026-10-13: także skan kodu QR maszyny zlecenia (naklejka HALA:M:… z Panelu)
   — dowód, że ktoś przy niej był; skaner ze wspólnego skaner.js, kod innej maszyny nie przechodzi. Termin po ludzku: „do 14:00 (za 25 min)”, „po terminie o 1 h 20 min”.

   Jeden plik dla trzech aplikacji, bo ekran ma wyglądać i działać wszędzie tak samo (jak skaner.js).
   Dane i zapis wyłącznie przez hala.js (hala.obiekty('zlecenie'), hala.zapisz, hala.dodajPlik). Aplikacja musi
   mieć 'zlecenie' w Hala.utworz({ typy }).

     <script src="../wspolne/zlecenia.js"></script>
     HalaZlecenia.rysuj(el, hala, { dzial: 'ur' });                         // ekran listy z przyciskami
     HalaZlecenia.doZrobienia(hala, { dzial: 'produkcja', linia: 'L1' });    // liczba na plakietkę
     HalaZlecenia.rysujZalegle(miejsce, hala, { dzial: 'ur' }, () => UR.idz('zlecenia'));   // czerwona karta na ekranie głównym
     HalaZlecenia.sledz(hala, () => ({ dzial: 'ur' }), z => UR.komunikat(`Nowe zlecenie: ${z.dane.tytul}`));

   „Zrobione” i „Nie mogę” otwierają formularz W KARCIE (zdjęcia z aparatu, notatka / powód). Stan formularza
   trzymamy tutaj, bo aplikacje przerysowują ekran przy każdym zdarzeniu z hali — inaczej wpisany tekst i zrobione
   zdjęcia znikałyby w trakcie. */
(function (global) {
  'use strict';

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DO_ZROBIENIA = new Set(['nowe', 'przyjete']);
  const WYSLANE = new Set(['wykonane', 'odrzucone']);
  const MAKS_ZDJEC = 8;                                // jak w GK Trasy — więcej i tak nikt nie obejrzy

  /* Przepadło (D35): hub już oznaczył albo minęło `wazne_do`, a dział nie zdążył. */
  function przepadlo(z, teraz) {
    if (z.status === 'przepadlo') return true;
    const wazne = Date.parse((z.dane || {}).wazne_do);
    return DO_ZROBIENIA.has(z.status) && !isNaN(wazne) && typeof teraz === 'number' && wazne <= teraz;
  }

  /* D55 (właściciel 2026-10-13): „Możesz wykonać zlecenie nawet po określonym czasie, ale szef zobaczy, że się spóźniło” —
     zadanie zmianowe po końcu swojej zmiany (przepadło) dział widzi jeszcze przez dobę jako zaległe; „Zrobione” idzie
     do kierownika ze spóźnieniem (hub przyjmuje zlecenie.wykonane z „przepadlo”). Potem znika jak dotąd (D35). */
  const DOBA_MS = 86400000;
  function poCzasieDoZrobienia(z, teraz) {
    if (!przepadlo(z, teraz)) return false;
    const d = z.dane || {};
    const od = Date.parse(d.wazne_do || d.czas_przepadniecia);
    return !isNaN(od) && typeof teraz === 'number' && teraz - od < DOBA_MS;
  }

  /* D55: zlecenie dla konkretnej osoby widzi ona i kierownicy (widziWszystkie); reszta działu — tylko gdy ta osoba
     ma dziś urlop (jej zadania przechodzą wtedy na cały dział). Bez `ja` (testy, Panel) — widać wszystko. */
  function widoczneDla(d, o) {
    if (!d.wykonawca || !o.ja || d.wykonawca === o.ja || o.widziWszystkie) return true;
    return !!(o.dzien && o.H && o.H.naUrlopie && o.H.naUrlopie(o.slowniki, d.wykonawca, o.dzien));
  }

  /* Zlecenie bez linii widzą wszyscy w dziale; z linią — gdy pasuje do `linia` (lider) i do listy `linie` (mistrz). */
  const naLinii = (d, o) => !d.linia || ((!o.linia || d.linia === o.linia) && (!o.linie || !o.linie.length || o.linie.includes(d.linia)));

  /* Czysta funkcja (testy: wspolne/testy/reduktor-testy.js): zlecenia działu, dla produkcji tylko tej linii
     (albo bez linii); moje = id osoby → tylko przypisane jej albo przez nią przyjęte. Najpierw ZALEGŁE (od
     najstarszego terminu — jak „Zaległe dostawy” w GK Trasy: to, co miało być zrobione, idzie przed nowym),
     potem reszta do zrobienia (pilne, najbliższy termin, najstarsze), na końcu wysłane do kierownika.
     Zaległe = do zrobienia i po terminie; bez terminu — zlecone przed początkiem bieżącej zmiany (poczatekZmiany,
     ms), czyli przeszło z poprzedniej zmiany albo dnia i nikt go nie zamknął.
     D35: zadanie zmianowe (`wazne_do` = koniec jego zmiany) PRZEPADA z końcem zmiany — dział go już nie widzi, nawet
     zanim hub (automat co minutę) wyśle „zlecenie.przepadlo”, i nie dostaje go jako zaległe na następnej zmianie.
     zostaw = id zlecenia z otwartym formularzem „Zrobione”: zostaje do wysłania (zrobione przed końcem zmiany).
     linie = lista linii (mistrz z liniami zaznaczonymi w Panelu, D34 2026-10-07): zlecenia bez linii albo z jedną z nich.
     D47: zlecenie ZAPLANOWANE przez kierownika zakładu na później (status „zaplanowane”) dział widzi dopiero, gdy hub je
     zleci (zlecenie.aktywowane → „nowe”) — wcześniej nie ma go ani na liście, ani na plakietce, ani w zaległych. */
  function wiersze(lista, { dzial, linia, linie, moje, pracownicy, teraz, H, poczatekZmiany, zostaw, ja, widziWszystkie, slowniki, dzien }) {
    const nazwa = id => { if (!id) return null; const p = (pracownicy || []).find(x => x.id === id); return p ? p.nazwa : id; };
    const godz = t => { const ms = Date.parse(t); if (isNaN(ms)) return null; const l = H.lokalny(ms);
      return `${String(l.dzien).padStart(2, '0')}.${String(l.miesiac).padStart(2, '0')} ${String(l.godz).padStart(2, '0')}:${String(l.min).padStart(2, '0')}`; };
    return (lista || [])
      .filter(z => z && z.status !== 'zaplanowane' && (z.aktywny || z.status === 'przepadlo')
        && (!przepadlo(z, teraz) || z.id === zostaw || poCzasieDoZrobienia(z, teraz)))
      .filter(z => (z.dane || {}).dzial === dzial && naLinii(z.dane || {}, { linia, linie })
        && widoczneDla(z.dane || {}, { ja, widziWszystkie, slowniki, dzien, H }))
      .filter(z => !moje || (z.dane || {}).wykonawca === moje || (z.dane || {}).przyjal === moje)
      .map(z => {
        const d = z.dane || {};
        const termin = Date.parse(d.termin);
        const doZrobienia = DO_ZROBIENIA.has(z.status) || z.status === 'przepadlo';   // przepadłe tylko z otwartym formularzem
        const opis = doZrobienia && H.opisTerminu ? H.opisTerminu(d.termin, teraz) : null;
        const czasMs = Date.parse(d.czas_zlecenia);
        const poTerminie = !isNaN(termin) && doZrobienia && termin < teraz;
        const zPoprzedniejZmiany = doZrobienia && isNaN(termin) && typeof poczatekZmiany === 'number' && !isNaN(poczatekZmiany)
          && !isNaN(czasMs) && czasMs < poczatekZmiany;
        const poCzasie = doZrobienia && przepadlo(z, teraz);           // D55: po końcu zmiany — jeszcze można zrobić
        return {
          id: z.id, numer: z.numer || '—', status: z.status, etykieta: z.etykieta || z.status,
          tytul: d.tytul || '', opis: d.opis || '', pilne: d.priorytet === 'pilne', maszyna: d.maszyna || null, linia: d.linia || null,
          dlaKogo: nazwa(d.wykonawca), zlecil: nazwa(d.zlecil), kiedy: godz(d.czas_zlecenia), termin: godz(d.termin),
          terminMs: isNaN(termin) ? null : termin, terminOpis: opis ? opis.tekst : null,
          poTerminie, zalegle: poTerminie || zPoprzedniejZmiany || poCzasie, poCzasie,
          // Klucz kolejki zaległych: termin, a bez terminu chwila zlecenia (najdłużej czeka = pierwsze).
          zalegleOd: poTerminie ? termin : zPoprzedniejZmiany ? czasMs : poCzasie ? (Date.parse(d.wazne_do) || czasMs) : null,
          zalegleOpis: poCzasie ? 'zmiana się skończyła — zrób i tak, kierownik zobaczy spóźnienie'
            : poTerminie ? (opis ? opis.tekst : 'po terminie') : zPoprzedniejZmiany ? `z poprzedniej zmiany (zlecone ${godz(d.czas_zlecenia)})` : null,
          doZrobienia, wyslane: WYSLANE.has(z.status),
          wymagajZdjecia: d.wymagaj_zdjecia === true, wymagajNotatki: d.wymagaj_notatki === true, stale: !!d.stale,
          // D56: kilka maszyn jednego zlecenia, postęp krok po kroku (zlecenie.postep) i czynność, która zalicza sama.
          maszyny: maszynyZlecenia(d), wymagajSkanu: d.wymagaj_skanu === true && maszynyZlecenia(d).length > 0,
          postep: [].concat(d.postep || []), juz: juzZrobione(d), czynnosc: d.czynnosc || null,
          uwagiZwrotu: d.uwagi_zwrotu || null, czas: d.czas_zlecenia || '',
          zdjecia: [].concat(d.zdjecia || []), zdjeciaWykonania: [].concat(d.zdjecia_wykonania || []),
        };
      })
      .sort((a, b) => (b.doZrobienia - a.doZrobienia) || (b.zalegle - a.zalegle)
        || (a.zalegle && b.zalegle ? a.zalegleOd - b.zalegleOd : 0) || (b.pilne - a.pilne)
        || ((a.terminMs === null) - (b.terminMs === null)) || ((a.terminMs || 0) - (b.terminMs || 0))
        || String(a.czas).localeCompare(String(b.czas)));
  }

  /* D56: maszyny zlecenia — lista `maszyny` (kilka maszyn), inaczej jedna `maszyna`. */
  const maszynyZlecenia = d => (Array.isArray(d && d.maszyny) && d.maszyny.length ? d.maszyny.map(String) : (d && d.maszyna ? [String(d.maszyna)] : []));
  /* Co już zrobione krok po kroku (lista `postep` obiektu): zdjęcia, notatka, zeskanowane maszyny. */
  function juzZrobione(d) {
    const p = [].concat((d && d.postep) || []).filter(e => e && typeof e === 'object');
    return { zdjecia: p.reduce((n, e) => n + [].concat(e.zdjecia || []).length, 0),
             notatka: p.some(e => String(e.uwagi || '').trim()), skany: [...new Set(p.map(e => e.skan).filter(Boolean).map(String))] };
  }

  /* Czego brakuje, żeby wysłać formularz (czysta funkcja, testy w reduktor-testy.js). rodzaj 'wykonane':
     zdjęcie, notatka i skan QR maszyny tylko, gdy kierownik ich wymaga — D56: zaliczone też wcześniejszym postępem
     (wymagania.juz) i dla każdej maszyny zlecenia (wymagania.maszyny); 'odrzucone': powód zawsze — kierownik musi
     wiedzieć, co dalej. */
  function brakuje(wymagania, f) {
    const w = wymagania || {}, tekst = String((f && f.tekst) || '').trim(), pliki = (f && f.pliki) || [];
    if (f && f.rodzaj === 'odrzucone') return tekst ? [] : ['powodu'];
    const juz = w.juz || {};
    const lista = [];
    if (w.wymagajZdjecia && !pliki.length && !(juz.zdjecia > 0)) lista.push('zdjęcia');
    if (w.wymagajNotatki && !tekst && !juz.notatka) lista.push('notatki');
    if (w.wymagajSkanu) {
      const potrzebne = w.maszyny && w.maszyny.length ? w.maszyny : (w.maszyna ? [w.maszyna] : []);
      const mam = new Set([].concat(juz.skany || [], (f && f.skany) || [], f && f.skan ? [f.skan] : []));
      if (potrzebne.length ? potrzebne.some(m => !mam.has(m)) : !mam.size) lista.push('skanu QR maszyny');
    }
    return lista;
  }
  const tekstBraku = lista => (lista.length
    ? `Brakuje: ${lista.length > 1 ? `${lista.slice(0, -1).join(', ')} i ${lista[lista.length - 1]}` : lista[0]}` : '');

  /* Tekst ze skanera → kod maszyny albo powód odmowy (czysta funkcja). Naklejka HALA:M:<kod>, zastany kod z pola
     'qr' maszyny (Hala.odczytajKod) albo kod wpisany ręcznie z naklejki („wt-01”, Hala.kodZeSkanu); inna maszyna,
     stanowisko czy identyfikator — odmowa z nazwą tego, co zeskanowano. */
  function skanMaszyny(tekst, maszyna, slowniki, odczytaj) {
    const H = global.Hala;
    const k = odczytaj(H && H.kodZeSkanu ? H.kodZeSkanu(tekst, slowniki) : tekst, slowniki);
    const nazwa = kod => ((((slowniki || {}).maszyny || {})[kod] || {}).nazwa || kod);
    const lista = [].concat(maszyna || []).map(String);              // D56: jedna maszyna albo kilka
    const ktore = lista.map(nazwa).join(', ');
    if (k.rodzaj === 'maszyny' && lista.includes(k.kod)) return { kod: k.kod };
    if (k.rodzaj === 'maszyny') return { blad: `To kod innej maszyny (${nazwa(k.kod)}). Zeskanuj naklejkę na: ${ktore}.` };
    return { blad: `To nie jest kod maszyny. Zeskanuj naklejkę QR albo wpisz kod z naklejki: ${ktore}.` };
  }

  /* D56: krok wykonania od razu (zdjęcie, notatka, skan) — bez „Zrobione”; kierownik widzi postęp na żywo. */
  const dopiszPostep = (hala, id, dane) => hala.zapisz('zlecenie.postep', id, dane);

  /* Początek bieżącej zmiany (ms); między zmianami — początek doby zakładu, żeby zlecenie z wczoraj bez terminu
     też było zaległe. */
  function poczatekZmiany(hala, H) {
    const z = hala.zmianaTeraz && hala.zmianaTeraz();
    const od = z ? Date.parse(z.od) : NaN;
    if (!isNaN(od)) return od;
    if (!H || !H.lokalny || !H.zLokalnego) return null;
    const l = H.lokalny(hala.teraz());
    return H.zLokalnego(l.rok, l.miesiac, l.dzien, 0, 0);
  }

  // D55: kierownicy widzą zlecenia osobiste całego działu (np. kierownik UR — zadania swoich mechaników).
  const ROLE_WIDZA_WSZYSTKO = ['kierownik', 'kierownik_ur', 'kierownik_kj', 'admin'];
  function dzisiaj(H, teraz) {
    if (!H || !H.lokalny) return null;
    const l = H.lokalny(teraz), d = n => String(n).padStart(2, '0');
    return `${l.rok}-${d(l.miesiac)}-${d(l.dzien)}`;
  }
  const kontekst = (hala, opcje) => Object.assign({ H: global.Hala, teraz: hala.teraz(), pracownicy: hala.pracownicy,
                                                    poczatekZmiany: poczatekZmiany(hala, global.Hala),
                                                    ja: hala.pracownik && hala.pracownik.id, slowniki: hala.slowniki,
                                                    dzien: dzisiaj(global.Hala, hala.teraz()),
                                                    widziWszystkie: ((hala.pracownik && hala.pracownik.role) || []).some(r => ROLE_WIDZA_WSZYSTKO.includes(r)) }, opcje);

  /* Wiersze ekranu dla aplikacji (menu po skanie QR maszyny — HalaDzialania.menuMaszyny). */
  const wierszeDla = (hala, opcje) => wiersze(hala.obiekty('zlecenie'), kontekst(hala, Object.assign({}, opcje, { moje: null })));

  function doZrobienia(hala, opcje) {
    return wiersze(hala.obiekty('zlecenie'), kontekst(hala, opcje)).filter(w => w.doZrobienia).length;
  }

  /* Zaległe zlecenia działu (te same filtry co ekran Zleceń: dział, linia lidera), od najstarszego terminu.
     Niezależne od „Moje”: zaległe zlecenie działu jest sprawą każdego w dziale, dopóki ktoś go nie zrobi. */
  function zalegle(hala, opcje) {
    return wiersze(hala.obiekty('zlecenie'), kontekst(hala, Object.assign({}, opcje, { moje: null }))).filter(w => w.zalegle);
  }

  /* Czerwona karta na górze ekranu głównego aplikacji (Lider → Zmiana, UR → Awarie, KJ → Plan): №1 zaległych
     i „+N więcej”; dotknięcie → ekran Zleceń (otworz). Bez zaległych element jest pusty i ukryty — ekran
     wygląda jak wcześniej. Aplikacja wstawia pusty <div> na początek swojego ekranu i woła to po każdym rysowaniu. */
  function rysujZalegle(el, hala, opcje, otworz) {
    if (!el) return 0;
    const lista = zalegle(hala, opcje);
    el.hidden = !lista.length;
    if (!lista.length) { el.innerHTML = ''; return 0; }
    const z = lista[0];
    el.innerHTML = `<button type="button" class="hala-zalegle" aria-label="Zaległe zlecenia: ${lista.length}. Otwórz zlecenia">
      <span class="hala-zalegle-naglowek">⚠ ${lista.length > 1 ? 'Zaległe zlecenia' : 'Zaległe zlecenie'} — zrób najpierw</span>
      <span class="hala-zalegle-pozycja"><span class="hala-zlecenie-nr" aria-hidden="true">1</span><b>${esc(z.tytul)}</b></span>
      <span class="hala-zalegle-opis">${esc(z.zalegleOpis)}${z.wymagajZdjecia ? ' · 📷' : ''}${z.wymagajNotatki ? ' · 📝' : ''}${z.wymagajSkanu ? ' · QR' : ''}</span>
      ${lista.length > 1 ? `<span class="hala-zalegle-wiecej">+${lista.length - 1} więcej ›</span>` : '<span class="hala-zalegle-wiecej">Otwórz ›</span>'}
    </button>`;
    el.firstElementChild.onclick = () => { if (otworz) otworz(z); };
    return lista.length;
  }

  // Stan ekranu na element: filtr „Moje”, otwarty formularz (id, rodzaj, tekst, zdjęcia, wymagania), osoba i OSTATNIE
  // opcje rysowania. Słuchacze kliknięć wiszą na elemencie od pierwszego rysowania — opcje biorą stąd, a nie z chwili
  // podłączenia: lider zmienia linię, a na wspólnym tablecie po liderze loguje się mistrz (inny dział) — ze starymi
  // opcjami „Zrobione” zamykało formularz od razu i przerysowywało listę poprzedniej linii albo działu.
  const stany = new WeakMap();
  const stan = el => { if (!stany.has(el)) stany.set(el, { moje: false, formularz: null, opcje: null, ja: undefined, info: null, notatka: null }); return stany.get(el); };

  /* Zdarzenie z treści TEGO ekranu zleceń. UR i KJ rysują wszystkie ekrany w jednym elemencie (#ekran), więc nasi
     słuchacze zostają na nim także pod Awariami czy Przeglądami — tam chip „Moje” (data-filtr) przestawiał filtr zleceń
     i na chwilę rysował listę zleceń w miejscu awarii. */
  const zNaszejTresci = (ev, el) => {
    const k = ev.target && ev.target.closest ? ev.target.closest('.hala-zlecenia') : null;
    return !!k && (!el.contains || el.contains(k));
  };

  /* D55: „Zaznacz wyraźniej statusy wykonywania zadań” — pasek kroków Zlecone → Przyjęte → Zrobione → Odebrane
     (odebrane = kierownik przyjął wykonanie). „Nie mogę” i „po czasie” na czerwono. */
  const KROKI = ['Zlecone', 'Przyjęte', 'Zrobione', 'Odebrane'];
  function krokiStatusu(status) {
    const nr = { nowe: 0, przepadlo: 0, przyjete: 1, wykonane: 2, odrzucone: 2, zamkniete: 3 }[status];
    if (nr === undefined) return '';
    return `<ol class="hala-kroki" aria-label="Postęp zlecenia">${KROKI.map((n, i) => {
      const odmowa = i === 2 && status === 'odrzucone';
      return `<li class="${i < nr ? 'zrobiony' : i === nr ? 'teraz' : ''}${odmowa || (i === 0 && status === 'przepadlo') ? ' odmowa' : ''}">${odmowa ? 'Nie mogę' : n}</li>`;
    }).join('')}</ol>`;
  }
  const KLASA_STATUSU = { nowe: 'info', przyjete: 'uwaga', wykonane: 'ok', odrzucone: 'alarm', przepadlo: 'alarm', zamkniete: 'ok' };

  const miniatury = ids => ids.map(id => `<img class="hala-zlecenie-foto" data-plik="${esc(id)}" alt="Zdjęcie" loading="lazy">`).join('');

  function zwolnij(f) {
    for (const p of (f && f.pliki) || []) { try { URL.revokeObjectURL(p.url); } catch (e) { /* stara przeglądarka */ } }
  }

  function formularz(f) {
    const zrobione = f.rodzaj === 'wykonane';
    const brak = brakuje(f.wymagania, f);
    const pole = (wymagane, nazwa) => `${nazwa} <span class="slaby">(${wymagane ? 'wymagane' : 'można pominąć'})</span>`;
    const w = f.wymagania, juz = w.juz || {};
    const zeskanowane = new Set([].concat(juz.skany || [], f.skany || []));
    const doSkanu = (w.maszyny || []).filter(m => !zeskanowane.has(m));
    return `<div class="hala-zlecenie-formularz">
      ${zrobione && w.wymagajSkanu ? `<div class="hala-zlecenie-pole"><span class="hala-zlecenie-etykieta">${pole(!!doSkanu.length, 'Skan QR maszyny')}</span>
        <p class="hala-zlecenie-skan">${(w.maszyny || []).map(m => `<span class="hala-krok-wymogu ${zeskanowane.has(m) ? 'ok' : ''}">${zeskanowane.has(m) ? '✓' : '○'} ${esc((w.nazwy || {})[m] || m)}</span>`).join(' ')}</p>
        ${doSkanu.length ? `<button type="button" class="hala-zlecenie-zdjecie brak" data-akcja="skanuj">▣ Zeskanuj QR: ${esc(doSkanu.map(m => (w.nazwy || {})[m] || m).join(', '))}</button>` : ''}</div>` : ''}
      ${zrobione ? `<div class="hala-zlecenie-pole"><span class="hala-zlecenie-etykieta">${pole(w.wymagajZdjecia && !juz.zdjecia, 'Zdjęcie')}${juz.zdjecia ? ` <span class="slaby">— już ${juz.zdjecia} w postępie</span>` : ''}</span>
        <div class="hala-zlecenie-miniatury">${f.pliki.map((p, i) => `<span class="hala-zlecenie-miniatura"><img src="${esc(p.url)}" alt="Zdjęcie ${i + 1}">
            <button type="button" data-akcja="usun-zdjecie" data-nr="${i}" aria-label="Usuń zdjęcie ${i + 1}">✕</button></span>`).join('')}
          ${f.pliki.length < MAKS_ZDJEC ? `<label class="hala-zlecenie-zdjecie ${w.wymagajZdjecia && !f.pliki.length && !juz.zdjecia ? 'brak' : ''}">📷 ${f.pliki.length ? 'Jeszcze jedno' : 'Zrób zdjęcie'}
            <input type="file" accept="image/*" capture="environment" multiple data-zdjecie hidden></label>` : ''}</div></div>` : ''}
      <label class="hala-zlecenie-pole"><span class="hala-zlecenie-etykieta">${zrobione ? pole(w.wymagajNotatki && !juz.notatka, 'Notatka') : 'Dlaczego nie da się tego zrobić?'}</span>
        <textarea data-pole rows="3" maxlength="2000" placeholder="${zrobione ? 'Co zrobione, co zauważone' : 'Kierownik to zobaczy'}">${esc(f.tekst)}</textarea></label>
      <p class="hala-zlecenie-brakuje" data-brakuje ${brak.length ? '' : 'hidden'}>${esc(tekstBraku(brak))}</p>
      <p class="hala-zlecenie-blad" ${f.blad ? '' : 'hidden'}>${esc(f.blad || '')}</p>
      <div class="hala-zlecenie-akcje">
        <button type="button" data-akcja="anuluj-formularz">Anuluj</button>
        <button type="button" class="${zrobione ? 'zielony' : 'czerwony'}" data-akcja="wyslij" ${brak.length || f.wysyla ? 'disabled' : ''}>${zrobione ? 'Wyślij: zrobione' : 'Wyślij: nie mogę'}</button>
      </div></div>`;
  }

  /* Po wpisaniu znaku tylko przycisk i napis „Brakuje” — pełne przerysowanie zabrałoby kursor i klawiaturę. */
  function odswiezBlokade(el, f) {
    const brak = brakuje(f.wymagania, f);
    const b = el.querySelector('.hala-zlecenie-formularz [data-akcja="wyslij"]');
    const p = el.querySelector('.hala-zlecenie-formularz [data-brakuje]');
    if (b) b.disabled = !!brak.length || !!f.wysyla;
    if (p) { p.textContent = tekstBraku(brak); p.hidden = !brak.length; }
  }

  function rysuj(el, hala, opcje) {
    const s = stan(el);
    s.opcje = opcje;
    const ja = hala.pracownik && hala.pracownik.id;
    // Inna osoba na tym samym urządzeniu: nie dostaje cudzego filtra „Moje” ani cudzego otwartego formularza.
    if (s.ja !== ja) { zwolnij(s.formularz); s.formularz = null; s.moje = false; s.ja = ja; }
    const lista = wiersze(hala.obiekty('zlecenie'), kontekst(hala, Object.assign({}, opcje, { moje: s.moje ? ja : null,
                                                                                    zostaw: s.formularz ? s.formularz.id : null })));
    // Formularz do zlecenia, które zniknęło (np. kierownik je anulował) — zamykamy.
    if (s.formularz && !lista.some(z => z.id === s.formularz.id && z.doZrobienia)) { zwolnij(s.formularz); s.formularz = null; }
    const maszyny = (hala.slowniki && hala.slowniki.maszyny) || {};
    const wiersz = (z, nr) => `
      <article class="hala-zlecenie status-${esc(z.status)} ${z.pilne ? 'pilne' : ''} ${z.poTerminie ? 'po-terminie' : ''} ${z.zalegle ? 'zalegle' : ''} ${z.wyslane ? 'wyslane' : ''}" data-id="${esc(z.id)}">
        <div class="hala-zlecenie-gora">${nr ? `<span class="hala-zlecenie-nr" aria-label="Kolejność ${nr}">${nr}</span>` : ''}<button type="button" class="hala-zlecenie-tytul" data-akcja="historia" title="Historia: kto, kiedy, notatki i zdjęcia">${esc(z.tytul)}</button><span class="slaby">${z.stale ? '🔁 ' : ''}${esc(z.numer)}</span></div>
        ${krokiStatusu(z.status)}
        <div class="hala-zlecenie-szczegoly">
          <span class="znacznik ${KLASA_STATUSU[z.status] || 'uwaga'}">${esc(z.poCzasie ? 'Po czasie' : z.etykieta)}</span>
          ${z.pilne ? '<span class="znacznik alarm">Pilne</span>' : ''}
          ${/* D56: wymagania (📷 📝 ▣) stoją niżej jako lista odhaczana na żywo — bez drugiego rzędu znaczków. */ ''}
          ${z.maszyny.length && !(z.doZrobienia && z.wymagajSkanu) ? `<span>${z.maszyny.map(m => `${esc((maszyny[m] || {}).nazwa || m)} (${esc(m)})`).join(', ')}</span>` : ''}
          ${z.dlaKogo ? `<span>dla: ${esc(z.dlaKogo)}</span>` : ''}
        </div>
        ${z.opis ? `<p class="hala-zlecenie-opis">${esc(z.opis)}</p>` : ''}
        ${z.zdjecia.length ? `<div class="hala-zlecenie-zdjecia">${miniatury(z.zdjecia)}</div>` : ''}
        ${z.uwagiZwrotu && z.doZrobienia ? `<p class="hala-zlecenie-zwrot">Kierownik: ${esc(z.uwagiZwrotu)}</p>` : ''}
        ${z.doZrobienia ? wymogiNaZywo(z, maszyny, s) : ''}
        ${z.terminOpis || z.zalegle ? `<div class="hala-zlecenie-termin ${z.zalegle ? 'po-terminie-tekst' : ''}">⏰ ${esc(z.terminOpis || z.zalegleOpis)}</div>` : ''}
        <div class="hala-zlecenie-kiedy slaby">${esc(z.zlecil || 'Kierownik')} · ${esc(z.kiedy || '—')}${z.termin && !z.doZrobienia ? ` · termin ${esc(z.termin)}` : ''}</div>
        ${z.doZrobienia ? (s.formularz && s.formularz.id === z.id ? formularz(s.formularz) : `<div class="hala-zlecenie-postep-akcje">
          ${global.HalaSkaner && z.maszyny.length ? `<button type="button" data-akcja="postep-skan">▣ Skanuj${z.maszyny.length > 1 ? ' maszyny' : ' maszynę'}</button>` : ''}
          <label class="hala-przycisk-pliku">📷 Dodaj zdjęcie<input type="file" accept="image/*" capture="environment" multiple data-postep-zdjecie hidden></label>
          <button type="button" data-akcja="postep-notatka">📝 Notatka</button>
        </div>
        ${s.notatka && s.notatka.id === z.id ? `<div class="hala-zlecenie-formularz">
          <label class="hala-zlecenie-pole"><span class="hala-zlecenie-etykieta">Notatka do postępu (kierownik zobaczy od razu)</span>
            <textarea data-postep-pole rows="2" maxlength="2000" placeholder="Co już zrobione">${esc(s.notatka.tekst)}</textarea></label>
          <div class="hala-zlecenie-akcje"><button type="button" data-akcja="postep-notatka-anuluj">Anuluj</button>
            <button type="button" class="glowny" data-akcja="postep-notatka-zapisz">Zapisz notatkę</button></div></div>` : ''}
        <div class="hala-zlecenie-akcje">
          ${/* UI etap 4: wyróżniony jest NASTĘPNY krok — przy nowym zleceniu „Biorę”, potem „Zrobione”. */
            z.status === 'nowe' && !z.poCzasie ? '<button type="button" class="glowny" data-akcja="przyjmij">Biorę</button>' : ''}
          <button type="button" ${z.status === 'nowe' && !z.poCzasie ? '' : 'class="zielony" '}data-akcja="wykonane">Zrobione</button>
          <button type="button" data-akcja="nie-moge">Nie mogę</button>
        </div>`) : `${z.zdjeciaWykonania.length ? `<div class="hala-zlecenie-zdjecia">${miniatury(z.zdjeciaWykonania)}</div>` : ''}<div class="hala-zlecenie-kiedy slaby">Wysłane do kierownika</div>`}
      </article>`;
    // Zaległe osobno i z numerami 1, 2, 3… — kolejność roboty, a nie tylko kolor (jak „Zaległe dostawy” w GK Trasy).
    const zal = lista.filter(z => z.zalegle), doZ = lista.filter(z => z.doZrobienia && !z.zalegle), wys = lista.filter(z => z.wyslane);
    const pusto = s.moje ? 'Nie masz przypisanych zleceń' : 'Nie ma zleceń do zrobienia';
    // Kursor w polu tekstowym — przerysowanie nie może go zabrać (tekst i tak jest w stanie).
    const wPolu = document.activeElement && el.contains(document.activeElement) && document.activeElement.matches('[data-pole], [data-postep-pole]');
    const poleZFocusem = wPolu ? (document.activeElement.matches('[data-pole]') ? '[data-pole]' : '[data-postep-pole]') : null;
    const role = (hala.pracownik && hala.pracownik.role) || [];
    const DZ = global.HalaDzialania;
    // D55: skan QR maszyny (menu: wykonaj zadanie / zgłoś awarię / nieprawidłowość), zgłoszenie do kierownika, narzędzia (mistrz).
    const narzedziaGory = DZ && !opcje.bezDzialan ? `<div class="hala-zlecenia-dzialania">
        <button type="button" data-gora="zglos">📝 Zgłoś nieprawidłowość</button>
        ${role.includes('mistrz') ? '<button type="button" data-gora="narzedzia">🧰 Odłóż narzędzia</button>' : ''}
      </div>${s.info ? `<p class="hala-zlecenia-info" role="status">${esc(s.info)}</p>` : ''}` : '';
    const moje = mojeZgloszenia(hala, ja, opcje.opcjeZgloszen);
    el.innerHTML = `<div class="hala-zlecenia">
      ${narzedziaGory}
      <div class="hala-zlecenia-naglowek"><h2>${esc(opcje.naglowek || 'Zlecenia od kierownika')}</h2>
        <div class="hala-zlecenia-filtr" role="group" aria-label="Które zlecenia">
          <button type="button" data-filtr="wszystkie" aria-pressed="${!s.moje}">Wszystkie</button>
          <button type="button" data-filtr="moje" aria-pressed="${s.moje}">Moje</button></div></div>
      ${zal.length ? `<h3 class="hala-zlecenia-zalegle">Zaległe — zrób najpierw <span class="hala-zlecenia-ile">${zal.length}</span></h3>
        ${zal.map((z, i) => wiersz(z, i + 1)).join('')}${doZ.length ? '<h3>Pozostałe do zrobienia</h3>' : ''}` : ''}
      ${doZ.map(z => wiersz(z)).join('') || (zal.length ? '' : `<p class="hala-zlecenia-pusto">${pusto}</p>`)}
      ${wys.length ? `<h3>Czeka na kierownika</h3>${wys.map(z => wiersz(z)).join('')}` : ''}
      ${moje.length ? `<h3>Moje zgłoszenia i narzędzia</h3>${moje.map(g => `<div class="hala-zgloszenie ${esc(g.klasa)}" data-typ="${esc(g.typ)}" data-id="${esc(g.id)}">
          <button type="button" class="hala-zlecenie-tytul" data-historia>${esc(g.tytul)}</button>
          <span class="znacznik ${esc(g.klasa)}">${esc(g.status)}</span>${g.odpowiedz ? `<p class="hala-zlecenie-opis">${esc(g.odpowiedz)}</p>` : ''}</div>`).join('')}` : ''}
    </div>`;
    for (const img of el.querySelectorAll('img[data-plik]')) hala.adresPliku(img.dataset.plik).then(u => { img.src = u; }).catch(() => {});
    if (wPolu) { const p = el.querySelector(poleZFocusem); if (p) { p.focus(); p.setSelectionRange(p.value.length, p.value.length); } }
    if (!el.dataset.halaZlecenia) {
      el.dataset.halaZlecenia = '1';
      el.addEventListener('click', ev => { if (zNaszejTresci(ev, el)) akcja(ev, el, hala, stan(el).opcje); });
      el.addEventListener('input', ev => {
        if (zNaszejTresci(ev, el) && ev.target.matches('[data-pole]') && s.formularz) { s.formularz.tekst = ev.target.value; odswiezBlokade(el, s.formularz); }
        if (zNaszejTresci(ev, el) && ev.target.matches('[data-postep-pole]') && s.notatka) s.notatka.tekst = ev.target.value;
      });
      el.addEventListener('change', async ev => {
        if (zNaszejTresci(ev, el) && ev.target.matches('[data-postep-zdjecie]')) {
          // D56: zdjęcie krokiem postępu — od razu do kierownika, bez „Zrobione”.
          const art = ev.target.closest('[data-id]');
          const pliki = Array.from(ev.target.files || []).slice(0, MAKS_ZDJEC);
          ev.target.value = '';
          if (!art || !pliki.length) return;
          const st = stan(el), o = st.opcje || {};
          try {
            const ids = [];
            for (const p of pliki) ids.push(await hala.dodajPlik(p));
            await dopiszPostep(hala, art.dataset.id, { zdjecia: ids });
            st.info = `Dodano ${ids.length === 1 ? 'zdjęcie' : `${ids.length} zdjęcia`} — kierownik już je widzi`;
          } catch (e) { st.info = (e && e.message) || 'Nie udało się dodać zdjęcia.'; }
          rysuj(el, hala, o);
          return;
        }
        if (!zNaszejTresci(ev, el) || !ev.target.matches('[data-zdjecie]') || !s.formularz) return;
        // Podgląd z pliku w pamięci przeglądarki — do kolejki (hala.dodajPlik) trafia dopiero przy „Wyślij”.
        for (const plik of Array.from(ev.target.files || []).slice(0, MAKS_ZDJEC - s.formularz.pliki.length))
          s.formularz.pliki.push({ plik, url: URL.createObjectURL(plik) });
        s.formularz.blad = null;
        rysuj(el, hala, stan(el).opcje);
      });
    }
  }

  async function akcja(ev, el, hala, opcje) {
    const s = stan(el);
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.filtr) { s.moje = b.dataset.filtr === 'moje'; return rysuj(el, hala, s.opcje || opcje); }
    const DZ = global.HalaDzialania;
    const o = s.opcje || opcje;
    const info = t => { s.info = t; rysuj(el, hala, o); if (o.komunikat) o.komunikat(t); };
    if (b.dataset.gora && DZ) {
      if (b.dataset.gora === 'zglos') DZ.zglos(hala, { gotowe: info });
      if (b.dataset.gora === 'narzedzia') DZ.odlozNarzedzia(hala, { gotowe: info });
      if (b.dataset.gora === 'skanuj') {
        DZ.skanujMaszyne(hala, { zlecenia: () => o, gotowe: info, komunikat: info, awaria: o.zglosAwarie,
                                 wykonaj: (zid, maszyna) => zaliczSkan(hala, zid, maszyna).then(t => info(t)) });
      }
      return;
    }
    if (b.dataset && 'historia' in b.dataset && DZ) {
      const g = b.closest('[data-typ]');
      return DZ.historia(hala, g.dataset.typ, g.dataset.id);
    }
    const art = b.closest('[data-id]');
    if (!art || !b.dataset.akcja) return;
    const id = art.dataset.id;
    try {
      if (b.dataset.akcja === 'historia' && DZ) return DZ.historia(hala, 'zlecenie', id);
      if (b.dataset.akcja === 'przyjmij') await hala.zapisz('zlecenie.przyjete', id, {});
      if (b.dataset.akcja === 'wykonane') {
        // D56: wszystko już zrobione krok po kroku — „Zrobione” wysyła od razu, bez formularza robionego „na raz”.
        const z = wiersze([hala.obiekt('zlecenie', id)].filter(Boolean), kontekst(hala, Object.assign({}, o, { moje: null, zostaw: id })))[0];
        if (z && (z.wymagajZdjecia || z.wymagajNotatki || z.wymagajSkanu) && !brakuje(wymaganiaZ(z, hala), { rodzaj: 'wykonane' }).length) {
          await hala.zapisz('zlecenie.wykonane', id, {});
          s.info = 'Wysłane do kierownika — wymagania były już spełnione';
          return rysuj(el, hala, o);
        }
      }
      if (b.dataset.akcja === 'wykonane' || b.dataset.akcja === 'nie-moge') {
        return otworzFormularz(el, hala, o, id, b.dataset.akcja === 'wykonane' ? 'wykonane' : 'odrzucone', null);
      }
      if (b.dataset.akcja === 'postep-notatka') { s.notatka = { id, tekst: '' }; rysuj(el, hala, o); const p = el.querySelector('[data-postep-pole]'); if (p) p.focus(); return; }
      if (b.dataset.akcja === 'postep-notatka-anuluj') { s.notatka = null; return rysuj(el, hala, o); }
      if (b.dataset.akcja === 'postep-notatka-zapisz' && s.notatka) {
        const t = s.notatka.tekst.trim();
        if (!t) { s.info = 'Napisz notatkę albo dotknij „Anuluj”.'; return rysuj(el, hala, o); }
        await dopiszPostep(hala, id, { uwagi: t });
        s.notatka = null; s.info = 'Notatka zapisana — kierownik już ją widzi';
        return rysuj(el, hala, o);
      }
      if (b.dataset.akcja === 'postep-skan') {
        const z = wiersze([hala.obiekt('zlecenie', id)].filter(Boolean), kontekst(hala, Object.assign({}, o, { moje: null, zostaw: id })))[0] || {};
        if (!global.HalaSkaner || !global.Hala) { s.info = 'Brak skanera. Odśwież aplikację.'; return rysuj(el, hala, o); }
        const nazwy = (z.maszyny || []).map(m => ((((hala.slowniki || {}).maszyny || {})[m] || {}).nazwa || m));
        const tekst = await global.HalaSkaner.skanuj({ tytul: `Zeskanuj QR: ${nazwy.join(', ')}`, podpowiedz: 'Naklejka z kodem na maszynie' });
        if (tekst === null || tekst === undefined) return;
        const w = skanMaszyny(tekst, z.maszyny, hala.slowniki, global.Hala.odczytajKod);
        if (w.kod) await dopiszPostep(hala, id, { skan: w.kod });
        s.info = w.kod ? `Zeskanowano ${((((hala.slowniki || {}).maszyny || {})[w.kod] || {}).nazwa || w.kod)} — zapisane w zleceniu` : w.blad;
        return rysuj(el, hala, o);
      }
      if (b.dataset.akcja === 'skanuj' && s.formularz) {
        const f = s.formularz;
        if (!global.HalaSkaner || !global.Hala) { f.blad = 'Brak skanera. Odśwież aplikację.'; return rysuj(el, hala, s.opcje || opcje); }
        const tekst = await global.HalaSkaner.skanuj({ tytul: `Zeskanuj QR maszyny: ${f.wymagania.maszynaNazwa || ''}`,
                                                       podpowiedz: 'Naklejka z kodem na maszynie' });
        if (s.formularz !== f || tekst === null || tekst === undefined) return;     // anulowano albo formularz już zamknięty
        const w = skanMaszyny(tekst, f.wymagania.maszyny && f.wymagania.maszyny.length ? f.wymagania.maszyny : f.wymagania.maszyna,
                              hala.slowniki, global.Hala.odczytajKod);
        if (w.kod) { f.skany = [...new Set([].concat(f.skany || [], [w.kod]))]; f.skan = w.kod; }
        f.blad = w.blad || null;
        return rysuj(el, hala, s.opcje || opcje);
      }
      if (b.dataset.akcja === 'usun-zdjecie' && s.formularz) {
        const [p] = s.formularz.pliki.splice(+b.dataset.nr, 1);
        zwolnij({ pliki: p ? [p] : [] });
        return rysuj(el, hala, s.opcje || opcje);
      }
      if (b.dataset.akcja === 'anuluj-formularz') { zwolnij(s.formularz); s.formularz = null; return rysuj(el, hala, s.opcje || opcje); }
      if (b.dataset.akcja === 'wyslij' && s.formularz) {
        const f = s.formularz, tekst = f.tekst.trim();
        const brak = brakuje(f.wymagania, f);
        if (brak.length) { f.blad = tekstBraku(brak); return rysuj(el, hala, s.opcje || opcje); }
        // Stan „wysyła” w formularzu, a nie tylko na przycisku: zmniejszanie kilku zdjęć trwa sekundy, a każde zdarzenie
        // z hali w tym czasie przerysowuje ekran (rysuj) — przycisk wracał aktywny i drugie dotknięcie wysyłało zdjęcia
        // i „zlecenie.wykonane” drugi raz (przegląd 2026-10-06).
        if (f.wysyla) return;
        f.wysyla = true;
        b.disabled = true;
        if (f.rodzaj === 'odrzucone') {
          await hala.zapisz('zlecenie.odrzucone', id, { powod: tekst });
        } else {
          const dane = tekst ? { uwagi: tekst } : {};
          const zdjecia = [];
          for (const p of f.pliki) zdjecia.push(await hala.dodajPlik(p.plik));
          if (zdjecia.length) dane.zdjecia = zdjecia;
          // Kilka maszyn zeskanowanych w formularzu: wszystkie oprócz ostatniej idą krokiem postępu, ostatnia — z „Zrobione”.
          const skany = (f.skany || []).filter(m => !((f.wymagania.juz || {}).skany || []).includes(m));
          for (const m of skany.slice(0, -1)) await dopiszPostep(hala, id, { skan: m });
          if (skany.length) dane.skan = skany[skany.length - 1];
          await hala.zapisz('zlecenie.wykonane', id, dane);
        }
        zwolnij(f);
        s.formularz = null;
        rysuj(el, hala, s.opcje || opcje);
      }
    } catch (e) {
      if (s.formularz) { s.formularz.wysyla = false; s.formularz.blad = (e && e.message) || 'Nie udało się zapisać. Spróbuj jeszcze raz.'; rysuj(el, hala, s.opcje || opcje); }
      else alert((e && e.message) || 'Nie udało się zapisać. Spróbuj jeszcze raz.');
    }
  }

  /* Formularz „Zrobione” / „Nie mogę” w karcie zlecenia. skan — kod maszyny już zeskanowany (menu po skanie QR,
     D55): wymóg skanu jest wtedy spełniony od razu, o ile to maszyna zlecenia. */
  function otworzFormularz(el, hala, opcje, id, rodzaj, skan) {
    const s = stan(el);
    const z = wiersze([hala.obiekt('zlecenie', id)].filter(Boolean), kontekst(hala, Object.assign({}, opcje, { moje: null, zostaw: id })))[0] || {};
    zwolnij(s.formularz);
    const zgodny = skan && (z.maszyny || []).includes(skan) ? skan : null;
    s.formularz = { id, rodzaj, tekst: '', pliki: [], blad: null, skan: zgodny, skany: zgodny ? [zgodny] : [], wymagania: wymaganiaZ(z, hala) };
    rysuj(el, hala, opcje);
    const art = el.querySelector(`[data-id="${CSS && CSS.escape ? CSS.escape(id) : id}"]`);
    if (art && art.scrollIntoView) art.scrollIntoView({ block: 'center' });
    // Z wymaganym zdjęciem albo skanem zaczyna się od aparatu, a nie od klawiatury zasłaniającej pół ekranu.
    if (!s.formularz.wymagania.wymagajZdjecia && !(s.formularz.wymagania.wymagajSkanu && !s.formularz.skan)) { const p = el.querySelector('[data-pole]'); if (p) p.focus(); }
  }

  /* Wymagania zlecenia dla formularza i „Zrobione” (D56: z postępem i listą maszyn). */
  function wymaganiaZ(z, hala) {
    const sl = (hala && hala.slowniki && hala.slowniki.maszyny) || {};
    const nazwy = {};
    for (const m of z.maszyny || []) nazwy[m] = (sl[m] || {}).nazwa || m;
    return { wymagajZdjecia: !!z.wymagajZdjecia, wymagajNotatki: !!z.wymagajNotatki, wymagajSkanu: !!z.wymagajSkanu,
             maszyna: z.maszyna, maszyny: z.maszyny || [], nazwy, juz: z.juz || {},
             maszynaNazwa: (z.maszyny || []).map(m => nazwy[m]).join(', ') };
  }

  const godzinaLok = t => { const ms = Date.parse(t); const H = global.Hala; if (isNaN(ms) || !H || !H.lokalny) return '';
    const l = H.lokalny(ms); return `${String(l.godz).padStart(2, '0')}:${String(l.min).padStart(2, '0')}`; };

  /* D56: wymagania i postęp na karcie — co odhaczone (✓), co jeszcze (○), kto i kiedy dopisał krok; czynność, która
     zalicza zlecenie sama (próba KJ/lidera, przegląd UR). */
  function wymogiNaZywo(z, maszyny, s) {
    const nazwa = m => (maszyny[m] || {}).nazwa || m;
    const skany = new Set(z.juz.skany || []);
    const krok = (ok, tekst) => `<span class="hala-krok-wymogu ${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${tekst}</span>`;
    const wymogi = [];
    if (z.wymagajSkanu) for (const m of z.maszyny) wymogi.push(krok(skany.has(m), `▣ ${esc(nazwa(m))}`));
    if (z.wymagajZdjecia) wymogi.push(krok(z.juz.zdjecia > 0, `📷 zdjęcie${z.juz.zdjecia > 1 ? ` (${z.juz.zdjecia})` : ''}`));
    if (z.wymagajNotatki) wymogi.push(krok(z.juz.notatka, '📝 notatka'));
    const CZYNNOSCI = { proba: '🔬 Zaliczy się samo, gdy zapiszesz próbę jakościową', przeglad: '🔧 Zaliczy się samo po przeglądzie UR' };
    const ostatnie = z.postep.slice(-3).map(e => `${esc(godzinaLok(e.czas))} ${e.skan ? `▣ ${esc(nazwa(e.skan))}` : ''}${[].concat(e.zdjecia || []).length ? ' 📷' : ''}${e.uwagi ? ` 📝 ${esc(String(e.uwagi).slice(0, 60))}` : ''}`);
    return `${wymogi.length ? `<div class="hala-zlecenie-wymogi" aria-label="Wymagania">${wymogi.join('')}</div>` : ''}
      ${z.czynnosc ? `<p class="hala-zlecenie-czynnosc">${CZYNNOSCI[z.czynnosc] || ''}${z.maszyny.length ? ` na: ${esc(z.maszyny.map(nazwa).join(', '))}` : ''}</p>` : ''}
      ${ostatnie.length ? `<p class="hala-zlecenie-postep slaby">Zrobione dotąd: ${ostatnie.join(' · ')}${z.postep.length > 3 ? ` (+${z.postep.length - 3})` : ''}</p>` : ''}`;
  }

  /* D56: skan maszyny z przycisku „▣ Skanuj” (menu → Wykonaj zadanie) zapisany od razu jako krok zlecenia. */
  async function zaliczSkan(hala, id, maszyna) {
    const z = hala.obiekt('zlecenie', id);
    if (!z) return 'Tego zlecenia już nie ma.';
    if (maszynyZlecenia(z.dane || {}).includes(maszyna)) await dopiszPostep(hala, id, { skan: maszyna });
    return `Zapisane w zleceniu „${(z.dane || {}).tytul || ''}” — dokończ je na ekranie Zleceń`;
  }

  /* D55: moje zgłoszenia nieprawidłowości i odłożone narzędzia z ostatnich 7 dni — z odpowiedzią kierownika. */
  function mojeZgloszenia(hala, ja, opcjeZgloszen) {
    if (!ja) return [];
    const teraz = hala.teraz(), od = teraz - 7 * DOBA_MS;
    const obiekty = typ => { try { return hala.obiekty(typ) || []; } catch (e) { return []; } };
    const wynik = [];
    for (const g of obiekty('zgloszenie')) {
      const d = g.dane || {};
      if (d.zglosil !== ja || Date.parse(d.czas_zgloszenia) < od) continue;
      wynik.push({ typ: 'zgloszenie', id: g.id, tytul: d.tytul || '', czas: d.czas_zgloszenia, status: g.etykieta || g.status,
                   klasa: g.status === 'przyjete' ? 'ok' : g.status === 'odrzucone' ? 'alarm' : 'info',
                   odpowiedz: g.status === 'odrzucone' ? `Kierownik: ${d.powod_odrzucenia || ''}` : d.uwagi_przyjecia ? `Kierownik: ${d.uwagi_przyjecia}` : '' });
    }
    for (const n of obiekty('narzedzia')) {
      const d = n.dane || {};
      if (d.odlozyl !== ja || Date.parse(d.czas_odlozenia) < od) continue;
      wynik.push({ typ: 'narzedzia', id: n.id, tytul: `🧰 ${d.co || ''}`, czas: d.czas_odlozenia, status: n.etykieta || n.status,
                   klasa: n.status === 'odebrane' ? 'ok' : 'info', odpowiedz: '' });
    }
    return wynik.sort((a, b) => String(b.czas).localeCompare(String(a.czas))).slice(0, 8);
  }

  /* Nowe zlecenie dla mnie (mój dział, moja linia) — raz na zlecenie, nie po starcie ani po zalogowaniu
     (to, co już było, człowiek zobaczy na liście). opcje() — funkcja, bo linia lidera może się zmienić.
     Zlecenie ZWRÓCONE przez kierownika (zlecenie.zwrocone → znowu „nowe”, nowy czas_zwrotu) też woła fn — drugi argument
     { zwrot: true, uwagi }; wcześniej znane id milczało i dział nie wiedział, że robota wróciła (hub nie wysyła za nie pusha). */
  function sledz(hala, opcje, fn, dzwieki) {
    // D55: dwa dźwięki (awaria i pilne zadanie) w każdej aplikacji działu. UR gra awarie sam (pasek dźwięku, paczki
    // powiadomień) — przekazuje { awarie: false }.
    if (global.HalaDzwieki) global.HalaDzwieki.sledz(hala, Object.assign({ awarie: true, zlecenia: opcje }, dzwieki));
    const znane = new Map();                           // id → czas_zwrotu, który już widzieliśmy (null — bez zwrotu)
    const zwrot = z => ((z && z.dane) || {}).czas_zwrotu || null;
    // Zaplanowanego (D47) nie zapamiętujemy jako znanego: gdy hub je zleci, dział ma dostać „Nowe zlecenie” jak przy każdym nowym.
    const dopisz = () => { for (const z of hala.obiekty('zlecenie')) if (z.status !== 'zaplanowane') znane.set(z.id, zwrot(z)); };
    const zapamietaj = () => { znane.clear(); dopisz(); };
    hala.na('sesja', zapamietaj);
    hala.na('zmiana', ({ typ, id, obiekt }) => {
      if (typ === '*') { dopisz(); return; }
      if (typ !== 'zlecenie' || !obiekt || obiekt.status === 'zaplanowane') return;
      const znany = znane.has(id), cz = zwrot(obiekt);
      if (znany && (!cz || cz === znane.get(id))) return;
      znane.set(id, cz);
      const o = opcje(), d = obiekt.dane || {};
      if (obiekt.status === 'nowe' && !obiekt._oczekuje && !przepadlo(obiekt, hala.teraz()) && d.dzial === o.dzial
          && naLinii(d, o) && widoczneDla(d, kontekst(hala, {}))) fn(obiekt, znany ? { zwrot: true, uwagi: d.uwagi_zwrotu || '' } : { zwrot: false });
    });
    zapamietaj();
  }

  /* Jeden tekst komunikatu dla Lidera, UR i KJ (drugi argument `sledz`): zwrócone przez kierownika zlecenie nie jest
     „nowe” — dział ma wiedzieć, że wróciło, i dostać uwagę kierownika. */
  function opisPowiadomienia(z, o) {
    const tytul = ((z && z.dane) || {}).tytul || '';
    if (!(o && o.zwrot)) return `Nowe zlecenie od kierownika: ${tytul}`;
    return `Zlecenie wróciło od kierownika: ${tytul}` + (o.uwagi ? ` — ${o.uwagi}` : '');
  }

  const HalaZlecenia = { maszynyZlecenia, juzZrobione, wymaganiaZ, zaliczSkan, dopiszPostep, wiersze, wierszeDla, przepadlo, poCzasieDoZrobienia, widoczneDla, krokiStatusu, otworzFormularz, mojeZgloszenia,
                         brakuje, tekstBraku, skanMaszyny, doZrobienia, zalegle, rysujZalegle, rysuj, sledz, formularz, opisPowiadomienia };
  global.HalaZlecenia = HalaZlecenia;
  if (typeof module !== 'undefined' && module.exports) module.exports = HalaZlecenia;
})(typeof window !== 'undefined' ? window : globalThis);
