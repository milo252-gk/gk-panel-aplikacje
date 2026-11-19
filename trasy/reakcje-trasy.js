/* Reakcje w GK Trasy (2026-11-19, decyzja właściciela; STYL-GK §6b). Rysunki, nakładka i dźwięk dają `gk-reakcje.js` (kopia 1:1 z huba,
   `HalaReakcje.pokaz`); tu jest tylko to, CO i KIEDY pokazać kierowcy i biuru — bez zmian serwera, endpointów i kolejki zapisów.

   KIEROWCA (telefon, „Moja trasa”):
     - zamknięcie punktu jako „Dostarczone” przed końcem okna `okno_do` (albo bez okna) → `dobra`; po oknie → `wkoncu`;
     - ostatni punkt zamknięty i WSZYSTKIE dostarczone zamknięte w oknach → jedna `brawo` na całą trasę (zastępuje reakcję ostatniego punktu);
     - zwrot od biura (`zwrot_powod` + `zwrocono_o`) → `dopracuj`, raz na zwrot;
     - BRAK reakcji: nieudana dostawa (powód leży po stronie klienta), zatwierdzenie przez biuro (ręczne i automatyczne), cofnięcie punktu.
   BIURO / ADMIN (komputer): bez nakładki przy każdym „Zatwierdź” (dziesiątki dziennie). Jedna `dobra` dziennie, gdy „Do zatwierdzenia”
     spadnie do 0 po ręcznym zatwierdzaniu (nie po automacie serwera).
   Konto „Podgląd” — bez reakcji.

   Pamięć „raz na zdarzenie”: NOWY klucz `gk-trasy.reakcje` (przez `Pamiec`; nie dotyka żadnego istniejącego klucza ani kolejki offline):
   { _od: <ms pierwszego uruchomienia>, <id użytkownika>: { widziane: [klucze…] } }, limit 300. Zdarzenia sprzed `_od` się nie liczą —
   po aktualizacji nikt nie dostaje reakcji za stare zwroty. Czyste funkcje (testy: t_reakcje.py) nie dotykają DOM ani pamięci. */
