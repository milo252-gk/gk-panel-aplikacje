/* Rdzen aplikacji: logowanie, przelaczanie ekranow, rozmowa z serwerem
   i wysylanie kolejki offline.                                              */

const WERSJA_SKRYPTU = 'trasex-566cc7606df6';   // stempluje zbuduj.py

/* Pamięć przeglądarki (localStorage) — wyłącznie przez Pamiec i ZAWSZE
   z przedrostkiem „gk-trasy.”.

   Od D33 aplikacja stoi też na GitHub Pages (od D42: https://milo252-gk.github.io/
   gk-panel-aplikacje/trasy/ — jedna strona wszystkich aplikacji GK). Wszystkie aplikacje GK na Pages — GK Flota, Panel,
   Lider, UR, KJ — mają TO SAMO źródło https://milo252-gk.github.io, a
   localStorage jest wspólny dla całego źródła. Klucz 'token' bez przedrostka
   znaczyłby, że zalogowanie w GK Trasy wylogowuje z GK Flota i odwrotnie —
   albo gorzej: że GK Trasy wysyła swojemu serwerowi token GK Floty.

   Do tego sam DOSTĘP do localStorage w Safari w trybie prywatnym rzuca
   wyjątkiem — stąd try/catch w każdej funkcji.                              */
