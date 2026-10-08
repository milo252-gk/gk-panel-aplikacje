/* Ustawienia — ekran administratora.

   Rysujemy WYŁĄCZNIE klucze, które serwer naprawdę przyjmuje (a_ustawienia_zapisz
   ma białą listę). Pole, które program po zapisaniu cicho zignoruje, jest gorsze
   niż brak pola: człowiek wpisuje w nie wartość, widzi „Zapisane" i przez rok
   jest przekonany, że coś ustawił.                                            */

const SZYFROWANIA = [['starttls', 'STARTTLS (najczęściej, port 587)'],
                     ['ssl', 'SSL/TLS (port 465)'],
                     ['brak', 'bez szyfrowania']];

EKRANY.ustawienia = {
  tytul: 'Ustawienia',
  tylkoAdministrator: true,

  async rysuj(pole) {
    const u = await sprobuj(() => API.get('/api/ustawienia'));
    if (!u) { pole.innerHTML = '<div class="pusto">Nie udało się wczytać ustawień.</div>'; return; }
    const pocztaStan = u.poczta_stan || {};
    const terminyStan = u.terminy_stan || {};
    const wlaczona = String(u.poczta_wlaczona) === '1';

    pole.innerHTML = `
      ${wstegiAlarmow(u.alarmy_systemu)}

      <div class="karta">
        <h3>Firma</h3>
        <label class="pole">Nazwa firmy
          <input id="u-firma" maxlength="120" value="${escHtml(u.firma || '')}"
                 placeholder="wchodzi w temat wiadomości i nagłówek pulpitu"></label>
      </div>

      <div class="karta">
        <div class="karta-gora"><h3>Powiadamianie o terminach</h3>
          <span class="plakietka p-${wlaczona ? 'wykonany' : 'oczekuje'}">${
            wlaczona ? 'automat włączony' : 'automat wyłączony'}</span></div>

        <div class="wstega info">Program pilnuje terminów zawsze — widać je na pulpicie
          i w kalendarzu, także przy wyłączonym automacie. Ten przełącznik decyduje
          tylko o tym, czy program ma <b>sam z siebie wysyłać e-maile</b>.
          Fabrycznie jest wyłączony: program nie pisze do ludzi bez wiedzy człowieka.</div>

        <label class="male"><input type="checkbox" id="u-poczta-wlaczona"${
          wlaczona ? ' checked' : ''}> wysyłaj alarmy e-mailem</label>

        <div class="dwie-kolumny" style="margin-top:10px">
          <label class="pole">Adres biura (tam idą alarmy)
            <input id="u-mail-biura" type="email" maxlength="160"
                   value="${escHtml(u.mail_biura || '')}"></label>
          <label class="pole">Nadawca
            <input id="u-poczta-nadawca" type="email" maxlength="160"
                   value="${escHtml(u.poczta_nadawca || '')}"></label>
          <label class="pole">Serwer SMTP
            <input id="u-poczta-serwer" maxlength="120"
                   value="${escHtml(u.poczta_serwer || '')}"
                   placeholder="np. smtp.firma.pl"></label>
          <label class="pole">Port
            <input id="u-poczta-port" type="number" inputmode="numeric"
                   value="${escHtml(u.poczta_port || '587')}"></label>
          <label class="pole">Szyfrowanie
            <select id="u-poczta-szyfrowanie">${SZYFROWANIA.map(([kod, opis]) =>
              `<option value="${kod}"${u.poczta_szyfrowanie === kod ? ' selected' : ''}>${
                escHtml(opis)}</option>`).join('')}</select></label>
          <label class="pole">Login
            <input id="u-poczta-login" maxlength="160" autocapitalize="none"
                   value="${escHtml(u.poczta_login || '')}"
                   placeholder="puste = taki jak nadawca"></label>
        </div>

        <label class="pole">Hasło do poczty
          <input id="u-poczta-haslo" type="password" autocomplete="new-password"
                 placeholder="${u.haslo_ustawione
                   ? 'hasło jest zapisane — zostaw puste, żeby go nie zmieniać'
                   : 'nie ustawiono'}"></label>

        <label class="pole">Stopka wiadomości
          <textarea id="u-poczta-stopka" rows="2" maxlength="2000">${
            escHtml(u.poczta_stopka || '')}</textarea></label>

        <div class="przyciski">
          <button id="u-test">Wyślij wiadomość próbną</button>
        </div>
        ${pocztaStan.blad ? `<div class="wstega blad">Ostatnia wysyłka nie powiodła się:
          ${escHtml(pocztaStan.blad)}</div>` : ''}
        ${terminyStan.ostatnio ? `<p class="slaby male">Automat terminów: ${
          escHtml(terminyStan.stan || '')}, ostatnio ${escHtml(terminyStan.ostatnio)}${
          terminyStan.pilne ? `, pilnych terminów: ${terminyStan.pilne}` : ''}.</p>` : ''}
      </div>

      ${sekcjaTunelu(u)}

      ${sekcjaGithub(u)}

      ${sekcjaKopii(u)}

      ${sekcjaKontGk(u)}

      ${sekcjaTrasexu(u)}

      <div class="karta">
        <h3>Cykle i progi</h3>
        <div class="dwie-kolumny">
          <label class="pole">Ostrzegaj na ile dni przed terminem
            <input id="u-ostrzegaj" type="number" inputmode="numeric" min="1" max="365"
                   value="${escHtml(u.ostrzegaj_dni || '30')}"></label>
          <label class="pole">Dzień zakładania przeglądów
            <input id="u-dzien-protokolu" type="number" inputmode="numeric" min="1" max="28"
                   value="${escHtml(u.przeglad_dzien_miesiaca || '1')}"></label>
          <label class="pole">Dzień ponaglenia kierowców
            <input id="u-dzien-ponaglenia" type="number" inputmode="numeric" min="1" max="28"
                   value="${escHtml(u.dzien_ponaglenia || '10')}"></label>
          <label class="pole">Próg skoku licznika (km/mies.)
            <input id="u-prog-skoku" type="number" inputmode="numeric" min="0"
                   value="${escHtml(u.prog_skoku_km || '10000')}"></label>
        </div>
        <p class="slaby male">Próg skoku niczego nie blokuje — przegląd z większym
        przebiegiem przejdzie, ale pojazd pokaże się na pulpicie do sprawdzenia.
        Zablokowanie zapisu kończyłoby się telefonem kierowcy do biura zamiast zdjęciami.</p>
      </div>

      <div class="karta">
        <h3>Checklista przeglądu wewnętrznego</h3>
        <p class="slaby male">Jedna pozycja na linię. Pusta lista = lista fabryczna.
        Jeśli zależy Ci, żeby zmiana nazwy punktu nie odcięła starych przeglądów,
        pisz <code>kod|Nazwa punktu</code>.</p>
        <label class="pole"><textarea id="u-punkty" rows="10" maxlength="6000">${
          escHtml(u.punkty_przegladu
            || (u.punkty || []).map(p => `${p.kod}|${p.etykieta}`).join('\n'))}</textarea></label>
      </div>

      <div class="karta">
        <h3>Trzymanie danych</h3>
        <div class="dwie-kolumny">
          <label class="pole">Zdjęcia trzymaj (miesięcy)
            <input id="u-retencja-zdjec" type="number" inputmode="numeric" min="0" max="240"
                   value="${escHtml(u.retencja_zdjec_mies || '0')}"></label>
          <label class="pole">Odczyty licznika trzymaj (dni)
            <input id="u-retencja-odczytow" type="number" inputmode="numeric" min="0" max="3650"
                   value="${escHtml(u.retencja_odczytow_dni || '0')}"></label>
        </div>
        <div class="wstega uwaga"><b>0 znaczy „trzymaj na zawsze"</b> i tak jest fabrycznie.
        Każda inna liczba kasuje TRWAŁE dane — zdjęcia przeglądów są jedynym dowodem
        stanu auta z danego miesiąca i nie da się ich odtworzyć. Przy najbliższej kopii
        znikają też z archiwów zdjęć (w <code>kopie/</code> i w folderze kopii poza
        komputerem). Zdjęcia usterek zostają.</div>
      </div>

      <div class="karta">
        <h3>Zestawienia do Excela</h3>
        <div class="chipy">
          <button class="chip" data-eksport="flota">Flota</button>
          <button class="chip" data-eksport="przeglady">Przeglądy</button>
          <button class="chip" data-eksport="koszty">Koszty</button>
        </div>
      </div>

      <div class="przyciski">
        <button class="glowny duzy" id="u-zapisz">Zapisz ustawienia</button>
      </div>`;

    podepnijTunel(pole);
    podepnijKopie(pole);
    podepnijKontaGk(pole);
    podepnijTrasex(pole);
    pole.querySelector('#u-zapisz').onclick = () => zapiszUstawienia();
    pole.querySelector('#u-test').onclick = () => oknoProbnejWiadomosci();
    pole.querySelectorAll('[data-eksport]').forEach(b => {
      b.onclick = () => pobierzZestawienie(b.dataset.eksport);
    });
  },
};

