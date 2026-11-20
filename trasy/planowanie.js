/* GK Trasy — ekran „Planowanie tras” (2026-11-19, decyzja właściciela): wynik pracy BIURA w planowaniu tras.

   Trasa liczy się „w terminie”, gdy po raz pierwszy zaplanowano ją (założona i z pierwszym punktem) najpóźniej o godzinie
   granicznej (domyślnie 17:00, ustawia administrator) poprzedniego DNIA ROBOCZEGO przed dniem jazdy. Wynik idzie na osobę,
   która trasę założyła. Liczy serwer (planowanie_tras w trasex.py, GET /api/planowanie — biuro i administrator); tu tylko
   rysujemy. Wzór układu: Wskaźniki (wskazniki.js) — chipy okresu, kafelki liczb, filtry i sortowanie na wierzchu.
   Tylko odczyt; CSV przez token pobrania (jak Raport pracy). Bez nowych kluczy pamięci. */

EKRANY.planowanie = {
  tytul: 'Planowanie tras',
  tylkoBiuro: true,
  async rysuj(pole) {
    const dzis = dzisiaj();
    const pierwszyDzien = d => `${d.slice(0, 7)}-01`;
    const ostatniDzien = d => {
      const [r, m] = d.split('-').map(Number);
      const x = new Date(Date.UTC(r, m, 0));
      return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
    };
    const poprzedniMiesiac = d => {
      const [r, m] = d.split('-').map(Number);
      const x = new Date(Date.UTC(r, m - 2, 1));
      return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-01`;
    };
    const OKRESY = {
      miesiac: () => ({ od: pierwszyDzien(dzis), do: ostatniDzien(dzis) }),
      poprzedni: () => { const p = poprzedniMiesiac(dzis); return { od: p, do: ostatniDzien(p) }; },
    };
    const NAZWY = [['miesiac', 'Ten miesiąc'], ['poprzedni', 'Poprzedni miesiąc'], ['zakres', 'Zakres']];
    let wybor = Object.assign({ okres: 'miesiac' }, OKRESY.miesiac());
    let blad = '';
    let dane = null;
    const filtr = { sort: 'domyslnie', osoba: '', dni: 'wszystkie' };
    const DNI_TYG = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
    const dzienTyg = t => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t || '');
      return m ? DNI_TYG[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] : '';
    };
    const kiedy = t => (t ? `${dzienTyg(t)} ${MiaryTras.dataPl(t.slice(0, 10))}${t.length > 10 ? ' ' + t.slice(11, 16) : ''}` : '—');
    const proc = p => (p === null || p === undefined ? '—' : `${String(p).replace('.', ',')} %`);
    const klasaProc = p => (p === null || p === undefined ? 'zero' : p >= 80 ? 'dobrze' : 'uwaga');
    const STAN = { w_terminie: ['w terminie', 'p-dostarczone'], pozno: ['późno', 'p-nieudane'], czeka: ['czeka — termin jeszcze nie minął', 'p-oczekuje'] };
    const SKAD = { dziennik: ' (z dziennika)', brak: '' };

    pole.innerHTML = `
      <div class="wskazniki-trasy planowanie-tras">
        <div class="chipy" id="pl-okresy" role="group" aria-label="Okres (dzień jazdy)">
          ${NAZWY.map(([k, n]) => `<button type="button" class="chip" data-okres="${escHtml(k)}">${escHtml(n)}</button>`).join('')}
          <button type="button" class="chip" id="pl-csv">${ikonka('pobierz')}Pobierz CSV</button>
        </div>
        <div id="pl-zakres" hidden></div>
        <div class="filtry-listy">
          <div class="filtry-pasek" role="group" aria-label="Filtry i sortowanie">
            <label>Sortowanie osób
              <select id="pl-sort">
                <option value="domyslnie">Domyślnie (najwięcej tras)</option>
                <option value="najslabszy">Najniższy % w terminie</option>
                <option value="pozno">Najwięcej późnych</option>
                <option value="imie">Imię A–Z</option>
              </select></label>
            <label>Osoba
              <select id="pl-osoba"><option value="">Wszyscy</option></select></label>
            <label>Dni
              <select id="pl-dni">
                <option value="wszystkie">Wszystkie dni</option>
                <option value="pozno">Tylko dni z późnymi</option>
              </select></label>
          </div>
        </div>
        <div id="pl-tresc"></div>
      </div>`;

    function rysujTresc() {
      const tresc = pole.querySelector('#pl-tresc');
      const d = dane;
      if (!d) return;
      const osobaWybrana = filtr.osoba;
      const pasujeOsoba = a => !osobaWybrana || String(a === null || a === undefined ? 0 : a) === osobaWybrana;
      const osoby = d.osoby.filter(o => pasujeOsoba(o.autor)).slice();
      const por = {
        domyslnie: (a, b) => b.trasy - a.trasy || a.imie.localeCompare(b.imie, 'pl'),
        najslabszy: (a, b) => (a.proc === null ? 101 : a.proc) - (b.proc === null ? 101 : b.proc) || a.imie.localeCompare(b.imie, 'pl'),
        pozno: (a, b) => b.pozno - a.pozno || a.imie.localeCompare(b.imie, 'pl'),
        imie: (a, b) => a.imie.localeCompare(b.imie, 'pl'),
      }[filtr.sort] || (() => 0);
      osoby.sort(por);
      const dni = d.dni.map(dz => Object.assign({}, dz, { trasy: dz.trasy.filter(t => pasujeOsoba(t.autor)) }))
        .filter(dz => dz.trasy.length && (filtr.dni !== 'pozno' || dz.trasy.some(t => t.stan === 'pozno')));
      const suma = osoby.reduce((s, o) => ({ w: s.w + o.w_terminie, p: s.p + o.pozno, c: s.c + o.czeka }), { w: 0, p: 0, c: 0 });
      const procSuma = suma.w + suma.p ? Math.round(1000 * suma.w / (suma.w + suma.p)) / 10 : null;
      const z = MiaryTras.zakres(d.od, d.do);
      tresc.innerHTML = `
        <p class="slaby okres-opis">Dzień jazdy: ${escHtml(z.opis || '')}. Termin: ${escHtml(String(d.termin_godz))}:00 poprzedniego dnia roboczego
          (w poniedziałek — piątek, po święcie — ostatni dzień roboczy przed nim).</p>
        <div class="kafelki-liczb wskazniki-kafelki" aria-label="Planowanie tras — podsumowanie">
          <div class="${escHtml(suma.w + suma.p ? '' : 'zero')}"><span class="etykieta">Trasy</span><b>${escHtml(String(suma.w + suma.p))}</b></div>
          <div class="${escHtml(suma.w ? 'dobrze' : 'zero')}"><span class="etykieta">W terminie</span><b>${escHtml(String(suma.w))}</b></div>
          <div class="${escHtml(suma.p ? 'pilne' : 'zero')}"><span class="etykieta">Późno</span><b>${escHtml(String(suma.p))}</b></div>
          <div class="${escHtml(klasaProc(procSuma))}"><span class="etykieta">% w terminie</span><b>${escHtml(proc(procSuma))}</b></div>
        </div>
        ${suma.c ? `<p class="male slaby">Czeka na termin: ${escHtml(String(suma.c))} (pusta trasa, której termin jeszcze nie minął — nie wchodzi do wyniku).</p>` : ''}
        ${d.odwolane ? `<p class="male slaby">Odwołane trasy w tym zakresie (nie liczą się): ${escHtml(String(d.odwolane))}.</p>` : ''}
        <section class="karta"><h3>Wynik osób</h3>
          ${osoby.length ? `<div class="tabela-przewijana"><table class="tabela-wsk">
            <thead><tr><th>Osoba</th><th>Tras</th><th>W terminie</th><th>Późno</th><th>% w terminie</th></tr></thead>
            <tbody>${osoby.map(o => `<tr><td>${escHtml(o.imie)}</td><td>${escHtml(String(o.trasy))}</td><td>${escHtml(String(o.w_terminie))}</td>
              <td class="${escHtml(o.pozno ? 'zle' : '')}">${escHtml(String(o.pozno))}</td>
              <td class="${escHtml(o.proc === null ? '' : o.proc >= 80 ? 'dobrze' : 'zle')}">${escHtml(proc(o.proc))}</td></tr>`).join('')}</tbody>
          </table></div>` : '<p class="pusto">W tym zakresie nie ma tras.</p>'}
          <p class="male slaby">Wynik idzie na osobę, która trasę założyła (także zastępstwo). Zmiany po terminie nic nie zmieniają.
            Trasy sprzed 19.11.2026 nie mają zapisanego autora: bierzemy pierwszą osobę z biura, która dodała punkt (dziennik), inaczej „Nieznany”.</p>
        </section>
        <section class="karta"><h3>Dni</h3>
          ${dni.length ? dni.map(dz => `<div class="planowanie-dzien">
            <div class="karta-gora"><b>${escHtml(kiedy(dz.data))}</b>
              <span class="slaby male">termin: ${escHtml(kiedy(dz.termin))} · w terminie ${escHtml(String(dz.trasy.filter(t => t.stan === 'w_terminie').length))}
              · późno ${escHtml(String(dz.trasy.filter(t => t.stan === 'pozno').length))}</span></div>
            <ul class="planowanie-lista">${dz.trasy.map(t => `<li>
              <span class="plakietka ${escHtml(STAN[t.stan][1])}">${escHtml(STAN[t.stan][0])}</span>
              <a href="#" data-trasa="${escHtml(String(t.id))}">${escHtml(t.nazwa || 'Trasa bez nazwy')}</a>
              <span class="slaby male">${escHtml(t.kierowca_imie || 'bez kierowcy')} · zaplanował(a): ${escHtml(t.autor_imie + (SKAD[t.autor_zrodlo] || ''))}
                · ${escHtml(t.zaplanowano ? kiedy(t.zaplanowano) : 'bez punktów')}</span></li>`).join('')}</ul>
          </div>`).join('') : '<p class="pusto">Brak dni do pokazania.</p>'}
        </section>`;
      tresc.querySelectorAll('[data-trasa]').forEach(a => a.onclick = ev => {
        ev.preventDefault();
        pokazEkran('trasa', { id: Number(a.dataset.trasa) });
      });
    }

    async function narysuj() {
      pole.querySelectorAll('#pl-okresy [data-okres]').forEach(b => {
        const jest = b.dataset.okres === wybor.okres;
        b.classList.toggle('wybrany', jest);
        b.setAttribute('aria-pressed', String(jest));
      });
      const poleZakresu = pole.querySelector('#pl-zakres');
      poleZakresu.hidden = wybor.okres !== 'zakres';
      if (wybor.okres === 'zakres' && !poleZakresu.firstElementChild) poleZakresu.innerHTML = MiaryTras.poleZakresu(wybor, blad);
      const tresc = pole.querySelector('#pl-tresc');
      const z = MiaryTras.zakres(wybor.od, wybor.do);
      if (blad || z.blad) { tresc.innerHTML = ''; dane = null; return; }
      tresc.innerHTML = '<div class="pusto">Liczę…</div>';
      let d;
      try {
        d = await API.get(`/api/planowanie?od=${z.od}&do=${z.do}`);
      } catch (e) {
        tresc.innerHTML = `<div class="karta"><h2>Nie udało się policzyć planowania</h2><p class="slaby">${escHtml(poLudzku(e))}</p>
          <button class="glowny" id="pl-ponow">Spróbuj ponownie</button></div>`;
        tresc.querySelector('#pl-ponow').onclick = narysuj;
        return;
      }
      if (d.od !== wybor.od || d.do !== wybor.do) return;      // odpowiedź starego zapytania nie przykrywa nowszego wyboru
      dane = d;
      const wyborOsoby = pole.querySelector('#pl-osoba');
      wyborOsoby.innerHTML = '<option value="">Wszyscy</option>' + d.osoby.map(o =>
        `<option value="${escHtml(String(o.autor === null || o.autor === undefined ? 0 : o.autor))}">${escHtml(o.imie)}</option>`).join('');
      if (filtr.osoba && !d.osoby.some(o => String(o.autor === null || o.autor === undefined ? 0 : o.autor) === filtr.osoba)) filtr.osoba = '';
      wyborOsoby.value = filtr.osoba;
      rysujTresc();
    }

    pole.querySelectorAll('#pl-okresy [data-okres]').forEach(b => b.onclick = () => {
      blad = '';
      wybor = b.dataset.okres === 'zakres' ? { okres: 'zakres', od: wybor.od, do: wybor.do }
        : Object.assign({ okres: b.dataset.okres }, OKRESY[b.dataset.okres]());
      pole.querySelector('#pl-zakres').innerHTML = '';
      narysuj();
    });
    pole.querySelector('#pl-zakres').addEventListener('submit', ev => {
      ev.preventDefault();
      const f = ev.target;
      const z = MiaryTras.zakres(f.od.value, f.do.value);
      blad = z.blad || '';
      if (!z.blad) wybor = { okres: 'zakres', od: f.od.value, do: f.do.value };
      pole.querySelector('#pl-zakres').innerHTML = MiaryTras.poleZakresu(z.blad ? { od: f.od.value, do: f.do.value } : wybor, blad);
      narysuj();
    });
    pole.querySelector('#pl-sort').onchange = ev => { filtr.sort = ev.target.value; rysujTresc(); };
    pole.querySelector('#pl-osoba').onchange = ev => { filtr.osoba = ev.target.value; rysujTresc(); };
    pole.querySelector('#pl-dni').onchange = ev => { filtr.dni = ev.target.value; rysujTresc(); };
    // CSV: osobny token pobrania (5 min, tylko do zestawień) — token sesji nie trafia do adresu ani historii.
    pole.querySelector('#pl-csv').onclick = async () => {
      const z = MiaryTras.zakres(wybor.od, wybor.do);
      if (z.blad) { komunikat(z.blad, 'blad'); return; }
      const w = await sprobuj(() => API.post('/api/eksport/token', { zakres: 'eksport' }));
      if (!w) return;
      const link = document.createElement('a');
      link.href = adresDanych(`/api/eksport/planowanie-tras.csv?od=${z.od}&do=${z.do}&t=${encodeURIComponent(w.token)}`);
      link.download = '';
      document.body.appendChild(link);
      link.click();
      link.remove();
    };
    await narysuj();
  },
};
