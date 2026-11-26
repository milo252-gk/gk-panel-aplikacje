/* Panel Zarządczy GK — wyniki pracy: terminowość, wykonane do zadanych, średnia dzienna, zlecenia bez przypisania wzięte na siebie
   i odrzucone przez kierownika (właściciel 2026-11-23: „Raport pracy, brakuje mi…”, D98).

   JEDEN komponent dla Panelu (Wyniki: zakład, działy, osoby — kierownik zakładu, Menedżer i kierownik działu swój dział) i dla
   GK Produkcja, UR i KJ („Moje wyniki” w Więcej — osoba widzi tylko siebie). Te same liczby, nazwy i układ na telefonie i komputerze:
       HalaWyniki.licz(zlecenia, opcje)        // czysta funkcja: miary zakładu, działów i osób (testy na obiektach)
       HalaWyniki.okno('miesiac', teraz)       // {od, do, nazwa} w czasie zakładu; dzien | tydzien | miesiac
       HalaWyniki.dostep(role, stale)          // {tryb: 'zarzad', dzialy: null | [kody]} albo {tryb: 'moje'}
       HalaWyniki.wiersze(wynik, slowniki...)  // wiersze z nazwami — ekran i CSV z tych samych liczb
       HalaWyniki.csv(wiersze)                 // „Do Excela”: UTF-8 z BOM, średnik, CRLF, = + - @ z apostrofem
       HalaWyniki.rysuj(el, hala, { tryb, klucz, tytul, komunikat })
   Definicje („i” przy kafelkach): miary.js → wyniki_*. Zasady liczenia — komentarz przy licz. Dane: zlecenia z pamięci aplikacji
   i z serwera (hala.pobierzStan, jak „Zlecenia na osobę” w Wskaźnikach, z zapasem ZAPAS_DNI na zlecenia zlecone wcześniej niż termin) — bez własnego adresu, więc nic nie zmienia w serwerze.
   Wygląd: hala.css → .wyniki. */

