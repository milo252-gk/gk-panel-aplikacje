/* Administracja — ekran administratora (STYL-GK §8, 2026-11-04).

   Jedna pozycja menu administratora, wszędzie ta sama nazwa i ikona, a w środku zakładki-pigułki jak w Panelu
   Kierownika → Administracja: Konta · Dane i czyszczenie · Kody QR · Ustawienia.

   To nowe WEJŚCIE do istniejących funkcji, nie nowe funkcje: Konta i Ustawienia rysuje ten sam kod co dotąd
   (EKRANY.konta w konta.js, EKRANY.ustawienia w ustawienia.js — rejestr zostaje, pokazEkran przekierowuje stare
   wejścia tutaj), kody QR to to samo okno co w „Moje konto” (oknoKodowAplikacji). Nowe jest tylko „Dane
   i czyszczenie” (POST /api/czyszczenie): wybór konkretnych usterek i wpisów historii przeglądów do usunięcia. */

const ZAKLADKI_ADMINISTRACJI = [
  { id: 'konta', napis: 'Konta' },
  { id: 'dane', napis: 'Dane i czyszczenie' },
  { id: 'kody', napis: 'Kody QR' },
  { id: 'ustawienia', napis: 'Ustawienia' },
];

EKRANY.administracja = {
  tytul: 'Administracja',
  tylkoAdministrator: true,

  async rysuj(pole, param) {
    param = param || {};
    const zakladka = ZAKLADKI_ADMINISTRACJI.some(z => z.id === param.zakladka) ? param.zakladka : 'konta';
    stan.adminZakladka = zakladka;
    pole.innerHTML = `<div class="chipy" role="tablist" aria-label="Administracja">
        ${ZAKLADKI_ADMINISTRACJI.map(z => `<button type="button" class="chip ${z.id === zakladka ? 'wybrany' : ''}"
          role="tab" aria-selected="${z.id === zakladka}" data-zakladka="${z.id}">${z.napis}</button>`).join('')}
      </div>
      <div id="admin-tresc"><div class="pusto">Wczytuję…</div></div>`;
    pole.querySelectorAll('[data-zakladka]').forEach(b => {
      b.onclick = () => { if (b.dataset.zakladka !== stan.adminZakladka) pokazEkran('administracja', { zakladka: b.dataset.zakladka }); };
    });
    const tresc = pole.querySelector('#admin-tresc');
    if (zakladka === 'dane') {
      tresc.innerHTML = kartaCzyszczenia();
      podepnijCzyszczenie(tresc);
    } else if (zakladka === 'kody') {
      tresc.innerHTML = kartaKodowQRAdmina();
      const b = tresc.querySelector('#a-kody-qr');
      if (b) b.onclick = oknoKodowAplikacji;
    } else if (zakladka === 'ustawienia') {
      await EKRANY.ustawienia.rysuj(tresc, param);
    } else {
      await EKRANY.konta.rysuj(tresc, param);
    }
  },
};

function kartaKodowQRAdmina() {
  return `<div class="karta" id="a-kody-qr-karta">
    <h2>Kody QR aplikacji</h2>
    <p class="male slaby">Kody do zeskanowania aparatem telefonu: aplikacje hali, GK Trasy i GK Flota, z drukiem arkusza A4.
      To samo okno co w „Moje konto” — tu jest na wierzchu.</p>
    ${maKodyQR()
      ? `<div class="przyciski"><button class="glowny" id="a-kody-qr">${napisKodowQR()}</button></div>`
      : `<div class="wstega info">Kody QR są dla kont z Panelu Kierownika. Zalogowano kontem awaryjnym tego programu —
          zaloguj się swoim kontem z Panelu (imię i nazwisko), żeby je zobaczyć.</div>`}
  </div>`;
}

/* ------------------------------------------------------ Dane i czyszczenie */