/* Adres HTTPS dla kierowców.

   To nie jest wygoda ani ozdobnik: przeglądarki włączają pełny tryb offline
   wyłącznie na localhost albo pod https. Pod firmowym http://192.168… kierowca
   na placu bez zasięgu nie otworzy programu w ogóle — a właśnie tam go
   potrzebuje. Dlatego ta sekcja tłumaczy, po co to jest, zanim poprosi
   o cokolwiek do wpisania.                                                   */
function sekcjaTunelu(u) {
  const t = u.tunel || {};
  const tryb = u.tunel_tryb || 'brak';
  const STANY = {
    wylaczony: ['', 'wyłączony'],
    uruchamiam: ['p-oczekuje', 'łączy się…'],
    dziala: ['p-zatwierdzony', 'działa'],
    blad: ['p-odrzucony', 'nie działa'],
  };
  const [klasa, opis] = STANY[t.stan] || STANY.wylaczony;

  return `
    <div class="karta">
      <div class="karta-gora"><h3>Adres HTTPS dla kierowców</h3>
        <span class="plakietka ${klasa}">${escHtml(opis)}</span></div>

      <div class="wstega info">Bez tego kierowcy mają <b>ograniczony</b> tryb offline:
        aplikacja przyjmie zdjęcia bez zasięgu, ale tylko jeśli była otwarta od wyjazdu.
        Przeglądarki włączają pełny tryb offline wyłącznie pod adresem
        <code>https://</code>. Tunel Cloudflare daje taki adres bez stałego IP
        i bez otwierania portów w routerze.</div>

      ${u.tunel_blokada_pinu ? `<div class="wstega blad">
        <b>Tunel nie ruszy, dopóki konta biura i administratora nie mają haseł
        min. 8 znaków (i nikt nie ma fabrycznego PIN-u „1234").</b><br>
        Za tym adresem stoi cała kartoteka floty — VIN-y, polisy, koszty i zdjęcia.
        Adres nie jest tajemnicą: boty skanują tę domenę i trafiają na świeży tunel
        w kilkanaście minut. Popraw w zakładce Konta:
        <ul>${(u.tunel_blokada_konta || []).map(k => `<li>${escHtml(k)}</li>`).join('')}</ul>
        </div>` : ''}

      ${t.blad ? `<div class="wstega blad">${escHtml(t.blad)}</div>` : ''}

      ${t.adres ? `<div class="wstega ok">Adres dla kierowców:
        <b>${escHtml(t.adres)}</b><br>
        <span class="male">Ten adres wpisuje się w telefonie i dodaje do ekranu
        głównego.</span></div>` : ''}

      ${stanStraznika(u.tunel_straznik, tryb)}

      <label class="pole">Tryb
        <select id="u-tunel-tryb">
          <option value="brak"${tryb === 'brak' ? ' selected' : ''}>
            wyłączony — program widoczny tylko w sieci firmy</option>
          <option value="szybki"${tryb === 'szybki' ? ' selected' : ''}>
            szybki — losowy adres, do sprawdzenia czy działa</option>
          <option value="staly"${tryb === 'staly' ? ' selected' : ''}>
            stały — własny adres z panelu Cloudflare</option>
        </select></label>

      <div id="u-tunel-opis" class="slaby male"></div>

      <label class="pole" id="u-tunel-token-pole">Token z panelu Cloudflare
        <input id="u-tunel-token" type="password" autocomplete="off"
               placeholder="${u.tunel_token_ustawiony
                 ? 'token jest zapisany — zostaw puste, żeby go nie zmieniać'
                 : 'wklej token tunelu'}"></label>

      <!-- W trybie szybkim adres wypisuje sam cloudflared i program go stamtąd
           bierze. W stałym nie wypisuje go wcale — zna go tylko panel
           Cloudflare — więc bez tego pola program działałby publicznie, nie
           znając własnego adresu: ekran „Dla kierowców" podawałby adres
           z firmowej sieci, a hub nie miałby czego wpisać do adres.json
           na Pages przy tunelu, który właśnie stoi. -->
      <label class="pole" id="u-tunel-adres-pole">Adres, pod którym tunel wystawia program
        <input id="u-tunel-adres" maxlength="200" autocapitalize="none"
               value="${escHtml(u.tunel_adres || '')}"
               placeholder="np. https://flota.twojafirma.pl"></label>
      <p class="slaby male" id="u-tunel-adres-opis">Ten sam, który wpisałeś
      w panelu Cloudflare przy tunelu (<i>Public hostname</i>).</p>

      <p class="slaby male">Zmiana działa od razu po zapisaniu. Program co 2 minuty
      sprawdza, czy adres odpowiada, i sam uruchamia tunel ponownie, gdy przestanie.</p>
    </div>`;
}

/* Strażnik tunelu: program sprawdza adres z zewnątrz, tak jak telefon.
   Tunel potrafi umrzeć po cichu (Cloudflare kasuje adres, a program dalej
   pokazuje „działa”) — ta linijka mówi, kiedy sprawdzono go naprawdę.          */
function stanStraznika(s, tryb) {
  if (!s || !s.wlaczony || tryb === 'brak') return '';
  if (s.odpowiada === false && s.internet === false) {
    return `<div class="wstega blad">Brak internetu w biurze od ${escHtml(s.od)}
      (${s.proby} ${s.proby === 1 ? 'próba' : 'prób'}) — tunel ruszy sam, gdy internet wróci.</div>`;
  }
  if (s.odpowiada === false) {
    return `<div class="wstega uwaga">Adres nie odpowiada od ${escHtml(s.od)}
      (${s.proby} ${s.proby === 1 ? 'próba' : 'prób'}): ${escHtml(s.powod)}.
      Po 3 próbach program uruchamia tunel ponownie${s.ostatni_restart
        ? ` (ostatnio o ${escHtml(s.ostatni_restart)})` : ''}.</div>`;
  }
  if (s.odpowiada === true) {
    return `<p class="slaby male">Ostatnio sprawdzony ${escHtml(s.sprawdzono)} — odpowiada.</p>`;
  }
  return '';
}

/* Opis pod listą trybów zmienia się razem z wyborem. Trzy akapity naraz nikt
   nie czyta; jeden, dotyczący tego, co się właśnie wybrało — owszem.         */
function podepnijTunel(pole) {
  const wybor = pole.querySelector('#u-tunel-tryb');
  const opis = pole.querySelector('#u-tunel-opis');
  const tokenPole = pole.querySelector('#u-tunel-token-pole');
  const adresPole = pole.querySelector('#u-tunel-adres-pole');
  const adresOpis = pole.querySelector('#u-tunel-adres-opis');
  const OPISY = {
    brak: 'Kierowcy wchodzą tylko z firmowego wifi, pod adresem http://192.168… '
      + 'Tryb offline działa w ograniczonym zakresie.',
    szybki: 'Adres losowy, w rodzaju https://cos-tam.trycloudflare.com, i ZMIENIA SIĘ '
      + 'po każdym uruchomieniu programu. Do sprawdzenia, czy wszystko działa — '
      + 'do codziennej pracy się nie nadaje, bo kierowcy dostawaliby rano nowy link.',
    staly: 'Własny, niezmienny adres. Token generuje się raz w panelu Cloudflare '
      + '(Zero Trust → Networks → Tunnels). Ten adres wpisuje się kierowcom raz '
      + 'i zostaje na zawsze.',
  };
  const odswiez = () => {
    opis.textContent = OPISY[wybor.value] || '';
    tokenPole.classList.toggle('ukryty', wybor.value !== 'staly');
    adresPole.classList.toggle('ukryty', wybor.value !== 'staly');
    adresOpis.classList.toggle('ukryty', wybor.value !== 'staly');
  };
  wybor.onchange = odswiez;
  odswiez();
}

/* Konta GK — połączenie z Panelem Kierownika (umowa GK-KONTA.md).

   Decyzja właściciela: jedna osoba ma jedno konto we wszystkich aplikacjach GK,
   zakładane w Panelu → Administracja. GK Flota pobiera konta sama (co 5 minut),
   a ten ekran mówi, czy to działa i co z kontami, których nie dało się przenieść.
   Klucz jak inne sekrety: widać tylko, że jest ustawiony.                    */
const STANY_KONT_GK = {
  wylaczone: ['p-oczekuje', 'wyłączone'],
  laczy: ['p-oczekuje', 'łączy się…'],
  ok: ['p-zatwierdzony', 'działa'],
  blad: ['p-odrzucony', 'nie działa'],
};

function sekcjaKontGk(u) {
  const s = u.konta_gk || {};
  const [klasa, opis] = STANY_KONT_GK[s.stan] || STANY_KONT_GK.wylaczone;
  const polaczone = !!(u.hub_adres && u.hub_klucz_ustawiony);
  const lok = s.lokalne || {};
  const lista = (tytul, pozycje) => (pozycje || []).length ? `<p class="male"><b>${tytul}</b></p>
    <ul class="male">${pozycje.map(p => `<li>${escHtml(p)}</li>`).join('')}</ul>` : '';
  return `
    <div class="karta">
      <div class="karta-gora"><h3>Konta GK (Panel Kierownika)</h3>
        <span class="plakietka ${klasa}">${escHtml(opis)}</span></div>

      <div class="wstega info">Jedna osoba — jedno konto we wszystkich aplikacjach GK.
        Konta zakłada się w <b>Panelu → Administracja</b>, a GK Flota pobiera je sama co
        kilka minut. Logowanie: <b>imię i nazwisko + PIN</b>; stare loginy działają dalej.
        Bez połączenia GK Flota prowadzi konta sama, jak dotąd.
        <b>Panel na tym komputerze łączy się sam</b> — hub robi klucz i podaje go programowi
        przez plik w profilu Windows, nic nie trzeba wklejać.</div>

      ${lok.auto ? `<div class="wstega ok">Połączono samo z Panelem na tym komputerze
        (<code>${escHtml(u.hub_adres || '')}</code>).</div>`
        : lok.plik === 'wylaczone' ? `<div class="wstega uwaga">Połączenie jest wyłączone w Panelu →
          Administracja → Połączenia GK — program nie łączy się sam, dopóki administrator Panelu go nie włączy.</div>`
        : lok.plik === 'reczny' && !polaczone ? `<div class="wstega uwaga">W Panelu utworzono klucz ręcznie — wklej
          go niżej albo w Panelu kliknij „Połącz na tym komputerze”.</div>`
        : lok.odlaczony ? '<p class="slaby male">Odłączono ręcznie — program nie łączy się sam.</p>' : ''}
      ${s.blad ? `<div class="wstega blad">${escHtml(s.blad)}</div>` : ''}
      ${s.ostrzezenie ? `<div class="wstega uwaga">${escHtml(s.ostrzezenie)}</div>` : ''}
      ${s.stan === 'ok' ? `<p class="slaby male">Ostatnio pobrano ${escHtml(s.ostatnio || '')}:
        ${Number(s.konta) || 0} ${odmiana(Number(s.konta) || 0, 'osoba', 'osoby', 'osób')}
        z rolą GK Flota.${u.konta_z_huba ? ' Konta prowadzi Panel.' : ''}</p>` : ''}
      ${lista('Bez konta — PIN do ustawienia w Panelu albo niech zaloguje się raz w aplikacji GK:',
              s.bez_pinu)}
      ${lista('Do wyjaśnienia:', s.konflikty)}

      <div class="dwie-kolumny">
        <label class="pole">Adres Panelu Kierownika
          <input id="u-hub-adres" maxlength="200" autocapitalize="none" spellcheck="false"
                 value="${escHtml(u.hub_adres || '')}"
                 placeholder="np. https://panel.twojafirma.pl"></label>
        <label class="pole">Klucz z Panelu (Administracja → Połączenia GK)
          <input id="u-hub-klucz" type="password" autocomplete="off" spellcheck="false"
                 placeholder="${u.hub_klucz_ustawiony
                   ? 'klucz jest zapisany — zostaw puste, żeby go nie zmieniać'
                   : 'wklej klucz utworzony dla GK Flota'}"></label>
      </div>
      <p class="slaby male">Ręcznie tylko dla Panelu na innym komputerze: adres musi zaczynać się
        od <code>https://</code> (na tym komputerze <code>http://127.0.0.1:8790</code> wpisuje się sam).
        Identyfikator tej instalacji: <code>${escHtml(u.hub_instancja || '—')}</code>.</p>

      <div class="przyciski">
        <button id="u-hub-sprawdz">Sprawdź</button>
        ${lok.mozna && (!polaczone || lok.odlaczony || s.stan === 'blad')
          ? '<button id="u-hub-lokalnie">Połącz z Panelem na tym komputerze</button>' : ''}
        <button id="u-hub-pobierz"${polaczone ? '' : ' disabled'}>Pobierz teraz</button>
        <button id="u-hub-import"${polaczone ? '' : ' disabled'}>Przenieś konta do Panelu</button>
        <button class="niszczacy${polaczone ? '' : ' ukryty'}" id="u-hub-odlacz">Odłącz</button>
      </div>
      <p class="slaby male">„Przenieś konta do Panelu” robi się raz: konta biura i kierowcy
        założeni tutaj trafiają do Panelu z obecnymi PIN-ami (kierowców z GK Trasy przenosi
        GK Trasy). Awaryjny „admin” zostaje tylko tutaj.${
        (s.do_przeniesienia || 0) ? ` Do przeniesienia: <b>${Number(s.do_przeniesienia)}</b>.` : ''}</p>
    </div>`;
}

function podepnijKontaGk(pole) {
  const we = id => pole.querySelector('#' + id);
  we('u-hub-sprawdz').onclick = async () => {
    const dane = { hub_adres: we('u-hub-adres').value.trim() };
    const klucz = we('u-hub-klucz').value.trim();
    if (klucz) dane.hub_klucz = klucz;
    if (!dane.hub_adres) { komunikat('Wpisz adres Panelu Kierownika', 'blad'); return; }
    const w = await sprobuj(() => API.post('/api/panel/sprawdz', dane));
    if (!w) { odswiezEkran(); return; }
    await potwierdz('Połączenie działa', w.komunikat + ' Konta pobiorą się same w ciągu '
      + 'chwili — albo od razu przyciskiem „Pobierz teraz”.', { tak: 'Dobrze', nie: 'Zamknij' });
    odswiezEkran();
  };
  const lokalnie = we('u-hub-lokalnie');
  if (lokalnie) lokalnie.onclick = async () => {
    const w = await sprobuj(() => API.post('/api/panel/lokalnie', {}));
    if (!w) return;
    komunikat(['polaczono', 'polaczony'].includes(w.wynik) ? 'Połączono z Panelem na tym komputerze — konta przyjdą za chwilę'
      : w.wynik === 'wylaczone_w_panelu' ? 'Połączenie jest wyłączone w Panelu → Administracja → Połączenia GK'
        : 'Poprosiłem Panel o klucz — połączy się sam w ciągu minuty', w.wynik === 'wylaczone_w_panelu' ? 'blad' : 'ok');
    setTimeout(() => { if (stan.ekran === 'ustawienia') odswiezEkran(); }, 1500);
  };
  we('u-hub-pobierz').onclick = async () => {
    const w = await sprobuj(() => API.post('/api/panel/pobierz', {}));
    if (w) {
      const r = w.wynik || {};
      komunikat(`Pobrano: nowe ${r.dodane || 0}, zmienione ${r.zmienione || 0}, `
        + `przeniesione ${r.przejete || 0}, wyłączone ${r.wylaczone || 0}`, 'ok');
    }
    odswiezEkran();
  };
  we('u-hub-import').onclick = async () => {
    if (!await potwierdz('Przenieść konta do Panelu Kierownika?',
      'Konta biura i kierowców założone w GK Flota trafią do Panelu razem z obecnymi PIN-ami '
      + '(PIN się nie zmienia). Osoba, która w Panelu już jest, dostanie tylko rolę GK Flota '
      + 'i swój stary login — jej PIN z Panelu wygrywa. Potem konta zmienia się już tylko '
      + 'w Panelu.', { tak: 'Przenieś' })) return;
    const w = await sprobuj(() => API.post('/api/panel/import', {}));
    if (!w) return;
    const konflikty = w.konflikty || [];
    okno({
      tytul: 'Konta przeniesione',
      tresc: `<div class="wstega ok">Wysłano ${Number(w.wyslane) || 0}
          ${odmiana(Number(w.wyslane) || 0, 'konto', 'konta', 'kont')}: nowych w Panelu
          ${Number(w.dodane) || 0}, połączonych z osobami w Panelu ${Number(w.polaczone) || 0}.</div>
        ${konflikty.length ? `<div class="wstega uwaga"><b>Nie przeniesiono:</b><ul>${
          konflikty.map(k => `<li><b>${escHtml(k.login || '')}</b> — ${escHtml(k.powod || '')}</li>`)
            .join('')}</ul>Te konta zostają w GK Flota. Hasło biura musi mieć co najmniej
          8 znaków, a program zna jego długość dopiero po jednym logowaniu tej osoby w tej
          wersji — niech się zaloguje (albo ustaw hasło w Panelu) i przenieś jeszcze raz.
          Nic się nie zdubluje.</div>` : ''}`,
      przyciski: [{ napis: 'Zamknij', klasa: 'glowny', klik: z => { z(); odswiezEkran(); } }],
    });
  };
  we('u-hub-odlacz').onclick = async () => {
    if (!await potwierdz('Odłączyć GK Flota od Panelu Kierownika?',
      'Konta z Panelu zostają i logowanie działa dalej, ale od teraz zmienia się je tutaj, '
      + 'a zmiany w Panelu przestaną tu docierać. Program nie połączy się sam od nowa.',
      { tak: 'Odłącz', groznie: true })) return;
    if (!await sprobuj(() => API.post('/api/panel/odlacz', {}), 'Odłączono od Panelu')) return;
    odswiezEkran();
  };
}

/* Połączenie z GK Trasy (GK Transport, umowa w GK-TRANSPORT.md).

   Klucz losuje serwer i pokazuje go RAZ — potem wraca tu tylko „ustawiony".
   Nie ma pola do wpisania klucza z palca: wymyślony przez człowieka byłby
   krótki, a otwiera GK Trasy całą kartotekę floty i konta kierowców.
   Poza formularzem Ustawień (i poza „Zapisz ustawienia"), bo nowy klucz
   działa od razu, a stary w tej samej chwili przestaje.                      */
function sekcjaTrasexu(u) {
  const wlaczone = !!u.gk_klucz_ustawiony;
  return `
    <div class="karta">
      <div class="karta-gora"><h3>Połączenie z GK Trasy</h3>
        <span class="plakietka p-${wlaczone ? 'zatwierdzony' : 'oczekuje'}">${
          wlaczone ? 'klucz ustawiony' : 'wyłączone'}</span></div>

      <p class="slaby male">GK Trasy pokazuje planiście, które auta są sprawne,
      zakłada tu konta kierowców, przysyła przebieg, tankowania i usterki
      z raportów dziennych, a kierowca wchodzi z GK Trasy do „Moje auto”
      bez drugiego logowania.</p>
      ${wlaczone && u.gk_instancja_przypieta ? `<p class="slaby male">Klucza używa już
        jedna instalacja GK Trasy. Inna (np. testowa kopia) dostanie odmowę — żeby
        przenieść połączenie na inny komputer, utwórz nowy klucz.</p>` : ''}

      <div id="u-gk-nowy" class="ukryty">
        <div class="wstega ok">Nowy klucz — widać go <b>tylko teraz</b>.
          Wklej go w programie GK Trasy: <b>Ustawienia → GK Flota</b>.</div>
        <div class="przyciski">
          <input id="u-gk-klucz" readonly autocomplete="off" spellcheck="false"
                 style="flex:1; min-width:0; font-family:monospace">
          <button id="u-gk-kopiuj">Kopiuj</button>
        </div>
      </div>

      <div class="przyciski">
        <button id="u-gk-generuj">Nowy klucz</button>
        <button class="niszczacy${wlaczone ? '' : ' ukryty'}" id="u-gk-wylacz">Wyłącz połączenie</button>
      </div>
    </div>`;
}

function podepnijTrasex(pole) {
  const pokazKlucz = (klucz) => {
    pole.querySelector('#u-gk-nowy').classList.remove('ukryty');
    const poleKlucza = pole.querySelector('#u-gk-klucz');
    poleKlucza.value = klucz;
    poleKlucza.focus();
    poleKlucza.select();
  };
  const wylacz = pole.querySelector('#u-gk-wylacz');
  pole.querySelector('#u-gk-generuj').onclick = async () => {
    const byl = !wylacz.classList.contains('ukryty');
    if (byl && !await potwierdz('Utworzyć nowy klucz?',
      'Stary klucz przestanie działać od razu — GK Trasy straci połączenie z GK Flota, '
      + 'dopóki nie wkleisz mu nowego.', { tak: 'Nowy klucz', groznie: true })) return;
    const w = await sprobuj(() => API.post('/api/gk/nowy-klucz', {}));
    if (!w || !w.klucz) return;
    // Plakietkę i przycisk „Wyłącz" odświeżamy bez przerysowania ekranu —
    // przerysowanie zgubiłoby klucz, którego drugi raz już nie zobaczymy.
    const plakietka = pole.querySelector('#u-gk-generuj').closest('.karta')
      .querySelector('.plakietka');
    plakietka.className = 'plakietka p-zatwierdzony';
    plakietka.textContent = 'klucz ustawiony';
    wylacz.classList.remove('ukryty');
    pokazKlucz(w.klucz);
  };
  pole.querySelector('#u-gk-kopiuj').onclick = async () => {
    const poleKlucza = pole.querySelector('#u-gk-klucz');
    try {
      // Schowek przez API działa tylko pod https albo na localhost; pod
      // http://192.168… zostaje stare zaznacz-i-kopiuj.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(poleKlucza.value);
      } else {
        poleKlucza.select();
        document.execCommand('copy');
      }
      komunikat('Klucz skopiowany', 'ok');
    } catch (e) {
      poleKlucza.select();
      komunikat('Nie udało się skopiować — zaznaczyłem klucz, skopiuj go ręcznie', 'blad');
    }
  };
  wylacz.onclick = async () => {
    if (!await potwierdz('Wyłączyć połączenie z GK Trasy?',
      'GK Trasy przestanie widzieć stan aut i wysyłać raporty. Konta kierowców '
      + 'z GK Trasy zostają. Żeby włączyć z powrotem, utworzysz nowy klucz.',
      { tak: 'Wyłącz', groznie: true })) return;
    if (!await sprobuj(() => API.post('/api/gk/nowy-klucz', { wylacz: true }),
                       'Połączenie z GK Trasy wyłączone')) return;
    await wczytajSlowniki().catch(() => {});
    odswiezEkran();
  };
}

