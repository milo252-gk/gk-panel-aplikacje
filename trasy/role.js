/* GK Trasy — okno „Role i uprawnienia” (2026-11-18, decyzja właściciela). Tylko odczyt; niczego nie zmienia.

   Wzór: panel/web/role.js w Panelu Zarządczym GK. Tabela przychodzi z GET /api/role (trasex.py → tabela_rol) i jest
   LICZONA z reguł, które egzekwuje serwer (progi ról przy endpointach, listy PODGLAD_*), a nie wpisana drugi raz — więc
   nie rozjedzie się z kodem. ✓ wolno, ◐ wolno w ograniczonym zakresie (opis w dymku komórki i pod tabelą), — nie wolno.
   Otwiera się z „Moje konto” (biuro i administrator). Rola zalogowanej osoby jest podświetlona; Menedżer widzi przy
   wierszu „Szef Sprzedaży” znacznik „Menedżer to Ty” (te same uprawnienia, inna nazwa konta — 2026-11-27). */

// Przegląd UI 2026-11-27: wolno = ikona haczyka, w ograniczonym zakresie = pół koła (gk-ikony.js), jak w Panelu; „—” zostaje kreską.
const ZNAKI_ROLI = { tak: [ikonka('haczyk', 18), 'Wolno'], czesc: [ikonka('pol-kola', 18), 'Wolno w ograniczonym zakresie'], nie: ['—', 'Nie wolno'] };

async function otworzRole(wroc) {
  const d = await API.get('/api/role');
  const moja = d.moja_rola || (stan.uz && stan.uz.rola) || '';
  // Menedżer z Panelu ma w Trasach rolę `admin` (nazwa roli „Szef Sprzedaży”), ale jego KONTO nazywa się „Menedżer”
  // (`etykieta_roli`, właściciel 2026-11-19 „Rozróżnij w Trasach”). Znacznik mówi więc „Menedżer to Ty”, nie „Szef Sprzedaży to Ty”.
  const mojaEtykieta = d.moja_etykieta || (stan.uz && stan.uz.etykieta_roli) || '';
  const toTy = r => (mojaEtykieta && mojaEtykieta !== r.nazwa ? `${escHtml(mojaEtykieta)} to Ty` : 'to Ty');
  const wTytule = r => `${escHtml(r.nazwa)}${r.kod === moja ? ` <span class="znacznik ok">${toTy(r)}</span>` : ''}`;
  const komorka = (w, r) => {
    const [znak, tekst] = ZNAKI_ROLI[w.komorki[r.kod]] || ZNAKI_ROLI.nie;
    const uwaga = (w.uwagi || {})[r.kod];
    const opis = uwaga ? `${tekst}: ${uwaga}` : tekst;
    return `<td class="rola-${escHtml(w.komorki[r.kod])}${r.kod === moja ? ' moja-rola' : ''}" title="${escHtml(opis)}"
      aria-label="${escHtml(r.nazwa)}: ${escHtml(opis)}">${znak}${uwaga ? `<span class="rola-uwaga">${escHtml(uwaga)}</span>` : ''}</td>`;
  };
  const tabela = d.grupy.map(g => `<tbody><tr class="role-grupa"><th colspan="${d.role.length + 1}" scope="colgroup">${escHtml(g.nazwa)}</th></tr>
      ${g.wiersze.map(w => `<tr><th scope="row">${escHtml(w.nazwa)}</th>${d.role.map(r => komorka(w, r)).join('')}</tr>`).join('')}</tbody>`).join('');
  okno({
    tytul: 'Role i uprawnienia',
    szerokie: true,
    tresc: `
      <section class="role-zasady"><h3>Zasady</h3><ol>${d.zasady.map(z => `<li>${escHtml(z)}</li>`).join('')}</ol></section>
      <section class="role-opisy"><h3>Kto jest kim</h3><dl>${d.role.map(r => `<dt class="${r.kod === moja ? 'moja-rola' : ''}">${wTytule(r)}</dt><dd>${escHtml(r.opis)}</dd>`).join('')}</dl></section>
      <p class="slaby male role-legenda"><b>${ikonka('haczyk')}</b> wolno · <b>${ikonka('pol-kola')}</b> wolno w ograniczonym zakresie (opis w komórce) · <b>—</b> nie wolno. To podgląd reguł, które i tak egzekwuje serwer — tu niczego nie zmienisz.</p>
      <div class="tabela-przewijana role-tabela-opak"><table class="role-tabela">
        <thead><tr><th scope="col">Funkcja</th>${d.role.map(r => `<th scope="col" class="${r.kod === moja ? 'moja-rola' : ''}" title="${escHtml(r.opis)}">${escHtml(r.nazwa)}</th>`).join('')}</tr></thead>
        ${tabela}
      </table></div>`,
    przyciski: wroc
      ? [{ napis: 'Wróć do konta', klik: z => { z(); wroc(); } }, { napis: 'Zamknij', klik: z => z() }]
      : [{ napis: 'Zamknij', klik: z => z() }],
  });
}