function kartaCzyszczenia() {
  return `<div class="karta" id="a-czyszczenie">
    <h2>Czyszczenie danych</h2>
    <p class="male slaby">Usuwa wybrane <b>usterki</b> i <b>wpisy historii przeglądów</b> <b>na stałe</b> — razem z ich zdjęciami.
      Aut i terminów to czyszczenie nie rusza.</p>
    <ul class="male slaby" style="margin:6px 0 12px;padding-left:20px">
      <li>Przed usunięciem program robi pełną kopię bazy w folderze <code>kopie/</code> i trzyma ją 30 dni.</li>
      <li>Kopia bazy obejmuje dane, <b>nie pliki zdjęć</b> — zdjęcia znikają też z archiwów zip w <code>kopie/</code>
        i z kopii poza komputerem (jeśli jest ustawiona) i <b>nie da się ich odzyskać</b>.</li>
    </ul>
    <div class="przyciski"><button class="glowny" id="a-czysc-wybierz">Wybierz pozycje do usunięcia…</button></div>
  </div>`;
}

function podepnijCzyszczenie(pole) {
  const b = pole.querySelector('#a-czysc-wybierz');
  if (!b) return;
  b.onclick = async () => {
    const w = await sprobuj(() => API.post('/api/czyszczenie', { lista: true }));
    if (w) oknoCzyszczenia(w);
  };
}

