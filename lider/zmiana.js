/* Zmiana: otwarcie zmiany (migawka checklisty z terminami), pasek postępu w kolorze
   Panelu, lista pozycji, obchody z QR, przekazanie od poprzedniej zmiany i przypomnienia.

   Klucz zmiany na linii to DOKŁADNIE <linia>/<zmiana.id> z hala.zmianaTeraz() —
   hub odrzuci inny, a zmiana III przez północ ma datę swojego początku (KONTRAKT §6.2). */

(function () {
  'use strict';

  const L = window.Lider, hala = L.hala, W = L.W, esc = L.esc;
  const prog = () => hala.ustawienie('prog_zolty_min', 30);

  const IKONY = { obchod: '⌖', proba: '◎', bhp: '⛑', obsada: '👥', zadanie: '✓' };
  const OPIS_STANU = { wykonana: 'Zrobione', pominieta: 'Pominięte', opozniona: 'Po terminie', bliska: 'Wkrótce', czeka: '' };

  // ------------------------------------------------------------ zapisy checklisty

  /* Odhaczenie pozycji na zmianie z kontekstu (albo podanej — formularz zapamiętał swoją zmianę przy otwarciu).
     Tylko pozycja z migawki TEJ zmiany (etap 1): odhaczenie z formularza zaczętego na poprzedniej zmianie nie może
     wpaść do następnej — szablony mają te same id pozycji, więc samo id niczego nie gwarantuje bez kontekstu. */
  L.odhacz = async (pozycja, extra, ctx) => {
    const k = ctx || L.kontekst();
    if (!k.zmiana || !W.pozycjaZmiany(k.zl, pozycja)) return null;
    return L.zapisz('checklista.pozycja_wykonana', k.klucz,
                    L.bezPustych(Object.assign({ linia: k.linia, zmiana: k.zmiana.id, pozycja }, extra || {})));
  };

  /* Po formularzu obsady / audytu BHP / przekazania odhaczamy pozycję danego typu —
     tę wskazaną albo pierwszą niezrobioną tego typu (instrukcja §5: „odhacza się po wysłaniu”). */
  L.odhaczTyp = async (typ, pozycja, extra, ctx) => {
    const k = ctx || L.kontekst();
    const d = (k.zl && k.zl.dane) || {};
    const wolna = p => !(d.wykonane || {})[p.id];
    const cel = pozycja ? (d.pozycje || []).find(p => p.id === pozycja)
      : (d.pozycje || []).filter(p => (typ === 'przekazanie' ? p.id === 'przekazanie' : p.typ === typ) && wolna(p))
        .sort((a, b) => Date.parse(a.termin) - Date.parse(b.termin))[0];
    if (!cel || !wolna(cel)) return null;
    return L.odhacz(cel.id, extra, k);
  };

  async function rozpocznij() {
    const k = L.kontekst();
    // Ekran rysowany przed raportem z innego telefonu: zamkniętej zmiany nie otwieramy (hub i tak dałby konflikt).
    if (k.zl && k.zl.status === 'zamknieta') { L.komunikat('Raport tej zmiany już wysłano — zmiana jest zamknięta.', 'uwaga'); L.narysuj(); return; }
    const szablon = Hala.szablonDla(hala.slowniki, k.linia, k.zmiana.nr);
    const pozycje = Hala.pozycjeZSzablonu(szablon, k.zmiana);
    if (!pozycje.length) {
      L.komunikat('Brak szablonu checklisty dla tej linii i zmiany. Poproś kierownika o dodanie szablonu.', 'blad');
      return;
    }
    const zd = await L.zapisz('zmiana.rozpoczeta', k.klucz, { linia: k.linia, zmiana: k.zmiana.id, szablon: szablon.kod, pozycje });
    if (zd) L.poZapisie('Zmiana otwarta');
  }

  async function skanujObecnosc(p, kk) {
    const k = kk || L.kontekst();
    const t = await HalaSkaner.skanuj({ tytul: p.nazwa, podpowiedz: 'Albo wpisz kod z naklejki' });
    if (!t) return null;
    const wynik = W.kodDlaLinii(Hala.odczytajKod(t, hala.slowniki), k.linia, p.cel);
    if (!wynik.ok) {
      L.komunikat(wynik.powod, 'blad');
      try { if (navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 100]); } catch (e) { /* bez wibracji */ }
      return null;
    }
    return t;
  }

  // ------------------------------------------------------------ pozycja

  function otworzPozycje(id) {
    const k = L.kontekst();
    const c = W.checklista(k.zl, hala.teraz(), prog());
    const p = c.wiersze.find(w => w.id === id);
    if (!p) return;
    const zrobiona = p.stan === 'wykonana';
    const wpis = p.wpis || {};
    const kto = W.nazwaPracownika(hala.pracownicy, wpis.autor);
    const glowna = {
      obchod: 'Skanuj QR — jestem na miejscu', proba: 'Wypełnij próbę', bhp: 'Audyt BHP', obsada: 'Raport obsady',
      zadanie: p.id === 'przekazanie' ? 'Przekazanie zmiany' : 'Zrobione',
    }[p.typ] || 'Zrobione';
    L.okno({
      tytul: p.nazwa,
      html: `<p><span class="znacznik ${esc({ wykonana: 'ok', pominieta: 'neutral', opozniona: 'alarm', bliska: 'uwaga' }[p.stan] || 'info')}">${esc(OPIS_STANU[p.stan] || 'Do zrobienia')}</span>
          Termin <b>${esc(p.godz)}</b>${p.wymaga_qr ? ' · wymaga skanu QR' : ''}${p.cel ? ` · punkt ${esc(p.cel)}` : ''}</p>
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
          if (await L.zapisz('checklista.pozycja_cofnieta', k.klucz, { pozycja: p.id })) { L.zamknijOkno(); L.poZapisie('Odhaczenie cofnięte'); }
        });
        if (b('pomin')) b('pomin').addEventListener('click', async () => {
          const powod = await L.zapytaj({ tytul: 'Pomiń: ' + p.nazwa, pytanie: 'Dlaczego pomijasz? Pominięta pozycja nie liczy się jako opóźnienie.',
                                          przycisk: 'Pomiń', wymagane: true });
          if (!powod) return;
          if (await L.zapisz('checklista.pozycja_pominieta', k.klucz, { linia: k.linia, zmiana: k.zmiana.id, pozycja: p.id, powod })) L.poZapisie('Pozycja pominięta');
        });
        if (b('wykonaj')) b('wykonaj').addEventListener('click', () => wykonaj(p, k));
      },
    });
  }

  async function wykonaj(p, k) {
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
    if (p.id === 'przekazanie') return L.formularzPrzekazania(opcje);
    if (await L.odhacz(p.id, { qr }, L.kontekst(k.zmiana, k.linia))) { L.zamknijOkno(); L.poZapisie(qr ? 'Obecność potwierdzona' : 'Odhaczone'); }
  }

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

  function rysujZmiane(el) {
    const k = L.kontekst();
    if (!k.zmiana) { el.innerHTML = '<p class="pusto">Poza godzinami zmian. Sprawdź słownik zmian.</p>'; return; }
    const przekazanie = kartaPrzekazania(k);
    const pozycje = (k.zl && k.zl.dane && k.zl.dane.pozycje) || [];
    if (!pozycje.length && k.zl && k.zl.status === 'zamknieta') {
      // Raport wysłany bez otwierania zmiany: „Rozpocznij” byłoby konfliktem (kontrakt 1.7.0 — zamkniętej się nie otwiera).
      el.innerHTML = `${przekazanie}
        <article class="karta otwarcie">
          <h2>${esc(W.nazwaLinii(hala.slowniki, k.linia))}</h2>
          <p>${esc(k.zmiana.nazwa)} ${esc(W.godzina(k.zmiana.od))}–${esc(W.godzina(k.zmiana.do))} · <span class="znacznik neutral">Raport wysłany</span></p>
          <p class="slaby">Zmiana zamknięta raportem. Poprawiony raport wyślesz w „Koniec”.</p>
        </article>`;
      return;
    }
    if (!pozycje.length) {
      const szablon = Hala.szablonDla(hala.slowniki, k.linia, k.zmiana.nr);
      const podglad = Hala.pozycjeZSzablonu(szablon, k.zmiana);
      el.innerHTML = `${przekazanie}
        <article class="karta otwarcie">
          <h2>${esc(W.nazwaLinii(hala.slowniki, k.linia))}</h2>
          <p>${esc(k.zmiana.nazwa)} ${esc(W.godzina(k.zmiana.od))}–${esc(W.godzina(k.zmiana.do))} · zmiana jeszcze nie otwarta</p>
          ${podglad.length ? `<p class="slaby">Plan: ${esc(szablon.nazwa || szablon.kod)} — ${esc(W.liczebnik(podglad.length, 'pozycja', 'pozycje', 'pozycji'))}</p>
            <ul class="lista podglad">${podglad.map(p => `<li class="wiersz"><span class="czas">${esc(W.godzina(p.termin))}</span><span class="tresc">${esc(p.nazwa)}</span></li>`).join('')}</ul>
            <button type="button" class="glowny szeroki duzy" data-a="rozpocznij">Rozpocznij zmianę</button>`
            : '<p class="blad">Brak szablonu checklisty dla tej linii. Poproś kierownika o dodanie szablonu.</p>'}
        </article>`;
      return;
    }
    const c = W.checklista(k.zl, hala.teraz(), prog());
    const zamknieta = k.zl.status === 'zamknieta';
    el.innerHTML = `${przekazanie}
      <article class="karta postep-zmiany kolor-${esc(c.kolor)}">
        <div class="postep-gora"><b class="liczba">${c.zrobione}/${c.wszystkie}</b> <span>${c.proc} %</span>
          ${zamknieta ? '<span class="znacznik neutral">Raport wysłany</span>' : c.opoznione ? `<span class="znacznik alarm">Po terminie: ${c.opoznione}</span>` : ''}</div>
        <div class="postep" role="progressbar" aria-valuemin="0" aria-valuemax="${c.wszystkie}" aria-valuenow="${c.zrobione}"><span style="width:${c.proc}%"></span></div>
        <div class="slaby">${c.najblizsza ? `Następne ${esc(c.najblizsza.godz)} · ${esc(c.najblizsza.nazwa)}${c.najblizsza.zaMin >= 0 ? ` (za ${esc(Hala.formatCzasu(c.najblizsza.zaMin * 60000))})` : ''}`
                                         : c.opoznione ? 'Nadrób zaległe pozycje' : 'Wszystko zrobione'}</div>
      </article>
      <ul class="lista checklista">${c.wiersze.map(w => `<li class="pozycja stan-${esc(w.stan)}" data-pozycja="${esc(w.id)}" role="button" tabindex="0">
          <span class="czas">${esc(w.godz)}</span>
          <span class="ikona-typu" aria-hidden="true">${IKONY[w.typ] || '✓'}</span>
          <span class="tresc">${esc(w.nazwa)}${w.wymaga_qr ? ' <span class="slaby">QR</span>' : ''}</span>
          <span class="stan">${w.stan === 'wykonana' ? '✔' : esc(OPIS_STANU[w.stan])}${w.poTerminie ? ' <span class="slaby">późno</span>' : ''}</span>
        </li>`).join('')}</ul>
      <div class="przyciski-rzad">
        <button type="button" data-a="zdarzenie-obsady">Zdarzenie obsady</button>
        <button type="button" data-a="bhp">Zgłoszenie BHP</button>
        <button type="button" data-a="proba">Dodatkowa próba</button>
      </div>`;
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
    if (a === 'rozpocznij') rozpocznij();
    else if (a === 'zdarzenie-obsady') L.formularzZdarzeniaObsady();
    else if (a === 'bhp') L.formularzBhp({});
    else if (a === 'proba') L.formularzProby({});
  });
  L.$('ekran-zmiana').addEventListener('keydown', ev => {
    const t = ev.target.closest('[data-pozycja]');
    if (t && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); otworzPozycje(t.dataset.pozycja); }
  });

  // ------------------------------------------------------------ przypomnienia

  /* Pozycja wchodzi w próg „żółty” → jedno przypomnienie (wibracja + powiadomienie, gdy
     aplikacja jest w tle). Zapamiętane w telefonie, żeby przeładowanie nie dzwoniło drugi raz. */
  function przypomnij() {
    if (!hala.zalogowany()) return;
    const k = L.kontekst();
    if (!k.zl || k.zl.status === 'zamknieta') return;
    // Jeden wpis na telefon ({zmiana, id pozycji}) — nowa zmiana nadpisuje starą, nic się nie zbiera.
    let juz = new Set();
    try {
      const z = JSON.parse(L.pamiec.czytaj('przypomniane') || 'null');
      if (z && z.klucz === k.klucz) juz = new Set(z.ids);
    } catch (e) { /* uszkodzony wpis — zaczynamy od zera */ }
    const c = W.checklista(k.zl, hala.teraz(), prog());
    const nowe = W.doPrzypomnienia(c, juz);
    if (!nowe.length) return;
    for (const p of nowe) {
      juz.add(p.id);
      L.powiadom(`${p.godz} · ${p.nazwa}`, `Za ${Math.max(0, p.zaMin)} min — linia ${k.linia}`, { tag: 'poz-' + p.id });
      L.komunikat(`Za ${Math.max(0, p.zaMin)} min: ${p.nazwa}`, 'info');
    }
    L.pamiec.zapisz('przypomniane', JSON.stringify({ klucz: k.klucz, ids: Array.from(juz) }));
  }
  setInterval(przypomnij, 20000);
  L.poRysowaniu.push(przypomnij);
})();
