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
      const tekst = e && e.kod === 403 ? 'To konto nie widzi wskaźników z serwera.'
        : e && e.kod ? `Serwer nie policzył wskaźników: ${P.komunikatBledu(e)}`
        : 'Dłuższy zakres liczy serwer — brak połączenia. Spróbuj za chwilę albo wybierz „Dziś” lub „Wczoraj”.';
      bledyHuba.set(klucz, { tekst, do: Date.now() + 60000 });
    } finally {
      wToku.delete(klucz);
      P.narysuj();
    }
  }

  // ------------------------------------------------------------ D55: statystyki na osobę
  const filtrOsob = { dzial: '', osoba: '' };
  const zlecOkresu = new Map();             // od (ISO) → {lista, kiedy}
  const wTokuOsob = new Set();
  async function pobierzZlecenia(odIso) {
    if (wTokuOsob.has(odIso)) return;
    wTokuOsob.add(odIso);
    try {
      const w = await hala.pobierzStan('zlecenie', { od: odIso, limit: 5000 });
      zlecOkresu.set(odIso, { lista: w.obiekty || [], kiedy: Date.now() });
      setTimeout(() => zlecOkresu.delete(odIso), 5 * 60000);
    } catch (e) { zlecOkresu.set(odIso, { lista: null, blad: P.komunikatBledu(e), kiedy: Date.now() }); setTimeout(() => zlecOkresu.delete(odIso), 60000); }
    finally { wTokuOsob.delete(odIso); P.narysuj(); }
  }
  function rysujOsoby(d, okno) {
    const f = $('filtry-osob'), el = $('tabela-osob');
    const dz = (d.stale && d.stale.dzialy) || [];
    const opcjeD = '<option value="">wszystkie</option>' + dz.map(x => `<option value="${esc(x.kod)}">${esc(x.nazwa)}</option>`).join('');
    if (f.dzial.dataset.html !== opcjeD) { f.dzial.innerHTML = opcjeD; f.dzial.dataset.html = opcjeD; f.dzial.value = filtrOsob.dzial; }
    const role = filtrOsob.dzial ? ((dz.find(x => x.kod === filtrOsob.dzial) || {}).role || []) : dz.flatMap(x => x.role || []);
    const osoby = (d.pracownicy || []).filter(p => (p.role || []).some(r => role.includes(r)));
    const opcjeO = '<option value="">wszyscy</option>' + osoby.map(p => `<option value="${esc(p.id)}">${esc(p.nazwa)}</option>`).join('');
    if (f.osoba.dataset.html !== opcjeO) { f.osoba.innerHTML = opcjeO; f.osoba.dataset.html = opcjeO; f.osoba.value = filtrOsob.osoba; if (f.osoba.value !== filtrOsob.osoba) filtrOsob.osoba = ''; }
    if (!okno) { el.innerHTML = ''; return; }
    let lista = hala.obiekty('zlecenie');
    if (okno.od < d.teraz - 2 * 86400000) {             // starsze niż to, co Panel trzyma w pamięci — z serwera
      const odIso = new Date(okno.od).toISOString();
      const z = zlecOkresu.get(odIso);
      if (!z) { el.innerHTML = '<p class="pusto">Liczę na serwerze…</p>'; pobierzZlecenia(odIso); return; }
      if (!z.lista) { el.innerHTML = `<p class="pusto">${esc(z.blad || 'Brak danych z serwera.')}</p>`; return; }
      const jest = new Set(lista.map(x => x.id));
      lista = lista.concat(z.lista.filter(x => !jest.has(x.id)));
    }
    const wiersze = W.statystykiOsob({ zlecenia: lista, pracownicy: d.pracownicy, slowniki: d.slowniki, stale: d.stale,
                                       od: okno.od, do: okno.do, dzial: filtrOsob.dzial, osoba: filtrOsob.osoba });
    el.innerHTML = wiersze.length ? `<div class="tabela-przewijana"><table class="tabela-osob">
      <thead><tr><th>Osoba</th><th>Dział</th><th>Zleceń</th><th>Zrobione</th><th>W terminie</th><th>Spóźnione</th><th>Przepadło</th><th>Nie mogę</th><th>W toku</th><th>Urlop</th></tr></thead>
      <tbody>${wiersze.map(w => `<tr><td>${esc(w.nazwa)}</td><td>${esc(w.dzialy)}</td><td>${w.razem}</td><td>${w.zrobione}</td>
        <td class="${w.proc === null ? '' : w.proc >= 80 ? 'dobrze' : 'zle'}">${w.proc === null ? '—' : `${W.procent(w.proc)} %`}</td>
        <td class="${w.spoznione ? 'zle' : ''}">${w.spoznione}</td><td class="${w.przepadle ? 'zle' : ''}">${w.przepadle}</td>
        <td>${w.nieMoze}</td><td>${w.otwarte}</td><td>${w.urlopDni ? `${w.urlopDni} d.` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="pusto">Brak zleceń z osobą w tym okresie.</p>';
  }
  $('filtry-osob').addEventListener('change', () => {
    const f = $('filtry-osob');
    Object.assign(filtrOsob, { dzial: f.dzial.value, osoba: f.osoba.value });
    P.narysuj();
  });
  $('filtry-osob').addEventListener('submit', ev => ev.preventDefault());

  function rysuj(d) {
    const oknoOsob = okres === 'zakres' ? (bladZakresu ? null : oknoZakresu()) : W.oknoWskaznikow(okres, d.teraz, d.zmiana);
    rysujOsoby(d, oknoOsob);
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
        el.innerHTML = `<p class="slaby okres-opis">${esc(okno.nazwa)}</p><p class="pusto">${esc(b && Date.now() < b.do ? b.tekst : 'Liczę na serwerze…')}</p>`;
        pobierz(klucz, okno);
        return;
      }
      gotowe = z.wynik;
      zrodlo = ` · policzone przez serwer o ${W.godzina(z.kiedy)}`;
    }
    const w = W.wskazniki({ awarie: hala.obiekty('awaria'), proby: hala.obiekty('proba'), zlecenia: hala.obiekty('zlecenie'),
                            slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale, teraz: d.teraz, okno, gotowe });
    const tw = w.terminowosc;
    // Terminowość zleceń (D31): pasek = % w terminie, czerwony, gdy poniżej 80 %.
    const wierszTerminu = g => `<div class="pasek-wsk">
            <span class="nazwa">${esc(g.nazwa)}</span>
            <span class="slupek"><i class="${g.proc >= 80 ? 'dobrze' : ''}" style="width:${g.proc}%"></i></span>
            <span class="liczba">${W.procent(g.proc)} %</span>
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
        ${kafel(w.naMaszyne ? 'zatrzymania_maszyn' : 'zatrzymania', w.zatrzymania, w.zatrzymania ? 'pilne' : 'zero')}
        ${kafel('przestoj', czas(w.przestojMs), w.przestojMs ? 'pilne' : 'zero')}
        ${kafel('reakcja', czas(w.reakcjaMs), w.reakcjaMs === null ? 'zero' : '')}
        ${kafel('mttr', czas(w.mttrMs), w.mttrMs === null ? 'zero' : '')}
        ${kafel('mtbf', czas(w.mtbfMs), w.mtbfMs === null ? 'zero' : '')}
        ${kafel('braki', w.brakiProc === null ? '—' : `${W.procent(w.brakiProc)} %`, w.brakiProc ? 'uwaga' : 'zero')}
        ${kafel('zlecenia_wykonane', `${w.zleceniaWykonane}/${w.zlecenia}`, w.zlecenia ? 'dobrze' : 'zero')}
        ${kafel('zlecenia_w_terminie', tw.proc === null ? '—' : `${W.procent(tw.proc)} %`, tw.proc === null ? 'zero' : tw.proc >= 80 ? 'dobrze' : 'pilne')}
      </div>
      <div class="wskazniki-dwa">
        <section>${naglowek(w.naMaszyne ? 'przestoj_maszyny' : 'przestoj_linie')}
          ${(w.naMaszyne ? w.maszyny : w.linie).map(k => `<div class="pasek-wsk">
            <span class="nazwa">${esc(k.nazwa)}</span>
            <span class="slupek"><i style="width:${k.proc}%"></i></span>
            <span class="liczba">${esc(czas(k.przestojMs))}</span>
            <span class="slaby">${k.awarie} aw.${k.zatrzymania ? ` · ${k.zatrzymania} zatrz.` : ''}${k.mttrMs !== null ? ` · MTTR ${esc(czas(k.mttrMs))}` : ''}</span>
          </div>`).join('') || (w.naMaszyne ? '<p class="pusto ok">Bez awarii w tym okresie</p>' : '<p class="pusto">Brak linii</p>')}
        </section>
        <section>${naglowek('wady', w.proby ? `<span class="slaby">(${w.proby} prób, ${w.braki}/${w.sprawdzone} braków)</span>` : '')}
          ${w.pareto.map(p => `<div class="pasek-wsk">
            <span class="nazwa">${esc(p.nazwa)}</span>
            <span class="slupek"><i class="wada" style="width:${p.proc}%"></i></span>
            <span class="liczba">${p.ile} szt.</span><span class="slaby">${W.procent(p.proc)} %</span>
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
