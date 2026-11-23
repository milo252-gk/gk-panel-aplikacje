/* GK Trasy — ekran „Wskaźniki” (2026-11-18, decyzja właściciela): jak dobrze jadą dostawy.

   Wzór: Wskaźniki w GK Panel Kierownika (panel/web/wskazniki.js) — okresy „Dziś / Wczoraj / Ostatnie 7 dni / Ten miesiąc /
   Zakres”, zakres zapamiętany do końca dnia, kafelki liczb, paski i tabele pod spodem, przy każdym kafelku i nagłówku „i”
   z definicją (miary.js). Tylko odczyt: liczby z GET /api/wskazniki (biuro i administrator; podział na kierowców tylko administrator), nic nie zapisujemy.
   Liczy serwer (a_wskazniki w trasex.py); tu tylko rysujemy. */

EKRANY.wskazniki = {
  tytul: 'Wskaźniki',
  tylkoBiuro: true,
  async rysuj(pole, param) {
    MiaryTras.zamknij();     // dymek „i” z poprzedniego ekranu nie zostaje na nowym
    const dzis = dzisiaj();
    const pamiec = MiaryTras.pamiecZakresu(dzis);
    let wybor = param && param.od && param.do ? { okres: 'zakres', od: param.od, do: param.do } : pamiec.czytaj();
    let blad = '';
    const NAZWY = [['dzis', 'Dziś'], ['wczoraj', 'Wczoraj'], ['7dni', 'Ostatnie 7 dni'], ['miesiac', 'Ten miesiąc'], ['zakres', 'Zakres']];
    const proc = p => (p === null || p === undefined ? '—' : `${String(p).replace('.', ',')} %`);
    const kafel = (klucz, wartosc, klasa) => `<div class="${klasa || ''}" title="${escHtml(MiaryTras.title(klucz))}">
        <span class="etykieta">${escHtml(MiaryTras.DEFINICJE[klucz].nazwa)}${MiaryTras.przycisk(klucz)}</span><b>${escHtml(String(wartosc))}</b></div>`;
    const naglowek = (klucz, dopisek) => `<h3 title="${escHtml(MiaryTras.title(klucz))}">${escHtml(MiaryTras.DEFINICJE[klucz].nazwa)}${MiaryTras.przycisk(klucz)}${dopisek ? ` <span class="slaby male">${escHtml(dopisek)}</span>` : ''}</h3>`;
    const klasaProcentu = p => (p === null || p === undefined ? 'zero' : p >= 80 ? 'dobrze' : 'uwaga');

    pole.innerHTML = `
      <div class="wskazniki-trasy">
        <div class="chipy" id="w-okresy" role="group" aria-label="Okres">
          ${NAZWY.map(([k, n]) => `<button type="button" class="chip" data-okres="${k}">${n}</button>`).join('')}
        </div>
        <div id="w-zakres" hidden></div>
        <div id="w-tresc"></div>
      </div>`;
    MiaryTras.podlacz(pole);

    async function narysuj() {
      pole.querySelectorAll('#w-okresy .chip').forEach(b => {
        const jest = b.dataset.okres === wybor.okres;
        b.classList.toggle('wybrany', jest);
        b.setAttribute('aria-pressed', String(jest));
      });
      const poleZakresu = pole.querySelector('#w-zakres');
      poleZakresu.hidden = wybor.okres !== 'zakres';
      // Pola dat rysujemy tylko, gdy ich nie ma — przerysowanie nie może skasować wpisywanej daty.
      if (wybor.okres === 'zakres' && !poleZakresu.firstElementChild) poleZakresu.innerHTML = MiaryTras.poleZakresu(wybor, blad);
      const tresc = pole.querySelector('#w-tresc');
      const z = MiaryTras.zakres(wybor.od, wybor.do);
      if (blad || z.blad) { tresc.innerHTML = ''; return; }
      tresc.innerHTML = '<div class="pusto">Liczę…</div>';
      let d;
      try {
        d = await API.get(`/api/wskazniki?od=${z.od}&do=${z.do}`);
      } catch (e) {
        tresc.innerHTML = `<div class="karta"><h2>Nie udało się policzyć wskaźników</h2><p class="slaby">${escHtml(poLudzku(e))}</p>
          <button class="glowny" id="w-ponow">Spróbuj ponownie</button></div>`;
        tresc.querySelector('#w-ponow').onclick = narysuj;
        return;
      }
      // Odpowiedź starego zapytania nie może przykryć nowszego wyboru.
      if (d.od !== wybor.od || d.do !== wybor.do) return;
      tresc.innerHTML = `
        <p class="slaby okres-opis">Zakres: ${escHtml(z.opis)} (${z.dni} ${z.dni === 1 ? 'dzień' : 'dni'})</p>
        <div class="kafelki-liczb wskazniki-kafelki" aria-label="Wskaźniki dostaw">
          ${kafel('trasy', d.trasy, d.trasy ? '' : 'zero')}
          ${kafel('punkty', d.punkty, d.punkty ? '' : 'zero')}
          ${kafel('dostarczone', d.dostarczone, d.dostarczone ? 'dobrze' : 'zero')}
          ${kafel('za_pierwszym', proc(d.proc_za_pierwszym), klasaProcentu(d.proc_za_pierwszym))}
          ${kafel('nieudane', d.nieudane, d.nieudane ? 'pilne' : 'zero')}
          ${kafel('po_nadrobieniu', d.po_nadrobieniu, d.po_nadrobieniu ? 'uwaga' : 'zero')}
          ${kafel('otwarte', d.otwarte, d.otwarte ? 'uwaga' : 'zero')}
        </div>
        ${d.punkty ? '' : '<div class="karta"><div class="pusto">W tym zakresie nie ma żadnych punktów dostaw. Wybierz inny okres.</div></div>'}
        <div class="wskazniki-dwa">
          <section class="karta">${naglowek('powody', d.nieudane ? `(${d.nieudane} z ${d.zamkniete} zamkniętych)` : '')}
            ${d.powody.map(p => `<div class="pasek-wsk"><span class="nazwa">${escHtml(p.powod)}</span>
              <span class="slupek"><i class="wada" style="width:${Math.max(2, p.proc || 0)}%"></i></span>
              <span class="liczba">${p.ile}</span><span class="slaby">${proc(p.proc)}</span></div>`).join('')
              || `<p class="pusto ok">${d.punkty ? 'Bez nieudanych dostaw w tym zakresie' : 'Brak danych'}</p>`}
          </section>
          <section class="karta">${naglowek('klienci')}
            ${d.klienci.length ? `<div class="tabela-przewijana"><table class="tabela-wsk">
              <thead><tr><th>Klient</th><th>Nieudane</th><th>Punktów</th></tr></thead>
              <tbody>${d.klienci.map(k => `<tr><td>${escHtml(k.nazwa)}</td><td class="zle">${k.nieudane}</td><td>${k.punkty}</td></tr>`).join('')}</tbody>
            </table></div>` : `<p class="pusto ok">${d.punkty ? 'Żaden klient nie miał nieudanej dostawy' : 'Brak danych'}</p>`}
          </section>
        </div>
        ${d.podzial_na_kierowcow === false ? '' : `<section class="karta">${naglowek('kierowcy')}
          ${d.kierowcy.length ? `<div class="tabela-przewijana"><table class="tabela-wsk">
            <thead><tr><th>Kierowca</th><th>Tras</th><th>Punktów</th><th>Dostarczone</th><th>Nieudane</th><th>Za pierwszym razem</th></tr></thead>
            <tbody>${d.kierowcy.map(k => `<tr><td>${escHtml(k.imie)}</td><td>${k.trasy}</td><td>${k.punkty}</td><td>${k.dostarczone}</td>
              <td class="${k.nieudane ? 'zle' : ''}">${k.nieudane}</td>
              <td class="${k.proc_za_pierwszym === null ? '' : k.proc_za_pierwszym >= 80 ? 'dobrze' : 'zle'}">${proc(k.proc_za_pierwszym)}</td></tr>`).join('')}</tbody>
          </table></div>` : '<p class="pusto">Brak punktów w tym zakresie</p>'}
        </section>`}`;
    }

    pole.querySelectorAll('#w-okresy .chip').forEach(b => b.onclick = () => {
      const nazwa = b.dataset.okres;
      blad = '';
      if (nazwa === 'zakres') wybor = { okres: 'zakres', od: wybor.od, do: wybor.do };
      else wybor = Object.assign({ okres: nazwa }, MiaryTras.okres(nazwa, dzis));
      pamiec.zapisz(wybor);
      pole.querySelector('#w-zakres').innerHTML = '';
      narysuj();
    });
    // „Pokaż”: sprawdzenie dat (od ≤ do, najwyżej 366 dni) — błąd zostaje przy polach, a liczby znikają, żeby nikt
    // nie wziął liczb poprzedniego zakresu za nowe.
    pole.querySelector('#w-zakres').addEventListener('submit', ev => {
      ev.preventDefault();
      const f = ev.target;
      const z = MiaryTras.zakres(f.od.value, f.do.value);
      blad = z.blad || '';
      if (!z.blad) {
        wybor = { okres: 'zakres', od: f.od.value, do: f.do.value };
        pamiec.zapisz(wybor);
      }
      pole.querySelector('#w-zakres').innerHTML = MiaryTras.poleZakresu(z.blad ? { od: f.od.value, do: f.do.value } : wybor, blad);
      narysuj();
    });
    await narysuj();
  },
};
