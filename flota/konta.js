/* Konta pracowników — ekran administratora.

   Zasady, których broni serwer (ostatni administrator, minimalna długość
   PIN-u, hasło wymagane przy awansie), pokazujemy człowiekowi ZANIM kliknie.
   Komunikat błędu po naciśnięciu „Zapisz" jest gorszą wersją tej samej
   informacji: wtedy trzeba się cofać i zgadywać, co było nie tak.            */

const OPIS_ROLI = {
  kierowca: 'kierowca — widzi tylko swoje auto, oddaje przeglądy i zgłasza usterki',
  biuro: 'biuro — cała flota: pojazdy, terminy, przeglądy, usterki',
  admin: 'administrator — to co biuro, plus konta i Ustawienia',
};
const MIN_PIN = { kierowca: 4, biuro: 8, admin: 8 };

/* Konto kierowcy z GK Trasy (GK Transport) — tylko do obejrzenia. Imię, login,
   PIN i aktywność przychodzą z GK Trasy co kilka minut, więc pole do edycji
   byłoby kłamstwem: zmiana wróciłaby do starej przy najbliższej wymianie,
   a serwer i tak odpowiada na nią odmową. Auto przypisuje się dalej tutaj,
   na karcie pojazdu — to jest sprawa floty, nie planu dnia.                 */
/* Konto z Panelu Kierownika (GK-KONTA.md) — jedna osoba, jedno konto we
   wszystkich aplikacjach GK. Zakłada się je i zmienia w Panelu → Administracja;
   tutaj tylko oglądamy. PIN osoba zmienia sama w „Moje konto” (idzie do Panelu),
   auto przypisuje się dalej tutaj, na karcie pojazdu.                       */
function oknoKontaZPanelu(u) {
  okno({
    tytul: 'Konto ' + u.imie,
    tresc: `
      <div class="wstega info">Konto prowadzi <b>Panel Kierownika</b> — imię i nazwisko,
        rolę, telefon i wyłączenie zmieniasz w Panelu → <b>Administracja</b>. PIN osoba
        zmienia sama w „Moje konto”. Auto przypisujesz tutaj: Flota → karta auta →
        <b>Kierowca</b>.</div>
      <div class="dwie-kolumny">
        <label class="pole">Imię i nazwisko
          <input value="${escHtml(u.imie)}" disabled></label>
        <label class="pole">Login
          <input value="${escHtml(u.login)}" disabled></label>
        <label class="pole">Telefon
          <input value="${escHtml(u.telefon || '')}" disabled></label>
        <label class="pole">Rola
          <input value="${escHtml(u.rola)}" disabled></label>
      </div>
      <p class="slaby male">Konto ${u.aktywny ? 'czynne' : 'wyłączone'}${u.pojazdy
        ? ` · auta: <b>${escHtml(u.pojazdy)}</b>` : ' · bez przypisanego auta'}.</p>`,
    przyciski: [{ napis: 'Zamknij', klasa: 'glowny', klik: z => z() }],
  });
}

function oknoKontaZTrasexu(u) {
  okno({
    tytul: 'Konto ' + u.imie,
    tresc: `
      <div class="wstega info">Konto prowadzi <b>GK Trasy</b> — imię, login, PIN
        i wyłączenie konta zmieniasz tam. Auto przypisujesz tutaj:
        Flota → karta auta → <b>Kierowca</b>.</div>
      <div class="dwie-kolumny">
        <label class="pole">Imię i nazwisko
          <input value="${escHtml(u.imie)}" disabled></label>
        <label class="pole">Login
          <input value="${escHtml(u.login)}" disabled></label>
        <label class="pole">Telefon
          <input value="${escHtml(u.telefon || '')}" disabled></label>
        <label class="pole">Rola
          <input value="${escHtml(u.rola)}" disabled></label>
      </div>
      <p class="slaby male">Konto ${u.aktywny ? 'czynne' : 'wyłączone'}${u.pojazdy
        ? ` · auta: <b>${escHtml(u.pojazdy)}</b>` : ' · bez przypisanego auta'}.</p>`,
    przyciski: [{ napis: 'Zamknij', klasa: 'glowny', klik: z => z() }],
  });
}

