/* GK — jeden zestaw ikon dla wszystkich aplikacji (STYL-GK §8, 2026-11-04; przebudowany 2026-11-19).
   Właściciel: „UI i umiejscowienie tych samych opcji ma być spójne” — emoji (Windows rysuje je kolorowo i różnie) i znaki tekstowe
   (✓ ✕ ▸ ▣ ⚠ …) zastąpione jednolitymi ikonami liniowymi: siatka 24×24, kreska 2 px, zaokrąglone końce i łączenia, `currentColor`
   (ciemny motyw i kolory znaczenia działają bez dodatkowej pracy). Zestaw ma ikony na CAŁY interfejs: akcje (haczyk, zamknij, plus,
   edytuj, kosz, zapisz, drukuj…), nawigację (strzałki, szewrony), obiekty (dokument, zdjęcie, mapa, auto, ciężarówka, fabryka…) i stany
   (ostrzeżenie, klepsydra, zegar, dzwonek, głośnik, stop).
   Użycie (API bez zmian, tylko dopisywanie):
     GKIkony.html('haczyk')              → `<svg …>` do wstawienia w HTML (rozmiar 20 px, `GKIkony.html('haczyk', 24)`),
     <span data-ikona="haczyk"></span>   → `GKIkony.wypelnij(korzen)` (wołane samo po załadowaniu strony) wstawia SVG do spanów.
   Rozmiar ≤ 16 px: kreska 2,5 (zamiast 2 — przy 16 px 2 daje ok. 1,3 px) i, tam gdzie drobny detal by się zlał (kalendarz, kody, ratunek,
   dane, administracja), uproszczony rysunek (IKONY_MALE). Szewrony i strzałki są jednym rysunkiem w czterech kierunkach — obrót robi
   się tu (nazwy `-prawo/-dol/-gora/-lewo`), nie w CSS.
   Aliasy (ALIASY): stare i synonimiczne nazwy wskazują jeden rysunek (`plan` = `kalendarz`, `wskazniki` = `kpi`, `ostrzezenie` = `awaria`,
   `poczta` = dawna koperta…). Stare nazwy działają dalej; nowe ikony dopisujemy tu, w jednym miejscu.
   Pochodzenie ścieżek: znaczna część to glify Feather (MIT, © Cole Bemis) i Lucide (ISC, © Lucide Contributors; część Lucide to
   fork Feather © Cole Bemis, MIT) — bez zmiany znaczenia, w siatce 24 i z kreską 2; reszta (pulpit, administracja, kody, urlop,
   czyszczenie, pozostałe) narysowana na miejscu w tym samym stylu. Pełne teksty licencji: https://github.com/feathericons/feather/blob/main/LICENSE
   i https://github.com/lucide-icons/lucide/blob/main/LICENSE — licencje wymagają zachowania tej noty przy kopiowaniu ścieżek.
   W GK Trasy i GK Flota `web/gk-ikony.js` to kopia 1:1 tego pliku (pilnuje `.github/spojnosc.py`). Ikona osoby w oknie „Moje konto”
   (kanoniczna, wypełniona) żyje osobno w `konto.js` — tu jest jej odpowiednik liniowy (`osoba`). */
