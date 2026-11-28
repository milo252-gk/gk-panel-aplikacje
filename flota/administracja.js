/* Administracja — ekran administratora (STYL-GK §8, 2026-11-04).

   Jedna pozycja menu administratora, wszędzie ta sama nazwa i ikona, a w środku zakładki-pigułki jak w Panelu
   Zarządczy GK → Administracja: Pracownicy · Kody QR · Role i uprawnienia · Ustawienia (od 2026-11-27; Czyszczenie — na ekranie Usterki).

   To nowe WEJŚCIE do istniejących funkcji, nie nowe funkcje: Konta i Ustawienia rysuje ten sam kod co dotąd
   (EKRANY.konta w konta.js, EKRANY.ustawienia w ustawienia.js — rejestr zostaje, pokazEkran przekierowuje stare
   wejścia tutaj), kody QR to to samo okno co w „Moje konto” (oknoKodowAplikacji). Nowe jest tylko „Dane
   i czyszczenie” (POST /api/czyszczenie): wybór konkretnych usterek i wpisów historii przeglądów do usunięcia. */

// Przegląd UI 2026-11-27 (jak Panel i Panel Zarządczy SP, STYL-GK §8): każdy chip z ikoną liniową. Decyzje właściciela 27.11:
// „Pracownicy” zamiast „Konta” (P11; kod części 'konta' bez zmian), bez chipu „Dane i czyszczenie” — Czyszczenie to przycisk na
// ekranie Usterki (P12, jak Czyszczenie tras w SP), „Role i uprawnienia” jako chip-drzwi otwierający okno (P14, jak w SP).
const ZAKLADKI_ADMINISTRACJI = [
  { id: 'konta', napis: 'Pracownicy', ikona: 'konta' },
  { id: 'kody', napis: 'Kody QR', ikona: 'kody' },
  { id: 'role', napis: 'Role i uprawnienia', ikona: 'zamek', drzwi: true },
  { id: 'ustawienia', napis: 'Ustawienia', ikona: 'ustawienia' },
];

