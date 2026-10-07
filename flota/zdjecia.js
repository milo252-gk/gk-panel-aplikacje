/* Zdjęcia stanu auta: aparat telefonu → canvas → base64 → kolejka.

   To jest jedyna dana w całym programie, której nie da się odtworzyć niczym
   innym niż powrotem na plac. Stąd wszystkie decyzje w tym pliku:
   zdjęcie zrobione w aplikacji NIE trafia do galerii telefonu, więc każde
   miejsce, w którym mogłoby zniknąć, jest tu albo obwarowane pytaniem,
   albo podparte brudnopisem.

   Zbiór zdjęć jednego kadru to zwykła tablica napisów `data:image/jpeg;base64,…`.
   Komplet do przeglądu to obiekt `{ przod: [...], tyl: [...], … }`. Prosto,
   bo dokładnie w takiej postaci wchodzi do brudnopisu w IndexedDB i wychodzi
   z niego po tym, jak aparat wypchnie przeglądarkę z pamięci.                */

/* Sześć stałych kadrów przeglądu plus dwa kadry spoza obchodu: zdjęcie
   usterki i podpis kierowcy. Ta lista jest KOPIĄ stałej UJECIA z flotex.py
   i wolno ją zmieniać wyłącznie razem z tamtą — kod, etykieta i to, czy kadr
   jest obowiązkowy, muszą się zgadzać co do znaku. Gdy się rozjadą, telefon
   każe robić zdjęcie, którego serwer nie zna, albo puszcza przegląd, który
   serwer odrzuci jako niekompletny; jedno i drugie kończy się kierowcą
   stojącym na placu z kompletem zdjęć nie do wysłania. Pilnuje tego
   testy/t_zgodnosc.py.                                                       */
const UJECIA = [
  { kod: 'przod',   etykieta: 'Przód',           obowiazkowe: true,  wPrzeglądzie: true,
    ikona: '🚘', podpowiedz: 'Całe auto z przodu, tablica rejestracyjna w kadrze' },
  { kod: 'tyl',     etykieta: 'Tył',             obowiazkowe: true,  wPrzeglądzie: true,
    ikona: '🚙', podpowiedz: 'Całe auto z tyłu, razem z tablicą' },
  { kod: 'lewy',    etykieta: 'Lewy bok',        obowiazkowe: true,  wPrzeglądzie: true,
    ikona: '⬅️', podpowiedz: 'Cały bok od drzwi kierowcy' },
  { kod: 'prawy',   etykieta: 'Prawy bok',       obowiazkowe: true,  wPrzeglądzie: true,
    ikona: '➡️', podpowiedz: 'Cały bok od strony pasażera' },
  { kod: 'licznik', etykieta: 'Licznik',         obowiazkowe: true,  wPrzeglądzie: true,
    ikona: '🔢', podpowiedz: 'Licznik przy włączonym zapłonie — cyfry mają być czytelne' },
  // Poniższe są nieobowiązkowe z rozmysłem. Wymuszanie wnętrza przy aucie,
  // które stoi w warsztacie, kończy się ostrzeżeniem widocznym co miesiąc
  // przy każdym pojeździe — a ostrzeżenie, które jest zawsze, nie znaczy nic.
  { kod: 'wnetrze', etykieta: 'Wnętrze',         obowiazkowe: false, wPrzeglądzie: true,
    ikona: '🪑', podpowiedz: 'Kabina i przestrzeń ładunkowa — nieobowiązkowe' },
  { kod: 'usterka', etykieta: 'Usterka',         obowiazkowe: false, wPrzeglądzie: false,
    ikona: '🔧', podpowiedz: 'Zdjęcie dowodowe do zgłoszenia usterki' },
  { kod: 'podpis',  etykieta: 'Podpis kierowcy', obowiazkowe: false, wPrzeglądzie: false,
    ikona: '✍️', podpowiedz: 'Podpis pod przeglądem, rysowany palcem' },
];

const UJECIA_OBOWIAZKOWE = UJECIA.filter(u => u.obowiazkowe).map(u => u.kod);
const UJECIA_PROTOKOLU = UJECIA.filter(u => u.wPrzeglądzie);