EKRANY.konta = {
  tytul: 'Konta',
  tylkoAdministrator: true,

  async rysuj(pole) {
    // Ustawienia świeżo, nie ze słowników z chwili logowania: połączenie
    // z Panelem włącza się w tej samej sesji, a od niego zależy, czy konta
    // da się tu zmieniać.
    const [lista, ustawienia, blokady] = await Promise.all([
      sprobuj(() => API.get('/api/uzytkownicy')),
      API.get('/api/ustawienia').catch(() => stan.ustawienia || {}),
      // Blokady z internetu to dodatek: gdy nie przyjdą, lista kont ma się
      // i tak narysować.
      API.get('/api/blokady').catch(() => null),
    ]);
    stan.kontaZPanelu = !!(ustawienia && ustawienia.konta_z_huba);
    const konta = lista || [];
    const czynnych = konta.filter(u => u.aktywny);
    const adminow = czynnych.filter(u => u.rola === 'admin').length;
    // Przy kontach z Panelu tutaj zakłada się już tylko awaryjnego administratora —
    // i tylko wtedy, gdy lokalnego nie ma (serwer pilnuje tego samego).
    const lokalnyAdmin = czynnych.some(u => u.rola === 'admin' && !u.zrodlo);
    const nowyUkryty = stan.kontaZPanelu && lokalnyAdmin;

    pole.innerHTML = `
      ${stan.kontaZPanelu ? `<div class="wstega info">Konta zakłada się w <b>Panelu
        Kierownika → Administracja</b> — jedna osoba, jedno konto we wszystkich aplikacjach
        GK. GK Flota pobiera je sama co kilka minut (Ustawienia → Konta GK). Tutaj zostaje
        tylko awaryjny administrator.</div>` : ''}
      <div class="pasek-narzedzi">
        <button class="glowny${nowyUkryty ? ' ukryty' : ''}" id="k-nowy">${stan.kontaZPanelu
          ? 'Awaryjny administrator' : 'Nowe konto'}</button>
        <span class="slaby male">${czynnych.length} ${odmiana(czynnych.length,
          'czynne konto', 'czynne konta', 'czynnych kont')} · ${adminow} ${odmiana(adminow,
          'administrator', 'administratorów', 'administratorów')}</span>
      </div>

      ${rysujBlokady(blokady)}

      ${adminow === 1 ? `<div class="wstega info">Jest tylko jeden administrator.
        Program nie pozwoli go wyłączyć ani zdegradować — inaczej firma zostałaby
        bez dostępu do Ustawień i kont.</div>` : ''}

      <div class="karta scisla"><div class="tabela-przewijana"><table>
        <thead><tr><th>Kto</th><th>Login</th><th>Rola</th><th>Auta</th>
          <th>Ostatnio</th><th></th></tr></thead>
        <tbody>${konta.map(u => `
          <tr${u.aktywny ? '' : ' class="slaby"'}>
            <td><b>${escHtml(u.imie)}</b>${u.aktywny ? ''
              : ' <span class="plakietka">wyłączone</span>'}${u.zrodlo === 'trasex'
              ? ' <span class="plakietka p-wykonany">z GK Trasy</span>' : ''}${u.zrodlo === 'gk'
              ? ' <span class="plakietka p-zatwierdzony">z Panelu</span>' : ''}
              ${u.telefon ? `<br><span class="slaby male">${escHtml(u.telefon)}</span>` : ''}</td>
            <td>${escHtml(u.login)}</td>
            <td><span class="plakietka">${escHtml(u.rola)}</span></td>
            <td>${u.pojazdy ? escHtml(u.pojazdy) : '<span class="slaby">—</span>'}</td>
            <td>${u.ostatnio ? escHtml(polskaData(u.ostatnio))
              : '<span class="slaby">nigdy</span>'}</td>
            <td><button data-konto="${u.id}">${tylkoDoOdczytu(u) ? 'Pokaż' : 'Zmień'}</button></td>
          </tr>`).join('')}
        </tbody></table></div></div>`;

    pole.querySelector('#k-nowy').onclick = () => oknoEdycjiKonta(null, adminow);
    pole.querySelectorAll('[data-odblokuj]').forEach(b => {
      b.onclick = async () => {
        if (await sprobuj(() => API.post(`/api/uzytkownicy/${b.dataset.odblokuj}/odblokuj`, {}),
                          'Odblokowane — można się logować także z internetu')) odswiezEkran();
      };
    });
    pole.querySelectorAll('[data-konto]').forEach(b => {
      b.onclick = () => oknoEdycjiKonta(konta.find(u => u.id === Number(b.dataset.konto)),
                                        adminow);
    });
  },
};

