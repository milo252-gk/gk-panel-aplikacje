/* Rdzen aplikacji: logowanie, przelaczanie ekranow, rozmowa z serwerem
   i wysylanie kolejki offline.

   Ten plik jest UMOWA dla pozostalych: zaklada wspolny obiekt 'stan',
   rejestr EKRANY i komplet narzedzi (escHtml, komunikat, okno, potwierdz,
   API, sprobuj). Pliki ekranow nic wlasnego w tych sprawach nie robia.
   Instrukcja "jak dodac ekran" stoi na samym koncu pliku.                   */

const WERSJA_SKRYPTU = 'flotex-da9880044ce2';   // stempluje zbuduj.py

/* localStorage tylko przez te trzy funkcje.

   W Safari w trybie prywatnym sam DOSTĘP do localStorage rzuca wyjątkiem,
   a wyjątek na poziomie modułu ubija cały plik: nie powstaje ani 'stan',
   ani EKRANY, i telefon pokazuje biały ekran zamiast logowania. Gołe
   localStorage.getItem w definicji 'stan' było dokładnie taką miną.

   Każdy klucz dostaje przedrostek „gk-flota.” (D33). Wszystkie aplikacje GK
   na GitHub Pages — GK Flota, GK Trasy, Panel, Lider, UR, KJ — stoją pod
   JEDNYM źródłem https://milo252-gk.github.io, a localStorage jest wspólny dla
   całego źródła. Goły klucz 'token' nadpisywałaby każda z nich: zalogowanie
   w GK Trasy wylogowywałoby z floty i odwrotnie. Przedrostek dokładamy TUTAJ,
   w jednym miejscu, więc żaden nowy klucz nie może go ominąć.             */
const PRZEDROSTEK_PAMIECI = 'gk-flota.';

function pamietaj(klucz, wartosc) {
  try { localStorage.setItem(PRZEDROSTEK_PAMIECI + klucz, wartosc); return true; }
  catch (e) { return false; }
}
function przypomnijSobie(klucz) {
  try { return localStorage.getItem(PRZEDROSTEK_PAMIECI + klucz) || ''; } catch (e) { return ''; }
}
function zapomnijKlucz(klucz) {
  try { localStorage.removeItem(PRZEDROSTEK_PAMIECI + klucz); } catch (e) { /* nie ma czego kasować */ }
}

/* Jednorazowe przeniesienie kluczy sprzed przedrostka — bez tego aktualizacja
   wylogowałaby wszystkich kierowców naraz, a niewysłane zdjęcia czekałyby na
   PIN, którego połowa z nich nie pamięta.

   Dokładnie RAZ (znacznik 'przeniesiono'): potem goły 'token' należy już do
   kogoś innego na tym samym źródle i GK Flota nie ma prawa go czytać ani
   kasować. Stary klucz zabieramy (kopia + usunięcie), żeby inna aplikacja GK
   przy własnym przenoszeniu nie wzięła tokenu floty za swój.
   Lista jest zamknięta: to WSZYSTKIE klucze, jakie stara wersja zapisywała.
   index.html czyta 'motyw' jeszcze przed tym skryptem i zna tę samą zasadę. */
const STARE_KLUCZE_PAMIECI = ['token', 'motyw', 'gk_powrot', 'powiadomienia'];

function przeniesStareKlucze() {
  try {
    if (localStorage.getItem(PRZEDROSTEK_PAMIECI + 'przeniesiono') !== '1') {
      for (const klucz of STARE_KLUCZE_PAMIECI) {
        const stara = localStorage.getItem(klucz);
        if (stara === null) continue;
        if (localStorage.getItem(PRZEDROSTEK_PAMIECI + klucz) === null) {
          localStorage.setItem(PRZEDROSTEK_PAMIECI + klucz, stara);
        }
        localStorage.removeItem(klucz);
      }
      localStorage.setItem(PRZEDROSTEK_PAMIECI + 'przeniesiono', '1');
    }
  } catch (e) { /* tryb prywatny — nie ma czego przenosić */ }
  // Po gołym 'motyw' -> 'gk-flota.motyw', bo ten drugi idzie dalej do 'gk.motyw'.
  przeniesMotywDoWspolnego();
}

/* Motyw jest JEDEN dla wszystkich aplikacji GK na wspólnym źródle github.io
   (klucz 'gk.motyw' — hub i GK Trasy robią to samo): kierowca, który wybrał
   ciemny w GK Trasy, nie ma dostać białej kartki po przejściu do „Moje auto”.
   Wartości jak dotąd: 'jasny' | 'ciemny', brak klucza = „jak w telefonie”
   (inna aplikacja może zapisać 'auto' — liczy się tak samo jak brak).

   Własny 'gk-flota.motyw' przechodzi do 'gk.motyw' RAZ (znacznik
   'motyw-wspolny') i tylko wtedy, gdy wspólnego jeszcze nie ma — wybór
   zrobiony już w innej aplikacji GK ma pierwszeństwo. Po przenosinach
   rozstrzyga wyłącznie 'gk.motyw': gdyby własny klucz był dalej zapasem,
   „jak w telefonie” wybrane w GK Trasy (usunięty 'gk.motyw') wskrzeszałoby
   tu stary wybór floty. Własny klucz zapisujemy dalej obok — czyta go
   starsza wersja aplikacji, która mogła zostać na GitHub Pages.
   Reguła odczytu ma bliźniaka w <head> index.html. Zmieniasz jedną — zmień obie. */
const KLUCZ_MOTYWU_GK = 'gk.motyw';

function przeniesMotywDoWspolnego() {
  try {
    if (localStorage.getItem(PRZEDROSTEK_PAMIECI + 'motyw-wspolny') === '1') return;
    const wlasny = localStorage.getItem(PRZEDROSTEK_PAMIECI + 'motyw');
    if (localStorage.getItem(KLUCZ_MOTYWU_GK) === null
        && (wlasny === 'jasny' || wlasny === 'ciemny')) {
      localStorage.setItem(KLUCZ_MOTYWU_GK, wlasny);
    }
    localStorage.setItem(PRZEDROSTEK_PAMIECI + 'motyw-wspolny', '1');
  } catch (e) { /* tryb prywatny — zostaje „jak w telefonie” */ }
}

/* '' | 'jasny' | 'ciemny' | cokolwiek zapisała inna aplikacja GK. */
function wybranyMotyw() {
  try {
    const wspolny = localStorage.getItem(KLUCZ_MOTYWU_GK);
    if (wspolny !== null) return wspolny;
    if (localStorage.getItem(PRZEDROSTEK_PAMIECI + 'motyw-wspolny') === '1') return '';
  } catch (e) { return ''; }
  return przypomnijSobie('motyw');
}

/* '' = „jak w telefonie” (oba klucze znikają). Zwraca false, gdy przeglądarka
   nie pozwala zapisać — Motyw.ustaw mówi to wtedy człowiekowi. */
function zapamietajMotyw(wybor) {
  try {
    if (wybor) {
      localStorage.setItem(KLUCZ_MOTYWU_GK, wybor);
      localStorage.setItem(PRZEDROSTEK_PAMIECI + 'motyw', wybor);
    } else {
      localStorage.removeItem(KLUCZ_MOTYWU_GK);
      localStorage.removeItem(PRZEDROSTEK_PAMIECI + 'motyw');
    }
    return true;
  } catch (e) { return false; }
}
przeniesStareKlucze();

const stan = {
  token: przypomnijSobie('token'),
  uz: null,                 // profil z /api/logowanie albo /api/ja
  ekran: '',                // nazwa ekranu, ktory wlasnie stoi na widoku
  ustawienia: {},           // odpowiedz /api/ustawienia — progi, punkty, ujecia
  pojazdy: [],              // kartoteka floty (kierowca dostaje tylko swoja czesc)
  kierowcy: [],             // wykaz kierowcow; kierowca dostaje pusta liste
  instrukcje: [],           // instrukcja awaryjna — trzymana takze bez zasiegu
  online: navigator.onLine,
  wKolejce: 0,              // moje zapisy czekajace w telefonie
  obceWKolejce: 0,          // zapisy poprzedniej osoby z tego telefonu
  odrzucone: 0,             // zapisy, ktorych serwer nie przyjal
  bezPamieci: false,        // IndexedDB nie odpowiada — tryb offline nie dziala
  synchronizuje: false,
  // D43: konta z Panelu maja haslo + PIN (z /api/zyje; zapamietane na start bez sieci).
  trybD43: przypomnijSobie('d43') === '1',
};

const EKRANY = {};          // wypelniaja go pojazdy.js, przeglady.js, kierowca.js,
                            // ustawienia.js i konta.js
const MAKS_PROB = 5;        // po tylu nieudanych probach zapis ladzie wsrod odrzuconych

/* ------------------------------------------------------------- drobiazgi */

function escHtml(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Komunikaty przeglądarki są po angielsku, a widzi je kierowca na placu.
   „Failed to fetch" nie mówi mu nic; „Brak zasięgu — zapisałem w telefonie"
   mówi wszystko. Tłumaczymy w JEDNYM miejscu, bo wyciekały z pięciu różnych. */
function poLudzku(e) {
  if (!e) return 'Coś poszło nie tak. Spróbuj jeszcze raz.';
  const nazwa = String(e.name || '');
  const tekst = String(e.message || '');
  if (nazwa === 'QuotaExceededError' || /quota|storage|full disk|exceeded its quota/i.test(tekst)) {
    return 'Brak miejsca w pamięci telefonu. Zwolnij miejsce — zdjęcia czekające '
      + 'na wysłanie zostają nietknięte.';
  }
  if (nazwa === 'AbortError' || /abort/i.test(tekst)) {
    return 'Przerwane w połowie. Spróbuj jeszcze raz.';
  }
  if (/failed to fetch|load failed|networkerror|network connection was lost|could not be found/i
      .test(tekst)) {
    return 'Brak połączenia z programem. Sprawdź zasięg — zapisy poczekają w telefonie '
      + 'i wyślą się same.';
  }
  if (/unexpected token|json parse|json\.parse|not valid json/i.test(tekst)) {
    return 'Serwer odpowiedział czymś, czego program nie rozumie. Sprawdź adres '
      + 'albo spróbuj za chwilę.';
  }
  if (/indexeddb|object stores|database|transaction/i.test(tekst)) {
    return 'Pamięć telefonu nie odpowiada. Zamknij i otwórz aplikację jeszcze raz.';
  }
  if (/insecure/i.test(tekst)) {
    return 'Przeglądarka w trybie prywatnym nie pozwala nic zapisać. Otwórz aplikację '
      + 'w zwykłym oknie.';
  }
  // Komunikaty z naszego serwera są już po polsku — te przepuszczamy bez zmian.
  return tekst || 'Coś poszło nie tak. Spróbuj jeszcze raz.';
}

/* Wybór motywu: jasny, ciemny albo „jak w telefonie”.

   Trzyma się TEGO URZĄDZENIA, a nie konta, i to jest celowe. Ekran logowania
   rysuje się, zanim serwer zdąży powiedzieć, kto się loguje; telefon w busie
   bywa wspólny; a kierowca w słońcu na placu i biuro po zmroku chcą czego
   innego na tym samym koncie. Z tego samego powodu wyloguj() NIE kasuje tego
   klucza — inaczej każde wylogowanie oślepiałoby następną osobę.

   Reguła „który motyw” istnieje w programie DWA razy: tutaj i w skrypcie
   w <head> index.html, bo tamten musi wykonać się jeszcze przed arkuszem.
   Wolno je zmieniać wyłącznie razem. Testu, który by je porównywał, nie ma
   (testy programu nie mają silnika JavaScriptu) — pilnuje tego tylko ten
   komentarz i jego bliźniak w index.html.                                   */
const Motyw = {
  policz(wybor, systemCiemny) {
    return (wybor === 'ciemny' || (wybor !== 'jasny' && systemCiemny)) ? 'ciemny' : 'jasny';
  },
  /* Zawsze przez window. — gołe matchMedia rzuca ReferenceError tam, gdzie go
     nie ma, a że siedzi w try/catch, opcja „jak w telefonie” po prostu nigdy
     by nie zadziałała i nic by tego nie zgłosiło. */
  systemCiemny() {
    try {
      return !!(window.matchMedia
        && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) { return false; }
  },
  /* 'jasny' | 'ciemny' | 'auto'. Brak klucza znaczy „jak w telefonie” — nie
     zapisujemy tam 'auto', żeby dało się odróżnić wybór od nigdy niewybrania. */
  odczytaj() {
    const w = wybranyMotyw();
    return (w === 'jasny' || w === 'ciemny') ? w : 'auto';
  },
  zastosuj() {
    const wybor = this.odczytaj();
    const motyw = this.policz(wybor === 'auto' ? '' : wybor, this.systemCiemny());
    const korzen = document.documentElement;
    korzen.setAttribute('data-motyw', motyw);
    korzen.style.colorScheme = motyw === 'ciemny' ? 'dark' : 'light';
    const pasek = document.querySelector('meta[name=theme-color]');
    if (pasek) pasek.setAttribute('content', motyw === 'ciemny' ? '#191817' : '#4E4E4E');
    return motyw;
  },
  /* Mówi wprost, gdy zapis się nie udał. Cicha porażka daje motyw wracający
     po każdym odświeżeniu i nikt nie wie dlaczego. */
  ustaw(wybor) {
    const udalo = zapamietajMotyw((wybor === 'jasny' || wybor === 'ciemny') ? wybor : '');
    if (!udalo) {
      komunikat('Nie mogę zapamiętać wyboru w tej przeglądarce — wróci po odświeżeniu', 'blad');
    }
    return this.zastosuj();
  },
};

/* Toast: '' neutralny · 'ok' zielony · 'blad' czerwony i dłużej na ekranie,
   bo błąd czyta się na placu, a nie przy biurku.                            */
function komunikat(tresc, rodzaj) {
  const pole = document.getElementById('komunikaty');
  if (!pole) return;
  const e = document.createElement('div');
  e.className = 'komunikat ' + (rodzaj || '');
  e.textContent = tresc;                  // textContent — w toast nie da się wstrzyknąć HTML
  pole.appendChild(e);
  setTimeout(() => { e.style.opacity = '0'; setTimeout(() => e.remove(), 250); },
    rodzaj === 'blad' ? 5200 : 2800);
}

/* LICZNIK, nie flaga. Wysyłka zdjęć i odświeżenie listy potrafią chodzić
   równolegle; przy fladze ta, która skończy pierwsza, gasi kółko drugiej
   i kierowca myśli, że program stanął.                                      */
let licznikZajetosci = 0;
function zajety(wlacz) {
  licznikZajetosci = Math.max(0, licznikZajetosci + (wlacz ? 1 : -1));
  const kolo = document.getElementById('zajetosc');
  if (kolo) kolo.classList.toggle('ukryty', licznikZajetosci === 0);
}

/* „1 pojazd", „2 pojazdy", „5 pojazdów" — to jest polski program, a „5 pojazd"
   w komunikacie wygląda jak awaria i podważa zaufanie do reszty liczb.
   ŻADEN komunikat z liczbą tego nie omija.                                  */
function odmiana(ile, jeden, dwa, piec) {
  const n = Math.abs(ile);
  if (n === 1) return jeden;
  const ostatnia = n % 10, dwieOstatnie = n % 100;
  if (ostatnia >= 2 && ostatnia <= 4 && (dwieOstatnie < 12 || dwieOstatnie > 14)) return dwa;
  return piec;
}

/* ISO w danych, polski format na ekranie. */
function dzisiaj() { return new Date().toISOString().slice(0, 10); }
function godzinaTeraz() { return new Date().toTimeString().slice(0, 5); }
function czasTeraz() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' + d.toTimeString().slice(0, 8);
}
/* „2026-10” → „październik 2026” (STYL-GK, punkt 6: miesiące słownie). */
const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec',
  'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
function miesiacSlownie(okres) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(okres || ''));
  if (!m || +m[2] < 1 || +m[2] > 12) return String(okres || '');
  return `${MIESIACE[+m[2] - 1]} ${m[1]}`;
}