(function (global) {
  'use strict';

  const KLUCZ_PAMIECI = 'reakcje';
  const OKNO_RECZNEGO_MS = 90 * 1000;   // „Zatwierdź” i odświeżenie listy muszą być blisko siebie, żeby zero liczyło się jako ręczne

  /* 'YYYY-MM-DD HH:MM:SS' (czas lokalny z serwera i z czasTeraz()) → ms; null, gdy puste albo nie do odczytania. */
  function czasMs(t) {
    if (!t) return null;
    const x = Date.parse(String(t).replace(' ', 'T'));
    return isNaN(x) ? null : x;
  }

  /* „9:30” → „09:30” (okno wpisane przez biuro bywa bez zera); puste → ''. */
  function godzina(h) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(h || '').trim());
    return m ? m[1].padStart(2, '0') + ':' + m[2] : '';
  }

  /* Czy zamknięcie punktu o czasie `zamkniete` ('YYYY-MM-DD HH:MM[:SS]') wypadło PO końcu okna `okno_do` w dniu trasy. Bez okna — nigdy. */
  function poOknie(p, dataTrasy, zamkniete) {
    const koniec = godzina(p && p.okno_do);
    if (!koniec || !zamkniete || !dataTrasy) return false;
    return String(zamkniete).slice(0, 16) > String(dataTrasy).slice(0, 10) + ' ' + koniec;
  }

  /* Reakcja na zamknięcie JEDNEGO punktu: tylko „dostarczone” dostaje reakcję; w oknie albo bez okna — dobra, po oknie — wkoncu. */
  function rodzajPunktu(p, dataTrasy, status, zamkniete) {
    if (status !== 'dostarczone') return null;
    return poOknie(p, dataTrasy, zamkniete) ? 'wkoncu' : 'dobra';
  }

  /* Trasa skończona „na czas”: żaden punkt nie czeka, jest co najmniej jeden dostarczony, a żaden dostarczony nie został zamknięty po
     swoim oknie. Nieudane punkty (powód po stronie klienta) nie psują nagrody. */
  function trasaNaCzas(trasa) {
    const lista = ((trasa && trasa.przystanki) || []).filter(p => p.status !== 'odwolany');
    if (!lista.length || lista.some(p => p.status === 'oczekuje')) return false;
    const dostarczone = lista.filter(p => p.status === 'dostarczone');
    if (!dostarczone.length) return false;
    return dostarczone.every(p => !poOknie(p, trasa.data, p.zamkniete_o));
  }

  /* Zwroty od biura, które kierowca ma jeszcze poprawić i których jeszcze nie widział: [{klucz, id, kiedy}] (najnowsze pierwsze).
     Tylko zwroty od chwili `od` (pierwsze uruchomienie reakcji na tym urządzeniu). */
  function zwroty(trasa, { od, widziane }) {
    const juz = widziane instanceof Set ? widziane : new Set(widziane || []);
    const wynik = [];
    for (const p of (trasa && trasa.przystanki) || []) {
      if (p.status !== 'oczekuje' || !p.zwrot_powod || !p.zwrocono_o) continue;
      const kiedy = czasMs(p.zwrocono_o);
      if (kiedy === null || kiedy < od) continue;
      const klucz = `${p.id}|zwrot|${p.zwrocono_o}`;
      if (!juz.has(klucz)) wynik.push({ klucz, id: p.id, kiedy });
    }
    return wynik.sort((a, b) => b.kiedy - a.kiedy);
  }

  // ---------------------------------------------------------------- część z DOM i pamięcią (tylko w aplikacji)

  /* `Pamiec` i `stan` to globalne `const` z app.js (nie właściwości window) — stąd typeof, a nie global.Pamiec. */
  const pamiecAplikacji = () => (typeof Pamiec !== 'undefined' ? Pamiec : null);
  let gotowe = false;
  function przygotuj() {
    if (gotowe) return !!global.HalaReakcje;
    const pamiec = pamiecAplikacji();
    if (!global.HalaReakcje || !pamiec) return false;
    global.HalaReakcje.ustawPamiec({
      czytaj: () => { try { return JSON.parse(pamiec.czytaj(KLUCZ_PAMIECI) || '{}') || {}; } catch (e) { return {}; } },
      zapisz: o => { pamiec.zapisz(KLUCZ_PAMIECI, JSON.stringify(o)); },
    });
    gotowe = true;
    return true;
  }

  /* Kto w ogóle dostaje reakcje: kierowca, biuro i administrator zalogowani kontem; „Podgląd” — nie. */
  function ja() {
    const u = typeof stan !== 'undefined' && stan ? stan.uz : null;
    if (!u || u.rola === 'podglad' || u.id === undefined || u.id === null) return null;
    return u.id;
  }

  function widziane(osoba) {
    return new Set(global.HalaReakcje.stanOsoby(null, osoba, Date.now()).widziane);
  }

  /* Pokazuje reakcję i dopiero wtedy zapamiętuje klucze (w karcie w tle nic się nie „zjada”). */
  function pokazIZapamietaj(osoba, rodzaj, klucze) {
    if (!global.HalaReakcje.pokaz(rodzaj)) return false;
    global.HalaReakcje.oznacz(null, osoba, klucze);
    return true;
  }

  /* Kierowca zamknął punkt (lokalnie, także bez sieci). `trasa` — jej stan PO zamknięciu (punkt już ma nowy status i zamkniete_o). */
  function poZamknieciu(trasa, p, status) {
    const osoba = ja();
    if (osoba === null || !przygotuj() || !p || status !== 'dostarczone') return null;
    const widz = widziane(osoba);
    const kluczPunktu = `${p.id}|zamkniecie|${p.zwrocono_o || ''}`;
    if (widz.has(kluczPunktu)) return null;
    const kluczTrasy = `trasa:${trasa && trasa.id}|koniec`;
    let rodzaj = rodzajPunktu(p, trasa && trasa.data, status, p.zamkniete_o);
    const klucze = [kluczPunktu];
    if (trasa && trasaNaCzas(trasa) && !widz.has(kluczTrasy)) { rodzaj = 'brawo'; klucze.push(kluczTrasy); }
    if (!rodzaj) return null;
    return pokazIZapamietaj(osoba, rodzaj, klucze) ? rodzaj : null;
  }

  /* „Zakończ trasę”: jeśli nagroda za całą trasę nie padła przy ostatnim punkcie (np. punkty zamykało biuro), pada teraz. */
  function poKoncuTrasy(trasa) {
    const osoba = ja();
    if (osoba === null || !przygotuj() || !trasa || !trasaNaCzas(trasa)) return null;
    const klucz = `trasa:${trasa.id}|koniec`;
    if (widziane(osoba).has(klucz)) return null;
    return pokazIZapamietaj(osoba, 'brawo', [klucz]) ? 'brawo' : null;
  }

  /* Świeży odczyt trasy kierowcy z serwera (porównanie z tym, co już widział): zwrot od biura → „dopracuj”, raz na zwrot.
     Zatwierdzenie (ręczne i automatyczne: status/do_przyjecia/przyjete_auto) celowo NIE daje reakcji. */
  function poOdczycie(trasa) {
    const osoba = ja();
    if (osoba === null || !przygotuj() || !trasa) return null;
    const stanOs = global.HalaReakcje.stanOsoby(null, osoba, Date.now());
    const lista = zwroty(trasa, { od: stanOs.od, widziane: stanOs.widziane });
    if (!lista.length) return null;
    return pokazIZapamietaj(osoba, 'dopracuj', lista.map(z => z.klucz)) ? 'dopracuj' : null;
  }

  /* Biuro: ręczne „Zatwierdź” oznacza chwilę; gdy zaraz potem lista „Do zatwierdzenia” jest pusta — jedna `dobra` dziennie. */
  let reczneO = 0;
  function biuroZatwierdzilo() { reczneO = Date.now(); }
  function biuroListaPusta(dzien) {
    const osoba = ja();
    const bylo = reczneO && Date.now() - reczneO <= OKNO_RECZNEGO_MS;
    reczneO = 0;
    if (!bylo || osoba === null || !przygotuj()) return null;
    const klucz = `dzien:${dzien}|do-zatwierdzenia-0`;
    if (widziane(osoba).has(klucz)) return null;
    return pokazIZapamietaj(osoba, 'dobra', [klucz]) ? 'dobra' : null;
  }

  global.ReakcjeTras = { czasMs, godzina, poOknie, rodzajPunktu, trasaNaCzas, zwroty,
                         poZamknieciu, poKoncuTrasy, poOdczycie, biuroZatwierdzilo, biuroListaPusta, KLUCZ_PAMIECI };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.ReakcjeTras;
})(typeof window !== 'undefined' ? window : globalThis);