EKRANY.administracja = {
  tytul: 'Administracja',
  tylkoAdministrator: true,

  async rysuj(pole, param) {
    param = param || {};
    // Zakładka spoza listy (także dawne { zakladka: 'dane' } z zakładek i linków) → pierwsza; drzwi nie są zakładką.
    const zakladka = ZAKLADKI_ADMINISTRACJI.some(z => !z.drzwi && z.id === param.zakladka) ? param.zakladka : 'konta';
    stan.adminZakladka = zakladka;
    pole.innerHTML = `<div class="chipy chipy-admin" role="tablist" aria-label="Administracja">
        ${ZAKLADKI_ADMINISTRACJI.map(z => `<button type="button" class="chip ${z.id === zakladka ? 'wybrany' : ''}"
          role="tab" aria-selected="${z.id === zakladka}" data-zakladka="${z.id}">${ikonka(z.ikona)}${z.napis}</button>`).join('')}
      </div>
      <div id="admin-tresc"><div class="pusto">Wczytuję…</div></div>`;
    pole.querySelectorAll('[data-zakladka]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.zakladka === 'role') {     // drzwi: okno, bez zmiany zakładki; „Wróć” wraca na tę samą zakładkę
          otworzRole(() => pokazEkran('administracja', { zakladka: stan.adminZakladka })).catch(e => komunikat(poLudzku(e), 'blad'));
          return;
        }
        if (b.dataset.zakladka !== stan.adminZakladka) pokazEkran('administracja', { zakladka: b.dataset.zakladka });
      };
    });
    const tresc = pole.querySelector('#admin-tresc');
    if (zakladka === 'kody') {
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
    <p class="male slaby">Kody do zeskanowania aparatem telefonu: aplikacje hali, Panel Zarządczy SP i GK Flota, z drukiem arkusza A4.
      To samo okno co w „Moje konto” — tu jest na wierzchu.</p>
    ${maKodyQR()
      ? `<div class="przyciski"><button class="glowny" id="a-kody-qr">${ikonka('telefon')}${napisKodowQR()}</button></div>`
      : `<div class="wstega info">Kody QR są dla kont z Panelu Zarządczego GK. Zalogowano kontem awaryjnym tego programu —
          zaloguj się swoim kontem z Panelu (imię i nazwisko), żeby je zobaczyć.</div>`}
  </div>`;
}

/* ------------------------------------------------------ Czyszczenie (przycisk na ekranie Usterki)

   Decyzja właściciela 2026-11-27 (P12, jak Panel Zarządczy GK 26.11 i Panel Zarządczy SP 27.11): bez zakładki „Dane i czyszczenie”
   w Administracji — ta sama funkcja (POST /api/czyszczenie, okno wyboru, pełna kopia bazy) otwiera się przyciskiem „Czyszczenie”
   na górze ekranu Usterki. Widzi go tylko administrator (ten sam, który widział zakładkę; serwer: próg „admin”, bez zmian).
   Zakładka miała tylko tę jedną kartę — opis skutków jest teraz na górze okna. */
function przyciskCzyszczenia() {
  return jestAdministratorem()
    ? `<button type="button" id="u-czyszczenie" title="Usuń wybrane usterki i wpisy historii przeglądów na stałe (tylko administrator)">${ikonka('czyszczenie')}Czyszczenie</button>`
    : '';
}

function podepnijCzyszczenie(pole) {
  const b = pole.querySelector('#u-czyszczenie');
  if (!b) return;
  b.onclick = async () => {
    const w = await sprobuj(() => API.post('/api/czyszczenie', { lista: true }));
    if (w) oknoCzyszczenia(w);
  };
}

const OPIS_CZYSZCZENIA = `<p class="male slaby" style="margin-top:0">Usuwa wybrane <b>usterki</b> i <b>wpisy historii przeglądów</b>
    <b>na stałe</b> — razem z ich zdjęciami. Aut i terminów to czyszczenie nie rusza.</p>
  <ul class="male slaby" style="margin:6px 0 12px;padding-left:20px">
    <li>Przed usunięciem program robi pełną kopię bazy w folderze <code>kopie/</code> i trzyma ją 30 dni.</li>
    <li>Kopia bazy obejmuje dane, <b>nie pliki zdjęć</b> — zdjęcia znikają też z archiwów zip w <code>kopie/</code>
      i z kopii poza komputerem (jeśli jest ustawiona) i <b>nie da się ich odzyskać</b>.</li>
  </ul>`;

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
    tresc: OPIS_CZYSZCZENIA + ((usterki.length || przeglady.length)
      ? sekcja('usterki', 'Usterki', usterki, wierszUsterki, ucieto.usterki,
               'Zamknięte i otwarte. Usterki, które nie są zamknięte, program pyta o osobno.')
        + sekcja('przeglady', 'Historia przeglądów', przeglady, wierszPrzegladu, ucieto.przeglady,
                 'Zatwierdzone i zaległe. Najnowszy wpis każdego auta zostaje — od niego program liczy cykl przeglądów.')
      : '<p class="slaby">Nie ma pozycji do wyboru.</p>'),
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
        if (przycisk) {
          przycisk.textContent = n ? `Usuń zaznaczone (${n})` : 'Usuń zaznaczone';
          // Nocna kontrola 28.11: bez zaznaczenia czerwony przycisk wyglądał na gotowy do kliknięcia (ciemny motyw) — wyszarzony.
          przycisk.disabled = !n;
        }
      };
      pole.querySelectorAll('[data-usterka],[data-przeglad]').forEach(x => { x.onchange = licznik; });
      pole.querySelectorAll('[data-wszystkie]').forEach(wszystkie => {
        const atrybut = wszystkie.dataset.wszystkie === 'usterki' ? '[data-usterka]' : '[data-przeglad]';
        wszystkie.onchange = () => {
          pole.querySelectorAll(atrybut).forEach(x => { x.checked = wszystkie.checked; });
          licznik();
        };
      });
      licznik();
    },
  });
}


/* ------------------------------------------------------ Role i uprawnienia (P14, 2026-11-27)

   Wzór: web/role.js w Panelu Zarządczym SP. Tylko odczyt; niczego nie zmienia. Tabela przychodzi z GET /api/role
   (flotex.py → tabela_rol) i jest LICZONA z progów ról przy adresach programu (TRASY_API), a nie wpisana drugi raz — nie
   rozjedzie się z kodem. Haczyk = wolno, pół koła = wolno w ograniczonym zakresie (opis w komórce), „—” = nie wolno.
   Otwiera się z Administracji (chip) i z „Moje konto” (biuro i administrator). Rola zalogowanej osoby jest podświetlona;
   Menedżer widzi przy Administratorze Floty „Menedżer to Ty” (te same uprawnienia, inna nazwa konta). */
const ZNAKI_ROLI = { tak: [ikonka('haczyk', 18), 'Wolno'], czesc: [ikonka('pol-kola', 18), 'Wolno w ograniczonym zakresie'], nie: ['—', 'Nie wolno'] };

async function otworzRole(wroc) {
  const d = await API.get('/api/role');
  const moja = d.moja_rola || (stan.uz && stan.uz.rola) || '';
  const mojaEtykieta = d.moja_etykieta || (stan.uz && stan.uz.etykieta_roli) || '';
  const toTy = r => (mojaEtykieta && mojaEtykieta !== r.nazwa ? `${escHtml(mojaEtykieta)} to Ty` : 'to Ty');
  const wTytule = r => `${escHtml(r.nazwa)}${r.kod === moja ? ` <span class="plakietka p-zatwierdzony">${toTy(r)}</span>` : ''}`;
  const komorka = (w, r) => {
    const [znak, tekst] = ZNAKI_ROLI[w.komorki[r.kod]] || ZNAKI_ROLI.nie;
    const uwaga = (w.uwagi || {})[r.kod];
    const opis = uwaga ? `${tekst}: ${uwaga}` : tekst;
    return `<td class="rola-${escHtml(w.komorki[r.kod])}${r.kod === moja ? ' moja-rola' : ''}" title="${escHtml(opis)}"
      aria-label="${escHtml(r.nazwa)}: ${escHtml(opis)}">${znak}${uwaga ? `<span class="rola-uwaga">${escHtml(uwaga)}</span>` : ''}</td>`;
  };
  const tabela = d.grupy.map(g => `<tbody><tr class="role-grupa"><th colspan="${d.role.length + 1}" scope="colgroup">${escHtml(g.nazwa)}</th></tr>
      ${g.wiersze.map(w => `<tr><th scope="row">${escHtml(w.nazwa)}</th>${d.role.map(r => komorka(w, r)).join('')}</tr>`).join('')}</tbody>`).join('');
  okno({
    tytul: 'Role i uprawnienia',
    szerokie: true,
    tresc: `
      <section class="role-zasady"><h3>Zasady</h3><ol>${d.zasady.map(z => `<li>${escHtml(z)}</li>`).join('')}</ol></section>
      <section class="role-opisy"><h3>Kto jest kim</h3><dl>${d.role.map(r => `<dt class="${r.kod === moja ? 'moja-rola' : ''}">${wTytule(r)}</dt><dd>${escHtml(r.opis)}</dd>`).join('')}</dl></section>
      <p class="slaby male role-legenda"><b>${ikonka('haczyk')}</b> wolno · <b>${ikonka('pol-kola')}</b> wolno w ograniczonym zakresie (opis w komórce) · <b>—</b> nie wolno. To podgląd reguł, które i tak egzekwuje serwer — tu niczego nie zmienisz.</p>
      <div class="tabela-przewijana role-tabela-opak"><table class="role-tabela">
        <thead><tr><th scope="col">Funkcja</th>${d.role.map(r => `<th scope="col" class="${r.kod === moja ? 'moja-rola' : ''}" title="${escHtml(r.opis)}">${escHtml(r.nazwa)}</th>`).join('')}</tr></thead>
        ${tabela}
      </table></div>`,
    przyciski: wroc
      ? [{ napis: 'Wróć', klik: z => { z(); wroc(); } }, { napis: 'Zamknij', klik: z => z() }]
      : [{ napis: 'Zamknij', klik: z => z() }],
  });
}
