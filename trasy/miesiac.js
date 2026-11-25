/* GK Trasy — „Kalendarz” miesiąca tras (2026-11-18, decyzja właściciela).

   Wzór: Kalendarz zleceń w Panelu Zarządczym GK. Siatka miesiąca od poniedziałku: w każdej kratce numer dnia, liczba tras
   i liczba punktów (czerwona kropka z liczbą — nieudane). Dotknięcie dnia otwiera ten dzień na ekranie Trasy.
   Dane z istniejącego GET /api/trasy?od=&do= (pola ile, ile_ok, ile_nie) — bez nowego endpointu, tylko odczyt. */

/* Dzień tygodnia (1 = poniedziałek … 7 = niedziela) jest dniem pracy zakładu: z ustawienia „Dni tygodnia”, domyślnie pn–pt.
   Dzień wolny w kalendarzu jest przezroczysty, ale trasa założona w taki dzień nadal się pokazuje. */
function pracujemyWDzien(dzienTygodnia) {
  let plan = {};
  try { plan = JSON.parse((stan.ustawienia || {}).dni_tygodnia || '{}') || {}; } catch (e) { plan = {}; }
  const wpis = plan[dzienTygodnia];
  return wpis && typeof wpis.praca === 'boolean' ? wpis.praca : dzienTygodnia < 6;
}

