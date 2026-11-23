/* GK — przycisk X w nagłówku każdego okna <dialog> (unifikacja E8, właściciel 2026-11-23: „X w nagłówku wszystkich okien”, jak w GK Trasy).

   Jedno miejsce zamiast X-a w każdym oknie z osobna: przy showModal() dopisujemy do okna przycisk „Zamknij okno”, o ile ma nagłówek
   (h2/h3) i nie jest przeglądarką zdjęć. X zachowuje się jak klawisz Esc (requestClose → zdarzenie „cancel”, a tam, gdzie go nie ma,
   zwykłe close()), więc okna, które pytają o niezapisane dane albo sprzątają po „close”, działają tak samo. Okna budowane od nowa
   (innerHTML) dostają X ponownie — pilnuje tego MutationObserver na dziecku okna. Bez zmian w danych i kolejce zapisów. */
(function () {
  'use strict';
  if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype || !HTMLDialogElement.prototype.showModal) return;
  if (HTMLDialogElement.prototype.showModal.__gkX) return;
  const IKONA = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const POMIN = ['okno-zdjecia', 'hala-zamkniecie'];

  function zamknij(d) {
    if (typeof d.requestClose === 'function') d.requestClose();
    else d.close();
  }

  function dodajX(d) {
    if (!d || d.querySelector(':scope > .okno-x')) return;
    if (POMIN.some(k => d.classList.contains(k))) return;
    if (!d.querySelector('h2, h3')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'okno-x';
    b.setAttribute('aria-label', 'Zamknij okno');
    b.title = 'Zamknij';
    b.innerHTML = IKONA;
    b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); zamknij(d); });
    d.insertBefore(b, d.firstChild);
    d.classList.add('ma-x');
  }

  const obserwowane = new WeakSet();
  function pilnuj(d) {
    if (obserwowane.has(d) || typeof MutationObserver === 'undefined') return;
    obserwowane.add(d);
    new MutationObserver(() => dodajX(d)).observe(d, { childList: true });
  }

  const oryginal = HTMLDialogElement.prototype.showModal;
  function showModal() {
    try { dodajX(this); pilnuj(this); } catch (e) { /* X to dodatek — okno ma się otworzyć mimo błędu */ }
    return oryginal.apply(this, arguments);
  }
  showModal.__gkX = true;
  HTMLDialogElement.prototype.showModal = showModal;
})();