function oknoCzyszczenia(dane) {
  const usterki = dane.usterki || [], przeglady = dane.przeglady || [], ucieto = dane.ucieto || {};
  const zdjecia = n => (n ? ` · ${n} ${odmiana(n, 'zdjęcie', 'zdjęcia', 'zdjęć')}` : '');
  const skrot = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
  const wierszUsterki = u => `<label class="plaska" style="display:flex;gap:8px;align-items:flex-start;padding:4px 0">
      <input type="checkbox" data-usterka="${u.id}" data-otwarta="${u.status === 'zamknieta' ? '0' : '1'}"
             data-zdjec="${Number(u.ile_zdjec) || 0}">
      <span>${escHtml(polskaData(u.utworzono))} · <b>${escHtml(u.rejestracja)}</b> · ${escHtml(skrot(u.opis, 80))}
      <span class="slaby">· ${escHtml(opisKodu(OPIS_WAGI, u.waga))} · ${u.status === 'zamknieta'
        ? 'zamknięta' : `<b>${escHtml(opisKodu(OPIS_USTERKI, u.status))}</b>`}${zdjecia(u.ile_zdjec)}</span></span></label>`;
  const wierszPrzegladu = p => `<label class="plaska" style="display:flex;gap:8px;align-items:flex-start;padding:4px 0">
      <input type="checkbox" data-przeglad="${p.id}" data-zdjec="${Number(p.ile_zdjec) || 0}">
      <span>${escHtml(miesiacSlownie(p.okres))} · <b>${escHtml(p.rejestracja)}</b>
      <span class="slaby">· ${escHtml(p.kierowca_imie || 'bez kierowcy')} · ${p.status === 'zalegly'
        ? 'zaległy (nikt nie oddał)' : 'zatwierdzony'}${zdjecia(p.ile_zdjec)}</span></span></label>`;
  const sekcja = (id, tytul, lista, wiersz, uciete, opis) => `<h3 style="margin:14px 0 4px">${tytul} (${lista.length})</h3>
      <p class="male slaby" style="margin:0 0 4px">${opis}</p>
      ${lista.length ? `<label class="plaska"><input type="checkbox" data-wszystkie="${id}">
          <b>Zaznacz wszystkie (${lista.length})</b></label>
        <div style="max-height:30vh;overflow:auto">${lista.map(wiersz).join('')}</div>
        ${uciete ? '<p class="male slaby">Pokazuję 500 najnowszych.</p>' : ''}`
        : '<p class="slaby">Nic do wyboru.</p>'}`;

  okno({
    tytul: 'Czyszczenie danych',
    szerokie: true,
    tresc: (usterki.length || przeglady.length)
      ? sekcja('usterki', 'Usterki', usterki, wierszUsterki, ucieto.usterki,
               'Zamknięte i otwarte. Usterki, które nie są zamknięte, program pyta o osobno.')
        + sekcja('przeglady', 'Historia przeglądów', przeglady, wierszPrzegladu, ucieto.przeglady,
                 'Zatwierdzone i zaległe. Najnowszy wpis każdego auta zostaje — od niego program liczy cykl przeglądów.')
      : '<p class="slaby">Nie ma pozycji do wyboru.</p>',
    przyciski: [
      { napis: 'Zamknij', klik: z => z() },
      ...((usterki.length || przeglady.length) ? [{ napis: 'Usuń zaznaczone', klasa: 'glowny niszczacy', klik: async z => {
        const pole = document.getElementById('okno-tresc');
        const zaznaczone = selektor => [...pole.querySelectorAll(selektor)];
        const ustIds = zaznaczone('[data-usterka]:checked').map(x => Number(x.dataset.usterka));
        const przIds = zaznaczone('[data-przeglad]:checked').map(x => Number(x.dataset.przeglad));
        if (!ustIds.length && !przIds.length) { komunikat('Zaznacz pozycje do usunięcia', 'blad'); return; }
        const zdj = zaznaczone('[data-usterka]:checked, [data-przeglad]:checked').reduce((s, x) => s + Number(x.dataset.zdjec || 0), 0);
        const otwarte = zaznaczone('[data-usterka]:checked').filter(x => x.dataset.otwarta === '1').length;
        const co = [ustIds.length ? `${ustIds.length} ${odmiana(ustIds.length, 'usterka', 'usterki', 'usterek')}` : '',
                    przIds.length ? `${przIds.length} ${odmiana(przIds.length, 'wpis historii przeglądów', 'wpisy historii przeglądów', 'wpisów historii przeglądów')}` : '']
          .filter(Boolean).join(' i ');
        if (!await potwierdz('Usunąć zaznaczone pozycje?',
          `${co} zniknie na stałe${zdj ? `, razem z ${zdj} ${odmiana(zdj, 'zdjęciem', 'zdjęciami', 'zdjęciami')}` : ''}. `
          + (zdj ? 'Zdjęcia znikną też z archiwów w folderze kopie/ i z kopii poza komputerem, a kopia bazy ich nie zawiera — '
                   + 'nie da się ich odzyskać. ' : '')
          + 'Program najpierw robi pełną kopię bazy (leży w folderze kopie/ przez 30 dni).', { tak: 'Usuń', groznie: true })) return;
        if (otwarte && !await potwierdz('Wśród nich są niezamknięte usterki',
          `${otwarte} ${odmiana(otwarte, 'zaznaczona usterka nie jest zamknięta', 'zaznaczone usterki nie są zamknięte', 'zaznaczonych usterek nie jest zamkniętych')} — `
          + 'nikt jej jeszcze nie naprawił albo auto stoi w warsztacie. Usunąć je mimo to?',
          { tak: 'Tak, usuń też otwarte', nie: 'Wróć', groznie: true })) return;
        const w = await sprobuj(() => API.post('/api/czyszczenie',
          { usterki: ustIds, przeglady: przIds, potwierdz: true, takze_otwarte: otwarte > 0 }));
        if (w) {
          z();
          komunikat(`Usunięto: ${w.usterki} ${odmiana(w.usterki, 'usterka', 'usterki', 'usterek')}, `
            + `${w.przeglady} ${odmiana(w.przeglady, 'wpis historii', 'wpisy historii', 'wpisów historii')}. Kopia bazy: ${w.kopia}`
            + (w.archiwa === 'czeka' ? ' Kopia poza komputerem zostanie oczyszczona, gdy folder będzie dostępny.' : ''), 'ok');
          odswiezEkran();
        }
      } }] : []),
    ],
    poOtwarciu: pole => {
      // „Usuń zaznaczone (N)” — licznik przy przycisku rośnie z każdym zaznaczeniem (STYL-GK §8).
      const licznik = () => {
        const n = pole.querySelectorAll('[data-usterka]:checked, [data-przeglad]:checked').length;
        const przycisk = document.querySelector('#okno-stopka button.niszczacy');
        if (przycisk) przycisk.textContent = n ? `Usuń zaznaczone (${n})` : 'Usuń zaznaczone';
      };
      pole.querySelectorAll('[data-usterka],[data-przeglad]').forEach(x => { x.onchange = licznik; });
      pole.querySelectorAll('[data-wszystkie]').forEach(wszystkie => {
        const atrybut = wszystkie.dataset.wszystkie === 'usterki' ? '[data-usterka]' : '[data-przeglad]';
        wszystkie.onchange = () => {
          pole.querySelectorAll(atrybut).forEach(x => { x.checked = wszystkie.checked; });
          licznik();
        };
      });
    },
  });
}
