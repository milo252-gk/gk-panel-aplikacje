/* Zmiana: checklista zmiany (D67: zlecenie z pozycjami, które hub robi na każdą zmianę z „Checklisty” w Panelu →
   Zlecenia → Zapisane), pasek postępu w kolorze Panelu, lista pozycji, obchody z QR, przekazanie od poprzedniej
   zmiany i przypomnienia.

   Klucz zmiany na linii to DOKŁADNIE <linia>/<zmiana.id> z hala.zmianaTeraz() —
   hub odrzuci inny, a zmiana III przez północ ma datę swojego początku (KONTRAKT §6.2). */

(function () {
  'use strict';

  const L = window.Lider, hala = L.hala, W = L.W, esc = L.esc;
  const prog = () => hala.ustawienie('prog_zolty_min', 30);

  // ▣ = skan QR, 🔬 = próba — te same znaki co w Zleceniach (STYL-GK §2 D64), żeby ta sama pozycja nie miała dwóch ikon.
  // Ikony typów pozycji: liniowe z gk-ikony.js (obchód to ▣ — znak skanu QR, zlecenie zwykłe ✓); bez pliku ikon — znaki zastępcze.
  const IKONY_NAZWY = { proba: 'proba', bhp: 'ratunek', obsada: 'konta', przekazanie: 'zlecenia' };
  const IKONY = { obchod: '▣', zadanie: '✓' };
  const ikonaTypu = typ => (IKONY_NAZWY[typ] && window.GKIkony ? window.GKIkony.html(IKONY_NAZWY[typ], 20) : IKONY[typ] || '✓');
  const OPIS_STANU = { wykonana: 'Zrobione', pominieta: 'Pominięte', opozniona: 'Po terminie', bliska: 'Wkrótce', czeka: '', przed: 'Później' };

  // ------------------------------------------------------------ zapisy checklisty

  /* Odhaczenie pozycji na zmianie z kontekstu (albo podanej — formularz zapamiętał swoją zmianę przy otwarciu).
     Tylko pozycja z migawki TEJ zmiany (etap 1): odhaczenie z formularza zaczętego na poprzedniej zmianie nie może
     wpaść do następnej — szablony mają te same id pozycji, więc samo id niczego nie gwarantuje bez kontekstu. */
  /* D67: pozycja = „<id zlecenia>|<id pozycji>” z Hala.checklistaZmiany. Skan (qr) idzie jako kod maszyny, próba —
     jako notatka z jej numerem. Zmiana na linii otwiera się przy pierwszym odhaczeniu (kto prowadził zmianę — Panel,
     raport), a ostatnia pozycja wysyła „Zrobione” checklisty (HalaZlecenia.zakonczJesliGotowe). */
  L.odhacz = async (pozycja, extra, ctx) => {
    const k = ctx || L.kontekst();
    const m = k.zmiana && k.lista && k.lista.mapa[pozycja];
    if (!m) return null;
    const e = extra || {};
    const dane = { pozycja: m.pozycja };
    if (e.qr) {
      const kod = Hala.odczytajKod(Hala.kodZeSkanu ? Hala.kodZeSkanu(e.qr, hala.slowniki) : e.qr, hala.slowniki);
      if (kod && kod.rodzaj === 'maszyny') dane.skan = kod.kod;
    }
    if (e.proba) {
      const p = hala.obiekt('proba', e.proba);
      dane.uwagi = `Próba ${(p && p.numer) || String(e.proba).slice(0, 8)}`;
    }
    if (e.uwagi) dane.uwagi = e.uwagi;
    if (!k.zl) await L.zapisz('zmiana.rozpoczeta', k.klucz, { linia: k.linia, zmiana: k.zmiana.id, pozycje: [] });
    const zd = await L.zapisz('zlecenie.pozycja_wykonana', m.zlecenie, dane);
    if (zd) await HalaZlecenia.zakonczJesliGotowe(hala, m.zlecenie);
    return zd;
  };

  /* Po formularzu obsady / audytu BHP / przekazania odhaczamy pozycję danego typu —
     tę wskazaną albo pierwszą niezrobioną tego typu (instrukcja §5: „odhacza się po wysłaniu”). */
  L.odhaczTyp = async (typ, pozycja, extra, ctx) => {
    const k = ctx || L.kontekst();
    const d = (k.lista && k.lista.dane) || {};
    const wolna = p => !(d.wykonane || {})[p.id] && !(p.od && Date.parse(p.od) > hala.teraz());     // pozycji „przed godziną od” serwer nie odhaczy
    const cel = pozycja ? (d.pozycje || []).find(p => p.id === pozycja)
      : (d.pozycje || []).filter(p => p.typ === typ && wolna(p))
        .sort((a, b) => Date.parse(a.termin) - Date.parse(b.termin))[0];
    if (!cel || !wolna(cel)) return null;
    return L.odhacz(cel.id, extra, k);
  };


  async function skanujObecnosc(p, kk) {
    const k = kk || L.kontekst();
    // Wpisany „WT-01” = skan HALA:M:WT-01; zły kod — skaner zostaje otwarty z błędem (L.skanujKod).
    const s = await L.skanujKod({ tytul: p.nazwa, podpowiedz: 'Albo wpisz kod z naklejki' },
      t => W.kodDlaLinii(Hala.odczytajKod(t, hala.slowniki), k.linia, p.cel));
    return s ? s.tekst : null;
  }

  // ------------------------------------------------------------ pozycja

  function otworzPozycje(id) {
    const k = L.kontekst();
    const c = W.checklista(k.lista, hala.teraz(), prog());
    const p = c.wiersze.find(w => w.id === id);
    if (!p) return;
    if (p.stan === 'przed') { L.komunikat(`„${p.nazwa}” zrobisz od ${p.odGodz}${p.godz ? ` (do ${p.godz})` : ''}`, 'info', 'pozycja-przed'); return; }
    const zrobiona = p.stan === 'wykonana';
    // „Przyjmuję zadania” najpierw (tylko UI; hub nadal przyjmie odhaczenie bez przyjęcia). Zrobionej pozycji nie blokujemy — „Cofnij”.
    if (!zrobiona) { const t = L.blokadaPrzyjecia(); if (t) { L.komunikat(t, 'info', 'najpierw-przyjmij'); return; } }
    const wpis = p.wpis || {};
    const kto = W.nazwaPracownika(hala.pracownicy, wpis.autor);
    const glowna = {
      obchod: 'Skanuj QR — jestem na miejscu', proba: 'Wypełnij próbę', bhp: 'Zrób audyt BHP', obsada: 'Wpisz obsadę',
      przekazanie: 'Przekaż zmianę', zadanie: 'Zrobione',
    }[p.typ] || 'Zrobione';
    const m = k.lista.mapa[p.id] || {};
    if (!m.zlecenie) { L.komunikat('Kierownik zmienił tę listę — pozycji już nie ma. Odśwież ekran.', 'blad', 'pozycja-zniknela'); return; }
    L.okno({
      tytul: p.nazwa,
      html: `<p><span class="znacznik ${esc({ wykonana: 'ok', pominieta: 'neutral', opozniona: 'alarm', bliska: 'uwaga' }[p.stan] || 'info')}">${esc(OPIS_STANU[p.stan] || 'Do zrobienia')}</span>
          Termin <b>${esc(p.godz)}</b>${p.wymaga_qr ? ' · wymaga skanu QR' : ''}${p.cel ? ` · punkt ${esc(p.cel)}` : ''}${p.wymagaj_zdjecia ? ' · zdjęcie' : ''}${p.wymagaj_notatki ? ' · notatka' : ''}</p>
        ${p.opis ? `<p class="opis-pozycji">${esc(p.opis)}</p>` : ''}
        ${p.zwrot !== null && p.zwrot !== undefined ? `<p class="tekst-alarm">Kierownik zwrócił tę pozycję do poprawy${p.zwrot ? `: ${esc(p.zwrot)}` : ''}</p>` : ''}
        ${zrobiona ? `<p class="ok-tekst">Zrobione ${esc(W.godzina(wpis.czas))}${kto ? ' · ' + esc(kto) : ''}${p.poTerminie ? ' (po terminie)' : ''}</p>
          ${wpis.qr ? `<p class="slaby">Kod: ${esc(wpis.qr)}</p>` : ''}${wpis.uwagi ? `<p>${esc(wpis.uwagi)}</p>` : ''}` : ''}
        ${p.stan === 'pominieta' ? `<p>Pominięte: ${esc(wpis.powod || '')}</p>` : ''}
        <div class="przyciski-kolumna">
          ${zrobiona ? '<button type="button" data-a="cofnij">Cofnij odhaczenie</button>'
                     : `<button type="button" class="glowny duzy" data-a="wykonaj">${esc(glowna)}</button>
                        ${p.stan !== 'pominieta' ? '<button type="button" data-a="pomin">Pomiń (z powodem)</button>' : ''}`}
        </div>`,
      poOtwarciu: el => {
        const b = a => el.querySelector(`[data-a=${a}]`);
        // Wszystko z tego okna idzie do zmiany, z której je otwarto (k) — także gdy skan QR trwał przez 14:00.
        if (b('cofnij')) b('cofnij').addEventListener('click', async () => {
          if (await L.zapisz('zlecenie.pozycja_cofnieta', m.zlecenie, { pozycja: m.pozycja })) { L.zamknijOkno(); L.poZapisie('Odhaczenie cofnięte'); }
        });
        if (b('pomin')) b('pomin').addEventListener('click', async () => {
          const powod = await L.zapytaj({ tytul: 'Pomiń: ' + p.nazwa, pytanie: 'Dlaczego pomijasz? Pominięta pozycja nie liczy się jako opóźnienie.',
                                          przycisk: 'Pomiń', wymagane: true, pole: ['zlecenie.pozycja_pominieta', 'powod'] });
          if (!powod) return;
          if (await L.zapisz('zlecenie.pozycja_pominieta', m.zlecenie, { pozycja: m.pozycja, powod })) {
            await HalaZlecenia.zakonczJesliGotowe(hala, m.zlecenie);
            L.poZapisie('Pozycja pominięta');
          }
        });
        if (b('wykonaj')) b('wykonaj').addEventListener('click', () => wykonaj(p, k));
      },
    });
  }

  async function wykonaj(p, k) {
    // D67: pozycja z wymaganym zdjęciem albo notatką (bez formularza czynności) — karta checklisty w Zleceniach, gdzie
    // jest aparat i pole notatki; ta sama pozycja otwarta od razu.
    // 2026-10-26: pozycja z kilkoma maszynami do zeskanowania — postęp skanów (✓ ○ przy maszynach) jest w karcie zlecenia.
    const wielomaszynowa = (p.maszyny || []).length > 1 && p.typ !== 'obchod';
    if ((p.wymagaj_zdjecia || p.wymagaj_notatki || wielomaszynowa) && !['proba', 'bhp', 'obsada', 'przekazanie'].includes(p.typ)) {
      const m = k.lista.mapa[p.id];
      L.zamknijOkno();
      L.pokazEkran('zlecenia');
      if (m) HalaZlecenia.otworzPozycje(L.$('ekran-zlecenia'), hala, L.opcjeZlecen(), m.zlecenie, m.pozycja);
      return;
    }
    // Dowód obecności (KONTRAKT §10): najpierw skan, dopiero potem reszta pozycji.
    let qr = null;
    if (p.wymaga_qr || p.typ === 'obchod') {
      qr = await skanujObecnosc(p, k);
      if (!qr) return;
    }
    // Formularz pozycji dostaje zmianę i linię pozycji — nie tę, która będzie „teraz” w chwili wysyłki.
    const opcje = { pozycja: p.id, qr, zmianaId: k.zmiana.id, linia: k.linia };
    if (p.typ === 'proba') return L.formularzProby(opcje);
    if (p.typ === 'bhp') return L.formularzAudytuBhp(opcje);
    if (p.typ === 'obsada') return L.formularzObsady(opcje);
    if (p.typ === 'przekazanie') return L.formularzPrzekazania(opcje);
    if (await L.odhacz(p.id, { qr }, L.kontekst(k.zmiana, k.linia))) { L.zamknijOkno(); L.poZapisie(qr ? 'Obecność potwierdzona' : 'Odhaczone'); }
  }

  /* Pozycja z karty zlecenia (Zlecenia → checklista → „▶ Raport obsady” itp.) — ten sam przebieg co na ekranie Zmiana. */
  L.wykonajPozycje = id => {
    const k = L.kontekst();
    const c = W.checklista(k.lista, hala.teraz(), prog());
    const p = c.wiersze.find(w => w.id === id);
    if (!p) { L.komunikat('Ta pozycja nie jest z bieżącej zmiany na Twojej linii.', 'uwaga'); return; }
    return wykonaj(p, k);
  };

  // ------------------------------------------------------------ przekazanie od poprzedniej zmiany

  function kartaPrzekazania(k) {
    const prev = W.poprzedniaZmiana(k.zmiana, hala.slowniki.zmiany);
    if (!prev) return '';
    const zlp = hala.obiekt('zmiana_linii', W.kluczZmiany(k.linia, prev));
    const p = zlp && zlp.dane && zlp.dane.przekazanie;
    if (!p) return '';
    const d = zlp.dane;
    const od = W.nazwaPracownika(hala.pracownicy, d.lider);
    const pola = [['Stan maszyn', p.maszyny], ['Braki materiałowe', p.braki_materialowe], ['Do dokończenia', p.do_dokonczenia], ['Inne', p.inne]]
      .filter(([, v]) => v);
    const odczytal = d.przekazanie_odczytal;
    return `<article class="karta przekazanie ${odczytal ? '' : 'pilne'}">
      <header><b>Przekazanie od ${esc(W.opisZmiany(prev.id, hala.slowniki))}</b><span class="slaby">${esc(od || '')} ${esc(W.godzina(d.czas_przekazania))}</span></header>
      <dl class="dane">${pola.map(([n, v]) => `<dt>${esc(n)}</dt><dd>${esc(v)}</dd>`).join('') || '<dd>Bez uwag</dd>'}</dl>
      ${odczytal ? `<p class="slaby">Przeczytane: ${esc(W.nazwaPracownika(hala.pracownicy, odczytal))} ${esc(W.godzina(d.czas_odczytu_przekazania))}</p>`
                 : `<button type="button" class="glowny szeroki" data-odczytane="${esc(zlp.id)}">Przeczytałem</button>`}
    </article>`;
  }

  // ------------------------------------------------------------ ekran

  L.ekrany.zmiana = {
    rysuj(el) {
      rysujZmiane(el);
      // Zaległe zlecenia od kierownika na samej górze (wspólna karta z ../wspolne/zlecenia.js) — przed checklistą,
      // bo to, co miało być zrobione wcześniej, ma pierwszeństwo (jak „Zaległe dostawy” w GK Trasy).
      const miejsce = document.createElement('div');
      el.prepend(miejsce);
      HalaZlecenia.rysujZalegle(miejsce, hala, L.dzialZlecen(), () => L.pokazEkran('zlecenia'));
    },
  };

  /* Przyciski pod checklistą (UI etap 2 — każda czynność w jednym miejscu): „Zdarzenie obsady” zawsze, a Obsada i Audyt BHP
     tylko, gdy checklista (otwarta albo szablon do otwarcia) nie ma pozycji tego typu — W.przyciskiZmiany. Prawdziwy hub
     startuje bez szablonu „standard” i bez tego wejścia nie dałoby się ich wysłać (audyt 2026-10-12). Próba i zgłoszenie
     BHP są na ekranie Jakość. Wysłany formularz odhacza pierwszą wolną pozycję swojego typu, gdy szablon ją ma (L.odhaczTyp). */
  const przyciskiZmiany = pozycje => `<div class="przyciski-rzad">
        ${W.przyciskiZmiany(pozycje).map(p => `<button type="button" data-a="${esc(p.a)}">${esc(p.nazwa)}</button>`).join('')}
      </div>`;

  /* Raport zmiany: jedna nazwa w całej aplikacji (właściciel 2026-11-17). Dwa kształty tego samego kroku, nigdy oba naraz:
     — lista niekompletna: wiersz-przypomnienie na końcu listy („Na końcu”; dotknięty za wcześnie pyta „Zakończyć zmianę bez
       wykonania wszystkich zadań?” — oknoRaportu); po wysłaniu „✔ godz.”;
     — lista kompletna, raport niewysłany: jeden główny przycisk pod listą (zamiast wiersza).
     To nie pozycja zlecenia (raport to osobne zdarzenie zmiana.raport, KONTRAKT §6.4). */
  const koniecZmiany = glowny => `<div class="przyciski-rzad"><button type="button" class="${glowny ? 'glowny ' : ''}szeroki" data-a="koniec">Raport zmiany</button></div>`;

  function ostatniKrok(k, wyslany) {
    const d = (k.zl && k.zl.dane) || {};
    const opis = wyslany ? `✔ ${esc(W.godzina(d.czas_zamkniecia))}` : 'Na końcu';
    return `<li class="pozycja ostatni-krok stan-${wyslany ? 'wykonana' : 'czeka'}" data-a="raport" role="button" tabindex="0"
          aria-label="Raport zmiany — ${wyslany ? 'wysłany ' + esc(W.godzina(d.czas_zamkniecia)) : 'na końcu listy, po wykonaniu zadań'}">
          <span class="czas">—</span>
          <span class="ikona-typu" aria-hidden="true">${ikonaTypu('przekazanie')}</span>
          <span class="tresc">Raport zmiany</span>
          <span class="stan">${opis}</span>
        </li>`;
  }

  /* Dział do wpisania w Panelu → Zlecenia → Zapisane → „+ Checklista” zależnie od roli (pusty ekran). */
  function opisDzialuListy(pracownik) {
    const kat = W.kategorieOsoby(pracownik);
    return kat.length > 1 ? 'dział Lider albo Mistrzowie' : kat[0] === 'mistrz' ? 'dział Mistrzowie' : 'dział Lider';
  }

  const wierszHtml = w => `<li class="pozycja stan-${esc(w.stan)}" data-pozycja="${esc(w.id)}" role="button" tabindex="0">
          <span class="czas">${esc(w.godz)}</span>
          <span class="ikona-typu" aria-hidden="true">${ikonaTypu(w.typ)}</span>
          <span class="tresc">${esc(w.nazwa)}${w.zwrot !== null && w.zwrot !== undefined ? `<span class="pozycja-zwrot">${window.GKIkony ? window.GKIkony.html('powtarzaj', 14) + ' ' : ''}Wróciła od kierownika${w.zwrot ? `: ${esc(w.zwrot)}` : ''}</span>` : ''}${w.wymaga_qr ? ' <span class="slaby">QR</span>' : ''}${
            w.maszyny && w.maszyny.length > 1 && w.wymaga_qr ? ` <span class="slaby">▣ ${w.maszyny.filter(m => (w.skany || []).includes(m)).length}/${w.maszyny.length}</span>` : ''}</span>
          <span class="stan">${w.stan === 'wykonana' ? '✔' : w.stan === 'przed' ? `⏳ od ${esc(w.odGodz)}` : esc(OPIS_STANU[w.stan])}${w.poTerminie ? ' <span class="slaby">późno</span>' : ''}</span>
        </li>`;

  function rysujZmiane(el) {
    const k = L.kontekst();
    if (!k.zmiana) { el.innerHTML = '<p class="pusto">Poza godzinami zmian. Sprawdź słownik zmian.</p>'; return; }
    const przekazanie = kartaPrzekazania(k);
    const pozycje = (k.lista && k.lista.dane.pozycje) || [];
    const wyslany = W.mojRaportWyslany(k.zl, hala.pracownik, hala.pracownicy);      // mój raport (lider/mistrz osobno), nie „ktokolwiek”
    if (!pozycje.length && wyslany) {
      // Raport wysłany bez otwierania zmiany: „Rozpocznij” byłoby konfliktem (kontrakt 1.7.0 — zamkniętej się nie otwiera).
      el.innerHTML = `${przekazanie}
        <article class="karta otwarcie">
          <h2>${esc(W.nazwaLinii(hala.slowniki, k.linia))}</h2>
          <p>${esc(k.zmiana.nazwa)} ${esc(W.godzina(k.zmiana.od))}–${esc(W.godzina(k.zmiana.do))} · <span class="znacznik neutral">Raport wysłany</span></p>
          <p class="slaby">Zmiana zamknięta raportem. Poprawiony raport wyślesz na ekranie „Koniec”.</p>
        </article>
        ${koniecZmiany(false)}`;
      return;
    }
    if (!pozycje.length) {
      el.innerHTML = `${przekazanie}
        <article class="karta otwarcie">
          <h2>${esc(W.nazwaLinii(hala.slowniki, k.linia))}</h2>
          <p>${esc(k.zmiana.nazwa)} ${esc(W.godzina(k.zmiana.od))}–${esc(W.godzina(k.zmiana.do))}</p>
          <p class="slaby">Na tę zmianę nie ma checklisty. Kierownik układa ją w Panelu → Zlecenia → ${window.GKIkony ? window.GKIkony.html('zapisane', 16) + ' ' : ''}Zapisane → „+ Checklista”
            (${esc(opisDzialuListy(hala.pracownik))}) — pojawi się tu sama na początku zmiany.</p>
        </article>
        ${przyciskiZmiany([])}
        ${koniecZmiany(false)}`;
      return;
    }
    const c = W.checklista(k.lista, hala.teraz(), prog());
    const zamknieta = wyslany;
    const pr = W.przyjecieChecklisty(k.lista, hala.pracownik, hala.pracownicy, L.opcjePrzyjecia(k.klucz));
    // Jedna czynność przejęcia całej checklisty działu na tę zmianę; potem — kto i o której (kierownik i admin widzą to samo).
    const przyjecie = !pr.stan ? '' : pr.moze && pr.doPrzyjecia.length
      ? `<article class="karta przyjecie"><p><b>${esc(pr.tekst)}</b></p>
          ${pr.odrzucone ? `<p class="tekst-alarm" role="alert">Serwer nie przyjął zadań: ${esc(pr.odrzucone)}</p>` : ''}
          <button type="button" class="glowny duzy szeroki" data-a="przyjmuje">Przyjmuję zadania</button>
          ${pr.awaryjne ? '<button type="button" class="maly szeroki" data-a="bez-przyjecia">Pracuję bez przyjęcia</button>' : ''}</article>`
      : `<p class="slaby przyjecie" role="status">${esc(pr.tekst)}${pr.bezPrzyjecia ? ' · pracujesz bez przyjęcia' : ''}</p>`;
    const komplet = W.stanKonca(k.lista).komplet;
    const zWierszy = ids => c.wiersze.filter(x => ids.has(x.id));
    // Osoba z rolami lider+mistrz: dwie sekcje („Mistrz”, „Lider”) na jednej zmianie; przyjęcie i raport obejmują obie.
    const lista = k.lista.sekcje && k.lista.sekcje.length
      ? k.lista.sekcje.map(sk => `<h3 class="sekcja-listy">${esc(sk.nazwa)}</h3>
          <ul class="lista checklista${pr.zablokowane ? ' zablokowana' : ''}">${zWierszy(new Set(sk.ids)).map(wierszHtml).join('')}</ul>`).join('')
        + (komplet && !zamknieta ? '' : `<ul class="lista checklista">${ostatniKrok(k, zamknieta)}</ul>`)
      : `<ul class="lista checklista${pr.zablokowane ? ' zablokowana' : ''}">${c.wiersze.map(wierszHtml).join('')}${komplet && !zamknieta ? '' : ostatniKrok(k, zamknieta)}</ul>`;
    el.innerHTML = `${przekazanie}${przyjecie}
      <article class="karta postep-zmiany kolor-${esc(c.kolor)}">
        <div class="postep-gora"><b class="liczba">${c.zrobione}/${c.wszystkie}</b> <span>${c.proc} %</span>
          ${zamknieta ? '<span class="znacznik neutral">Raport wysłany</span>' : c.opoznione ? `<span class="znacznik alarm">Po terminie: ${c.opoznione}</span>` : ''}</div>
        <div class="postep" role="progressbar" aria-valuemin="0" aria-valuemax="${c.wszystkie}" aria-valuenow="${c.zrobione}"><span style="width:${c.proc}%"></span></div>
        <div class="slaby">${c.najblizsza ? `Następne ${esc(c.najblizsza.godz)} · ${esc(c.najblizsza.nazwa)}${c.najblizsza.zaMin >= 0 ? ` <span class="za-ile">(za ${esc(Hala.formatCzasu(c.najblizsza.zaMin * 60000))})</span>` : ''}`
                                         : c.opoznione ? 'Nadrób zaległe pozycje' : 'Wszystko zrobione'}</div>
      </article>
      ${pr.podpis ? `<p class="slaby podpis-blokady" role="status">${esc(pr.podpis)}</p>` : ''}
      ${lista}
      ${!zamknieta && komplet ? koniecZmiany(true) : ''}
      ${przyciskiZmiany(pozycje)}`;
  }

  L.$('ekran-zmiana').addEventListener('click', async ev => {
    const t = ev.target.closest('[data-a],[data-pozycja],[data-odczytane]');
    if (!t) return;
    if (t.dataset.pozycja) return otworzPozycje(t.dataset.pozycja);
    if (t.dataset.odczytane) {
      if (await L.zapisz('zmiana.przekazanie_odczytane', t.dataset.odczytane, {})) L.poZapisie('Przekazanie przeczytane');
      return;
    }
    const a = t.dataset.a;
    if (a === 'obsada') L.formularzObsady({});
    else if (a === 'audyt-bhp') L.formularzAudytuBhp({});
    else if (a === 'zdarzenie-obsady') L.formularzZdarzeniaObsady();
    else if (a === 'koniec') L.pokazEkran('koniec');
    else if (a === 'raport') L.oknoRaportu({});
    else if (a === 'przyjmuje') await przyjmijZadania(t);
    else if (a === 'bez-przyjecia') L.pracujBezPrzyjecia();
  });

  /* „Przyjmuję zadania”: zlecenie.przyjete dla każdego zlecenia checklisty tej zmiany w statusie „nowe”, po kolei.
     Pierwszy błąd zatrzymuje (ponowne dotknięcie dokończy resztę). */
  async function przyjmijZadania(przycisk) {
    const pr = L.przyjecieTeraz();
    if (!pr.doPrzyjecia.length) return;
    przycisk.disabled = true;
    for (const id of pr.doPrzyjecia) {
      const zd = await L.zapisz('zlecenie.przyjete', id, {});
      if (!zd) {
        przycisk.disabled = false;
        L.komunikat('Nie udało się przyjąć zadań. Dotknij jeszcze raz.', 'blad');
        return;
      }
    }
    L.poZapisie('Zadania przyjęte');
  }
  L.$('ekran-zmiana').addEventListener('keydown', ev => {
    const t = ev.target.closest('[data-pozycja],[data-a=raport]');
    if (t && t.dataset.a === 'raport' && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); L.oknoRaportu({}); return; }
    if (t && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); otworzPozycje(t.dataset.pozycja); }
  });

  // ------------------------------------------------------------ przypomnienia

  /* Pozycja wchodzi w próg „żółty” → jedno przypomnienie (wibracja + powiadomienie, gdy
     aplikacja jest w tle). Zapamiętane w telefonie, żeby przeładowanie nie dzwoniło drugi raz. */
  function przypomnij() {
    if (!hala.zalogowany()) return;
    const k = L.kontekst();
    if (!k.lista.dane.pozycje.length || W.mojRaportWyslany(k.zl, hala.pracownik, hala.pracownicy)) return;
    // Jeden wpis na telefon ({zmiana, id pozycji}) — nowa zmiana nadpisuje starą, nic się nie zbiera.
    let juz = new Set();
    try {
      const z = JSON.parse(L.pamiec.czytaj('przypomniane') || 'null');
      if (z && z.klucz === k.klucz) juz = new Set(z.ids);
    } catch (e) { /* uszkodzony wpis — zaczynamy od zera */ }
    const c = W.checklista(k.lista, hala.teraz(), prog());
    const nowe = W.doPrzypomnienia(c, juz);
    if (!nowe.length) return;
    for (const p of nowe) {
      juz.add(p.id);
      L.powiadom(`${p.godz} · ${p.nazwa}`, `Za ${Math.max(0, p.zaMin)} min${W.wieleLinii(hala.slowniki) ? ' — linia ' + k.linia : ''}`, { tag: 'poz-' + p.id, adres: '#zmiana' });
      L.komunikat(`Za ${Math.max(0, p.zaMin)} min: ${p.nazwa}`, 'info');
    }
    L.pamiec.zapisz('przypomniane', JSON.stringify({ klucz: k.klucz, ids: Array.from(juz) }));
  }
  setInterval(przypomnij, 20000);
  L.poRysowaniu.push(przypomnij);
})();
