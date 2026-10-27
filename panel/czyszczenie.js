/* Panel Kierownika — okno „🧹 Czyszczenie zleceń” (Zlecenia → 🧹 Czyszczenie; tylko administrator).

   Właściciel 2026-10-27: „usuń historię zadań z wczoraj i dziś z 1 zmiany” i „funkcja czyszczenia ma być dostępna w zleceniach, nie głęboko
   w ustawieniach”. Usuwa zlecenia zlecone PRZED wybraną chwilą — zapisanych (stałych) zleceń i zaplanowanych na później nie rusza.
   Najpierw liczy (nic nie zmienia), dopiero potem, po potwierdzeniu, serwer robi pełną kopię bazy i usuwa. Serwer odmawia każdej roli
   poza administratorem (POST /api/v1/admin/zlecenia/wyczysc → 403), a przycisk widzi tylko administrator. */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;

  let wynik = null;
  const dostepne = () => ((hala.pracownik && hala.pracownik.role) || []).includes('admin');

  // Domyślnie „do tej chwili” (cała dotychczasowa historia); chwilę w przyszłości serwer odrzuca, a zapisane zlecenia zleci sam dalej.
  const domyslnie = () => W.poleCzasu(hala.teraz() - 60000);

  function rysujWynik() {
    const el = $('czysc-wynik');
    if (!wynik) { el.innerHTML = ''; return; }
    const c = wynik;
    const statusy = Object.entries(c.statusy || {}).map(([k, v]) => `${esc(k)}: ${v}`).join(', ');
    el.innerHTML = c.usunieto
      ? `<p class="ok-tekst"><b>Usunięto ${c.liczba} zleceń.</b> Kopia bazy sprzed czyszczenia: <code>${esc(c.kopia)}</code> (folder Odlozone obok bazy). Telefony wczytają dane od nowa.</p>`
      : c.liczba
        ? `<p>Do usunięcia: <b>${c.liczba}</b> zleceń${c.najstarsze ? ` (od ${esc(W.dataKrotka(c.najstarsze))} ${esc(W.godzina(c.najstarsze))} do ${esc(W.dataKrotka(c.najnowsze))} ${esc(W.godzina(c.najnowsze))})` : ''}
            <span class="slaby">— ${statusy}</span></p>
          ${c.przyklady.length ? `<p class="slaby">Ostatnie: ${c.przyklady.map(esc).join(' · ')}</p>` : ''}
          <div class="admin-pasek"><button type="button" class="maly czerwony" data-akcja="czysc-usun">Usuń ${c.liczba} zleceń</button></div>`
        : '<p class="slaby">Nie ma takich zleceń — nic do usunięcia.</p>';
  }

  async function wykonaj(usun) {
    const pole = $('czysc-przed');
    const przed = pole.value ? W.czasZPola(pole.value) : null;
    if (!przed) { P.komunikat('Wybierz dzień i godzinę.', 'blad'); return; }
    if (usun && !(await P.potwierdz('Usunąć zlecenia?', `${wynik ? wynik.liczba : ''} zleceń zleconych przed ${pole.value.replace('T', ' ')} zniknie z Panelu i telefonów. `
      + 'Serwer najpierw robi pełną kopię bazy. Zapisanych zleceń nie rusza.', 'Usuń'))) return;
    try {
      wynik = await hala.admin('POST', '/api/v1/admin/zlecenia/wyczysc', { przed, potwierdz: !!usun });
      rysujWynik();
      if (usun) { P.komunikat(`Usunięto ${wynik.liczba} zleceń`, 'ok'); P.pokazZlecenia(null, 'biezace'); }
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  }

  function otworz() {
    if (!dostepne()) return;
    wynik = null; rysujWynik();
    $('czysc-przed').value = domyslnie();
    $('okno-czyszczenia').showModal();
  }

  $('okno-czyszczenia').addEventListener('click', ev => {
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    ev.preventDefault();
    if (b.dataset.akcja === 'czysc-policz') { wynik = null; wykonaj(false); }
    if (b.dataset.akcja === 'czysc-usun') wykonaj(true);
  });
  $('okno-czyszczenia').querySelector('[data-zamknij]').addEventListener('click', () => $('okno-czyszczenia').close());
  hala.na('sesja', () => { wynik = null; if ($('okno-czyszczenia').open) $('okno-czyszczenia').close(); });

  P.widoki.czyszczenie = { otworz, dostepne };
})();