function polskaData(iso) {
  if (!iso) return '';
  const [r, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${r}`;
}
function samaGodzina(czas) { return czas ? String(czas).slice(11, 16) : ''; }

/* Przebieg zawsze z odstępami: „128 400 km". Sześć cyfr ciągiem czyta się
   na placu źle i to właśnie tam ktoś myli 128400 z 12840.                   */
function kilometry(km) {
  return km == null || km === '' ? '' : Number(km).toLocaleString('pl') + ' km';
}

/* ---------------------------------------------------------------- okienko */

/* Okno, w którym coś już wpisano, nie znika od dotknięcia obok. Zdjęcia
   robione aparatem w aplikacji NIE trafiają do galerii telefonu, więc ich
   utrata oznacza powrót na plac i komplet ujęć od nowa.                     */
function oknoMaTresc() {
  const pole = document.getElementById('okno-tresc');
  const tlo = document.getElementById('okno-tlo');
  if (!pole || !tlo || tlo.classList.contains('ukryty')) return false;
  return poleMaTresc(pole);
}

/* Czy w tym kawałku strony ktoś coś zaczął: zdjęcie, podpis, wybrany chip
   albo wpisany tekst. Pola filtrów list (.pasek-narzedzi) się nie liczą —
   wpisana w wyszukiwarkę rejestracja to nie praca, którą można stracić. */
function poleMaTresc(pole) {
  if (!pole) return false;
  if (pole.querySelector('.miniatura')) return true;
  if (pole.querySelector('.pole-podpisu.zapelnione')) return true;
  if (pole.querySelector('.chip.wybrany')) return true;
  return [...pole.querySelectorAll('input, textarea')].some(p =>
    p.type !== 'file' && p.type !== 'checkbox' && p.type !== 'date'
    && p.type !== 'radio' && p.type !== 'search' && !p.closest('.pasek-narzedzi')
    && (p.value || '').trim() && !p.dataset.wstepne);
}

async function zamknijZPytaniem() {
  if (oknoMaTresc() && !await potwierdz('Porzucić to, co wpisane?',
    'Zdjęcia z tego okna przepadną — nie ma ich w galerii telefonu.')) return;
  zamknijOkno();
}

/* Klasy przycisków stopki: brak / 'glowny' / 'niszczacy'.
   Kolejność: akcje dodatkowe -> Anuluj -> Zapisz ('glowny' zawsze ostatni),
   bo kciuk na telefonie ląduje przy prawej krawędzi.                        */
/* konto: true — okno „Moje konto” w wyglądzie okna konta aplikacji hali (style.css → .okno-konta). */
function okno({ tytul, tresc, przyciski, poOtwarciu, szerokie, konto }) {
  const tlo = document.getElementById('okno-tlo');
  tlo.classList.toggle('okno-konta', !!konto);
  document.getElementById('okno-tytul').textContent = tytul || '';
  const poleTresci = document.getElementById('okno-tresc');
  poleTresci.innerHTML = tresc || '';
  const stopka = document.getElementById('okno-stopka');
  stopka.innerHTML = '';
  (przyciski || []).forEach(p => {
    const b = document.createElement('button');
    b.textContent = p.napis;
    b.className = p.klasa || '';
    b.onclick = () => p.klik(zamknijOkno);      // akcja sama decyduje, czy zamknąć
    stopka.appendChild(b);
  });
  document.getElementById('okno').style.maxWidth = szerokie ? '860px' : '';
  tlo.classList.remove('ukryty');
  oznaczOtwarteOkno();
  poleTresci.scrollTop = 0;
  if (poOtwarciu) poOtwarciu(poleTresci);
  return zamknijOkno;
}

function zamknijOkno() {
  document.getElementById('okno-tlo').classList.add('ukryty');
  oznaczOtwarteOkno();
}

/* Klasa na <body> przy otwartej którejkolwiek warstwie. Bez niej strona pod
   spodem przewija się razem z oknem: kierowca przewija długi przegląd, okno
   dojeżdża do końca i palec zaczyna ciągnąć listę pod spodem — po zamknięciu
   okna jest zupełnie gdzie indziej, niż był.                                */
function oznaczOtwarteOkno() {
  const otwarte = ['okno-tlo', 'pytanie-tlo'].some(id => {
    const w = document.getElementById(id);
    return w && !w.classList.contains('ukryty');
  });
  document.body.classList.toggle('okno-otwarte', otwarte);
  // Zamknięcie ostatniej warstwy to moment na odłożone przeładowanie.
  // setTimeout, bo akcja często zamyka okno i w tym samym kroku otwiera
  // następne — sprawdzamy dopiero, gdy kod przycisku skończy swoje.
  if (!otwarte && czekaNaPrzeladowanie) setTimeout(przeladujGdyWolno, 0);
}

/* ------------------------------------------------- nowa wersja w trakcie pracy

   Service worker podmienia program, a strona sama się przeładowuje (uruchom()).
   Przeładowanie w złej chwili kasuje to, co jest na ekranie: kierowca w połowie
   obchodu auta traci okno z czterema zdjęciami, biuro — wpisany termin. Zdjęć
   z aparatu w aplikacji NIE ma w galerii telefonu, więc „zrób jeszcze raz”
   znaczy powrót na plac. Dlatego przy otwartym oknie, pytaniu albo zaczętym
   przeglądzie przeładowanie czeka, aż człowiek skończy.

   moznaPrzeladowacTeraz() to czysta decyzja na opisie chwili, bez DOM-u —
   sprawdzalna w konsoli przeglądarki na dowolnych danych:
     moznaPrzeladowacTeraz({ oknoOtwarte: true })  → false              */
function moznaPrzeladowacTeraz(chwila) {
  const c = chwila || {};
  if (c.oknoOtwarte || c.pytanieOtwarte) return false;
  if (c.ekranMaTresc) return false;          // np. przegląd z licznikiem i zdjęciami
  return true;
}

function biezacaChwila() {
  const widoczna = id => {
    const w = document.getElementById(id);
    return !!w && !w.classList.contains('ukryty');
  };
  return {
    oknoOtwarte: widoczna('okno-tlo'),
    pytanieOtwarte: widoczna('pytanie-tlo'),
    ekranMaTresc: poleMaTresc(document.getElementById('tresc')),
  };
}

let czekaNaPrzeladowanie = false;

function przeladujGdyWolno() {
  if (!czekaNaPrzeladowanie || !moznaPrzeladowacTeraz(biezacaChwila())) return;
  czekaNaPrzeladowanie = false;
  komunikat('Nowa wersja programu — odświeżam', 'ok');
  setTimeout(() => {
    // Przez te 400 ms ktoś mógł otworzyć okno — wtedy czekamy dalej.
    if (moznaPrzeladowacTeraz(biezacaChwila())) location.reload();
    else czekaNaPrzeladowanie = true;
  }, 400);
}

/* Pytanie „na pewno?" rysuje się w OSOBNEJ warstwie, nad zwykłym oknem.
   Kiedy korzystało z tego samego okna co formularze, zadanie pytania
   nadpisywało formularz, a odpowiedź — obojętnie która — zamykała wszystko.
   Kierowca kasujący jedno rozmazane zdjęcie tracił komplet ujęć.

   opcje: { tak, nie, groznie, html }. Nazwy przycisków bywają ważniejsze od
   pytania — „Zgłoś usterkę" i „Popraw licznik" mówią kierowcy przy aucie
   znacznie więcej niż „Tak" i „Nie". groznie maluje potwierdzenie na czerwono. */
function potwierdz(pytanie, opis, opcje) {
  opcje = opcje || {};
  return new Promise(zwroc => {
    const tlo = document.getElementById('pytanie-tlo');
    document.getElementById('pytanie-tytul').textContent = pytanie || 'Na pewno?';
    document.getElementById('pytanie-tresc').innerHTML =
      opis ? `<p class="slaby">${opcje.html ? opis : escHtml(opis)}</p>`
           : '<p class="slaby">Na pewno?</p>';

    const stopka = document.getElementById('pytanie-stopka');
    stopka.innerHTML = '';
    const zakoncz = (odpowiedz) => {
      tlo.classList.add('ukryty');
      oznaczOtwarteOkno();
      document.removeEventListener('keydown', naKlawisz, true);
      zwroc(odpowiedz);
    };
    const naKlawisz = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();          // Escape zamyka pytanie, nie okno pod spodem
      zakoncz(false);
    };

    for (const [napis, klasa, odpowiedz] of [
      [opcje.nie || 'Nie', '', false],
      [opcje.tak || 'Tak', opcje.groznie ? 'glowny niszczacy' : 'glowny', true]]) {
      const b = document.createElement('button');
      b.textContent = napis;
      b.className = klasa;
      b.onclick = () => zakoncz(odpowiedz);
      stopka.appendChild(b);
    }
    tlo.onclick = e => { if (e.target === tlo) zakoncz(false); };
    document.addEventListener('keydown', naKlawisz, true);
    tlo.classList.remove('ukryty');
    oznaczOtwarteOkno();
    (stopka.lastChild || {}).focus?.();
  });
}

/* ------------------------------------------------------------- serwer API */

/* Gdzie szukać danych.

   Aplikacja stoi w dwóch miejscach naraz i to jest celowe:

   — otwarta z programu (biuro, firmowe wifi, tunel) → dane są pod tym samym
     adresem, więc baza jest pusta i wszystko idzie ścieżkami względnymi;
   — otwarta ze stałego adresu na GitHub Pages → tam leży sam wygląd,
     a dane obsługuje komputer w biurze pod adresem tunelu. Ten adres bywa
     inny po każdym uruchomieniu programu, więc NIE jest wpisany w kod —
     aplikacja odczytuje go z pliku adres.json leżącego obok niej.

   Po co ta cała konstrukcja: przeglądarka wiąże kolejkę niewysłanych zdjęć,
   zapisane logowanie i pamięć offline z ADRESEM strony. Gdyby kierowca
   wchodził wprost pod zmieniający się adres tunelu, po każdym restarcie
   programu trafiałby na nowy adres — a komplet zdjęć z placu zostawałby
   pod starym, bez żadnej drogi powrotu. Stały front to rozwiązuje.         */
let API_BAZA = '';

/* Ustalenie adresu danych jest WARUNKIEM każdego zapytania, nie krokiem
   startowym obok nich. Formularz logowania jest podpięty od pierwszej chwili,
   a odczyt adres.json trwa — kierowca, który kliknie „Zaloguj" szybciej,
   wysyłałby zapytanie pod adres samego wyglądu i dostawał komunikat
   „serwer odpowiedział czymś, czego program nie rozumie". Zdarzyło się
   w pierwszej próbie tej konstrukcji.

   Stąd wspólna obietnica: kto pierwszy jej potrzebuje, ten ją uruchamia,
   reszta czeka na ten sam wynik. */
let _adresWDrodze = null;

function adresDanychGotowy() {
  if (!_adresWDrodze) _adresWDrodze = ustalBazeApi();
  return _adresWDrodze;
}

async function ustalBazeApi() {
  // Rozpoznanie jest proste: obok kopii na Pages leży adres.json, a obok
  // strony wydawanej przez sam program — nie. Nie zgadujemy z adresu.
  let zapisana = null;
  try { zapisana = await Kolejka.przypomnij('adres-api'); } catch (e) { /* trudno */ }
  try {
    // no-store, bo to jedyny plik, który MUSI być świeży: po nim aplikacja
    // wie, gdzie dziś stoi program.
    const odp = await fetch('adres.json?t=' + Date.now(), { cache: 'no-store' });
    if (odp.ok) {
      const opis = await odp.json();
      if (opis && opis.api) {
        API_BAZA = String(opis.api).replace(/\/+$/, '');
        stan.adresDanych = { ...opis, zrodlo: 'plik' };
        await Kolejka.zapamietaj('adres-api', opis).catch(() => {});
        return;
      }
    }
  } catch (e) { /* brak pliku = zwykłe uruchomienie z programu */ }

  if (zapisana && zapisana.api) {
    // Tu jesteśmy tylko wtedy, gdy adres.json się nie wczytał. Zapamiętany
    // adres istnieje wyłącznie w pamięci TEGO adresu strony, a zapisać go
    // mogła jedynie wcześniejsza udana próba — czyli stoimy na kopii
    // z Pages, której chwilowo brakuje sieci. Program wydający stronę
    // sam z siebie nigdy tu nic nie zapisał, więc nie ma czego pomylić.
    // Bierzemy ostatni znany adres, żeby aplikacja wstała i przyjęła
    // zdjęcia do kolejki.
    API_BAZA = String(zapisana.api).replace(/\/+$/, '');
    stan.adresDanych = { ...zapisana, zrodlo: 'pamiec' };
  }
}

/* Adres tunelu zmienił się W TRAKCIE pracy (D33).

   Tunel „szybki” dostaje nowy adres przy każdym uruchomieniu programu
   w biurze. Program sam wpisuje go do adres.json na Pages, ale aplikacja
   otwarta rano w telefonie trzyma adres z rana — i po restarcie komputera
   w biurze każde zapytanie kończy się błędem sieci (stara nazwa już nie
   istnieje) albo stroną błędu Cloudflare 530/1033. Bez tego kierowca musiałby
   zamknąć i otworzyć aplikację, a tego nikt mu nie powie.

   Dlatego przy takim błędzie czytamy adres.json jeszcze raz i — jeśli adres
   jest inny — przełączamy się bez przeładowania strony. Kolejka niewysłanych
   zdjęć zostaje, bo leży pod adresem aplikacji (Pages), a nie tunelu.
   Najwyżej raz na 30 s: przy prawdziwym braku zasięgu każde zapytanie
   kończy się błędem i bez progu pytalibyśmy Pages w kółko.               */
const ODSTEP_SPRAWDZANIA_ADRESU_MS = 30 * 1000;
let _adresSprawdzony = 0;

async function sprawdzAdresPonownie() {
  const teraz = Date.now();
  if (teraz - _adresSprawdzony < ODSTEP_SPRAWDZANIA_ADRESU_MS) return false;
  _adresSprawdzony = teraz;
  try {
    const odp = await fetch('adres.json?t=' + teraz, { cache: 'no-store' });
    if (!odp.ok) return false;
    const opis = await odp.json();
    if (!opis || typeof opis.api !== 'string' || !/^https?:\/\//.test(opis.api)) return false;
    const nowa = opis.api.replace(/\/+$/, '');
    if (nowa === API_BAZA) return false;
    API_BAZA = nowa;
    stan.adresDanych = { ...opis, zrodlo: 'plik' };
    await Kolejka.zapamietaj('adres-api', opis).catch(() => {});
    return true;
  } catch (e) {
    return false;            // bez zasięgu albo program otwarty wprost (bez adres.json)
  }
}

/* Cloudflare odpowiada 530 (błąd 1033), gdy adres tunelu istnieje, ale nikt
   już za nim nie stoi, a 502, gdy tunel stoi bez programu. To nie są błędy
   programu, tylko znak „szukaj mnie gdzie indziej”. */
function toBladAdresu(odp) {
  return odp.status === 530 || odp.status === 502;
}

/* Jedyne miejsce, w którym idziemy po dane: API.zadanie, logowanie i wejście
   z GK Trasy wołają to samo, więc nowy adres łapie każde z nich.
   Ponawiamy WYŁĄCZNIE po zmianie adresu — stary adres już nie istnieje, więc
   zapis nie mógł tam dojść i nie zdublujemy go (a /api/sync i tak pilnuje
   uuid operacji). Przy niezmienionym adresie oddajemy błąd jak dotąd.       */
async function zapytajProgram(sciezka, opcje) {
  await adresDanychGotowy();
  let odp;
  try {
    odp = await fetch(API_BAZA + sciezka, opcje);
  } catch (e) {
    if (await sprawdzAdresPonownie()) return fetch(API_BAZA + sciezka, opcje);
    throw e;
  }
  if (toBladAdresu(odp) && await sprawdzAdresPonownie()) {
    return fetch(API_BAZA + sciezka, opcje);
  }
  return odp;
}

const API = {
  async zadanie(metoda, sciezka, dane) {
    const opcje = { method: metoda, headers: {} };
    if (stan.token) opcje.headers.Authorization = 'Bearer ' + stan.token;
    if (dane !== undefined) {
      opcje.headers['Content-Type'] = 'application/json';
      opcje.body = JSON.stringify(dane);
    }
    const odp = await zapytajProgram(sciezka, opcje);
    if (odp.status === 401) {
      wyloguj(true);
      throw new Error('Sesja wygasła — zaloguj się ponownie');
    }
    let wynik = null;
    try { wynik = await odp.json(); } catch (e) { wynik = null; }
    if (!odp.ok) {
      const blad = new Error((wynik && wynik.blad) || `Błąd serwera (${odp.status})`);
      // Kod HTTP jest potrzebny tam, gdzie 409 znaczy „zapytaj i ponów",
      // a nie „nie da się" — np. przy kasowaniu zdjęć przez retencję.
      blad.kod = odp.status;
      throw blad;
    }
    return wynik;
  },
  get(s) { return API.zadanie('GET', s); },
  post(s, d) { return API.zadanie('POST', s, d || {}); },
  del(s) { return API.zadanie('DELETE', s); },
};

/* Opakowanie na akcje uzytkownika: pokazuje kolo, lapie blad, wypisuje go.
   ZWRACA null PRZY BLEDZIE — kazde wywolanie to sprawdza:
   const w = await sprobuj(() => API.post('/api/pojazdy', dane)); if (!w) return;
   Nagie API.get(...) tylko tam, gdzie blad ma byc cichy — zawsze z .catch().  */
async function sprobuj(praca, komunikatSukcesu) {
  zajety(true);
  try {
    const w = await praca();
    if (komunikatSukcesu) komunikat(komunikatSukcesu, 'ok');
    return w;
  } catch (e) {
    komunikat(poLudzku(e), 'blad');
    return null;
  } finally {
    zajety(false);
  }
}

/* --------------------------------------------------------- kolejka offline */

async function doKolejki(op, komunikatSukcesu) {
  // Kto to zapisał. Bez tego kolejka po wylogowaniu przechodzi na następną
  // osobę, która zaloguje się na tym telefonie — serwer odrzuci cudze zdjęcia,
  // a telefon by je skasował. Czyli utrata pracy kierowcy.
  op.uzytkownik = stan.uz ? stan.uz.id : null;
  try {
    await Kolejka.dodaj(op);
  } catch (e) {
    // Cicha porażka w tym miejscu jest najgorsza z możliwych: kierowca widzi
    // ptaszka, a zdjęć nie ma nigdzie. Mówimy wprost i przerywamy.
    komunikat('NIE ZAPISANO. ' + poLudzku(e), 'blad');
    throw e;
  }
  await odswiezStanSieci();
  if (komunikatSukcesu) {
    komunikat(stan.online ? komunikatSukcesu
      : komunikatSukcesu + ' (wyślę, gdy wróci zasięg)', 'ok');
  }
  synchronizuj();
  return op;
}

async function synchronizuj(cicho = true) {
  if (stan.synchronizuje || !stan.token || !stan.uz) return;
  // Flagę stawiamy przed pierwszym await. Zdarzenia 'online' i
  // 'visibilitychange' potrafią wypaść w tym samym ticku i bez tego dwie
  // wysyłki ruszyłyby równolegle, dublując zdjęcia.
  stan.synchronizuje = true;
  try {
    // Wysyłamy wyłącznie własne zapisy. Cudze czekają na swojego właściciela.
    const paczka = (await Kolejka.lista()).filter(o => o.uzytkownik === stan.uz.id);
    if (!paczka.length || !navigator.onLine) { await odswiezStanSieci(); return; }
    // Paczkę dobieramy według WAGI, a nie liczby. Dwanaście odczytów licznika
    // waży tyle co nic, ale dwanaście przeglądów ze zdjęciami przekroczyłoby
    // limit serwera (24 MB) i utknęłyby w telefonie na zawsze.
    const LIMIT = 6 * 1024 * 1024;
    const wysylka = [];
    let waga = 0;
    for (const o of paczka) {
      // 'dodano' i 'prob' to sprawy telefonu — serwer ich nie potrzebuje,
      // a przy zdjęciach każdy zbędny bajt zbliża paczkę do limitu.
      const czysta = Object.assign({}, o, { dodano: undefined, prob: undefined });
      const ile = JSON.stringify(czysta).length;
      if (wysylka.length && waga + ile > LIMIT) break;
      wysylka.push(czysta);
      waga += ile;
      if (wysylka.length >= 12) break;
    }
    // Mówimy serwerowi, ile zapisów zostaje w telefonie — biuro musi odróżnić
    // „kierowca nie zrobił przeglądu" od „zrobił, ale stoi bez zasięgu".
    const zostaje = Math.max(0, (await Kolejka.ile().catch(() => 0)) - wysylka.length);
    const wynik = await API.post('/api/sync', { operacje: wysylka, w_kolejce: zostaje });
    for (const p of wynik.przyjete) await Kolejka.usun(p.uuid);

    // Nic nie kasujemy po cichu. Zapis, którego serwer nie przyjął, ląduje
    // na półce odrzuconych — z powodem, do obejrzenia przez człowieka.
    // Zdjęcia z placu są nie do odtworzenia; komunikat znikający po pięciu
    // sekundach nie jest wystarczającym śladem.
    const wgUuid = Object.fromEntries(paczka.map(o => [o.uuid, o]));
    for (const o of wynik.odrzucone) {
      const op = wgUuid[o.uuid];
      if (!op) continue;
      if (o.trwaly) {
        await Kolejka.odrzuc(op, o.blad);
      } else {
        await Kolejka.oznaczProbe(op);
        // Po kilku nieudanych próbach też odkładamy, żeby nie kręcić się
        // w kółko i nie dublować zdjęć przy każdym podejściu.
        if ((op.prob || 0) >= MAKS_PROB) {
          await Kolejka.odrzuc(op, `${o.blad} (nie udało się wysłać ${MAKS_PROB} razy)`);
        }
      }
    }
    if (wynik.przyjete.length && !cicho) {
      const n = wynik.przyjete.length;
      komunikat(`Wysłano ${n} ${odmiana(n, 'zapis', 'zapisy', 'zapisów')}`, 'ok');
    }
    if (wynik.przyjete.length) {
      const zostalo = await Kolejka.ile();
      if (zostalo) { stan.synchronizuje = false; return synchronizuj(cicho); }
      if (EKRANY[stan.ekran] && EKRANY[stan.ekran].poSynchronizacji) {
        EKRANY[stan.ekran].poSynchronizacji();
      }
    }
  } catch (e) {
    if (!cicho) komunikat('Nie udało się wysłać. ' + poLudzku(e), 'blad');
  } finally {
    stan.synchronizuje = false;
    await odswiezStanSieci();
  }
}

/* Kropka w nagłówku: zielona / pomarańczowa (brak sieci albo coś czeka)
   / czerwona pulsująca (coś nie przeszło). Wołana po każdej zmianie kolejki
   i po każdej zmianie stanu sieci.                                          */
async function odswiezStanSieci() {
  stan.online = navigator.onLine;
  try {
    const wszystkie = await Kolejka.lista();
    const moje = stan.uz ? wszystkie.filter(o => o.uzytkownik === stan.uz.id) : wszystkie;
    stan.wKolejce = moje.length;
    stan.obceWKolejce = wszystkie.length - moje.length;
    stan.odrzucone = await Kolejka.ileOdrzuconych();
    stan.bezPamieci = false;
  } catch (e) {
    // Padnięte IndexedDB (tryb prywatny, zablokowane dane witryny, pełna
    // pamięć) znaczy, że kierowca NIE MA gdzie odłożyć zdjęć bez zasięgu.
    // Zamiast wywrócić start aplikacji — bo ta funkcja leci przed ekranem
    // logowania — mówimy o tym wprost i wpuszczamy go do środka.
    stan.wKolejce = 0; stan.obceWKolejce = 0; stan.odrzucone = 0;
    if (!stan.bezPamieci) {
      stan.bezPamieci = true;
      komunikat('Pamięć telefonu nie odpowiada — bez zasięgu nie zapiszę zdjęć. '
        + 'Zamknij i otwórz aplikację jeszcze raz.', 'blad');
    }
  }
  const kropka = document.getElementById('stan-sieci');
  if (!kropka) return;
  kropka.className = 'stan-sieci' + ((stan.odrzucone || stan.bezPamieci) ? ' odrzucone'
    : (!stan.online ? ' offline' : (stan.wKolejce ? ' czeka' : '')));
  const ileZapisow = `${stan.wKolejce} ${odmiana(stan.wKolejce, 'zapis', 'zapisy', 'zapisów')}`;
  kropka.title = stan.bezPamieci
    ? 'Pamięć telefonu nie odpowiada — dotknij ikony konta'
    : stan.odrzucone
      ? `${stan.odrzucone} ${odmiana(stan.odrzucone, 'zapis nie przeszedł', 'zapisy nie przeszły',
          'zapisów nie przeszło')} — dotknij ikony konta`
      : !stan.online
        ? (stan.wKolejce ? `Brak sieci — ${ileZapisow} czeka na wysłanie`
                         : 'Brak sieci — zapisy zostają w telefonie')
        : (stan.wKolejce ? `${ileZapisow} w wysyłce` : 'Połączono');
  const znacznik = document.getElementById('znacznik-kolejki');
  if (znacznik) znacznik.textContent = stan.wKolejce ? `⏳ ${stan.wKolejce}` : '';
}

/* ------------------------------------------------------------- logowanie */

/* Logowanie idzie GOŁYM fetch, a nie przez API — API przy 401 wylogowuje,
   a tutaj 401 znaczy po prostu „zły PIN" i ma zostać w polu pod formularzem.

   Ale adres musi być TEN SAM co w API. Gdy front stoi na GitHub Pages,
   a program w biurze, „/api/logowanie" bez API_BAZA pyta Pages o dane —
   a Pages oddaje stronę „404" w HTML-u. Kierowca widział wtedy „serwer
   odpowiedział czymś, czego program nie rozumie" i nie miał jak wejść,
   choć program stał i odpowiadał. Dlatego czekamy na adres tak samo,
   jak robi to API.zadanie.                                                  */
/* Login osoby tak jak w hubie (login_z_nazwy, GK-KONTA.md §1): małe litery, bez
   polskich znaków, kropki/podkreślenia/myślniki jak spacje, pojedyncze spacje.
   „Krzysztof  Hamrol” = „krzysztof.hamrol” = „krzysztof hamrol”. */
function loginZNazwy(t) {
  return String(t || '').toLowerCase().replace(/ł/g, 'l').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');
}

/* Znaczniki urządzenia (D43, GK-KONTA.md §7.2). Po dobrym haśle program daje
   temu urządzeniu znacznik ważny 12 godzin — z nim wystarcza PIN. Trzymamy go
   PER OSOBA (na wspólnym telefonie loguje się kilka osób): mapa login → {z, do}
   pod kluczem 'znaczniki' (przedrostek gk-flota.). Klucze po loginZNazwy:
   wpisane imię i nazwisko, login i imię z konta. Wylogowanie znacznika NIE
   kasuje — po to jest: następne logowanie tej osoby PIN-em. Kasuje go
   odpowiedź „wymagane_haslo”. */
const Znaczniki = {
  wszystkie() {
    try {
      const m = JSON.parse(przypomnijSobie('znaczniki') || '{}');
      return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
    } catch (e) { return {}; }
  },
  dla(ident) {
    const w = this.wszystkie()[loginZNazwy(ident)];
    return w && w.z && Date.parse(w.do) > Date.now() ? w : null;
  },
  zapamietaj(klucze, z, doKiedy) {
    if (!z) return;
    const m = this.wszystkie();
    const teraz = Date.now();
    Object.keys(m).forEach(k => { if (!(Date.parse((m[k] || {}).do) > teraz)) delete m[k]; });
    klucze.map(loginZNazwy).filter(Boolean).forEach(k => { m[k] = { z, do: doKiedy }; });
    pamietaj('znaczniki', JSON.stringify(m));
  },
  zapomnij(ident) {
    const m = this.wszystkie();
    const w = m[loginZNazwy(ident)];
    if (!w) return;
    Object.keys(m).forEach(k => { if ((m[k] || {}).z === w.z) delete m[k]; });
    pamietaj('znaczniki', JSON.stringify(m));
  },
};

/* Pole sekretu (D43, STYL-GK §2): osoba ze znacznikiem tego urządzenia → „PIN
   (4 cyfry)” z klawiaturą cyfr; inaczej „Hasło (raz na 12 godzin na tym
   urządzeniu)” z pełną klawiaturą. Program bez kont D43 (konta tutejsze,
   z GK Trasy, Panel sprzed D43) — „PIN / hasło” jak dawniej (stan.trybD43
   z /api/zyje). Link pod polem: „Zaloguj hasłem” (zapomniany PIN), przy haśle
   ze znacznikiem — „Zaloguj PIN-em”; bez znacznika linku nie ma. */
const ETYKIETY_SEKRETU = { pin: 'PIN (4 cyfry)', haslo: 'Hasło (raz na 12 godzin na tym urządzeniu)',
                           stary: 'PIN / hasło' };
function poleSekretu({ ident, sekret, etykieta, przelacz }) {
  let reczny = null;
  const auto = () => (Znaczniki.dla(ident.value) ? 'pin' : (stan.trybD43 ? 'haslo' : 'stary'));
  function rysuj() {
    const a = auto();
    if (reczny === 'pin' && a !== 'pin') reczny = null;     // PIN-em tylko ze znacznikiem
    const tryb = reczny || a;
    if (etykieta) etykieta.textContent = ETYKIETY_SEKRETU[tryb];
    sekret.inputMode = tryb === 'pin' ? 'numeric' : 'text';
    sekret.maxLength = tryb === 'pin' ? 4 : 128;
    sekret.autocomplete = tryb === 'pin' ? 'off' : 'current-password';
    sekret.dataset.tryb = tryb;
    if (przelacz) {
      przelacz.hidden = a !== 'pin';
      przelacz.textContent = tryb === 'pin' ? 'Zaloguj hasłem' : 'Zaloguj PIN-em';
    }
    return tryb;
  }
  ident.addEventListener('input', () => { reczny = null; rysuj(); });
  if (przelacz) {
    przelacz.addEventListener('click', () => {
      reczny = (reczny || auto()) === 'pin' ? 'haslo' : 'pin';
      sekret.value = '';
      rysuj();
      sekret.focus();
    });
  }
  rysuj();
  return { odswiez: () => { reczny = null; return rysuj(); }, tryb: () => sekret.dataset.tryb };
}

/* Reguły nowego hasła i PIN-u (D43 §7.1) — te same co w programie i w hubie
   (blad_hasla, blad_pinu); tu tylko podpowiadamy od razu, serwer sprawdza sam. */
// Hasło: min. 8 znaków, byle nie haslo123; PIN: dowolne 4 cyfry (D46, właściciel 2026-10-08).
function bledyHasla({ stare, nowe, powtorz, nazwa, wymagajStarego }) {
  const b = [];
  stare = String(stare || '').trim(); nowe = String(nowe || '').trim(); powtorz = String(powtorz || '').trim();
  if (wymagajStarego && !stare) b.push('Wpisz obecne hasło.');
  // D46: oczywiste hasło, powtórzony znak, imię i nazwisko wolno — tylko długość i nie hasło startowe.
  if (nowe.length < 8) b.push('Nowe hasło: min. 8 znaków (litery, cyfry, znaki).');
  else if (nowe.length > 128) b.push('Hasło może mieć najwyżej 128 znaków.');
  else if (nowe.toLowerCase() === 'haslo123') b.push('„haslo123” to hasło startowe — wpisz nowe.');
  if (nowe && stare && nowe === stare) b.push('Nowe hasło musi być inne niż obecne.');
  if (nowe && powtorz !== nowe) b.push('Powtórzone hasło nie zgadza się z nowym.');
  return b;
}
function bledyPinu({ stary, nowy, powtorz, wymagajStarego }) {
  const b = [];
  stary = String(stary || '').trim(); nowy = String(nowy || '').trim(); powtorz = String(powtorz || '').trim();
  if (wymagajStarego && !stary) b.push('Wpisz obecne hasło albo obecny PIN.');
  if (!/^\d{4}$/.test(nowy)) b.push('PIN to dokładnie 4 cyfry.');
  if (nowy && stary && nowy === stary) b.push('Nowy PIN musi być inny niż obecny.');
  if (nowy && powtorz !== nowy) b.push('Powtórzony PIN nie zgadza się z nowym.');
  return b;
}

/* Odpowiedź programu na logowanie albo ustawienie konta. Tunel albo firmowe
   proxy potrafi oddać stronę błędu w HTML-u zamiast JSON-a — wtedy zdanie po
   polsku zamiast angielskiego wyrzutu parsera. */
async function odpowiedzLogowania(odp) {
  try {
    return await odp.json();
  } catch (e) {
    throw new Error('Serwer odpowiedział czymś, czego program nie rozumie. '
      + 'Sprawdź adres albo spróbuj za chwilę.');
  }
}

async function zaloguj(login, pin) {
  await adresDanychGotowy();
  // D43: pole „znacznik” idzie ZAWSZE (null, gdy go nie ma) — po nim program
  // poznaje, że ta wersja umie PIN i okno „Ustaw hasło i PIN”.
  const zn = Znaczniki.dla(login);
  const odp = await zapytajProgram('/api/logowanie', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, pin, znacznik: zn ? zn.z : null,
                           urzadzenie: navigator.userAgent.slice(0, 110) }),
  });
  const wynik = await odpowiedzLogowania(odp);
  if (!odp.ok) {
    const blad = new Error(wynik.blad || 'Nie udało się zalogować');
    blad.kodBledu = wynik.kod || '';
    blad.kod = odp.status;
    // PIN bez ważnego znacznika albo 5 złych PIN-ów: ten znacznik już nic nie
    // znaczy — pole wraca do hasła.
    if (blad.kodBledu === 'wymagane_haslo') Znaczniki.zapomnij(login);
    throw blad;
  }
  if (wynik.do_ustawienia && wynik.do_ustawienia.length) {
    // Hasło startowe albo brak PIN-u: sesja tylko do okna „Ustaw hasło i PIN”.
    const blad = new Error('Ustaw nowe hasło i PIN, żeby wejść.');
    blad.kodBledu = 'do_ustawienia';
    blad.ustawienie = Object.assign({}, wynik, { wpisany: login });
    throw blad;
  }
  return przyjmijLogowanie(wynik, login);
}

/* Zalogowano (logowanie albo „Ustaw hasło i PIN”): znacznik do Znaczniki,
   token i profil do pamięci. */
async function przyjmijLogowanie(odpowiedz, wpisany) {
  const wynik = Object.assign({}, odpowiedz);
  if (wynik.znacznik) Znaczniki.zapamietaj([wpisany, wynik.login, wynik.imie], wynik.znacznik, wynik.znacznik_do);
  delete wynik.znacznik;                     // znacznik nie idzie do profilu w IndexedDB
  stan.token = wynik.token;
  // Zapis tokenu ZAWSZE w try/catch — tryb prywatny nie może zablokować wejścia.
  pamietaj('token', wynik.token);
  stan.uz = wynik;
  // Bez zapamiętanego profilu kierowca nie wejdzie jutro rano na placu bez
  // zasięgu: nie ma z czego odtworzyć roli i ekran zostaje pusty.
  await Kolejka.zapamietaj('profil', wynik).catch(() => { /* wejście ważniejsze */ });
  return wynik;
}

/* Wejście z GK Trasy (GK Transport): kierowca dotyka „Moje auto" w GK Trasy
   i trafia tu z jednorazowym kodem w adresie (#wejscie=…). Kod wymieniamy
   na zwykłą sesję — kierowca nie ma pamiętać drugiego logowania.

   Gołe fetch z tego samego powodu co zaloguj(): 401 znaczy tu „link wygasł"
   i ma zostać na ekranie logowania, a nie wylogować kogoś, kto tu był. */
function kodWejsciaZAdresu() {
  const znaleziony = /(?:^#|&)wejscie=([A-Za-z0-9_-]+)/.exec(location.hash || '');
  return znaleziony ? znaleziony[1] : '';
}

async function wejdzKodem(kod) {
  await adresDanychGotowy();
  const odp = await zapytajProgram('/api/wejscie', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kod, urzadzenie: navigator.userAgent.slice(0, 110) }),
  });
  let wynik;
  try { wynik = await odp.json(); } catch (e) {
    throw new Error('Serwer odpowiedział czymś, czego program nie rozumie. '
      + 'Sprawdź adres albo spróbuj za chwilę.');
  }
  if (!odp.ok) throw new Error(wynik.blad || 'Nie udało się wejść z GK Trasy');
  stan.token = wynik.token;
  pamietaj('token', wynik.token);
  if (wynik.powrot) pamietaj('gk_powrot', wynik.powrot);
  stan.uz = wynik;
  await Kolejka.zapamietaj('profil', wynik).catch(() => { /* wejście ważniejsze */ });
  return wynik;
}

/* Powrót do GK Trasy. Jeden napis w jednym miejscu — pokazuje go menu
   i ekran „Moje auto". Adres sprawdzamy także tutaj, choć sprawdził go
   serwer: w pamięci przeglądarki może leżeć cokolwiek, a „javascript:"
   pod przyciskiem wykonałby cudzy kod w aplikacji floty. */
const NAPIS_POWROTU = '← GK Trasy';

function adresPowrotu() {
  if (!stan.uz || stan.uz.rola !== 'kierowca') return '';
  const adres = przypomnijSobie('gk_powrot');
  return /^https?:\/\//i.test(adres) ? adres : '';
}

function przyciskPowrotu() {
  return adresPowrotu()
    ? `<div class="przyciski"><button data-powrot style="width:100%">${
        escHtml(NAPIS_POWROTU)}</button></div>` : '';
}

function podepnijPowrot(pole) {
  pole.querySelectorAll('[data-powrot]').forEach(b => {
    b.onclick = () => { const adres = adresPowrotu(); if (adres) location.href = adres; };
  });
}

/* Wylogowanie kasuje token i słowniki, ale NIE kolejkę offline — i pyta,
   gdy coś w niej czeka.                                                     */
async function wyloguj(cicho) {
  if (!cicho) {
    const czeka = stan.wKolejce;
    if (czeka && !await potwierdz(
      `W kolejce czeka ${czeka} ${odmiana(czeka, 'zapis', 'zapisy', 'zapisów')}`,
      'Zostaną w tym telefonie i wyślą się, gdy zalogujesz się ponownie. '
      + 'Nikt inny ich nie wyśle ani nie skasuje. Wylogować?')) return;
    // Razem z końcem sesji program wypisuje ten telefon z powiadomień TEJ osoby —
    // na wspólnym telefonie następna osoba nie może dostawać cudzych spraw.
    const sub = await Powiadomienia.subskrypcja();
    try { await API.post('/api/wyloguj', sub ? { push_endpoint: sub.endpoint } : {}); }
    catch (e) { /* trudno, i tak wychodzimy */ }
  }
  stan.token = ''; stan.uz = null;
  zapomnijKlucz('token');
  // Adres powrotu należy do tej sesji — następna osoba na tym telefonie
  // nie ma dostać przycisku do cudzej instalacji GK Trasy.
  zapomnijKlucz('gk_powrot');
  // Kartoteka floty i profil zostawały w telefonie po wylogowaniu — bezterminowo,
  // bo nic ich nigdy nie kasowało. Zgubiony albo oddany telefon oddawał wtedy
  // komuś obcemu całą flotę z numerami VIN i polisami.
  // KOLEJKI I ODRZUCONYCH NIE RUSZAMY: to jedyny egzemplarz zdjęć, które
  // czekają na zasięg. Klucza 'motyw' też nie — to ustawienie telefonu.
  try {
    await Kolejka.zapomnij('slowniki');
    await Kolejka.zapomnij('profil');
  } catch (e) { /* brak pamięci nie może zatrzymać wylogowania */ }
  stan.pojazdy = []; stan.kierowcy = []; stan.ustawienia = {};
  pokazLogowanie();
}

function pokazLogowanie() {
  document.getElementById('aplikacja').classList.add('ukryty');
  document.getElementById('ekran-logowania').classList.remove('ukryty');
  document.getElementById('blad-logowania').textContent = '';
  document.getElementById('form-logowania').reset();
  if (stan.poleLogowania) stan.poleLogowania.odswiez();
  pokazInfoKont();
}

/* „Konto zakłada administrator w Panelu Kierownika → Administracja.” — tylko
   gdy konta naprawdę przychodzą z Panelu. Pyta /api/zyje (bez logowania);
   brak odpowiedzi = brak linii, logowanie na to nie czeka. */
async function pokazInfoKont() {
  const linia = document.getElementById('info-kont');
  try {
    await adresDanychGotowy();
    const odp = await zapytajProgram('/api/zyje');
    const w = odp.ok ? await odp.json() : {};
    if (linia) linia.hidden = !(w && w.konta_z_panelu);
    // Ta sama odpowiedź mówi, czy konta są już w D43 (hasło + PIN) — wtedy pole
    // sekretu pisze „Hasło (raz na 12 godzin…)” zamiast „PIN / hasło”.
    stan.trybD43 = !!(w && w.d43);
    pamietaj('d43', stan.trybD43 ? '1' : '');
  } catch (e) { if (linia) linia.hidden = true; }
  if (stan.poleLogowania) stan.poleLogowania.odswiez();
}

/* Okno „Ustaw hasło i PIN” (D43 §7.4, STYL-GK §2): pierwsze logowanie hasłem
   startowym (albo konto bez PIN-u). Tylko brakujące pola. Sesja z logowania
   służy wyłącznie temu oknu; po zapisie osoba jest zalogowana i idzie dalej(). */
function oknoUstawieniaKonta(u, dalej, bladNaStart) {
  const haslo = (u.do_ustawienia || []).includes('haslo');
  const pin = (u.do_ustawienia || []).includes('pin');
  const tytul = haslo && pin ? 'Ustaw hasło i PIN' : haslo ? 'Ustaw nowe hasło' : 'Ustaw PIN';
  okno({
    tytul, konto: true,
    tresc: `
      <p class="konto-kto"><b>${escHtml(u.imie)}</b></p>
      <p class="konto-drobne">${haslo ? 'Hasło startowe działa tylko przy pierwszym logowaniu. ' : ''}Hasło
        wpiszesz raz na 12 godzin na tym urządzeniu, na co dzień — PIN. Oba działają we wszystkich
        aplikacjach GK.</p>
      ${haslo ? `<label>Nowe hasło (min. 8 znaków)<input id="us-haslo" type="password"
          autocomplete="new-password" maxlength="128"></label>
        <label>Powtórz nowe hasło<input id="us-haslo2" type="password" autocomplete="new-password"
          maxlength="128"></label>` : ''}
      ${pin ? `<label>PIN (4 cyfry)<input id="us-pin" type="password" inputmode="numeric"
          autocomplete="new-password" maxlength="4"></label>
        <label>Powtórz PIN<input id="us-pin2" type="password" inputmode="numeric"
          autocomplete="new-password" maxlength="4"></label>` : ''}
      <p class="blad-ustawienia" id="us-blad" role="alert">${escHtml(bladNaStart || '')}</p>`,
    przyciski: [
      { napis: 'Anuluj', klik: z => z() },
      { napis: 'Zapisz i wejdź', klasa: 'glowny', klik: async z => {
        const blad = document.getElementById('us-blad');
        const v = id => (document.getElementById(id) || {}).value || '';
        const bledy = [
          ...(haslo ? bledyHasla({ nowe: v('us-haslo'), powtorz: v('us-haslo2'), nazwa: u.imie }) : []),
          ...(pin ? bledyPinu({ nowy: v('us-pin'), powtorz: v('us-pin2') }) : []),
        ];
        if (bledy.length) { blad.textContent = bledy.join(' '); return; }
        blad.textContent = '';
        zajety(true);
        try {
          await adresDanychGotowy();
          const odp = await zapytajProgram('/api/ustaw-konto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token },
            body: JSON.stringify({ haslo: v('us-haslo').trim(), pin: v('us-pin').trim(),
                                   urzadzenie: navigator.userAgent.slice(0, 110) }),
          });
          const w = await odpowiedzLogowania(odp);
          if (!odp.ok) {
            if (w.do_ustawienia && w.do_ustawienia.length) {
              // Hasło przeszło, PIN nie — zostaje okno z samym PIN-em.
              oknoUstawieniaKonta(Object.assign({}, u, { do_ustawienia: w.do_ustawienia }), dalej, w.blad);
              return;
            }
            blad.textContent = w.blad || 'Nie udało się zapisać — spróbuj jeszcze raz.';
            return;
          }
          await przyjmijLogowanie(w, u.wpisany);
          z();
          komunikat('Hasło i PIN ustawione — działają we wszystkich aplikacjach GK.', 'ok');
          if (dalej) await dalej();
        } catch (e) {
          blad.textContent = poLudzku(e);
        } finally {
          zajety(false);
        }
      } },
    ],
    poOtwarciu: pole => { const p = pole.querySelector('input'); if (p) p.focus(); },
  });
}

/* --------------------------------------------------------------- ekrany */

// Z wielkiej litery, jak role w oknie konta aplikacji hali (STYL-GK §3).
const NAZWA_ROLI = { admin: 'Administrator', biuro: 'Biuro', kierowca: 'Kierowca' };

/* Trzy role, dwa progi. 'biuro' to wszystko, co robi się w biurze;
   'administrator' to dodatkowo konta i Ustawienia. Kierowca nie widzi ani
   jednego, ani drugiego. Te dwie funkcje to JEDYNY sposób pytania o rolę
   w całym froncie — porównania stan.uz.rola === 'admin' rozsiane po plikach
   ekranów rozjeżdżają się z progiem serwera przy pierwszej zmianie ról.     */
function jestBiuro() { return !!stan.uz && stan.uz.rola !== 'kierowca'; }
function jestAdministratorem() { return !!stan.uz && stan.uz.rola === 'admin'; }

/* Pasek dolny (tylko telefon): dokładnie cztery pozycje na rolę,
   [nazwa_ekranu, emoji, napis]. Menu boczne stoi w HTML-u, pasek dolny nie. */
const PASEK_BIURA = [['pulpit', '📊', 'Pulpit'], ['pojazdy', '🚗', 'Flota'],
                     ['terminy', '📅', 'Badania'], ['przeglady', '🧾', 'Przeglądy']];
/* U kierowcy „W razie awarii" zajmuje jedno z czterech miejsc kciuka — i to
   nie jest hojność, tylko jedyny ekran, którego szuka się w pośpiechu, w nocy
   i jedną ręką. Historia własnych przeglądów schodzi za to do menu bocznego:
   zagląda się do niej raz na miesiąc, na spokojnie.                         */
const PASEK_KIEROWCY = [['moj', '🚗', 'Moje auto'], ['przeglad', '📷', 'Przegląd'],
                        ['usterki', '⚠️', 'Usterka'], ['awaria', '🆘', 'Awaria']];

function menuDlaRoli() {
  const biuro = jestBiuro();
  document.querySelectorAll('.tylko-biuro').forEach(e => e.classList.toggle('ukryty', !biuro));
  document.querySelectorAll('.tylko-administrator')
    .forEach(e => e.classList.toggle('ukryty', !jestAdministratorem()));
  document.querySelectorAll('.tylko-kierowca').forEach(e => e.classList.toggle('ukryty', biuro));

  const dolne = (biuro ? PASEK_BIURA : PASEK_KIEROWCY).filter(([e]) => EKRANY[e]);
  const pasek = document.getElementById('pasek-dolny');
  pasek.innerHTML = dolne.map(([e, i, n]) =>
    `<button data-ekran="${e}"><span class="i">${i}</span><span>${n}</span></button>`).join('');
  pasek.querySelectorAll('button').forEach(b => b.onclick = () => pokazEkran(b.dataset.ekran));

  // Powrót do GK Trasy — tylko kierowca, który przyszedł stamtąd linkiem.
  const powrot = document.getElementById('menu-powrot');
  if (powrot) {
    powrot.textContent = NAPIS_POWROTU;
    powrot.classList.toggle('ukryty', !adresPowrotu());
    powrot.onclick = () => { const adres = adresPowrotu(); if (adres) location.href = adres; };
  }

  // Pozycja menu bez zarejestrowanego ekranu znika z widoku.
  // Program składa pięć plików ekranów; gdy któregoś zabraknie w wersji
  // wgranej na komputer biura, przycisk zostaje, ale nic nie robi — a martwy
  // przycisk uczy człowieka, że cały program jest zepsuty, i przestaje on
  // ufać także tym, które działają.
  document.querySelectorAll('.menu button[data-ekran]').forEach(b => {
    if (!EKRANY[b.dataset.ekran]) b.classList.add('ukryty');
  });
}

/* Brak routera i adresów #/… — nawigacja to wołanie funkcji z parametrem:
   pokazEkran('pojazd', { id: 14 }). Odświeżenie strony wraca na ekran
   domyślny roli, i to jest celowe: kierowca po restarcie telefonu ma
   zobaczyć swoje auto, a nie ostatnie okno sprzed tygodnia.                 */
async function pokazEkran(nazwa, parametry) {
  const ekran = EKRANY[nazwa];
  const tresc = document.getElementById('tresc');
  if (!ekran) {
    // Ekran, którego nie ma w rejestrze, to brakujący plik .js — mówimy o tym
    // wprost zamiast zostawiać pusty ekran bez jednego słowa wyjaśnienia.
    tresc.innerHTML = `<div class="karta"><h2>Tej części programu tu nie ma</h2>
      <p class="slaby">Ekran „${escHtml(nazwa)}" nie został wczytany. Otwórz
      Moje konto (ikona osoby u góry) i pokaż serwisantowi stemple wersji.</p></div>`;
    return;
  }
  if (ekran.tylkoBiuro && !jestBiuro()) return;
  if (ekran.tylkoAdministrator && !jestAdministratorem()) return;
  stan.ekran = nazwa;
  stan.parametryEkranu = parametry || {};
  document.getElementById('tytul-ekranu').textContent = ekran.tytul;
  document.querySelectorAll('.menu button[data-ekran], .pasek-dolny button[data-ekran]')
    .forEach(b => b.classList.toggle('wybrany', b.dataset.ekran === nazwa));
  zamknijMenu();
  tresc.innerHTML = '<div class="pusto">Wczytuję…</div>';
  window.scrollTo(0, 0);
  try {
    await ekran.rysuj(tresc, parametry || {});
  } catch (e) {
    tresc.innerHTML = `<div class="karta"><h2>Nie udało się wczytać</h2>
      <p class="slaby">${escHtml(poLudzku(e))}</p>
      <button class="glowny" id="btn-jeszcze-raz">Spróbuj ponownie</button></div>`;
    tresc.querySelector('#btn-jeszcze-raz').onclick = () => pokazEkran(nazwa, parametry);
  }
  // Wyjście z zaczętego przeglądu na inny ekran — odłożona nowa wersja może wejść.
  if (czekaNaPrzeladowanie) przeladujGdyWolno();
}

/* Przerysowanie tego, co stoi na widoku — po zapisie, po zamknięciu okna,
   po udanej wysyłce kolejki. Zapamiętane parametry znaczą, że karta pojazdu
   wraca na TEN SAM pojazd, a nie na pierwszy z brzegu.                      */
function odswiezEkran() {
  if (stan.ekran) pokazEkran(stan.ekran, stan.parametryEkranu);
}

function otworzMenu() {
  document.getElementById('menu').classList.add('otwarte');
  document.getElementById('zaslona').classList.add('widoczna');
}
function zamknijMenu() {
  document.getElementById('menu').classList.remove('otwarte');
  document.getElementById('zaslona').classList.remove('widoczna');
}

/* ------------------------------------------------------ dane podstawowe */

/* Słowniki: flota, wykaz kierowców i ustawienia. Wszystkie trzy lądują też
   w telefonie, bo bez nich ekran kierowcy na placu jest pusty.

   /api/kierowcy jest adresem biura — kierowca dostaje stamtąd 403 i to NIE
   jest awaria, tylko normalny stan rzeczy. Stąd .catch(() => []) przy tej
   jednej pozycji, a nie wokół całej trójki.                                 */
async function wczytajSlowniki() {
  try {
    /* Instrukcja awaryjna jedzie tą samą drogą co reszta słowników i to jest
       jej JEDYNY sens: kierowca otwiera ją w nocy, na poboczu, z jedną kreską
       zasięgu albo bez żadnej. Gdyby ekran pytał o nią serwer dopiero przy
       otwarciu, byłaby pusta dokładnie wtedy, kiedy jest potrzebna.         */
    const [pojazdy, kierowcy, ustawienia, instrukcje] = await Promise.all([
      API.get('/api/pojazdy'),
      API.get('/api/kierowcy').catch(() => []),
      API.get('/api/ustawienia'),
      API.get('/api/instrukcje').catch(() => []),
    ]);
    stan.pojazdy = pojazdy; stan.kierowcy = kierowcy; stan.ustawienia = ustawienia;
    stan.instrukcje = instrukcje;
    await Kolejka.zapamietaj('slowniki', { pojazdy, kierowcy, ustawienia, instrukcje })
      .catch(() => { /* brak pamięci boli dopiero jutro, nie teraz */ });
  } catch (e) {
    const kopia = await Kolejka.przypomnij('slowniki').catch(() => null);
    if (kopia) {
      stan.pojazdy = kopia.pojazdy || []; stan.kierowcy = kopia.kierowcy || [];
      stan.ustawienia = kopia.ustawienia || {};
      stan.instrukcje = kopia.instrukcje || [];
      komunikat('Brak połączenia — pracuję na danych z ostatniej synchronizacji');
    } else {
      stan.pojazdy = []; stan.kierowcy = []; stan.ustawienia = {};
      stan.instrukcje = [];
      komunikat('Brak połączenia i brak kopii danych w telefonie', 'blad');
    }
  }
}

/* Lista ujęć obowiązkowych przychodzi z serwera razem z ustawieniami —
   front NIE trzyma własnej kopii. Serwer i tak sprawdza komplet przy
   domykaniu przeglądu, więc dwie listy znaczyłyby telefon, który melduje
   „gotowe", i serwer, który tego nie przyjmuje.                             */
function ujeciaObowiazkowe() {
  return (stan.ustawienia.ujecia || []).filter(u => u.obowiazkowe);
}
function punktyPrzegladu() {
  return stan.ustawienia.punkty || [];
}

/* Przeglądarki wpuszczają tryb offline (service worker) tylko na localhost
   albo po HTTPS. Pod zwykłym http://192.168… jest wyłączony i nie da się tego
   obejść — więc zamiast po cichu nie działać, mówimy o tym wprost.          */
function trybOffline() {
  if (!('serviceWorker' in navigator)) {
    return {
      pelny: false,
      opis: 'ograniczony',
      wyjasnienie: 'Aplikacja trzyma zdjęcia i odczyty bez zasięgu i wysyła je po powrocie, '
        + 'ale musi być otwarta od wyjazdu. Otwórz ją jeszcze na firmowym wifi. '
        + 'Pełną pracę bez zasięgu włącza dopiero adres z https:// — biuro uruchamia go '
        + 'w Ustawieniach, w sekcji „Adres HTTPS dla kierowców".',
    };
  }
  return {
    pelny: true,
    opis: 'pełny',
    // „urządzenia”, nie „telefonu” — to samo okno widzi biuro na komputerze.
    wyjasnienie: 'Aplikacja otwiera się i działa bez zasięgu, także po ponownym '
      + 'uruchomieniu urządzenia.',
  };
}

/* ---------------------------------------------------------------- konto */

/* Trzy stemple wersji obok siebie: pliki na dysku serwera, skrypt wczytany
   do przeglądarki i arkusz wczytany do przeglądarki. Gdy się różnią,
   przeglądarka chodzi na starej albo mieszanej kopii — i to widać od razu,
   bez zgadywania. To ta ramka, którą komunikat o mieszance każe pokazać
   serwisantowi.                                                             */
/* Wersja dla ludzi bez starego przedrostka („wersja 6752eefd56ab”, nie flotex-…). */
function wersjaDlaLudzi(w) {
  return String(w || '?').replace(/^(flotex|gk-flota)-/, '');
}

/* Stopka okna konta: sama wersja. Ramka ze stemplami (stempelWersji) jest
   diagnostyką — widzi ją tylko administrator; reszta dostaje ją wyłącznie
   wtedy, gdy przeglądarka ma mieszankę wersji (z przyciskiem „Odśwież”). */
function stopkaWersji() {
  const skrypt = (typeof WERSJA_SKRYPTU === 'string') ? WERSJA_SKRYPTU : stan.uz.wersja;
  return `<p class="konto-drobne wersja-stopka">wersja ${escHtml(wersjaDlaLudzi(skrypt))}</p>`;
}

function stempelWersji() {
  const dysk = (stan.uz && stan.uz.wersja) || '?';
  const skrypt = (typeof WERSJA_SKRYPTU === 'string') ? WERSJA_SKRYPTU : '?';
  const arkusz = (getComputedStyle(document.documentElement)
    .getPropertyValue('--wersja-arkusza') || '?').replace(/['"\s]/g, '') || '?';
  // Przy dwóch adresach „dysk" i „skrypt" to DWIE RÓŻNE KOPIE programu, więc
  // i podpisy muszą mówić, co z czym porównujemy. „Przeglądarka ma starą
  // kopię" przy aplikacji na Pages byłoby po prostu nieprawdą.
  const osobno = !!API_BAZA;
  const mieszanka = skrypt !== arkusz;
  const doPublikacji = !mieszanka && dysk !== '?' && dysk !== skrypt;
  const zgodne = !mieszanka && !doPublikacji;
  const naglowek = mieszanka ? 'Przeglądarka ma mieszankę wersji programu'
    : doPublikacji ? (osobno ? 'Aplikacja kierowców jest starsza niż program w biurze'
                             : 'Przeglądarka ma starą kopię programu')
    : 'Program aktualny';
  // Odświeżenie czyści pamięć przeglądarki, więc pomaga WYŁĄCZNIE na mieszankę.
  // Przy nieopublikowanej wersji nie zmieniłoby nic — poza skasowaniem
  // kierowcy trybu offline.
  const naprawialne = mieszanka;
  if (!jestAdministratorem()) {
    return !naprawialne ? '' : `
    <div class="wstega blad" id="stempel-wersji" style="margin-top:10px">
      <b>${naglowek}</b>
      <button class="maly" id="btn-odswiez-program" style="margin-top:8px">Odśwież program</button>
    </div>`;
  }
  // Wszystko zgodne: administrator dostaje stemple zwinięte pod „wersja X”, a nie
  // niebieską ramkę w środku okna konta (STYL-GK §3: na dole samo „wersja X”).
  if (zgodne) {
    return `<details class="konto-wersja" id="stempel-wersji"><summary>Szczegóły wersji</summary>
      ${osobno ? 'program w biurze' : 'pliki na dysku'}: <code>${escHtml(dysk)}</code><br>
      ${osobno ? 'aplikacja na GitHub Pages' : 'skrypt w przeglądarce'}: <code>${escHtml(skrypt)}</code><br>
      arkusz w przeglądarce: <code>${escHtml(arkusz)}</code></details>`;
  }
  return `
    <div class="wstega ${zgodne ? 'info' : 'blad'}" id="stempel-wersji" style="margin-top:10px">
      <b>${naglowek}</b>
      <div class="male" style="margin-top:6px; font-weight:400">
        ${osobno ? 'program w biurze' : 'pliki na dysku'}: <code>${escHtml(dysk)}</code><br>
        ${osobno ? 'aplikacja na GitHub Pages' : 'skrypt w przeglądarce'}: <code>${escHtml(skrypt)}</code><br>
        arkusz w przeglądarce: <code>${escHtml(arkusz)}</code>
      </div>
      ${doPublikacji && osobno ? `<div class="male" style="margin-top:6px">
        Ustawienia → <b>Wyślij aplikację na GitHub</b>.</div>` : ''}
      ${naprawialne ? `<button class="maly" id="btn-odswiez-program" style="margin-top:8px">
        Odśwież program</button>` : ''}
    </div>`;
}

/* Czy przeglądarka chodzi na MIESZANCE wersji — i tylko wtedy naprawa.

   Mieszanka zdarza się przy jednym mrugnięciu sieci, bo service worker podaje
   wtedy pojedynczy plik z kopii. Nic tego nie zgłasza: stary i nowy plik
   parsują się tak samo poprawnie, aplikacja po prostu zachowuje się nie tak,
   jak w kodzie. Poznaje się ją po tym, że SKRYPT i ARKUSZ — dwa pliki z tej
   samej paczki — mają różne stemple.

   Stempel „z dysku" to osobna sprawa i wolno mu się różnić. Przy jednym
   adresie znaczył to samo, bo serwer wydawał dokładnie te pliki, które
   przeglądarka miała wczytać. Przy dwóch adresach — wygląd z GitHub Pages,
   dane z biura — to DWIE NIEZALEŻNE KOPIE: biuro aktualizuje program
   u siebie, a paczka na Pages zmienia się dopiero po naciśnięciu „Wyślij
   aplikację na GitHub". Różnica jest wtedy normalnym stanem rzeczy,
   a nie awarią przeglądarki.

   Ten warunek raz już był postawiony na stemplu z dysku i kosztowałby
   dokładnie to, przed czym cały tryb offline ma chronić: kierowcy na placu
   bez zasięgu aplikacja kasowała service workera i całą pamięć podręczną,
   po czym przeładowywała się na stronę błędu sieci. Zdjęcia zostawały
   w telefonie, ale nie było już czym ich otworzyć.                          */
async function sprawdzSpojnoscWersji() {
  const dysk = (stan.uz && stan.uz.wersja) || '';
  const skrypt = (typeof WERSJA_SKRYPTU === 'string') ? WERSJA_SKRYPTU : '';
  const arkusz = (getComputedStyle(document.documentElement)
    .getPropertyValue('--wersja-arkusza') || '').replace(/['"\s]/g, '');
  const znanyDysk = !!dysk && dysk !== '?';

  // API_BAZA niepuste znaczy: wygląd i dane stoją pod różnymi adresami.
  const osobneAdresy = !!API_BAZA;
  const mieszanka = (skrypt !== arkusz)
    || (!osobneAdresy && znanyDysk && dysk !== skrypt);

  if (!mieszanka) {
    // Paczka jest spójna, tylko starsza niż program w biurze. Mówimy o tym
    // TEMU, KTO MOŻE TO NAPRAWIĆ — kierowca nie ma dostępu do Ustawień
    // i dostałby ostrzeżenie, z którym nie ma co zrobić.
    if (osobneAdresy && znanyDysk && dysk !== skrypt && jestBiuro()) {
      komunikat('Kierowcy mają starszą wersję aplikacji niż program w biurze. '
        + 'Ustawienia → „Wyślij aplikację na GitHub”.', 'blad');
    }
    return;
  }

  // Bez zasięgu kasowanie pamięci podręcznej jest nie do odrobienia: po
  // przeładowaniu nie ma skąd wziąć plików i kierowca zostaje ze stroną
  // błędu sieci. Mieszanka jest uciążliwa, brak aplikacji na placu — nie.
  if (!navigator.onLine) {
    komunikat('Program chodzi na mieszance wersji. Naprawię to przy '
      + 'najbliższym zasięgu — na razie pracuj dalej.', 'blad');
    return;
  }

  // BEZ TEGO BLOKU PROGRAM WPADA W PĘTLĘ. Gdy stemple naprawdę różnią się
  // w samej paczce (ktoś poprawił plik i nie uruchomił zbuduj.py),
  // przeładowanie niczego nie zmienia: aplikacja wstaje, znowu widzi różnicę,
  // znowu się przeładowuje — i tak w kółko, bez jednego komunikatu na ekranie.
  // Jedna próba na sesję, na TĘ parę stempli.
  const proba = skrypt + '|' + arkusz;
  let juzProbowano = false;
  try { juzProbowano = sessionStorage.getItem(PRZEDROSTEK_PAMIECI + 'naprawa-wersji') === proba; }
  catch (e) { /* tryb prywatny */ }
  if (juzProbowano) {
    komunikat('Przeglądarka chodzi na mieszance wersji programu. '
      + 'Otwórz Moje konto (ikona osoby u góry) i pokaż tę ramkę serwisantowi.', 'blad');
    return;
  }
  try { sessionStorage.setItem(PRZEDROSTEK_PAMIECI + 'naprawa-wersji', proba); } catch (e) { /* trudno */ }
  komunikat('Porządkuję pliki programu — chwila…', 'ok');
  await odswiezProgram();
}

/* Czyści pamięć podręczną aplikacji i wczytuje ją od nowa. Dane firmy są na
   serwerze, a niewysłane zapisy w IndexedDB — tego NIE ruszamy.

   Tylko SWOJE: worker tej strony (getRegistration bez listy) i pamięci
   „flotex-…”. Na wspólnym źródle GitHub Pages (D33) getRegistrations()
   i caches.keys() oddają też workery i pamięci GK Trasy i aplikacji hali —
   naprawa floty zabierałaby im tryb offline.                                */
async function odswiezProgram() {
  try {
    if ('serviceWorker' in navigator) {
      const moja = await navigator.serviceWorker.getRegistration();
      if (moja) await moja.unregister();
    }
    if (window.caches) {
      const klucze = await caches.keys();
      await Promise.all(klucze.filter(k => k.startsWith('flotex-')).map(k => caches.delete(k)));
    }
  } catch (e) { /* i tak przeładujemy */ }
  location.reload();
}

/* Zasada nowego PIN-u w jednym miejscu — okno konta i okno słabego PIN-u mówią
   to samo co serwer. Konto z Panelu Kierownika ma PIN wspólny dla wszystkich
   aplikacji GK: kierowca 4–8 cyfr (aplikacje hali mają klawiaturę cyfrową),
   biuro hasło od 8 znaków (GK-KONTA.md, punkt 1). Pola PIN-u są bez
   inputmode="numeric": na telefonie z klawiaturą cyfrową hasła biura nie
   dałoby się wpisać. */
function opisNowegoPinu() {
  if (jestBiuro()) return 'min. 8 znaków';
  return stan.uz && stan.uz.pin_w_panelu ? '4–8 cyfr' : 'min. 4 znaki';
}

/* Klawiatura jak w aplikacjach hali (konto.js): biuro — zwykła (hasło z liter),
   kierowca z kontem z Panelu — cyfrowa (PIN to 4–8 cyfr). Tutejszy kierowca
   mógł kiedyś dostać PIN z literami — dla niego też zwykła. */
function trybKlawiaturyPinu() {
  return !jestBiuro() && stan.uz && stan.uz.pin_w_panelu ? 'numeric' : 'text';
}

/* Wygląd w oknie konta: pigułki jak w aplikacjach hali (STYL-GK §3), nie natywne
   radio. Na komputerze „Jak w systemie”, na telefonie „Jak w telefonie” — ta sama
   reguła (brak wyboru = jak urządzenie), inne słowo. Próg jak w arkuszu (821 px). */
function wyborWygladu() {
  const naKomputerze = typeof window.matchMedia === 'function'
    && window.matchMedia('(min-width:821px)').matches;
  const wybrany = Motyw.odczytaj();
  return [['auto', naKomputerze ? 'Jak w systemie' : 'Jak w telefonie'], ['jasny', 'Jasny'], ['ciemny', 'Ciemny']]
    .map(([k, n]) => `<button type="button" data-wyglad="${k}" aria-pressed="${wybrany === k}">${n}</button>`)
    .join('');
}

/* „Dane w tym urządzeniu” w Moim koncie: licznik i „Wyślij teraz” tylko wtedy,
   gdy coś czeka (STYL-GK §3, jak w hali — przy zerze sam przycisk tylko mylił).
   Po wysyłce z tego przycisku licznik odświeża się w otwartym oknie. */
function pokazKolejkeWKoncie(pole) {
  const ile = pole.querySelector('#ile-w-kolejce');
  const wyslij = pole.querySelector('#btn-wyslij-teraz');
  if (!ile || !wyslij) return;
  ile.textContent = stan.bezPamieci ? 'pamięć przeglądarki nie odpowiada' : stan.wKolejce;
  wyslij.parentNode.classList.toggle('ukryty', !(stan.wKolejce > 0));
}

/* „Moje konto” w układzie okna konta aplikacji hali (konto.js → HalaKonto.mojeKonto),
   tak samo jak w GK Trasy: osoba i rola → Wygląd → Zmień hasło/PIN (formularz
   rozwija się w oknie) → Powiadomienia → Dane w tym urządzeniu → wersja →
   Zamknij + Wyloguj na dole. */
function oknoKonta() {
  // Serwer wymaga od biura dłuższego hasła niż od kierowcy: konto biura widzi
  // całą flotę z VIN-ami i polisami. Podpowiedź musi mówić tę samą liczbę,
  // inaczej człowiek wpisuje cztery znaki i dostaje odmowę bez zrozumienia.
  const zmien = jestBiuro() ? 'Zmień hasło' : 'Zmień PIN';
  okno({
    tytul: 'Moje konto',
    konto: true,
    tresc: `
      <p class="konto-kto"><b>${escHtml(stan.uz.imie)}</b><span>${escHtml(NAZWA_ROLI[stan.uz.rola] || stan.uz.rola)}</span></p>
      <fieldset><legend>Wygląd</legend>
        <div class="wybor-wygladu" role="group" aria-label="Wygląd">${wyborWygladu()}</div>
        <p class="konto-drobne">Dotyczy tego urządzenia, nie konta — zostaje po wylogowaniu.</p>
      </fieldset>
      ${stan.uz.zrodlo === 'trasex'
        ? `<p class="konto-drobne">Twoje konto prowadzi GK Trasy — tam zmieniasz PIN.
             Nowy zadziała tutaj sam po kilku minutach.</p>`
        : stan.uz.d43 ? trescZmianD43()
        : `<div><button type="button" id="btn-pokaz-zmiane">${zmien}</button></div>
      <fieldset id="zmiana-pinu" class="ukryty"><legend>${zmien}</legend>
        <label>${jestBiuro() ? 'Obecne hasło' : 'Obecny PIN'}<input id="pin-stary" type="password"
               inputmode="${trybKlawiaturyPinu()}" autocomplete="current-password" maxlength="128"></label>
        <label>${jestBiuro() ? 'Nowe hasło' : 'Nowy PIN'} <span class="slaby">(${escHtml(opisNowegoPinu())})</span>
          <input id="pin-nowy" type="password" inputmode="${trybKlawiaturyPinu()}"
                 autocomplete="new-password" maxlength="128"></label>
        <p class="konto-drobne">${stan.uz.pin_w_panelu
          ? (jestBiuro()
            ? 'To hasło działa we wszystkich aplikacjach GK — zmiana tutaj zmienia je wszędzie. '
            : 'Ten PIN działa we wszystkich aplikacjach GK — zmiana tutaj zmienia go wszędzie. ')
          : ''}Zmiana wylogowuje pozostałe urządzenia — to urządzenie zostaje.</p>
        <div class="przyciski">
          <button type="button" id="btn-anuluj-zmiane">Anuluj</button>
          <button type="button" class="glowny" id="btn-zmien-pin">${zmien}</button>
        </div>
      </fieldset>`}
      <fieldset><legend>Powiadomienia</legend>
        <p class="konto-drobne">${escHtml(opisPowiadomien())}</p>
        <div id="push-konto" class="konto-push"><p class="konto-drobne">Sprawdzam…</p></div>
      </fieldset>
      <fieldset><legend>Dane w tym urządzeniu</legend>
        <p class="konto-drobne">Czeka na wysłanie: <span id="ile-w-kolejce">…</span></p>
        <p class="konto-drobne ${stan.obceWKolejce ? '' : 'ukryty'}" id="obce-w-kolejce"></p>
        <div id="odrzucone-zapisy"></div>
        <p class="konto-drobne">${escHtml(trybOffline().wyjasnienie)}</p>
        <div class="ukryty"><button type="button" id="btn-wyslij-teraz">Wyślij teraz</button></div>
      </fieldset>
      ${stopkaWersji()}
      ${stempelWersji()}`,
    przyciski: [
      { napis: 'Zamknij', klik: z => z() },
      { napis: 'Wyloguj', klasa: 'glowny', klik: z => { z(); wyloguj(); } },
    ],
    poOtwarciu: pole => {
      // Motyw przełącza się od razu, bez zamykania okna: cały wygląd wisi
      // na jednym atrybucie <html>, więc nie ma czego przerysowywać.
      const pigulki = pole.querySelectorAll('[data-wyglad]');
      pigulki.forEach(b => b.onclick = () => {
        Motyw.ustaw(b.dataset.wyglad);
        pigulki.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      });
      pokazKolejkeWKoncie(pole);
      if (stan.obceWKolejce) {
        pole.querySelector('#obce-w-kolejce').innerHTML =
          `⚠️ Dodatkowo <b>${stan.obceWKolejce}</b> ${odmiana(stan.obceWKolejce,
            'zapis czeka', 'zapisy czekają', 'zapisów czeka')} na inną osobę,
           która pracowała na tym urządzeniu. Wyślą się, gdy ta osoba się tu zaloguje —
           nie kasuj danych aplikacji, bo przepadną.`;
      }
      if (stan.uz.d43 && stan.uz.zrodlo !== 'trasex') podepnijZmianyD43(pole);
      // „Zmień hasło” to przycisk; formularz rozwija się dopiero po nim (jak w hali).
      const formularz = pole.querySelector('#zmiana-pinu');
      const pokaz = pole.querySelector('#btn-pokaz-zmiane');
      if (pokaz && !stan.uz.d43) {
        pokaz.onclick = () => {
          pokaz.parentNode.classList.add('ukryty');
          formularz.classList.remove('ukryty');
          pole.querySelector('#pin-stary').focus();
        };
        pole.querySelector('#btn-anuluj-zmiane').onclick = () => {
          formularz.querySelectorAll('input').forEach(i => { i.value = ''; });
          formularz.classList.add('ukryty');
          pokaz.parentNode.classList.remove('ukryty');
        };
      }
      const zmienPin = pole.querySelector('#btn-zmien-pin');
      if (zmienPin && !stan.uz.d43) zmienPin.onclick = async () => {
        const stary = pole.querySelector('#pin-stary').value;
        const nowy = pole.querySelector('#pin-nowy').value;
        const w = await sprobuj(() => API.post('/api/zmien-pin', { stary, nowy }),
          `${jestBiuro() ? 'Hasło zmienione' : 'PIN zmieniony'} — pozostałe urządzenia zostały wylogowane`);
        if (!w) return;
        // Zmiana hasła unieważnia stare sesje, więc trzeba przejąć nowy token,
        // inaczej wyrzuciłoby z aplikacji dokładnie tego, kto właśnie posłuchał
        // i zmienił PIN.
        if (w.token) { stan.token = w.token; pamietaj('token', w.token); }
        stan.uz.haslo_startowe = false;
        zamknijOkno();
      };
      rysujPowiadomienia(pole.querySelector('#push-konto'));
      rysujOdrzucone(pole.querySelector('#odrzucone-zapisy'));
      pole.querySelector('#btn-wyslij-teraz').onclick = async () => {
        await synchronizuj(false);
        pokazKolejkeWKoncie(pole);
      };
      const odswiez = pole.querySelector('#btn-odswiez-program');
      if (odswiez) odswiez.onclick = odswiezProgram;
    },
  });
}

/* Moje konto, konto z Panelu w D43 (hasło + PIN, GK-KONTA.md §7, STYL-GK §3):
   dwa przyciski „Zmień hasło” i „Zmień PIN”, każdy rozwija swój formularz. */
function trescZmianD43() {
  return `<div class="przyciski-konta" id="zmiany-d43">
        <button type="button" id="btn-pokaz-haslo">Zmień hasło</button>
        <button type="button" id="btn-pokaz-pin">Zmień PIN</button>
      </div>
      <fieldset id="zmiana-hasla" class="ukryty"><legend>Zmień hasło</legend>
        <p class="konto-drobne">To hasło działa we wszystkich aplikacjach GK. Wpisujesz je raz na 12 godzin
          na urządzeniu, na co dzień — PIN. Inne urządzenia poproszą o nowe hasło.</p>
        <label>Obecne hasło<input id="zh-stare" type="password" autocomplete="current-password" maxlength="128"></label>
        <label>Nowe hasło (min. 8 znaków)<input id="zh-nowe" type="password" autocomplete="new-password" maxlength="128"></label>
        <label>Powtórz nowe hasło<input id="zh-powtorz" type="password" autocomplete="new-password" maxlength="128"></label>
        <p class="blad-ustawienia" id="zh-blad" role="alert"></p>
        <div class="przyciski">
          <button type="button" data-anuluj>Anuluj</button>
          <button type="button" class="glowny" id="btn-zmien-haslo">Zmień hasło</button>
        </div>
      </fieldset>
      <fieldset id="zmiana-pinu-d43" class="ukryty"><legend>Zmień PIN</legend>
        <p class="konto-drobne">Ten PIN działa we wszystkich aplikacjach GK — na urządzeniu, na którym w ciągu
          12 godzin wpisano hasło. Inne zalogowane urządzenia trzeba będzie zalogować od nowa.</p>
        <label>Obecne hasło albo PIN<input id="zp-stary" type="password" autocomplete="current-password" maxlength="128"></label>
        <label>Nowy PIN (4 cyfry)<input id="zp-nowy" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4"></label>
        <label>Powtórz nowy PIN<input id="zp-powtorz" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4"></label>
        <p class="blad-ustawienia" id="zp-blad" role="alert"></p>
        <div class="przyciski">
          <button type="button" data-anuluj>Anuluj</button>
          <button type="button" class="glowny" id="btn-zmien-pin-d43">Zmień PIN</button>
        </div>
      </fieldset>`;
}

/* Nowy token (i znacznik) po zmianie sekretu — stare sesje przepadły, także ta. */
function przejmijPoZmianie(w) {
  if (w.token) { stan.token = w.token; pamietaj('token', w.token); }
  if (w.znacznik) Znaczniki.zapamietaj([stan.uz.login, stan.uz.imie], w.znacznik, w.znacznik_do);
}

function podepnijZmianyD43(pole) {
  const przyciski = pole.querySelector('#zmiany-d43');
  const formularze = { haslo: pole.querySelector('#zmiana-hasla'), pin: pole.querySelector('#zmiana-pinu-d43') };
  const zwin = () => {
    Object.values(formularze).forEach(f => {
      f.classList.add('ukryty');
      f.querySelectorAll('input').forEach(i => { i.value = ''; });
      f.querySelector('.blad-ustawienia').textContent = '';
    });
    przyciski.classList.remove('ukryty');
  };
  const rozwin = co => {
    przyciski.classList.add('ukryty');
    formularze[co].classList.remove('ukryty');
    formularze[co].querySelector('input').focus();
  };
  pole.querySelector('#btn-pokaz-haslo').onclick = () => rozwin('haslo');
  pole.querySelector('#btn-pokaz-pin').onclick = () => rozwin('pin');
  pole.querySelectorAll('[data-anuluj]').forEach(b => { b.onclick = zwin; });
  const v = id => pole.querySelector(id).value;
  pole.querySelector('#btn-zmien-haslo').onclick = async () => {
    const blad = pole.querySelector('#zh-blad');
    const bledy = bledyHasla({ stare: v('#zh-stare'), nowe: v('#zh-nowe'), powtorz: v('#zh-powtorz'),
                               nazwa: stan.uz.imie, wymagajStarego: true });
    blad.textContent = bledy.join(' ');
    if (bledy.length) return;
    const w = await sprobuj(() => API.post('/api/zmien-haslo', { stare: v('#zh-stare').trim(), nowe: v('#zh-nowe').trim(),
                                                              urzadzenie: navigator.userAgent.slice(0, 110) }),
      'Hasło zmienione — działa we wszystkich aplikacjach GK. Inne urządzenia poproszą o nowe hasło.');
    if (!w) return;
    przejmijPoZmianie(w);
    zamknijOkno();
  };
  pole.querySelector('#btn-zmien-pin-d43').onclick = async () => {
    const blad = pole.querySelector('#zp-blad');
    const bledy = bledyPinu({ stary: v('#zp-stary'), nowy: v('#zp-nowy'), powtorz: v('#zp-powtorz'),
                              wymagajStarego: true });
    blad.textContent = bledy.join(' ');
    if (bledy.length) return;
    const zn = Znaczniki.dla(stan.uz.login);
    const w = await sprobuj(() => API.post('/api/zmien-pin', { stary: v('#zp-stary').trim(), nowy: v('#zp-nowy').trim(),
                                                            znacznik: zn ? zn.z : null,
                                                            urzadzenie: navigator.userAgent.slice(0, 110) }),
      'PIN zmieniony — działa we wszystkich aplikacjach GK.');
    if (!w) return;
    przejmijPoZmianie(w);
    zamknijOkno();
  };
}

/* --------------------------------------------------------- powiadomienia */

/* Powiadomienia przy zamkniętej aplikacji (Web Push), wzór: hub GK Panel
   Kierownika. Telefon zapisuje się u serwera push swojej przeglądarki kluczem
   VAPID programu i oddaje programowi adres subskrypcji. Program po zdarzeniu
   wysyła pusty push, a sw.js dociąga treść z /api/push/co-nowego.

   Działa tylko pod https:// (albo na localhost) — przeglądarki nie dają push
   stronie z http://192.168… — a na iPhonie tylko z aplikacją dodaną do ekranu
   początkowego (iOS 16.4+). Tam, gdzie się nie da, mówimy to wprost zamiast
   przełącznika, który nic nie robi.                                         */
const NIEDOSTEPNE_POWIADOMIENIA = 'Niedostępne tutaj: potrzebny adres https:// (tunel albo '
  + 'aplikacja na GitHub Pages), a na iPhonie — aplikacja dodana do ekranu początkowego.';

function bajtyKlucza(t) {
  const b = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - t.length % 4) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

const Powiadomienia = {
  mozliwe() {
    return 'serviceWorker' in navigator && typeof window.PushManager !== 'undefined'
      && typeof window.Notification !== 'undefined' && !!window.isSecureContext;
  },
  async subskrypcja() {
    if (!this.mozliwe()) return null;
    try {
      const rej = await navigator.serviceWorker.getRegistration();
      return rej ? await rej.pushManager.getSubscription() : null;
    } catch (e) { return null; }
  },
  /* 'niedostepne' | 'zablokowane' | 'wlaczone' | 'wylaczone' */
  async stan() {
    if (!this.mozliwe()) return 'niedostepne';
    if (Notification.permission === 'denied') return 'zablokowane';
    return przypomnijSobie('powiadomienia') === '1' && Notification.permission === 'granted'
      && await this.subskrypcja() ? 'wlaczone' : 'wylaczone';
  },
  /* Jedno dotknięcie: zgoda przeglądarki, subskrypcja i zapis w programie. */
  async wlacz() {
    if (!this.mozliwe()) throw new Error(NIEDOSTEPNE_POWIADOMIENIA);
    if (await Notification.requestPermission() !== 'granted') {
      throw new Error('Powiadomienia są zablokowane — zezwól na nie w ustawieniach '
        + 'przeglądarki dla tej strony i spróbuj jeszcze raz.');
    }
    const rej = await navigator.serviceWorker.ready;
    const { klucz } = await API.get('/api/push/klucz');
    const bajty = bajtyKlucza(klucz);
    let sub = await rej.pushManager.getSubscription();
    // Subskrypcja z innym kluczem (np. inny program pod tym adresem) nie
    // przyjmie naszego podpisu — zakładamy ją od nowa.
    const jej = sub && sub.options && sub.options.applicationServerKey
      ? new Uint8Array(sub.options.applicationServerKey) : null;
    if (sub && jej && (jej.length !== bajty.length || jej.some((b, i) => b !== bajty[i]))) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) sub = await rej.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bajty });
    await API.post('/api/push/zapisz', { subskrypcja: sub.toJSON() });
    pamietaj('powiadomienia', '1');
  },
  async wylacz() {
    const sub = await this.subskrypcja();
    if (sub) {
      try { await API.post('/api/push/wypisz', { endpoint: sub.endpoint }); }
      catch (e) { /* bez sieci — program wypisze telefon sam, gdy serwer push odpowie 410 */ }
      await sub.unsubscribe().catch(() => {});
    }
    zapomnijKlucz('powiadomienia');
  },
  /* Po zalogowaniu na telefonie z włączonymi powiadomieniami: subskrypcja
     przechodzi na osobę, która się właśnie zalogowała (wspólny telefon). */
  async odnow() {
    try {
      if (przypomnijSobie('powiadomienia') !== '1' || !this.mozliwe()
          || Notification.permission !== 'granted') return;
      const sub = await this.subskrypcja();
      if (sub) await API.post('/api/push/zapisz', { subskrypcja: sub.toJSON() });
    } catch (e) { /* spróbujemy przy następnym logowaniu */ }
  },
};

/* Co dzwoni — zależy od roli. Człowiek, który wie, po co włącza, nie wyłącza
   powiadomień po pierwszym dniu. */
function opisPowiadomien() {
  return jestBiuro()
    ? 'Auto, które stoi, poważna usterka, przegląd do zatwierdzenia i terminy floty.'
    : 'Przegląd do zrobienia i przypomnienie, odrzucony przegląd, zamknięta usterka.';
}

/* Jeden przycisk w oknie „Moje konto”: Włącz powiadomienia / Włączone + Wyłącz —
   te same stany i słowa co w GK Trasy i w Panelu (STYL-GK §3). Dawniej był tu
   natywny checkbox pod drugim nagłówkiem „Powiadomienia”. */
async function rysujPowiadomienia(pole) {
  if (!pole) return;
  const s = await Powiadomienia.stan();
  pole.innerHTML = s === 'wlaczone'
    ? `<p class="konto-ok">Włączone — także przy zamkniętej aplikacji.</p>
       <button type="button" id="btn-push" data-push="wylacz">Wyłącz</button>`
    : s === 'zablokowane'
      ? `<p class="konto-uwaga">Zablokowane — zezwól na powiadomienia w ustawieniach
           przeglądarki dla tej strony.</p>`
      : s === 'niedostepne'
        ? `<p class="konto-uwaga">${escHtml(NIEDOSTEPNE_POWIADOMIENIA)}</p>`
        : `<button type="button" class="glowny" id="btn-push" data-push="wlacz">Włącz powiadomienia</button>`;
  const b = pole.querySelector('#btn-push');
  if (b) b.onclick = async () => {
    b.disabled = true;
    const wlacz = b.dataset.push === 'wlacz';
    await sprobuj(() => (wlacz ? Powiadomienia.wlacz() : Powiadomienia.wylacz()),
                  wlacz ? 'Powiadomienia włączone' : 'Powiadomienia wyłączone');
    rysujPowiadomienia(pole);
  };
}

/* Ekran wskazany przez powiadomienie: tylko z rejestru i tylko taki, który ta
   rola może otworzyć — inaczej pokazEkran() zostawiłby pusty ekran. */
function ekranDozwolony(nazwa) {
  const ekran = EKRANY[nazwa];
  return !!ekran && !(ekran.tylkoBiuro && !jestBiuro())
    && !(ekran.tylkoAdministrator && !jestAdministratorem());
}

function ekranZAdresu() {
  const znaleziony = /(?:^#|&)ekran=([a-z_]+)/.exec(location.hash || '');
  if (!znaleziony) return '';
  try { history.replaceState(null, '', location.pathname + location.search); }
  catch (e) { /* zostanie w pasku — nic złego */ }
  return znaleziony[1];
}

/* Zapisy, których serwer nie przyjął. Nie kasujemy ich za człowieka —
   pokazujemy, co i dlaczego nie przeszło, i zostawiamy decyzję jemu.        */
async function rysujOdrzucone(pole) {
  const lista = await Kolejka.listaOdrzuconych().catch(() => []);
  if (!lista.length) { pole.innerHTML = ''; return; }

  const opis = (o) => {
    const zdjec = (o.zdjecia || []).length;
    const ze = zdjec ? ` · ${zdjec} ${odmiana(zdjec, 'zdjęcie', 'zdjęcia', 'zdjęć')}` : '';
    if (o.typ === 'przeglad') return `Przegląd za ${escHtml(o.okres || '')}${ze}`;
    if (o.typ === 'zdjecia') return `Zdjęcia do przeglądu${ze}`;
    if (o.typ === 'przebieg') return `Odczyt licznika ${kilometry(o.km)}`;
    if (o.typ === 'usterka') return 'Zgłoszenie usterki';
    return o.typ;
  };

  pole.innerHTML = `
    <div class="wstega uwaga" style="margin-top:12px">
      <b>${lista.length} ${odmiana(lista.length, 'zapis nie przeszedł', 'zapisy nie przeszły',
        'zapisów nie przeszło')}.</b> Nic nie zostało skasowane — leżą w tym urządzeniu.
      Pokaż to biuru; gdy usuną przyczynę, dotknij „Spróbuj ponownie".
    </div>
    ${lista.map(o => `<div class="karta scisla" style="margin-bottom:8px">
        <div class="male"><b>${escHtml(opis(o))}</b></div>
        <div class="male slaby">${escHtml(o.blad)}</div>
        <div class="male slaby">zapisane ${escHtml((o.dodano || '').slice(0, 16).replace('T', ' '))}</div>
        <div class="przyciski" style="margin-top:8px">
          <button class="maly" data-ponow="${escHtml(o.uuid)}">Spróbuj ponownie</button>
          <button class="maly" data-porzuc="${escHtml(o.uuid)}">Porzuć</button>
        </div>
      </div>`).join('')}`;

  pole.querySelectorAll('[data-ponow]').forEach(b => b.onclick = async () => {
    await Kolejka.ponow(b.dataset.ponow);
    await odswiezStanSieci();
    await rysujOdrzucone(pole);
    synchronizuj(false);
  });
  pole.querySelectorAll('[data-porzuc]').forEach(b => b.onclick = async () => {
    if (!await potwierdz('Porzucić ten zapis?',
      'Zniknie z telefonu na dobre. Jeśli były w nim zdjęcia — nie da się ich odzyskać, '
      + 'bo aparat w aplikacji nie zapisuje ich w galerii.', { groznie: true, tak: 'Porzuć' })) return;
    await Kolejka.zapomnijOdrzucona(b.dataset.porzuc);
    await odswiezStanSieci();
    await rysujOdrzucone(pole);
  });
}

/* Słaby PIN na koncie, przy adresie dostępnym z internetu, to najprostsza
   droga do tego, żeby ktoś obcy zobaczył całą flotę. Serwer zna listę
   najczęściej zgadywanych i melduje ją polem haslo_startowe — pytamy przy
   każdym wejściu, dopóki PIN nie zostanie zmieniony.                        */
function oknoStartowegoHasla() {
  const nazwa = (NAZWA_ROLI[stan.uz.rola] || 'konto').toLowerCase();
  okno({
    tytul: jestBiuro() ? 'Zmień hasło — to da się zgadnąć' : 'Zmień PIN — ten da się zgadnąć',
    tresc: `<div class="wstega uwaga">Konto „${escHtml(stan.uz.imie || stan.uz.login)}" (${escHtml(nazwa)})
        ma ${jestBiuro() ? 'hasło' : 'PIN'} z listy najczęściej zgadywanych.</div>
      <p class="male">Jeśli program jest dostępny z internetu, dostanie się tu każdy,
         kto zgadnie adres. Konto biura widzi całą flotę — numery VIN, polisy i koszty.</p>
      <label>${jestBiuro() ? 'Obecne hasło' : 'Obecny PIN'}<input id="sh-stary" type="password"
             inputmode="${trybKlawiaturyPinu()}" autocomplete="current-password" maxlength="128"></label>
      <label>${jestBiuro() ? 'Nowe hasło' : 'Nowy PIN'} <span class="slaby">(${escHtml(opisNowegoPinu())})</span>
        <input id="sh-nowy" type="password" inputmode="${trybKlawiaturyPinu()}"
               autocomplete="new-password" maxlength="128"></label>
      <label>${jestBiuro() ? 'Powtórz nowe hasło' : 'Powtórz nowy PIN'}
        <input id="sh-powtorz" type="password" inputmode="${trybKlawiaturyPinu()}"
               autocomplete="new-password" maxlength="128"></label>`,
    przyciski: [
      { napis: 'Później', klik: z => z() },
      { napis: 'Zmień teraz', klasa: 'glowny', klik: async z => {
        const stary = document.getElementById('sh-stary').value;
        const nowy = document.getElementById('sh-nowy').value;
        if (nowy !== document.getElementById('sh-powtorz').value) {
          return komunikat('Nowe PIN-y się nie zgadzają', 'blad');
        }
        const w = await sprobuj(() => API.post('/api/zmien-pin', { stary, nowy }), 'PIN zmieniony');
        if (!w) return;
        if (w.token) { stan.token = w.token; pamietaj('token', w.token); }
        stan.uz.haslo_startowe = false;
        z();
      } },
    ],
  });
}

/* ----------------------------------------------------------------- start */

async function uruchom() {
  stan.poleLogowania = poleSekretu({ ident: document.getElementById('pole-loginu'),
                                     sekret: document.getElementById('pole-sekretu'),
                                     etykieta: document.getElementById('etykieta-sekretu'),
                                     przelacz: document.getElementById('przelacz-sekret') });
  document.getElementById('form-logowania').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const pole = document.getElementById('blad-logowania');
    pole.textContent = '';
    zajety(true);
    try {
      await zaloguj(f.get('login').trim(), f.get('pin'));
      await wejdzDoAplikacji();
    } catch (blad) {
      if (blad && blad.kodBledu === 'do_ustawienia') {
        // Hasło startowe: od razu okno „Ustaw hasło i PIN” (D43 §7.4).
        document.getElementById('pole-sekretu').value = '';
        oknoUstawieniaKonta(blad.ustawienie, wejdzDoAplikacji);
      } else {
        // Błąd logowania zostaje POD FORMULARZEM, a nie w toaście: toast gaśnie
        // po pięciu sekundach, a człowiek w tym czasie patrzy na klawiaturę.
        pole.textContent = poLudzku(blad);
        if (blad && blad.kodBledu === 'wymagane_haslo') {
          document.getElementById('pole-sekretu').value = '';
          stan.poleLogowania.odswiez();          // pole wraca do hasła
          document.getElementById('pole-sekretu').focus();
        }
      }
    } finally {
      zajety(false);
    }
  };

  document.getElementById('btn-menu').onclick = otworzMenu;
  document.getElementById('zaslona').onclick = zamknijMenu;
  document.getElementById('okno-zamknij').onclick = zamknijZPytaniem;
  document.getElementById('okno-tlo').onclick = e => {
    if (e.target.id === 'okno-tlo') zamknijZPytaniem();
  };
  document.getElementById('btn-konto').onclick = oknoKonta;
  // Podpowiedź w atrybucie title jest na telefonie niewidzialna, a to właśnie
  // kierowca ma się dowiedzieć, że coś nie przeszło. Kropka musi być klikalna.
  document.getElementById('stan-sieci-btn').onclick = oknoKonta;
  // oknoSzukania() dostarcza pojazdy.js. Gdyby tego pliku zabrakło, lupa ma
  // powiedzieć dlaczego nie działa, a nie milczeć pod palcem.
  document.getElementById('btn-szukaj').onclick = () => {
    if (typeof oknoSzukania === 'function') oknoSzukania();
    else komunikat('Wyszukiwarka floty nie została wczytana', 'blad');
  };
  document.getElementById('btn-wyloguj').onclick = () => wyloguj();
  document.querySelectorAll('.menu button[data-ekran]').forEach(b =>
    b.onclick = () => pokazEkran(b.dataset.ekran));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') zamknijZPytaniem(); });

  /* „Jak w telefonie” ma nadążyć, gdy telefon sam przełączy się o zmierzchu
     przy otwartej aplikacji. Obiema metodami, bo starsze Safari nie ma
     addEventListener na wyniku matchMedia. */
  try {
    const czujnik = window.matchMedia('(prefers-color-scheme: dark)');
    if (czujnik.addEventListener) czujnik.addEventListener('change', () => Motyw.zastosuj());
    else if (czujnik.addListener) czujnik.addListener(() => Motyw.zastosuj());
  } catch (e) { /* bez tego motyw po prostu nie zmieni się w locie */ }

  window.addEventListener('online', () => { odswiezStanSieci(); synchronizuj(); });
  window.addEventListener('offline', odswiezStanSieci);
  setInterval(() => { if (navigator.onLine) synchronizuj(); }, 25000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) synchronizuj();
  });

  if ('serviceWorker' in navigator) {
    /* Aplikacja sama bierze nową wersję. Bez tego poprawka może leżeć na dysku,
       a telefon kierowcy chodzi na starej kopii tygodniami. Worker po instalacji
       przejmuje stronę (skipWaiting + clients.claim w sw.js), przeglądarka
       zgłasza controllerchange, a my przeładowujemy DOKŁADNIE RAZ — strażnik
       'przeladowano' pilnuje, żeby nie wpaść w pętlę odświeżania. */
    let przeladowano = false;
    // Przy PIERWSZEJ instalacji też pada controllerchange, choć nic się nie
    // zmieniło w plikach — przeładowanie byłoby wtedy tylko mignięciem ekranu.
    const bylJuzWorker = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (przeladowano || !bylJuzWorker) return;
      przeladowano = true;
      czekaNaPrzeladowanie = true;
      const chwila = biezacaChwila();
      if (moznaPrzeladowacTeraz(chwila)) { przeladujGdyWolno(); return; }
      // Otwarte okno albo zaczęty przegląd: nie zabieramy nikomu pracy.
      // Przeładowanie zrobi oznaczOtwarteOkno() / pokazEkran(), gdy skończy.
      komunikat(chwila.oknoOtwarte || chwila.pytanieOtwarte
        ? 'Jest nowa wersja — odświeży się po zamknięciu okna'
        : 'Jest nowa wersja — odświeży się po wyjściu z tego ekranu');
    });
    // Dotknięte powiadomienie przy otwartej aplikacji: sw.js prosi o ekran.
    navigator.serviceWorker.addEventListener('message', e => {
      const d = e.data || {};
      if (d.typ === 'otworz' && stan.uz && ekranDozwolony(d.ekran)) pokazEkran(d.ekran);
    });
    navigator.serviceWorker.register('sw.js')
      .then(rejestracja => {
        // Sprawdzenie przy każdym wejściu i raz na godzinę dla telefonu,
        // który potrafi zostać otwarty przez cały dzień w busie.
        rejestracja.update().catch(() => {});
        setInterval(() => rejestracja.update().catch(() => {}), 3600 * 1000);
      })
      .catch(() => { /* działa też bez tego, tylko bez trybu offline */ });
  }

  Motyw.zastosuj();
  // PRZED pierwszym zapytaniem: aplikacja otwarta ze stałego adresu na GitHub
  // Pages musi najpierw dowiedzieć się, gdzie dziś stoi program z danymi.
  await adresDanychGotowy();
  await odswiezStanSieci();

  // Link „Moje auto" z GK Trasy. Kod zdejmujemy z paska adresu OD RAZU, przed
  // wymianą: jest jednorazowy, więc odświeżenie strony albo dodanie jej do
  // ekranu głównego z kodem w adresie dawałoby potem tylko „link wygasł".
  const kodWejscia = kodWejsciaZAdresu();
  let bladWejscia = '';
  if (kodWejscia) {
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch (e) { location.hash = ''; }
    zajety(true);
    try {
      await wejdzKodem(kodWejscia);
      await wejdzDoAplikacji();
      return;
    } catch (blad) {
      // Nieudany link nie wyrzuca kogoś, kto ma w telefonie działającą sesję —
      // idziemy dalej zwykłą drogą, a komunikat pokazujemy tam, gdzie wylądujemy.
      bladWejscia = poLudzku(blad);
    } finally {
      zajety(false);
    }
  }

  if (stan.token) {
    try {
      stan.uz = await API.get('/api/ja');
      await Kolejka.zapamietaj('profil', stan.uz).catch(() => {});
      await wejdzDoAplikacji();
      if (bladWejscia) komunikat(bladWejscia, 'blad');
      return;
    } catch (e) {
      // Rozróżnienie jest tu najważniejsze: gdy serwer odrzucił sesję, API.get
      // już wyczyściło token i trzeba się zalogować. Gdy padła sama sieć —
      // token dalej jest dobry, a kierowca stoi na placu i musi wejść.
      const profil = await Kolejka.przypomnij('profil').catch(() => null);
      if (stan.token && profil) {
        stan.uz = profil;
        await wejdzDoAplikacji();
        komunikat(bladWejscia || 'Brak połączenia — pracujesz na danych z telefonu',
          bladWejscia ? 'blad' : '');
        return;
      }
    }
  }
  pokazLogowanie();
  // Po pokazLogowanie(), bo ono czyści pole błędu.
  if (bladWejscia) document.getElementById('blad-logowania').textContent = bladWejscia;
}

async function wejdzDoAplikacji() {
  document.getElementById('ekran-logowania').classList.add('ukryty');
  document.getElementById('aplikacja').classList.remove('ukryty');
  document.getElementById('menu-imie').textContent = stan.uz.imie;
  document.getElementById('menu-rola').textContent = NAZWA_ROLI[stan.uz.rola] || stan.uz.rola;
  menuDlaRoli();
  // Zanim cokolwiek narysujemy: czy przeglądarka na pewno ma komplet plików
  // z jednej wersji. Gdy nie — funkcja sama przeładuje aplikację.
  await sprawdzSpojnoscWersji();
  poprosOTrwalaPamiec();
  await wczytajSlowniki();
  synchronizuj();
  // Aplikacja otwarta dotknięciem powiadomienia startuje na jego ekranie.
  const zPowiadomienia = ekranZAdresu();
  pokazEkran(ekranDozwolony(zPowiadomienia) ? zPowiadomienia : (jestBiuro() ? 'pulpit' : 'moj'));
  Powiadomienia.odnow();
  // Konto z GK Trasy zmienia PIN w GK Trasy — okno zmiany skończyłoby się tu
  // odmową, więc mówimy od razu, gdzie to zrobić.
  if (stan.uz.haslo_startowe && stan.uz.zrodlo === 'trasex') {
    komunikat('Twój PIN jest łatwy do zgadnięcia — zmień go w programie GK Trasy', 'blad');
  } else if (stan.uz.haslo_startowe) {
    oknoStartowegoHasla();
  }
}

/* Trwała pamięć: bez niej iOS i Android mogą po cichu wyczyścić IndexedDB
   aplikacji, której dawno nie otwierano albo gdy brakuje miejsca — a tam
   leży kolejka niewysłanych przeglądów ze zdjęciami. Prosimy raz na
   uruchomienie, po zalogowaniu (Chrome chętniej się zgadza, gdy strona
   jest „używana”). Odmowa niczego nie psuje, więc żadnego komunikatu. */
let prosilismyOPamiec = false;
function poprosOTrwalaPamiec() {
  if (prosilismyOPamiec) return;
  prosilismyOPamiec = true;
  try {
    const pamiec = navigator.storage;
    if (!pamiec || typeof pamiec.persist !== 'function') return;
    const juz = typeof pamiec.persisted === 'function' ? pamiec.persisted() : Promise.resolve(false);
    juz.then(trwala => trwala || pamiec.persist()).catch(() => { /* trudno */ });
  } catch (e) { /* stara przeglądarka — działa jak dotąd */ }
}

document.addEventListener('DOMContentLoaded', uruchom);

/* =========================================================================
   JAK DODAĆ EKRAN — cztery kroki, nic więcej

   1. W swoim pliku ekranów dopisz wpis do rejestru. Pełny zestaw kluczy,
      innych nie ma:

        EKRANY.terminy = {
          tytul: 'Terminy',              // WYMAGANY — trafia do nagłówka
          tylkoBiuro: true,              // opcjonalny próg roli
          tylkoAdministrator: false,     // opcjonalny, wyższy próg roli
          poSynchronizacji() {           // opcjonalne odświeżanie po wysyłce
            if (stan.ekran === 'terminy') odswiezEkran();
          },
          async rysuj(pole, param) { … } // WYMAGANY, zawsze async
        };

      rysuj() ma zawsze trzy kroki i tylko trzy:
        (1) await na dane — sprobuj(() => API.get('/api/terminy')) || [];
        (2) JEDNO przypisanie do pole.innerHTML z jednego szablonu
            (warunki `${warunek ? '…' : ''}`, listy `.map(…).join('')`);
        (3) przypięcie zdarzeń: pole.querySelector('#t-nowy').onclick = …
            albo pole.querySelectorAll('[data-termin]').forEach(…).
      KAŻDY tekst z bazy idzie przez escHtml() — rejestracja, uwagi i imiona
      przychodzą od ludzi. Uchwyty przez .onclick =, nie addEventListener.
      Prefiksy id krótkie i lokalne dla ekranu: p- pojazdy, pr- przeglądy,
      t- terminy, u- ustawienia, us- usterki, k- konta.

   2. Dopisz pozycję w menu bocznym w index.html:
        <button data-ekran="terminy" class="tylko-biuro">📅 <span>Terminy</span></button>
      Klasa tylko-biuro / tylko-kierowca / tylko-administrator albo żadna.
      Menu nie potrzebuje kodu — uchwyty podpina uruchom().

   3. Jeśli ekran ma stać w pasku dolnym telefonu, dopisz go do PASEK_BIURA
      albo PASEK_KIEROWCY w tym pliku. Dokładnie cztery pozycje na rolę —
      piąta nie mieści się kciukowi.

   4. Jeśli to NOWY plik .js, dopisz go w DWÓCH listach: <script> w
      index.html i ZASOBY w sw.js. Pominięcie w sw.js daje program, który
      działa przy zasięgu, a bez zasięgu nie wstaje wcale.

   Do dyspozycji masz stąd: stan, escHtml, poLudzku, komunikat, zajety,
   odmiana, kilometry, dzisiaj, godzinaTeraz, czasTeraz, polskaData,
   samaGodzina, API, sprobuj, doKolejki, synchronizuj, okno, zamknijOkno,
   potwierdz, pokazEkran, odswiezEkran, jestBiuro, jestAdministratorem,
   Motyw, trybOffline, ujeciaObowiazkowe, punktyPrzegladu, przyciskPowrotu,
   podepnijPowrot.
   Własnego fetch, własnego escapowania i własnego modala NIE piszemy.
   ========================================================================= */
