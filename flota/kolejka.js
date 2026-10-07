/* Kolejka offline.

   Serce trybu terenowego. Kierowca kończy obchód auta na placu — często bez
   jednej kreski zasięgu — a program NIE próbuje od razu wysłać przeglądu.
   Wkłada go do kolejki w telefonie i od razu maluje wynik na ekranie.
   Wysyłka dzieje się w tle, kiedy wraca wifi. Każda operacja ma swój numer
   (uuid), więc nawet wysłana dwa razy zapisze się tylko raz.

   Trzy magazyny i jedna zasada dla każdego:
     kolejka    — zapisy czekające na wysłanie; znikają dopiero, gdy serwer
                  potwierdzi, że je ma;
     odrzucone  — zapisy, których serwer nie przyjął, razem z powodem;
                  stąd NIC nie znika samo, tylko ręką człowieka;
     pamiec     — podręczna kopia danych i brudnopisy, żeby program pokazał
                  cokolwiek bez zasięgu.

   IndexedDB, a nie localStorage: w kolejce leżą zdjęcia w base64, czyli
   megabajty na operację. localStorage ma około pięciu megabajtów na całą
   witrynę i przy szóstym zdjęciu rzuca QuotaExceededError — czyli traci
   komplet ujęć w chwili, w której kierowca właśnie skończył obchód auta. */

