/* Wspólne klocki ekranu „Nie wysłane” w Panelu, Liderze, UR i KJ (etap 3 planu poprawy, 2026-11-09).

   Dotąd każda aplikacja miała własną listę odrzuconych zapisów — bez „Spróbuj ponownie” i bez słowa o zdjęciach, które
   serwer odrzucił. Teraz wszystkie rysują to samo:
     * przy każdym odrzuconym zapisie przycisk „Spróbuj ponownie” (hala.ponowOdrzucone — ten sam uuid wraca do kolejki);
     * sekcja „Zdjęcia nie wysłane” z powodem, „Spróbuj ponownie” (hala.ponowPlik) i „Usuń z listy” (hala.usunOdrzuconyPlik);
     * jedna reguła komunikatu po „Spróbuj ponownie” (zapis wraca do kolejki albo „nie ma już takiego zapisu”).

   Użycie (aplikacja rysuje listę po swojemu i dokłada):
       HalaKolejkaUI.przyciskPonow(id)                  // HTML przycisku przy zapisie
       HalaKolejkaUI.zdjeciaHtml(await hala.odrzuconePliki())
       HalaKolejkaUI.podlacz(korzen, hala, { odswiez, komunikat })   // raz na element z listą (delegacja kliknięć)
   Czyste funkcje (testy: reduktor-testy.js). */

(function (global) {
  'use strict';

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const przyciskPonow = id => `<button type="button" class="maly" data-ponow-odrzucone="${esc(id)}">Spróbuj ponownie</button>`;

  function rozmiar(b) {
    if (!b) return '';
    return b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
  }

  /* Sekcja zdjęć odrzuconych przez serwer; pusta lista → pusty napis (nic nie rysujemy). */
  function zdjeciaHtml(lista) {
    if (!lista || !lista.length) return '';
    return `<h3>Zdjęcia nie wysłane</h3>
      <p class="slaby">Serwer nie przyjął tych zdjęć. „Spróbuj ponownie” wysyła je jeszcze raz (np. po poprawie połączenia); „Usuń z listy” kasuje je z telefonu.</p>
      <ul class="lista-prosta">${lista.map(p => `<li><b>Zdjęcie</b> <span class="slaby">${esc(rozmiar(p.rozmiar))}</span>
        <div class="tekst-alarm">${esc(p.powod)}</div>
        <button type="button" class="maly" data-ponow-plik="${esc(p.id)}">Spróbuj ponownie</button>
        <button type="button" class="maly" data-usun-plik="${esc(p.id)}">Usuń z listy</button></li>`).join('')}</ul>`;
  }

  /* Delegacja kliknięć w elemencie z listą. opcje: { odswiez() — przerysuj listę, komunikat(tekst, rodzaj) }. */
  function podlacz(korzen, hala, opcje) {
    const o = Object.assign({ odswiez: () => {}, komunikat: () => {} }, opcje || {});
    if (!korzen || korzen.__halaKolejkaUI) return;
    korzen.__halaKolejkaUI = true;
    korzen.addEventListener('click', async ev => {
      const cel = ev.target && ev.target.closest ? ev.target.closest('[data-ponow-odrzucone], [data-ponow-plik], [data-usun-plik]') : null;
      if (!cel) return;
      try {
        if (cel.dataset.ponowOdrzucone) {
          const ok = await hala.ponowOdrzucone(cel.dataset.ponowOdrzucone);
          o.komunikat(ok ? 'Zapis wrócił do kolejki — wyślę go jeszcze raz' : 'Tego zapisu nie ma już na liście', ok ? 'ok' : 'uwaga');
        } else if (cel.dataset.ponowPlik) {
          const ok = await hala.ponowPlik(cel.dataset.ponowPlik);
          o.komunikat(ok ? 'Zdjęcie wróciło do kolejki — wyślę je jeszcze raz' : 'Tego zdjęcia nie ma już w telefonie', ok ? 'ok' : 'uwaga');
        } else if (cel.dataset.usunPlik) {
          await hala.usunOdrzuconyPlik(cel.dataset.usunPlik);
        }
      } catch (e) {
        o.komunikat((e && e.message) || 'Nie udało się. Spróbuj jeszcze raz.', 'blad');
      }
      o.odswiez();
    });
  }

  const HalaKolejkaUI = { przyciskPonow, zdjeciaHtml, podlacz, rozmiar };
  global.HalaKolejkaUI = HalaKolejkaUI;
  if (typeof module !== 'undefined' && module.exports) module.exports = HalaKolejkaUI;
})(typeof window !== 'undefined' ? window : globalThis);
