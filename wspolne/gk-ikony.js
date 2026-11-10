/* GK — jeden zestaw ikon menu dla wszystkich aplikacji (STYL-GK §8, 2026-11-04).
   Właściciel: „UI i umiejscowienie tych samych opcji ma być spójne” — emoji (Windows rysuje je kolorowo i różnie) zastąpione
   jednolitymi ikonami liniowymi: kreska 2 px w `currentColor`, siatka 24×24, tak jak kanoniczne „Wyloguj” i ikona osoby.
   Użycie:
     GKIkony.html('pulpit')              → `<svg …>` do wstawienia w HTML (rozmiar 20 px, `GKIkony.html('pulpit', 24)`),
     <span data-ikona="pulpit"></span>   → `GKIkony.wypelnij(korzen)` (wołane samo po załadowaniu strony) wstawia SVG do spanów.
   W GK Trasy i GK Flota `web/gk-ikony.js` to kopia 1:1 tego pliku (pilnuje `.github/spojnosc.py`). Nowa ikona: dopisać tu, w jednym miejscu. */
(function (global) {
  'use strict';

  // Tylko wnętrze <svg>: ścieżki i kształty. Wszystkie w jednym stylu (obrys, bez wypełnienia).
  const IKONY = {
    pulpit: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    zlecenia: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
    wskazniki: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    raporty: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    administracja: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    awaria: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    wiecej: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    zmiana: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4L12 14l-3-3"/>',
    jakosc: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    przeglady: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    kpi: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    plan: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    proba: '<path d="M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3"/><path d="M7.5 15h9"/>',
    alerty: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
    reklamacje: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    ciezarowka: '<path d="M1 6h13v10H1z"/><path d="M14 9h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    paczka: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    mapa: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    powtarzaj: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    zegar: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    firma: '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5M9 10h.01M15 10h.01"/>',
    lokalizacje: '<path d="M3 11l9-8 9 8"/><path d="M5 10v11h14V10M10 21v-6h4v6"/>',
    zaproszenie: '<circle cx="9" cy="8" r="4"/><path d="M1.5 21c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/><path d="M19 8v6M16 11h6"/>',
    konta: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.1.7 3.5 2.8 3.5 5.7"/>',
    pojazd: '<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M3 12h18"/>',
    aparat: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    ratunek: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.2 3.2M15.2 15.2l3.2 3.2M18.4 5.6l-3.2 3.2M8.8 15.2l-3.2 3.2"/>',
    dane: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    kody: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4"/>',
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
    glos: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    'glos-wyl': '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>',
    telefon: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    komputer: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    lista: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l3 3 5-6"/>'
  };

  function html(nazwa, rozmiar) {
    const wnetrze = IKONY[nazwa];
    if (!wnetrze) return '';
    const r = rozmiar || 20;
    return '<svg viewBox="0 0 24 24" width="' + r + '" height="' + r + '" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + wnetrze + '</svg>';
  }

  function wypelnij(korzen) {
    (korzen || document).querySelectorAll('[data-ikona]').forEach(function (el) {
      if (el.firstElementChild && el.firstElementChild.tagName.toLowerCase() === 'svg') return;
      el.innerHTML = html(el.getAttribute('data-ikona'), Number(el.getAttribute('data-rozmiar')) || 20);
      el.setAttribute('aria-hidden', 'true');
    });
  }

  global.GKIkony = { html: html, wypelnij: wypelnij, nazwy: Object.keys(IKONY) };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { wypelnij(); });
    else wypelnij();
  }
})(typeof window !== 'undefined' ? window : this);
