/* Terminal RCP — kiosk z czytnikiem kart USB (jak ekran „Imag RCP”, tylko nasz).

   Czytnik udaje klawiaturę: wpisuje cyfry numeru karty (np. 0006450974), zwykle z Enterem. Łapiemy je globalnie, więc nie
   trzeba nigdzie klikać. Odczyt kończy Enter albo 200 ms ciszy po ostatniej cyfrze. Zapis robi serwer
   (POST /api/v1/panel/rcp/odbicie, konto „ekran”); terminal NIE liczy godzin ani nie decyduje, czy to wejście, czy wyjście.

   Bez sieci skany czekają w pamięci terminala (z godziną skanu) i idą do serwera, gdy wróci połączenie — nikt nie traci
   odbicia przez chwilową awarię wifi. Serwer przyjmuje godzinę skanu tylko z ostatnich 48 godzin. */
(async () => {
  'use strict';

  const $ = id => document.getElementById(id);
  const KLUCZ_KOLEJKI = 'hala.panel.rcp.kolejka';
  const KLUCZ_ODRZUCONYCH = 'hala.panel.rcp.odrzucone';
  const CISZA_MS = 200, MIN_CYFR = 4, POKAZ_MS = 4000, PONOW_MS = 15000, MAKS_KOLEJKA = 500;

  const hala = Hala.utworz({ aplikacja: 'panel', typy: [], dni: 1 });

  const pamiec = {
    czytaj(k, domyslna) { try { const t = localStorage.getItem(k); return t === null ? domyslna : JSON.parse(t); } catch (e) { return domyslna; } },
    zapisz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bez pamięci terminal działa online */ } },
  };

  // ---- sygnał dźwiękowy: wspólny zestaw GK (gk-dzwieki.js — żadna aplikacja nie ma własnego generatora, test t_dzwieki):
  // „sukces” = przyjęte, „blad” = problem albo spóźnienie. Pierwsze naciśnięcie klawisza (skan) odblokowuje dźwięk przeglądarki.
  const DZWIEK_OK = 'sukces', DZWIEK_BLAD = 'blad';
  function pisk(rodzaj) { try { if (window.GKDzwieki) window.GKDzwieki.zagraj(rodzaj); } catch (e) { /* bez dźwięku też działa */ } }

  // ---- ekran
  let zegarKoniec = 0;
  function rysujZegar() {
    const t = new Date();
    $('zegar').textContent = t.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $('data').textContent = t.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (zegarKoniec && Date.now() > zegarKoniec) pokaz('', '', '');
  }
  setInterval(rysujZegar, 1000);

  function pokaz(rodzaj, tekst, podpis) {
    $('terminal').className = rodzaj;
    $('komunikat').textContent = tekst || 'Zeskanuj kartę…';
    $('podpis').textContent = podpis || '';
    zegarKoniec = rodzaj ? Date.now() + POKAZ_MS : 0;
  }

  function stan() {
    const kol = pamiec.czytaj(KLUCZ_KOLEJKI, []).length, odrz = pamiec.czytaj(KLUCZ_ODRZUCONYCH, []).length;
    const el = $('stan'), polaczony = !!(hala.polaczenie && hala.polaczenie.online);
    el.className = kol || odrz ? 'czeka' : (polaczony ? '' : 'blad');
    $('stan-tekst').textContent = [polaczony ? 'Połączony z serwerem' : 'Brak połączenia z serwerem',
      kol ? `${kol} skan(ów) czeka na wysłanie` : '', odrz ? `${odrz} odrzuconych (zgłoś kierownikowi)` : ''].filter(Boolean).join(' · ');
  }

  function nazwaRodzaju(r) { return r === 'wyjscie' ? 'WYJŚCIE' : 'WEJŚCIE'; }

  // ---- wysyłka
  // Brak odpowiedzi huba (fetch padł, limit czasu, bramka zamiast serwera) albo wygasła sesja (401) = skan zostaje w kolejce
  // terminala. Odmowa samego serwera (nieznana karta, 403…) to decyzja człowieka — nie ponawiamy jej w nieskończoność.
  function bladSieci(e) { return !e || !e.odHuba || e.kod === 401; }

  async function wyslij(karta, kiedy) {
    return hala.zapytaj('POST', '/api/v1/panel/rcp/odbicie', { karta, zeskanowano: kiedy });
  }

  let wysylka = Promise.resolve();
  function skan(karta) {
    const kiedy = new Date().toISOString();
    // Kolejka: skany idą jeden po drugim, w kolejności przyłożenia (dwa naraz mogłyby się wyprzedzić).
    wysylka = wysylka.then(() => obsluz(karta, kiedy));
  }

  async function obsluz(karta, kiedy) {
    try {
      const w = await wyslij(karta, kiedy);
      if (w.powtorzone) { pokaz('uwaga', 'Już odbito', `${w.nazwa} — ${nazwaRodzaju(w.rodzaj)} ${w.czas_lokalny || ''}`.trim()); pisk(DZWIEK_BLAD); return; }
      // Wejście po starcie zmiany (6:00 / 14:00 / 22:00) to spóźnienie — mówimy to od razu, żeby nikt nie dowiedział się po fakcie.
      const spoznienie = w.rodzaj === 'wejscie' && w.spoznienie_min > 0;
      pokaz(spoznienie ? 'uwaga' : 'ok', `${nazwaRodzaju(w.rodzaj)} ${w.czas_lokalny}`,
            spoznienie ? `${w.nazwa} — spóźnienie ${w.spoznienie_min} min (zmiana ${w.zmiana})` : w.nazwa);
      if (w.uwaga === 'poprzednie_bez_wyjscia') $('podpis').textContent += ' — poprzedni dzień bez wyjścia, zgłoś kierownikowi';
      pisk(spoznienie ? DZWIEK_BLAD : DZWIEK_OK);
    } catch (e) {
      if (bladSieci(e)) {
        const k = pamiec.czytaj(KLUCZ_KOLEJKI, []);
        k.push({ karta, zeskanowano: kiedy });
        pamiec.zapisz(KLUCZ_KOLEJKI, k.slice(-MAKS_KOLEJKA));
        pokaz('uwaga', 'Zapisano na terminalu', 'Brak połączenia — odbicie wyśle się samo. Nazwisko pokaże się później.');
        pisk(DZWIEK_OK);
      } else {
        pokaz('blad', (e && e.message) || 'Nie udało się odbić. Przyłóż kartę jeszcze raz.', '');
        pisk(DZWIEK_BLAD);
      }
    }
    stan();
  }

  let wTrakcie = false;
  async function oprozniKolejke() {
    if (wTrakcie) return;
    wTrakcie = true;
    try {
      let k = pamiec.czytaj(KLUCZ_KOLEJKI, []);
      while (k.length) {
        const [pierwszy, ...reszta] = k;
        try {
          await wyslij(pierwszy.karta, pierwszy.zeskanowano);
        } catch (e) {
          if (bladSieci(e)) break;                       // dalej brak sieci — spróbujemy za chwilę
          const o = pamiec.czytaj(KLUCZ_ODRZUCONYCH, []);   // serwer odmówił (nieznana karta itp.) — zostaje do wglądu
          o.push({ karta: pierwszy.karta, zeskanowano: pierwszy.zeskanowano, powod: (e && e.message) || '' });
          pamiec.zapisz(KLUCZ_ODRZUCONYCH, o.slice(-100));
        }
        k = reszta;
        pamiec.zapisz(KLUCZ_KOLEJKI, k);
      }
    } finally { wTrakcie = false; stan(); }
  }
  setInterval(() => { if ($('terminal').hidden === false) oprozniKolejke(); }, PONOW_MS);

  // ---- czytnik jako klawiatura
  let bufor = '', czasomierz = null;
  function zakoncz() {
    clearTimeout(czasomierz); czasomierz = null;
    const odczyt = bufor; bufor = '';
    if (odczyt.length >= MIN_CYFR) skan(odczyt);
  }
  document.addEventListener('keydown', ev => {
    if ($('terminal').hidden) return;                  // przy logowaniu pola działają normalnie
    if (ev.key === 'Enter') { ev.preventDefault(); zakoncz(); return; }
    if (/^[0-9]$/.test(ev.key)) {
      ev.preventDefault();
      bufor += ev.key;
      clearTimeout(czasomierz);
      czasomierz = setTimeout(zakoncz, CISZA_MS);
    }
  });

  // ---- logowanie kontem ekranu i start
  function pokazSesje() {
    const z = hala.zalogowany();
    $('logowanie').hidden = z;
    $('terminal').hidden = !z;
    if (z) { rysujZegar(); oprozniKolejke(); }
    stan();
  }
  $('formularz-logowania').addEventListener('submit', async ev => {
    ev.preventDefault();
    const blad = $('blad-logowania');
    blad.hidden = true;
    try {
      await hala.zaloguj({ identyfikator: $('identyfikator').value.trim(), pin: $('haslo').value });
      $('haslo').value = '';
    } catch (e) {
      blad.textContent = (e && e.message) || 'Nie udało się zalogować.';
      blad.hidden = false;
    }
  });
  hala.na('sesja', pokazSesje);
  hala.na('polaczenie', () => { stan(); if (hala.zalogowany()) oprozniKolejke(); });
  await hala.start();
  pokazSesje();
})();
