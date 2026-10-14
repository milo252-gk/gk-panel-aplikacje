/* Panel Kierownika — zgłoszenia nieprawidłowości, zużyte narzędzia, zgłoszenia BHP i zadania samego kierownika zakładu
   jako wiersze JEDNEJ listy Zleceń (D60, właściciel 2026-10-14: „oznaczaj rodzaje zleceń, a nie dziel je na kategorie —
   wszystko z tego jest zadaniem”). Wcześniej każde miało osobną zakładkę (D55, D59).

   Te same zasady co zlecenia: czeka na kierownika → „Do przyjęcia” (zgłoszenie nowe, narzędzia do odbioru, BHP otwarte),
   załatwione → „Zamknięte”; filtry Dział, Osoba, Rodzaj; znacznik rodzaju na wierszu.
   Zgłoszenia: „Zrób zlecenie”, „Zrób stałe”, „Przyjmij” (z uwagą), „Odrzuć” (powód wraca do zgłaszającego).
   Narzędzia: mistrz odkłada ze zdjęciem, kierownik odbiera — też ze zdjęciem (HalaDzialania).
   BHP (D59): „Zamknij” z opisem działań (bhp.zamkniete), „Zrób zlecenie”.
   Zadanie dla kierownika (dział „kierownik”, np. „Podsumuj zmianę”) jest zwykłym zleceniem na liście — „▶ Wykonaj”
   otwiera okno ze wspólnym ekranem wykonania (zlecenia.js, wymagania na żywo jak u działów).
   Czyste funkcje: widok.js (W.zgloszeniaLista, W.bhpLista, W.zlecenieZeZgloszenia, W.zlecenieZBhp, W.polaczZadania). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;
  const DZ = () => window.HalaDzialania;
  const jestKierownikiem = () => ((hala.pracownik && hala.pracownik.role) || []).some(r => r === 'kierownik' || r === 'admin');

  const miniatury = (ids, podpis) => ids.length ? `<div class="zdjecia">${ids.map(id =>
    `<button type="button" class="miniatura" data-zdjecie="${esc(id)}" data-podpis="${esc(podpis)}" aria-label="Powiększ zdjęcie"><img data-plik="${esc(id)}" alt=""></button>`).join('')}</div>` : '';
  const znacznikRodzaju = rodzaj => `<span class="znacznik rodzaj-zadania">${esc(W.nazwaRodzaju(rodzaj))}</span>`;

  // ------------------------------------------------------------ wiersze jednej listy

  function htmlZgloszenia(g, kier) {
    return `<article class="zlecenie ${g.nowe ? 'pilne' : ''}" data-rodzaj="zgloszenie" data-id="${esc(g.id)}">
        <div class="opis">
          <div class="tytul"><button type="button" class="tytul-historii" data-akcja="historia">${esc(g.tytul)}</button> <span class="slaby">${esc(g.numer)}</span></div>
          <div class="szczegoly">
            ${znacznikRodzaju('zgloszenie')}
            <span class="znacznik ${g.nowe ? 'alarm' : g.status === 'przyjete' ? 'ok' : 'neutral'}">${esc(g.etykieta)}</span>
            ${g.dzialNazwa ? `<span class="znacznik neutral">${esc(g.dzialNazwa)}</span>` : ''}
            ${g.maszynaNazwa ? `<span>${esc(g.maszynaNazwa)}</span>` : ''}${g.kto ? `<span>· ${esc(g.kto)}</span>` : ''}
          </div>
          ${g.opis ? `<div class="slaby tekst-opisu">${esc(g.opis)}</div>` : ''}
          ${g.odpowiedz ? `<div class="odpowiedz">${esc(g.odpowiedz)}</div>` : ''}
          ${miniatury(g.zdjecia, g.tytul)}
        </div>
        <div class="numer slaby">${esc(g.kiedyOpis)}</div>
        <div class="akcje">${g.nowe && kier ? `
          <button type="button" class="maly glowny" data-akcja="zlecenie">Zrób zlecenie</button>
          ${P.mozeZapisacStale() ? '<button type="button" class="maly" data-akcja="stale">Zrób stałe</button>' : ''}
          <button type="button" class="maly" data-akcja="przyjmij">Przyjmij</button>
          <button type="button" class="maly" data-akcja="odrzuc">Odrzuć</button>` : ''}
        </div>
      </article>`;
  }

  function htmlNarzedzi(n, d, kier) {
    const x = n.dane || {};
    const czeka = n.status === 'do_odbioru';
    return `<article class="zlecenie ${czeka ? 'pilne' : ''}" data-rodzaj="narzedzia" data-id="${esc(n.id)}">
        <div class="opis">
          <div class="tytul"><button type="button" class="tytul-historii" data-akcja="historia">🧰 ${esc(x.co || '')}</button> <span class="slaby">${esc(n.numer || '')}</span></div>
          <div class="szczegoly">${znacznikRodzaju('narzedzia')}<span class="znacznik ${czeka ? 'alarm' : 'ok'}">${esc(n.etykieta || n.status)}</span>
            ${x.miejsce ? `<span>${esc(x.miejsce)}</span>` : ''}<span>· ${esc(W.nazwaPracownika(d.pracownicy, x.odlozyl) || '')}</span></div>
          ${x.uwagi ? `<div class="slaby tekst-opisu">${esc(x.uwagi)}</div>` : ''}
          ${miniatury([].concat(x.zdjecia || []), `Odłożone: ${x.co || ''}`)}
          ${miniatury([].concat(x.zdjecia_odbioru || []), `Odebrane: ${x.co || ''}`)}
        </div>
        <div class="numer slaby">${esc(W.dataKrotka(x.czas_odlozenia))} ${esc(W.godzina(x.czas_odlozenia))}${x.czas_odbioru ? `<br>odebrane ${esc(W.godzina(x.czas_odbioru))}` : ''}</div>
        <div class="akcje">${czeka && kier ? '<button type="button" class="maly glowny" data-akcja="odbierz">📷 Odebrałem</button>' : ''}</div>
      </article>`;
  }

  function htmlBhp(b, moze) {
    return `<article class="zlecenie ${b.otwarte && b.pilne ? 'pilne' : ''}" data-rodzaj="bhp" data-id="${esc(b.id)}">
        <div class="opis">
          <div class="tytul"><button type="button" class="tytul-historii" data-akcja="historia">⛑ ${esc(b.rodzajNazwa)}</button> <span class="slaby">${esc(b.numer)}</span></div>
          <div class="szczegoly">
            ${znacznikRodzaju('bhp')}
            <span class="znacznik ${b.otwarte ? (b.pilne ? 'alarm' : 'uwaga') : 'ok'}">${esc(b.etykieta)}</span>
            ${b.liniaNazwa ? `<span>${esc(b.liniaNazwa)}</span>` : ''}${b.stanowiskoNazwa ? `<span>· ${esc(b.stanowiskoNazwa)}</span>` : ''}${b.kto ? `<span>· ${esc(b.kto)}</span>` : ''}
          </div>
          ${b.opis ? `<div class="tekst-opisu">${esc(b.opis)}</div>` : ''}
          ${b.dzialania ? `<div class="odpowiedz">Działania: ${esc(b.dzialania)}${b.zamknieteOpis ? ` <span class="slaby">(${esc(b.zamknieteOpis)})</span>` : ''}</div>` : ''}
          ${miniatury(b.zdjecia, `BHP: ${b.rodzajNazwa}`)}
        </div>
        <div class="numer slaby">${esc(b.kiedyOpis)}</div>
        <div class="akcje">${b.otwarte && moze ? `
          <button type="button" class="maly glowny" data-akcja="zamknij">Zamknij</button>
          ${P.mozeWyslac && P.mozeWyslac('zlecenie.utworzone') ? '<button type="button" class="maly" data-akcja="zlecenie">Zrób zlecenie</button>' : ''}` : ''}
        </div>
      </article>`;
  }

  /* Wiersze innych rodzajów dla filtra stanu ('otwarte' | 'do-zamkniecia' | 'zamkniete') — pola jak w wierszu zlecenia,
     żeby działały te same filtry: dzial, osoby, spoznione, rodzaj; czeka (na kierownika), alarm, czas, html. */
  function wiersze(d, filtr) {
    if (filtr === 'otwarte') return [];               // W toku — robota działów; to, co czeka na kierownika, jest w „Do przyjęcia”
    const chce = r => (filtr === 'do-zamkniecia' ? r.czeka : !r.czeka);
    const kier = jestKierownikiem();
    const moze = P.mozeWyslac ? P.mozeWyslac('bhp.zamkniete') : kier;
    const zgl = W.zgloszeniaLista({ zgloszenia: hala.obiekty('zgloszenie'), slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale })
      .map(g => ({ rodzaj: 'zgloszenie', id: g.id, czas: g.kiedy, dzial: g.dzial, osoby: [(hala.obiekt('zgloszenie', g.id) || { dane: {} }).dane.zglosil].filter(Boolean),
                   czeka: g.nowe, alarm: false, spoznione: false, html: htmlZgloszenia(g, kier) }));
    const nz = hala.obiekty('narzedzia').map(n => {
      const x = n.dane || {};
      return { rodzaj: 'narzedzia', id: n.id, czas: x.czas_odlozenia, dzial: 'mistrz', osoby: [x.odlozyl, x.odebral].filter(Boolean),
               czeka: n.status === 'do_odbioru', alarm: false, spoznione: false, html: htmlNarzedzi(n, d, kier) };
    });
    const bhp = W.bhpLista({ zgloszenia: hala.obiekty('bhp_zgloszenie'), slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale })
      .map(b => ({ rodzaj: 'bhp', id: b.id, czas: b.kiedy, dzial: 'produkcja', osoby: [(hala.obiekt('bhp_zgloszenie', b.id) || { dane: {} }).dane.zglosil].filter(Boolean),
                   czeka: b.otwarte, alarm: b.otwarte && b.pilne, spoznione: false, html: htmlBhp(b, moze) }));
    return [...zgl, ...nz, ...bhp].filter(chce);
  }

  /* Przyciski wierszy innych rodzajów (lista Zleceń w panel.js przekazuje tu kliknięcia z data-rodzaj). */
  async function akcja(rodzaj, nazwa, id, b) {
    try {
      if (rodzaj === 'zgloszenie') return await akcjaZgloszenia(nazwa, id);
      if (rodzaj === 'narzedzia') {
        if (nazwa === 'historia') return DZ().historia(hala, 'narzedzia', id);
        if (nazwa === 'odbierz') return DZ().odbierzNarzedzia(hala, id, { gotowe: t => P.komunikat(t, 'ok') });
      }
      if (rodzaj === 'bhp') return await akcjaBhp(nazwa, id, b);
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
    return undefined;
  }

  async function akcjaZgloszenia(nazwa, id) {
    const g = hala.obiekt('zgloszenie', id);
    if (nazwa === 'historia') return DZ().historia(hala, 'zgloszenie', id);
    if (nazwa === 'zlecenie') {
      P.noweZlecenie(Object.assign(W.zlecenieZeZgloszenia(g), { zgloszenie: id }), null, async zid => {
        await hala.zapisz('zgloszenie.przyjete', id, { zlecenie: zid, uwagi: 'Zrobiono z tego zlecenie' });
      });
    }
    if (nazwa === 'stale') {
      const w = W.zlecenieZeZgloszenia(g);
      P.widoki.stale.otworzZ(Object.assign(W.stalyDoFormularza({ tytul: w.tytul, opis: w.opis, dzial: w.dzial, linia: w.linia,
        maszyna: w.maszyna, wymagaj_zdjecia: true, wymagaj_notatki: true, harmonogram: { rodzaj: 'codziennie', zmiany: [] },
        termin: { rodzaj: 'koniec_zmiany' } })), 'Zlecenie stałe ze zgłoszenia', async kod => {
        await hala.zapisz('zgloszenie.przyjete', id, { stale: kod, uwagi: 'Zrobiono z tego zlecenie stałe' });
      });
    }
    if (nazwa === 'przyjmij') {
      const uwagi = await P.zapytajTekst({ tytul: 'Przyjąć zgłoszenie?', etykieta: 'Uwaga dla zgłaszającego (można zostawić puste)', przycisk: 'Przyjmij' });
      if (uwagi === null) return undefined;
      await hala.zapisz('zgloszenie.przyjete', id, uwagi ? { uwagi } : {});
      P.komunikat('Przyjęte', 'ok');
    }
    if (nazwa === 'odrzuc') {
      const powod = await P.zapytajTekst({ tytul: 'Odrzucić zgłoszenie?', etykieta: 'Dlaczego? (zgłaszający to zobaczy)', wymagany: true, przycisk: 'Odrzuć' });
      if (!powod) return undefined;
      await hala.zapisz('zgloszenie.odrzucone', id, { powod });
      P.komunikat('Odrzucone', 'ok');
    }
    return undefined;
  }

  async function akcjaBhp(nazwa, id, b) {
    if (nazwa === 'historia') {
      const t = b.textContent.replace(/^⛑\s*/, '');
      return DZ().historia(hala, 'bhp_zgloszenie', id, { tytul: `BHP: ${t}` });
    }
    const d = P.dane ? P.dane() : {};
    const w = W.bhpLista({ zgloszenia: [hala.obiekt('bhp_zgloszenie', id)], slowniki: d.slowniki || hala.slowniki,
                            pracownicy: d.pracownicy, stale: d.stale || (hala.kontrakt || {}).stale })[0];
    if (!w) return undefined;
    if (nazwa === 'zlecenie') P.noweZlecenie(W.zlecenieZBhp(w), null, async () => {});
    if (nazwa === 'zamknij') {
      const dzialania = await P.zapytajTekst({ tytul: `Zamknąć ${w.numer}?`, etykieta: 'Co zrobiono (działania)', wymagany: true, przycisk: 'Zamknij' });
      if (!dzialania) return undefined;
      await hala.zapisz('bhp.zamkniete', id, { dzialania });
      P.komunikat('Zgłoszenie BHP zamknięte', 'ok');
    }
    return undefined;
  }

  // ------------------------------------------------------------ zadanie dla kierownika: „▶ Wykonaj”

  /* Wspólny ekran wykonania (HalaZlecenia) tylko dla tego jednego zlecenia — te same wymagania na żywo (zdjęcie,
     notatka, skan, kroki) co w aplikacjach działów. Okno przerysowuje się przy każdej zmianie (odswiezWykonanie). */
  let wykonywane = null;
  function wykonaj(id) {
    wykonywane = id;
    odswiezWykonanie();
    const o = $('okno-wykonania');
    if (!o.open) o.showModal();
  }
  function odswiezWykonanie() {
    const o = $('okno-wykonania');
    if (!wykonywane || !window.HalaZlecenia) return;
    window.HalaZlecenia.rysuj($('wykonanie-zadania'), hala, { dzial: 'kierownik', tylko: wykonywane, bezDzialan: true,
                                                            komunikat: t => P.komunikat(t, 'ok') });
    if (o.open && !$('wykonanie-zadania').querySelector('[data-id]')) o.close();      // zrobione i przyjęte — nie ma czego pokazać
  }
  $('okno-wykonania').addEventListener('close', () => { wykonywane = null; });

  /* Liczby do chipów stanu: ile innych rzeczy czeka na kierownika; czy wśród nich jest pilne BHP (chip na czerwono). */
  function liczby() {
    const zg = hala.obiekty('zgloszenie').filter(g => g.status === 'nowe').length;
    const nz = hala.obiekty('narzedzia').filter(n => n.status === 'do_odbioru').length;
    const otwarteBhp = hala.obiekty('bhp_zgloszenie').filter(g => g.status === 'otwarte');
    const pilne = window.HalaDzwieki && window.HalaDzwieki.bhpPilne
      ? otwarteBhp.some(g => window.HalaDzwieki.bhpPilne(hala.kontrakt, (g.dane || {}).rodzaj)) : false;
    return { czeka: zg + nz + otwarteBhp.length, alarm: pilne };
  }

  P.widoki.zgloszenia = { wiersze, akcja, wykonaj, odswiezWykonanie, liczby, jestKierownikiem };
})();