// Tyle zdjęć przyjmuje serwer w jednej paczce (MAKS_ZDJEC w flotex.py).
const MAKS_ZDJEC = 12;
/* Sześć kadrów przeglądu po dwa zdjęcia to dokładnie MAKS_ZDJEC. Trzecie
   zdjęcie w jednym kadrze wypchnęłoby z paczki obowiązkowe ujęcie innego
   kadru — kierowca dostałby wtedy z serwera „brakuje zdjęć: Licznik” za coś,
   co ma w telefonie zrobione. */
const MAKS_W_KADRZE = 2;

const Zdjecia = (() => {
  const MAKS_BOK = 1280;
  const JAKOSC = 0.72;

  /* Zdjęcie z telefonu ma 3-5 MB. Przez słaby zasięg to wieczne czekanie, więc
     zmniejszamy je jeszcze w telefonie, zanim trafi do kolejki. 1280 px
     w zupełności wystarcza, żeby zobaczyć rysę na drzwiach i odczytać licznik. */
  function zmniejsz(plik, maksBok, jakosc) {
    maksBok = maksBok || MAKS_BOK;
    jakosc = jakosc || JAKOSC;
    return new Promise((zwroc, odrzuc) => {
      const czytnik = new FileReader();     // błędy po polsku, jak wszędzie indziej
      czytnik.onerror = () => odrzuc(new Error('Nie udało się odczytać zdjęcia'));
      czytnik.onload = () => {
        const obraz = new Image();
        obraz.onerror = () => {
          // iPhone zapisuje zdjęcia w HEIC. Safari je rozkoduje, ale ten sam
          // plik przesłany na Androida albo do przeglądarki w biurze jest
          // tam nieczytelny — a kierowca dostawał wtedy tylko „To nie jest
          // zdjęcie” i nie miał pojęcia, co ma z tym zrobić.
          const nazwa = String((plik && plik.name) || '').toLowerCase();
          odrzuc(new Error(/\.hei[cf]$/.test(nazwa)
            ? 'To zdjęcie jest w formacie HEIC, którego ta przeglądarka nie otwiera. '
              + 'W ustawieniach aparatu iPhone’a wybierz „Najzgodniejszy” i zrób je jeszcze raz.'
            : 'To nie jest zdjęcie'));
        };
        obraz.onload = () => {
          let sz = obraz.width, wy = obraz.height;
          if (!sz || !wy) return odrzuc(new Error('To zdjęcie jest puste — zrób je jeszcze raz'));
          const skala = Math.min(1, maksBok / Math.max(sz, wy));
          sz = Math.round(sz * skala); wy = Math.round(wy * skala);
          const plotno = document.createElement('canvas');
          plotno.width = sz; plotno.height = wy;
          plotno.getContext('2d').drawImage(obraz, 0, 0, sz, wy);
          zwroc(plotno.toDataURL('image/jpeg', jakosc));
        };
        obraz.src = czytnik.result;
      };
      czytnik.readAsDataURL(plik);
    });
  }

  /* Odcisk zdjęcia — po nim poznajemy, że to samo zdjęcie wchodzi drugi raz.
     Liczy go skrot.js, bo crypto.subtle nie istnieje pod http://192.168…    */
  function odcisk(dataURL) {
    try { return Skrot.obrazu(dataURL); } catch (e) { return ''; }
  }

  function obrazyKadru(zbior) {
    return Array.isArray(zbior) ? zbior.filter(z => typeof z === 'string' && z) : [];
  }

  /* Dokłada wybrane pliki do zbioru jednego kadru i przerysowuje miniatury.

     `opcje`: { maks, poZmianie, nazwa } — `nazwa` wchodzi do komunikatów,
     żeby kierowca przy szóstym kadrze wiedział, którego dotyczy odmowa.     */
  async function dodaj(pliki, zbior, pojemnik, wejscie, opcje) {
    opcje = opcje || {};
    const maks = opcje.maks || MAKS_ZDJEC;
    const gdzie = opcje.nazwa ? ` (${opcje.nazwa})` : '';
    let wolne = maks - zbior.length;
    let dodane = 0;
    for (const plik of Array.from(pliki || [])) {
      if (wolne <= 0) {
        komunikat(`Więcej zdjęć w tym kadrze nie zmieści się w jednej paczce${gdzie}. `
          + 'Usuń jedno, jeśli chcesz zrobić inne.', 'blad');
        break;
      }
      try {
        const maly = await zmniejsz(plik);
        const nowy = odcisk(maly);
        // Kierowca w rękawicy dotyka migawki dwa razy i do kadru wchodzą dwa
        // identyczne pliki po ćwierć megabajta. Serwer i tak zapisze je jako
        // jedno zdjęcie (rozpoznaje po odcisku), ale przez firmowe wifi
        // przejdą oba — i oba zajmą miejsce w paczce obowiązkowym ujęciom.
        if (nowy && zbior.some(z => odcisk(z) === nowy)) {
          komunikat(`To zdjęcie już jest w tym kadrze${gdzie}`, '');
          continue;
        }
        zbior.push(maly);
        wolne--; dodane++;
      } catch (e) {
        komunikat(poLudzku(e), 'blad');
      }
    }
    // Bez tego ten sam plik wybrany drugi raz nie wywoła 'change' i wygląda
    // to jak zawieszony przycisk.
    if (wejscie) wejscie.value = '';
    miniatury(zbior, pojemnik, opcje);
    if (dodane && opcje.poZmianie) opcje.poZmianie(zbior);
    return dodane;
  }

  /* Przerysowanie miniatur razem z przyciskami „podejrzyj” i „usuń”. */
  function miniatury(zbior, pojemnik, opcje) {
    opcje = opcje || {};
    if (!pojemnik) return;
    const lista = obrazyKadru(zbior);
    pojemnik.innerHTML = lista.map((z, i) => `
      <div class="miniatura">
        <img src="${z}" alt="Zdjęcie ${i + 1}" data-podejrzyj="${i}">
        ${opcje.tylkoPodglad ? '' : `<button type="button" data-usun="${i}"
          aria-label="Usuń zdjęcie ${i + 1}">✕</button>`}
      </div>`).join('');

    pojemnik.querySelectorAll('[data-podejrzyj]').forEach(o => o.onclick =
      () => podglad(lista[Number(o.dataset.podejrzyj)], opcje.nazwa || 'Zdjęcie'));

    if (opcje.tylkoPodglad) return;
    pojemnik.querySelectorAll('[data-usun]').forEach(b => b.onclick = async () => {
      // Zdjęcie zrobione w aplikacji nie trafia do galerii telefonu — skasowane
      // znaczy: wróć na plac. Dlatego pytamy, mimo że to jedno dotknięcie.
      if (!await potwierdz('Usunąć to zdjęcie?', 'Nie ma go w galerii telefonu.',
        { tak: 'Usuń', nie: 'Zostaw', groznie: true })) return;
      zbior.splice(Number(b.dataset.usun), 1);
      miniatury(zbior, pojemnik, opcje);
      if (opcje.poZmianie) opcje.poZmianie(zbior);
    });
  }

  /* Podgląd na cały ekran. Kierowca sprawdza w słońcu, czy licznik jest
     czytelny — na miniaturze 92 px nie da się tego zobaczyć, a drugi raz
     na plac nikt nie wróci po to, żeby powtórzyć nieostre zdjęcie. */
  function podglad(dataURL, tytul) {
    if (!dataURL) return;
    okno({
      tytul: tytul || 'Zdjęcie',
      szerokie: true,
      tresc: `<div class="dowod"><img src="${dataURL}" alt="${escHtml(tytul || 'Zdjęcie')}"></div>`,
      przyciski: [{ napis: 'Zamknij', klasa: 'glowny', klik: z => z() }],
    });
  }

  /* --------------------------------------------------- komplet do przeglądu */

  function pustyKomplet() {
    const komplet = {};
    UJECIA_PROTOKOLU.forEach(u => { komplet[u.kod] = []; });
    return komplet;
  }

  /* Których obowiązkowych kadrów jeszcze nie ma — ETYKIETAMI, bo ta lista
     idzie wprost w zdanie na ekranie kierowcy. Ten sam rachunek robi serwer
     (brakujace_ujecia) i to on rozstrzyga; tutaj liczymy go po to, żeby
     kierowca zobaczył brak PRZED wyjazdem z placu, a nie po powrocie.
     `naSerwerze` to kody kadrów, które serwer już ma w tym przeglądzie
     (protokol.kadry z /api/moj-pojazd) — po odrzuceniu kierowca dorabia
     tylko to, o co prosi biuro, a nie pięć zdjęć od nowa. */
  function brakujace(komplet, naSerwerze) {
    komplet = komplet || {};
    const sa = new Set(naSerwerze || []);
    return UJECIA.filter(u => u.obowiazkowe && !sa.has(u.kod)
                              && !obrazyKadru(komplet[u.kod]).length)
      .map(u => u.etykieta);
  }

  function kompletny(komplet) { return !brakujace(komplet).length; }

  function ile(komplet) {
    komplet = komplet || {};
    return UJECIA_PROTOKOLU.reduce((suma, u) => suma + obrazyKadru(komplet[u.kod]).length, 0);
  }

  /* Pasek postępu obchodu: jedna kreska na kadr obowiązkowy. Kierowca widzi
     go bez czytania i wie, ile jeszcze zostało — na placu w rękawicach
     i w słońcu to jedyna informacja, którą da się odebrać jednym spojrzeniem. */
  function pasekPostepu(komplet, naSerwerze) {
    komplet = komplet || {};
    const sa = new Set(naSerwerze || []);
    return '<div class="postep">' + UJECIA.filter(u => u.obowiazkowe)
      .map(u => `<i class="${sa.has(u.kod) || obrazyKadru(komplet[u.kod]).length
        ? 'ok' : 'nie'}"></i>`)
      .join('') + '</div>';
  }

  /* Paczka dla serwera: lista par {ujecie, obraz}, dokładnie tak, jak czyta
     ją _ujecia_z_paczki() we flotex.py.

     KOLEJNOŚĆ MA ZNACZENIE: obowiązkowe kadry idą pierwsze. Serwer ucina
     paczkę na MAKS_ZDJEC, więc gdyby na początku stały dwa zdjęcia wnętrza,
     przycięcie zabrałoby zdjęcie licznika — a wtedy przegląd nie domknie się
     nigdy i kierowca dostaje co miesiąc telefon z biura o brakujące zdjęcie,
     które przecież zrobił.                                                   */
  function doPaczki(komplet) {
    komplet = komplet || {};
    const paczka = [];
    const wedlugWagi = UJECIA_PROTOKOLU.slice()
      .sort((a, b) => (b.obowiazkowe ? 1 : 0) - (a.obowiazkowe ? 1 : 0));
    for (const u of wedlugWagi) {
      for (const obraz of obrazyKadru(komplet[u.kod])) {
        if (paczka.length >= MAKS_ZDJEC) return paczka;
        paczka.push({ ujecie: u.kod, obraz });
      }
    }
    return paczka;
  }

  /* Zgłoszenie usterki ma jedno pole na zdjęcie i żadnych nazw kadrów —
     serwer czyta je przez _obrazy_z_paczki() jako zwykłą listę napisów. */
  function doPaczkiUsterki(zbior) {
    return obrazyKadru(zbior).slice(0, MAKS_ZDJEC);
  }

  /* --------------------------------------------------- kafelki kadrów */

  function opisKadru(kod) {
    return UJECIA.find(u => u.kod === kod) || { kod, etykieta: kod, obowiazkowe: false };
  }

  function plakietkaKadru(u, ile, wBiurze) {
    if (ile) {
      return `<span class="plakietka p-wykonany">${ile} `
        + `${odmiana(ile, 'zdjęcie', 'zdjęcia', 'zdjęć')}</span>`;
    }
    // Kadr, który biuro już ma (przegląd odrzucony albo dosyłany): nie straszymy
    // czerwonym „brak" — nowe zdjęcie robi się tylko wtedy, gdy biuro o nie prosi.
    if (wBiurze) return '<span class="plakietka p-wykonany">jest w biurze</span>';
    return u.obowiazkowe
      ? '<span class="plakietka p-zalegly">brak</span>'
      : '<span class="plakietka p-oczekuje">nieobowiązkowe</span>';
  }

  /* HTML sześciu kafelków obchodu. Dwa osobne wejścia na kadr, i to nie jest
     ozdobnik: `capture="environment"` otwiera aparat OD RAZU, z pominięciem
     wybieraka plików — i przy okazji odbiera możliwość sięgnięcia po zdjęcie
     zrobione pięć minut wcześniej. Kierowca, który obszedł auto przed
     otwarciem programu, musiałby obejść je drugi raz. Stąd druga droga:
     „Z galerii”, bez `capture`.                                             */
  function kafelki(komplet, prefiks, naSerwerze) {
    komplet = komplet || {};
    prefiks = prefiks || 'pr';
    const sa = new Set(naSerwerze || []);
    return UJECIA_PROTOKOLU.map(u => {
      const zbior = obrazyKadru(komplet[u.kod]);
      return `
      <div class="karta scisla" data-kadr="${u.kod}"${sa.has(u.kod) ? ' data-w-biurze="1"' : ''}>
        <div class="karta-gora">
          <b>${u.ikona} ${escHtml(u.etykieta)}</b>
          ${plakietkaKadru(u, zbior.length, sa.has(u.kod))}
        </div>
        <div class="male slaby">${escHtml(u.podpowiedz)}</div>
        <div class="miniatury" id="${prefiks}-miniatury-${u.kod}"></div>
        <div class="chipy">
          <label class="chip">📷 Zrób zdjęcie
            <input type="file" class="ukryty" accept="image/*" capture="environment"
                   id="${prefiks}-aparat-${u.kod}" data-aparat="${u.kod}"></label>
          <label class="chip">🖼️ Z galerii
            <input type="file" class="ukryty" accept="image/*" multiple
                   id="${prefiks}-galeria-${u.kod}" data-galeria="${u.kod}"></label>
        </div>
      </div>`;
    }).join('');
  }

  /* Podpięcie kafelków narysowanych przez kafelki(). `poZmianie` woła ekran
     po każdej zmianie: przerysowuje plakietkę braku i ZAPISUJE BRUDNOPIS. */
  function podepnijKafelki(pole, komplet, poZmianie) {
    const odswiezKafelek = (kod) => {
      const karta = pole.querySelector(`[data-kadr="${kod}"]`);
      if (!karta) return;
      const plakietka = karta.querySelector('.plakietka');
      if (plakietka) {
        plakietka.outerHTML = plakietkaKadru(opisKadru(kod), obrazyKadru(komplet[kod]).length,
                                             karta.dataset.wBiurze === '1');
      }
    };
    UJECIA_PROTOKOLU.forEach(u => {
      const pojemnik = pole.querySelector(`[data-kadr="${u.kod}"] .miniatury`);
      const opcje = {
        maks: MAKS_W_KADRZE, nazwa: u.etykieta,
        poZmianie: () => { odswiezKafelek(u.kod); if (poZmianie) poZmianie(komplet, u.kod); },
      };
      komplet[u.kod] = obrazyKadru(komplet[u.kod]);
      miniatury(komplet[u.kod], pojemnik, opcje);
      pole.querySelectorAll(`[data-aparat="${u.kod}"], [data-galeria="${u.kod}"]`)
        .forEach(we => we.onchange = () => dodaj(we.files, komplet[u.kod], pojemnik, we, opcje));
    });
  }

  /* --------------------------------------------------- brudnopis */

  /* Klucz brudnopisu wiąże go z POJAZDEM I OSOBĄ. Telefon w busie bywa
     wspólny, a auta zmieniają kierowców w połowie miesiąca — bez obu części
     klucza jeden kierowca odzyskiwałby zdjęcia drugiego i wysyłał je pod
     swoim nazwiskiem. */
  function kluczSzkicu(pojazdId) {
    const kto = (typeof stan !== 'undefined' && stan.uz) ? stan.uz.id : 0;
    return `szkic-przegladu-${Number(pojazdId) || 0}-${kto}`;
  }

  /* Brudnopis niedokończonego przeglądu.

     Zdjęcia, oceny punktów i licznik żyły wyłącznie w pamięci otwartego okna.
     Aparat telefonu potrafi wypchnąć przeglądarkę z pamięci — wtedy kierowca
     traci komplet ujęć i robi obchód auta drugi raz. To jedyne dane
     w programie, których nie da się odtworzyć inaczej niż powrotem na plac.
     Zapisujemy w czterech momentach, a NIE na zegarze: przepisywanie kilku
     megabajtów zdjęć po każdym naciśnięciu klawisza zadławiłoby tani telefon.
     Te cztery momenty to: dołożone albo usunięte zdjęcie, zmieniona ocena
     punktu, wpisany licznik i zejście aplikacji z ekranu.                   */
  function zapiszSzkic(pojazdId, szkic) {
    return Kolejka.zapamietaj(kluczSzkicu(pojazdId),
      Object.assign({ zapisano: new Date().toISOString() }, szkic));
  }
  function wczytajSzkic(pojazdId) {
    return Kolejka.przypomnij(kluczSzkicu(pojazdId));
  }
  /* Brudnopis kasujemy DOPIERO po włożeniu przeglądu do kolejki — nie po
     naciśnięciu „Zapisz”, nie po zamknięciu okna i na pewno nie po wysłaniu.
     Dopóki paczka nie leży w IndexedDB, brudnopis jest jedynym egzemplarzem. */
  function skasujSzkic(pojazdId) {
    return Kolejka.zapomnij(kluczSzkicu(pojazdId));
  }

  /* Pilnowanie brudnopisu na czas otwartego przeglądu.

     'visibilitychange' pokrywa przełączenie do aparatu i do wiadomości —
     kierowca odbiera SMS-a w połowie obchodu, system wygasza przeglądarkę,
     a po powrocie zdjęcia mają czekać. 'pagehide' pokrywa zamknięcie karty
     i przeładowanie. Zwrócone `rozlacz` MUSI zostać zawołane przy wyjściu
     z ekranu: bez tego każde otwarcie przeglądu dokłada kolejny nasłuch
     zapisujący brudnopis nieistniejącego już formularza.                    */
  function pilnujSzkicu(pojazdId, zbierz) {
    const zapisz = () => {
      try {
        const szkic = zbierz();
        if (szkic) zapiszSzkic(pojazdId, szkic);
      } catch (e) { /* brudnopis jest zapasem — nie może wywrócić ekranu */ }
    };
    const naWidocznosci = () => { if (document.hidden) zapisz(); };
    document.addEventListener('visibilitychange', naWidocznosci);
    window.addEventListener('pagehide', zapisz);
    return {
      zapisz,
      rozlacz() {
        document.removeEventListener('visibilitychange', naWidocznosci);
        window.removeEventListener('pagehide', zapisz);
      },
    };
  }

  return {
    UJECIA, UJECIA_OBOWIAZKOWE, UJECIA_PROTOKOLU, MAKS_ZDJEC, MAKS_W_KADRZE,
    zmniejsz, odcisk, dodaj, miniatury, podglad,
    pustyKomplet, brakujace, kompletny, ile, pasekPostepu,
    doPaczki, doPaczkiUsterki, opisKadru, kafelki, podepnijKafelki,
    kluczSzkicu, zapiszSzkic, wczytajSzkic, skasujSzkic, pilnujSzkicu,
  };
})();

/* Dwie nazwy globalne, bo tak wołają je ekrany kierowcy i przeglądów.
   Cała treść jest wyżej, w module — te dwie linie istnieją po to, żeby
   wywołanie z formularza nie musiało wiedzieć, że zdjęcia mają swój moduł. */
function zmniejszZdjecie(plik, maksBok, jakosc) { return Zdjecia.zmniejsz(plik, maksBok, jakosc); }
function dodajZdjecia(pliki, zbior, pojemnik, wejscie, opcje) {
  return Zdjecia.dodaj(pliki, zbior, pojemnik, wejscie, opcje);
}
