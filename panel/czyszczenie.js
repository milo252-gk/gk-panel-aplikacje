/* Panel Kierownika — okno „🧹 Czyszczenie zleceń” (Zlecenia → 🧹 Czyszczenie, Administracja → Dane; tylko administrator).

   Właściciel 2026-10-27: „usuń historię zadań z wczoraj i dziś z 1 zmiany”; 2026-11-09: „brakuje usunięcia zamkniętych, a wybór
   zleceń jest niejasny”. Dlatego jedna lista w trzech krokach: (1) które pokazać — Zakończone (zamknięte, odwołane, przepadłe;
   domyślnie), W toku albo Wszystkie, z liczbą na każdym przycisku, i od kiedy (kiedykolwiek / sprzed dzisiaj / starsze niż 7 / 30 dni);
   (2) zaznacz zlecenia — pole przy każdym, „Zaznacz wszystkie widoczne”, licznik „Zaznaczono N z M”; (3) „Usuń zaznaczone (N)”.
   Zapisanych (stałych) zleceń i zaplanowanych na później to okno nie pokazuje i nie rusza. Serwer przed usunięciem robi pełną kopię
   bazy i odmawia każdej roli poza administratorem (POST /api/v1/admin/zlecenia/wyczysc → 403). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;

  const dostepne = () => ((hala.pracownik && hala.pracownik.role) || []).includes('admin');

  const GRUPY = [['zakonczone', 'Zakończone'], ['w_toku', 'W toku'], ['wszystkie', 'Wszystkie']];
  const WIEK = [['', 'kiedykolwiek'], ['dzis', 'sprzed dzisiaj'], ['7', 'starsze niż 7 dni'], ['30', 'starsze niż 30 dni']];
  const STATUSY = { zamkniete: 'Zamknięte', anulowane: 'Odwołane', przepadlo: 'Przepadło', nowe: 'Nowe', przyjete: 'Przyjęte',
                    wykonane: 'Zrobione — czeka na odbiór', odrzucone: 'Dział nie może', rozdzielone: 'Rozdzielone' };
  const KONCOWE = new Set(['zamkniete', 'anulowane', 'przepadlo']);

  const pusty = () => ({ grupa: 'zakonczone', wiek: '', pozycje: [], liczby: { zakonczone: 0, w_toku: 0, wszystkie: 0 }, ucieto: false });
  let stan = pusty();

  // „Od kiedy” → chwila, przed którą zlecono (ISO), albo pusty tekst (bez ograniczenia).
  function granicaWieku() {
    if (!stan.wiek) return '';
    const teraz = hala.teraz();
    if (stan.wiek === 'dzis') { const d = new Date(teraz); d.setHours(0, 0, 0, 0); return d.toISOString(); }
    return new Date(teraz - Number(stan.wiek) * 86400000).toISOString();
  }

  const zaznaczone = () => [...$('czysc-lista').querySelectorAll('[data-zlecenie]:checked')].map(x => x.dataset.zlecenie);

  function rysujNaglowek() {
    $('czysc-grupy').innerHTML = GRUPY.map(([k, n]) =>
      `<button type="button" class="chip" data-grupa="${k}" aria-pressed="${stan.grupa === k}">${n} (${stan.liczby[k] || 0})</button>`).join('');
    $('czysc-wiek').innerHTML = WIEK.map(([k, n]) => `<option value="${k}" ${stan.wiek === k ? 'selected' : ''}>${n}</option>`).join('');
    $('czysc-ostrzezenie').hidden = stan.grupa === 'zakonczone';
  }

  function odswiezLicznik() {
    const n = zaznaczone().length;
    $('czysc-licznik').textContent = `Zaznaczono ${n} z ${stan.pozycje.length}`;
    const b = $('czysc-usun');
    b.disabled = !n;
    b.textContent = n ? `Usuń zaznaczone (${n})` : 'Usuń zaznaczone';
  }

  function rysujListe() {
    const el = $('czysc-lista');
    if (!stan.pozycje.length) {
      el.innerHTML = '<p class="slaby" style="padding:10px 12px">Nie ma takich zleceń — nic do usunięcia.</p>';
    } else {
      el.innerHTML = stan.pozycje.map(z => `<label class="czysc-wiersz">
        <input type="checkbox" data-zlecenie="${esc(z.id)}">
        <span class="czysc-tekst"><b>${esc(z.tytul || '(bez nazwy)')}</b>${z.czesc ? ' <span class="slaby">(część większego zlecenia)</span>' : ''}
          <span class="slaby">${esc(STATUSY[z.status] || z.status || '')} · ${esc(W.dataKrotka(z.czas))} ${esc(W.godzina(z.czas))}${z.dzial ? ' · ' + esc(z.dzial) : ''}</span></span>
        <span class="czysc-znacznik ${KONCOWE.has(z.status) ? '' : 'w-toku'}">${KONCOWE.has(z.status) ? 'zakończone' : 'w toku'}</span></label>`).join('');
    }
    $('czysc-ucieto').hidden = !stan.ucieto;
    odswiezLicznik();
  }

  async function wczytaj() {
    try {
      const d = await hala.admin('POST', '/api/v1/admin/zlecenia/wyczysc', { lista: true, grupa: stan.grupa, przed: granicaWieku() });
      stan.pozycje = d.zlecenia || [];
      stan.liczby = d.liczby || stan.liczby;
      stan.ucieto = !!d.ucieto;
      rysujNaglowek();
      rysujListe();
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  }

  async function usun() {
    const ids = zaznaczone();
    if (!ids.length) return;
    const wToku = stan.pozycje.filter(z => ids.includes(z.id) && !KONCOWE.has(z.status)).length;
    const opis = `${ids.length} zleceń zniknie z Panelu i telefonów, razem z historią. Serwer najpierw robi pełną kopię bazy i zostawia ją na swoim dysku w folderze Odlozone (5 ostatnich, najwyżej 90 dni) — to cała baza, także klucze i skróty haseł, więc nie wysyłaj jej nikomu.`
      + (wToku ? ` Uwaga: ${wToku} z nich dział jeszcze robi.` : '');
    if (!(await P.potwierdz('Usunąć zaznaczone zlecenia?', opis, 'Usuń'))) return;
    try {
      const d = await hala.admin('POST', '/api/v1/admin/zlecenia/wyczysc', { ids, potwierdz: true });
      P.komunikat(`Usunięto ${d.liczba} zleceń. Kopia bazy: ${d.kopia}`, 'ok');
      P.pokazZlecenia(null, 'biezace');
      await wczytaj();
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  }

  function otworz() {
    if (!dostepne()) return;
    stan = pusty();
    $('okno-czyszczenia').showModal();
    wczytaj();
  }

  const okno = $('okno-czyszczenia');
  okno.addEventListener('click', ev => {
    const g = ev.target.closest('[data-grupa]');
    if (g) { ev.preventDefault(); stan.grupa = g.dataset.grupa; wczytaj(); return; }
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    ev.preventDefault();
    if (b.dataset.akcja === 'czysc-wszystkie') { okno.querySelectorAll('[data-zlecenie]').forEach(x => { x.checked = true; }); odswiezLicznik(); }
    if (b.dataset.akcja === 'czysc-zadne') { okno.querySelectorAll('[data-zlecenie]').forEach(x => { x.checked = false; }); odswiezLicznik(); }
    if (b.dataset.akcja === 'czysc-usun') usun();
  });
  okno.addEventListener('change', ev => {
    if (ev.target.id === 'czysc-wiek') { stan.wiek = ev.target.value; wczytaj(); }
    else if (ev.target.matches('[data-zlecenie]')) odswiezLicznik();
  });
  okno.querySelector('[data-zamknij]').addEventListener('click', () => okno.close());
  hala.na('sesja', () => { stan.pozycje = []; if (okno.open) okno.close(); });

  P.widoki.czyszczenie = { otworz, dostepne };
})();