const Kolejka = (() => {
  const NAZWA_BAZY = 'flotex-offline';
  const WERSJA = 1;
  let baza = null;

  /* Ile razy próbujemy wysłać, zanim zapis wyląduje wśród odrzuconych.

     Ta sama liczba stoi w app.js jako `MAKS_PROB`. Nie da się jej trzymać
     w jednym `const`, bo pliki web/ ładują się zwykłymi tagami <script>
     do jednej przestrzeni nazw: dwie deklaracje tej samej stałej to błąd
     składni, który wywraca CAŁY program, a nie jeden plik. Stąd kopia tutaj
     i wystawienie jej jako Kolejka.MAKS_PROB — obie zmienia się razem. */
  const LIMIT_PROB = 5;

  function otworz() {
    if (baza) return Promise.resolve(baza);
    return new Promise((zwroc, odrzuc) => {
      const zadanie = indexedDB.open(NAZWA_BAZY, WERSJA);
      zadanie.onupgradeneeded = () => {
        const db = zadanie.result;
        // KAŻDY magazyn zakładany warunkowo. Bez tego pierwsze podniesienie
        // WERSJA (a podnosi się ją, gdy dojdzie czwarty magazyn) rzuca
        // ConstraintError na już istniejącym magazynie — i cała kolejka
        // przestaje działać razem ze zdjęciami, które w niej leżą.
        if (!db.objectStoreNames.contains('kolejka'))
          db.createObjectStore('kolejka', { keyPath: 'uuid' });
        if (!db.objectStoreNames.contains('pamiec'))
          db.createObjectStore('pamiec', { keyPath: 'klucz' });
        // Osobna półka na zapisy, których serwer nie przyjął. Nic stąd nie
        // znika samo — zdjęcia z placu są jedynymi danymi w tym programie,
        // których nie da się odtworzyć niczym poza powrotem na plac.
        if (!db.objectStoreNames.contains('odrzucone'))
          db.createObjectStore('odrzucone', { keyPath: 'uuid' });
      };
      zadanie.onsuccess = () => { baza = zadanie.result; zwroc(baza); };
      zadanie.onerror = () => odrzuc(zadanie.error);
    });
  }

  /* Jedyne miejsce, w którym w całym programie dotykamy IndexedDB. Każda
     metoda niżej to jedna linia wołająca to. Rozsypanie transakcji po
     kilkunastu metodach oznaczałoby kilkanaście miejsc, w których można
     zapomnieć o oncomplete — a wtedy zapis „się udał”, tylko go nie ma.

     Czekamy na `oncomplete` transakcji, a NIE na `onsuccess` żądania:
     żądanie melduje sukces, zanim transakcja się zatwierdzi, więc telefon
     wygaszony w tej szczelinie gubi zapis bez jednego komunikatu.           */
  function dzialanie(magazyn, tryb, praca) {
    return otworz().then(db => new Promise((zwroc, odrzuc) => {
      const t = db.transaction(magazyn, tryb);
      const zadanie = praca(t.objectStore(magazyn));
      t.oncomplete = () => zwroc(zadanie ? zadanie.result : undefined);
      t.onerror = () => odrzuc(t.error);
      t.onabort = () => odrzuc(t.error || new Error('Zapis w telefonie został przerwany'));
    }));
  }

  function numer() {
    // crypto.randomUUID nie istnieje w niebezpiecznym kontekscie, a program
    // chodzi po sieci firmowej pod http://192.168… — czyli dokladnie tam.
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'x-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  /* Numer nowej operacji. Paczka ze zdjęciami dostaje numer policzony
     z TREŚCI, reszta — losowy.

     Powód: numer losowy chroni przed powtórzoną wysyłką, ale nie przed
     powtórzonym włożeniem. Kierowca w rękawicy dotyka „Zapisz” dwa razy,
     albo wraca do brudnopisu odzyskanego po tym, jak aparat wypchnął
     przeglądarkę z pamięci — i w kolejce lądują dwie paczki z tym samym
     kompletem zdjęć. Serwer zapisze przegląd raz (rozpoznaje zdjęcia po
     odcisku), ale przez firmowe wifi na placu przejdą dwa razy trzy
     megabajty. Ten sam komplet w tej samej sekundzie to ten sam numer,
     więc druga paczka po prostu nadpisuje pierwszą w magazynie.

     Odczyt licznika i zgłoszenie usterki zostają przy numerze losowym:
     kierowca zgłasza dwie różne rysy tym samym zdaniem („zarysowany zderzak”)
     częściej, niż dotyka przycisku dwa razy — a zlanie tych dwóch zgłoszeń
     w jedno kosztowałoby usterkę, o której nikt się nie dowie.              */
  function numerDla(op) {
    if (!op || !op.zdjecia) return numer();
    let skrot = null;
    // Sięgamy po Skrot przez try, bo skrot.js ładuje się PO tym pliku.
    // Gdyby go zabrakło (wycięty tag <script>, pusta pamięć podręczna),
    // kolejka ma dalej przyjmować zdjęcia — z gorszym numerem, ale przyjmować.
    try { skrot = Skrot; } catch (e) { skrot = null; }
    if (!skrot || !skrot.operacji) return numer();
    try { return skrot.operacji(op); } catch (e) { return numer(); }
  }

  return {
    numer,
    numerDla,
    MAKS_PROB: LIMIT_PROB,

    /* Operacja trafia do kolejki i tam czeka.

       `put` po kluczu uuid, a nie `add`: włożenie tej samej operacji drugi
       raz ma ją NADPISAĆ, a nie wywrócić transakcję na ConstraintError.
       Na tym stoi cała idempotencja po stronie telefonu.                   */
    dodaj(op) {
      op.uuid = op.uuid || numerDla(op);
      op.dodano = op.dodano || new Date().toISOString();
      op.prob = 0;
      return dzialanie('kolejka', 'readwrite', s => s.put(op)).then(() => op);
    },

    /* Kolejność wysyłki jest kolejnością zapisu — sortujemy po 'dodano',
       bo getAll() oddaje po kluczu, czyli po losowym uuid. Przy przeglądzie
       i dosyłce zdjęć do niego kolejność decyduje o tym, czy zdjęcia
       w ogóle mają do czego trafić. */
    lista() {
      return dzialanie('kolejka', 'readonly', s => s.getAll())
        .then(w => (w || []).sort((a, b) => String(a.dodano).localeCompare(String(b.dodano))));
    },

    /* Zapisy JEDNEJ osoby. Telefon w busie bywa wspólny, a wysyłamy wyłącznie
       własne paczki: cudze czekają na swojego właściciela, bo serwer i tak
       odmówi zapisania cudzych zdjęć, a telefon skasowałby je po odmowie. */
    moje(uzytkownikId) {
      return this.lista().then(w => w.filter(o => o.uzytkownik === uzytkownikId));
    },

    /* Co czeka w telefonie dla danego pojazdu — do nałożenia na widok.

       Bez tego przegląd zrobiony bez zasięgu znika przy pierwszym odświeżeniu
       listy (serwer o nim jeszcze nie wie) i kierowca robi cały obchód auta
       drugi raz. Filtr obejmuje KAŻDY typ operacji, bo każdy zmienia to,
       co widać na karcie pojazdu.                                           */
    dlaPojazdu(pojazdId, uzytkownikId) {
      return this.lista().then(w => w.filter(o =>
        Number(o.pojazd) === Number(pojazdId)
        && (uzytkownikId === undefined || o.uzytkownik === uzytkownikId)));
    },

    usun(uuid) { return dzialanie('kolejka', 'readwrite', s => s.delete(uuid)); },
    ile() { return dzialanie('kolejka', 'readonly', s => s.count()); },
    oznaczProbe(op) {
      op.prob = (op.prob || 0) + 1;
      return dzialanie('kolejka', 'readwrite', s => s.put(op)).then(() => op.prob);
    },

    /* Uzupełnia operację, która jeszcze czeka w kolejce. Gdy już poszła —
       nic się nie dzieje i tak ma być. */
    uzupelnij(uuid, pola) {
      return dzialanie('kolejka', 'readonly', s => s.get(uuid)).then(op => {
        if (!op) return null;
        return dzialanie('kolejka', 'readwrite', s => s.put(Object.assign(op, pola)));
      });
    },

    /* Przeniesienie do odrzuconych zamiast skasowania. Operacja zostaje
       w telefonie z powodem odmowy, dopóki człowiek jej nie obejrzy. */
    odrzuc(op, blad) {
      const odrzucona = Object.assign({}, op, {
        blad: String(blad || 'nieznany powód'),
        odrzucono: new Date().toISOString(),
      });
      return dzialanie('odrzucone', 'readwrite', s => s.put(odrzucona))
        .then(() => dzialanie('kolejka', 'readwrite', s => s.delete(op.uuid)));
    },

    /* Jedna decyzja po nieudanej wysyłce, w jednym miejscu.

       Rozdzielenie tego na wywołania „odrzuc albo oznaczProbe” po stronie
       app.js kończyło się tym, że jedna z gałęzi kasowała operację zamiast
       ją odłożyć. Tutaj widać całą regułę naraz: błąd trwały (400/404 —
       serwer nigdy tego nie przyjmie) idzie na półkę od razu, przejściowy
       (brak sieci, 403 przy cudzej sesji, 409 przy niekompletnym przeglądzie)
       dostaje kolejne próby, a po LIMIT_PROB ląduje na tej samej półce
       z dopiskiem, ile razy się nie udało. Skasowanie nie jest wynikiem
       ŻADNEJ z tych ścieżek.                                                */
    async nieudana(op, blad, trwaly) {
      if (trwaly) {
        await this.odrzuc(op, blad);
        return { odrzucona: true, prob: op.prob || 0 };
      }
      const prob = await this.oznaczProbe(op);
      if (prob >= LIMIT_PROB) {
        await this.odrzuc(op, `${blad} (nie udało się wysłać ${LIMIT_PROB} razy)`);
        return { odrzucona: true, prob };
      }
      return { odrzucona: false, prob };
    },

    listaOdrzuconych() {
      return dzialanie('odrzucone', 'readonly', s => s.getAll())
        .then(w => (w || []).sort((a, b) => String(a.odrzucono).localeCompare(String(b.odrzucono))));
    },
    ileOdrzuconych() { return dzialanie('odrzucone', 'readonly', s => s.count()); },
    zapomnijOdrzucona(uuid) {
      return dzialanie('odrzucone', 'readwrite', s => s.delete(uuid));
    },

    /* Powrót odrzuconej do kolejki — po tym, jak biuro naprawiło przyczynę. */
    ponow(uuid) {
      return dzialanie('odrzucone', 'readonly', s => s.get(uuid)).then(op => {
        if (!op) return null;
        delete op.blad;
        delete op.odrzucono;
        op.prob = 0;
        return dzialanie('kolejka', 'readwrite', s => s.put(op))
          .then(() => dzialanie('odrzucone', 'readwrite', s => s.delete(uuid)))
          .then(() => op);
      });
    },

    /* Podręczna pamięć na dane, które muszą być widoczne bez sieci:
       mój pojazd, lista przeglądów, ustawienia, brudnopis przeglądu.        */
    zapamietaj(klucz, wartosc) {
      return dzialanie('pamiec', 'readwrite',
        s => s.put({ klucz, wartosc, kiedy: new Date().toISOString() }));
    },
    przypomnij(klucz) {
      return dzialanie('pamiec', 'readonly', s => s.get(klucz))
        .then(w => (w ? w.wartosc : null));
    },
    /* Kiedy dana w podręcznej pamięci powstała — po to, żeby ekran mógł
       napisać „dane z ostatniej synchronizacji: wczoraj 17:20”, a nie udawać,
       że pokazuje stan bieżący. Kierowca patrzący na termin badania musi
       wiedzieć, czy patrzy na dzisiaj, czy na sprzed tygodnia. */
    kiedyZapamietane(klucz) {
      return dzialanie('pamiec', 'readonly', s => s.get(klucz))
        .then(w => (w ? w.kiedy : null));
    },
    /* Kasuje JEDEN wpis podręcznej pamięci. Używane przy wylogowaniu, żeby
       kartoteka floty nie została w telefonie po odejściu kierowcy.
       Kolejki i odrzuconych to nie dotyka — tam leżą zdjęcia. */
    zapomnij(klucz) {
      return dzialanie('pamiec', 'readwrite', s => s.delete(klucz));
    },
  };
})();