/* Stały adres dla kierowców przez GitHub Pages (D33, D42).

   Rozwiązuje jedną konkretną rzecz: adres tunelu w trybie szybkim zmienia się
   po każdym uruchomieniu programu, a przeglądarka wiąże kolejkę niewysłanych
   zdjęć, zapisane logowanie i pamięć offline z ADRESEM. Bez stałego adresu
   kierowca po każdym restarcie trafiałby na nowy — i zostawiał komplet zdjęć
   z placu pod starym, bez żadnej drogi powrotu.

   Od D42 jest jedna strona wszystkich aplikacji GK, a wysyła ją Panel Kierownika
   (hub na tym samym komputerze) jednym tokenem. Program podaje mu adres tunelu
   i wersję — tu nic się nie ustawia, karta mówi tylko, co leży na Pages.      */
function sekcjaGithub(u) {
  const p = u.pages || {};
  const tunelDziala = (u.tunel || {}).adres;
  const [klasa, opis] = !p.lokalne ? ['p-oczekuje', 'kopia testowa']
    : !p.hub_odpisal ? ['p-oczekuje', 'czeka na Panel']
    : p.adres_blad ? ['p-odrzucony', 'błąd']
    : !p.opublikowano ? ['p-oczekuje', 'nie wysłano']
    : p.aktualna ? ['p-zatwierdzony', 'aktualna'] : ['p-oczekuje', 'wysyła nową wersję'];

  return `
    <div class="karta">
      <div class="karta-gora"><h3>Stały adres dla kierowców (GitHub Pages)</h3>
        <span class="plakietka ${klasa}">${escHtml(opis)}</span></div>

      <div class="wstega info">Kierowcy dostają <b>jeden adres na zawsze</b>, który
        działa z każdej sieci. <b>Adres dla telefonów publikuje Panel Kierownika (hub)</b>
        na tym komputerze, tym samym tokenem co aplikacje hali: program podaje mu adres
        tunelu i swoją wersję, hub wysyła je na GitHub sam. Na Pages leży sam wygląd
        aplikacji — dane zostają tutaj.<br>
        <a href="${escHtml(p.adres || '')}" target="_blank" rel="noopener"><b>${escHtml(p.adres || '')}</b></a></div>

      ${stanPages(p, tunelDziala)}

      ${!tunelDziala ? `<div class="wstega uwaga">Najpierw musi działać tunel.
        Bez adresu <code>https://</code> aplikacja na Pages nie będzie miała
        się gdzie połączyć po dane.</div>` : ''}

      <p class="slaby male">Nowy adres tunelu (po każdym uruchomieniu) i nową wersję
      programu (po aktualizacji) hub wysyła sam, zwykle w ciągu minuty. Szczegóły i błędy:
      Panel → Administracja → Dostęp z telefonów.</p>
    </div>`;
}