const Pamiec = (() => {
  const PRZEDROSTEK = 'gk-trasy.';
  // Klucze z czasów bez przedrostka. Przenosimy je raz, żeby aktualizacja
  // nikogo nie wylogowała i nie zgubiła motywu ani udostępniania położenia.
  const STARE = ['token', 'motyw', 'push', 'sledzenie'];
  function wspolneZrodlo(host) { return /(^|\.)github\.io$/i.test(String(host || '')); }
  function czytaj(k) {
    try { const w = localStorage.getItem(PRZEDROSTEK + k); return w === null ? '' : w; }
    catch (e) { return ''; }
  }
  function zapisz(k, v) {
    try { localStorage.setItem(PRZEDROSTEK + k, String(v)); return true; }
    catch (e) { return false; }
  }
  function usun(k) {
    try { localStorage.removeItem(PRZEDROSTEK + k); } catch (e) { /* nie ma czego kasować */ }
  }
  /* Przenosimy TYLKO pod adresem, który należał wyłącznie do GK Trasy
     (program w biurze, firmowe wifi, tunel). Na wspólnym źródle Pages klucz
     'token' bez przedrostka jest CUDZY — zostawiła go GK Flota sprzed zmiany —
     i przejęcie go wylogowałoby kierowcę z GK Flota. */
  function przenies(host) {
    if (wspolneZrodlo(host)) return 0;
    let ile = 0;
    STARE.forEach(k => {
      try {
        const stara = localStorage.getItem(k);
        if (stara === null) return;
        if (localStorage.getItem(PRZEDROSTEK + k) === null) localStorage.setItem(PRZEDROSTEK + k, stara);
        localStorage.removeItem(k);
        ile++;
      } catch (e) { /* tryb prywatny — nie ma czego przenosić */ }
    });
    return ile;
  }
  /* Klucze WSPÓLNE wszystkich programów GK (bez przedrostka gk-trasy.) —
     dziś tylko motyw: jeden wybór dla GK Trasy, GK Flota i Panelu. Lista
     zamknięta, żeby nikt tędy nie sięgnął po cudzy klucz (np. 'token'). */
  const WSPOLNE = ['gk.motyw'];
  function czytajWspolny(k) {
    if (WSPOLNE.indexOf(k) < 0) return null;
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function zapiszWspolny(k, v) {
    if (WSPOLNE.indexOf(k) < 0) return false;
    try { localStorage.setItem(k, String(v)); return true; } catch (e) { return false; }
  }
  function usunWspolny(k) {
    if (WSPOLNE.indexOf(k) < 0) return;
    try { localStorage.removeItem(k); } catch (e) { /* nie ma czego kasować */ }
  }
  return { PRZEDROSTEK, czytaj, zapisz, usun, przenies, wspolneZrodlo,
           czytajWspolny, zapiszWspolny, usunWspolny };
})();
Pamiec.przenies(location.hostname);

const stan = {
  token: Pamiec.czytaj('token'),
  uz: null,
  ekran: '',
  ustawienia: {},
  klienci: [],
  pojazdy: [],
  online: navigator.onLine,
  bezSerwera: false,       // sieć jest, a program w biurze nie odpowiada (pasek połączenia)
  wKolejce: 0,
  synchronizuje: false,
  // D43: konta z Panelu mają hasło + PIN (z /api/zyje; zapamiętane na start bez sieci).
  trybD43: Pamiec.czytaj('d43') === '1',
};

const EKRANY = {};          // wypelniaja go biuro.js i kierowca.js
const MAKS_PROB = 5;        // po tylu nieudanych probach zapis ladzie wsrod odrzuconych

/* ------------------------------------------------------------- drobiazgi */

function escHtml(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Komunikaty przeglądarki są po angielsku, a widzi je kierowca na dworze,
   przy kliencie. „Failed to fetch" nie mówi mu nic; „Brak zasięgu — zapisałem
   w telefonie" mówi wszystko. Tłumaczymy w JEDNYM miejscu, bo wyciekały
   z pięciu różnych. */
function poLudzku(e) {
  if (!e) return 'Coś poszło nie tak. Spróbuj jeszcze raz.';
  const nazwa = String(e.name || '');
  const tekst = String(e.message || '');
  if (nazwa === 'QuotaExceededError' || /quota|full disk|exceeded its quota/i.test(tekst)) {
    return 'Brak miejsca w pamięci telefonu. Usuń stare zdjęcia albo nieużywane aplikacje '
      + '— zapisy czekające na wysłanie zostają nietknięte.';
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
   bywa wspólny; a kierowca w słońcu i biuro po zmroku chcą czego innego na tym
   samym koncie. Z tego samego powodu wyloguj() NIE kasuje tego klucza.

   Reguła „który motyw” istnieje w programie DWA razy: tutaj i w skrypcie
   w <head> index.html, bo tamten musi wykonać się jeszcze przed arkuszem.
   Wolno je zmieniać wyłącznie razem — smoke.js wykonuje tamten kod na
   atrapach i porównuje wynik z Motyw.policz.

   Klucz jest WSPÓLNY dla programów GK: „gk.motyw” (GK Panel Kierownika
   i GK Flota czytają ten sam). Na github.io wszystkie stoją pod jednym
   źródłem, a osoba z trzema programami ustawiała motyw trzy razy.
   Własny „gk-trasy.motyw” to już tylko migracja: przejmij() przenosi go raz
   do wspólnego i KASUJE. Gdyby zostawał, wybór „jak w telefonie” w innym
   programie (on kasuje gk.motyw) wskrzeszałby tutaj stary wybór.          */
const MOTYW_WSPOLNY = 'gk.motyw';
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
    let w = Pamiec.czytajWspolny(MOTYW_WSPOLNY);
    // Obca wartość (np. 'auto') = brak klucza. Własny klucz istnieje już tylko
    // przed przejęciem (albo gdy przejęcie się nie udało — tryb prywatny).
    if (w !== 'jasny' && w !== 'ciemny') w = Pamiec.czytaj('motyw');
    return (w === 'jasny' || w === 'ciemny') ? w : 'auto';
  },
  /* Raz, przy starcie: własny klucz → wspólny. Wspólny już ustawiony (inny
     program GK) wygrywa — własny wtedy tylko znika. Gdy zapis się nie uda
     (tryb prywatny), własny zostaje, żeby nie zgubić wyboru. */
  przejmij() {
    const wlasny = Pamiec.czytaj('motyw');
    if (!wlasny) return;
    const wspolny = Pamiec.czytajWspolny(MOTYW_WSPOLNY);
    const wspolnyUstawiony = wspolny === 'jasny' || wspolny === 'ciemny';
    if (!wspolnyUstawiony && (wlasny === 'jasny' || wlasny === 'ciemny')
        && !Pamiec.zapiszWspolny(MOTYW_WSPOLNY, wlasny)) return;   // tryb prywatny — zostaje stary
    Pamiec.usun('motyw');
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
  ustaw(wybor) {
    if (wybor === 'jasny' || wybor === 'ciemny') {
      if (Pamiec.zapiszWspolny(MOTYW_WSPOLNY, wybor)) {
        Pamiec.usun('motyw');
      } else {
        komunikat('Nie mogę zapamiętać wyboru w tej przeglądarce — wróci po odświeżeniu', 'blad');
      }
    } else {
      // „Jak w telefonie” = brak klucza, tak samo jak w pozostałych programach GK.
      Pamiec.usunWspolny(MOTYW_WSPOLNY);
      Pamiec.usun('motyw');
    }
    return this.zastosuj();
  },
};
Motyw.przejmij();

/* Dymek — jeden wzór wszystkich aplikacji GK (2026-10-16, jak hala.css → .komunikat):
   '' informacja (grafit) · 'ok' zielony · 'uwaga' żółty · 'blad' czerwony. 4 s, błąd 7 s:
   błąd czyta się w busie albo na rampie, nie przy biurku (do 2026-10-16 2,8 s i 5,2 s —
   inaczej niż w pozostałych aplikacjach GK). Te same czasy w GK Flota. */
const CZAS_KOMUNIKATU_MS = 4000;
const CZAS_BLEDU_MS = 7000;
function komunikat(tresc, rodzaj) {
  const pole = document.getElementById('komunikaty');
  if (!pole) return;
  const e = document.createElement('div');
  e.className = 'komunikat ' + (rodzaj || '');
  e.textContent = tresc;                  // textContent — w dymek nie da się wstrzyknąć HTML
  pole.appendChild(e);
  setTimeout(() => { e.style.opacity = '0'; setTimeout(() => e.remove(), 250); },
    rodzaj === 'blad' ? CZAS_BLEDU_MS : CZAS_KOMUNIKATU_MS);
}

/* ---------------------------------------------- dźwięki (GKDzwieki, 2026-10-16)
   Jeden zestaw dźwięków wszystkich aplikacji GK — web/gk-dzwieki.js to kopia 1:1
   pliku huba (Produkcja/GK Panel Kierownika/wspolne/klient/gk-dzwieki.js), pilnuje
   .github/spojnosc.py; nie poprawiać tutaj. Miękkie dzwonki zamiast „8-bitowych”
   piknięć (właściciel 2026-10-16). Przełącznik w Moim koncie → Powiadomienia
   dotyczy TEGO urządzenia (Pamiec 'dzwiek': '0' = wyłączony, brak klucza = włączony,
   jak domyślnie w hali). Brak pliku (stara kopia w pamięci) = cisza, nie błąd. */
const Dzwiek = {
  wlaczony() { return Pamiec.czytaj('dzwiek') !== '0'; },
  ustaw(wlacz) { if (wlacz) Pamiec.usun('dzwiek'); else Pamiec.zapisz('dzwiek', '0'); },
  zagraj(rodzaj) {
    try { return !!(window.GKDzwieki && window.GKDzwieki.zagraj(rodzaj)); } catch (e) { return false; }
  },
};
if (window.GKDzwieki) window.GKDzwieki.wlaczony(() => Dzwiek.wlaczony());

/* Nowa wersja programu przyszla, ale ktos akurat cos wpisuje. Przeladowanie
   w tej chwili skasowaloby otwarte okno razem z podpisem odbiorcy i zdjeciami
   zrobionymi aparatem w aplikacji — tych nie ma w galerii telefonu. Dlatego
   przy otwartym oknie (albo polu z kursorem) tylko zapamietujemy, ze trzeba,
   i odswiezamy dopiero po zamknieciu okna.                                  */
let przeladowanieCzeka = false;

function moznaPrzeladowac() {
  if (document.body.classList.contains('okno-otwarte')) return false;
  const aktywny = document.activeElement;
  return !(aktywny && /^(INPUT|TEXTAREA|SELECT)$/.test(aktywny.tagName || ''));
}

function przeladujPoNowejWersji() {
  if (!moznaPrzeladowac()) {
    if (!przeladowanieCzeka) {
      komunikat('Jest nowa wersja — odświeży się, gdy skończysz (zamkniesz okno albo wyślesz formularz)');
    }
    przeladowanieCzeka = true;
    return;
  }
  przeladowanieCzeka = false;
  komunikat('Nowa wersja — odświeżam', 'ok');
  setTimeout(() => location.reload(), 400);
}

function sprobujZaleglegoPrzeladowania() {
  if (przeladowanieCzeka && moznaPrzeladowac()) przeladujPoNowejWersji();
}

/* Telefon moze wyrzucic zapisy czekajace na zasieg (podpisy, zdjecia), gdy
   brakuje mu miejsca — chyba ze strona dostanie pamiec „trwala". Prosimy
   o nia raz, po zalogowaniu. Odmowa niczego nie psuje. */
function poprosOTrwalaPamiec() {
  try {
    const pamiec = navigator.storage;
    if (!pamiec || !pamiec.persist) return;
    Promise.resolve(pamiec.persisted ? pamiec.persisted() : false)
      .then(juz => juz || pamiec.persist())
      .catch(() => { /* przegladarka nie chce — trudno */ });
  } catch (e) { /* starsza przegladarka */ }
}

let licznikZajetosci = 0;
function zajety(wlacz) {
  licznikZajetosci = Math.max(0, licznikZajetosci + (wlacz ? 1 : -1));
  document.getElementById('zajetosc').classList.toggle('ukryty', licznikZajetosci === 0);
}

/* „1 zapis", „2 zapisy", „5 zapisów" — inaczej komunikaty wygladaja niechlujnie. */
function odmiana(ile, jeden, dwa, piec) {
  const n = Math.abs(ile);
  if (n === 1) return jeden;
  const ostatnia = n % 10, dwieOstatnie = n % 100;
  if (ostatnia >= 2 && ostatnia <= 4 && (dwieOstatnie < 12 || dwieOstatnie > 14)) return dwa;
  return piec;
}

/* Data RRRR-MM-DD wedlug zegara TEGO telefonu, nie UTC. toISOString() liczy
   w UTC, wiec w Polsce miedzy polnoca a 01:00/02:00 dawal wczorajsza date:
   kierowca widzial wczorajsze zlecenie, a „Ten miesiac" zaczynal sie
   ostatniego dnia poprzedniego. Wszystkie daty z kalendarza ida przez to. */
function dataLokalna(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function dzisiaj() { return dataLokalna(new Date()); }
/* Znacznik czasu zapisany przez toISOString() (UTC) — na ekran po czasie lokalnym. */
/* Data i godzina na ekranie: „06.10.2026 14:20” (wzór GK, STYL-GK punkt 6). */
function czasZIso(iso) {
  const d = new Date(iso || '');
  return isNaN(d.getTime()) ? '' : polskaData(dataLokalna(d)) + ' ' + d.toTimeString().slice(0, 5);
}
function godzinaTeraz() { return new Date().toTimeString().slice(0, 5); }
function czasTeraz() {
  const d = new Date();
  return dataLokalna(d) + ' ' + d.toTimeString().slice(0, 8);
}
function polskaData(iso) {
  if (!iso) return '';
  const [r, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${r}`;
}
function samaGodzina(czas) { return czas ? String(czas).slice(11, 16) : ''; }
/* Chwila z programu („2026-10-06 14:20:33”, czas biura) albo z telefonu (ISO z „Z”)
   → „06.10.2026 14:20” (STYL-GK §6). B4 2026-10-16: biuro widziało surowe
   „2026-10-06 14:20” na osi punktu, w Kontach, Kopiach i Pages — GK Flota od dawna
   pisze po ludzku (czasLokalny). Bez rozpoznanego wzoru — tekst bez zmian. */
function czasNaEkran(t) {
  const s = String(t || '');
  if (/T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) return czasZIso(s) || s;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(s);
  return m ? `${polskaData(m[1])} ${m[2]}` : s;
}

/* ---------------------------------------------------------------- okienko */

/* Okno ze zdjęciem albo podpisem nie znika od dotknięcia obok bez pytania.
   Zdjęcia robione aparatem w aplikacji nie trafiają do galerii telefonu, więc
   ich utrata oznacza powrót pod rampę, a podpisu klienta nikt nie powtórzy.
   Sam tekst (wyszukiwarka, notatka, wybrany chip) pytania nie wywołuje — pytanie
   przy każdym oknie uczyło odpowiadać „tak” bez czytania (właściciel, 2026-10-12). */
function oknoMaTresc() {
  const pole = document.getElementById('okno-tresc');
  if (!pole || document.getElementById('okno-tlo').classList.contains('ukryty')) return false;
  return !!pole.querySelector('.miniatura, .pole-podpisu.zapelnione');
}

/* Druga linijka pytania. „Telefon” tylko na telefonie (STYL-GK §6) — ten sam
   próg co menu i „Jak w systemie” (komputer od 821 px).                     */
function opisPorzuceniaOkna() {
  const naKomputerze = typeof window.matchMedia === 'function'
    && window.matchMedia('(min-width:821px)').matches;
  return naKomputerze ? 'Zdjęcia i podpis z tego okna przepadną.'
    : 'Zdjęcia i podpis z tego okna przepadną — nie ma ich w galerii telefonu.';
}

async function zamknijZPytaniem() {
  if (oknoMaTresc() && !await potwierdz('Porzucić to, co wpisane?', opisPorzuceniaOkna())) return;
  zamknijOkno();
}

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
    b.onclick = () => p.klik(zamknijOkno);
    stopka.appendChild(b);
  });
  document.getElementById('okno').style.maxWidth = szerokie ? '860px' : '';
  tlo.classList.remove('ukryty');
  odswiezZnacznikOkna();
  poleTresci.scrollTop = 0;
  if (poOtwarciu) poOtwarciu(poleTresci);
  return zamknijOkno;
}
function zamknijOkno() {
  document.getElementById('okno-tlo').classList.add('ukryty');
  odswiezZnacznikOkna();
}

/* Co robimy, gdy otwiera się albo zamyka okno modalne.

   To jest CZWARTE podejście do jednego błędu: mapa Leaflet malowała się nad
   oknem. Trzy poprzednie poprawki siedziały w arkuszu (z-index, isolation,
   klasa na body) i u nas działały, a u właściciela nie. Ta nie polega na
   arkuszu wcale: style wpisujemy elementom WPROST, z !important, prosto stąd.
   Styl inline z !important stoi w kaskadzie wyżej niż jakikolwiek arkusz —
   nasz, stary z pamięci podręcznej, czy wstrzyknięty przez rozszerzenie.

   Przy otwartym oknie: każdy kontener mapy (po klasie Leafletu, nie tylko
   naszej) dostaje visibility:hidden, a warstwy okien — najwyższy możliwy
   z-index. Przy zamknięciu wszystko wraca i mapy dostają invalidateSize,
   bo Leaflet nie przelicza rozmiaru, gdy był niewidoczny.                   */
const NAJWYZSZY_ZINDEX = '2147483647';

/* Mapy wyjete z dokumentu na czas okna: [element, znacznik miejsca]. Znacznik
   to pusty komentarz wstawiony tam, gdzie stala mapa — po zamknieciu okna
   mapa wraca dokladnie w to miejsce. Jesli ekran zdazyl sie w miedzyczasie
   przerysowac i znacznika juz nie ma, mapy nie wstawiamy nigdzie: nowy ekran
   zrobil sobie nowa. */
let schowaneMapy = [];

function schowajMapyFizycznie() {
  document.querySelectorAll('.leaflet-container').forEach(m => {
    if (!m.parentNode) return;
    const znacznik = document.createComment('mapa schowana na czas okna');
    m.parentNode.replaceChild(znacznik, m);
    schowaneMapy.push([m, znacznik]);
  });
}

function przywrocMapy() {
  const doPrzywrocenia = schowaneMapy;
  schowaneMapy = [];
  doPrzywrocenia.forEach(([m, znacznik]) => {
    if (znacznik.parentNode && document.contains(znacznik)) {
      znacznik.parentNode.replaceChild(m, znacznik);
    }
  });
}

function odswiezZnacznikOkna() {
  const warstwy = ['okno-tlo', 'pytanie-tlo'].map(id => document.getElementById(id));
  const otwarte = warstwy.some(w => w && !w.classList.contains('ukryty'));
  document.body.classList.toggle('okno-otwarte', otwarte);

  // KOLEJNOSC MA ZNACZENIE: przy zamykaniu mapy najpierw wracaja do dokumentu,
  // a dopiero potem zdejmujemy im style — querySelectorAll nie widzi elementow
  // wyjetych z drzewa i bez tego mapa wracalaby na ekran nadal niewidoczna.
  if (!otwarte) przywrocMapy();

  document.querySelectorAll('.leaflet-container, .mapa').forEach(m => {
    if (otwarte) {
      m.style.setProperty('visibility', 'hidden', 'important');
      m.style.setProperty('z-index', '0', 'important');
    } else {
      m.style.removeProperty('visibility');
      m.style.removeProperty('z-index');
    }
  });
  // Ostatnia, fizyczna linia obrony: na czas okna mapa jest WYJETA z dokumentu.
  // Element, ktorego nie ma w drzewie, nie maluje sie nigdzie — niezaleznie od
  // z-index, arkuszy, rozszerzen przegladarki i bledow kompozytora.
  if (otwarte) schowajMapyFizycznie();
  warstwy.forEach((w, i) => {
    if (!w) return;
    // Sam z-index. Inline 'position:fixed' bylo tu zbedne (arkusz i tak je daje),
    // a pasuje do wzorca, ktorym blokery nakladek wycinaja elementy:
    // div[style*="position: fixed"]{display:none!important}. Szkoda ryzykowac.
    w.style.setProperty('z-index', String(Number(NAJWYZSZY_ZINDEX) - 10 + i), 'important');
  });
  // Toasty i kółko „pracuję" mają stać NAD oknem — dostają jeszcze wyżej.
  const kom = document.getElementById('komunikaty');
  const zaj = document.getElementById('zajetosc');
  if (kom) kom.style.setProperty('z-index', NAJWYZSZY_ZINDEX, 'important');
  if (zaj) zaj.style.setProperty('z-index', NAJWYZSZY_ZINDEX, 'important');

  if (!otwarte && window.Mapa && Mapa.odswiezWszystkie) Mapa.odswiezWszystkie();
  // Nowa wersja czekala na zamkniecie okna — teraz juz mozna.
  if (!otwarte) setTimeout(sprobujZaleglegoPrzeladowania, 0);
}

/* Pytanie "na pewno?" rysuje sie w OSOBNEJ warstwie, nad zwyklym oknem.
   Kiedy korzystalo z tego samego okna co formularze, zadanie pytania
   nadpisywalo formularz, a odpowiedz — obojetnie ktora — zamykala wszystko.
   Kierowca kasujacy jedno rozmazane zdjecie tracil komplet dowodow dostawy. */
/* opcje: { tak, nie, groznie, html }. Nazwy przyciskow bywaja wazniejsze od
   pytania — „Zglos niezgodnosc" i „Popraw numer" mowia kierowcy pod rampa
   znacznie wiecej niz „Tak" i „Nie". groznie maluje potwierdzenie na czerwono. */
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
      odswiezZnacznikOkna();
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
    odswiezZnacznikOkna();
    (stopka.lastChild || {}).focus?.();
  });
}

/* ------------------------------------------------------------ adres danych */

/* Gdzie szukać danych (D33, wzór: GK Flota).

   Aplikacja stoi w dwóch miejscach naraz i to jest celowe:
   — otwarta z programu (biuro, firmowe wifi, tunel) → dane są pod tym samym
     adresem, API_BAZA jest pusta i wszystko idzie ścieżkami względnymi;
   — otwarta ze stałego adresu na GitHub Pages → tam leży sam wygląd,
     a dane obsługuje komputer w biurze pod adresem tunelu. Ten adres zmienia
     się po każdym uruchomieniu programu, więc NIE jest wpisany w kod —
     aplikacja czyta go z pliku adres.json leżącego obok niej, a program
     w biurze sam go tam aktualizuje.

   Po co: przeglądarka wiąże kolejkę niewysłanych zdjęć, zapisane logowanie
   i pamięć offline z ADRESEM strony. Wchodząc wprost pod zmienny adres tunelu,
   kierowca po każdym restarcie programu zostawiałby podpisy z rampy pod
   starym adresem, bez drogi powrotu. Stały front to rozwiązuje.             */
let API_BAZA = '';
let _adresWDrodze = null;
let _stronaZProgramu = false;      // adres.json = 404: stronę wydał sam program
let _ostatnioSprawdzonoAdres = 0;
const ODSTEP_SPRAWDZANIA_ADRESU = 30000;

/* Ustalenie adresu danych jest WARUNKIEM każdego zapytania, nie krokiem
   startowym obok nich: formularz logowania działa od pierwszej chwili, a odczyt
   adres.json trwa. Kto pierwszy potrzebuje adresu, ten go ustala, reszta czeka
   na ten sam wynik. */
function adresDanychGotowy() {
  if (!_adresWDrodze) _adresWDrodze = ustalBazeApi();
  return _adresWDrodze;
}

/* adres.json: opis z polem api | 'brak' (404 — nie jesteśmy na Pages)
   | null (nie wiadomo, np. brak zasięgu). no-store i znacznik czasu, bo to
   jedyny plik, który MUSI być świeży — także w pamięci serwerów GitHuba. */
async function czytajPlikAdresu() {
  try {
    const odp = await fetch('adres.json?t=' + Date.now(), { cache: 'no-store' });
    if (odp.status === 404) return 'brak';
    if (!odp.ok) return null;
    const opis = await odp.json();
    return (opis && opis.api) ? opis : null;
  } catch (e) { return null; }
}

function ustawBazeApi(opis, zrodlo) {
  API_BAZA = String(opis.api).replace(/\/+$/, '');
  stan.adresDanych = Object.assign({}, opis, { zrodlo });
  if (zrodlo === 'plik') Kolejka.zapamietaj('adres-api', opis).catch(() => {});
}

async function ustalBazeApi() {
  _ostatnioSprawdzonoAdres = Date.now();
  const opis = await czytajPlikAdresu();
  if (opis === 'brak') { _stronaZProgramu = true; return; }
  if (opis) { ustawBazeApi(opis, 'plik'); return; }
  // Pliku nie dało się przeczytać — zwykle brak zasięgu na Pages. Zapamiętany
  // adres istnieje wyłącznie w pamięci TEGO adresu strony i zapisała go tylko
  // wcześniejsza udana próba, więc nie ma czego pomylić. Bierzemy ostatni
  // znany, żeby aplikacja wstała i przyjęła zapisy do kolejki.
  let zapisany = null;
  try { zapisany = await Kolejka.przypomnij('adres-api'); } catch (e) { /* trudno */ }
  if (zapisany && zapisany.api) ustawBazeApi(zapisany, 'pamiec');
}

/* Program w biurze dostał nowy adres tunelu (restart, zerwany tunel).
   Telefon dowiaduje się o tym przy błędzie sieci: czyta adres.json jeszcze
   raz (najwyżej co 30 s, żeby telefon bez zasięgu nie młócił GitHuba)
   i przełącza się BEZ przeładowania — kolejka zapisów zostaje, bo leży pod
   tym samym adresem strony. Zwraca true, gdy adres się zmienił. */
async function odswiezAdresDanych(wymus) {
  if (_stronaZProgramu) return false;
  if (!wymus && Date.now() - _ostatnioSprawdzonoAdres < ODSTEP_SPRAWDZANIA_ADRESU) return false;
  _ostatnioSprawdzonoAdres = Date.now();
  const opis = await czytajPlikAdresu();
  if (opis === 'brak') { _stronaZProgramu = true; return false; }
  if (!opis) return false;
  const nowy = String(opis.api).replace(/\/+$/, '');
  if (nowy === API_BAZA) return false;
  ustawBazeApi(opis, 'plik');
  return true;
}

/* Pełny adres danych — dla miejsc, w których przeglądarka idzie sama
   (src obrazka, link do pobrania CSV), a nie przez fetch. */
function adresDanych(sciezka) { return API_BAZA + sciezka; }

/* Adres samej aplikacji: na Pages https://…github.io/gk-panel-aplikacje/trasy/,
   z programu http://…:8770/. Na niego wraca kierowca z GK Flota („Moje auto”). */
function adresAplikacji() { return new URL('./', location.href).href; }

/* Martwy tunel daje albo błąd sieci (nie ma już takiego adresu, TLS, DNS),
   albo stronę błędu Cloudflare 530/1033 — 502, gdy tunel stoi, a program nie. */
const KODY_MARTWEGO_TUNELU = [502, 530];

/* fetch do programu w biurze. Przy błędzie sieci sprawdza, czy program nie
   dostał nowego adresu — i jeśli tak, ponawia zapytanie JEDEN raz pod nowym.
   Ponowienie jest bezpieczne: zapisy z kolejki mają swój numer (uuid). */
async function pobierz(sciezka, opcje) {
  await adresDanychGotowy();
  let odp;
  try {
    try {
      odp = await fetch(API_BAZA + sciezka, opcje);
    } catch (e) {
      if (!await odswiezAdresDanych()) throw e;
      odp = await fetch(API_BAZA + sciezka, opcje);
    }
    if (KODY_MARTWEGO_TUNELU.indexOf(odp.status) >= 0 && await odswiezAdresDanych()) {
      odp = await fetch(API_BAZA + sciezka, opcje);
    }
  } catch (e) {
    oznaczSerwer(false);
    throw e;
  }
  // 502/503/504/530 — te same kody co KODY_BEZ_PROGRAMU (program albo tunel nie stoi).
  oznaczSerwer([502, 503, 504, 530].indexOf(odp.status) < 0);
  return odp;
}

/* B2 (2026-10-16, jak hala.js → Hala.pasekPolaczenia): telefon ma sieć, a program
   w biurze (albo tunel) nie odpowiada — pasek mówi „Brak połączenia z serwerem”,
   a nie milczy jak przy „wszystko wysłane”. Dawniej pasek patrzył tylko na
   navigator.onLine. Stan bierze się z KAŻDEGO zapytania do programu. */
function oznaczSerwer(odpowiada) {
  // Bardzo wczesny start (i wycinki app.js w testach) nie ma jeszcze stanu ani paska.
  if (typeof stan === 'undefined' || typeof odswiezPasekPolaczenia !== 'function') return;
  const brak = !odpowiada && navigator.onLine;
  if (stan.bezSerwera === brak) return;
  stan.bezSerwera = brak;
  odswiezPasekPolaczenia();
}

/* ------------------------------------------------------------- serwer API */

/* ----------------------------------------------- praca bez programu w biurze

   Program w biurze bywa nieosiągalny: restart komputera-serwera, zanik prądu,
   zerwany internet. Dawniej każdy ekran biura był wtedy pusty („Nie udało się
   wczytać”). Teraz każda udana odpowiedź GET zostaje w tym urządzeniu
   (IndexedDB, magazyn 'pamiec'), a gdy programu nie ma, ekran dostaje ją
   z pamięci, a wstęga mówi, z której chwili są dane. Gdy program wraca, wstęga
   proponuje odświeżenie — nie przerysowujemy ekranu sami, bo ktoś może właśnie
   pisać w formularzu.

   Zapisy biura dalej wymagają programu: to on ustala stan tras i aut, a dwie
   osoby zmieniające to samo bez połączenia nie miałyby kto rozsądzić. Zapisy
   kierowców idą jak dotąd przez kolejkę (synchronizuj).

   Klucz ma id osoby: na wspólnym komputerze nikt nie zobaczy cudzych danych,
   wylogowanie zabiera wszystko tej osoby, a zalogowanie innej — wszystko
   poprzedniej. Nie zapamiętujemy tego, co otwiera drzwi albo żyje chwilę
   (zaproszenia, linki z kluczem, stan tunelu, kopii i alarmów, wyszukiwanie),
   ani odpowiedzi ponad 2 MB. Sekretów serwer i tak nie oddaje (same flagi
   „ustawiony”).                                                              */
const PAMIEC_ODPOWIEDZI = 'odp:';
const MAKS_ODPOWIEDZI = 2 * 1024 * 1024;        // znaków JSON-a
const MAKS_ODPOWIEDZI_OSOBY = 300;
const BEZ_PAMIECI = /^\/api\/(zyje|zdarzenia|push\/|zaproszenie|pages\/|kopia|kopie|alarmy|blokady|gk\/|eksport|szukaj|raporty\/podpowiedz|ikol\/)|\/mapa-link$/;
const KODY_BEZ_PROGRAMU = [502, 503, 504, 530];
const ODSTEP_PROBY_PROGRAMU_MS = 30 * 1000;

const bezProgramu = { od: '', daneZ: '', proba: 0, zapisow: 0 };

function kluczOdpowiedzi(sciezka) {
  return PAMIEC_ODPOWIEDZI + stan.uz.id + ':' + sciezka;
}

function odpowiedzWPamieci(sciezka) {
  return !!(stan.uz && stan.uz.id != null) && !BEZ_PAMIECI.test(String(sciezka).split('?')[0]);
}

async function zapamietajOdpowiedz(sciezka, dane) {
  if (!odpowiedzWPamieci(sciezka)) return;
  let dlugosc = 0;
  try { dlugosc = JSON.stringify(dane).length; } catch (e) { return; }
  if (dlugosc > MAKS_ODPOWIEDZI) return;
  await Kolejka.zapamietaj(kluczOdpowiedzi(sciezka), { dane, czas: new Date().toISOString() });
  bezProgramu.zapisow += 1;
  if (bezProgramu.zapisow % 25 === 0) await przytnijPamiecOdpowiedzi();
}

async function odpowiedzZPamieci(sciezka) {
  if (!odpowiedzWPamieci(sciezka)) return null;
  const w = await Kolejka.przypomnij(kluczOdpowiedzi(sciezka)).catch(() => null);
  return w && w.czas ? w : null;
}

/* Ponad MAKS_ODPOWIEDZI_OSOBY wypadają najstarsze odpowiedzi tej osoby
   (zapytania z datami potrafią mnożyć adresy bez końca). */
async function przytnijPamiecOdpowiedzi() {
  const przedrostek = PAMIEC_ODPOWIEDZI + stan.uz.id + ':';
  const klucze = (await Kolejka.klucze()).filter(k => String(k).startsWith(przedrostek));
  if (klucze.length <= MAKS_ODPOWIEDZI_OSOBY) return;
  const wpisy = [];
  for (const k of klucze) {
    const w = await Kolejka.przypomnij(k).catch(() => null);
    wpisy.push([k, (w && w.czas) || '']);
  }
  wpisy.sort((a, b) => a[1].localeCompare(b[1]));
  for (const [k] of wpisy.slice(0, wpisy.length - MAKS_ODPOWIEDZI_OSOBY)) await Kolejka.zapomnij(k);
}

/* Zabiera zapamiętane odpowiedzi wszystkich osób poza `zostaw` (id osoby;
   null = wszystkich) — przy wylogowaniu i przy zalogowaniu innej osoby. */
async function zapomnijOdpowiedzi(zostaw) {
  const swoje = zostaw == null ? '' : PAMIEC_ODPOWIEDZI + zostaw + ':';
  for (const k of await Kolejka.klucze()) {
    const t = String(k);
    if (t.startsWith(PAMIEC_ODPOWIEDZI) && !(swoje && t.startsWith(swoje))) await Kolejka.zapomnij(k);
  }
}

/* Zapis bez programu: mówimy wprost, że NIE poszedł. Stary tekst („zapisy
   poczekają w telefonie”) jest prawdziwy tylko dla kolejki kierowcy. */
function bladBezProgramu(e, metoda, sciezka) {
  if (metoda === 'GET' || String(sciezka).split('?')[0] === '/api/sync') return e;
  const blad = new Error('Brak połączenia z programem w biurze — nie zapisano. '
    + 'Spróbuj ponownie, gdy połączenie wróci.');
  blad.bezPolaczenia = true;
  return blad;
}

function pracaBezProgramu(czas) {
  if (!bezProgramu.od) bezProgramu.od = new Date().toISOString();
  if (!bezProgramu.daneZ || czas < bezProgramu.daneZ) bezProgramu.daneZ = czas;
  pokazWstegeBezProgramu(false);
  if (!bezProgramu.proba) bezProgramu.proba = setInterval(sprobujProgram, ODSTEP_PROBY_PROGRAMU_MS);
}

function programOdpowiada() {
  if (!bezProgramu.od) return;
  bezProgramu.od = '';
  bezProgramu.daneZ = '';
  clearInterval(bezProgramu.proba);
  bezProgramu.proba = 0;
  pokazWstegeBezProgramu(true);
  wyslijZapisyBiura();
}

async function sprobujProgram() {
  try {
    const odp = await pobierz('/api/zyje', { cache: 'no-store' });
    if (odp.ok) { programOdpowiada(); return true; }
  } catch (e) { /* dalej bez programu */ }
  return false;
}

/* „10:41” dla dzisiejszych danych, „7.10, 10:41” dla starszych. */
function chwilaDanych(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'ostatniego połączenia';
  const godz = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const dzis = new Date();
  return d.toDateString() === dzis.toDateString() ? godz : `${d.getDate()}.${d.getMonth() + 1}, ${godz}`;
}

function pokazWstegeBezProgramu(wrocil) {
  const tresc = document.getElementById('tresc');
  let wstega = document.getElementById('wstega-bez-programu');
  if (!wstega) {
    if (!tresc || !tresc.parentNode) return;
    wstega = document.createElement('div');
    wstega.id = 'wstega-bez-programu';
    tresc.parentNode.insertBefore(wstega, tresc);
  }
  if (wrocil) {
    wstega.className = 'wstega ok';
    wstega.innerHTML = 'Połączenie z programem wróciło. '
      + '<button class="glowny maly" id="btn-odswiez-dane">Odśwież dane</button>';
    wstega.querySelector('#btn-odswiez-dane').onclick = () => { wstega.remove(); odswiezEkran(); };
    return;
  }
  wstega.className = 'wstega uwaga';
  const czeka = zapisyBiura.ile
    ? `czeka na wysłanie: ${zapisyBiura.ile}. ` : 'część zmian zapiszesz w tym komputerze. ';
  wstega.innerHTML = `Bez połączenia z programem — dane z ${escHtml(chwilaDanych(bezProgramu.daneZ))}, `
    + czeka + '<button class="maly" id="btn-sprobuj-program">Spróbuj teraz</button>';
  wstega.querySelector('#btn-sprobuj-program').onclick = async () => {
    if (!await sprobujProgram()) komunikat('Program dalej nie odpowiada', 'blad');
  };
}

/* ------------------------------------------------- zapisy biura bez programu

   Wybrane zapisy biura (zapisBiura — miejsca wywołania same o tym decydują)
   nie przepadają, gdy programu nie ma: trafiają do pamięci tego urządzenia
   (klucz 'biuro-op:<uuid>'), a ekran od razu pokazuje zmianę, bo funkcja
   `popraw` z miejsca wywołania nanosi ją na zapamiętane odpowiedzi. Gdy program
   wraca, zapisy idą po kolei, każdy z nagłówkiem X-GK-Operacja — program
   pamięta numery przyjętych operacji, więc ponowienie niczego nie podwoi.

   Przed wysłaniem każdy zapis sprawdza, czy dane, na których go zrobiono
   (`zrodla` — adresy GET), nie zmieniły się w programie w międzyczasie
   (np. kierowca zamknął punkt, drugi komputer biura przestawił trasę). Gdy się
   zmieniły — zapis czeka na decyzję człowieka („Wyślij mimo to” / „Porzuć”),
   a kolejka stoi, bo następne zapisy mogą od niego zależeć. Zapis, którego
   program nie przyjął (4xx), zostaje na liście z powodem — nic nie znika samo.

   Nowych rzeczy (zlecenie, pojazd, klient) bez programu się nie zakłada: numer
   nadaje program, a ekran od razu go potrzebuje. Takie zapisy mówią „nie
   zapisano”, jak dotąd.                                                     */
const PAMIEC_ZAPISOW = 'biuro-op:';
const KOMUNIKAT_KOLEJKI_BIURA = 'Zapisane w tym komputerze — wyślę, gdy program odpowie';
const zapisyBiura = { wysyla: false, oczekiwane: {}, ile: 0, lista: [] };

function numerOperacji() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'b-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

/* Odcisk odpowiedzi (FNV-1a z JSON-a) — do porównania „czy to się zmieniło”. */
function odcisk(dane) {
  const t = JSON.stringify(dane === undefined ? null : dane);
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16) + ':' + t.length;
}

function bezPolaczeniaZProgramem(e) {
  return !!(e && (e.bezPolaczenia || KODY_BEZ_PROGRAMU.indexOf(e.kod) >= 0));
}

/* Zmiana na obiekcie o danym id — w liście albo w samym obiekcie odpowiedzi. */
function wPamieci(dane, id, zmiana) {
  if (Array.isArray(dane)) dane.forEach(x => { if (x && x.id === id) zmiana(x); });
  else if (dane && dane.id === id) zmiana(dane);
}

async function zapisyBiuraOsoby() {
  if (!stan.uz) return [];
  const lista = [];
  for (const k of await Kolejka.klucze()) {
    if (!String(k).startsWith(PAMIEC_ZAPISOW)) continue;
    const op = await Kolejka.przypomnij(k).catch(() => null);
    if (op && op.uzytkownik === stan.uz.id) lista.push(op);
  }
  return lista.sort((a, b) => a.dodano.localeCompare(b.dodano));
}

/* Nanosi zmianę na zapamiętane odpowiedzi tej osoby; czas danych zostaje. */
async function poprawPamiec(popraw) {
  const przedrostek = PAMIEC_ODPOWIEDZI + stan.uz.id + ':';
  for (const k of await Kolejka.klucze()) {
    const t = String(k);
    if (!t.startsWith(przedrostek)) continue;
    const w = await Kolejka.przypomnij(k).catch(() => null);
    if (!w) continue;
    const przed = odcisk(w.dane);
    const wynik = popraw(t.slice(przedrostek.length), w.dane);
    const dane = wynik === undefined ? w.dane : wynik;
    if (odcisk(dane) !== przed) await Kolejka.zapamietaj(k, { dane, czas: w.czas });
  }
}

/* Zapis biura, który może poczekać. opcje: { opis, zrodla: [adresy GET],
   popraw(sciezka, dane) }. Zwraca odpowiedź programu albo { wKolejce: true }. */
async function zapisBiura(metoda, sciezka, dane, opcje) {
  const o = opcje || {};
  const op = { uuid: numerOperacji(), metoda, sciezka, dane: dane === undefined ? null : dane,
               opis: o.opis || sciezka, uzytkownik: stan.uz ? stan.uz.id : null,
               dodano: new Date().toISOString(), zrodla: [] };
  // Bez zaległych zapisów i z programem — zwyczajnie, od razu. Zaległe zapisy
  // idą pierwsze: kolejność zmian na tym komputerze ma zostać zachowana.
  if (!bezProgramu.od && !(await zapisyBiuraOsoby()).length) {
    try {
      return await API.zadanie(metoda, sciezka, dane, { 'X-GK-Operacja': op.uuid });
    } catch (e) {
      if (!bezPolaczeniaZProgramem(e)) throw e;
    }
  }
  if (!stan.uz) throw new Error('Zaloguj się ponownie — zapis bez konta nie poczeka');
  for (const z of o.zrodla || []) {
    const kopia = await odpowiedzZPamieci(z);
    op.zrodla.push({ sciezka: z, odcisk: kopia ? odcisk(kopia.dane) : '' });
  }
  await Kolejka.zapamietaj(PAMIEC_ZAPISOW + op.uuid, op);
  if (o.popraw) await poprawPamiec(o.popraw).catch(() => { /* ekran pokaże stare dane */ });
  await pokazZapisyBiura();
  if (!bezProgramu.od) wyslijZapisyBiura();
  return { ok: true, wKolejce: true };
}

/* Wysyła zaległe zapisy po kolei. Woła ją powrót programu, start aplikacji
   i każdy nowy zapis przy działającym programie. */
async function wyslijZapisyBiura() {
  if (zapisyBiura.wysyla || !stan.uz || !stan.token) return;
  zapisyBiura.wysyla = true;
  try {
    for (const op of await zapisyBiuraOsoby()) {
      if (op.blad) continue;                       // czeka na człowieka, nie blokuje
      if (op.konflikt) break;                       // kolejka stoi do decyzji
      if (!op.mimoTo) {
        let zmienione = false;
        for (const z of op.zrodla || []) {
          const teraz = await API.zadanie('GET', z.sciezka);
          if (bezProgramu.od) return;               // odpowiedź z pamięci — programu dalej nie ma
          const oczekiwany = zapisyBiura.oczekiwane[z.sciezka] || z.odcisk;
          if (oczekiwany && odcisk(teraz) !== oczekiwany) zmienione = true;
        }
        if (zmienione) {
          op.konflikt = new Date().toISOString();
          await Kolejka.zapamietaj(PAMIEC_ZAPISOW + op.uuid, op);
          break;
        }
      }
      try {
        await API.zadanie(op.metoda, op.sciezka, op.dane === null ? undefined : op.dane,
                          { 'X-GK-Operacja': op.uuid });
      } catch (e) {
        if (bezPolaczeniaZProgramem(e) || !e.kod || e.kod >= 500 || e.kod === 401) return;
        op.blad = poLudzku(e);
        await Kolejka.zapamietaj(PAMIEC_ZAPISOW + op.uuid, op);
        continue;
      }
      await Kolejka.zapomnij(PAMIEC_ZAPISOW + op.uuid);
      for (const z of op.zrodla || []) {
        try { zapisyBiura.oczekiwane[z.sciezka] = odcisk(await API.zadanie('GET', z.sciezka)); }
        catch (e) { /* sprawdzi następny zapis */ }
      }
    }
  } catch (e) {
    /* program znowu zniknął w trakcie — następna próba przy jego powrocie */
  } finally {
    zapisyBiura.wysyla = false;
    await pokazZapisyBiura();
  }
}

/* Wstęga zapisów biura: konflikt i odrzucone (z decyzją człowieka); liczba
   czekających idzie do wstęgi „bez połączenia”. */
async function pokazZapisyBiura() {
  const lista = await zapisyBiuraOsoby().catch(() => []);
  zapisyBiura.lista = lista;
  zapisyBiura.ile = lista.filter(op => !op.blad).length;
  if (bezProgramu.od) pokazWstegeBezProgramu(false);
  const tresc = document.getElementById('tresc');
  let wstega = document.getElementById('wstega-zapisy-biura');
  const sprawy = lista.filter(op => op.blad || op.konflikt);
  if (!sprawy.length) {
    if (wstega) wstega.remove();
    return;
  }
  if (!wstega) {
    if (!tresc || !tresc.parentNode) return;
    wstega = document.createElement('div');
    wstega.id = 'wstega-zapisy-biura';
    tresc.parentNode.insertBefore(wstega, tresc);
  }
  wstega.className = 'wstega blad';
  wstega.innerHTML = sprawy.map(op => op.konflikt
    ? `<div>Nie wysłano „${escHtml(op.opis)}”: w programie ktoś to zmienił, gdy nie było połączenia.
        <button class="maly" data-mimo-to="${escHtml(op.uuid)}">Wyślij mimo to</button>
        <button class="maly" data-porzuc="${escHtml(op.uuid)}">Porzuć</button></div>`
    : `<div>Program nie przyjął „${escHtml(op.opis)}”: ${escHtml(op.blad)}
        <button class="maly" data-porzuc="${escHtml(op.uuid)}">Usuń z listy</button></div>`).join('');
  wstega.querySelectorAll('[data-mimo-to]').forEach(b => b.onclick = async () => {
    const op = await Kolejka.przypomnij(PAMIEC_ZAPISOW + b.dataset.mimoTo).catch(() => null);
    if (!op) return;
    op.konflikt = '';
    op.mimoTo = true;
    await Kolejka.zapamietaj(PAMIEC_ZAPISOW + op.uuid, op);
    await pokazZapisyBiura();
    await wyslijZapisyBiura();
    odswiezEkran();
  });
  wstega.querySelectorAll('[data-porzuc]').forEach(b => b.onclick = async () => {
    await Kolejka.zapomnij(PAMIEC_ZAPISOW + b.dataset.porzuc);
    await pokazZapisyBiura();          // wysyłka w tle mogła właśnie trwać — wstęga od razu
    await wyslijZapisyBiura();
    odswiezEkran();
  });
}

const API = {
  async zadanie(metoda, sciezka, dane, naglowki) {
    const opcje = { method: metoda, headers: Object.assign({}, naglowki || {}) };
    if (stan.token) opcje.headers.Authorization = 'Bearer ' + stan.token;
    if (dane !== undefined) {
      opcje.headers['Content-Type'] = 'application/json';
      opcje.body = JSON.stringify(dane);
    }
    let odp;
    try {
      odp = await pobierz(sciezka, opcje);
    } catch (e) {
      const kopia = metoda === 'GET' ? await odpowiedzZPamieci(sciezka) : null;
      if (kopia) { pracaBezProgramu(kopia.czas); return kopia.dane; }
      throw bladBezProgramu(e, metoda, sciezka);
    }
    if (metoda === 'GET' && KODY_BEZ_PROGRAMU.indexOf(odp.status) >= 0) {
      const kopia = await odpowiedzZPamieci(sciezka);
      if (kopia) { pracaBezProgramu(kopia.czas); return kopia.dane; }
    }
    if (odp.status === 401) { sesjaWygasla(); throw new Error('Sesja wygasła — zaloguj się ponownie'); }
    let wynik = null;
    try { wynik = await odp.json(); } catch (e) { wynik = null; }
    if (!odp.ok) {
      const blad = new Error((wynik && wynik.blad) || `Błąd serwera (${odp.status})`);
      // Kod HTTP jest potrzebny tam, gdzie 409 znaczy „zapytaj i ponów",
      // a nie „nie da się" — np. przy kasowaniu podpisów przez retencję.
      blad.kod = odp.status;
      throw blad;
    }
    programOdpowiada();
    if (metoda === 'GET') zapamietajOdpowiedz(sciezka, wynik).catch(() => { /* pamięć to tylko zapas */ });
    return wynik;
  },
  get(s) { return API.zadanie('GET', s); },
  post(s, d) { return API.zadanie('POST', s, d || {}); },
  del(s) { return API.zadanie('DELETE', s); },
};

/* Powiadomienia przy ZAMKNIĘTEJ aplikacji (Web Push) — tak samo jak aplikacje
   hali w GK Panel Kierownika. Telefon zapisuje się u serwera push swojej
   przeglądarki (klucz VAPID programu) i oddaje programowi adres subskrypcji.
   Program wysyła pusty push, a sw.js dociąga treść z /api/push/co-nowego.

   Przeglądarki pozwalają na to tylko pod https:// (tunel) albo na localhost —
   pod http://192.168… mówimy o tym wprost, zamiast udawać, że działa.
   „Włączone” trzymamy w tym urządzeniu (Pamiec 'push'): na wspólnym
   telefonie po wylogowaniu subskrypcja przechodzi na następną osobę.        */
const Powiadomienia = {
  mozliwe() {
    return typeof navigator !== 'undefined' && !!navigator.serviceWorker
      && typeof window.PushManager !== 'undefined' && typeof window.Notification !== 'undefined';
  },
  wlaczoneTutaj() { return Pamiec.czytaj('push') === '1'; },
  zapamietaj(wlaczone) {
    // Tryb prywatny: zapis się nie uda — przy następnym wejściu trzeba włączyć jeszcze raz.
    if (wlaczone) Pamiec.zapisz('push', '1'); else Pamiec.usun('push');
  },
  async subskrypcja() {
    if (!this.mozliwe()) return null;
    try {
      const rej = await navigator.serviceWorker.getRegistration();
      return rej ? await rej.pushManager.getSubscription() : null;
    } catch (e) { return null; }
  },
  /* 'niedostepne' (http, stara przeglądarka) | 'zablokowane' | 'wlaczone' | 'wylaczone' */
  async stan() {
    if (!this.mozliwe() || !window.isSecureContext) return 'niedostepne';
    if (Notification.permission === 'denied') return 'zablokowane';
    return (this.wlaczoneTutaj() && await this.subskrypcja()) ? 'wlaczone' : 'wylaczone';
  },
  /* Zgoda przeglądarki i subskrypcja w JEDNYM dotknięciu — przeglądarka pyta
     o zgodę tylko w odpowiedzi na gest człowieka. */
  async wlacz() {
    if (!this.mozliwe() || !window.isSecureContext) {
      throw new Error('Niedostępne tutaj: potrzebny adres https:// (tunel), a na iPhonie '
        + 'aplikacja dodana do ekranu początkowego.');
    }
    if (await Notification.requestPermission() !== 'granted') {
      throw new Error('Powiadomienia są zablokowane — zezwól na nie w ustawieniach przeglądarki '
        + 'dla tej strony i dotknij jeszcze raz.');
    }
    const rej = await navigator.serviceWorker.ready;
    const { klucz } = await API.get('/api/push/klucz');
    let sub = await rej.pushManager.getSubscription();
    if (!sub) {
      sub = await rej.pushManager.subscribe({ userVisibleOnly: true,
                                              applicationServerKey: Powiadomienia.zB64u(klucz) });
    }
    await API.post('/api/push/zapisz', { subskrypcja: sub.toJSON() });
    this.zapamietaj(true);
  },
  async wylacz() {
    const sub = await this.subskrypcja();
    if (sub) {
      try { await API.post('/api/push/wypisz', { endpoint: sub.endpoint }); } catch (e) {
        /* bez sieci — serwer wypisze telefon sam po odpowiedzi 410 */ }
      try { await sub.unsubscribe(); } catch (e) { /* i tak nie wróci */ }
    }
    this.zapamietaj(false);
  },
  /* Po zalogowaniu na telefonie z włączonymi powiadomieniami: subskrypcja
     przechodzi na osobę, która się właśnie zalogowała. */
  async odnow() {
    try {
      if (!this.wlaczoneTutaj() || !this.mozliwe() || Notification.permission !== 'granted') return;
      const sub = await this.subskrypcja();
      if (sub) await API.post('/api/push/zapisz', { subskrypcja: sub.toJSON() });
    } catch (e) { /* spróbujemy przy następnym logowaniu */ }
  },
  zB64u(t) {
    const b = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - t.length % 4) % 4));
    return Uint8Array.from(b, c => c.charCodeAt(0));
  },
};

/* Jeden przycisk w oknie „Moje konto”: Włącz powiadomienia / Włączone + Wyłącz —
   te same stany i słowa co w GK Flota i w Panelu (STYL-GK §3). */
async function rysujPowiadomienia(pole) {
  if (!pole) return;
  const s = await Powiadomienia.stan();
  pole.innerHTML = s === 'wlaczone'
    ? `<p class="konto-ok">Włączone — także przy zamkniętej aplikacji.</p>
       <button id="btn-push" data-push="wylacz">Wyłącz</button>`
    : s === 'zablokowane'
      ? `<p class="konto-uwaga">Zablokowane — zezwól na powiadomienia w ustawieniach
           przeglądarki dla tej strony.</p>`
      : s === 'niedostepne'
        ? `<p class="konto-uwaga">Niedostępne tutaj: potrzebny adres https:// (tunel —
             zapytaj biuro), a na iPhonie aplikacja dodana do ekranu początkowego
             (iOS 16.4 albo nowszy).</p>`
        : `<button class="glowny" id="btn-push" data-push="wlacz">Włącz powiadomienia</button>`;
  const b = pole.querySelector('#btn-push');
  if (b) b.onclick = async () => {
    b.disabled = true;
    try {
      await Powiadomienia[b.dataset.push]();
      komunikat(b.dataset.push === 'wlacz' ? 'Powiadomienia włączone' : 'Powiadomienia wyłączone', 'ok');
    } catch (e) {
      komunikat(poLudzku(e), 'blad');
    }
    rysujPowiadomienia(pole);
  };
}

/* Adres z powiadomienia („#moja”, „#trasa=12”, „#raporty”) → ekran aplikacji. */
function otworzAdres(adres) {
  const m = /^#([a-z]+)(?:=(\d+))?$/.exec(String(adres || ''));
  if (!m || !EKRANY[m[1]] || !stan.uz) return false;
  pokazEkran(m[1], m[2] ? { id: Number(m[2]) } : {});
  return true;
}

/* Opakowanie na akcje uzytkownika: pokazuje kolo, lapie blad, wypisuje go. */
async function sprobuj(praca, komunikatSukcesu) {
  zajety(true);
  try {
    const w = await praca();
    if (komunikatSukcesu) komunikat(w && w.wKolejce ? KOMUNIKAT_KOLEJKI_BIURA : komunikatSukcesu, 'ok');
    return w;
  } catch (e) {
    komunikat(poLudzku(e), 'blad');
    Dzwiek.zagraj('blad');                 // odmowa akcji człowieka — cichy, niski dźwięk
    return null;
  } finally {
    zajety(false);
  }
}

/* --------------------------------------------------------- kolejka offline */

async function doKolejki(op, komunikatSukcesu) {
  // Po odrzuconej sesji ekran jest tylko do odczytu: nowe zapisy dopiero po
  // ponownym zalogowaniu (sesjaWygasla). Ślad GPS idzie w tle, bez ludzkiej
  // ręki — po cichu go pomijamy, zamiast straszyć komunikatem co 2 minuty.
  if (stan.sesjaWygasla) {
    if (op.typ === 'pozycje') return null;
    komunikat('Sesja wygasła — zaloguj się ponownie. Nic nie zginęło.', 'blad');
    oknoPonownegoLogowania();
    throw new Error('Sesja wygasła — zaloguj się ponownie');
  }
  // Kto to zapisał. Bez tego kolejka po wylogowaniu przechodzi na następną
  // osobę, która zaloguje się na tym telefonie — serwer odrzuci cudze
  // potwierdzenia, a telefon by je skasował. Czyli utrata pracy kierowcy.
  op.uzytkownik = stan.uz ? stan.uz.id : null;
  try {
    await Kolejka.dodaj(op);
  } catch (e) {
    // Cicha porazka w tym miejscu jest najgorsza z mozliwych: kierowca widzi
    // ptaszka, a podpisu i zdjec nie ma nigdzie. Mowimy wprost i przerywamy.
    komunikat('NIE ZAPISANO. ' + poLudzku(e), 'blad');
    Dzwiek.zagraj('blad');
    throw e;
  }
  await odswiezStanSieci();
  if (komunikatSukcesu) {
    komunikat(stan.online ? komunikatSukcesu : komunikatSukcesu + ' (wyślę, gdy wróci zasięg)', 'ok');
    // Kluczowy zapis kierowcy („✓ Dostarczone”, załadunek, raport) — krótki dźwięk
    // potwierdzenia, jak w hali; ślad GPS idzie bez komunikatu, więc bez dźwięku.
    Dzwiek.zagraj('sukces');
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
    await odswiezStanSieci();
    // Paczke dobieramy wedlug wagi, a nie liczby. Dwanascie potwierdzen bez
    // zdjec wazy tyle co nic, ale dwanascie ze zdjeciami przekroczyloby limit
    // serwera i utknelyby na zawsze.
    const LIMIT = 6 * 1024 * 1024;
    const wysylka = [];
    let waga = 0;
    for (const o of paczka) {
      const czysta = Object.assign({}, o, { dodano: undefined, prob: undefined });
      const ile = JSON.stringify(czysta).length;
      if (wysylka.length && waga + ile > LIMIT) break;
      wysylka.push(czysta);
      waga += ile;
      if (wysylka.length >= 12) break;
    }
    // Mówimy serwerowi, ile zapisów zostaje w telefonie — biuro musi odróżnić
    // „kierowca tego nie zrobił" od „zrobił, ale nie ma zasięgu".
    const zostaje = Math.max(0, (await Kolejka.ile().catch(() => 0)) - wysylka.length);
    const wynik = await API.post('/api/sync', { operacje: wysylka, w_kolejce: zostaje });
    for (const p of wynik.przyjete) await Kolejka.usun(p.uuid);

    // Nic nie kasujemy po cichu. Zapis, ktorego serwer nie przyjal, laduje
    // na polce odrzuconych — z powodem, do obejrzenia przez czlowieka.
    // Podpis i zdjecia z rampy sa nie do odtworzenia; komunikat znikajacy
    // po pieciu sekundach nie jest wystarczajacym sladem.
    const wgUuid = Object.fromEntries(paczka.map(o => [o.uuid, o]));
    for (const o of wynik.odrzucone) {
      const op = wgUuid[o.uuid];
      if (!op) continue;
      if (o.trwaly) {
        await Kolejka.odrzuc(op, o.blad);
      } else {
        await Kolejka.oznaczProbe(op);
        // po kilku nieudanych probach tez odkladamy, zeby nie krecic sie
        // w kolko i nie dublowac zdjec przy kazdym podejsciu
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
      if (EKRANY[stan.ekran] && EKRANY[stan.ekran].poSynchronizacji) EKRANY[stan.ekran].poSynchronizacji();
    }
  } catch (e) {
    if (!cicho) komunikat('Nie udało się wysłać. ' + poLudzku(e), 'blad');
  } finally {
    stan.synchronizuje = false;
    await odswiezStanSieci();
  }
}

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
    // Padnięte IndexedDB (tryb prywatny, zablokowane dane witryny, pełna pamięć)
    // znaczy, że kierowca NIE MA gdzie odłożyć podpisu i zdjęć bez zasięgu. Zamiast
    // wywrócić start aplikacji — ta funkcja leci przed ekranem logowania — mówimy
    // o tym wprost i wpuszczamy do środka (tak samo jak GK Flota, 2026-10-16).
    stan.wKolejce = 0; stan.obceWKolejce = 0; stan.odrzucone = 0;
    if (!stan.bezPamieci) {
      stan.bezPamieci = true;
      komunikat(`Pamięć ${slowoUrzadzenia('dopelniacz')} nie odpowiada — bez zasięgu nie zapiszę `
        + 'podpisu ani zdjęć. Zamknij i otwórz aplikację jeszcze raz.', 'blad');
    }
  }
  const kropka = document.getElementById('stan-sieci');
  if (!kropka) return;
  kropka.className = 'stan-sieci' + ((stan.odrzucone || stan.bezPamieci) ? ' odrzucone'
    : (!stan.online ? ' offline' : (stan.wKolejce ? ' czeka' : '')));
  kropka.title = tytulKropkiSieci({ online: stan.online, wKolejce: stan.wKolejce, odrzucone: stan.odrzucone,
    bezPamieci: stan.bezPamieci, komputer: naKomputerze() });
  const znacznik = document.getElementById('znacznik-kolejki');
  if (znacznik) znacznik.textContent = stan.wKolejce ? `⏳ ${stan.wKolejce}` : '';
  odswiezPasekPolaczenia();
}

/* ------------------------------------------------------------- logowanie */

/* Login osoby tak jak w hubie (login_z_nazwy, GK-KONTA.md §1): małe litery, bez
   polskich znaków, kropki/podkreślenia/myślniki jak spacje, pojedyncze spacje.
   „Krzysztof  Hamrol” = „krzysztof.hamrol” = „krzysztof hamrol”. */
function loginZNazwy(t) {
  return String(t || '').toLowerCase().replace(/ł/g, 'l').normalize('NFKD')
    .replace(/[̀-ͯ]/g, '').replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');
}

/* Znaczniki urządzenia (D43, GK-KONTA.md §7.2). Po dobrym haśle program daje
   temu urządzeniu znacznik ważny 16 godzin — z nim wystarcza PIN. Trzymamy go
   PER OSOBA (na wspólnym telefonie loguje się kilka osób): mapa login → {z, do}
   w Pamiec 'znaczniki' (przedrostek gk-trasy.). Klucze po loginZNazwy: wpisane
   imię i nazwisko, login i imię z konta. Wylogowanie znacznika NIE kasuje — po
   to jest: następne logowanie tej osoby PIN-em. Kasuje go „wymagane_haslo”. */
const Znaczniki = {
  wszystkie() {
    try {
      const m = JSON.parse(Pamiec.czytaj('znaczniki') || '{}');
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
    Pamiec.zapisz('znaczniki', JSON.stringify(m));
  },
  zapomnij(ident) {
    const m = this.wszystkie();
    const w = m[loginZNazwy(ident)];
    if (!w) return;
    Object.keys(m).forEach(k => { if ((m[k] || {}).z === w.z) delete m[k]; });
    Pamiec.zapisz('znaczniki', JSON.stringify(m));
  },
};

/* Pole sekretu (D43, STYL-GK §2): osoba ze znacznikiem tego urządzenia → „PIN
   (4 cyfry)” z klawiaturą cyfr; inaczej „Hasło (raz na 16 godzin na tym
   urządzeniu)” z pełną klawiaturą. Program bez kont D43 (konta tutejsze,
   Panel sprzed D43) — „PIN / hasło” jak dawniej (stan.trybD43 z /api/zyje).
   Link pod polem: „Zaloguj hasłem” (zapomniany PIN), przy haśle ze znacznikiem —
   „Zaloguj PIN-em”; bez znacznika linku nie ma. Serwer i tak rozstrzyga. */
const ETYKIETY_SEKRETU = { pin: 'PIN (4 cyfry)', haslo: 'Hasło (raz na 16 godzin na tym urządzeniu)',
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
  // pobierz(), a nie goły fetch pod /api/logowanie: na Pages goły adres pytałby
  // o dane sam GitHub, a ten oddaje stronę „404” w HTML-u — kierowca widziałby
  // „serwer odpowiedział czymś, czego program nie rozumie” przy działającym programie.
  // D43: pole „znacznik” idzie ZAWSZE (null, gdy go nie ma) — po nim program
  // poznaje, że ta wersja umie PIN i okno „Ustaw hasło i PIN”.
  const zn = Znaczniki.dla(login);
  const odp = await pobierz('/api/logowanie', {
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
  // Kto był tu ostatnio. Po wygasłej sesji (sesjaWygasla) jego profil
  // i kartoteka celowo zostały w telefonie — przy tej samej osobie to one
  // pozwalają wrócić bez utraty czegokolwiek. INNA osoba nie może jednak
  // dostać cudzej kartoteki (jak przy wylogowaniu). Kolejki nie ruszamy:
  // cudze zapisy czekają na swojego właściciela (synchronizuj je pomija).
  let poprzedni = stan.uz;
  if (!poprzedni) {
    try { poprzedni = await Kolejka.przypomnij('profil'); } catch (e) { poprzedni = null; }
  }
  if (poprzedni && poprzedni.id !== wynik.id) {
    try { await Kolejka.zapomnij('slowniki'); } catch (e) { /* zaraz i tak nadpisze */ }
    stan.klienci = []; stan.pojazdy = []; stan.lokalizacje = []; stan.ustawienia = {};
  }
  stan.token = wynik.token;
  Pamiec.zapisz('token', wynik.token);   // tryb prywatny albo pełna pamięć — zalogowanie i tak ma się udać
  stan.uz = wynik;
  zakonczTrybDoOdczytu();
  await zapomnijOdpowiedzi(wynik.id).catch(() => { /* wejście ważniejsze */ });
  await Kolejka.zapamietaj('profil', wynik);   // zeby jutro wejsc bez zasiegu
  poprosOTrwalaPamiec();
  Powiadomienia.odnow();                       // w tle — logowanie na to nie czeka
  return wynik;
}

async function wyloguj(cicho) {
  if (!cicho) {
    const czeka = stan.wKolejce;
    if (czeka && !await potwierdz(
      `W kolejce czeka ${czeka} ${odmiana(czeka, 'zapis', 'zapisy', 'zapisów')}`,
      `Zostaną w ${slowoUrzadzenia('miejscownik')} i wyślą się, gdy zalogujesz się ponownie. `
      + 'Nikt inny ich nie wyśle ani nie skasuje. Wylogować?')) return;
    // Razem z wylogowaniem wypisujemy ten telefon z powiadomień TEJ osoby —
    // na wspólnym telefonie następna nie może dostawać cudzych zleceń.
    let endpoint = '';
    try { const sub = await Powiadomienia.subskrypcja(); endpoint = sub ? sub.endpoint : ''; } catch (e) { /* bez push */ }
    try { await API.post('/api/wyloguj', endpoint ? { endpoint } : {}); } catch (e) { /* trudno, i tak wychodzimy */ }
  }
  stan.token = ''; stan.uz = null;
  Pamiec.usun('token');
  zakonczTrybDoOdczytu();
  // Kartoteka klientow i profil zostawaly w telefonie po wylogowaniu —
  // bezterminowo, bo nic ich nigdy nie kasowalo. Zgubiony albo oddany telefon
  // oddawal wtedy komus obcemu cala baze odbiorcow firmy.
  // KOLEJKI I ODRZUCONYCH NIE RUSZAMY: to jedyny egzemplarz podpisow i zdjec,
  // ktore czekaja na zasieg.
  try {
    await Kolejka.zapomnij('slowniki');
    await Kolejka.zapomnij('profil');
    await zapomnijOdpowiedzi(null);
  } catch (e) { /* brak pamieci nie moze zatrzymac wylogowania */ }
  stan.klienci = []; stan.pojazdy = []; stan.lokalizacje = []; stan.ustawienia = {};
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
   brak odpowiedzi = brak linii, logowanie na to nie czeka. Ta sama odpowiedź
   mówi, czy konta są już w D43 (hasło + PIN) — wtedy pole sekretu pisze
   „Hasło (raz na 16 godzin…)” zamiast „PIN / hasło”. */
async function pokazInfoKont() {
  const linia = document.getElementById('info-kont');
  try {
    const odp = await pobierz('/api/zyje');
    const w = odp.ok ? await odp.json() : {};
    if (linia) linia.hidden = !(w && w.konta_z_panelu);
    stan.trybD43 = !!(w && w.d43);
    Pamiec.zapisz('d43', stan.trybD43 ? '1' : '');
  } catch (e) { if (linia) linia.hidden = true; }
  if (stan.poleLogowania) stan.poleLogowania.odswiez();
}

/* Okno „Ustaw hasło i PIN” (D43 §7.4, STYL-GK §2): pierwsze logowanie hasłem
   startowym (albo konto bez PIN-u). Tylko brakujące pola. Sesja z logowania
   służy wyłącznie temu oknu; po zapisie osoba jest zalogowana i idzie dalej()
   — wejście do aplikacji albo powrót do ekranu po „Zaloguj się ponownie”. */
function oknoUstawieniaKonta(u, dalej, bladNaStart) {
  const haslo = (u.do_ustawienia || []).includes('haslo');
  const pin = (u.do_ustawienia || []).includes('pin');
  const tytul = haslo && pin ? 'Ustaw hasło i PIN' : haslo ? 'Ustaw nowe hasło' : 'Ustaw PIN';
  okno({
    tytul, konto: true,
    tresc: `
      <p class="konto-kto"><b>${escHtml(u.imie)}</b></p>
      <p class="konto-drobne">${haslo ? 'Hasło startowe działa tylko przy pierwszym logowaniu. ' : ''}Hasło
        wpiszesz raz na 16 godzin na tym urządzeniu, na co dzień — PIN. Oba działają we wszystkich
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
          const odp = await pobierz('/api/ustaw-konto', {
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

/* Serwer odrzucił sesję (401): zmiana PIN-u, konto wyłączone w biurze albo
   sesja starsza niż 16 godzin (D74). Dawniej wyloguj(true) — a ono kasuje
   profil i kartotekę, więc kierowca w trasie lądował na pustym ekranie
   logowania i bez zasięgu nie miał już nawet listy punktów.

   Teraz: token znika (i tak nie działa), ale profil, kartoteka i KOLEJKA
   ZOSTAJĄ. Ekran, na którym kierowca był, zostaje — tylko do odczytu, z wstęgą
   „Zaloguj się ponownie”. Ta sama osoba loguje się w okienku i wraca dokładnie
   tam, gdzie była; czekające zapisy wysyłają się same. Inna osoba — jak
   zwykłe logowanie (zaloguj): cudza kartoteka znika, cudze zapisy nie wychodzą. */
function sesjaWygasla() {
  stan.token = '';
  Pamiec.usun('token');
  // Bez profilu nie ma czego pokazywać do odczytu (np. sam start aplikacji) —
  // tam uruchom() pokaże zwykły ekran logowania.
  if (!stan.uz || stan.sesjaWygasla) return;
  stan.sesjaWygasla = true;
  document.body.classList.add('sesja-wygasla');
  let wstega = document.getElementById('wstega-sesji');
  const tresc = document.getElementById('tresc');
  if (!wstega && tresc && tresc.parentNode) {
    wstega = document.createElement('div');
    wstega.id = 'wstega-sesji';
    wstega.className = 'wstega uwaga wstega-sesji';
    tresc.parentNode.insertBefore(wstega, tresc);
  }
  if (wstega) {
    wstega.innerHTML = `Sesja wygasła — zapisy czekają w ${slowoUrzadzenia('miejscownik')}. `
      + '<button class="glowny maly" id="btn-zaloguj-ponownie">Zaloguj się ponownie</button>';
    wstega.querySelector('#btn-zaloguj-ponownie').onclick = oknoPonownegoLogowania;
  }
}

function zakonczTrybDoOdczytu() {
  stan.sesjaWygasla = false;
  document.body.classList.remove('sesja-wygasla');
  const wstega = document.getElementById('wstega-sesji');
  if (wstega && wstega.remove) wstega.remove();
}

/* Logowanie w okienku nad ekranem tylko do odczytu — nic pod spodem nie znika. */
function oknoPonownegoLogowania() {
  const login = (stan.uz && stan.uz.login) || '';
  okno({
    tytul: 'Zaloguj się ponownie',
    tresc: `<p class="male">Nic nie zginęło — zapisy z ${slowoUrzadzenia('dopelniacz')} wyślą się po zalogowaniu.</p>
      <label>Imię i nazwisko
        <input id="pl-login" autocomplete="username" autocapitalize="none" autocorrect="off"
               spellcheck="false" value="${escHtml(login)}"></label>
      <label><span id="pl-etykieta">PIN / hasło</span>
        <input id="pl-pin" type="password" autocomplete="current-password"></label>
      <button type="button" class="link-sekretu" id="pl-przelacz" hidden>Zaloguj hasłem</button>
      <div class="blad-logowania" id="pl-blad"></div>`,
    poOtwarciu: pole => {
      stan.polePonownego = poleSekretu({ ident: pole.querySelector('#pl-login'), sekret: pole.querySelector('#pl-pin'),
                                         etykieta: pole.querySelector('#pl-etykieta'),
                                         przelacz: pole.querySelector('#pl-przelacz') });
    },
    przyciski: [
      { napis: 'Później', klik: z => z() },
      { napis: 'Zaloguj', klasa: 'glowny', klik: async z => {
        const blad = document.getElementById('pl-blad');
        blad.textContent = '';
        const poprzedni = stan.uz ? stan.uz.id : null;
        const ekran = stan.ekran;
        zajety(true);
        try {
          await zaloguj(document.getElementById('pl-login').value.trim(),
            document.getElementById('pl-pin').value);
          z();
          await poZalogowaniuPonownie(poprzedni, ekran);
        } catch (e) {
          if (e && e.kodBledu === 'do_ustawienia') {
            oknoUstawieniaKonta(e.ustawienie, () => poZalogowaniuPonownie(poprzedni, ekran));
            return;
          }
          blad.textContent = poLudzku(e);
          if (e && e.kodBledu === 'wymagane_haslo') {
            document.getElementById('pl-pin').value = '';
            if (stan.polePonownego) stan.polePonownego.odswiez();
          }
        } finally {
          zajety(false);
        }
      } },
    ],
  });
}

async function zalogujPonownie(login, pin) {
  const poprzedni = stan.uz ? stan.uz.id : null;
  const ekran = stan.ekran;
  await zaloguj(login, pin);
  await poZalogowaniuPonownie(poprzedni, ekran);
}

async function poZalogowaniuPonownie(poprzedni, ekran) {
  if (stan.uz.id !== poprzedni) {
    await wejdzDoAplikacji();                  // inna osoba: od zera, jak zwykłe logowanie
    return;
  }
  await odswiezStanSieci();
  synchronizuj(false);
  if (ekran) pokazEkran(ekran);                // świeże dane w tym samym miejscu
}

/* --------------------------------------------------------------- ekrany */

// Z wielkiej litery, jak role w oknie konta aplikacji hali (STYL-GK §3).
const NAZWA_ROLI = { admin: 'Administrator', biuro: 'Biuro', kierowca: 'Kierowca' };

/* Trzy role, dwa progi. 'biuro' to wszystko, co robi sie w biurze; 'administrator'
   to dodatkowo konta i Ustawienia. Kierowca nie widzi ani jednego, ani drugiego. */
function jestBiuro() { return stan.uz && stan.uz.rola !== 'kierowca'; }
function jestAdministratorem() { return stan.uz && stan.uz.rola === 'admin'; }

function menuDlaRoli() {
  const biuro = jestBiuro();
  document.querySelectorAll('.tylko-biuro').forEach(e => e.classList.toggle('ukryty', !biuro));
  document.querySelectorAll('.tylko-administrator')
    .forEach(e => e.classList.toggle('ukryty', !jestAdministratorem()));
  document.querySelectorAll('.tylko-kierowca').forEach(e => e.classList.toggle('ukryty', biuro));
  // Arkusz powieksza na telefonie male przyciski kierowcy (style.css, rola-kierowca).
  document.body.classList.toggle('rola-kierowca', !biuro);
  // „Moje auto" otwiera GK Flota — ma sens tylko wtedy, gdy programy są połączone.
  const mojeAuto = !biuro && !!(stan.uz && stan.uz.flotex);
  const przyciskAuta = document.getElementById('btn-moje-auto');
  if (przyciskAuta) przyciskAuta.classList.toggle('ukryty', !mojeAuto);

  // D65: najwyżej cztery ekrany + „☰ Więcej” (jak w hali). Kierowca z GK Flota
  // ma „Moje auto” zamiast „Klientów” — Klienci są w menu „Więcej”.
  const dolne = biuro
    ? [['pulpit', '📊', 'Pulpit'], ['trasy', '🗺️', 'Trasy'],
       ['zalegle', '⏰', 'Zaległe'], ['klienci', '🏢', 'Klienci']]
    : [['moja', '🚚', 'Moja trasa'], ['zaladunek', '📦', 'Załadunek'],
       mojeAuto ? ['mojeauto', '🔧', 'Moje auto'] : ['klienci', '🏢', 'Klienci'],
       ['raporty', '🕒', 'Raport pracy']];
  const pasek = document.getElementById('pasek-dolny');
  pasek.innerHTML = dolne.map(([e, i, n]) =>
    `<button data-ekran="${e}"><span class="i">${i}</span><span>${n}</span></button>`).join('');
  pasek.querySelectorAll('button').forEach(b =>
    b.onclick = () => pokazEkran(b.dataset.ekran));
  // D65: „☰ Więcej” zawsze ostatnie na dolnym pasku — jak w aplikacjach hali
  // (STYL-GK, D64); otwiera menu boczne z resztą ekranów. ☰ w nagłówku zniknęło.
  pasek.insertAdjacentHTML('beforeend',
    '<button type="button" data-wiecej><span class="i">☰</span><span>Więcej</span></button>');
  pasek.querySelector('[data-wiecej]').onclick = otworzMenu;
}

async function pokazEkran(nazwa, parametry) {
  const ekran = EKRANY[nazwa];
  if (!ekran) return;
  if (ekran.tylkoBiuro && !jestBiuro()) return;
  if (ekran.tylkoAdministrator && !jestAdministratorem()) return;
  stan.ekran = nazwa;
  stan.parametryEkranu = parametry || {};
  document.getElementById('tytul-ekranu').textContent = ekran.tytul;
  document.querySelectorAll('.menu button[data-ekran], .pasek-dolny button[data-ekran]')
    .forEach(b => b.classList.toggle('wybrany', b.dataset.ekran === nazwa));
  zamknijMenu();
  const tresc = document.getElementById('tresc');
  tresc.innerHTML = '<div class="pusto">Wczytuję…</div>';
  window.scrollTo(0, 0);
  try {
    await ekran.rysuj(tresc, parametry || {});
  } catch (e) {
    tresc.innerHTML = `<div class="karta"><h2>Nie udało się wczytać</h2>
      <p class="slaby">${escHtml(poLudzku(e))}</p>
      <button class="glowny" onclick="pokazEkran('${nazwa}')">Spróbuj ponownie</button></div>`;
  }
}

/* Przerysowanie tego, co stoi na widoku, z tymi samymi parametrami
   (np. po powrocie połączenia z programem — ta sama trasa, nie pulpit). */
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

/* Nasze miejsca pobieramy ŚWIEŻO za każdym razem, gdy ma się z nich wybierać.

   Lista jest krótka (kilka pozycji), więc to nic nie kosztuje — a trzymanie jej
   w pamięci raz na sesję kończyło się tym, że po skasowaniu albo połączeniu
   magazynów biuro dalej widziało w trasie stan sprzed zmiany. Kopia w pamięci
   służy już tylko na wypadek braku sieci.                                     */
async function odswiezLokalizacje() {
  try {
    stan.lokalizacje = await API.get('/api/lokalizacje');
  } catch (e) {
    stan.lokalizacje = stan.lokalizacje || [];      // bez sieci zostaje kopia
  }
  return stan.lokalizacje;
}

async function wczytajSlowniki() {
  try {
    // Lokalizacje sa tu razem z klientami, bo okno dodawania punktow do trasy
    // musi je miec ZAWSZE — takze po odswiezeniu strony wprost na ekranie trasy,
    // z pominieciem pulpitu. Kierowca ich nie pobierze (endpoint jest dla biura),
    // wiec brak uprawnien traktujemy jak pusta liste, a nie jak awarie.
    const [klienci, pojazdy, ustawienia, lokalizacje] = await Promise.all([
      API.get('/api/klienci'), API.get('/api/pojazdy'), API.get('/api/ustawienia'),
      API.get('/api/lokalizacje').catch(() => []),
    ]);
    stan.klienci = klienci; stan.pojazdy = pojazdy; stan.ustawienia = ustawienia;
    stan.lokalizacje = lokalizacje;
    await Kolejka.zapamietaj('slowniki', { klienci, pojazdy, ustawienia, lokalizacje });
  } catch (e) {
    const kopia = await Kolejka.przypomnij('slowniki');
    if (kopia) {
      stan.klienci = kopia.klienci; stan.pojazdy = kopia.pojazdy; stan.ustawienia = kopia.ustawienia;
      stan.lokalizacje = kopia.lokalizacje || [];
      komunikat('Brak połączenia — pracuję na danych z ostatniej synchronizacji');
    } else {
      stan.klienci = []; stan.pojazdy = []; stan.ustawienia = {}; stan.lokalizacje = [];
      komunikat('Brak połączenia i brak kopii danych w telefonie', 'blad');
    }
  }
}

function powodyNieudanych() {
  return (stan.ustawienia.powody_nieudanych || '')
    .split('\n').map(s => s.trim()).filter(Boolean);
}

/* Przegladarki wpuszczaja tryb offline (service worker) tylko na localhost
   albo po HTTPS. Pod zwyklym http://192.168… jest wylaczony i nie da sie tego
   obejsc — wiec zamiast po cichu nie dzialac, mowimy o tym wprost.          */
function trybOffline() {
  if (!('serviceWorker' in navigator)) {
    return {
      pelny: false,
      opis: 'ograniczony',
      wyjasnienie: 'Aplikacja trzyma potwierdzenia bez zasięgu i wysyła je po powrocie, ' +
        'ale musi być otwarta od wyjazdu. Otwórz ją jeszcze na firmowym wifi. ' +
        'Pełną pracę bez zasięgu włącza dopiero adres z https:// — patrz instrukcja.',
    };
  }
  return {
    pelny: true,
    opis: 'pełny',
    // „urządzenia”, nie „telefonu” — to samo okno widzi biuro na komputerze.
    wyjasnienie: 'Aplikacja otwiera się i działa bez zasięgu, także po ponownym ' +
      'uruchomieniu urządzenia.',
  };
}

/* ---------------------------------------------------------------- konto */

/* Trzy stemple wersji w jednym miejscu: pliki na dysku serwera, skrypt
   wczytany do przeglądarki i arkusz wczytany do przeglądarki. Gdy się różnią,
   przeglądarka chodzi na starej kopii — i to widać od razu, bez zgadywania.
   Do tego kilka żywych liczb o warstwach okna, bo mapa nad oknem wracała
   czterokrotnie i za każdym razem brakowało właśnie tych danych.           */
/* Wersja dla ludzi bez starego przedrostka („wersja 1c7d263b2ed1”, nie trasex-…). */
function wersjaDlaLudzi(w) {
  return String(w || '?').replace(/^(trasex|gk-trasy)-/, '');
}

/* Stopka okna konta: sama wersja. Ramka z trzema stemplami i warstwami okna
   (stempelWersji) jest diagnostyką — widzi ją tylko administrator; reszta
   dostaje ją wyłącznie wtedy, gdy przeglądarka ma starą kopię (z przyciskiem). */
function stopkaWersji() {
  const skrypt = (typeof WERSJA_SKRYPTU === 'string') ? WERSJA_SKRYPTU : stan.uz.wersja;
  // Pełna wersja techniczna w podpowiedzi (title) — dla serwisu, jak w hali (aktualizacja.js → wpiszWersje).
  return `<p class="konto-drobne wersja-stopka" title="${escHtml(`program ${stan.uz.wersja || '?'} · aplikacja ${skrypt}`)}">wersja ${escHtml(wersjaDlaLudzi(skrypt))}</p>`;
}

function stempelWersji() {
  const dysk = stan.uz.wersja || '?';
  const skrypt = (typeof WERSJA_SKRYPTU === 'string') ? WERSJA_SKRYPTU : '?';
  const arkusz = (getComputedStyle(document.documentElement)
    .getPropertyValue('--wersja-arkusza') || '?').replace(/['"\s]/g, '') || '?';
  // Na GitHub Pages wygląd i program w biurze to dwie niezależne kopie —
  // o spójności przeglądarki mówią wtedy tylko skrypt i arkusz z jednej paczki.
  const osobneAdresy = !!API_BAZA;
  const zgodne = osobneAdresy ? skrypt === arkusz : (dysk === skrypt && dysk === arkusz);
  const pagesStarsze = osobneAdresy && zgodne && dysk !== '?' && dysk !== skrypt;
  if (!jestAdministratorem()) {
    return zgodne ? '' : `
    <div class="wstega blad" id="stempel-wersji" style="margin-top:10px">
      <b>Przeglądarka ma starą kopię programu</b>
      <button class="maly" id="btn-odswiez-program" style="margin-top:8px">Odśwież program</button>
    </div>`;
  }
  // Wszystko zgodne: administrator dostaje stemple zwinięte pod „wersja X”, a nie
  // niebieską ramkę w środku okna konta (STYL-GK §3: na dole samo „wersja X”).
  if (zgodne && !pagesStarsze) {
    return `<details class="konto-wersja" id="stempel-wersji"><summary>Szczegóły wersji</summary>
      ${osobneAdresy ? 'program w biurze' : 'pliki na dysku'}: <code>${escHtml(dysk)}</code><br>
      skrypt w przeglądarce: <code>${escHtml(skrypt)}</code><br>
      arkusz w przeglądarce: <code>${escHtml(arkusz)}</code><br>
      ${osobneAdresy ? `aplikacja z GitHub Pages, dane: <code>${escHtml(API_BAZA)}</code><br>` : ''}
      warstwa okna: <code id="stempel-warstwa">…</code></details>`;
  }
  return `
    <div class="wstega ${zgodne ? 'info' : 'blad'}" id="stempel-wersji" style="margin-top:10px">
      <b>${zgodne ? 'Program aktualny' : 'Przeglądarka ma starą kopię programu'}</b>
      <div class="male" style="margin-top:6px; font-weight:400">
        ${osobneAdresy ? 'program w biurze' : 'pliki na dysku'}: <code>${escHtml(dysk)}</code><br>
        skrypt w przeglądarce: <code>${escHtml(skrypt)}</code><br>
        arkusz w przeglądarce: <code>${escHtml(arkusz)}</code><br>
        ${osobneAdresy ? `aplikacja z GitHub Pages, dane: <code>${escHtml(API_BAZA)}</code><br>` : ''}
        warstwa okna: <code id="stempel-warstwa">…</code>
      </div>
      ${pagesStarsze ? `<div class="male" style="margin-top:6px">Na GitHub Pages jest inna wersja
        aplikacji niż program w biurze. Nową wersję wysyła sam Panel Kierownika — stan:
        Ustawienia → Zaawansowane → Adres dla telefonów (GitHub Pages).</div>` : ''}
      ${zgodne ? '' : `<button class="maly" id="btn-odswiez-program" style="margin-top:8px">
        Odśwież program</button>`}
    </div>`;
}

/* Czyści pamięć podręczną aplikacji i wczytuje ją od nowa. Dane firmy są na
   serwerze, a niewysłane zapisy w IndexedDB — tego NIE ruszamy. */
/* Trzy stemple muszą być zgodne: pliki na dysku, skrypt i arkusz w przeglądarce.
   Gdy nie są, przeglądarka chodzi na MIESZANCE wersji — a to potrafi się zdarzyć
   przy jednym mrugnięciu sieci, bo service worker podaje wtedy pojedynczy plik
   z kopii. Taka mieszanka niczego nie zgłasza: stary i nowy plik parsują się
   tak samo poprawnie, aplikacja po prostu zachowuje się nie tak, jak w kodzie.
   Dlatego program naprawia to sam, raz na sesję — bez proszenia o cokolwiek. */
async function sprawdzSpojnoscWersji() {
  const dysk = (stan.uz && stan.uz.wersja) || '';
  if (!dysk || dysk === '?') return;
  const skrypt = (typeof WERSJA_SKRYPTU === 'string') ? WERSJA_SKRYPTU : '';
  const arkusz = (getComputedStyle(document.documentElement)
    .getPropertyValue('--wersja-arkusza') || '').replace(/['"\s]/g, '');

  // API_BAZA niepuste: wygląd z GitHub Pages, dane z programu w biurze — dwie
  // NIEZALEŻNE kopie. Rozjazd z programem znaczy wtedy „biuro nie wysłało nowej
  // wersji”, a nie „przeglądarka ma mieszankę”. Kasowanie pamięci niczego by
  // nie naprawiło, a przeładowanie w kółko zostawiłoby kierowcę bez aplikacji.
  // Mieszankę poznaje się wtedy po dwóch plikach z TEJ SAMEJ paczki.
  const osobneAdresy = !!API_BAZA;
  const mieszanka = (skrypt !== arkusz) || (!osobneAdresy && dysk !== skrypt);
  if (!mieszanka) {
    // O nieopublikowanej wersji mówimy temu, kto może to naprawić — kierowca
    // nie ma dostępu do Ustawień i dostałby ostrzeżenie bez wyjścia.
    if (osobneAdresy && dysk !== skrypt && jestAdministratorem()) {
      komunikat('Na GitHub Pages jest inna wersja aplikacji niż program w biurze. '
        + 'Nową wersję wysyła sam Panel Kierownika — stan: Ustawienia → Zaawansowane → Adres dla telefonów '
        + '(GitHub Pages).', 'blad');
    }
    return;
  }
  // Bez zasięgu kasowanie pamięci podręcznej jest nie do odrobienia: po
  // przeładowaniu nie ma skąd wziąć plików i kierowca zostaje ze stroną błędu.
  if (!navigator.onLine) {
    komunikat('Program chodzi na mieszance wersji. Naprawię to przy najbliższym '
      + 'zasięgu — na razie pracuj dalej.', 'blad');
    return;
  }

  // sessionStorage też jest wspólny dla całego źródła Pages — stąd przedrostek.
  const klucz = Pamiec.PRZEDROSTEK + 'naprawa-wersji';
  const proba = osobneAdresy ? skrypt + '|' + arkusz : dysk;
  let juzProbowano = false;
  try { juzProbowano = sessionStorage.getItem(klucz) === proba; } catch (e) { /* tryb prywatny */ }
  if (juzProbowano) {
    // Druga próba nic nie da — mówimy wprost zamiast kręcić się w kółko.
    komunikat('Przeglądarka chodzi na mieszance wersji programu. '
      + 'Otwórz Moje konto (ikona osoby u góry) i pokaż tę ramkę serwisantowi.', 'blad');
    return;
  }
  try { sessionStorage.setItem(klucz, proba); } catch (e) { /* trudno */ }
  komunikat('Porządkuję pliki programu — chwila…', 'ok');
  await odswiezProgram();
}

/* Kasuje TYLKO własny service worker i własne pamięci podręczne (trasex-…).
   Na wspólnym źródle GitHub Pages leżą obok nich te z GK Flota i aplikacji
   hali — skasowanie wszystkiego zabrałoby kierowcy offline w innym programie. */
async function odswiezProgram() {
  try {
    if ('serviceWorker' in navigator) {
      // getRegistration() bez adresu = worker TEJ strony. Lista wszystkich
      // rejestracji oddałaby workery wszystkich aplikacji GK na wspólnym źródle Pages.
      const nasz = await navigator.serviceWorker.getRegistration();
      if (nasz) await nasz.unregister();
    }
    if (window.caches) {
      const klucze = await caches.keys();
      await Promise.all(klucze.filter(k => k.indexOf('trasex-') === 0).map(k => caches.delete(k)));
    }
  } catch (e) { /* i tak przeladujemy */ }
  location.reload();
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
  ile.textContent = stan.wKolejce;
  wyslij.parentNode.classList.toggle('ukryty', !(stan.wKolejce > 0));
}

/* ------------------------------------------------ D65: kody QR aplikacji GK

   Ten sam przycisk i to samo okno co w aplikacjach hali (STYL-GK §3, hala:
   konto.js → aplikacjeNaTelefon): aplikacje osoby z kodem QR, „🖨 Drukuj kod”
   przy aplikacji i „🖨 Drukuj wszystkie”. Listę daje Panel Kierownika (hub,
   GK-KONTA.md §3.6) przez program — tylko konto z Panelu (zrodlo 'gk'). Kody
   rysuje serwer programu (qr_svg), więc okno działa bez biblioteki QR.     */
function naKomputerze() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(min-width:821px)').matches;
}
function napisKodowQR() {
  return naKomputerze() ? '📱 Kody QR aplikacji' : '📱 Aplikacje na telefon — kody QR';
}
function maKodyQR() { return !!stan.uz && stan.uz.zrodlo === 'gk'; }

/* Arkusz A4 do druku — ten sam układ co w hali (konto.js → arkuszKodow). */
function arkuszKodowQR(lista) {
  const karty = (lista || []).filter(a => a && a.qr).map(a => `<section class="karta">
      <div class="qr">${a.qr}</div>
      <div class="opis"><h2>${escHtml(a.nazwa)}</h2>
        <p>Zeskanuj aparatem telefonu, otwórz stronę i dodaj ją do ekranu głównego.</p>
        ${a.opis ? `<p>${escHtml(a.opis)}</p>` : ''}
        ${!a.adres && a.siec ? '<p class="uwaga">Działa tylko w firmowym wifi.</p>' : ''}
        ${/^https:\/\/[^/]+\.github\.io\//.test(a.adres || '') ? ''
          : '<p class="uwaga">Adres tymczasowy — po ponownym uruchomieniu programu wydrukuj ten kod jeszcze raz.</p>'}
        <p class="adres">${escHtml(a.adres || a.siec)}</p></div></section>`).join('');
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Kody QR aplikacji GK</title><style>
      @page { size: A4; margin: 12mm; }
      body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #111; background: #fff; }
      .arkusz { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
      .karta { display: grid; grid-template-rows: auto 1fr; justify-items: center; gap: 3mm; padding: 5mm; border: .3mm dashed #888;
               break-inside: avoid; page-break-inside: avoid; text-align: center; }
      .qr svg { display: block; width: 55mm; height: 55mm; }
      h2 { margin: 0 0 2mm; font-size: 16pt; }
      p { margin: 0 0 1.5mm; font-size: 9pt; line-height: 1.3; }
      .uwaga { font-weight: 700; }
      .adres { font-family: Consolas, monospace; font-size: 7.5pt; overflow-wrap: anywhere; color: #444; }
    </style></head><body><div class="arkusz">${karty}</div></body></html>`;
}

/* Druk arkusza w ukrytej ramce (jak w hali) — bez własnego CSS druku programu. */
function drukujArkuszQR(html) {
  const ramka = document.createElement('iframe');
  ramka.setAttribute('aria-hidden', 'true');
  ramka.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  const sprzatnij = () => setTimeout(() => ramka.remove(), 1000);
  ramka.onload = () => {
    const w = ramka.contentWindow;
    w.addEventListener('afterprint', sprzatnij);
    w.focus();
    w.print();
    setTimeout(() => { if (ramka.isConnected) ramka.remove(); }, 120000);
  };
  ramka.srcdoc = html;
  document.body.appendChild(ramka);
}

function oknoKodowAplikacji() {
  let lista = [];
  okno({
    tytul: naKomputerze() ? '📱 Kody QR aplikacji' : '📱 Aplikacje na telefon',
    konto: true,
    tresc: `<p class="konto-drobne">Zeskanuj kod aparatem telefonu, otwórz stronę i dodaj ją do ekranu
        głównego. Aplikacje hali, GK Trasy i GK Flota — konto GK (imię i nazwisko, hasło, potem PIN);
        inne logowanie jest opisane przy aplikacji.</p>
      <div class="kody-aplikacji" id="kody-aplikacji"><p class="konto-drobne">Wczytuję…</p></div>`,
    // Jak w każdym oknie GK (2026-10-16): drugorzędny „Zamknij” obrysowany po lewej,
    // główne działanie (grafit) po prawej — „Zamknij” nigdy nie jest wypełnione.
    przyciski: [
      { napis: 'Zamknij', klik: z => z() },
      { napis: '🖨 Drukuj wszystkie', klasa: 'glowny ukryty', klik: () => drukujArkuszQR(arkuszKodowQR(lista)) },
    ],
    poOtwarciu: async pole => {
      const el = pole.querySelector('#kody-aplikacji');
      try {
        lista = (await API.get('/api/aplikacje-gk')).aplikacje || [];
      } catch (e) {
        if (el.isConnected) el.innerHTML = `<p class="blad-ustawienia">${escHtml(poLudzku(e))}</p>`;
        return;
      }
      if (!el.isConnected) return;               // okno zamknięte w trakcie
      el.innerHTML = lista.map((a, i) => `<figure class="kod-aplikacji">
          ${a.qr ? `<div class="kod-aplikacji-qr">${a.qr}</div>`
                 : `<div class="kod-aplikacji-qr brak">${a.komputer ? '💻' : '—'}</div>`}
          <figcaption><b>${escHtml(a.nazwa)}</b>
            ${a.adres || a.siec ? `<a href="${escHtml(a.adres || a.siec)}" target="_blank" rel="noopener">${escHtml(a.adres || a.siec)}</a>` : ''}
            ${!a.adres && a.siec ? '<span class="konto-drobne">Tylko w firmowym wifi.</span>' : ''}
            ${a.opis ? `<span class="konto-drobne">${escHtml(a.opis)}</span>` : ''}
            ${a.qr ? `<button type="button" data-drukuj="${i}">🖨 Drukuj kod</button>` : ''}</figcaption></figure>`).join('')
        || '<p class="konto-drobne">To konto nie ma aplikacji na telefon.</p>';
      el.querySelectorAll('[data-drukuj]').forEach(b =>
        b.onclick = () => drukujArkuszQR(arkuszKodowQR([lista[+b.dataset.drukuj]])));
      const wszystkie = [...document.querySelectorAll('#okno-stopka button')]
        .find(b => b.textContent === '🖨 Drukuj wszystkie');
      if (wszystkie && lista.some(a => a.qr)) wszystkie.classList.remove('ukryty');
    },
  });
}

/* ------------------------------------------------ D65: pasek połączenia

   Kropka w nagłówku zostaje, ale jej podpowiedź (title) jest na telefonie
   niewidoczna. Pod nagłówkiem pasek z tekstem — te same słowa i odmiana co
   w aplikacjach hali (hala.js → Hala.pasekPolaczenia). Przy „wszystko
   wysłane” go nie ma. Dotknięcie → Moje konto (lista „Nie wysłane”).      */
/* „telefonie” / „urządzeniu” — STYL-GK §6: na komputerze nie piszemy „telefon”.
   Jedno miejsce dla paska, kropki, dymków i pytań (2026-10-16). */
function slowoUrzadzenia(przypadek, komputer) {
  const k = komputer === undefined ? naKomputerze() : komputer;
  if (przypadek === 'dopelniacz') return k ? 'tego urządzenia' : 'telefonu';
  if (przypadek === 'miejscownik') return k ? 'tym urządzeniu' : 'tym telefonie';
  return k ? 'urządzeniu' : 'telefonie';
}

/* Podpowiedź kropki w nagłówku — te same słowa i odmiana co pasek (R5, R6 2026-10-16;
   dawniej „2 zapisy czeka” i „telefon” na komputerze). */
function tytulKropkiSieci({ online, wKolejce, odrzucone, bezPamieci, komputer }) {
  const n = wKolejce || 0;
  if (bezPamieci) return `Pamięć ${slowoUrzadzenia('dopelniacz', komputer)} nie odpowiada — dotknij ikony konta`;
  if (odrzucone) {
    return `${odrzucone} ${odmiana(odrzucone, 'zapis nie przeszedł', 'zapisy nie przeszły',
      'zapisów nie przeszło')} — dotknij ikony konta`;
  }
  if (!online) {
    return n ? `Brak sieci — ${n} ${odmiana(n, 'zapis czeka', 'zapisy czekają', 'zapisów czeka')} na wysłanie`
      : `Brak sieci — zapisy zostają w ${slowoUrzadzenia('', komputer)}`;
  }
  return n ? `${n} ${odmiana(n, 'zapis', 'zapisy', 'zapisów')} w wysyłce` : 'Połączono';
}

function tekstPaskaPolaczenia({ online, wKolejce, odrzucone, komputer, serwer }) {
  const n = wKolejce || 0;
  const czeka = `${n} ${odmiana(n, 'zapis czeka', 'zapisy czekają', 'zapisów czeka')} na wysłanie`;
  const czesci = [];
  let klasa = 'ok';
  if (!online) {
    klasa = 'offline';
    czesci.push(`Brak sieci — ${n ? czeka : `zapisy zostają w ${slowoUrzadzenia('', komputer)}`}`);
  } else if (serwer === false) {
    // Sieć jest, programu w biurze nie ma (restart komputera, tunel) — jak hala „brak-huba”.
    klasa = 'brak-serwera';
    czesci.push(`Brak połączenia z serwerem${n ? ` — ${czeka}` : ''}`);
  } else if (n) {
    klasa = 'kolejka';
    czesci.push(`Wysyłanie: ${n}`);
  }
  if (odrzucone) { klasa = 'odrzucone'; czesci.push(`Nie wysłane: ${odrzucone} — dotknij`); }
  return { klasa, tekst: czesci.join(' · ') };
}
function odswiezPasekPolaczenia() {
  const el = document.getElementById('pasek-polaczenia');
  if (!el) return;
  const p = tekstPaskaPolaczenia({ online: stan.online, wKolejce: stan.wKolejce,
    odrzucone: stan.odrzucone, komputer: naKomputerze(), serwer: !stan.bezSerwera });
  el.className = 'pasek-polaczenia ' + p.klasa;
  el.textContent = p.tekst;
  el.hidden = !p.tekst;
}

/* „Moje konto” w układzie okna konta aplikacji hali (konto.js → HalaKonto.mojeKonto):
   osoba i rola → Wygląd → Zmień hasło/PIN (formularz rozwija się w oknie) →
   Powiadomienia → Dane w tym urządzeniu → wersja → Zamknij + Wyloguj na dole. */
function oknoKonta() {
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
      ${trescZmianySekretu(zmien)}
      ${maKodyQR() ? `<button type="button" class="konto-aplikacje" id="btn-kody-qr">${napisKodowQR()}</button>` : ''}
      <fieldset><legend>Powiadomienia</legend>
        <p class="konto-drobne">${jestBiuro()
          ? 'Nieudana dostawa i raport z usterkami — od razu, także przy zamkniętej aplikacji.'
          : 'Nowa albo zmieniona trasa na dziś i jutro oraz uwagi od biura — także przy zamkniętej aplikacji.'}</p>
        <div id="push-konto" class="konto-push"><p class="konto-drobne">Sprawdzam…</p></div>
        ${poleDzwieku()}
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
      // Przełącza się od razu, bez zamykania okna: cały wygląd wisi na jednym
      // atrybucie <html>, więc nie ma czego przerysowywać.
      const pigulki = pole.querySelectorAll('[data-wyglad]');
      pigulki.forEach(b => b.onclick = () => {
        Motyw.ustaw(b.dataset.wyglad);
        pigulki.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      });
      const kodyQR = pole.querySelector('#btn-kody-qr');
      if (kodyQR) kodyQR.onclick = oknoKodowAplikacji;
      podepnijZmianeSekretu(pole);
      rysujPowiadomienia(pole.querySelector('#push-konto'));
      podepnijDzwiek(pole);
      pokazKolejkeWKoncie(pole);
      if (stan.obceWKolejce) {
        pole.querySelector('#obce-w-kolejce').innerHTML =
          `⚠️ Dodatkowo <b>${stan.obceWKolejce}</b> ${odmiana(stan.obceWKolejce,
            'zapis czeka', 'zapisy czekają', 'zapisów czeka')} na inną osobę,
           która pracowała na tym urządzeniu. Wyślą się, gdy ta osoba się tu zaloguje —
           nie kasuj danych aplikacji, bo przepadną.`;
      }
      rysujOdrzucone(pole.querySelector('#odrzucone-zapisy'));
      pole.querySelector('#btn-wyslij-teraz').onclick = async () => {
        await synchronizuj(false);
        pokazKolejkeWKoncie(pole);
      };
      const odswiez = pole.querySelector('#btn-odswiez-program');
      if (odswiez) odswiez.onclick = odswiezProgram;
      // liczone teraz, gdy okno JUZ jest otwarte — wczesniej zawsze pokazywalo „brak"
      const warstwa = pole.querySelector('#stempel-warstwa');
      if (warstwa) {
        const st = getComputedStyle(document.getElementById('okno-tlo'));
        const mapa = document.querySelector('.leaflet-container');
        warstwa.textContent = `${st.position} / z-index ${st.zIndex}`
          + ` · body: ${document.body.classList.contains('okno-otwarte') ? 'okno-otwarte' : 'brak'}`
          + (mapa ? ` · mapa: ${getComputedStyle(mapa).visibility}` : ' · mapy brak na ekranie');
      }
    },
  });
}

/* Dźwięk w Moim koncie → Powiadomienia (2026-10-16, ten sam układ w GK Flota):
   zdanie, przełącznik „Dźwięk powiadomień: włączony/wyłączony” (aria-pressed)
   i „Sprawdź dźwięki” — info → pilne → awaria, żeby człowiek usłyszał, czym
   różni się zwykła wiadomość od pilnej, zanim zadzwoni naprawdę. */
function poleDzwieku() {
  return `<p class="konto-drobne">Przy otwartej aplikacji nowa sprawa daje dźwięk — w tym urządzeniu.</p>
    <div class="przyciski-konta">
      <button type="button" id="btn-dzwiek" aria-pressed="${Dzwiek.wlaczony()}">${napisDzwieku()}</button>
      <button type="button" id="btn-sprawdz-dzwieki">Sprawdź dźwięki</button>
    </div>`;
}
function napisDzwieku() {
  return Dzwiek.wlaczony() ? '🔔 Dźwięk powiadomień: włączony' : '🔕 Dźwięk powiadomień: wyłączony';
}
const PROBA_DZWIEKOW = [['info', 0], ['pilne', 1100], ['awaria', 3200]];
function podepnijDzwiek(pole) {
  const przelacz = pole.querySelector('#btn-dzwiek');
  const sprawdz = pole.querySelector('#btn-sprawdz-dzwieki');
  if (przelacz) przelacz.onclick = () => {
    Dzwiek.ustaw(!Dzwiek.wlaczony());
    przelacz.textContent = napisDzwieku();
    przelacz.setAttribute('aria-pressed', String(Dzwiek.wlaczony()));
    if (Dzwiek.wlaczony()) Dzwiek.zagraj('info');
  };
  if (sprawdz) sprawdz.onclick = () => {
    if (!Dzwiek.wlaczony()) { komunikat('Dźwięk powiadomień jest wyłączony — włącz go obok', 'uwaga'); return; }
    PROBA_DZWIEKOW.forEach(([rodzaj, po]) => setTimeout(() => Dzwiek.zagraj(rodzaj), po));
  };
}

/* Zmiana sekretu w „Moim koncie”. Konto z Panelu w D43 (hasło + PIN, GK-KONTA.md
   §7, STYL-GK §3): dwa przyciski „Zmień hasło” i „Zmień PIN”, każdy rozwija swój
   formularz. Inne konta (tutejsze, Panel sprzed D43): jeden sekret jak dawniej —
   biuro „Zmień hasło”, kierowca „Zmień PIN”. */
function trescZmianySekretu(zmien) {
  if (stan.uz.d43) {
    return `<div class="przyciski-konta" id="zmiany-d43">
        <button type="button" id="btn-pokaz-haslo">Zmień hasło</button>
        <button type="button" id="btn-pokaz-pin">Zmień PIN</button>
      </div>
      <fieldset id="zmiana-hasla" class="ukryty"><legend>Zmień hasło</legend>
        <p class="konto-drobne">To hasło działa we wszystkich aplikacjach GK. Wpisujesz je raz na 16 godzin
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
      <fieldset id="zmiana-pinu" class="ukryty"><legend>Zmień PIN</legend>
        <p class="konto-drobne">Ten PIN działa we wszystkich aplikacjach GK — na urządzeniu, na którym w ciągu
          16 godzin wpisano hasło. Inne zalogowane urządzenia trzeba będzie zalogować od nowa.</p>
        <label>Obecne hasło albo PIN<input id="zp-stary" type="password" autocomplete="current-password" maxlength="128"></label>
        <label>Nowy PIN (4 cyfry)<input id="zp-nowy" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4"></label>
        <label>Powtórz nowy PIN<input id="zp-powtorz" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4"></label>
        <p class="blad-ustawienia" id="zp-blad" role="alert"></p>
        <div class="przyciski">
          <button type="button" data-anuluj>Anuluj</button>
          <button type="button" class="glowny" id="btn-zmien-pin">Zmień PIN</button>
        </div>
      </fieldset>`;
  }
  return `<div><button type="button" id="btn-pokaz-zmiane">${zmien}</button></div>
      <fieldset id="zmiana-pinu" class="ukryty"><legend>${zmien}</legend>
        ${pinZPanelu() ? `<p class="konto-drobne">Konto z Panelu (GK Panel Kierownika) —
          ${jestBiuro() ? 'nowe hasło działa' : 'nowy PIN działa'} we wszystkich aplikacjach GK.</p>` : ''}
        <label>${jestBiuro() ? 'Obecne hasło' : 'Obecny PIN'}<input id="pin-stary" type="password"
               inputmode="${trybKlawiaturyPinu()}" autocomplete="current-password" maxlength="128"></label>
        <label>${opisNowegoPinu()}<input id="pin-nowy" type="password"
               inputmode="${trybKlawiaturyPinu()}" autocomplete="new-password" maxlength="128"></label>
        <div class="przyciski">
          <button type="button" id="btn-anuluj-zmiane">Anuluj</button>
          <button type="button" class="glowny" id="btn-zmien-pin">${zmien}</button>
        </div>
      </fieldset>`;
}

/* Nowy token (i znacznik) po zmianie sekretu — stare sesje przepadły, także ta. */
function przejmijPoZmianie(w) {
  if (w.token) { stan.token = w.token; Pamiec.zapisz('token', w.token); }
  if (w.znacznik) Znaczniki.zapamietaj([stan.uz.login, stan.uz.imie], w.znacznik, w.znacznik_do);
}

function podepnijZmianeSekretu(pole) {
  if (stan.uz.d43) {
    const przyciski = pole.querySelector('#zmiany-d43');
    const formularze = { haslo: pole.querySelector('#zmiana-hasla'), pin: pole.querySelector('#zmiana-pinu') };
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
    pole.querySelector('#btn-zmien-pin').onclick = async () => {
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
    return;
  }
  // „Zmień hasło” to przycisk; formularz rozwija się dopiero po nim (jak w hali).
  const formularz = pole.querySelector('#zmiana-pinu');
  const pokaz = pole.querySelector('#btn-pokaz-zmiane');
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
  pole.querySelector('#btn-zmien-pin').onclick = async () => {
    const stary = pole.querySelector('#pin-stary').value;
    const nowy = pole.querySelector('#pin-nowy').value;
    const w = await sprobuj(() => API.post('/api/zmien-pin', { stary, nowy }),
      `${jestBiuro() ? 'Hasło zmienione' : 'PIN zmieniony'} — pozostałe urządzenia zostały wylogowane`);
    if (!w) return;
    // Zmiana hasła unieważnia stare sesje, więc trzeba przejąć nowy token,
    // inaczej wyrzuciłoby z aplikacji osobę, która właśnie ją zmieniła.
    if (w.token) { stan.token = w.token; Pamiec.zapisz('token', w.token); }
    zamknijOkno();
  };
}

/* Zapisy, ktorych serwer nie przyjal. Nie kasujemy ich za czlowieka —
   pokazujemy, co i dlaczego nie przeszlo, i zostawiamy decyzje jemu.        */
async function rysujOdrzucone(pole) {
  const lista = await Kolejka.listaOdrzuconych();
  if (!lista.length) { pole.innerHTML = ''; return; }

  const opis = (o) => {
    if (o.typ === 'dostawa') {
      const zalaczniki = (o.podpis ? 1 : 0) + ((o.zdjecia || []).length);
      return `Dostawa (punkt ${o.przystanek})`
        + (zalaczniki ? ` · ${zalaczniki} ${odmiana(zalaczniki, 'załącznik', 'załączniki', 'załączników')}` : '');
    }
    if (o.typ === 'raport') return `Raport pracy z ${polskaData(o.data)}`;
    if (o.typ === 'pozycje') return 'Ślad GPS';
    if (o.typ === 'stan_trasy') return 'Rozpoczęcie/zakończenie trasy';
    if (o.typ === 'zaladunek') return `Załadunek (punkt ${o.przystanek})`;
    if (o.typ === 'zdjecie_ladunku') return 'Zdjęcie ładunku';
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
        <div class="male slaby">zapisane ${escHtml(czasZIso(o.dodano))}</div>
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
      `Zniknie z ${slowoUrzadzenia('dopelniacz')} na dobre. Jeśli był w nim podpis albo zdjęcia — nie da się ich odzyskać.`)) return;
    await Kolejka.zapomnijOdrzucona(b.dataset.porzuc);
    await odswiezStanSieci();
    await rysujOdrzucone(pole);
  });
}

/* ----------------------------------------------------------------- start */

async function uruchom() {
  const formularz = document.getElementById('form-logowania');
  stan.poleLogowania = poleSekretu({ ident: document.getElementById('pole-loginu'),
                                     sekret: document.getElementById('pole-sekretu'),
                                     etykieta: document.getElementById('etykieta-sekretu'),
                                     przelacz: document.getElementById('przelacz-sekret') });
  formularz.onsubmit = async e => {
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

  // D65: ☰ już nie w nagłówku, tylko „Więcej” na dolnym pasku (menuDlaRoli).
  const przyciskMenu = document.getElementById('btn-menu');
  if (przyciskMenu) przyciskMenu.onclick = otworzMenu;
  document.getElementById('pasek-polaczenia').onclick = oknoKonta;
  document.getElementById('zaslona').onclick = zamknijMenu;
  document.getElementById('okno-zamknij').onclick = zamknijZPytaniem;
  document.getElementById('okno-tlo').onclick = e => {
    if (e.target.id === 'okno-tlo') zamknijZPytaniem();
  };
  document.getElementById('btn-konto').onclick = oknoKonta;
  // Podpowiedź w atrybucie title jest na telefonie niewidzialna, a to właśnie
  // kierowca ma się dowiedzieć, że coś nie przeszło. Kropka musi być klikalna.
  document.getElementById('stan-sieci-btn').onclick = oknoKonta;
  document.getElementById('btn-szukaj').onclick = oknoSzukania;
  document.getElementById('btn-wyloguj').onclick = () => wyloguj();
  document.querySelectorAll('.menu button[data-ekran]').forEach(b =>
    b.onclick = () => pokazEkran(b.dataset.ekran));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') zamknijZPytaniem(); });

  /* „Jak w telefonie” ma nadążyć, gdy telefon sam przełączy się o zmierzchu
     przy otwartej aplikacji. addListener to wersja dla starszych przeglądarek. */
  try {
    const czujnik = window.matchMedia('(prefers-color-scheme: dark)');
    if (czujnik.addEventListener) czujnik.addEventListener('change', () => Motyw.zastosuj());
    else if (czujnik.addListener) czujnik.addListener(() => Motyw.zastosuj());
  } catch (e) { /* bez tego motyw po prostu nie zmieni się w locie */ }

  window.addEventListener('online', () => { odswiezStanSieci(); synchronizuj(); });
  window.addEventListener('offline', odswiezStanSieci);
  setInterval(() => { if (navigator.onLine) { synchronizuj(); sprawdzZdarzenia(); } }, 25000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) { synchronizuj(); sprawdzZdarzenia(); }
  });

  if ('serviceWorker' in navigator) {
    /* Aplikacja sama bierze nową wersję.

       Bez tego poprawka mogła leżeć na dysku, a przeglądarka i telefon dalej
       chodziły na starej kopii — i tak właśnie dwa razy „nie zadziałała"
       poprawka układu mapy. Service worker po instalacji nowej wersji przejmuje
       stronę (skipWaiting + clients.claim w sw.js), a wtedy przeglądarka zgłasza
       controllerchange. Wtedy przeładowujemy stronę DOKŁADNIE RAZ — strażnik
       przeladowano pilnuje, żeby nie wpaść w pętlę odświeżania.               */
    let przeladowano = false;
    // Przy PIERWSZEJ instalacji też pada controllerchange, choć nic się nie
    // zmieniło w plikach — przeładowanie byłoby wtedy tylko mignięciem ekranu.
    // Odświeżamy więc tylko wtedy, gdy stronę prowadził już jakiś worker.
    // NIE stała z chwili startu (jak hala, aktualizacja.js → prowadzona): karta
    // otwarta bez workera (pierwsze wejście, Ctrl+Shift+R) dostaje go przy
    // pierwszym controllerchange i od tej chwili każda następna zmiana to już
    // nowa wersja. Dawniej taka karta nie brała żadnej poprawki do ręcznego odświeżenia.
    let prowadzona = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!prowadzona) { prowadzona = true; return; }
      if (przeladowano) return;
      przeladowano = true;
      przeladujPoNowejWersji();
    });
    // Kursor wyszedl z pola (kierowca skonczyl pisac) — moze juz wolno.
    document.addEventListener('focusout', () => setTimeout(sprobujZaleglegoPrzeladowania, 0));
    // Dotknięcie powiadomienia przy OTWARTEJ aplikacji: sw.js nie otwiera
    // drugiego okna, tylko prosi to o pokazanie właściwego ekranu.
    if (navigator.serviceWorker.addEventListener) {
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.typ === 'otworz') otworzAdres(e.data.adres);
      });
    }
    navigator.serviceWorker.register('sw.js')
      .then(rejestracja => {
        // Sprawdzenie przy każdym wejściu i raz na godzinę dla telefonu,
        // który potrafi zostać otwarty przez cały dzień w busie.
        rejestracja.update().catch(() => {});
        setInterval(() => rejestracja.update().catch(() => {}), 3600 * 1000);
        // I po powrocie na kartę (telefon wyjęty z kieszeni) — jak w hali.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') rejestracja.update().catch(() => {});
        });
      })
      .catch(() => { /* dziala tez bez tego */ });
  }

  await odswiezStanSieci();
  if (stan.token) {
    try {
      stan.uz = await API.get('/api/ja');
      await Kolejka.zapamietaj('profil', stan.uz);
      await wejdzDoAplikacji();
      return;
    } catch (e) {
      // Rozroznienie jest tu najwazniejsze: gdy serwer odrzucil sesje,
      // API.get juz wyczyscilo token i trzeba sie zalogowac. Gdy padla sama
      // siec — token dalej jest dobry, a kierowca stoi w polu i musi wejsc.
      const profil = await Kolejka.przypomnij('profil');
      if (stan.token && profil) {
        stan.uz = profil;
        await wejdzDoAplikacji();
        komunikat(`Brak połączenia — pracujesz na danych z ${slowoUrzadzenia('dopelniacz')}`);
        return;
      }
    }
  }
  pokazLogowanie();
}

/* ------------------------------------------- R9: dźwięk przy OTWARTEJ aplikacji

   Push (sw.js) dzwoni tylko przy zamkniętej aplikacji, a przy otwartej sw.js go nie
   pokazuje — biuro z otwartą kartą nie słyszało nieudanej dostawy. Program w biurze
   odkłada te same zdarzenia na 10 minut (trasex.py → a_zdarzenia), a my pytamy o nie
   co 25 s (razem z wysyłką kolejki) i po powrocie na kartę. Pierwsze pytanie po
   wejściu tylko ustawia numer — start aplikacji niczego nie gra; własnych ruchów
   program nie oddaje (autor zdarzenia). Kilka naraz → jeden dźwięk, najpoważniejszy.
   Trasy: nieudana dostawa / dowód do decyzji → 'pilne', nowa albo zmieniona trasa
   kierowcy → 'info' (rodzaj wybiera program, pole „dzwiek”). */
const WAGA_DZWIEKU = { info: 1, pilne: 2, awaria: 3, zatrzymanie: 4 };
const stanZdarzen = { od: null, wDrodze: false };

function najwazniejszeZdarzenie(lista) {
  return (lista || []).reduce((a, b) =>
    (WAGA_DZWIEKU[b.dzwiek] || 1) > (WAGA_DZWIEKU[a && a.dzwiek] || 0) ? b : a, null);
}

async function sprawdzZdarzenia() {
  if (stanZdarzen.wDrodze || !stan.uz || !stan.token || stan.sesjaWygasla || !navigator.onLine
      || document.hidden) return;
  stanZdarzen.wDrodze = true;
  try {
    const pierwsze = stanZdarzen.od == null;
    const odp = await API.get('/api/zdarzenia' + (pierwsze ? '' : '?od=' + encodeURIComponent(stanZdarzen.od)));
    if (!odp || odp.od == null) return;
    stanZdarzen.od = odp.od;
    const nowe = pierwsze ? [] : (odp.zdarzenia || []);
    const glowne = najwazniejszeZdarzenie(nowe);
    if (!glowne) return;
    Dzwiek.zagraj(WAGA_DZWIEKU[glowne.dzwiek] ? glowne.dzwiek : 'info');
    komunikat((glowne.tytul || 'Nowa sprawa') + (nowe.length > 1 ? ` (+${nowe.length - 1})` : ''),
      glowne.dzwiek === 'info' ? '' : 'uwaga');
    // Bieżący ekran ze świeżymi danymi — ale nie spod palca (otwarte okno, pisanie).
    const ekran = EKRANY[stan.ekran];
    if (ekran && ekran.poSynchronizacji && moznaPrzeladowac()) ekran.poSynchronizacji();
  } catch (e) {
    /* bez programu — następna próba za 25 s */
  } finally {
    stanZdarzen.wDrodze = false;
  }
}

async function wejdzDoAplikacji() {
  document.getElementById('ekran-logowania').classList.add('ukryty');
  document.getElementById('aplikacja').classList.remove('ukryty');
  document.getElementById('menu-imie').textContent = stan.uz.imie;
  document.getElementById('menu-rola').textContent = NAZWA_ROLI[stan.uz.rola] || stan.uz.rola;
  menuDlaRoli();
  // Zanim cokolwiek narysujemy: czy przegladarka na pewno ma komplet plikow
  // z jednej wersji. Gdy nie — funkcja sama przeladuje aplikacje.
  await sprawdzSpojnoscWersji();
  await wczytajSlowniki();
  synchronizuj();
  wyslijZapisyBiura();
  // Zdarzenia od tej chwili — pierwsze pytanie tylko ustawia numer (start nic nie gra).
  stanZdarzen.od = null;
  sprawdzZdarzenia();
  // Aplikację otworzyło dotknięcie powiadomienia (sw.js: „./#trasa=12”) —
  // od razu właściwy ekran, a adres czyścimy, żeby odświeżenie nie wracało tam.
  const zPowiadomienia = location.hash;
  if (zPowiadomienia) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* trudno */ }
  }
  if (!otworzAdres(zPowiadomienia)) pokazEkran(jestBiuro() ? 'pulpit' : 'moja');
  if (stan.uz.haslo_startowe && jestBiuro()) oknoStartowegoHasla();
}

/* Zasada nowego PIN-u — ta sama co na serwerze (sprawdz_dlugosc_pinu,
   sprawdz_pin_gk). Biuro i administrator mają hasło min. 8 znaków także na
   koncie tutejszym — dawniej okno konta mówiło im „min. 4 znaki”, a serwer
   odrzucał wszystko krótsze niż 8. Pola PIN-u są bez inputmode="numeric":
   na telefonie z klawiaturą cyfrową hasła biura nie dałoby się wpisać. */
function opisNowegoPinu() {
  if (jestBiuro()) return 'Nowe hasło (min. 8 znaków)';
  return 'Nowy PIN (4 cyfry)';
}

function pinZPanelu() { return stan.uz.zrodlo === 'gk' && !!stan.uz.konta_z_panelu; }

/* Klawiatura jak w aplikacjach hali (konto.js): biuro — zwykła (hasło z liter),
   kierowca — cyfrowa: nowy PIN to dokładnie 4 cyfry (D46, 2026-10-16 także na
   kontach tutejszych, jak serwer → sprawdz_dlugosc_pinu i GK Flota). */
function trybKlawiaturyPinu() { return !jestBiuro() ? 'numeric' : 'text'; }

/* Konto biura albo administratora z hasłem krótszym niż 8 znaków (w praktyce
   fabryczne „1234” konta admin) — serwer melduje to polem haslo_startowe.
   To JEDYNA reguła, o którą tu pytamy: hasło biura ma min. 8 znaków (D46).
   Od D74 (właściciel 2026-10-16: „nie mają [ograniczeń], jakie hasła i jakie
   piny chcą”) nie ma już okna „zmień PIN, bo łatwy”: kierowca z PIN-em
   1234 czy 0000 nie dostaje żadnego ostrzeżenia. Pytamy o obecne hasło, zamiast
   wysyłać „1234” za człowieka (zły obecny sekret liczy się do blokady). */
function oknoStartowegoHasla() {
  if (!jestBiuro()) return;                 // kierowca: PIN dowolny, bez okna
  okno({
    tytul: 'Ustaw nowe hasło',
    tresc: `<div class="wstega uwaga">Hasło tego konta ma mniej niż 8 znaków
        (np. fabryczne <b>1234</b>). Hasło konta biura ma mieć co najmniej 8 znaków.</div>
      <label>Obecne hasło
        <input id="sh-stary" type="password" inputmode="text"
               autocomplete="current-password" maxlength="128"></label>
      <label>${opisNowegoPinu()}
        <input id="sh-nowe" type="password" inputmode="text"
               autocomplete="new-password" maxlength="128"></label>
      <label>Powtórz nowe hasło
        <input id="sh-powtorz" type="password" inputmode="text"
               autocomplete="new-password" maxlength="128"></label>`,
    przyciski: [
      { napis: 'Później', klik: z => z() },
      { napis: 'Zmień teraz', klasa: 'glowny', klik: async z => {
        const stary = document.getElementById('sh-stary').value;
        const nowe = document.getElementById('sh-nowe').value;
        if (nowe !== document.getElementById('sh-powtorz').value) {
          komunikat('Hasła się nie zgadzają', 'blad');
          return;
        }
        const w = await sprobuj(() => API.post('/api/zmien-pin', { stary, nowy: nowe }), 'Hasło zmienione');
        if (!w) return;
        if (w.token) { stan.token = w.token; Pamiec.zapisz('token', w.token); }
        stan.uz.haslo_startowe = false;
        z();
      } },
    ],
  });
}

document.addEventListener('DOMContentLoaded', uruchom);