EKRANY.miesiac = {
  tytul: 'Kalendarz',
  tylkoBiuro: true,
  async rysuj(pole, param) {
    MiaryTras.zamknij();     // dymek „i” z poprzedniego ekranu nie zostaje na nowym
    const dzis = dzisiaj();
    const miesiac = /^\d{4}-\d{2}$/.test((param && param.miesiac) || '') ? param.miesiac : dzis.slice(0, 7);
    const [rok, mies] = miesiac.split('-').map(Number);
    const NAZWY_MIESIECY = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień',
      'październik', 'listopad', 'grudzień'];
    const dwa = n => String(n).padStart(2, '0');
    const iso = d => `${d.getUTCFullYear()}-${dwa(d.getUTCMonth() + 1)}-${dwa(d.getUTCDate())}`;
    const pierwszy = new Date(Date.UTC(rok, mies - 1, 1));
    const ostatni = new Date(Date.UTC(rok, mies, 0));
    // Siatka pełnych tygodni pn–nd: dni sąsiednich miesięcy są szare, ale też policzone.
    const przesuniecie = (pierwszy.getUTCDay() + 6) % 7;
    const start = new Date(pierwszy.getTime() - przesuniecie * 86400000);
    const tygodni = Math.ceil((przesuniecie + ostatni.getUTCDate()) / 7);
    const koniec = new Date(start.getTime() + (tygodni * 7 - 1) * 86400000);
    const sasiedni = n => { const d = new Date(Date.UTC(rok, mies - 1 + n, 1)); return `${d.getUTCFullYear()}-${dwa(d.getUTCMonth() + 1)}`; };

    const trasy = await API.get(`/api/trasy?od=${iso(start)}&do=${iso(koniec)}`);
    const dni = {};
    trasy.forEach(t => {
      const d = dni[t.data] || (dni[t.data] = { tras: 0, punktow: 0, nieudane: 0, ok: 0 });
      d.tras += 1;
      d.punktow += t.ile || 0;
      d.ok += t.ile_ok || 0;
      d.nieudane += t.ile_nie || 0;
    });
    const wMiesiacu = Object.keys(dni).filter(d => d.slice(0, 7) === miesiac).map(d => dni[d]);
    const razem = wMiesiacu.reduce((s, d) => ({ tras: s.tras + d.tras, punktow: s.punktow + d.punktow, nieudane: s.nieudane + d.nieudane }),
      { tras: 0, punktow: 0, nieudane: 0 });
    const NAGLOWKI = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
    const komorki = [];
    for (let i = 0; i < tygodni * 7; i++) {
      const dzien = new Date(start.getTime() + i * 86400000);
      const klucz = iso(dzien);
      const d = dni[klucz];
      const klasy = ['dzien-kal'];
      if (klucz.slice(0, 7) !== miesiac) klasy.push('obcy');
      if (!pracujemyWDzien(i % 7 + 1)) klasy.push('weekend');
      if (klucz === dzis) klasy.push('dzis');
      if (d) klasy.push('ma-trasy');
      const opis = d
        ? `${klucz}: ${d.tras} ${odmiana(d.tras, 'trasa', 'trasy', 'tras')}, ${d.punktow} ${odmiana(d.punktow, 'punkt', 'punkty', 'punktów')}${d.nieudane ? `, nieudane: ${d.nieudane}` : ''}`
        : `${klucz}: bez tras`;
      komorki.push(`<button type="button" class="${klasy.join(' ')}" data-dzien="${klucz}" aria-label="${escHtml(opis)}" title="${escHtml(opis)}"${klucz === dzis ? ' aria-current="date"' : ''}>
        <span class="nr">${dzien.getUTCDate()}</span>
        ${d ? `<span class="liczby"><b>${d.tras}</b><i>tras</i></span><span class="liczby"><b>${d.punktow}</b><i>pkt</i></span>
          ${d.nieudane ? `<span class="nieudane-kal" title="Nieudane dostawy">${d.nieudane}</span>` : ''}` : ''}
      </button>`);
    }

    pole.innerHTML = `
      <div class="pasek-narzedzi">
        ${przelacznikWidokuTras('kalendarz')}
        <button type="button" id="k-wstecz" aria-label="Poprzedni miesiąc">${ikonka('strzalka-lewo')}Poprzedni</button>
        <button type="button" id="k-dzis"${miesiac === dzis.slice(0, 7) ? ' aria-current="date"' : ''}>Ten miesiąc</button>
        <button type="button" id="k-dalej" aria-label="Następny miesiąc">Następny${ikonka('strzalka-prawo', 16, true)}</button>
        <label>Miesiąc<input type="month" id="k-miesiac" value="${miesiac}"></label>
      </div>
      <div class="karta kalendarz-tras">
        <div class="karta-gora"><h2>${NAZWY_MIESIECY[mies - 1].charAt(0).toUpperCase() + NAZWY_MIESIECY[mies - 1].slice(1)} ${rok}</h2>
          <span class="slaby male">${razem.tras} ${odmiana(razem.tras, 'trasa', 'trasy', 'tras')} · ${razem.punktow} ${odmiana(razem.punktow, 'punkt', 'punkty', 'punktów')}${razem.nieudane ? ` · nieudane: ${razem.nieudane}` : ''}</span></div>
        <p class="slaby male kal-legenda">W kratce: liczba tras i punktów dnia, czerwona liczba — nieudane dostawy. Dotknij dnia, żeby go otworzyć.</p>
        <div class="siatka-kal" role="grid" aria-label="Kalendarz tras: ${NAZWY_MIESIECY[mies - 1]} ${rok}">
          ${NAGLOWKI.map(n => `<div class="naglowek-kal" role="columnheader">${n}</div>`).join('')}
          ${komorki.join('')}
        </div>
      </div>`;

    podepnijPrzelacznikWidokuTras(pole, dzisiaj());
    pole.querySelector('#k-wstecz').onclick = () => pokazEkran('miesiac', { miesiac: sasiedni(-1) });
    pole.querySelector('#k-dalej').onclick = () => pokazEkran('miesiac', { miesiac: sasiedni(1) });
    pole.querySelector('#k-dzis').onclick = () => pokazEkran('miesiac', { miesiac: dzis.slice(0, 7) });
    pole.querySelector('#k-miesiac').onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) pokazEkran('miesiac', { miesiac: e.target.value }); };
    pole.querySelectorAll('[data-dzien]').forEach(b => b.onclick = () => pokazEkran('trasy', { data: b.dataset.dzien, widok: 'dzien' }));
  },
};
