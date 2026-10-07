/* „Dla kierowców" — jak wsadzić program do telefonu kierowcy.

   Ekran biura, pokazywany kierowcy stojącemu obok. Cała robota polega na tym,
   żeby nikt nie musiał przepisywać adresu: kierowca skanuje kod aparatem,
   dodaje stronę do ekranu głównego i ma aplikację.

   Ekran mówi też wprost rzecz, którą łatwo przeoczyć: czy ten kod będzie
   działał jutro. Adres z tunelu w trybie szybkim zmienia się po każdym
   uruchomieniu programu — i bez restartu, gdy strażnik tunelu sam postawi
   nowy tunel — więc wydrukowanie go i przyklejenie w szatni kończy się
   stertą kartek, z których żadna nie działa.                                 */

EKRANY.zaproszenie = {
  tytul: 'Dla kierowców',
  tylkoBiuro: true,

  async rysuj(pole) {
    const z = await sprobuj(() => API.get('/api/zaproszenie'));
    if (!z) {
      pole.innerHTML = '<div class="pusto">Nie udało się ustalić adresu programu.</div>';
      return;
    }
    const tunelowy = z.skad === 'tunel';
    const naGithubie = z.skad === 'github';
    // Na Pages adres SAMEJ aplikacji jest stały, ale dane nadal stoją w biurze.
    // Bez tunelu kierowca otworzy program z drugiego końca Polski i zobaczy
    // pusty ekran — dlatego to dwa osobne zdania, a nie jedno.
    const daneWSwiat = !!z.adres_danych;

    pole.innerHTML = `
      ${z.skad === 'siec' ? `<div class="wstega uwaga">
        <b>Ten adres działa tylko w firmowym wifi.</b>
        Kierowca spod domu albo z drogi się nie połączy. Żeby program otwierał się
        z dowolnej sieci, włącz tunel w <b>Ustawieniach → Adres HTTPS dla kierowców</b>.
        </div>` : ''}

      ${naGithubie && daneWSwiat ? `<div class="wstega ok">
        <b>Ten adres jest stały i działa na całym świecie, w dowolnym wifi.</b>
        Kod można wydrukować i powiesić w szatni — będzie prowadził w to samo
        miejsce także za rok. Telefony kierowców same znajdują program w biurze,
        nawet gdy tunel dostanie po drodze nowy adres.
        </div>` : ''}

      ${naGithubie && !daneWSwiat ? `<div class="wstega uwaga">
        <b>Sama aplikacja otworzy się wszędzie, ale dane są tylko w firmowym wifi.</b>
        Kierowca spod domu zobaczy ekran logowania i nic więcej. Włącz tunel
        w <b>Ustawieniach → Adres HTTPS dla kierowców</b> — nowy adres wpisze na GitHub sam
        Panel Kierownika (hub na tym komputerze).
        </div>` : ''}

      ${tunelowy && !z.adres_trwaly ? `<div class="wstega uwaga">
        <b>Ten adres zmieni się po ponownym uruchomieniu programu</b> — a także
        wtedy, gdy program sam uruchomi nowy tunel, bo stary przestał odpowiadać
        (strażnik tunelu). Tunel działa w trybie szybkim. Nie drukuj tego kodu
        ani nie rozsyłaj go na stałe — do tego służy GitHub Pages (aplikację wysyła tam
        Panel Kierownika — hub na tym komputerze; stan w <b>Ustawieniach → Stały adres dla
        kierowców</b>) albo tryb stały z własnym adresem. Telefony z aplikacją z GitHub Pages
        znajdą nowy adres tunelu same.
        </div>` : ''}

      ${tunelowy && z.adres_trwaly ? `<div class="wstega ok">
        Adres jest stały. Ten kod można wydrukować i powiesić w szatni —
        będzie działał także za rok.</div>` : ''}

      <div class="karta">
        <div class="karta-gora"><h3>Zeskanuj telefonem</h3>
          <button id="zp-drukuj">Drukuj</button></div>

        <div class="zaproszenie">
          <div class="zaproszenie-kod">${z.qr}</div>
          <div class="zaproszenie-obok">
            <p class="slaby male" style="margin:0 0 6px">Adres programu:</p>
            <p class="zaproszenie-adres" id="zp-adres">${escHtml(z.adres)}</p>
            <div class="przyciski">
              <button id="zp-kopiuj">Skopiuj adres</button>
            </div>
            <p class="slaby male">Aparat w telefonie rozpozna kod sam — nie trzeba
            żadnej dodatkowej aplikacji. Wystarczy wycelować i dotknąć powiadomienia,
            które się pojawi.</p>
          </div>
        </div>
      </div>

      <div class="karta">
        <h3>Powiedz kierowcy, żeby zrobił to raz</h3>
        <p class="slaby male">Bez tego kroku program otwiera się jako zwykła strona.
        Po nim wygląda i działa jak aplikacja: własna ikona, pełny ekran,
        i — pod adresem <code>https://</code> — otwiera się też bez zasięgu.</p>

        <div class="dwie-kolumny">
          <div>
            <h4>iPhone (Safari)</h4>
            <ol class="kroki">
              <li>Zeskanuj kod i otwórz stronę.</li>
              <li>Dotknij przycisku <b>Udostępnij</b> (kwadrat ze strzałką w górę,
                  na dole ekranu).</li>
              <li>Przewiń i wybierz <b>Dodaj do ekranu początkowego</b>.</li>
              <li>Dotknij <b>Dodaj</b>.</li>
            </ol>
          </div>
          <div>
            <h4>Android (Chrome)</h4>
            <ol class="kroki">
              <li>Zeskanuj kod i otwórz stronę.</li>
              <li>Dotknij <b>trzech kropek</b> w prawym górnym rogu.</li>
              <li>Wybierz <b>Zainstaluj aplikację</b> albo
                  <b>Dodaj do ekranu głównego</b>.</li>
              <li>Potwierdź.</li>
            </ol>
          </div>
        </div>

        <div class="wstega info">Kierowca loguje się imieniem i nazwiskiem
        (albo loginem) i swoim PIN-em — tak samo jak w innych aplikacjach GK.
        Konto zakładasz w zakładce <b>Konta</b> (albo w Panelu Kierownika, gdy
        konta przychodzą z Panelu).</div>${naGithubie ? `

        <div class="wstega info"><b>Ten krok robi się raz na zawsze.</b>
        Ikona na ekranie telefonu prowadzi pod stały adres, więc kierowca nie
        będzie musiał skanować kodu po raz drugi — ani po zmianie adresu tunelu,
        ani po przeniesieniu programu na inny komputer. Zdjęcia czekające
        na zasięg też zostają tam, gdzie były.</div>` : ''}
      </div>`;

    pole.querySelector('#zp-kopiuj').onclick = () => skopiujAdres(z.adres);
    pole.querySelector('#zp-drukuj').onclick = () => window.print();
  },
};

/* Kopiowanie działa dwiema drogami, bo ta nowoczesna wymaga https albo
   localhost — a biuro siedzi pod http://192.168… i tam jej po prostu nie ma. */
async function skopiujAdres(adres) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(adres);
      komunikat('Adres skopiowany', 'ok');
      return;
    }
  } catch (e) { /* lecimy dalej, jest druga droga */ }
  try {
    const pomocnicze = document.createElement('textarea');
    pomocnicze.value = adres;
    pomocnicze.setAttribute('readonly', '');
    pomocnicze.style.position = 'fixed';
    pomocnicze.style.opacity = '0';
    document.body.appendChild(pomocnicze);
    pomocnicze.select();
    const udalo = document.execCommand('copy');
    document.body.removeChild(pomocnicze);
    komunikat(udalo ? 'Adres skopiowany' : 'Zaznacz adres i skopiuj ręcznie',
              udalo ? 'ok' : 'blad');
  } catch (e) {
    komunikat('Zaznacz adres i skopiuj ręcznie', 'blad');
  }
}
