/* Panel Zarządczy GK — zlecenia stałe (D31, prośba właściciela 2026-10-01: „jak w GK Trasy”).

   Zlecenie stałe = zadanie + dział (linia, maszyna, osoba) + harmonogram + termin + wymagane zdjęcie/notatka.
   Zapis: slownik.zapisany / slownik.usuniety w słowniku zlecenia_stale (kierownicy i admin — kontrakt). Zleceń
   nie robi Panel: hub sam co minutę zamienia wystąpienia z harmonogramu w „zlecenie.utworzone” (automat_zlecen),
   więc działa też, gdy żaden Panel nie jest otwarty. „Zleć teraz” otwiera zwykłe okno „Nowe zlecenie” wypełnione
   tym szablonem. Logika formularza i opisy po ludzku: widok.js (testowane w panel/testy/widok-testy.js). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;

  /* Akcje wiersza zapisanego zlecenia (audyt 2026-11-09): do pięciu równorzędnych przycisków. Teraz „Zleć teraz” (główne),
     „Zmień” i „Więcej” — Kopiuj, Wstrzymaj/Wznów, Usuń i 🖨 QR pod nim. Uprawnienia i warunki bez zmian. */
  const wiecejStale = new Set();
  let ostatnieD = null;
  // Zmiany różne w różne dni (harmonogram.zmiany_wg_dni) obsługuje serwer od kontraktu 1.34.0 — wcześniej okno ich nie oferuje.
  const wgDniDostepne = () => W.obslugujeZmianyWgDni(hala.kontrakt);
  function akcjeStalego(s, { zlecaj, pisze, qr, pomin }) {
    const p = (akcja, napis, klasa, title) => `<button type="button" class="maly${klasa ? ` ${klasa}` : ''}" data-akcja="${akcja}"${title ? ` title="${esc(title)}"` : ''}>${napis}</button>`;
    const widoczne = [zlecaj ? p('zlec', 'Zleć teraz', 'glowny') : '', pisze ? p('zmien', 'Zmień') : '',
      pisze && pomin ? p('pomin-dzis', pomin === 'pomin' ? 'Pomiń dzisiaj' : 'Przywróć dzisiaj', '', pomin === 'pomin' ? 'Dziś serwer jej już nie zleci (zlecone dziś zostają), kolejne dni bez zmian' : 'Dziś znowu się zleci') : ''].filter(Boolean);
    const ukryte = [qr ? p('kody-qr', `${P.ik('drukuj')}QR`, '', `Drukuj kody QR punktów: ${qr.etykiety.map(e => e.kod).join(', ')}`) : '',
      pisze ? p('duplikuj', 'Duplikuj…', '', 'Kopia na inną zmianę lub dział') : '', pisze ? p('wstrzymaj', s.aktywny ? 'Wstrzymaj' : 'Wznów') : '', pisze ? p('usun', 'Usuń') : ''].filter(Boolean);
    if (!ukryte.length) return widoczne.join('');
    if (ukryte.length === 1 && widoczne.length < 2) return widoczne.concat(ukryte).join('');
    const otwarte = wiecejStale.has(s.kod);
    return widoczne.join('') + p('wiecej', `Więcej${P.ik(otwarte ? 'szewron-gora' : 'szewron-dol', 14).replace('class="ik"', 'class="ik po"')}`, 'wiecej').replace('<button ', `<button aria-expanded="${otwarte}" `)
      + (otwarte ? ukryte.join('') : '');
  }

  function rysuj(d) {
    ostatnieD = d;
    const lista = W.zleceniaStale({ slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz,
                                    roleZlecajacych: ((hala.kontrakt.zdarzenia['zlecenie.utworzone'] || {}).role) || [] });
    const pisze = P.mozeZapisacStale();
    const zlecaj = pisze && (hala.pracownik.role || []).some(r => r === 'admin'
      || ((hala.kontrakt.zdarzenia['zlecenie.utworzone'] || {}).role || []).includes(r));
    // Właściciel 2026-10-20: kody QR punktów skanu przy zapisanym (▣ / obchód przy maszynie) — 🖨 = naklejki jego maszyn,
    // „🖨 Kody QR punktów” = naklejki wszystkich (bez powtórzeń). Te same etykiety co Maszyny i Administracja → 🖨 Kody QR.
    const punkty = new Map(window.PanelEtykiety.punktySkanu(d.slowniki).filter(p => p.zrodlo === 'zapisane').map(p => [p.kod, p]));
    $('kody-punktow').hidden = !punkty.size;
    $('kody-punktow').innerHTML = `${P.ik('drukuj')}Kody QR punktów (${window.PanelEtykiety.etykietyElementow([...punkty.values()]).length})`;
    $('lista-stalych').innerHTML = lista.map(s => `
      <article class="staly ${s.aktywny ? '' : 'wstrzymany'}" data-kod="${esc(s.kod)}">
        <div class="opis">
          ${s.checklista ? `<div class="slaby">${P.ik('lista', 14)}Checklista · ${esc(ile(s.pozycji, 'pozycja', 'pozycje', 'pozycji'))}</div>` : ''}
          <div><b>${esc(s.tytul)}</b> ${s.wymagajZdjecia ? '<span title="Wymagane zdjęcie">' + P.ik('aparat') + '</span>' : ''}${s.wymagajNotatki ? '<span title="Wymagana notatka">' + P.ik('notatka') + '</span>' : ''}${s.wymagajSkanu ? '<span title="Wymagany skan QR maszyny">' + P.ik('skan') + '</span>' : ''}</div>
          <div class="szczegoly">
            <span class="znacznik ${s.aktywny ? 'ok' : ''}">${!s.aktywny ? 'Wstrzymane' : s.reczny ? 'Ręczne' : 'Powtarza się'}</span>
            ${s.pilne ? '<span class="znacznik alarm">Pilne</span>' : ''}
            <span class="znacznik neutral">${esc(s.dla || s.dzialNazwa)}</span>
            ${s.liniaNazwa ? `<span>${esc(s.liniaNazwa)}</span>` : ''}${s.maszyna ? `<span>· ${esc(s.maszyna)}</span>` : ''}

          </div>
          <div class="slaby">${esc(s.harmonogram)}</div>
          ${s.nieZleca ? `<div class="ostrzezenie-stalego">Nie zleca — ${esc(s.nieZleca)}, kliknij „Zmień”</div>` : ''}
          ${s.nieAutomat ? `<div class="ostrzezenie-stalego">${P.ik('ostrzezenie', 16)}Nie zleca się sama — zlecasz ją przyciskiem „Zleć teraz”.${pisze ? ' <button type="button" class="maly glowny" data-akcja="automat">Włącz automat</button>' : ''}</div>` : ''}
          ${s.aktywny && !s.reczny ? `<div class="nastepne">${s.nastepne ? `Następne: ${esc(s.nastepne)}` : 'Brak wystąpień w najbliższych dwóch miesiącach'}</div>` : ''}
        </div>
        <div class="akcje">${akcjeStalego(s, { zlecaj, pisze, qr: punkty.get(s.kod), pomin: pisze ? W.pominDzisiajAkcja(((d.slowniki || {}).zlecenia_stale || {})[s.kod], dzis()) : null })}</div>
      </article>`).join('') || `<p class="pusto">Nie ma jeszcze zapisanych zleceń.${pisze ? ' Dodaj pierwsze: „+ Nowe” albo „Do zapisanych” przy zleceniu.' : ''}</p>`;
    const brak = pisze ? W.brakujaceZestawu(d.slowniki, hala.pracownik.id) : [];
    $('zestaw-stalych').hidden = !brak.length;
    $('zestaw-stalych').textContent = `+ Zlecenia mistrza i lidera (${brak.length})`;
    $('sobota-narzedzie').hidden = !(pisze && wgDniDostepne() && W.doDodaniaSoboty(d.slowniki).length);
    $('zapisane-wiecej').hidden = ['kody-punktow', 'zestaw-stalych', 'sobota-narzedzie'].every(id => $(id).hidden);
  }

  $('kody-punktow').addEventListener('click', async () => {
    const punkty = window.PanelEtykiety.punktySkanu(hala.slowniki).filter(p => p.zrodlo === 'zapisane');
    try { await window.PanelEtykiety.drukuj(window.PanelEtykiety.etykietyElementow(punkty), 'Kody QR punktów skanu'); }
    catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });

  /* Zestaw od właściciela (D34) jednym przyciskiem — tylko brakujące, autor = kto klika (hub zleca w jego imieniu). */
  $('zestaw-stalych').addEventListener('click', async () => {
    const brak = W.brakujaceZestawu(hala.slowniki, hala.pracownik.id);
    if (!brak.length) return;
    if (!(await P.potwierdz('Dodać zlecenia mistrza i lidera?', `${brak.map(z => z.wartosc.tytul).join(', ')}. `
      + 'Każde potem zmienisz albo wstrzymasz. Zlecenia mistrza zobaczą osoby z rolą „mistrz”. Zlecenia lidera przepadają '
      + 'z końcem swojej zmiany; obsadę („Ustaw ludzi na maszyny”) lider ma w checkliście.', 'Dodaj'))) return;
    try {
      for (const z of brak) await hala.zapisz('slownik.zapisany', `zlecenia_stale/${z.kod}`, { slownik: 'zlecenia_stale', klucz: z.kod, wartosc: z.wartosc });
      P.komunikat(`Dodano ${brak.length} — serwer sam zleci je według harmonogramu`, 'ok');
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });

  // ------------------------------------------------------------ okno edycji

  const f = $('formularz-stalego');
  let edytowanyKod = null;
  let poZapisie = null;                      // D55: zgłoszenie → zlecenie stałe (Panel.widoki.zgloszenia)
  // D71: stan kalendarza okna — dni wybrane („w dni wybrane w kalendarzu”), pominięte dni i oglądany miesiąc.
  const kal = { daty: [], pomin: [], rok: 0, miesiac: 0 };
  // Przełącznik „Różne zmiany w różne dni”: macierz { dzień: [zmiany] } zamiast jednej listy zmian dla wszystkich dni.
  const wgDni = { dostepne: false, aktywne: false, macierz: {} };
  // Telefon (≤ 600 px), nowy wzorzec: ten sam formularz po jednym pytaniu naraz (data-krok); zmiana istniejącego zostaje na jednym ekranie.
  const KROKI = ['Nazwa', 'Kiedy', 'Pozycje', 'Dla kogo', 'Sprawdź i zapisz'];
  const SKROTY_DNI = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
  let kreator = false;
  let krok = 1;

  const zmianySlownik = () => {
    const z = (hala.slowniki && hala.slowniki.zmiany) || {};
    return Object.keys(z).length ? z : { I: { nazwa: 'Zmiana I', od: '06:00' }, II: { nazwa: 'Zmiana II', od: '14:00' }, III: { nazwa: 'Zmiana III', od: '22:00' } };
  };
  const wybrane = n => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);
  // Trwające zlecenie otwarte do poprawienia (Zlecenia → ✎ Zmień): { id, kod, d }. Null — zwykłe okno zapisanego.
  let instancja = null;
  /* D92 (właściciel 2026-11-19: „daj możliwość dołączania zdjęć do zlecanych zadań”): w oknie „Zmień” trwającego zlecenia
     zdjęcia od zlecającego — dołączone (✕ zdejmuje z listy zlecenia; pliku na serwerze nie kasujemy) i nowe (aparat albo
     galeria, razem najwyżej 8 — ten sam limit co „Nowe zlecenie” i hub). Wynik liczy W.zdjeciaEdycji. */
  let zdjeciaZostaja = [];
  const maksZdjec = P.MAKS_ZDJEC_FORMULARZA || 8;
  const pokazNowe = P.poleZdjecia ? P.poleZdjecia(f.inst_zdjecie, { maks: () => maksZdjec - zdjeciaZostaja.length }) : () => {};
  function rysujZdjeciaZlecenia() {
    const lista = $('inst-zdjecia-lista');
    lista.textContent = '';
    $('inst-zdjecia-opis').hidden = !zdjeciaZostaja.length;
    zdjeciaZostaja.forEach(id => {
      const poz = document.createElement('span'); poz.className = 'hala-zdjecie-poz';
      const im = document.createElement('img'); im.alt = ''; im.dataset.plik = id;
      hala.adresPliku(id).then(u => { im.src = u; }).catch(() => {});
      const x = document.createElement('button'); x.type = 'button'; x.className = 'maly'; x.innerHTML = P.ik('zamknij');
      x.setAttribute('aria-label', 'Zdejmij zdjęcie ze zlecenia');
      x.addEventListener('click', () => { zdjeciaZostaja = zdjeciaZostaja.filter(z => z !== id); rysujZdjeciaZlecenia(); pokazNowe(); });
      poz.append(im, x); lista.appendChild(poz);
    });
  }
  const ped = P.widoki.checklisty.utworz(f, {
    lista: $('stale-pozycje'), wklej: $('stale-wklej'),
    linia: () => (f.linia.value === W.LINIA_KAZDA ? '' : f.linia.value),
    zmianaOd: () => { const zm = zmianySlownik(); return (zm[wybrane('zmiany')[0] || Object.keys(zm)[0]] || {}).od; },
    produkcja: () => wybrane('dzialy').every(d => d === 'produkcja'),
    zmiana: () => odswiez(), instancja: () => !!instancja, kod: () => edytowanyKod,
  });
  /* Maszyny zlecenia stałego jako pola wyboru; ukryte pole „maszyna” = pierwsza zaznaczona (wymaganie skanu, hub). Maszyna
     zaznaczona wcześniej, a spoza wybranej linii, zostaje na liście — okno jej po cichu nie odbiera. */
  function rysujMaszynyStalego(zaznaczone) {
    const wybrane0 = new Set(zaznaczone || []);
    const linia = f.linia.value === W.LINIA_KAZDA ? '' : f.linia.value;
    const maszyny = P.maszynyLinii(linia);
    const znane = new Set(maszyny.map(([k]) => k));
    const wszystkie = [...maszyny, ...[...wybrane0].filter(k => !znane.has(k)).map(k => [k, `${k} (spoza tej linii)`])];
    f.querySelector('[data-maszyny-stalego]').innerHTML = wszystkie.map(([k, n]) =>
      `<label class="zaznacz"><input type="checkbox" name="maszyny_stalego" value="${esc(k)}" ${wybrane0.has(k) ? 'checked' : ''}> ${esc(n)}</label>`).join('')
      || '<span class="slaby">Brak maszyn — dodaj je w Administracja → Maszyny.</span>';
    synchMaszynyStalego();
  }
  function synchMaszynyStalego() {
    const pierwsza = (f.querySelector('input[name="maszyny_stalego"]:checked') || {}).value || '';
    if (pierwsza && ![...f.maszyna.options].some(o => o.value === pierwsza)) f.maszyna.insertAdjacentHTML('beforeend', `<option value="${esc(pierwsza)}"></option>`);
    f.maszyna.value = pierwsza;
    P.pokazSkan(f);
  }
  const dzis = () => W.dzienZakladu(hala.teraz());
  // D76: lider UR i kierownik KJ zapisuje zlecenia tylko dla swojego działu (hub odrzuca resztę) — okno pokazuje tylko jego.
  const dzialyKontraktu = () => P.dzialyZlecajacego();
  /* Zmiany z okna: jedna lista dla wszystkich dni albo — po włączeniu „Różne zmiany w różne dni” — osobna dla każdego dnia
     (zapis: najczęstsza w `zmiany`, wyjątki w `zmiany_wg_dni`). */
  const zmianyPola = () => wgDni.aktywne ? W.zmianyDniZMacierzy(wgDni.macierz, wybrane('dni')) : { zmiany: wybrane('zmiany'), zmiany_wg_dni: {} };
  // Siedem dni co tydzień, bez wyjątków i bez „co N tygodni” zapisujemy jak dotąd: „codziennie”.
  const rodzajPola = zm => f.rodzaj.value === 'dni_tygodnia' && wybrane('dni').length === 7 && (+f.co_tygodni.value || 1) === 1
    && !Object.keys(zm.zmiany_wg_dni).length ? 'codziennie' : f.rodzaj.value;
  const pola = (zm = zmianyPola()) => ({
    tytul: f.tytul.value, opis: f.opis.value, dzialy: wybrane('dzialy'), kto: (f.querySelector('input[name="kto"]:checked') || {}).value || 'dzial',
    wykonawcy: wybrane('osoby'), linia: f.linia.value, maszyna: f.maszyna.value, maszyny: wybrane('maszyny_stalego'),
    pilne: f.pilne.checked, wymagaj_zdjecia: f.wymagaj_zdjecia.checked, wymagaj_notatki: f.wymagaj_notatki.checked,
    wymagaj_skanu: f.wymagaj_skanu.checked, co_min: f.co_min.value,
    rodzaj: rodzajPola(zm), dni: wybrane('dni'), dzien_miesiaca: f.dzien_miesiaca.value, zmiany: zm.zmiany, zmiany_wg_dni: zm.zmiany_wg_dni,
    co: f.co.value, co_tygodni: f.co_tygodni.value, mies_tryb: (f.querySelector('input[name="mies_tryb"]:checked') || {}).value || 'dzien',
    tydzien: f.tydzien.value, dzien_tygodnia: f.dzien_tygodnia.value, od: f.od.value, do: f.do.value, bez_swiat: f.bez_swiat.checked,
    daty: kal.daty, pomin: kal.pomin, dzis: dzis(),
    termin_rodzaj: f.termin_rodzaj.value, godzina: f.godzina.value, minuty: f.minuty.value, aktywny: f.aktywny.checked,
    okno_rodzaj: f.okno_rodzaj.value, okno_godzina: f.okno_godzina.value, okno_minuty: f.okno_minuty.value,
    checklista: f.jako_checklista.checked, pozycje: ped.odczytaj(),
  });

  /* Osoby zaznaczonych działów (każda dostaje własne zlecenie); zaznaczenie zostaje przy zmianie działów. */
  function rysujOsoby(zaznaczone) {
    const dz = new Set(wybrane('dzialy'));
    const widziane = new Set();
    const osoby = [];
    for (const d of dzialyKontraktu()) {
      if (!dz.has(d.kod)) continue;
      for (const [id, n] of P.osobyDzialu(d.kod)) if (!widziane.has(id)) { widziane.add(id); osoby.push([id, n]); }
    }
    $('stale-osoby').innerHTML = osoby.map(([id, n]) => `<label class="zaznacz"><input type="checkbox" name="osoby" value="${esc(id)}" ${zaznaczone.includes(id) ? 'checked' : ''}> ${esc(n)}${
      Hala.naUrlopie(hala.slowniki, id, dzis()) ? ' <span class="slaby">(urlop)</span>' : ''}</label>`).join('')
      || '<span class="slaby">W zaznaczonych działach nikt nie ma konta.</span>';
  }

  /* Mini-kalendarz w oknie: dni zlecenia (●), pominięte (przekreślone, z powodem), święta; dotknięcie przełącza dzień. */
  function rysujKalendarz(wartosc) {
    const h = wartosc ? wartosc.harmonogram : null;
    const pk = W.podgladKalendarza(h && h.rodzaj !== 'reczny' ? h : null, kal.rok, kal.miesiac, dzis());
    $('stale-kal-tytul').textContent = pk.tytul;
    $('stale-kal-siatka').innerHTML = W.DNI_NAZWY.map(n => `<span class="kal-naglowek" aria-hidden="true">${esc(n.slice(0, 2))}</span>`).join('')
      + pk.dni.map(c => `<button type="button" class="kal-dzien-m${c.wMiesiacu ? '' : ' poza'}${c.jest ? ' jest' : ''}${c.pominiety ? ' pominiety' : ''}${c.swieto ? ' swieto' : ''}${c.dzis ? ' dzis' : ''}${c.przeszly ? ' przeszly' : ''}"
          data-data="${c.data}" aria-pressed="${c.jest}" title="${esc(c.pominiety ? `${c.data}: ${c.pominiety}` : c.swieto ? `${c.data}: ${c.swieto}` : c.data)}">${c.dzien}</button>`).join('');
    const r = f.rodzaj.value;
    $('stale-kal-opis').textContent = r === 'reczny' ? 'Ręczne zlecasz sam — kalendarz nie dotyczy.'
      : r === 'daty' ? 'Dotknij dni, w które ma być zlecenie (dotknij jeszcze raz, żeby zabrać).'
        : 'Dotknij dnia, żeby go pominąć (np. przestój) — dotknij jeszcze raz, żeby przywrócić.';
    $('stale-kalendarz').classList.toggle('wylaczony', r === 'reczny');
  }

  /* Chipy: pola wyboru wyglądają jak przyciski (CSS .stale-chipy), a odczyt zostaje przez name — jak dotąd. */
  const chip = (nazwa, wartosc, tekst, zaznaczone, typ = 'checkbox', title = '') =>
    `<label class="zaznacz"${title ? ` title="${esc(title)}"` : ''}><input type="${typ}" name="${nazwa}" value="${esc(wartosc)}" ${zaznaczone ? 'checked' : ''}> <span>${tekst}</span></label>`;

  /* Wiersz na każdy zaznaczony dzień: które zmiany pracują w ten dzień (kto nie ma wpisu, dostaje bieżącą listę zmian). */
  function rysujMacierz() {
    const dni = wybrane('dni').map(Number).sort((a, b) => a - b);
    for (const d of dni) if (!wgDni.macierz[d]) wgDni.macierz[d] = wybrane('zmiany');
    const pole = $('stale-zmiany-dni');
    // Te same dni: przestawiamy tylko zaznaczenia — przerysowanie w trakcie kliknięcia gubiło chip i fokus.
    if (pole.dataset.dni === dni.join()) {
      for (const x of pole.querySelectorAll('input')) { const [d, k] = x.value.split(':'); x.checked = wgDni.macierz[d].includes(k); }
      return;
    }
    pole.dataset.dni = dni.join();
    pole.innerHTML = `<p class="slaby konto-drobne">Zmiany w każdy dzień (każda zaznaczona dostaje własne zlecenie):</p>`
      + dni.map(d => `<div class="stale-wiersz-dnia"><b title="${esc(W.DNI_NAZWY[d - 1])}">${SKROTY_DNI[d - 1]}</b><div class="stale-chipy">${
        Object.entries(zmianySlownik()).map(([k, z]) => chip('zmiana_dnia', `${d}:${k}`, esc(z.nazwa || k), wgDni.macierz[d].includes(k))).join('')}</div></div>`).join('');
  }
  function przelaczWgDni(wlacz) {
    if (wlacz === wgDni.aktywne) return;
    delete $('stale-zmiany-dni').dataset.dni;
    if (wlacz) { wgDni.macierz = {}; wgDni.aktywne = true; return; }
    // Wyłączenie wraca do jednej listy zmian: najczęstszej (tej, którą dostają dni bez wyjątku).
    const baza = W.zmianyDniZMacierzy(wgDni.macierz, wybrane('dni')).zmiany;
    for (const x of f.querySelectorAll('input[name="zmiany"]')) x.checked = baza.includes(x.value);
    wgDni.aktywne = false; wgDni.macierz = {};
  }

  /* Opis tego, co robi okno, nad formularzem: dwie drogi „Zmień” mają różny skutek. */
  function opisTrybu() {
    if (instancja) return 'Zmieniasz dzisiejsze zlecenie — zmiana zapisze się też w zapisanym zleceniu, więc kolejne zlecenia będą już ze zmianą.';
    if (edytowanyKod) return 'Zmieniasz wzorzec — dotyczy kolejnych zleceń. Trwające dostaną nową treść i pozycje, a dni i godziny dopiero od następnych.';
    return '';
  }

  /* Pokaż tylko pola pasujące do wyborów, podgląd dni i „Trafi do …” — kierownik od razu widzi, kiedy i komu hub zleci. */
  function odswiez() {
    const lista = f.jako_checklista.checked;
    $('stale-pozycje-pole').hidden = !lista;
    $('stale-wymagania').hidden = $('stale-maszyny').hidden = lista;
    $('stale-instancja').hidden = !instancja;
    for (const id of ['stale-dla', 'stale-kiedy', 'stale-zaawansowane']) $(id).hidden = !!instancja;
    $('stale-jako-checklista').hidden = !!instancja || !edytowanyKod;
    $('stale-tryb').textContent = opisTrybu();
    $('stale-tryb').hidden = !opisTrybu();
    if (instancja) {
      // Trwające zlecenie: bez harmonogramu i adresatów — tylko to, co da się poprawić w już zleconym.
      $('inst-wzorzec').hidden = !(instancja.kod && ((hala.slowniki || {}).zlecenia_stale || {})[instancja.kod] && P.mozeZapisacStale());
      $('stale-podsumowanie').textContent = '';
      ped.odswiez();
      P.pokazSkan(f);
      return;
    }
    const r = f.rodzaj.value, t = f.termin_rodzaj.value;
    $('stale-dni-pole').hidden = r !== 'dni_tygodnia';
    $('stale-co-tygodni').hidden = r !== 'dni_tygodnia';
    $('stale-dzien').hidden = !(r === 'miesiecznie' && (f.querySelector('input[name="mies_tryb"]:checked') || {}).value !== 'tydzien');
    $('stale-mies').hidden = r !== 'miesiecznie';
    $('stale-co-dni').hidden = r !== 'co_dni';
    $('stale-zakres').hidden = $('stale-swieta').hidden = r === 'reczny' || r === 'daty';
    $('stale-wg-dni-pole').hidden = !(wgDni.dostepne && r === 'dni_tygodnia');
    $('stale-wg-dni').setAttribute('aria-pressed', String(wgDni.aktywne));
    $('stale-zmiany').hidden = $('stale-zmiany-opis').hidden = r === 'reczny' || wgDni.aktywne;
    $('stale-zmiany-dni').hidden = r !== 'dni_tygodnia' || !wgDni.aktywne;
    $('stale-co').hidden = r === 'reczny';
    if (wgDni.aktywne && r === 'dni_tygodnia') rysujMacierz();
    // Kalendarz stoi pod „Kiedy” tylko przy „w dni wybrane w kalendarzu”; w pozostałych rodzajach — w Zaawansowane (pominięte dni).
    const miejsce = $(r === 'daty' ? 'stale-kal-kiedy' : 'stale-kal-zaaw');
    if ($('stale-kalendarz').parentNode !== miejsce) miejsce.appendChild($('stale-kalendarz'));
    $('stale-osoby').hidden = (f.querySelector('input[name="kto"]:checked') || {}).value !== 'osoby';
    P.pokazSkan(f);
    $('stale-godzina').hidden = t !== 'godzina';
    $('stale-minuty').hidden = t !== 'minuty';
    $('stale-okno-godzina').hidden = f.okno_rodzaj.value !== 'godzina';
    $('stale-okno-minuty').hidden = f.okno_rodzaj.value !== 'minuty';
    const w = W.stalyZFormularza(pola(), hala.slowniki, edytowanyKod, hala.pracownik && hala.pracownik.id);
    const a = W.adresaciPoLudzku(w.wartosc, hala.kontrakt.stale, hala.pracownicy, hala.slowniki, dzis());
    $('stale-adresaci').textContent = a.tekst;
    $('stale-adresaci').classList.toggle('blad-tekst', !!a.alarm);
    let podglad = '', najblizsze = '';
    if (!w.bledy.length) {
      podglad = W.harmonogramPoLudzku(w.wartosc, hala.slowniki);
      if (r !== 'reczny' && w.wartosc.aktywny) {
        const n = W.najblizszeWystapienia(w.kod, w.wartosc, hala.teraz(), hala.slowniki, 6);
        najblizsze = n.terminy.length ? `Najbliższe: ${n.terminy.map(x => x.opis).join(' · ')}` : 'Brak terminów w najbliższych trzech miesiącach — sprawdź dni i daty.';
        if (n.pominiete.length) najblizsze += ` — pominięte: ${n.pominiete.slice(0, 3).map(x => x.opis).join(', ')}`;
      }
    }
    $('stale-najblizsze').textContent = najblizsze;
    // Jedno zdanie „kto · kiedy · ile pozycji” — w stopce okna, a w kreatorze jako ostatni krok „Sprawdź i zapisz”.
    const dla = W.dlaKogoPoLudzku(w.wartosc, hala.kontrakt.stale, hala.pracownicy);
    const pozycji = lista ? ile(w.wartosc.pozycje ? w.wartosc.pozycje.length : 0, 'pozycja', 'pozycje', 'pozycji') : '';
    $('stale-podsumowanie').textContent = [dla, podglad, pozycji].filter(Boolean).join(' · ');
    $('stale-sprawdz').innerHTML = [['Nazwa', f.tytul.value.trim()], ['Dla kogo', dla], ['Kiedy', podglad], ['Pozycje', pozycji], ['Najbliższe', najblizsze.replace(/^Najbliższe: /, '')]]
      .filter(([, v]) => v).map(([k, v]) => `<li><b>${k}</b> ${esc(v)}</li>`).join('');
    rysujKalendarz(w.wartosc);
    ped.odswiez();
  }

  function ustawKrok(n) {
    krok = n;
    f.classList.toggle('kreator', kreator);
    for (const el of f.querySelectorAll('[data-krok]')) el.classList.toggle('krok-aktywny', !kreator || +el.dataset.krok === krok);
    $('stale-krok-naglowek').hidden = !kreator;
    $('stale-krok-naglowek').textContent = `Krok ${krok} z ${KROKI.length}: ${KROKI[krok - 1]}`;
    $('stale-sprawdz').hidden = !(kreator && krok === KROKI.length);
    f.querySelector('[data-krok-wstecz]').hidden = !kreator || krok === 1;
    f.querySelector('[data-krok-dalej]').hidden = !kreator || krok === KROKI.length;
    f.querySelector('button[type="submit"]').hidden = kreator && krok !== KROKI.length;
  }
  function pokazBlad(tekst) { const b = f.querySelector('.blad'); b.textContent = tekst; b.hidden = !tekst; }
  /* „Dalej” nie przepuszcza pustej nazwy i checklisty bez pozycji — reszta błędów wychodzi przy zapisie, jak na komputerze. */
  function dalej() {
    if (krok === 1 && !f.tytul.value.trim()) { pokazBlad(f.jako_checklista.checked ? 'Nazwij checklistę.' : 'Napisz, co zrobić.'); f.tytul.focus(); return; }
    if (krok === 3 && f.jako_checklista.checked && !ped.odczytaj().some(p => String(p.nazwa || '').trim())) { pokazBlad('Dodaj co najmniej jedną pozycję — co trzeba zrobić.'); return; }
    pokazBlad('');
    ustawKrok(Math.min(krok + 1, KROKI.length));
    odswiez();
  }

  function ustawMiesiac(data) {
    const m = /^(\d{4})-(\d{2})/.exec(data || dzis());
    kal.rok = +m[1]; kal.miesiac = +m[2];
  }

  function otworz(wartosci, kod, tytulOkna, poZapisieFn, inst) {
    P.podpowiedziCzynnosci();
    edytowanyKod = kod || null;
    instancja = inst || null;
    poZapisie = poZapisieFn || null;
    zdjeciaZostaja = [];                                     // D91: otworzInstancje wpisze zdjęcia trwającego zlecenia
    f.reset();
    f.querySelector('.blad').hidden = true;
    f.jako_checklista.checked = !!wartosci.checklista;
    $('t-okno-stalego').textContent = tytulOkna || (wartosci.checklista ? (edytowanyKod ? `Checklista: ${wartosci.tytul}` : 'Nowa checklista')
      : edytowanyKod ? `Zapisane zlecenie: ${wartosci.tytul}` : 'Nowe zapisane zlecenie');
    const zapisane = W.zadaniaDoChecklisty(hala.slowniki, edytowanyKod ? [edytowanyKod] : []);
    const z = f.querySelector('[data-z-zapisanych]');
    z.innerHTML = `<option value="">${zapisane.length ? '+ Z zapisanych…' : '+ Z zapisanych — brak'}</option>`
      + zapisane.map(x => `<option value="${esc(x.kod)}">${esc(x.opisWyboru)}</option>`).join('');
    z.disabled = !zapisane.length;
    const dz = (wartosci.dzialy && wartosci.dzialy.length ? wartosci.dzialy : [wartosci.dzial || (dzialyKontraktu()[0] || {}).kod || 'produkcja']);
    $('stale-dzialy').innerHTML = dzialyKontraktu().map(d => chip('dzialy', d.kod, esc(d.nazwa), dz.includes(d.kod))).join('');
    const kto = wartosci.kto || (wartosci.wykonawca ? 'osoby' : 'dzial');
    for (const x of f.querySelectorAll('input[name="kto"]')) x.checked = x.value === kto;
    rysujOsoby(wartosci.wykonawcy && wartosci.wykonawcy.length ? wartosci.wykonawcy : (wartosci.wykonawca ? [wartosci.wykonawca] : []));
    // „— każda —” = jedno zlecenie dla wszystkich liderów; „każda linia osobno” = hub robi po jednym na linię (D34).
    P.pokazPolaLinii(f);
    f.linia.innerHTML = P.opcje([[W.LINIA_KAZDA, '— każda linia osobno —'], ...P.linieLista()], '— każda —');
    f.linia.value = wartosci.linia || '';
    f.linia.disabled = !!instancja;                         // trwającemu zleceniu linii się nie zmienia (tylko lista maszyn z niej)
    // Pozycje dopiero po ustawieniu linii — lista maszyn w pozycji pochodzi z wybranej linii.
    ped.rysuj(wartosci.checklista ? (wartosci.pozycje && wartosci.pozycje.length ? wartosci.pozycje : [{ godzina: '0:30' }, {}]) : []);
    rysujMaszynyStalego(wartosci.maszyny && wartosci.maszyny.length ? wartosci.maszyny : (wartosci.maszyna ? [wartosci.maszyna] : []));
    f.tytul.value = wartosci.tytul || '';
    f.opis.value = wartosci.opis || '';
    f.pilne.checked = !!wartosci.pilne;
    f.wymagaj_zdjecia.checked = !!wartosci.wymagaj_zdjecia;
    f.wymagaj_notatki.checked = !!wartosci.wymagaj_notatki;
    f.wymagaj_skanu.checked = !!wartosci.wymagaj_skanu;
    f.aktywny.checked = wartosci.aktywny !== false;
    // „Codziennie” to dla okna siedem dni tygodnia; przy zapisie siedem dni bez wyjątków wraca do „codziennie” (rodzajPola).
    const codziennie = wartosci.rodzaj === 'codziennie';
    f.rodzaj.value = codziennie ? 'dni_tygodnia' : wartosci.rodzaj || 'reczny';
    f.co_min.value = String(wartosci.co_min || '');
    f.dzien_miesiaca.value = wartosci.dzien_miesiaca || 1;
    f.co.value = wartosci.co || 7;
    f.co_tygodni.value = String(wartosci.co_tygodni || 1);
    for (const x of f.querySelectorAll('input[name="mies_tryb"]')) x.checked = x.value === (wartosci.mies_tryb || 'dzien');
    f.tydzien.value = String(wartosci.tydzien || 1);
    f.dzien_tygodnia.value = String(wartosci.dzien_tygodnia || 1);
    f.od.value = wartosci.od || dzis();
    f.do.value = wartosci.do || '';
    f.bez_swiat.checked = !!wartosci.bez_swiat;
    kal.daty = [...(wartosci.daty || [])];
    kal.pomin = [...(wartosci.pomin || [])];
    ustawMiesiac(kal.daty.filter(d => d >= dzis())[0]);
    f.termin_rodzaj.value = wartosci.termin_rodzaj || 'koniec_zmiany';
    f.godzina.value = wartosci.godzina || '';
    f.minuty.value = wartosci.minuty || 60;
    f.okno_rodzaj.value = wartosci.okno_rodzaj || '';
    f.okno_godzina.value = wartosci.okno_godzina || '';
    f.okno_minuty.value = wartosci.okno_minuty || 60;
    const dni = codziennie ? [1, 2, 3, 4, 5, 6, 7] : (wartosci.dni || []);
    $('stale-dni').innerHTML = SKROTY_DNI.map((n, i) => chip('dni', i + 1, n, dni.includes(i + 1), 'checkbox', W.DNI_NAZWY[i])).join('');
    $('stale-zmiany').innerHTML = Object.entries(zmianySlownik()).map(([k, zm]) =>
      chip('zmiany', k, `${esc(zm.nazwa || k)} <small>${esc(zm.od || '')}</small>`, (wartosci.zmiany || []).includes(k))).join('');
    const wg = wartosci.zmiany_wg_dni || {};
    wgDni.dostepne = wgDniDostepne() || !!Object.keys(wg).length;       // zapisane wyjątki nie giną, nawet gdy serwer ich nie zna
    wgDni.aktywne = !!Object.keys(wg).length;
    wgDni.macierz = {};
    for (const d of wgDni.aktywne ? dni : []) wgDni.macierz[d] = wg[d] || (wartosci.zmiany || []).slice();
    $('stale-wklej').hidden = true;                                      // „Wklej listę” z poprzedniego otwarcia nie wisi w nowym
    $('stale-wklej-tekst').value = '';
    f.querySelector('[data-wklej-liste]').setAttribute('aria-expanded', 'false');
    kreator = window.matchMedia('(max-width: 600px)').matches && !edytowanyKod && !instancja;
    ustawKrok(1);
    odswiez();
    $('okno-stalego').showModal();
    f.tytul.focus();
  }

  $('stale-wg-dni').addEventListener('click', () => { przelaczWgDni(!wgDni.aktywne); odswiez(); });
  // Szybkie „sobota tylko zmiana I”: zaznacza sobotę i zostawia w niej pierwszą zmianę, pozostałe dni bez zmian.
  $('stale-sobota-i').addEventListener('click', () => {
    f.querySelector('input[name="dni"][value="6"]').checked = true;
    przelaczWgDni(true);
    rysujMacierz();
    wgDni.macierz[6] = [Object.keys(zmianySlownik())[0]];
    odswiez();
  });
  $('stale-dni-pole').addEventListener('click', ev => {
    const b = ev.target.closest('[data-dni-gotowe]');
    if (!b) return;
    const ok = b.dataset.dniGotowe === 'robocze' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7];
    for (const x of f.querySelectorAll('input[name="dni"]')) x.checked = ok.includes(+x.value);
    odswiez();
  });
  $('stale-zmiany-dni').addEventListener('input', ev => {
    const [d, k] = ev.target.value.split(':');
    const lista = new Set(wgDni.macierz[d] || []);
    if (ev.target.checked) lista.add(k); else lista.delete(k);
    wgDni.macierz[d] = Object.keys(zmianySlownik()).filter(x => lista.has(x));
  });
  $('stale-wszystkie').addEventListener('click', () => {
    const wszystkie = [...f.querySelectorAll('input[name="dzialy"]')];
    const zaznacz = !wszystkie.every(x => x.checked);
    for (const x of wszystkie) x.checked = zaznacz;
    rysujOsoby(wybrane('osoby'));
    odswiez();
  });
  $('stale-kalendarz').addEventListener('click', ev => {
    const nav = ev.target.closest('[data-mkal]');
    if (nav) {
      const d = new Date(Date.UTC(kal.rok, kal.miesiac - 1 + (+nav.dataset.mkal), 1));
      kal.rok = d.getUTCFullYear(); kal.miesiac = d.getUTCMonth() + 1;
      odswiez();
      return;
    }
    const b = ev.target.closest('[data-data]');
    if (!b || f.rodzaj.value === 'reczny') return;
    const w = W.stalyZFormularza(pola(), hala.slowniki, edytowanyKod, '');
    const h = W.przelaczDzien(Object.assign({}, w.wartosc.harmonogram, { daty: kal.daty, pomin: kal.pomin }), b.dataset.data);
    kal.daty = h.daty || kal.daty;
    kal.pomin = h.pomin || kal.pomin;
    odswiez();
  });

  f.addEventListener('input', odswiez);
  f.addEventListener('change', ev => {
    if (ev.target === f.tytul) {
      // D72: podpowiedź wstawia opis (gdy pusty) i swoje domyślne wymagania — kierownik zmienia je, jak chce.
      const c = instancja || edytowanyKod ? null : W.gotowaCzynnosc(f.tytul.value, hala.slowniki);
      if (c) { if (c.opis && !f.opis.value.trim()) f.opis.value = c.opis; f.wymagaj_zdjecia.checked = !!c.zdjecie; f.wymagaj_notatki.checked = !!c.notatka; }
    }
    if (ev.target.name === 'dzialy') rysujOsoby(wybrane('osoby'));
    if (ev.target === f.linia) rysujMaszynyStalego(wybrane('maszyny_stalego'));
    if (ev.target.name === 'maszyny_stalego') synchMaszynyStalego();
    if (ev.target === f.rodzaj && f.rodzaj.value === 'daty') ustawMiesiac(kal.daty.filter(d => d >= dzis())[0]);
    // Zmiany osobno dla dni mają sens tylko przy dniach tygodnia — inny rytm wraca do jednej listy zmian (ukryta macierz nie wpływa na zapis).
    if (ev.target === f.rodzaj && f.rodzaj.value !== 'dni_tygodnia') przelaczWgDni(false);
    if (ev.target === f.jako_checklista && f.jako_checklista.checked && !ped.odczytaj().length) ped.rysuj([{ godzina: '0:30' }, {}]);
    if (ev.target === f.linia) ped.rysuj(ped.odczytaj());               // maszyny pozycji — z wybranej linii
    odswiez();
  });
  f.addEventListener('click', ev => {
    const m = ev.target.closest('[data-maszyny-stale]');
    if (m) {
      for (const x of f.querySelectorAll('input[name="maszyny_stalego"]')) x.checked = m.dataset.maszynyStale === 'wszystkie';
      synchMaszynyStalego();
      odswiez();
      return;
    }
    if (ev.target.closest('[data-krok-dalej]')) dalej();
    else if (ev.target.closest('[data-krok-wstecz]')) { pokazBlad(''); ustawKrok(krok - 1); odswiez(); }
  });
  // W kreatorze Enter w polu idzie „Dalej”, a nie zapisuje niedokończonego wzorca (pozycje mają własny Enter — checklisty.js).
  f.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && kreator && krok < KROKI.length && ev.target.matches('input:not([type="checkbox"]):not([type="radio"])')) { ev.preventDefault(); dalej(); }
  });
  /* Trwające zlecenie ↔ wzorzec: zmiana jednego idzie do drugiego („zapisuje się to wszędzie”). */
  const zmienione = (dane, d) => ['tytul', 'opis', 'priorytet', 'pozycje', 'wymagaj_zdjecia', 'wymagaj_notatki', 'wymagaj_skanu', 'maszyna', 'maszyny']
    .some(k => dane[k] !== undefined && JSON.stringify(dane[k] === '' ? null : dane[k]) !== JSON.stringify(d[k] === '' || d[k] === undefined ? null : d[k]));
  /* Do trwających zleceń z wzorca idzie tylko to, co różni NOWY wzorzec od DAWNEGO (nie „czym zlecenie różni się od wzorca”) —
     ręczna poprawka dzisiejszego zlecenia nie ginie, gdy ktoś zmieni we wzorcu sam harmonogram. Błąd jednego zlecenia nie przerywa
     reszty. Zwraca { ile, bledy }. */
  async function przepiszDoTrwajacych(kod, wartosc, dawny, bezId) {
    const rowne = (a, b) => JSON.stringify(a === undefined || a === '' ? null : a) === JSON.stringify(b === undefined || b === '' ? null : b);
    const inne = k => !dawny || !rowne(dawny[k], wartosc[k]);
    const wynik = { ile: 0, bledy: [] };
    for (const z of W.instancjeWzorca(hala.obiekty('zlecenie'), kod)) {
      if (z.id === bezId) continue;
      const dane = {};
      for (const k of ['tytul', 'opis', 'priorytet']) if (inne(k)) dane[k] = k === 'priorytet' ? (wartosc.priorytet || 'normalny') : (wartosc[k] || null);
      if (Array.isArray(wartosc.pozycje)) { if (inne('pozycje')) dane.pozycje = W.pozycjeDlaInstancji(wartosc.pozycje, z.dane); }
      else {
        for (const k of ['wymagaj_zdjecia', 'wymagaj_notatki', 'wymagaj_skanu']) if (inne(k)) dane[k] = !!wartosc[k];
        if (inne('maszyna') || inne('maszyny')) {
          dane.maszyna = wartosc.maszyna || null;
          dane.maszyny = Array.isArray(wartosc.maszyny) && wartosc.maszyny.length > 1 ? wartosc.maszyny : null;
        }
      }
      if (!Object.keys(dane).length || !zmienione(dane, z.dane || {})) continue;
      try { await hala.zapisz('zlecenie.edytowane', z.id, dane); wynik.ile++; }
      catch (e) { wynik.bledy.push(`${z.numer || z.id.slice(0, 8)}: ${P.komunikatBledu(e)}`); }
    }
    return wynik;
  }
  /* Wspólne zadanie (2026-10-27): zmiana nazwy, opisu, wymagań albo maszyn w zapisanym zleceniu idzie do pozycji checklist,
     które z niego powstały (z_kodu albo, w starych checklistach, ta sama nazwa) — i odwrotnie: zmiana takiej pozycji w checkliście
     idzie do zapisanego zlecenia, a stąd do pozostałych checklist. Idą tylko pola zmienione w tej edycji. Trwające zlecenia też. */
  async function synchronizujPowiazane(kod, wartosc, dawny, bezKod) {
    const wynik = { ile: 0, bledy: [] };
    if (!dawny) return wynik;
    const sl = (hala.slowniki || {}).zlecenia_stale || {};
    const lista = x => Array.isArray(x && x.pozycje) && x.pozycje.length > 0;
    const zapisz = (k, w) => hala.zapisz('slownik.zapisany', `zlecenia_stale/${k}`, { slownik: 'zlecenia_stale', klucz: k, wartosc: w });
    const blad = (k, e) => wynik.bledy.push(`${(sl[k] || {}).tytul || k}: ${P.komunikatBledu(e)}`);
    if (lista(wartosc)) {
      const stare = new Map((dawny.pozycje || []).map(p => [p.id, p]));
      for (const p of wartosc.pozycje) {
        const zrodlo = p.z_kodu && p.z_kodu !== kod ? sl[p.z_kodu] : null;
        const st = stare.get(p.id);
        if (!zrodlo || lista(zrodlo) || !st || st.z_kodu !== p.z_kodu) continue;
        const zm = W.zmianyPowiazane(st, p);
        if (!Object.keys(zm).length) continue;
        const nowy = W.zastosujPowiazane(zrodlo, zm, false);
        try {
          await zapisz(p.z_kodu, nowy); wynik.ile++;
          await przepiszDoTrwajacych(p.z_kodu, nowy, zrodlo, null);
          const r = await synchronizujPowiazane(p.z_kodu, nowy, zrodlo, kod);
          wynik.ile += r.ile; wynik.bledy.push(...r.bledy);
        } catch (e) { blad(p.z_kodu, e); }
      }
      return wynik;
    }
    const zm = W.zmianyPowiazane(dawny, wartosc);
    if (!Object.keys(zm).length) return wynik;
    const staraNazwa = W.nazwaPorownawcza(dawny.tytul);
    const jedyny = Object.values(sl).filter(x => x && !lista(x) && W.nazwaPorownawcza(x.tytul) === staraNazwa).length === 1;
    for (const [k, c] of Object.entries(sl)) {
      if (k === kod || k === bezKod || !lista(c)) continue;
      let zmieniona = false;
      const pozycje = c.pozycje.map(p => {
        if (!(p.z_kodu === kod || (!p.z_kodu && jedyny && W.nazwaPorownawcza(p.nazwa) === staraNazwa))) return p;
        zmieniona = true;
        return Object.assign(W.zastosujPowiazane(p, zm, true), { z_kodu: kod });
      });
      if (!zmieniona) continue;
      const nowa = Object.assign({}, c, { pozycje });
      try { await zapisz(k, nowa); wynik.ile++; await przepiszDoTrwajacych(k, nowa, c, null); } catch (e) { blad(k, e); }
    }
    return wynik;
  }
  const ile = (n, jedno, kilka, wiele) => `${n} ${n === 1 ? jedno : (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? kilka : wiele}`;

  async function zapiszInstancje(blad) {
    const d = instancja.d;
    const pola0 = { tytul: f.tytul.value, opis: f.opis.value, pilne: f.pilne.checked,
                    termin: f.inst_termin.value === instancja.terminPole ? undefined : f.inst_termin.value,
                    od: f.inst_od.value === instancja.odPole ? undefined : f.inst_od.value,
                    checklista: Array.isArray(d.pozycje) && d.pozycje.length > 0, pozycje: ped.odczytaj(),
                    wymagaj_zdjecia: f.wymagaj_zdjecia.checked, wymagaj_notatki: f.wymagaj_notatki.checked, wymagaj_skanu: f.wymagaj_skanu.checked,
                    maszyny: wybrane('maszyny_stalego') };
    const r = W.zlecenieEdytowane(pola0, d);
    if (r.bledy.length) { blad.textContent = r.bledy.join(' '); blad.hidden = false; return; }
    // D91: zdjęcia — najpierw pliki do kolejki (hala.dodajPlik), potem pełna lista w tym samym zdarzeniu edycji.
    const noweIds = P.zdjeciaPola ? await P.zdjeciaPola(f.inst_zdjecie) : [];
    const zd = W.zdjeciaEdycji(d.zdjecia, zdjeciaZostaja, noweIds, maksZdjec);
    if (zd.bledy.length) { blad.textContent = zd.bledy.join(' '); blad.hidden = false; return; }
    if (zd.zdjecia !== undefined) r.dane.zdjecia = zd.zdjecia;
    await hala.zapisz('zlecenie.edytowane', instancja.id, r.dane);
    const wzorzec = instancja.kod && ((hala.slowniki || {}).zlecenia_stale || {})[instancja.kod];
    const dowzorca = !!wzorzec && !$('inst-wzorzec').hidden;      // właściciel 2026-11-23: zmiana z checklisty zawsze zapisuje się też w zapisanej
    let reszta = { ile: 0, bledy: [] };
    if (dowzorca) {
      const nowy = W.wzorzecZInstancji(wzorzec, r.dane, hala.pracownik.id);
      try {
        await hala.zapisz('slownik.zapisany', `zlecenia_stale/${instancja.kod}`, { slownik: 'zlecenia_stale', klucz: instancja.kod, wartosc: nowy });
        // Pozostałe trwające zlecenia z tego wzorca (np. inne zmiany) dostają to samo.
        reszta = await przepiszDoTrwajacych(instancja.kod, nowy, wzorzec, instancja.id);
      } catch (e) {
        $('okno-stalego').close(); instancja = null;
        P.komunikat(`Zlecenie poprawione, ale zapisanego zlecenia nie udało się poprawić: ${P.komunikatBledu(e)}`, 'uwaga');
        return;
      }
    }
    $('okno-stalego').close();
    instancja = null;
    P.komunikat(`Zlecenie poprawione${dowzorca ? ' — także w zapisanym zleceniu' : ''}${reszta.ile ? ` i w ${ile(reszta.ile, 'innym trwającym', 'innych trwających', 'innych trwających')}` : ''}${
      reszta.bledy.length ? `. Nie udało się: ${reszta.bledy.join('; ')}` : ''}`, reszta.bledy.length ? 'uwaga' : 'ok');
  }

  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const blad = f.querySelector('.blad');
    if (instancja) {
      try { await zapiszInstancje(blad); } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
      return;
    }
    const w = W.stalyZFormularza(pola(), hala.slowniki, edytowanyKod, hala.pracownik.id);
    if (w.bledy.length) { blad.textContent = w.bledy.join(' '); blad.hidden = false; return; }
    // „Zmień” nie może zgubić tego, czego okno nie pokazuje (stara czynność — D56, D72; audyt 2026-10-16). Maszyny okno
    // pokazuje od 2026-10-26, więc zapisuje je samo (zdjęcie wszystkich z listy = brak listy).
    const dawny = edytowanyKod && ((hala.slowniki || {}).zlecenia_stale || {})[edytowanyKod];
    if (dawny) for (const pole of ['czynnosc']) if (dawny[pole] !== undefined && w.wartosc[pole] === undefined) w.wartosc[pole] = dawny[pole];
    try {
      await hala.zapisz('slownik.zapisany', `zlecenia_stale/${w.kod}`, { slownik: 'zlecenia_stale', klucz: w.kod, wartosc: w.wartosc });
      if (poZapisie) { const fn = poZapisie; poZapisie = null; await fn(w.kod); }
      // Zmiana wzorca idzie też do trwających zleceń z niego (nowe, przyjęte) — treść, opis, pozycje; odhaczenia zostają.
      const trwajace = edytowanyKod ? await przepiszDoTrwajacych(w.kod, w.wartosc, dawny, null) : { ile: 0, bledy: [] };
      const wspolne = edytowanyKod ? await synchronizujPowiazane(w.kod, w.wartosc, dawny, null) : { ile: 0, bledy: [] };
      $('okno-stalego').close();
      P.komunikat((w.wartosc.harmonogram.rodzaj === 'reczny' ? 'Zapisano — zlecasz je przyciskiem „Zleć teraz”'
        : 'Zapisano — serwer sam zleci je według harmonogramu') + (trwajace.ile ? ` · poprawione też trwające: ${trwajace.ile}` : '') + (wspolne.ile ? ` · ta sama pozycja poprawiona też w ${wspolne.ile} zapisanych` : '')
        + (wspolne.bledy.length ? `. Nie udało się poprawić powiązanych: ${wspolne.bledy.join('; ')}` : '')
        + (trwajace.bledy.length ? `. Nie udało się poprawić trwających: ${trwajace.bledy.join('; ')}` : ''), trwajace.bledy.length ? 'uwaga' : 'ok');
      P.pokazZlecenia(null, 'stale');
    } catch (e) { blad.textContent = P.komunikatBledu(e); blad.hidden = false; }
  });

  /* „+ Nowe”: jedno wejście, wybór — checklista albo zwykłe zapisane zlecenie. */
  const menuNowe = otwarte => { $('nowe-menu-lista').hidden = !otwarte; $('nowe-stale').setAttribute('aria-expanded', String(otwarte)); };
  $('nowe-stale').addEventListener('click', ev => {
    ev.stopPropagation();
    menuNowe($('nowe-menu-lista').hidden);
    if (!$('nowe-menu-lista').hidden) $('nowa-checklista-zlecen').focus();
  });
  document.addEventListener('click', () => menuNowe(false));
  $('nowe-menu').addEventListener('keydown', ev => { if (ev.key === 'Escape') { menuNowe(false); $('nowe-stale').focus(); } });
  $('nowe-zapisane-zlecenie').addEventListener('click', () => otworz({ dzial: (dzialyKontraktu()[0] || {}).kod || 'produkcja', rodzaj: 'reczny', dni: [1, 2, 3, 4, 5], zmiany: [],
                                                                       termin_rodzaj: 'koniec_zmiany', wymagaj_zdjecia: true, wymagaj_notatki: true,
                                                                       bez_swiat: true, aktywny: true }));

  $('lista-stalych').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    const kod = b.closest('[data-kod]').dataset.kod;
    const s = ((hala.slowniki || {}).zlecenia_stale || {})[kod];
    if (!s) return;
    if (b.dataset.akcja === 'wiecej') { if (wiecejStale.has(kod)) wiecejStale.delete(kod); else wiecejStale.add(kod); if (ostatnieD) rysuj(ostatnieD); return; }
    wiecejStale.delete(kod);
    try {
      if (b.dataset.akcja === 'kody-qr') {
        const p = window.PanelEtykiety.punktySkanu(hala.slowniki).find(x => x.zrodlo === 'zapisane' && x.kod === kod);
        if (p) await window.PanelEtykiety.drukuj(p.etykiety, `Kody QR — ${s.tytul || kod}`);
        return;
      }
      // 2026-10-27: checklista i zwykłe zapisane w jednym oknie (pozycje są w oknie, gdy to checklista).
      const lista = Array.isArray(s.pozycje) && s.pozycje.length > 0;
      if (b.dataset.akcja === 'automat') {
        if (!(await P.potwierdz('Włączyć automat?', `„${s.tytul}” będzie się zlecać codziennie na każdą zmianę, bez klikania. Dni i zmiany zawęzisz przyciskiem „Zmień”.`, 'Włącz'))) return;
        await hala.zapisz('slownik.zapisany', `zlecenia_stale/${kod}`, { slownik: 'zlecenia_stale', klucz: kod, wartosc: W.automatDlaStalego(s, hala.slowniki, hala.pracownik.id) });
        P.komunikat('Automat włączony — serwer sam zleci ją na każdą zmianę', 'ok');
        return;
      }
      // D104: „Zleć teraz” dla działu z własnymi zmianami (Magazyn) — bieżąca zmiana wg jego godzin, nie zakładu.
      const zmianaStalego = st => (st.dzial && Hala.zmianyDzialu(hala.slowniki, st.dzial) && Hala.zmianaDzialu(hala.teraz(), hala.slowniki, st.dzial)) || hala.zmianaTeraz();
      if (b.dataset.akcja === 'zlec') {
        // „Zleć teraz” robi nowe zlecenie obok tego, które zlecił automat — pytamy, zanim je podwoi.
        const juz = W.juzZleconeNaZmianie(kod, hala.obiekty('zlecenie'), zmianaStalego(s), hala.teraz());
        if (juz && !(await P.potwierdz('Już zlecone na tej zmianie', `„${s.tytul}” jest już zlecone (${juz.numer || 'w toku'}). Zlecić jeszcze raz?`, 'Zleć jeszcze raz'))) return;
      }
      if (b.dataset.akcja === 'zmien') otworz(W.stalyDoFormularza(s), kod);
      if (b.dataset.akcja === 'duplikuj') otworzDuplikat(kod, s, lista);
      if (b.dataset.akcja === 'pomin-dzis') {
        const h = W.przelaczDzien(Object.assign({}, s.harmonogram), dzis());
        // Autor = kto zapisuje: od teraz hub zleca w imieniu tej osoby (kontrakt — hub to sprawdza), jak „Wstrzymaj”.
        await hala.zapisz('slownik.zapisany', `zlecenia_stale/${kod}`, { slownik: 'zlecenia_stale', klucz: kod, wartosc: Object.assign({}, s, { harmonogram: h, autor: hala.pracownik.id }) });
        P.komunikat((h.pomin || []).includes(dzis()) ? `„${s.tytul}” pominięta dzisiaj — już zlecone dziś zlecenia zostają, kolejne dni bez zmian` : `„${s.tytul}” znowu zleci się dzisiaj`, 'ok');
      }
      if (b.dataset.akcja === 'zlec' && W.wieluAdresatow(s)) {
        // D71: wiele adresatów — każdy dostaje własne zlecenie od razu (jak w harmonogramie), po potwierdzeniu liczby.
        const cele = Hala.celeStalego(s, (hala.kontrakt.stale || {}).dzialy || [], hala.pracownicy || [], hala.slowniki || {}, dzis());
        if (!cele.length) { P.komunikat('Nikt nie dostanie tego zlecenia — zaznacz osoby albo sprawdź urlopy.', 'blad'); return; }
        const n = cele.length;
        if (!(await P.potwierdz('Zlecić teraz?', `„${s.tytul}” — ${ile(n, 'zlecenie', 'zlecenia', 'zleceń')}, każdy adresat dostaje własne.`, 'Zleć'))) return;
        const zmiana = zmianaStalego(s), teraz = hala.teraz();
        for (const dane of W.zleceniaTeraz(kod, s, cele, zmiana, teraz, W.terminTeraz(s, zmiana, teraz))) {
          // D76: „Zleć teraz” kierownika zakładu dla UR/KJ bez osoby — jak „Nowe zlecenie”: do kierownika działu.
          if (Hala.doKierownika(dane, hala.pracownik.role, (hala.kontrakt.stale || {}).dzialy || [])) dane.do_kierownika = true;
          await hala.zapisz('zlecenie.utworzone', hala.nowyId(), dane);
        }
        P.komunikat(`Zlecone: ${s.tytul} — ${ile(n, 'zlecenie', 'zlecenia', 'zleceń')}`, 'ok');
      } else if (b.dataset.akcja === 'zlec' && lista) {
        // Zlecenie z pozycjami od razu — okno „Nowe zlecenie” nie ma pozycji.
        const dane = W.checklistaTeraz(kod, s, zmianaStalego(s), hala.teraz(), W.terminTeraz(s, zmianaStalego(s), hala.teraz()));
        // D76 / P18: checklista od kierownika zakładu dla UR/KJ bez osoby — jak harmonogram huba: do kierownika działu.
        const doKier = Hala.doKierownika(dane, hala.pracownik.role, (hala.kontrakt.stale || {}).dzialy || []);
        if (doKier) dane.do_kierownika = true;
        await hala.zapisz('zlecenie.utworzone', hala.nowyId(), dane);
        P.komunikat(`Zlecone: ${s.tytul} — ${doKier ? 'kierownik działu dostał checklistę' : 'dział dostał checklistę'}`, 'ok');
      } else if (b.dataset.akcja === 'zlec') {
        P.noweZlecenie(W.zlecenieZeStalego(kod, s, W.terminTeraz(s, zmianaStalego(s), hala.teraz())));
      }
      if (b.dataset.akcja === 'wstrzymaj') {
        // Autor = kto zapisuje: od teraz hub zleca w imieniu tej osoby (kontrakt — hub to sprawdza).
        const wartosc = Object.assign({}, s, { aktywny: s.aktywny === false, autor: hala.pracownik.id });
        await hala.zapisz('slownik.zapisany', `zlecenia_stale/${kod}`, { slownik: 'zlecenia_stale', klucz: kod, wartosc });
        P.komunikat(wartosc.aktywny ? 'Wznowione' : 'Wstrzymane — serwer nie będzie go zlecał', 'ok');
      }
      if (b.dataset.akcja === 'usun') {
        if (!(await P.potwierdz('Usunąć zapisane zlecenie?', `„${s.tytul}”. Zlecenia zrobione z niego zostają nietknięte.`, 'Usuń'))) return;
        await hala.zapisz('slownik.usuniety', `zlecenia_stale/${kod}`, { slownik: 'zlecenia_stale', klucz: kod });
        P.komunikat('Usunięto', 'ok');
      }
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });

  /* „Zapisz jako stałe” przy zwykłym zleceniu (jak „Zapisz jako szablon” w GK Trasy). */
  function zZlecenia(z) {
    if (!z) return;
    otworz(W.stalyZZlecenia(z), null, 'Zapisz zlecenie');
  }

  // Nowa checklista: domyślnie sama zleca się od poniedziałku do soboty na wszystkie zmiany (właściciel 2026-10-27: „nie chcę
  // codziennie klikać ZLEĆ”) — kierownik zawęża dni i zmiany w tym samym oknie.
  // Dla kogo (właściciel 2026-11-16): domyślnie dwa działy — Lider i Mistrzowie — i „Dział — zrobi jedna osoba”: jedno zlecenie
  // na zmianę na dział, bierze je ten, kto jest na zmianie. Dział, którego kierownik nie może zlecać, odpada z domyślnych.
  $('nowa-checklista-zlecen').addEventListener('click', () => otworz({
    checklista: true, dzial: (dzialyKontraktu()[0] || {}).kod || 'produkcja',
    dzialy: W.DZIALY_NOWEJ_CHECKLISTY.filter(k => dzialyKontraktu().some(d => d.kod === k)), kto: 'dzial', linia: W.LINIA_KAZDA, rodzaj: 'dni_tygodnia', dni: [1, 2, 3, 4, 5, 6],
    zmiany: Object.keys(zmianySlownik()), termin_rodzaj: 'koniec_zmiany', wymagaj_zdjecia: false, wymagaj_notatki: false, bez_swiat: false,
    aktywny: true, pozycje: [{ godzina: '0:30' }, {}] }, null, 'Nowa checklista'));

  /* D71: „Zmień” z kalendarza Zleceń — to samo okno co na liście (checklista — swoje). */
  function otworzKod(kod) {
    const s = ((hala.slowniki || {}).zlecenia_stale || {})[kod];
    if (!s) return;
    otworz(W.stalyDoFormularza(s), kod);
  }

  /* Trwające zlecenie albo checklista do poprawienia (Zlecenia → ✎ Zmień): to samo okno bez harmonogramu i adresatów;
     „Zapisz też w wzorcu” przepisuje zmianę do zapisanego, z którego zlecenie powstało. z = obiekt zlecenia z huba. */
  function otworzInstancje(z) {
    if (!z) { P.komunikat('Tego zlecenia już nie ma na liście — odśwież.', 'uwaga'); return; }
    const d = z.dane || {};
    const lista = Array.isArray(d.pozycje) && d.pozycje.length > 0;
    const maszyny = Array.isArray(d.maszyny) && d.maszyny.length ? d.maszyny : (d.maszyna ? [d.maszyna] : []);
    otworz({ tytul: d.tytul || '', opis: d.opis || '', dzial: d.dzial, linia: d.linia || '', maszyny, maszyna: d.maszyna || '', pilne: d.priorytet === 'pilne',
             wymagaj_zdjecia: d.wymagaj_zdjecia === true, wymagaj_notatki: d.wymagaj_notatki === true, wymagaj_skanu: d.wymagaj_skanu === true,
             checklista: lista, rodzaj: 'reczny', zmiany: [], termin_rodzaj: 'koniec_zmiany', aktywny: true,
             pozycje: (d.pozycje || []).map(p => Object.assign(W.stalyDoFormularza({ pozycje: [p] }).pozycje[0], { godzina: '', od: '', termin_iso: p.termin || '', od_iso: p.od || '' })) },
          null, `${lista ? 'Checklista' : 'Zlecenie'} (trwa): ${d.tytul || ''}`, null,
          { id: z.id, kod: d.stale || null, d, terminPole: d.termin ? W.poleCzasu(Date.parse(d.termin)) : '', odPole: d.od ? W.poleCzasu(Date.parse(d.od)) : '' });
    f.inst_termin.value = instancja.terminPole;
    f.inst_od.value = instancja.odPole;
    zdjeciaZostaja = [].concat(d.zdjecia || []).filter(x => typeof x === 'string');
    rysujZdjeciaZlecenia();
    pokazNowe();
    odswiez();
  }

  /* „Duplikuj…”: wybór zmian i działów, potem okno z kopią (nazwa „… (kopia)”, pozycje bez odhaczeń) do sprawdzenia i zapisu. */
  const fd = $('formularz-duplikatu');
  function otworzDuplikat(kod, s, lista) {
    const h = s.harmonogram || {}, reczny = (h.rodzaj || 'reczny') === 'reczny';
    const dz = new Set(Array.isArray(s.dzialy) && s.dzialy.length ? s.dzialy : [s.dzial]);
    $('duplikat-nazwa').textContent = `„${s.tytul}” — kopia z wybraną zmianą i działem. Zanim ją zapiszesz, możesz jeszcze wszystko poprawić.`;
    fd.dataset.kod = kod;
    fd.dataset.lista = lista ? '1' : '';
    fd.querySelector('fieldset:nth-of-type(1)').hidden = reczny;           // zlecane ręcznie nie mają zmian
    $('duplikat-zmiany').innerHTML = Object.entries(zmianySlownik()).map(([k, z]) => chip('dup_zmiany', k, esc(z.nazwa || k), (h.zmiany || []).includes(k))).join('');
    $('duplikat-dzialy').innerHTML = dzialyKontraktu().map(d => chip('dup_dzialy', d.kod, esc(d.nazwa), dz.has(d.kod))).join('');
    fd.querySelector('.blad').hidden = true;
    $('okno-duplikatu').showModal();
  }
  fd.addEventListener('submit', ev => {
    ev.preventDefault();
    const s = ((hala.slowniki || {}).zlecenia_stale || {})[fd.dataset.kod];
    if (!s) { $('okno-duplikatu').close(); return; }
    const wybor = n => [...fd.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);
    const reczny = ((s.harmonogram || {}).rodzaj || 'reczny') === 'reczny';
    const blad = fd.querySelector('.blad');
    const zmiany = reczny ? ((s.harmonogram || {}).zmiany || []) : wybor('dup_zmiany'), dzialy = wybor('dup_dzialy');
    if (!reczny && !zmiany.length) { blad.textContent = 'Zaznacz zmianę.'; blad.hidden = false; return; }
    if (!dzialy.length) { blad.textContent = 'Zaznacz dział.'; blad.hidden = false; return; }
    $('okno-duplikatu').close();
    otworz(W.duplikatStalego(s, { zmiany, dzialy }), null, fd.dataset.lista ? 'Nowa checklista (kopia)' : 'Nowe zapisane (kopia)');
  });

  /* „Dodaj sobotę (zmiana I) do wybranych checklist”: lista z podglądem przed → po; zapis każdej osobno, błąd jednej nie przerywa reszty. */
  const fs = $('formularz-soboty');
  $('sobota-narzedzie').addEventListener('click', () => {
    const lista = W.doDodaniaSoboty(hala.slowniki);
    const pierwsza = Object.values(zmianySlownik())[0] || {};
    $('sobota-opis').textContent = `Wybrane checklisty dostaną sobotę z jedną zmianą: ${pierwsza.nazwa || 'pierwszą'}. Pozostałe dni, zmiany i ustawienia zostają bez zmian.`;
    $('sobota-lista').innerHTML = lista.map(x => `<label class="zaznacz"><input type="checkbox" name="sobota" value="${esc(x.kod)}" checked>
      <span><b>${esc(x.tytul)}</b><br><span class="slaby">${esc(x.przed)} → ${esc(x.po)}</span></span></label>`).join('');
    fs.querySelector('.blad').hidden = true;
    $('okno-soboty').showModal();
  });
  fs.addEventListener('submit', async ev => {
    ev.preventDefault();
    const wybrane0 = new Set([...fs.querySelectorAll('input[name="sobota"]:checked')].map(x => x.value));
    const blad = fs.querySelector('.blad');
    if (!wybrane0.size) { blad.textContent = 'Zaznacz co najmniej jedną checklistę.'; blad.hidden = false; return; }
    const bledy = [];
    let ok = 0;
    for (const x of W.doDodaniaSoboty(hala.slowniki).filter(y => wybrane0.has(y.kod))) {
      try {
        await hala.zapisz('slownik.zapisany', `zlecenia_stale/${x.kod}`, { slownik: 'zlecenia_stale', klucz: x.kod, wartosc: Object.assign({}, x.wartosc, { autor: hala.pracownik.id }) });
        ok++;
      } catch (e) { bledy.push(`${x.tytul}: ${P.komunikatBledu(e)}`); }
    }
    $('okno-soboty').close();
    P.komunikat(`Sobota dodana do ${ile(ok, 'checklisty', 'checklist', 'checklist')} — serwer zleci je w sobotę na zmianie I${bledy.length ? `. Nie udało się: ${bledy.join('; ')}` : ''}`, bledy.length ? 'uwaga' : 'ok');
  });


  P.widoki.stale = { rysuj, zZlecenia, otworzKod, otworzInstancje, otworz: (wartosci, kod, tytul, fn) => otworz(wartosci, kod, tytul, fn),
                     otworzZ: (wartosci, tytul, fn) => otworz(wartosci, null, tytul, fn) };
})();
