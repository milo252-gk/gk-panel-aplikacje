/* Panel Kierownika — wskaźniki (2026-09-28, decyzja właściciela): awarie, przestój na linię, MTTR, MTBF (D44) i czas reakcji,
   braki w próbach i najczęstsze wady, zlecenia — za bieżącą zmianę, dziś, wczoraj albo dowolny zakres dni (D47, „Zakres”).
   Liczy widok.js (W.wskazniki — testowane) jedną regułą Hala.wskaznikiOkresu: krótkie okresy z danych, które Panel trzyma
   w pamięci (2 doby — działa też bez sieci), dłuższy zakres — hub tą samą regułą (GET /api/v1/panel/wskazniki,
   panel/serwer/rozszerzenie.py). Przy każdym kafelku i nagłówku „i” z definicją (wspolne/klient/miary.js — te same
   teksty co w UR → KPI). Wybrany zakres pamiętamy do końca dnia zakładu (hala.panel.zakres, HalaMiary.pamiecZakresu). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;
  const M = window.HalaMiary;
  const pamiec = M.pamiecZakresu('panel', () => hala.teraz());
  const zapis = pamiec.czytaj();
  let okres = zapis.wybrany ? 'zakres' : 'zmiana';
  let zakresDni = { od: zapis.od, do: zapis.do };
  let bladZakresu = '';
  const zHuba = new Map();                  // 'od|do' → {wynik, kiedy} — przerysowanie nie pyta huba przy każdym zdarzeniu
  const wToku = new Set();
  const bledyHuba = new Map();              // 'od|do' → {tekst, do} — po błędzie nie pytamy co sekundę

  const czas = ms => (ms === null || ms === undefined ? '—' : Hala.formatCzasu(ms));
  const info = klucz => M.przycisk(klucz);

  function oknoZakresu() {
    const z = M.zakres(zakresDni.od, zakresDni.do);
    return z.blad ? null : { od: z.od, do: z.do, nazwa: `Zakres · ${z.opis} (${z.dni} ${z.dni === 1 ? 'dzień' : 'dni'})`, zakres: true };
  }

  async function pobierz(klucz, okno) {
    if (wToku.has(klucz)) return;
    const b = bledyHuba.get(klucz);
    if (b && Date.now() < b.do) return;
    wToku.add(klucz);
    const q = new URLSearchParams({ od: new Date(okno.od).toISOString(), do: new Date(okno.do).toISOString() });
    try {
      const wynik = await hala.zapytaj('GET', `/api/v1/panel/wskazniki?${q}`);
      zHuba.set(klucz, { wynik, kiedy: hala.teraz() });
      setTimeout(() => zHuba.delete(klucz), 5 * 60000);     // nowe awarie i zlecenia — po 5 min liczymy od nowa
      bledyHuba.delete(klucz);
    } catch (e) {
      const tekst = e && e.kod === 403 ? 'To konto nie widzi wskaźników z huba.'
        : e && e.kod ? `Hub nie policzył wskaźników: ${P.komunikatBledu(e)}`
        : 'Dłuższy zakres liczy hub — brak połączenia. Spróbuj za chwilę albo wybierz „Dziś” lub „Wczoraj”.';
      bledyHuba.set(klucz, { tekst, do: Date.now() + 60000 });
    } finally {
      wToku.delete(klucz);
      P.narysuj();
    }
  }

  function rysuj(d) {
    for (const b of document.querySelectorAll('#wskazniki .chip')) b.setAttribute('aria-pressed', String(b.dataset.okres === okres));
    const pole = $('wskazniki-zakres');
    pole.hidden = okres !== 'zakres';
    // Pola dat rysujemy tylko, gdy ich nie ma — przerysowanie po zdarzeniu z hali nie może skasować wpisywanej daty.
    if (okres === 'zakres' && !pole.firstElementChild) pole.innerHTML = M.poleZakresu(zakresDni, bladZakresu);
    const el = $('wskazniki-tresc');
    const okno = okres === 'zakres' ? oknoZakresu() : W.oknoWskaznikow(okres, d.teraz, d.zmiana);
    if (okres === 'zakres' && bladZakresu) { el.innerHTML = ''; return; }
    if (!okno) {
      el.innerHTML = okres === 'zakres' ? '<p class="pusto">Wybierz daty „od” i „do” i dotknij „Pokaż”.</p>'
        : '<p class="pusto">Teraz nie trwa żadna zmiana — wybierz „Dziś” albo „Wczoraj”.</p>';
      return;
    }
    let gotowe = null, zrodlo = '';
    if (okno.zakres && !W.zakresZPamieci(okno, d.teraz)) {
      const klucz = `${okno.od}|${okno.do}`;
      const z = zHuba.get(klucz);
      if (!z) {
        const b = bledyHuba.get(klucz);
        el.innerHTML = `<p class="slaby okres-opis">${esc(okno.nazwa)}</p><p class="pusto">${esc(b && Date.now() < b.do ? b.tekst : 'Liczę w hubie…')}</p>`;
        pobierz(klucz, okno);
        return;
      }
      gotowe = z.wynik;
      zrodlo = ` · policzone przez hub o ${W.godzina(z.kiedy)}`;
    }
    const w = W.wskazniki({ awarie: hala.obiekty('awaria'), proby: hala.obiekty('proba'), zlecenia: hala.obiekty('zlecenie'),
                            slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz, okno, gotowe });
    const tw = w.terminowosc;
    // Terminowość zleceń (D31): pasek = % w terminie, czerwony, gdy poniżej 80 %.
    const wierszTerminu = g => `<div class="pasek-wsk">
            <span class="nazwa">${esc(g.nazwa)}</span>
            <span class="slupek"><i class="${g.proc >= 80 ? 'dobrze' : ''}" style="width:${g.proc}%"></i></span>
            <span class="liczba">${g.proc} %</span>
            <span class="slaby">w terminie ${g.wTerminie} z ${g.wTerminie + g.poTerminie}${g.poTerminie ? ` · po terminie ${g.poTerminie}` : ''}</span>
          </div>`;
    // Kafelek: podpis z „i” (dotknięcie — dymek z definicją), cały kafelek z tą samą definicją w title (mysz).
    const kafel = (klucz, wartosc, klasa) => `<div class="${klasa || ''}" title="${esc(M.title(klucz))}"><span class="etykieta">${esc(M.DEFINICJE[klucz].nazwa)}${info(klucz)}</span><b>${esc(wartosc)}</b></div>`;
    const naglowek = (klucz, dopisek) => `<h3 title="${esc(M.title(klucz))}">${esc(M.DEFINICJE[klucz].nazwa)}${info(klucz)}${dopisek ? ` ${dopisek}` : ''}</h3>`;
    const opisOkna = okno.zakres ? okno.nazwa
      : `${okno.nazwa || ''} · ${W.dataKrotka(okno.od)} ${W.godzina(okno.od)} – ${W.dataKrotka(okno.do)} ${W.godzina(okno.do)}`;
    el.innerHTML = `
      <p class="slaby okres-opis">${esc(opisOkna)}${esc(zrodlo)}</p>
      <div class="hala-kafelki">
        ${kafel('awarie', w.awarie, w.awarie ? 'uwaga' : 'zero')}
        ${kafel('zatrzymania', w.zatrzymania, w.zatrzymania ? 'pilne' : 'zero')}
        ${kafel('przestoj', czas(w.przestojMs), w.przestojMs ? 'pilne' : 'zero')}
        ${kafel('reakcja', czas(w.reakcjaMs), w.reakcjaMs === null ? 'zero' : '')}
        ${kafel('mttr', czas(w.mttrMs), w.mttrMs === null ? 'zero' : '')}
        ${kafel('mtbf', czas(w.mtbfMs), w.mtbfMs === null ? 'zero' : '')}
        ${kafel('braki', w.brakiProc === null ? '—' : `${w.brakiProc} %`, w.brakiProc ? 'uwaga' : 'zero')}
        ${kafel('zlecenia_wykonane', `${w.zleceniaWykonane}/${w.zlecenia}`, w.zlecenia ? 'dobrze' : 'zero')}
        ${kafel('zlecenia_w_terminie', tw.proc === null ? '—' : `${tw.proc} %`, tw.proc === null ? 'zero' : tw.proc >= 80 ? 'dobrze' : 'pilne')}
      </div>
      <div class="wskazniki-dwa">
        <section>${naglowek('przestoj_linie')}
          ${w.linie.map(k => `<div class="pasek-wsk">
            <span class="nazwa">${esc(k.nazwa)}</span>
            <span class="slupek"><i style="width:${w.maksPrzestojMs ? Math.round(k.przestojMs * 100 / w.maksPrzestojMs) : 0}%"></i></span>
            <span class="liczba">${esc(czas(k.przestojMs))}</span>
            <span class="slaby">${k.awarie} aw.${k.zatrzymania ? ` · ${k.zatrzymania} zatrz.` : ''}${k.mttrMs !== null ? ` · MTTR ${esc(czas(k.mttrMs))}` : ''}</span>
          </div>`).join('') || '<p class="pusto">Brak linii</p>'}
        </section>
        <section>${naglowek('wady', w.proby ? `<span class="slaby">(${w.proby} prób, ${w.braki}/${w.sprawdzone} braków)</span>` : '')}
          ${w.pareto.map(p => `<div class="pasek-wsk">
            <span class="nazwa">${esc(p.nazwa)}</span>
            <span class="slupek"><i class="wada" style="width:${p.proc}%"></i></span>
            <span class="liczba">${p.ile} szt.</span><span class="slaby">${p.proc} %</span>
          </div>`).join('') || `<p class="pusto ok">${w.proby ? 'Bez wad w próbach' : 'Brak prób w tym okresie'}</p>`}
        </section>
        <section>${naglowek('terminowosc_dzialy', tw.proc !== null ? `<span class="slaby">(${tw.wTerminie} z ${tw.wTerminie + tw.poTerminie})</span>` : '')}
          ${tw.dzialy.map(wierszTerminu).join('') || '<p class="pusto">Brak zleceń z terminem w tym okresie</p>'}
          ${tw.osoby.length ? `<h3 class="podtytul">Osoby (zlecenia z wybraną osobą)</h3>${tw.osoby.map(wierszTerminu).join('')}` : ''}
        </section>
      </div>`;
  }

  for (const b of document.querySelectorAll('#wskazniki .chip')) b.addEventListener('click', () => {
    okres = b.dataset.okres;
    bladZakresu = '';
    pamiec.zapisz({ od: zakresDni.od, do: zakresDni.do, wybrany: okres === 'zakres' });
    $('wskazniki-zakres').innerHTML = '';
    P.narysuj();
  });
  // „Pokaż”: sprawdzenie dat (od ≤ do, najwyżej 366 dni) — błąd zostaje przy polach, a liczby znikają, żeby nikt nie wziął
  // liczb poprzedniego zakresu za nowe.
  $('wskazniki-zakres').addEventListener('submit', ev => {
    ev.preventDefault();
    const f = ev.target;
    const z = M.zakres(f.od.value, f.do.value);
    bladZakresu = z.blad || '';
    if (!z.blad) {
      zakresDni = { od: f.od.value, do: f.do.value };
      pamiec.zapisz({ od: zakresDni.od, do: zakresDni.do, wybrany: true });
    }
    $('wskazniki-zakres').innerHTML = M.poleZakresu(z.blad ? { od: f.od.value, do: f.do.value } : zakresDni, bladZakresu);
    P.narysuj();
  });
  M.podlacz($('wskazniki'));

  P.widoki.wskazniki = { rysuj };
})();