(function (global) {
  'use strict';

  // Tylko wnętrze <svg>: ścieżki i kształty. Wszystkie w jednym stylu (obrys, bez wypełnienia).
  const IKONY = {
    // ---- nawigacja i obiekty (pierwotny zestaw; kilka rysunków poprawionych, nazwy bez zmian)
    pulpit: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    zlecenia: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
    raporty: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    administracja: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    awaria: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    wiecej: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    // „zmiana” = okres pracy (zegar z cofającą strzałką); stary rysunek (kółko z haczykiem) żyje dalej jako `ok-kolo`.
    zmiana: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    'ok-kolo': '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4L12 14l-3-3"/>',
    jakosc: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    przeglady: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    kpi: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    proba: '<path d="M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3"/><path d="M7.5 15h9"/>',
    alerty: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
    // reklamacje = dymek z wykrzyknikiem (koperta żyje dalej jako `poczta`).
    reklamacje: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v4M12 14h.01"/>',
    poczta: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    ciezarowka: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    pojazd: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    paczka: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    mapa: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    powtarzaj: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    odswiez: '<path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>',
    zegar: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    firma: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
    fabryka: '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M17 18h1M12 18h1M7 18h1"/>',
    // „lokalizacje” = miejsca (pinezka na podstawce); domek z dawnej wersji żyje dalej jako `dom`.
    lokalizacje: '<path d="M12 17s-5-4.4-5-8.5a5 5 0 0 1 10 0c0 4.1-5 8.5-5 8.5z"/><circle cx="12" cy="8.5" r="1.8"/><path d="M4 21h16"/>',
    dom: '<path d="M3 11l9-8 9 8"/><path d="M5 10v11h14V10M10 21v-6h4v6"/>',
    zaproszenie: '<circle cx="9" cy="8" r="4"/><path d="M1.5 21c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/><path d="M19 8v6M16 11h6"/>',
    konta: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.1.7 3.5 2.8 3.5 5.7"/>',
    osoba: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    aparat: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    galeria: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    ratunek: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M14.9 9.1l4.2-4.2M9.1 14.9l-4.2 4.2"/>',
    dane: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    kody: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4M21 17v1"/>',
    skan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
    kosz: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    szkolenia: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 9v6"/>',
    wyloguj: '<path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    // 2026-11-10 (zamiast emoji w chipach i przyciskach): zapisane, kalendarz, urlop, drukuj, czyszczenie, notatka, narzędzia.
    zapisane: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    kalendarz: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    urlop: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    drukuj: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    czyszczenie: '<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
    notatka: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v6h6M7 13h8M7 17h5"/>',
    narzedzia: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20M10 12v3h4v-3"/>',
    // 2026-11-10 (poprawki po audycie): dzwonek wyciszony, głośnik (dźwięk włączony / wyłączony), telefon, komputer, lista z haczykiem (checklista).
    'dzwonek-wyl': '<path d="M8.7 3A6 6 0 0 1 18 8c0 2.7.5 4.8 1 6"/><path d="M17 17H3s3-2 3-9c0-.8.1-1.5.4-2.2"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/><path d="M2 2l20 20"/>',
    // głośnik przesunięty o 1,5 w prawo — wcześniej fala dotykała prawego brzegu, a lewy bok był pusty (optyczne wyrównanie).
    glos: '<g transform="translate(1.5 0)"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></g>',
    'glos-wyl': '<g transform="translate(-.5 0)"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></g>',
    telefon: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    komputer: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    lista: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l3 3 5-6"/>',
    // ---- 2026-11-19: ikony zamiast znaków tekstowych i emoji (✓ ✕ ▸ ▣ ⚠ ⏳ 📎 📌 …) — mapowanie: docs/MAPOWANIE-IKON-2026-11-19.md
    haczyk: '<path d="M20 6L9 17l-5-5"/>',
    zamknij: '<path d="M18 6L6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    'strzalka-prawo': '<path d="M5 12h14M12 5l7 7-7 7"/>',
    'strzalka-lewo': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    'strzalka-gora': '<path d="M12 19V5M5 12l7-7 7 7"/>',
    'strzalka-dol': '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    'szewron-prawo': '<path d="M9 18l6-6-6-6"/>',
    'szewron-lewo': '<path d="M15 18l-6-6 6-6"/>',
    'szewron-dol': '<path d="M6 9l6 6 6-6"/>',
    'szewron-gora': '<path d="M18 15l-6-6-6 6"/>',
    edytuj: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    spinacz: '<path d="M21.4 11.05l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
    pinezka: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    'znacznik-miejsca': '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    ustawienia: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    zapisz: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    klepsydra: '<path d="M5 22h14M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4A2 2 0 0 0 7 17.8V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4A2 2 0 0 0 17 6.2V2"/>',
    odtworz: '<path d="M6 4l14 8-14 8z"/>',
    cofnij: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    zamiana: '<path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
    'pol-kola': '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z"/>',
    'telefon-sluchawka': '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    stop: '<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z"/><path d="M15 9l-6 6M9 9l6 6"/>',
    pobierz: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    backspace: '<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><path d="M18 9l-6 6M12 9l6 6"/>',
    zamek: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    licznik: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
    kabina: '<path d="M5 11V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4"/><path d="M3 13a2 2 0 0 1 4 0v3h10v-3a2 2 0 0 1 4 0v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M6 20v2M18 20v2"/>',
    podpis: '<path d="M3 17c3-6 5-9 6.5-9S10 11 11 13s2-1 3-3c.6 1 1.5 3 3 3"/><path d="M3 21h18"/>',
    pusto: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    przerwa: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><path d="M6 1v3M10 1v3M14 1v3"/>',
    podpowiedz: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    kolejnosc: '<path d="M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    filtr: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    szukaj: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'
  };

  // Uproszczone rysunki na ≤ 16 px (tam, gdzie drobny detal zlewa się w plamę).
  const IKONY_MALE = {
    kalendarz: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    kody: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M17 21h4M21 17v4"/>',
    ratunek: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>',
    dane: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/>',
    administracja: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M2 14h4M10 8h4M18 16h4"/>',
    kabina: '<path d="M5 11V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4"/><path d="M3 13a2 2 0 0 1 4 0v3h10v-3a2 2 0 0 1 4 0v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
  };

  // Synonimy: jeden rysunek, wiele nazw (stare nazwy zostają — kod aplikacji ich używa).
  const ALIASY = {
    plan: 'kalendarz', terminy: 'kalendarz',          // dublet: kalendarz z kropkami i bez — jeden rysunek
    wskazniki: 'kpi', wykres: 'kpi',                   // dublet: dwa wykresy — słupki
    ostrzezenie: 'awaria', uwaga: 'awaria',
    dzwonek: 'alerty', powiadomienia: 'alerty',
    glosnik: 'glos', 'glosnik-wyl': 'glos-wyl',
    dokument: 'raporty', plik: 'raporty',
    zdjecie: 'aparat', auto: 'pojazd',
    dyskietka: 'zapisz', drukarka: 'drukuj',
    powtorz: 'powtarzaj', menu: 'wiecej',
    dodaj: 'plus', usun: 'kosz', ok: 'haczyk', krzyz: 'zamknij',
    wstecz: 'strzalka-lewo', dalej: 'strzalka-prawo',
    skaner: 'skan', lupa: 'szukaj', miejsce: 'znacznik-miejsca', pin: 'pinezka',
    stoper: 'klepsydra', kawa: 'przerwa', zarowka: 'podpowiedz', sluchawka: 'telefon-sluchawka',
    inbox: 'pusto', obraz: 'galeria', play: 'odtworz'
  };
  // Zabezpieczenie: alias nie może zasłonić własnej ikony ani wskazywać na nieistniejącą.
  Object.keys(ALIASY).forEach(function (k) { if (k === ALIASY[k] || IKONY[k] || !IKONY[ALIASY[k]]) delete ALIASY[k]; });

  function nazwaGlowna(nazwa) { return IKONY[nazwa] ? nazwa : ALIASY[nazwa]; }

  function html(nazwa, rozmiar) {
    const glowna = nazwaGlowna(nazwa);
    if (!glowna) return '';
    const r = rozmiar || 20;
    const male = r <= 16;
    const wnetrze = (male && IKONY_MALE[glowna]) || IKONY[glowna];
    return '<svg viewBox="0 0 24 24" width="' + r + '" height="' + r + '" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="' + (male ? '2.5' : '2') + '" stroke-linecap="round" stroke-linejoin="round">' + wnetrze + '</svg>';
  }

  function wypelnij(korzen) {
    (korzen || document).querySelectorAll('[data-ikona]').forEach(function (el) {
      if (el.firstElementChild && el.firstElementChild.tagName.toLowerCase() === 'svg') return;
      el.innerHTML = html(el.getAttribute('data-ikona'), Number(el.getAttribute('data-rozmiar')) || 20);
      el.setAttribute('aria-hidden', 'true');
    });
  }

  global.GKIkony = { html: html, wypelnij: wypelnij, nazwy: Object.keys(IKONY).concat(Object.keys(ALIASY)), glowne: Object.keys(IKONY), aliasy: ALIASY };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { wypelnij(); });
    else wypelnij();
  }
})(typeof window !== 'undefined' ? window : this);