/* Stan paczki na Pages według huba: kiedy wysłano, czy to ta sama wersja co
   program i czy adres danych jest bieżący. */
function stanPages(p, tunel) {
  if (!p || !p.adres) return '';
  if (!p.lokalne) return `<div class="wstega uwaga">Ta kopia programu nie zgłasza adresu hubowi
    (kopia testowa albo druga kopia na innym porcie).</div>`;
  if (!p.hub_odpisal) return `<div class="wstega uwaga">Panel Kierownika jeszcze się nie odezwał.
    Sprawdź, czy GK Panel Kierownika działa na tym komputerze (nowa wersja, D42).</div>`;
  const bezUkosnika = a => String(a || '').replace(/\/+$/, '');
  const staryAdres = !!tunel && !!p.adres_api && bezUkosnika(p.adres_api) !== bezUkosnika(tunel);
  return `
    ${p.opublikowano ? `<div class="wstega ${p.aktualna ? 'info' : 'uwaga'}">
      ${p.aktualna ? '' : '<b>Hub wysyła nową wersję aplikacji</b><br>'}
      <span class="male">Wysłano: <b>${escHtml(polskaData(p.opublikowano))} ${escHtml(samaGodzina(p.opublikowano))}</b> ·
        wersja na Pages <code>${escHtml(p.wersja_pages || '?')}</code>,
        programu <code>${escHtml(p.wersja_programu || '?')}</code></span>
    </div>` : '<div class="wstega uwaga">Hub jeszcze nie wysłał aplikacji na Pages.</div>'}
    ${p.adres_blad ? `<div class="wstega blad">Panel Kierownika nie wysłał adresu na GitHub:
      ${escHtml(p.adres_blad)} Hub ponawia sam — szczegóły w Panelu → Administracja →
      Dostęp z telefonów.</div>`
      : staryAdres ? `<div class="wstega uwaga">Na Pages jest jeszcze poprzedni adres
      tunelu (<code>${escHtml(p.adres_api)}</code>). Hub zwykle poprawia go sam w ciągu
      minuty.</div>` : ''}`;
}