/* Blokada logowania z internetu (przez tunel): 10 złych PIN-ów na jedno konto
   w 15 minut zamyka je z internetu na kwadrans, trzecia taka seria w ciągu
   doby — do odblokowania tutaj (albo na dobę). Z firmowego wifi konto loguje
   się cały czas. Liczba złych prób w ostatniej godzinie mówi, czy ktoś
   właśnie zgaduje, zanim zablokuje się którekolwiek konto.               */
function rysujBlokady(b) {
  if (!b) return '';
  const konta = b.konta || [];
  const zle = b.zle_proby_godzina || 0;
  if (!konta.length && !zle) return '';
  return `<div class="wstega ${konta.length ? 'uwaga' : 'info'}">
    <b>Logowanie z internetu</b> — złe PIN-y z internetu w ostatniej godzinie:
    <b>${zle}</b>.
    ${konta.length ? `<br>Zablokowane z internetu (z firmowego wifi wchodzą normalnie):
      <ul>${konta.map(k => `<li><b>${escHtml(k.imie)}</b> — ${k.dobowa
        ? 'do odblokowania (trzecia seria złych PIN-ów w ciągu doby)'
        : 'do ' + escHtml(String(k.do || '').slice(11, 16))}
        <button data-odblokuj="${k.id}">Odblokuj</button></li>`).join('')}</ul>` : ''}
  </div>`;
}

/* Konto z GK Trasy zawsze, konto z Panelu — dopóki GK Flota jest z nim połączona
   (po odłączeniu konta z Panelu wracają pod GK Flota i znów da się je zmieniać). */
function tylkoDoOdczytu(u) {
  return u.zrodlo === 'trasex' || (u.zrodlo === 'gk' && !!stan.kontaZPanelu);
}

/* Nazwa inna niż oknoKonta() z app.js, i to nie jest kosmetyka: funkcje
   z kilku zwykłych <script> dzielą jedną przestrzeń nazw, a późniejsza
   deklaracja nadpisuje wcześniejszą. Przy wspólnej nazwie przycisk 👤
   („Moje konto") otwierał u administratora edytor cudzego konta. */
