/* Zlecenia od kierownika — wspólny ekran działów (Lider = produkcja, UR, KJ). Decyzja właściciela 2026-09-28:
   kierownik w Panelu zleca zadania działom, a dział je przyjmuje, wykonuje albo zgłasza, że nie może.
   D31 (2026-10-01): kierownik może wymagać zdjęcia i notatki — jak dowód dostawy w GK Trasy, bez nich „Wyślij”
   jest nieaktywny (a hub i tak by odrzucił). Termin po ludzku: „do 14:00 (za 25 min)”, „po terminie o 1 h 20 min”.

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
  function wiersze(lista, { dzial, linia, linie, moje, pracownicy, teraz, H, poczatekZmiany, zostaw }) {
    const nazwa = id => { if (!id) return null; const p = (pracownicy || []).find(x => x.id === id); return p ? p.nazwa : id; };
    const godz = t => { const ms = Date.parse(t); if (isNaN(ms)) return null; const l = H.lokalny(ms);
      return `${String(l.dzien).padStart(2, '0')}.${String(l.miesiac).padStart(2, '0')} ${String(l.godz).padStart(2, '0')}:${String(l.min).padStart(2, '0')}`; };
    return (lista || [])
      .filter(z => z && z.status !== 'zaplanowane' && (z.aktywny || (z.id === zostaw && z.status === 'przepadlo')) && (!przepadlo(z, teraz) || z.id === zostaw))
      .filter(z => (z.dane || {}).dzial === dzial && naLinii(z.dane || {}, { linia, linie }))
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
        return {
          id: z.id, numer: z.numer || '—', status: z.status, etykieta: z.etykieta || z.status,
          tytul: d.tytul || '', opis: d.opis || '', pilne: d.priorytet === 'pilne', maszyna: d.maszyna || null, linia: d.linia || null,
          dlaKogo: nazwa(d.wykonawca), zlecil: nazwa(d.zlecil), kiedy: godz(d.czas_zlecenia), termin: godz(d.termin),
          terminMs: isNaN(termin) ? null : termin, terminOpis: opis ? opis.tekst : null,
          poTerminie, zalegle: poTerminie || zPoprzedniejZmiany,
          // Klucz kolejki zaległych: termin, a bez terminu chwila zlecenia (najdłużej czeka = pierwsze).
          zalegleOd: poTerminie ? termin : zPoprzedniejZmiany ? czasMs : null,
          zalegleOpis: poTerminie ? (opis ? opis.tekst : 'po terminie') : zPoprzedniejZmiany ? `z poprzedniej zmiany (zlecone ${godz(d.czas_zlecenia)})` : null,
          doZrobienia, wyslane: WYSLANE.has(z.status),
          wymagajZdjecia: d.wymagaj_zdjecia === true, wymagajNotatki: d.wymagaj_notatki === true, stale: !!d.stale,
          uwagiZwrotu: d.uwagi_zwrotu || null, czas: d.czas_zlecenia || '',
          zdjecia: [].concat(d.zdjecia || []), zdjeciaWykonania: [].concat(d.zdjecia_wykonania || []),
        };
      })
      .sort((a, b) => (b.doZrobienia - a.doZrobienia) || (b.zalegle - a.zalegle)
        || (a.zalegle && b.zalegle ? a.zalegleOd - b.zalegleOd : 0) || (b.pilne - a.pilne)
        || ((a.terminMs === null) - (b.terminMs === null)) || ((a.terminMs || 0) - (b.terminMs || 0))
        || String(a.czas).localeCompare(String(b.czas)));
  }

  /* Czego brakuje, żeby wysłać formularz (czysta funkcja, testy w reduktor-testy.js). rodzaj 'wykonane':
     zdjęcie i notatka tylko, gdy kierownik ich wymaga; 'odrzucone': powód zawsze — kierownik musi wiedzieć, co dalej. */
  function brakuje(wymagania, f) {
    const w = wymagania || {}, tekst = String((f && f.tekst) || '').trim(), pliki = (f && f.pliki) || [];
    if (f && f.rodzaj === 'odrzucone') return tekst ? [] : ['powodu'];
    const lista = [];
    if (w.wymagajZdjecia && !pliki.length) lista.push('zdjęcia');
    if (w.wymagajNotatki && !tekst) lista.push('notatki');
    return lista;
  }
  const tekstBraku = lista => (lista.length ? `Brakuje: ${lista.join(' i ')}` : '');

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

  const kontekst = (hala, opcje) => Object.assign({ H: global.Hala, teraz: hala.teraz(), pracownicy: hala.pracownicy,
                                                    poczatekZmiany: poczatekZmiany(hala, global.Hala) }, opcje);

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
      <span class="hala-zalegle-opis">${esc(z.zalegleOpis)}${z.wymagajZdjecia ? ' · 📷' : ''}${z.wymagajNotatki ? ' · 📝' : ''}</span>
      ${lista.length > 1 ? `<span class="hala-zalegle-wiecej">+${lista.length - 1} więcej ›</span>` : '<span class="hala-zalegle-wiecej">Otwórz ›</span>'}
    </button>`;
    el.firstElementChild.onclick = () => { if (otworz) otworz(z); };
    return lista.length;
  }

  // Stan ekranu na element: filtr „Moje” i otwarty formularz (id, rodzaj, tekst, zdjęcia, wymagania).
  const stany = new WeakMap();
  const stan = el => { if (!stany.has(el)) stany.set(el, { moje: false, formularz: null }); return stany.get(el); };

  const miniatury = ids => ids.map(id => `<img class="hala-zlecenie-foto" data-plik="${esc(id)}" alt="Zdjęcie" loading="lazy">`).join('');

  function zwolnij(f) {
    for (const p of (f && f.pliki) || []) { try { URL.revokeObjectURL(p.url); } catch (e) { /* stara przeglądarka */ } }
  }

  function formularz(f) {
    const zrobione = f.rodzaj === 'wykonane';
    const brak = brakuje(f.wymagania, f);
    const pole = (wymagane, nazwa) => `${nazwa} <span class="slaby">(${wymagane ? 'wymagane' : 'można pominąć'})</span>`;
    return `<div class="hala-zlecenie-formularz">
      ${zrobione ? `<div class="hala-zlecenie-pole"><span class="hala-zlecenie-etykieta">${pole(f.wymagania.wymagajZdjecia, 'Zdjęcie')}</span>
        <div class="hala-zlecenie-miniatury">${f.pliki.map((p, i) => `<span class="hala-zlecenie-miniatura"><img src="${esc(p.url)}" alt="Zdjęcie ${i + 1}">
            <button type="button" data-akcja="usun-zdjecie" data-nr="${i}" aria-label="Usuń zdjęcie ${i + 1}">✕</button></span>`).join('')}
          ${f.pliki.length < MAKS_ZDJEC ? `<label class="hala-zlecenie-zdjecie ${f.wymagania.wymagajZdjecia && !f.pliki.length ? 'brak' : ''}">📷 ${f.pliki.length ? 'Jeszcze jedno' : 'Zrób zdjęcie'}
            <input type="file" accept="image/*" capture="environment" multiple data-zdjecie hidden></label>` : ''}</div></div>` : ''}
      <label class="hala-zlecenie-pole"><span class="hala-zlecenie-etykieta">${zrobione ? pole(f.wymagania.wymagajNotatki, 'Notatka') : 'Dlaczego nie da się tego zrobić?'}</span>
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
    const ja = hala.pracownik && hala.pracownik.id;
    const lista = wiersze(hala.obiekty('zlecenie'), kontekst(hala, Object.assign({}, opcje, { moje: s.moje ? ja : null,
                                                                                    zostaw: s.formularz ? s.formularz.id : null })));
    // Formularz do zlecenia, które zniknęło (np. kierownik je anulował) — zamykamy.
    if (s.formularz && !lista.some(z => z.id === s.formularz.id && z.doZrobienia)) { zwolnij(s.formularz); s.formularz = null; }
    const maszyny = (hala.slowniki && hala.slowniki.maszyny) || {};
    const wiersz = (z, nr) => `
      <article class="hala-zlecenie ${z.pilne ? 'pilne' : ''} ${z.poTerminie ? 'po-terminie' : ''} ${z.zalegle ? 'zalegle' : ''} ${z.wyslane ? 'wyslane' : ''}" data-id="${esc(z.id)}">
        <div class="hala-zlecenie-gora">${nr ? `<span class="hala-zlecenie-nr" aria-label="Kolejność ${nr}">${nr}</span>` : ''}<b>${esc(z.tytul)}</b><span class="slaby">${z.stale ? '🔁 ' : ''}${esc(z.numer)}</span></div>
        <div class="hala-zlecenie-szczegoly">
          <span class="znacznik ${z.doZrobienia ? 'info' : z.status === 'wykonane' ? 'ok' : 'uwaga'}">${esc(z.etykieta)}</span>
          ${z.pilne ? '<span class="znacznik alarm">Pilne</span>' : ''}
          ${z.doZrobienia && z.wymagajZdjecia ? '<span class="znacznik" title="Bez zdjęcia nie wyślesz">📷 zdjęcie</span>' : ''}
          ${z.doZrobienia && z.wymagajNotatki ? '<span class="znacznik" title="Bez notatki nie wyślesz">📝 notatka</span>' : ''}
          ${z.maszyna ? `<span>${esc((maszyny[z.maszyna] || {}).nazwa || z.maszyna)} (${esc(z.maszyna)})</span>` : ''}
          ${z.dlaKogo ? `<span>dla: ${esc(z.dlaKogo)}</span>` : ''}
        </div>
        ${z.opis ? `<p class="hala-zlecenie-opis">${esc(z.opis)}</p>` : ''}
        ${z.zdjecia.length ? `<div class="hala-zlecenie-zdjecia">${miniatury(z.zdjecia)}</div>` : ''}
        ${z.uwagiZwrotu && z.doZrobienia ? `<p class="hala-zlecenie-zwrot">Kierownik: ${esc(z.uwagiZwrotu)}</p>` : ''}
        ${z.terminOpis || z.zalegle ? `<div class="hala-zlecenie-termin ${z.zalegle ? 'po-terminie-tekst' : ''}">⏰ ${esc(z.terminOpis || z.zalegleOpis)}</div>` : ''}
        <div class="hala-zlecenie-kiedy slaby">${esc(z.zlecil || 'Kierownik')} · ${esc(z.kiedy || '—')}${z.termin && !z.doZrobienia ? ` · termin ${esc(z.termin)}` : ''}</div>
        ${z.doZrobienia ? (s.formularz && s.formularz.id === z.id ? formularz(s.formularz) : `<div class="hala-zlecenie-akcje">
          ${z.status === 'nowe' ? '<button type="button" data-akcja="przyjmij">Biorę</button>' : ''}
          <button type="button" class="zielony" data-akcja="wykonane">Zrobione</button>
          <button type="button" data-akcja="nie-moge">Nie mogę</button>
        </div>`) : `${z.zdjeciaWykonania.length ? `<div class="hala-zlecenie-zdjecia">${miniatury(z.zdjeciaWykonania)}</div>` : ''}<div class="hala-zlecenie-kiedy slaby">Wysłane do kierownika</div>`}
      </article>`;
    // Zaległe osobno i z numerami 1, 2, 3… — kolejność roboty, a nie tylko kolor (jak „Zaległe dostawy” w GK Trasy).
    const zal = lista.filter(z => z.zalegle), doZ = lista.filter(z => z.doZrobienia && !z.zalegle), wys = lista.filter(z => z.wyslane);
    const pusto = s.moje ? 'Nie masz przypisanych zleceń' : 'Nie ma zleceń do zrobienia';
    // Kursor w polu tekstowym — przerysowanie nie może go zabrać (tekst i tak jest w stanie).
    const wPolu = document.activeElement && el.contains(document.activeElement) && document.activeElement.matches('[data-pole]');
    el.innerHTML = `<div class="hala-zlecenia">
      <div class="hala-zlecenia-naglowek"><h2>Zlecenia od kierownika</h2>
        <div class="hala-zlecenia-filtr" role="group" aria-label="Które zlecenia">
          <button type="button" data-filtr="wszystkie" aria-pressed="${!s.moje}">Wszystkie</button>
          <button type="button" data-filtr="moje" aria-pressed="${s.moje}">Moje</button></div></div>
      ${zal.length ? `<h3 class="hala-zlecenia-zalegle">Zaległe — zrób najpierw <span class="hala-zlecenia-ile">${zal.length}</span></h3>
        ${zal.map((z, i) => wiersz(z, i + 1)).join('')}${doZ.length ? '<h3>Pozostałe do zrobienia</h3>' : ''}` : ''}
      ${doZ.map(z => wiersz(z)).join('') || (zal.length ? '' : `<p class="hala-zlecenia-pusto">${pusto}</p>`)}
      ${wys.length ? `<h3>Czeka na kierownika</h3>${wys.map(z => wiersz(z)).join('')}` : ''}
    </div>`;
    for (const img of el.querySelectorAll('img[data-plik]')) hala.adresPliku(img.dataset.plik).then(u => { img.src = u; }).catch(() => {});
    if (wPolu) { const p = el.querySelector('[data-pole]'); if (p) { p.focus(); p.setSelectionRange(p.value.length, p.value.length); } }
    if (!el.dataset.halaZlecenia) {
      el.dataset.halaZlecenia = '1';
      el.addEventListener('click', ev => akcja(ev, el, hala, opcje));
      el.addEventListener('input', ev => {
        if (ev.target.matches('[data-pole]') && s.formularz) { s.formularz.tekst = ev.target.value; odswiezBlokade(el, s.formularz); }
      });
      el.addEventListener('change', ev => {
        if (!ev.target.matches('[data-zdjecie]') || !s.formularz) return;
        // Podgląd z pliku w pamięci przeglądarki — do kolejki (hala.dodajPlik) trafia dopiero przy „Wyślij”.
        for (const plik of Array.from(ev.target.files || []).slice(0, MAKS_ZDJEC - s.formularz.pliki.length))
          s.formularz.pliki.push({ plik, url: URL.createObjectURL(plik) });
        s.formularz.blad = null;
        rysuj(el, hala, opcje);
      });
    }
  }

  async function akcja(ev, el, hala, opcje) {
    const s = stan(el);
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.filtr) { s.moje = b.dataset.filtr === 'moje'; return rysuj(el, hala, opcje); }
    const art = b.closest('[data-id]');
    if (!art || !b.dataset.akcja) return;
    const id = art.dataset.id;
    try {
      if (b.dataset.akcja === 'przyjmij') await hala.zapisz('zlecenie.przyjete', id, {});
      if (b.dataset.akcja === 'wykonane' || b.dataset.akcja === 'nie-moge') {
        const z = wiersze([hala.obiekt('zlecenie', id)].filter(Boolean), kontekst(hala, Object.assign({}, opcje, { moje: null, zostaw: id })))[0] || {};
        zwolnij(s.formularz);
        s.formularz = { id, rodzaj: b.dataset.akcja === 'wykonane' ? 'wykonane' : 'odrzucone', tekst: '', pliki: [], blad: null,
                        wymagania: { wymagajZdjecia: !!z.wymagajZdjecia, wymagajNotatki: !!z.wymagajNotatki } };
        rysuj(el, hala, opcje);
        // Z wymaganym zdjęciem zaczyna się od aparatu, a nie od klawiatury zasłaniającej pół ekranu.
        if (!s.formularz.wymagania.wymagajZdjecia) { const p = el.querySelector('[data-pole]'); if (p) p.focus(); }
        return;
      }
      if (b.dataset.akcja === 'usun-zdjecie' && s.formularz) {
        const [p] = s.formularz.pliki.splice(+b.dataset.nr, 1);
        zwolnij({ pliki: p ? [p] : [] });
        return rysuj(el, hala, opcje);
      }
      if (b.dataset.akcja === 'anuluj-formularz') { zwolnij(s.formularz); s.formularz = null; return rysuj(el, hala, opcje); }
      if (b.dataset.akcja === 'wyslij' && s.formularz) {
        const f = s.formularz, tekst = f.tekst.trim();
        const brak = brakuje(f.wymagania, f);
        if (brak.length) { f.blad = tekstBraku(brak); return rysuj(el, hala, opcje); }
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
          await hala.zapisz('zlecenie.wykonane', id, dane);
        }
        zwolnij(f);
        s.formularz = null;
        rysuj(el, hala, opcje);
      }
    } catch (e) {
      if (s.formularz) { s.formularz.wysyla = false; s.formularz.blad = (e && e.message) || 'Nie udało się zapisać. Spróbuj jeszcze raz.'; rysuj(el, hala, opcje); }
      else alert((e && e.message) || 'Nie udało się zapisać. Spróbuj jeszcze raz.');
    }
  }

  /* Nowe zlecenie dla mnie (mój dział, moja linia) — raz na zlecenie, nie po starcie ani po zalogowaniu
     (to, co już było, człowiek zobaczy na liście). opcje() — funkcja, bo linia lidera może się zmienić. */
  function sledz(hala, opcje, fn) {
    const znane = new Set();
    // Zaplanowanego (D47) nie zapamiętujemy jako znanego: gdy hub je zleci, dział ma dostać „Nowe zlecenie” jak przy każdym nowym.
    const zapamietaj = () => { znane.clear(); for (const z of hala.obiekty('zlecenie')) if (z.status !== 'zaplanowane') znane.add(z.id); };
    hala.na('sesja', zapamietaj);
    hala.na('zmiana', ({ typ, id, obiekt }) => {
      if (typ === '*') { for (const z of hala.obiekty('zlecenie')) if (z.status !== 'zaplanowane') znane.add(z.id); return; }
      if (typ !== 'zlecenie' || !obiekt || znane.has(id) || obiekt.status === 'zaplanowane') return;
      znane.add(id);
      const o = opcje(), d = obiekt.dane || {};
      if (obiekt.status === 'nowe' && !obiekt._oczekuje && !przepadlo(obiekt, hala.teraz()) && d.dzial === o.dzial
          && naLinii(d, o)) fn(obiekt);
    });
    zapamietaj();
  }

  const HalaZlecenia = { wiersze, przepadlo, brakuje, tekstBraku, doZrobienia, zalegle, rysujZalegle, rysuj, sledz, formularz };
  global.HalaZlecenia = HalaZlecenia;
  if (typeof module !== 'undefined' && module.exports) module.exports = HalaZlecenia;
})(typeof window !== 'undefined' ? window : globalThis);