async function zapiszUstawienia() {
  const we = id => document.getElementById(id);
  const dane = {
    firma: we('u-firma').value.trim(),
    poczta_wlaczona: we('u-poczta-wlaczona').checked ? '1' : '0',
    mail_biura: we('u-mail-biura').value.trim(),
    poczta_nadawca: we('u-poczta-nadawca').value.trim(),
    poczta_serwer: we('u-poczta-serwer').value.trim(),
    poczta_port: we('u-poczta-port').value.trim(),
    poczta_szyfrowanie: we('u-poczta-szyfrowanie').value,
    poczta_login: we('u-poczta-login').value.trim(),
    poczta_stopka: we('u-poczta-stopka').value,
    ostrzegaj_dni: we('u-ostrzegaj').value.trim(),
    przeglad_dzien_miesiaca: we('u-dzien-protokolu').value.trim(),
    dzien_ponaglenia: we('u-dzien-ponaglenia').value.trim(),
    prog_skoku_km: we('u-prog-skoku').value.trim(),
    punkty_przegladu: we('u-punkty').value,
    retencja_zdjec_mies: we('u-retencja-zdjec').value.trim(),
    retencja_odczytow_dni: we('u-retencja-odczytow').value.trim(),
    tunel_tryb: we('u-tunel-tryb').value,
    tunel_adres: we('u-tunel-adres').value.trim(),
    hub_adres: we('u-hub-adres').value.trim(),
    kopia_folder: we('u-kopia-folder').value.trim(),
  };
  // Klucz Panelu jak inne sekrety: puste pole znaczy „nie zmieniaj”.
  const kluczPanelu = we('u-hub-klucz').value.trim();
  if (kluczPanelu) dane.hub_klucz = kluczPanelu;
  // Puste pole tokenu znaczy „nie zmieniaj", tak samo jak przy haśle poczty.
  const token = we('u-tunel-token').value.trim();
  if (token) dane.tunel_token = token;
  // Puste pole hasła znaczy „nie zmieniaj", nie „skasuj". Serwer trzyma tę samą
  // zasadę, ale gdybyśmy wysłali tu pusty napis, jedno otwarcie i zapisanie
  // ekranu Ustawień skasowałoby firmie hasło do poczty.
  const haslo = we('u-poczta-haslo').value;
  if (haslo) dane.poczta_haslo = haslo;

  if (dane.poczta_wlaczona === '1' && !dane.mail_biura) {
    komunikat('Włączony automat bez adresu biura nie ma dokąd wysyłać alarmów', 'blad');
    return;
  }
  const trybPrzed = (stan.ustawienia && stan.ustawienia.tunel_tryb) || 'brak';
  // 409 przy retencji zdjęć znaczy „zapytaj i ponów”: serwer podaje, ile zdjęć
  // zniknie. Bez tego pytania okres retencji nie dawał się ustawić wcale —
  // ekran pokazywał tylko błąd.
  try {
    await API.post('/api/ustawienia', dane);
  } catch (e) {
    if (e.kod !== 409) { komunikat(poLudzku(e), 'blad'); return; }
    if (!await potwierdz('Skasować zdjęcia na zawsze?', e.message,
                         { tak: 'Tak, skasuj', nie: 'Nie', groznie: true })) return;
    dane.potwierdzam_kasowanie = true;
    if (!await sprobuj(() => API.post('/api/ustawienia', dane))) return;
  }
  komunikat('Ustawienia zapisane', 'ok');
  await wczytajSlowniki().catch(() => {});
  odswiezEkran();
  // Zapis przestawia tunel od razu, ale cloudflared potrzebuje kilku sekund na
  // adres. Bez ponownego odczytu ekran zostałby na „łączy się…” i biuro
  // szukałoby błędu tam, gdzie go nie ma.
  if (dane.tunel_tryb !== trybPrzed || token) czekajNaTunel();
}

