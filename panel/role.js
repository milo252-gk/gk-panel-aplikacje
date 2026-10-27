/* Panel Kierownika — okno „🔐 Role i uprawnienia” (☰ Więcej; każdy, kto ma Panel).

   Właściciel 2026-10-27: „zdefiniuj, jakie dostępy i do jakich opcji mają poszczególne role, żeby trzymać ten standard.
   Niech będzie to opisane w samej aplikacji.” Tabela jest liczona z kontraktu (W.uprawnienia): role zapisane w zdarzeniach,
   słownikach i aplikacjach plus katalog funkcji stale.uprawnienia — to samo, co egzekwuje serwer. Na górze zasady standardu,
   pod nimi opis ról, a niżej funkcje w grupach: ✓ wolno, ◐ tylko w swoim dziale, — nie. Swoja rola jest podświetlona. */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;

  const ZNAK = { tak: ['✓', 'Wolno'], dzial: ['◐', 'Tylko w swoim dziale'], nie: ['—', 'Nie wolno'] };

  function rysuj() {
    const u = W.uprawnienia(hala.kontrakt);
    const moje = new Set((hala.pracownik && hala.pracownik.role) || []);
    const naglowek = u.role.map(r => `<th scope="col" class="${moje.has(r.kod) ? 'moja-rola' : ''}" title="${esc(r.opis)}"><span>${esc(r.nazwa)}</span></th>`).join('');
    $('role-tresc').innerHTML = `
      <section class="role-zasady"><h3>Zasady</h3><ol>${u.zasady.map(z => `<li>${esc(z)}</li>`).join('')}</ol></section>
      <section class="role-opisy"><h3>Kto jest kim</h3><dl>${u.role.map(r => `<dt class="${moje.has(r.kod) ? 'moja-rola' : ''}">${esc(r.nazwa)}${moje.has(r.kod) ? ' <span class="znacznik ok">to Ty</span>' : ''}</dt><dd>${esc(r.opis)}</dd>`).join('')}</dl></section>
      <p class="slaby role-legenda"><b>✓</b> wolno · <b>◐</b> tylko w swoim dziale · <b>—</b> nie wolno. Administrator może wszystko, ale tylko on ma konfigurację i serwis.</p>
      <div class="role-tabela-opak"><table class="role-tabela"><thead><tr><th scope="col">Funkcja</th>${naglowek}</tr></thead>
        ${u.grupy.map(g => `<tbody><tr class="role-grupa"><th colspan="${u.role.length + 1}" scope="colgroup">${esc(g.nazwa)}</th></tr>
          ${g.wiersze.map(w => `<tr${w.tylkoAdmin ? ' class="tylko-admin"' : ''}><th scope="row">${esc(w.nazwa)}${w.opis ? `<span class="slaby role-opis">${esc(w.opis)}</span>` : ''}</th>
            ${u.role.map(r => { const [z, t] = ZNAK[w.komorki[r.kod]] || ZNAK.nie; return `<td class="rola-${esc(w.komorki[r.kod])}${moje.has(r.kod) ? ' moja-rola' : ''}" title="${esc(t)}" aria-label="${esc(r.nazwa)}: ${esc(t)}">${z}</td>`; }).join('')}</tr>`).join('')}</tbody>`).join('')}
      </table></div>`;
  }

  function otworz() { rysuj(); $('okno-roli').showModal(); }
  $('okno-roli').querySelector('[data-zamknij]').addEventListener('click', () => $('okno-roli').close());

  // Wiersze zależą od kontraktu (jeden na zalogowanie), więc rysujemy przy otwarciu; po wylogowaniu nie zostaje nic w stronie.
  hala.na('sesja', () => { $('role-tresc').innerHTML = ''; if ($('okno-roli').open) $('okno-roli').close(); });

  P.widoki.role = { otworz, rysuj, dostepne: () => !!(hala.pracownik && hala.pracownik.role) };
})();
