/* Panel Kierownika — zgłoszenia nieprawidłowości, zużyte narzędzia i „Moje zadania” kierownika zakładu (D55,
   prośby właściciela 2026-10-13).

   Zgłoszenia: działy (Lider, UR, KJ — „📝 Zgłoś nieprawidłowość” albo menu po skanie QR maszyny) informują kierownika
   zakładu. Kierownik: „Zrób zlecenie” (okno „Nowe zlecenie” wypełnione zgłoszeniem; po zapisie zgloszenie.przyjete
   z id zlecenia), „Zrób stałe” (okno zapisanego/stałego; po zapisie zgloszenie.przyjete z kodem), „Przyjmij” (bez
   zlecenia, z uwagą) albo „Odrzuć” (powód wraca do zgłaszającego).
   Narzędzia: mistrz odkłada zużyte narzędzia ze zdjęciem, kierownik odbiera — też ze zdjęciem (HalaDzialania).
   Moje zadania: wspólny ekran zleceń działów (zlecenia.js) dla działu „kierownik” — np. „Podsumuj zmianę”.
   BHP (D59): zgłoszenia BHP liderów — treść, zdjęcia, „Zamknij” z opisem działań (bhp.zamkniete), „Zrób zlecenie”.
   Czyste funkcje: widok.js (W.zgloszeniaLista, W.zlecenieZeZgloszenia). */