async function czekajNaTunel() {
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (stan.ekran !== 'ustawienia') return;
    let u;
    try { u = await API.get('/api/ustawienia'); } catch (e) { return; }
    if (((u.tunel || {}).stan) !== 'uruchamiam') { odswiezEkran(); return; }
  }
  odswiezEkran();
}

function oknoProbnejWiadomosci() {
  okno({
    tytul: 'Wiadomość próbna',
    tresc: `<p class="slaby">Sprawdź ustawienia poczty, zanim cokolwiek pójdzie
      do ludzi. Zapisz najpierw ustawienia — wiadomość idzie po tych,
      które są w bazie, a nie po tych na ekranie.</p>
      <label class="pole">Adres do sprawdzenia
        <input id="pt-adres" type="email" maxlength="160"
               value="${escHtml((stan.ustawienia && stan.ustawienia.mail_biura) || '')}"></label>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Wyślij', klasa: 'glowny', klik: async (zamknij) => {
        const adres = document.getElementById('pt-adres').value.trim();
        if (!adres.includes('@')) { komunikat('Podaj adres e-mail', 'blad'); return; }
        if (!await sprobuj(() => API.post('/api/poczta/test', { adres }),
                           'Wiadomość wysłana — sprawdź skrzynkę')) return;
        zamknij();
      } },
    ],
  });
}

/* Pobieranie idzie przez token jednorazowy, bo <a download> nie umie wysłać
   nagłówka Authorization. Token żyje kilka minut i pozwala wyłącznie czytać. */
async function pobierzZestawienie(nazwa) {
  const w = await sprobuj(() => API.post('/api/eksport/token', { zakres: 'eksport' }));
  if (!w || !w.token) return;
  const adres = `${API_BAZA}/api/eksport/${nazwa}.csv?t=${encodeURIComponent(w.token)}`;
  // location.href, a nie nowa karta: przeglądarki telefonów blokują okna
  // otwierane po await, a plik i tak tylko się pobiera.
  window.location.href = adres;
}

/* Alarmy programu (kopia, adres na Pages, tunel, miejsce na dysku) —
   te same wstęgi na pulpicie administratora i na górze Ustawień. Serwer liczy
   je sam (alarmy_systemu) i wysyła też push do biura, raz na 6 godzin.       */
function wstegiAlarmow(alarmy) {
  return (alarmy || []).map(a => `<div class="wstega ${a.push ? 'blad' : 'uwaga'}">
    <b>${escHtml(a.tytul || '')}</b> — ${escHtml(a.tekst || '')}</div>`).join('');
}

/* Kopie zapasowe (ETAP 2). Kopia na tym samym dysku co program chroni przed
   własną pomyłką, nie przed awarią dysku, kradzieżą czy pożarem. Dlatego
   folder poza komputerem: pendrive, dysk sieciowy albo folder OneDrive —
   tylko na kopie, nigdy na żywą bazę.                                         */
function sekcjaKopii(u) {
  const k = u.kopia || {};
  const kiedy = k.ostatnia ? `${polskaData(k.ostatnia)} ${samaGodzina(k.ostatnia)}` : '';
  const [klasa, opis] = k.trwa ? ['p-oczekuje', 'kopia w toku…']
    : !k.folder ? ['p-oczekuje', 'tylko na tym komputerze']
    : k.blad || k.dostepny === false ? ['p-odrzucony', 'nie działa']
    : k.ostatnia ? ['p-zatwierdzony', 'działa'] : ['p-oczekuje', 'czeka na pierwszą kopię'];
  return `
    <div class="karta" id="u-kopie">
      <div class="karta-gora"><h3>Kopie zapasowe</h3>
        <span class="plakietka ${klasa}">${escHtml(opis)}</span></div>

      <div class="wstega info">Program sam robi kopię bazy i archiwa zdjęć (jedno na
        miesiąc) w folderze <code>kopie/</code> obok siebie. To chroni przed pomyłką,
        nie przed awarią dysku. <b>Raz dziennie</b> kopiuje też bazę (bez haseł
        i tokenów) i archiwa zdjęć do folderu <b>poza komputerem</b>; trzyma 7 dni,
        4 tygodnie i 12 miesięcy.</div>

      ${k.blad ? `<div class="wstega blad">${escHtml(k.blad)}</div>` : ''}
      ${k.ten_sam_dysk ? `<div class="wstega uwaga">Ten folder leży na tym samym dysku
        co program. To wystarcza tylko wtedy, gdy to folder <b>OneDrive</b> (albo inny
        synchronizowany z chmurą) — inaczej awaria dysku zabierze i program, i kopię.</div>` : ''}

      <label class="pole">Folder kopii poza komputerem
        <input id="u-kopia-folder" maxlength="400" autocapitalize="none" spellcheck="false"
               value="${escHtml(k.folder || '')}"
               placeholder="np. E:\\GK-kopie albo folder OneDrive"></label>
      <p class="slaby male">Np. <code>E:\\GK-kopie</code> albo folder OneDrive — tylko na
        kopie, nigdy na żywą bazę. Program założy w nim podfolder <code>GK-Flota</code>.</p>

      <p class="slaby male">Ostatnia kopia poza komputerem: <b>${escHtml(kiedy || 'jeszcze żadnej')}</b>
        · kopii bazy w <code>kopie/</code>: ${Number(k.lokalne_bazy) || 0}
        · archiwów zdjęć: ${Number(k.archiwa) || 0}</p>

      <div class="przyciski">
        <button id="u-kopia-teraz"${k.folder && !k.trwa ? '' : ' disabled'}>Zrób kopię teraz</button>
      </div>
      <p class="slaby male">Jak odtworzyć dane z kopii — instrukcja, punkt 12.</p>
    </div>`;
}

function podepnijKopie(pole) {
  const przycisk = pole.querySelector('#u-kopia-teraz');
  if (!przycisk) return;
  przycisk.onclick = async () => {
    const s = await sprobuj(() => API.post('/api/kopia/teraz', {}), 'Kopia w toku…');
    if (!s) return;
    // Kopia idzie w tle (archiwa na pendrive potrafią się kopiować minutami),
    // więc pytamy o stan, aż się skończy — i dopiero wtedy odświeżamy ekran.
    przycisk.disabled = true;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const k = await API.get('/api/kopia').catch(() => null);
      if (k && !k.trwa) {
        komunikat(k.blad ? 'Kopia nie powiodła się — szczegóły w Ustawieniach' : 'Kopia gotowa',
                  k.blad ? 'blad' : 'ok');
        break;
      }
    }
    odswiezEkran();
  };
}