(function (global) {
  'use strict';

  const H = () => global.Hala;
  const M = () => global.HalaMiary;
  const dwa = n => String(n).padStart(2, '0');
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  const BEZ_LICZENIA = ['anulowane', 'zaplanowane'];
  const MS_DOBY = 86400000;
  const TTL_MS = 5 * 60000;
  // Hub filtruje po `zmieniono`, a okres liczymy po terminie: zlecenie zlecone wcześniej i nietknięte od tego czasu miałoby starszą
  // zmianę niż początek okresu. Zapas: 14 dni dla dnia i tygodnia, 60 dla miesiąca i zakresu.
  const ZAPAS_DNI = { dzien: 14, tydzien: 14, miesiac: 60, zakres: 60 };

  // ------------------------------------------------------------ okna czasu (doba zakładu, nie telefonu)

  const dzienZakladu = ms => { const l = H().lokalny(ms); return `${l.rok}-${dwa(l.miesiac)}-${dwa(l.dzien)}`; };

  /* Okno [od, do) bieżącego dnia, tygodnia (od poniedziałku) albo miesiąca w czasie zakładu. */
  function okno(rodzaj, teraz) {
    const l = H().lokalny(teraz), z = (r, m, d) => H().zLokalnego(r, m, d, 0, 0);
    if (rodzaj === 'dzien') return { od: z(l.rok, l.miesiac, l.dzien), do: z(l.rok, l.miesiac, l.dzien + 1), nazwa: `Dziś · ${dwa(l.dzien)}.${dwa(l.miesiac)}.${l.rok}` };
    if (rodzaj === 'tydzien') {
      const dt = (new Date(Date.UTC(l.rok, l.miesiac - 1, l.dzien)).getUTCDay() + 6) % 7;
      const a = new Date(Date.UTC(l.rok, l.miesiac - 1, l.dzien - dt)), k = new Date(Date.UTC(l.rok, l.miesiac - 1, l.dzien - dt + 6));
      return { od: z(l.rok, l.miesiac, l.dzien - dt), do: z(l.rok, l.miesiac, l.dzien - dt + 7),
               nazwa: `Tydzień · ${dwa(a.getUTCDate())}.${dwa(a.getUTCMonth() + 1)} – ${dwa(k.getUTCDate())}.${dwa(k.getUTCMonth() + 1)}.${k.getUTCFullYear()}` };
    }
    return { od: z(l.rok, l.miesiac, 1), do: z(l.rok, l.miesiac + 1, 1), nazwa: `Miesiąc · ${MIESIACE[l.miesiac - 1]} ${l.rok}` };
  }

  /* Dni robocze zakładu w [od, min(do, teraz)] wg planu zmian (D95): dzień z co najmniej jedną planową zmianą. null = brak planu. */
  function dniRobocze(od, do_, teraz, slowniki) {
    const plan = (slowniki && slowniki.plan_zmian) || null;
    if (!plan || !Object.keys(plan).length) return null;
    // Po dniach kalendarzowych zakładu, nie co 24 h: doba ze zmianą czasu ma 23 albo 25 h i pętla po ms liczyłaby dzień za dużo albo za mało.
    const a = H().lokalny(od), b = H().lokalny(Math.min(do_ - 1, teraz));
    let n = 0;
    for (let t = Date.UTC(a.rok, a.miesiac - 1, a.dzien); t <= Date.UTC(b.rok, b.miesiac - 1, b.dzien); t += MS_DOBY) {
      const x = new Date(t);
      if (H().zmianyPlanowe(`${x.getUTCFullYear()}-${dwa(x.getUTCMonth() + 1)}-${dwa(x.getUTCDate())}`, plan, slowniki.zmiany).length) n++;
    }
    return n;
  }

  // ------------------------------------------------------------ liczenie

  const zero = () => ({ zadane: 0, zrobione: 0, wTerminie: 0, poTerminie: 0, niewykonane: 0, wToku: 0, ocenione: 0,
                        wMiesiacu: 0, zapadle: 0, wziete: 0, zwrocone: 0, zwroconePozycje: 0, dniZeZleceniami: new Set() });

  /* Miary zakładu (`razem`), działów (`dzialy`) i osób (`osoby`) za okres [od, do) i za bieżący miesiąc kalendarzowy.
     opcje: { od, do, teraz, miesiac: {od, do}, slowniki, dzialy (tylko te działy: kierownik działu), dzial (jeden dział),
              osoba (tylko zlecenia tej osoby — „Moje wyniki”) }.
     Zasady (spójne z Wskaźnikami — D37 „jedne liczby”):
       * zadane — zlecenia Z TERMINEM w okresie (bez terminu: zlecone w okresie, `czas_zlecenia`); bez anulowanych, zaplanowanych i części rozdzielonych (D76: liczy
         się całość). Osoba — Hala.ktoPracowal; zlecenie z terminem w dniu jej urlopu nie liczy się osobie (dziale i zakładowi tak);
       * zrobione — wykonane albo zamknięte z czasem wykonania i bez niewykonanych pozycji; w terminie / po terminie wg
         Hala.terminowoscZlecenia (ta sama reguła co kafelek „Zlecenia w terminie”);
       * niewykonane — przepadłe, „Nie mogę”, zamknięte z niewykonanymi pozycjami i otwarte po terminie; w toku — reszta;
       * terminowość — w terminie ÷ ocenione (zlecenia z terminem, które się liczą w kafelku „Zlecenia w terminie”);
       * średnio dziennie — zlecenia z terminem już minionym ÷ dni robocze wg planu zmian (do dziś), bez planu — dni, w których zakres miał zlecenia (wg terminu);
       * wMiesiacu — zadane w bieżącym miesiącu, zawsze (obok wybranego okresu);
       * wziete — zlecenie bez wskazanej osoby (brak `wykonawca`), które osoba wzięła na siebie;
       * zwrocone — zlecenia, które kierownik albo Menedżer zwrócił („Zwróć”: `czas_zwrotu`); zwroconePozycje — pozycje checklist
         zwrócone osobno (D87: `pozycje_zwrocone`). */
  function licz(lista, opcje) {
    const o = opcje || {}, h = H();
    const teraz = typeof o.teraz === 'number' ? o.teraz : Date.parse(o.teraz);
    const od = o.od, do_ = o.do, mOd = o.miesiac.od, mDo = o.miesiac.do;
    const dzialyDozwolone = o.dzialy ? new Set(o.dzialy) : null;
    const razem = zero(), dzialy = new Map(), osoby = new Map();
    const agg = (mapa, klucz) => mapa.get(klucz) || mapa.set(klucz, Object.assign(zero(), { dzialyKody: new Set() })).get(klucz);
    for (const z of lista || []) {
      if (!z || BEZ_LICZENIA.includes(z.status)) continue;
      const d = z.dane || {};
      if (d.nadrzedne || (dzialyDozwolone && !dzialyDozwolone.has(d.dzial)) || (o.dzial && d.dzial !== o.dzial)) continue;
      // Okres liczymy po TERMINIE zlecenia (decyzja właściciela 2026-11-23); bez terminu — po czasie zlecenia.
      const termin = Date.parse(d.termin);
      const t = !isNaN(termin) ? termin : Date.parse(d.czas_zlecenia || z.utworzono);
      const wOkresie = t >= od && t < do_, wMiesiacu = t >= mOd && t < mDo;
      if (!wOkresie && !wMiesiacu) continue;
      let kto = h.ktoPracowal(d);
      if (kto && !isNaN(termin) && h.naUrlopie(o.slowniki, kto, dzienZakladu(termin))) kto = null;
      if (o.osoba && kto !== o.osoba) continue;

      const wykonano = Date.parse(d.czas_wykonania);
      const gotowe = (z.status === 'wykonane' || z.status === 'zamkniete') && !isNaN(wykonano);
      const zrobione = gotowe && !(Array.isArray(d.niewykonane) && d.niewykonane.length);
      const ocena = h.terminowoscZlecenia(z, teraz);
      const otwarte = !gotowe && ['nowe', 'przyjete', 'rozdzielone'].includes(z.status);
      const niewykonane = !zrobione && !(otwarte && ocena !== false);
      const pozycje = d.pozycje_zwrocone && typeof d.pozycje_zwrocone === 'object' ? Object.keys(d.pozycje_zwrocone).length : 0;
      const dzien = dzienZakladu(t);

      const cele = [razem];
      if (d.dzial) cele.push(agg(dzialy, d.dzial));
      if (kto) cele.push(agg(osoby, kto));
      for (const m of cele) {
        if (m.dzialyKody && d.dzial) m.dzialyKody.add(d.dzial);
        if (wMiesiacu) m.wMiesiacu++;
        if (!wOkresie) continue;
        m.zadane++;
        if (t <= teraz) m.zapadle++;
        m.dniZeZleceniami.add(dzien);
        if (zrobione) { m.zrobione++; if (ocena === true) m.wTerminie++; else if (ocena === false) m.poTerminie++; }
        else if (niewykonane) m.niewykonane++;
        else m.wToku++;
        if (ocena !== null) m.ocenione++;
        if (!d.wykonawca && kto) m.wziete++;
        if (d.czas_zwrotu) m.zwrocone++;
        m.zwroconePozycje += pozycje;
      }
    }
    const roboczeOkresu = dniRobocze(od, do_, teraz, o.slowniki);
    const koncowe = (m, kod) => {
      const dni = roboczeOkresu !== null ? roboczeOkresu : m.dniZeZleceniami.size;
      const wynik = Object.assign({}, m, { kod, dni, dniZPlanu: roboczeOkresu !== null,
        proc: m.ocenione ? Math.round(m.wTerminie * 100 / m.ocenione) : null,
        procZrobionych: m.zadane ? Math.round(m.zrobione * 100 / m.zadane) : null,
        srednio: dni && m.zapadle ? Math.round(m.zapadle * 10 / dni) / 10 : null,
        dzialy: m.dzialyKody ? [...m.dzialyKody].sort() : [] });
      delete wynik.dniZeZleceniami; delete wynik.dzialyKody;
      return wynik;
    };
    const lista2 = mapa => [...mapa].filter(([, m]) => m.zadane).map(([kod, m]) => koncowe(m, kod)).sort((a, b) => b.zadane - a.zadane || (a.kod < b.kod ? -1 : a.kod > b.kod ? 1 : 0));
    return { razem: koncowe(razem, null), dzialy: lista2(dzialy), osoby: lista2(osoby) };
  }

  /* Kto co widzi: kierownik zakładu i Menedżer — wszystko; kierownik działu (UR, KJ…) — swój dział; reszta — tylko siebie. */
  function dostep(role, stale) {
    // 1.44.0: Prezes ma wgląd jak Kierownik zakładu — wyniki całego zakładu (tylko odczyt; dane i tak z /stan).
    if (H().jestPrezesem && H().jestPrezesem(role)) return { tryb: 'zarzad', dzialy: null };
    const dz = H().dzialyKierownika(role, (stale && stale.dzialy) || []);
    if (dz === null) return { tryb: 'zarzad', dzialy: null };
    return dz.length ? { tryb: 'zarzad', dzialy: dz } : { tryb: 'moje' };
  }

  // ------------------------------------------------------------ wiersze i CSV

  const NAGLOWKI = ['Rodzaj', 'Nazwa', 'Dział', 'Zlecone', 'Wykonane', 'Wykonane %', 'W terminie', 'Po terminie', 'Niewykonane', 'W toku',
    'Terminowość %', 'Średnio dziennie', 'Zlecone w miesiącu', 'Wzięte bez przypisania', 'Odrzucone przez kierownika', 'Zwrócone pozycje'];

  /* Wiersze z nazwami: zakład / dział (albo „Wybrany dział”) i osoby — ekran i CSV liczą z tego samego. */
  function wiersze(wynik, o) {
    const nazwyDzialow = new Map((((o || {}).stale || {}).dzialy || []).map(d => [d.kod, d.nazwa]));
    const nazwaDzialu = k => nazwyDzialow.get(k) || k;
    const nazwaOsoby = id => { const p = (((o || {}).pracownicy) || []).find(x => x && x.id === id); return p ? p.nazwa : id; };
    const w = (rodzaj, nazwa, dzial, m) => Object.assign({}, m, { rodzaj, nazwa, dzial });
    const lista = [w('Razem', (o || {}).nazwaRazem || 'Razem', '', wynik.razem)];
    for (const m of wynik.dzialy) lista.push(w('Dział', nazwaDzialu(m.kod), '', m));
    for (const m of wynik.osoby) lista.push(w('Osoba', nazwaOsoby(m.kod), m.dzialy.map(nazwaDzialu).join(', '), m));
    return lista;
  }

  const liczbaPl = v => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  const bezFormuly = s => (typeof s === 'string' && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
  const pole = v => { const s = String(bezFormuly(v === null || v === undefined ? '' : v)); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function csv(lista) {
    const wiersz = x => [x.rodzaj, x.nazwa, x.dzial, x.zadane, x.zrobione, liczbaPl(x.procZrobionych), x.wTerminie, x.poTerminie, x.niewykonane, x.wToku,
      liczbaPl(x.proc), liczbaPl(x.srednio), x.wMiesiacu, x.wziete, x.zwrocone, x.zwroconePozycje];
    return '﻿' + [NAGLOWKI, ...lista.map(wiersz)].map(r => r.map(pole).join(';')).join('\r\n') + '\r\n';
  }

  // ------------------------------------------------------------ ekran

  const procent = v => (v === null || v === undefined ? '—' : `${v} %`);
  const liczba = v => (v === null || v === undefined ? '—' : String(v).replace('.', ','));

  /* Kafelki jednego zestawu miar (kolejność i nazwy te same w Panelu i w „Moje wyniki”). */
  function kafelki(m, miesiacNazwa) {
    const kafel = (klucz, wartosc, podpis, klasa) => `<div class="${klasa || ''}" title="${esc(M().title(klucz))}"><span class="etykieta">${esc(M().DEFINICJE[klucz].nazwa)}${M().przycisk(klucz)}</span><b>${esc(wartosc)}</b>${podpis ? `<small>${esc(podpis)}</small>` : ''}</div>`;
    return `<div class="hala-kafelki">
      ${kafel('wyniki_terminowosc', procent(m.proc), m.ocenione ? `${m.wTerminie} z ${m.ocenione}` : 'brak ocenionych', m.proc === null ? 'zero' : m.proc >= 80 ? 'dobrze' : 'pilne')}
      ${kafel('wyniki_wykonane', `${m.zrobione}/${m.zadane}`, m.procZrobionych === null ? '' : `${m.procZrobionych} %`, m.procZrobionych === null ? 'zero' : m.procZrobionych >= 80 ? 'dobrze' : m.procZrobionych >= 50 ? 'uwaga' : 'pilne')}
      ${kafel('wyniki_po_terminie', m.poTerminie, '', m.poTerminie ? 'uwaga' : 'zero')}
      ${kafel('wyniki_niewykonane', m.niewykonane, '', m.niewykonane ? 'pilne' : 'zero')}
      ${kafel('wyniki_w_toku', m.wToku, '', m.wToku ? '' : 'zero')}
      ${kafel('wyniki_srednio', liczba(m.srednio), m.dni ? `${m.dni} ${m.dniZPlanu ? 'dni rob.' : 'dni ze zleceniami'}` : '', m.srednio === null ? 'zero' : '')}
      ${kafel('wyniki_miesiac', m.wMiesiacu, miesiacNazwa, m.wMiesiacu ? '' : 'zero')}
      ${kafel('wyniki_wziete', m.wziete, '', m.wziete ? 'dobrze' : 'zero')}
      ${kafel('wyniki_odrzucone', m.zwrocone, m.zwroconePozycje ? `+ ${m.zwroconePozycje} zwróconych pozycji` : '', m.zwrocone ? 'uwaga' : 'zero')}
    </div>`;
  }

  /* Karta osoby albo działu na liście (te same miary co kafelki, zwarcie). */
  function karta(x) {
    const wiersz = (nazwa, wartosc) => `<div><dt>${esc(nazwa)}</dt><dd>${esc(wartosc)}</dd></div>`;
    return `<article class="wyniki-karta">
      <header><b>${esc(x.nazwa)}</b>${x.dzial ? `<span class="slaby">${esc(x.dzial)}</span>` : ''}
        <span class="wyniki-proc ${x.proc === null ? '' : x.proc >= 80 ? 'dobrze' : 'zle'}" title="${esc(M().title('wyniki_terminowosc'))}">${esc(procent(x.proc))}</span></header>
      <span class="wyniki-pasek" aria-hidden="true"><i class="${x.proc !== null && x.proc >= 80 ? 'dobrze' : ''}" style="width:${x.proc === null ? 0 : x.proc}%"></i></span>
      <dl>${wiersz('Wykonane', `${x.zrobione}/${x.zadane}${x.procZrobionych === null ? '' : ` (${x.procZrobionych} %)`}`)}
        ${wiersz('Po terminie', x.poTerminie)}${wiersz('Niewykonane', x.niewykonane)}${wiersz('W toku', x.wToku)}
        ${wiersz('Średnio dziennie', liczba(x.srednio))}${wiersz('W tym miesiącu', x.wMiesiacu)}
        ${wiersz('Wzięte bez przypisania', x.wziete)}${wiersz('Odrzucone przez kierownika', x.zwrocone + (x.zwroconePozycje ? ` (+${x.zwroconePozycje} poz.)` : ''))}</dl>
    </article>`;
  }

  const stan = new Map();            // klucz ekranu → { okres, zakres: {od, do}, dzial, osoba, blad }
  const zSerwera = new Map();        // 'od ISO' → { lista, ucieto, razem, pokazano, kiedy, blad }
  const wToku = new Set();

  async function pobierz(hala, tryb, odIso, powtorz) {
    const klucz = `${tryb}|${odIso}`;
    if (wToku.has(klucz)) return;
    wToku.add(klucz);
    try {
      // „Moje wyniki”: serwer oddaje tylko zlecenia tej osoby (GET /ja/zlecenia); Panel — całość (kierownik ma do niej prawo).
      const w = tryb === 'moje' ? await hala.mojeZlecenia(odIso) : await hala.pobierzStan('zlecenie', { od: odIso, limit: 5000 });
      zSerwera.set(klucz, { lista: w.zlecenia || w.obiekty || [], ucieto: !!w.ucieto, razem: w.razem, pokazano: w.pokazano, kiedy: Date.now() });
    } catch (e) {
      zSerwera.set(klucz, { lista: null, brakTrasy: !!(e && e.kod === 404), kiedy: Date.now() - TTL_MS + 60000 });      // bez sieci: następna próba za minutę
    } finally {
      wToku.delete(klucz);
      powtorz();
    }
  }

  function rysuj(el, hala, opcje) {
    if (!el || !hala.pracownik) return;
    const o = Object.assign({ tryb: 'moje', klucz: 'wyniki', komunikat: null }, opcje || {});
    const stale = (hala.kontrakt && hala.kontrakt.stale) || {};
    const dost = o.tryb === 'zarzad' ? dostep(hala.pracownik.role, stale) : { tryb: 'moje' };
    if (o.tryb === 'zarzad' && dost.tryb !== 'zarzad') { el.innerHTML = '<p class="pusto">Ten ekran widzą kierownik zakładu, Menedżer i kierownicy działów. Twoje wyniki są w „Moje wyniki”.</p>'; return; }
    const st = stan.get(o.klucz) || stan.set(o.klucz, { okres: 'miesiac', zakres: null, dzial: '', osoba: '', blad: '' }).get(o.klucz);
    const teraz = hala.teraz();
    const pamiec = M().pamiecZakresu(o.klucz, () => hala.teraz());
    if (!st.zakres) st.zakres = pamiec.czytaj();

    if (!el.querySelector('[data-wyniki]')) {
      el.innerHTML = `<section class="wyniki" data-wyniki>
        ${o.tytul ? `<h1>${esc(o.tytul)}</h1>` : ''}
        <div class="wyniki-chipy" role="group" aria-label="Okres">
          <button type="button" data-okres="dzien">Dziś</button><button type="button" data-okres="tydzien">Tydzień</button>
          <button type="button" data-okres="miesiac">Miesiąc</button><button type="button" data-okres="zakres">Zakres</button>
        </div>
        <div data-w-zakres hidden></div>
        ${o.tryb === 'zarzad' ? '<form class="wyniki-filtry" autocomplete="off"><label>Dział<select name="dzial"></select></label><label>Osoba<select name="osoba"></select></label></form>' : ''}
        <p class="slaby wyniki-opis" data-w-opis></p>
        <div data-w-tresc></div>
      </section>`;
      const ponow = () => rysuj(el, hala, opcje);
      el.querySelector('.wyniki-chipy').addEventListener('click', ev => {
        const b = ev.target.closest('[data-okres]');
        if (!b) return;
        st.okres = b.dataset.okres; st.blad = '';
        el.querySelector('[data-w-zakres]').innerHTML = '';
        ponow();
      });
      el.querySelector('[data-w-zakres]').addEventListener('submit', ev => {
        ev.preventDefault();
        const f = ev.target, z = M().zakres(f.od.value, f.do.value);
        st.blad = z.blad || '';
        if (!z.blad) { st.zakres = { od: f.od.value, do: f.do.value }; pamiec.zapisz({ od: f.od.value, do: f.do.value, wybrany: true }); }
        el.querySelector('[data-w-zakres]').innerHTML = M().poleZakresu(z.blad ? { od: f.od.value, do: f.do.value } : st.zakres, st.blad);
        ponow();
      });
      const filtry = el.querySelector('.wyniki-filtry');
      if (filtry) filtry.addEventListener('change', () => { st.dzial = filtry.dzial.value; st.osoba = filtry.osoba.value; ponow(); });
      if (filtry) filtry.addEventListener('submit', ev => ev.preventDefault());
      M().podlacz(el);
    }
    for (const b of el.querySelectorAll('[data-okres]')) b.setAttribute('aria-pressed', String(b.dataset.okres === st.okres));
    const poleZakresu = el.querySelector('[data-w-zakres]');
    poleZakresu.hidden = st.okres !== 'zakres';
    if (st.okres === 'zakres' && !poleZakresu.firstElementChild) poleZakresu.innerHTML = M().poleZakresu(st.zakres, st.blad);     // pola dat nie znikają przy odświeżeniu

    const opis = el.querySelector('[data-w-opis]'), tresc = el.querySelector('[data-w-tresc]');
    const miesiac = okno('miesiac', teraz);
    let czas;
    if (st.okres === 'zakres') {
      const z = M().zakres(st.zakres.od, st.zakres.do);
      if (z.blad) { opis.textContent = ''; tresc.innerHTML = ''; return; }
      czas = { od: z.od, do: z.do, nazwa: `Zakres · ${z.opis}` };
    } else czas = okno(st.okres, teraz);

    // Filtry (tylko Panel): działy w zakresie kierownika, osoby wybranego działu.
    const dzialyDost = ((stale.dzialy) || []).filter(d => !dost.dzialy || dost.dzialy.includes(d.kod));
    let nazwaRazem = o.tryb === 'zarzad' ? 'Razem' : hala.pracownik.nazwa;
    if (o.tryb === 'zarzad') {
      const f = el.querySelector('.wyniki-filtry');
      if (dost.dzialy && dost.dzialy.length === 1 && !st.dzial) st.dzial = dost.dzialy[0];
      const kodyRol = new Set((st.dzial ? dzialyDost.filter(d => d.kod === st.dzial) : dzialyDost).flatMap(d => d.role || []));
      const osoby = (hala.pracownicy || []).filter(p => p && (p.role || []).some(r => kodyRol.has(r)));
      const opcjeD = (dost.dzialy && dost.dzialy.length === 1 ? '' : '<option value="">wszystkie</option>') + dzialyDost.map(d => `<option value="${esc(d.kod)}">${esc(d.nazwa)}</option>`).join('');
      const opcjeO = '<option value="">wszyscy</option>' + osoby.map(p => `<option value="${esc(p.id)}">${esc(p.nazwa)}</option>`).join('');
      if (f.dzial.dataset.html !== opcjeD) { f.dzial.innerHTML = opcjeD; f.dzial.dataset.html = opcjeD; }
      if (f.osoba.dataset.html !== opcjeO) { f.osoba.innerHTML = opcjeO; f.osoba.dataset.html = opcjeO; }
      if (st.osoba && !osoby.some(p => p.id === st.osoba)) st.osoba = '';
      f.dzial.value = st.dzial; f.osoba.value = st.osoba;
      const dz = dzialyDost.find(d => d.kod === st.dzial);
      nazwaRazem = dz ? dz.nazwa : dost.dzialy ? 'Moje działy' : 'Cały zakład';
    }

    // Dane: pamięć aplikacji + serwer (pamięć trzyma tylko ostatnie doby; miesiąc i zakres — z serwera, jak „Zlecenia na osobę”).
    const odIso = new Date(Math.min(czas.od, miesiac.od) - ZAPAS_DNI[st.okres] * MS_DOBY).toISOString();
    const klucz = `${o.tryb}|${odIso}`, c = zSerwera.get(klucz);
    if (!c || Date.now() - c.kiedy > TTL_MS) pobierz(hala, o.tryb, odIso, () => { if (el.isConnected && el.querySelector('[data-wyniki]')) rysuj(el, hala, opcje); });
    if (!c) { opis.textContent = czas.nazwa; tresc.innerHTML = '<p class="pusto">Liczę na serwerze…</p>'; return; }
    const pamieciowe = hala.obiekty('zlecenie') || [];
    const jest = new Set(pamieciowe.map(x => x.id));
    const lista = c.lista ? pamieciowe.concat(c.lista.filter(x => !jest.has(x.id))) : pamieciowe;

    const wynik = licz(lista, { od: czas.od, do: czas.do, teraz, miesiac, slowniki: hala.slowniki, dzialy: dost.dzialy,
      dzial: st.dzial || '', osoba: o.tryb === 'moje' ? hala.pracownik.id : '' });
    const wierszeWyniku = wiersze(wynik, { stale, pracownicy: hala.pracownicy, nazwaRazem });
    const ostrzezenia = [!c.lista ? (c.brakTrasy ? 'Serwer nie ma jeszcze „Moich wyników” — poczekaj na jego aktualizację. Liczby tylko z ostatnich dni zapamiętanych w aplikacji.' : 'Brak połączenia z serwerem — liczby tylko z ostatnich dni zapamiętanych w aplikacji.') : '',
      c.ucieto ? `Pokazano ${c.pokazano} z ${c.razem} zleceń — zawęź okres, bo liczby mogą być niepełne.` : ''].filter(Boolean);
    opis.textContent = czas.nazwa;

    const wybrana = o.tryb === 'zarzad' && st.osoba ? wierszeWyniku.find(x => x.rodzaj === 'Osoba' && x.kod === st.osoba) : null;
    const glowne = wybrana || wierszeWyniku[0];
    let html = ostrzezenia.map(t => `<p class="wyniki-uwaga">${esc(t)}</p>`).join('');
    if (o.tryb === 'zarzad' && st.osoba && !wybrana) html += '<p class="pusto">Ta osoba nie ma zleceń w tym okresie.</p>';
    html += `<h3 class="wyniki-tytul">${esc(wybrana ? wybrana.nazwa : nazwaRazem)}${wybrana && wybrana.dzial ? ` <span class="slaby">${esc(wybrana.dzial)}</span>` : ''}</h3>`;
    html += glowne.zadane || glowne.wMiesiacu ? kafelki(glowne, MIESIACE[H().lokalny(teraz).miesiac - 1])
      : `<p class="pusto">${o.tryb === 'moje' ? 'Nie miałeś zleceń w tym okresie.' : 'Brak zleceń w tym okresie.'}</p>`;
    if (o.tryb === 'zarzad') {
      const dzialy = wierszeWyniku.filter(x => x.rodzaj === 'Dział'), osoby = wierszeWyniku.filter(x => x.rodzaj === 'Osoba');
      const lista2 = wybrana ? [] : osoby;
      if (!st.dzial && dzialy.length > 1) html += `<h3 class="wyniki-tytul">Działy</h3><div class="wyniki-karty">${dzialy.map(karta).join('')}</div>`;
      if (lista2.length) html += `<h3 class="wyniki-tytul">Osoby</h3><div class="wyniki-karty">${lista2.map(karta).join('')}</div>`;
      if (wybrana) html += `<h3 class="wyniki-tytul">${esc(nazwaRazem)}</h3><div class="wyniki-karty">${karta(wierszeWyniku[0])}</div>`;
      html += `<div class="wyniki-eksport"><button type="button" data-w-csv>${global.GKIkony ? `<span class="ik">${global.GKIkony.html('pobierz', 16)}</span>` : ''}Do Excela (CSV)</button></div>`;
    }
    tresc.innerHTML = html;
    const przycisk = tresc.querySelector('[data-w-csv]');
    if (przycisk) przycisk.addEventListener('click', () => {
      const plik = `gk-wyniki-${dzienZakladu(czas.od)}-${dzienZakladu(czas.do - 1)}.csv`;
      const blob = new Blob([csv(wierszeWyniku)], { type: 'text/csv;charset=utf-8' });
      const a = global.document.createElement('a');
      a.href = global.URL.createObjectURL(blob); a.download = plik;
      global.document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => global.URL.revokeObjectURL(a.href), 1000);
      if (o.komunikat) o.komunikat(`Pobrano: ${plik}`, 'ok');
    });
  }

  global.HalaWyniki = { licz, okno, dostep, wiersze, csv, rysuj, kafelki, NAGLOWKI, dniRobocze };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.HalaWyniki;
})(typeof window !== 'undefined' ? window : globalThis);