(() => {
  'use strict';
  const P = window.Panel;
  const { hala, W, $, esc } = P;
  const DZ = () => window.HalaDzialania;
  const jestKierownikiem = () => ((hala.pracownik && hala.pracownik.role) || []).some(r => r === 'kierownik' || r === 'admin');

  const miniatury = (ids, podpis) => ids.length ? `<div class="zdjecia">${ids.map(id =>
    `<button type="button" class="miniatura" data-zdjecie="${esc(id)}" data-podpis="${esc(podpis)}" aria-label="Powiększ zdjęcie"><img data-plik="${esc(id)}" alt=""></button>`).join('')}</div>` : '';
  const wczytajObrazki = el => { for (const e of el.querySelectorAll('img[data-plik]')) hala.adresPliku(e.dataset.plik).then(u => { e.src = u; }).catch(() => {}); };

  // ------------------------------------------------------------ zgłoszenia

  function rysujZgloszenia(d) {
    const lista = W.zgloszeniaLista({ zgloszenia: hala.obiekty('zgloszenie'), slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale });
    const kier = jestKierownikiem();
    const el = $('lista-zgloszen');
    el.innerHTML = lista.map(g => `
      <article class="zlecenie ${g.nowe ? 'pilne' : ''}" data-id="${esc(g.id)}">
        <div class="opis">
          <div class="tytul"><button type="button" class="tytul-historii" data-akcja="historia">${esc(g.tytul)}</button> <span class="slaby">${esc(g.numer)}</span></div>
          <div class="szczegoly">
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
      </article>`).join('') || '<p class="pusto">Brak zgłoszeń. Działy zgłaszają nieprawidłowości z ekranu Zleceń albo po skanie QR maszyny.</p>';
    wczytajObrazki(el);
  }

  $('lista-zgloszen').addEventListener('click', async ev => {
    const foto = ev.target.closest('[data-zdjecie]');
    if (foto) { P.pokazZdjecie(foto.dataset.zdjecie, foto.dataset.podpis); return; }
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    const g = hala.obiekt('zgloszenie', id);
    try {
      if (b.dataset.akcja === 'historia') return DZ().historia(hala, 'zgloszenie', id);
      if (b.dataset.akcja === 'zlecenie') {
        P.noweZlecenie(Object.assign(W.zlecenieZeZgloszenia(g), { zgloszenie: id }), null, async zid => {
          await hala.zapisz('zgloszenie.przyjete', id, { zlecenie: zid, uwagi: 'Zrobiono z tego zlecenie' });
        });
      }
      if (b.dataset.akcja === 'stale') {
        const w = W.zlecenieZeZgloszenia(g);
        P.widoki.stale.otworzZ(Object.assign(W.stalyDoFormularza({ tytul: w.tytul, opis: w.opis, dzial: w.dzial, linia: w.linia,
          maszyna: w.maszyna, wymagaj_zdjecia: true, wymagaj_notatki: true, harmonogram: { rodzaj: 'codziennie', zmiany: [] },
          termin: { rodzaj: 'koniec_zmiany' } })), 'Zlecenie stałe ze zgłoszenia', async kod => {
          await hala.zapisz('zgloszenie.przyjete', id, { stale: kod, uwagi: 'Zrobiono z tego zlecenie stałe' });
        });
      }
      if (b.dataset.akcja === 'przyjmij') {
        const uwagi = await P.zapytajTekst({ tytul: 'Przyjąć zgłoszenie?', etykieta: 'Uwaga dla zgłaszającego (można zostawić puste)', przycisk: 'Przyjmij' });
        if (uwagi === null) return;
        await hala.zapisz('zgloszenie.przyjete', id, uwagi ? { uwagi } : {});
        P.komunikat('Przyjęte', 'ok');
      }
      if (b.dataset.akcja === 'odrzuc') {
        const powod = await P.zapytajTekst({ tytul: 'Odrzucić zgłoszenie?', etykieta: 'Dlaczego? (zgłaszający to zobaczy)', wymagany: true, przycisk: 'Odrzuć' });
        if (!powod) return;
        await hala.zapisz('zgloszenie.odrzucone', id, { powod });
        P.komunikat('Odrzucone', 'ok');
      }
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });

  // ------------------------------------------------------------ narzędzia do odbioru

  function rysujNarzedzia(d) {
    const kier = jestKierownikiem();
    const lista = hala.obiekty('narzedzia').slice().sort((a, b) => ((b.status === 'do_odbioru') - (a.status === 'do_odbioru'))
      || String(((b.dane || {}).czas_odlozenia) || '').localeCompare(String(((a.dane || {}).czas_odlozenia) || '')));
    const el = $('lista-narzedzi');
    el.innerHTML = lista.map(n => {
      const x = n.dane || {};
      const czeka = n.status === 'do_odbioru';
      return `<article class="zlecenie ${czeka ? 'pilne' : ''}" data-id="${esc(n.id)}">
        <div class="opis">
          <div class="tytul"><button type="button" class="tytul-historii" data-akcja="historia">🧰 ${esc(x.co || '')}</button> <span class="slaby">${esc(n.numer || '')}</span></div>
          <div class="szczegoly"><span class="znacznik ${czeka ? 'alarm' : 'ok'}">${esc(n.etykieta || n.status)}</span>
            ${x.miejsce ? `<span>${esc(x.miejsce)}</span>` : ''}<span>· ${esc(W.nazwaPracownika(d.pracownicy, x.odlozyl) || '')}</span></div>
          ${x.uwagi ? `<div class="slaby tekst-opisu">${esc(x.uwagi)}</div>` : ''}
          ${miniatury([].concat(x.zdjecia || []), `Odłożone: ${x.co || ''}`)}
          ${miniatury([].concat(x.zdjecia_odbioru || []), `Odebrane: ${x.co || ''}`)}
        </div>
        <div class="numer slaby">${esc(W.dataKrotka(x.czas_odlozenia))} ${esc(W.godzina(x.czas_odlozenia))}${x.czas_odbioru ? `<br>odebrane ${esc(W.godzina(x.czas_odbioru))}` : ''}</div>
        <div class="akcje">${czeka && kier ? '<button type="button" class="maly glowny" data-akcja="odbierz">📷 Odebrałem</button>' : ''}</div>
      </article>`;
    }).join('') || '<p class="pusto">Nic nie czeka na odbiór. Mistrzowie odkładają zużyte narzędzia przyciskiem „🧰 Odłóż narzędzia” (ekran Zleceń w GK Lider).</p>';
    wczytajObrazki(el);
  }

  $('lista-narzedzi').addEventListener('click', ev => {
    const foto = ev.target.closest('[data-zdjecie]');
    if (foto) { P.pokazZdjecie(foto.dataset.zdjecie, foto.dataset.podpis); return; }
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    if (b.dataset.akcja === 'historia') DZ().historia(hala, 'narzedzia', id);
    if (b.dataset.akcja === 'odbierz') DZ().odbierzNarzedzia(hala, id, { gotowe: t => P.komunikat(t, 'ok') });
  });

  // ------------------------------------------------------------ BHP (D59)

  function rysujBhp(d) {
    const lista = W.bhpLista({ zgloszenia: hala.obiekty('bhp_zgloszenie'), slowniki: d.slowniki, pracownicy: d.pracownicy, stale: d.stale });
    const moze = P.mozeWyslac ? P.mozeWyslac('bhp.zamkniete') : jestKierownikiem();
    const el = $('lista-bhp');
    el.innerHTML = lista.map(b => `
      <article class="zlecenie ${b.otwarte && b.pilne ? 'pilne' : ''}" data-id="${esc(b.id)}">
        <div class="opis">
          <div class="tytul"><button type="button" class="tytul-historii" data-akcja="historia">⛑ ${esc(b.rodzajNazwa)}</button> <span class="slaby">${esc(b.numer)}</span></div>
          <div class="szczegoly">
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
      </article>`).join('') || '<p class="pusto">Brak zgłoszeń BHP. Liderzy zgłaszają je w GK Lider (Zmiana → Zgłoszenie BHP albo „Niezgodne” w audycie).</p>';
    wczytajObrazki(el);
  }

  $('lista-bhp').addEventListener('click', async ev => {
    const foto = ev.target.closest('[data-zdjecie]');
    if (foto) { P.pokazZdjecie(foto.dataset.zdjecie, foto.dataset.podpis); return; }
    const b = ev.target.closest('[data-akcja]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    try {
      if (b.dataset.akcja === 'historia') {
        const t = b.textContent.replace(/^⛑\s*/, '');
        return DZ().historia(hala, 'bhp_zgloszenie', id, { tytul: `BHP: ${t}` });
      }
      const d = P.dane ? P.dane() : {};
      const w = W.bhpLista({ zgloszenia: [hala.obiekt('bhp_zgloszenie', id)], slowniki: d.slowniki || hala.slowniki,
                              pracownicy: d.pracownicy, stale: d.stale || (hala.kontrakt || {}).stale })[0];
      if (!w) return;
      if (b.dataset.akcja === 'zlecenie') P.noweZlecenie(W.zlecenieZBhp(w), null, async () => {});
      if (b.dataset.akcja === 'zamknij') {
        const dzialania = await P.zapytajTekst({ tytul: `Zamknąć ${w.numer}?`, etykieta: 'Co zrobiono (działania)', wymagany: true, przycisk: 'Zamknij' });
        if (!dzialania) return;
        await hala.zapisz('bhp.zamkniete', id, { dzialania });
        P.komunikat('Zgłoszenie BHP zamknięte', 'ok');
      }
    } catch (e) { P.komunikat(P.komunikatBledu(e), 'blad'); }
  });

  // ------------------------------------------------------------ moje zadania (dział „kierownik”)

  function rysujMoje() {
    window.HalaZlecenia.rysuj($('moje-zadania'), hala, { dzial: 'kierownik', naglowek: 'Moje zadania', bezDzialan: true, komunikat: t => P.komunikat(t, 'ok') });
  }

  /* Liczby na chipach trybów (czeka na kierownika). */
  function liczby() {
    const zg = hala.obiekty('zgloszenie').filter(g => g.status === 'nowe').length;
    const nz = hala.obiekty('narzedzia').filter(n => n.status === 'do_odbioru').length;
    const mo = window.HalaZlecenia ? window.HalaZlecenia.doZrobienia(hala, { dzial: 'kierownik' }) : 0;
    const bhp = hala.obiekty('bhp_zgloszenie').filter(g => g.status === 'otwarte').length;
    return { zgloszenia: zg, narzedzia: nz, moje: mo, bhp };
  }

  P.widoki.zgloszenia = { rysujZgloszenia, rysujNarzedzia, rysujBhp, rysujMoje, liczby, jestKierownikiem };
})();