function oknoEdycjiKonta(u, adminow) {
  const nowy = !u;
  if (!nowy && u.zrodlo === 'trasex') return oknoKontaZTrasexu(u);
  if (!nowy && tylkoDoOdczytu(u)) return oknoKontaZPanelu(u);
  const ostatniAdmin = !nowy && u.rola === 'admin' && u.aktywny && adminow === 1;

  okno({
    tytul: nowy ? 'Nowe konto' : 'Konto ' + u.imie,
    tresc: `
      ${ostatniAdmin ? `<div class="wstega uwaga">To jedyny czynny administrator.
        Nie da się go wyłączyć ani zmienić mu roli, dopóki nie powstanie drugi.</div>` : ''}
      <div class="dwie-kolumny">
        <label class="pole">Imię i nazwisko *
          <input id="k-imie" maxlength="80" value="${escHtml(u ? u.imie : '')}"></label>
        <label class="pole">Login ${nowy ? '*' : ''}
          <input id="k-login" maxlength="60" autocapitalize="none"
                 value="${escHtml(u ? u.login : '')}"${nowy ? '' : ' disabled'}></label>
        <label class="pole">Telefon
          <input id="k-telefon" maxlength="40" inputmode="tel"
                 value="${escHtml(u ? u.telefon || '' : '')}"></label>
        <label class="pole">Rola
          <select id="k-rola"${ostatniAdmin ? ' disabled' : ''}>
            ${['kierowca', 'biuro', 'admin'].map(r =>
              `<option value="${r}"${(u ? u.rola : 'kierowca') === r ? ' selected' : ''}>${
                escHtml(r)}</option>`).join('')}
          </select></label>
      </div>
      <p class="slaby male" id="k-opis-roli"></p>

      <label class="pole">${nowy ? 'PIN *' : 'Nowy PIN (zostaw puste, żeby nie zmieniać)'}
        <input id="k-pin" type="password" autocomplete="new-password" maxlength="128"></label>
      <p class="slaby male" id="k-opis-pinu"></p>

      ${nowy ? '' : `<label class="male"><input type="checkbox" id="k-aktywny"${
        u.aktywny ? ' checked' : ''}${ostatniAdmin ? ' disabled' : ''}> konto czynne</label>
        <p class="slaby male">Wyłączone konto nie zaloguje się i traci wszystkie sesje.
        ${u.pojazdy ? `Auta <b>${escHtml(u.pojazdy)}</b> zostaną wtedy bez opiekuna —
        przypisz je komuś innemu.` : ''}</p>`}`,

    poOtwarciu: (tresc) => {
      const rola = tresc.querySelector('#k-rola');
      const opisRoli = tresc.querySelector('#k-opis-roli');
      const opisPinu = tresc.querySelector('#k-opis-pinu');
      const odswiez = () => {
        opisRoli.textContent = OPIS_ROLI[rola.value] || '';
        opisPinu.textContent = `PIN dla tej roli musi mieć co najmniej `
          + `${MIN_PIN[rola.value]} znaków`
          + (rola.value === 'kierowca'
              ? ' — kierowca wstukuje go w rękawicach, więc może być krótki.'
              : ' — to konto widzi całą firmę, więc ma mieć prawdziwe hasło.');
      };
      rola.onchange = odswiez;
      odswiez();
      tresc.querySelector('#k-imie').focus();
    },

    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zapisz', klasa: 'glowny', klik: async (zamknij) => {
        const we = id => document.getElementById(id);
        const rola = we('k-rola').value;
        const pin = we('k-pin').value;
        const dane = {
          id: u ? u.id : null,
          imie: we('k-imie').value.trim(),
          login: we('k-login').value.trim(),
          telefon: we('k-telefon').value.trim(),
          rola,
          aktywny: nowy ? 1 : (we('k-aktywny').checked ? 1 : 0),
        };
        if (pin) dane.pin = pin;
        if (!dane.imie) { komunikat('Podaj imię i nazwisko', 'blad'); return; }
        if (nowy && !dane.login) { komunikat('Podaj login', 'blad'); return; }
        if (nowy && !pin) { komunikat('Nowe konto musi dostać PIN', 'blad'); return; }
        // Sprawdzamy tu, choć serwer sprawdza to samo: krótszy PIN wpisany
        // w oknie odbijał się komunikatem po zamknięciu formularza, więc
        // wszystkie pozostałe pola trzeba było wpisywać drugi raz.
        if (pin && pin.length < MIN_PIN[rola]) {
          komunikat(`PIN dla roli „${rola}" musi mieć co najmniej ${MIN_PIN[rola]} znaków`,
                    'blad');
          return;
        }
        if (!await sprobuj(() => API.post('/api/uzytkownicy', dane),
                           nowy ? 'Konto założone' : 'Zapisane')) return;
        zamknij();
        odswiezEkran();
      } },
    ],
  });
}
