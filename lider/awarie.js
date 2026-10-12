/* Awarie: zgłoszenie do UR, status naprawy na żywo, potwierdzenie wznowienia pracy.

   Zgłoszenie to ekran awaryjny: maszyna → priorytet → Wyślij, czyli trzy dotknięcia; notatka i zdjęcie
   są nieobowiązkowe (D47) — pomagają mechanikowi, ale ich brak nie może opóźnić zgłoszenia. Czas zdarzenia = chwila dotknięcia „Wyślij” na telefonie,
   więc przestój liczy się od zgłoszenia, nawet gdy sieć wróci dopiero po 20 minutach (D7). */

(function () {
  'use strict';

  const L = window.Lider, hala = L.hala, W = L.W, esc = L.esc;
  const statusy = new Map();          // id -> status (do komunikatów o zmianie statusu)

  const KLASA_STATUSU = { zgloszona: 'alarm', przyjeta: 'uwaga', w_trakcie: 'info', wstrzymana: 'neutral',
                          oczekuje_potwierdzenia: 'ok', zamknieta: 'neutral', anulowana: 'neutral' };
  const KLASA_PRIORYTETU = { zatrzymanie: 'alarm', ograniczenie: 'uwaga', drobna: 'neutral' };

  const stale = () => (hala.kontrakt && hala.kontrakt.stale) || {};
  // Jedna linia (D51): po naprawie rusza maszyna, nie „linia” (W.coStoi).
  const rusza = () => W.coStoi(hala.slowniki);

  function wiersze(filtr) {
    return W.awarie(hala.obiekty('awaria', filtr), {
      linia: L.linia(), ja: hala.pracownik && hala.pracownik.id, teraz: hala.teraz(),
      slowniki: hala.slowniki, pracownicy: hala.pracownicy, stale: stale() });
  }

  // ------------------------------------------------------------ zgłoszenie

  const pusteZgloszenie = () => ({ maszyna: '', priorytet: '', opis: '', zdjecia: [] });

  /* Jeden formularz zgłoszenia w dwóch miejscach (UI etap 2, „jedna AWARIA”): na górze ekranu ⚠️ Awaria — od razu, bez
     otwierania okna — i w oknie z zasłony alertu jakości (zasłona przykrywa ekrany, a maszyna nie czeka). Oba miejsca
     piszą w ten sam brudnopis (klucz ze zmianą), więc zaczęte w jednym da się dokończyć w drugim.
     o = { kontener, f, linia, wOknie, poWyslaniu(tekst) }. Zwraca odswiez() — pytanie o duplikat po nowym zdarzeniu
     (ktoś inny zgłosił tę maszynę, kiedy lider wypełniał formularz). */
  function zbudujFormularz({ kontener, f, linia, wOknie, poWyslaniu }) {
    const d = f.dane;
    const maszyny = W.maszynyLinii(hala.slowniki, linia);
    const prio = (stale().priorytety || []).slice().sort((a, b) => (a.kolejnosc || 9) - (b.kolejnosc || 9));
    kontener.innerHTML = `<form class="formularz awaria-form" novalidate>
        <h3>1. Maszyna</h3>
        <div class="siatka-wyboru" data-grupa="maszyna">
          ${maszyny.map(m => `<button type="button" data-wartosc="${esc(m.kod)}"><b>${esc(m.kod)}</b><span>${esc(m.nazwa)}</span></button>`).join('')}
          <button type="button" class="skan" data-skanuj>📷 Skanuj QR maszyny</button>
        </div>
        <div class="wybrana-inna slaby" hidden></div>
        <div class="ostrzezenie duplikat" hidden><p></p>
          <div class="przyciski-rzad"><button type="button" class="glowny" data-dopisz>Dopisz się</button>
            <button type="button" data-nowa>Zgłoś nową</button></div></div>
        <h3>2. Priorytet</h3>
        <div class="siatka-wyboru priorytety" data-grupa="priorytet">
          ${prio.map(p => `<button type="button" class="prio-${esc(KLASA_PRIORYTETU[p.kod] || 'neutral')}" data-wartosc="${esc(p.kod)}">${esc(W.nazwaPriorytetu(p, hala.slowniki))}</button>`).join('')}
        </div>
        <h3>3. Notatka i zdjęcie <span class="slaby">(nieobowiązkowe)</span></h3>
        <textarea name="opis" rows="3" maxlength="2000" placeholder="Co się dzieje? (np. dźwięk, błąd na panelu)" aria-label="Notatka — co się dzieje"></textarea>
        <div class="pole-zdjec"></div>
        <ul class="bledy" hidden></ul>
        <button type="submit" class="alarm szeroki duzy">Wyślij zgłoszenie</button>
        ${wOknie ? '' : '<button type="button" class="maly wyczysc" data-wyczysc hidden>Wyczyść</button>'}
      </form>`;
    const form = kontener.querySelector('form');
    f.powiaz(form);
    // Etap 3: maszyna z aktywną awarią — pytanie „dopisać się czy zgłosić nową?” (nowaDla = maszyna, dla której
    // lider świadomie wybrał „Zgłoś nową”; zmiana maszyny pyta od nowa).
    let nowaDla = null;
    const duplikat = () => W.aktywnaAwariaMaszyny(hala.obiekty('awaria'), d.maszyna);
    function pokazDuplikat() {
      const a = duplikat(), box = form.querySelector('.duplikat');
      box.hidden = !a || nowaDla === d.maszyna;
      if (a) {
        box.querySelector('p').textContent = W.pytanieODuplikat(a);
        box.querySelector('[data-dopisz]').textContent = `Dopisz się${a.numer ? ' do ' + a.numer : ''}`;
      }
    }
    // „Wyczyść” tylko na ekranie: okna nie ma czym zamknąć, a przypadkiem dotknięta maszyna zostawałaby wybrana do końca zmiany.
    const wyczysc = form.querySelector('[data-wyczysc]');
    const pokazWyczysc = () => { if (wyczysc) wyczysc.hidden = !W.zgloszenieZaczete(d); };
    form.addEventListener('input', pokazWyczysc);
    if (wyczysc) wyczysc.addEventListener('click', async () => { await f.usun(); poWyslaniu(null); });
    form.querySelector('[data-nowa]').addEventListener('click', () => { nowaDla = d.maszyna; pokazDuplikat(); });
    form.querySelector('[data-dopisz]').addEventListener('click', async () => {
      const a = duplikat();
      if (!a) { pokazDuplikat(); return; }
      // Opis i zdjęcia trafiają do zgłoszonej awarii jako notatka dla UR (awaria.komentarz) — bez drugiego licznika przestoju.
      const zd = await L.zapisz('awaria.komentarz', a.id, L.bezPustych({
        tekst: (d.opis || '').trim() || 'Ponowne zgłoszenie z linii — maszyna dalej nie działa.', zdjecia: d.zdjecia }));
      if (!zd) return;
      await f.usun();
      poWyslaniu(`Dopisane do zgłoszonej awarii${a.numer ? ' ' + a.numer : ''}`);
    });
    function zaznacz() {
      for (const g of form.querySelectorAll('[data-grupa]')) {
        for (const b of g.querySelectorAll('[data-wartosc]')) b.classList.toggle('wybrany', d[g.dataset.grupa] === b.dataset.wartosc);
      }
      const inna = d.maszyna && !maszyny.some(m => m.kod === d.maszyna);
      const w = form.querySelector('.wybrana-inna');
      w.hidden = !inna;
      if (inna) {
        const m = (hala.slowniki.maszyny || {})[d.maszyna] || {};
        w.textContent = `Wybrana: ${d.maszyna} ${m.nazwa || ''}${m.linia && m.linia !== linia ? ` (linia ${m.linia})` : ''}`;
      }
      pokazDuplikat();
      pokazWyczysc();
    }
    for (const g of form.querySelectorAll('[data-grupa]')) {
      g.addEventListener('click', ev => {
        const b = ev.target.closest('[data-wartosc]');
        if (!b) return;
        d[g.dataset.grupa] = b.dataset.wartosc;
        f.zmieniono();
        zaznacz();
        // W oknie od razu do notatki; na ekranie nie — klawiatura zasłoniłaby „Wyślij zgłoszenie”, a notatka jest nieobowiązkowa.
        if (g.dataset.grupa === 'priorytet' && wOknie) form.opis.focus();
      });
    }
    form.querySelector('[data-skanuj]').addEventListener('click', async () => {
      // Wpisany „WT-01” = skan HALA:M:WT-01; zły kod — skaner zostaje otwarty z błędem (L.skanujKod).
      const skan = await L.skanujKod({ tytul: 'Zeskanuj maszynę' }, t => {
        const kod = Hala.odczytajKod(t, hala.slowniki);
        return kod.rodzaj === 'maszyny' && kod.wpis ? { ok: true, maszyna: kod.kod }
          : { ok: false, powod: 'To nie jest kod maszyny. Zeskanuj naklejkę HALA:M na maszynie, wpisz jej kod albo wybierz ją z listy.' };
      });
      if (!skan) return;
      d.maszyna = skan.maszyna;
      f.zmieniono();
      zaznacz();
    });
    L.poleZdjec(form.querySelector('.pole-zdjec'), d.zdjecia, () => { f.zmieniono(); pokazWyczysc(); }, { maks: 4 });
    zaznacz();
    form.addEventListener('submit', W.przyWysylce(async ev => {
      ev.preventDefault();
      const bledy = W.sprawdzAwarie(d, stale());
      const ul = form.querySelector('.bledy');
      ul.hidden = !bledy.length;
      ul.innerHTML = bledy.map(b => `<li>${esc(b)}</li>`).join('');
      if (bledy.length) return;
      if (duplikat() && nowaDla !== d.maszyna) {
        pokazDuplikat();
        ul.hidden = false;
        ul.innerHTML = `<li>${esc('Wybierz: „Dopisz się” do zgłoszonej awarii albo „Zgłoś nową”.')}</li>`;
        return;
      }
      const m = (hala.slowniki.maszyny || {})[d.maszyna] || {};
      const id = hala.nowyId();
      const zd = await L.zapisz('awaria.zgloszona', id, L.bezPustych({
        linia: m.linia || linia, maszyna: d.maszyna, stanowisko: m.stanowisko || '',
        opis: d.opis.trim(), priorytet: d.priorytet, zdjecia: d.zdjecia }));
      if (!zd) return;
      await f.usun();
      poWyslaniu('Awaria zgłoszona do UR');
    }));
    return { odswiez: pokazDuplikat };
  }

  /* Okno zgłoszenia — z zasłony alertu jakości (jakosc.js) i po przeładowaniu karty z otwartym oknem (L.oknaPoStarcie). */
  async function zglos(parametry) {
    const linia = L.linia();
    // Brudnopis na tę zmianę (audyt 2026-10-12): okno zamknięte ✕ zostawia brudnopis, a z kluczem samej linii AWARIA
    // otwierała się po dniach z dawną maszyną, priorytetem i notatką. Zmiana zapamiętana w parametrach okna — po
    // przeładowaniu karty tuż po 14:00 brudnopis zmiany I dalej się znajdzie.
    const p = Object.assign({}, parametry || {});
    if (p.zmianaId === undefined) p.zmianaId = (hala.zmianaTeraz() || {}).id || '';
    const klucz = W.kluczBrudnopisu('awaria', linia, p.zmianaId);
    const f = await L.formularz(klucz, pusteZgloszenie());
    L.okno({
      tytul: 'Zgłoś awarię', klucz: 'awaria', parametry: p,
      poOtwarciu: el => zbudujFormularz({ kontener: el, f, linia, wOknie: true, poWyslaniu: tekst => {
        L.zamknijOkno();
        if (tekst) L.poZapisie(tekst);
        L.pokazEkran('awarie');
      } }),
      // Ten sam brudnopis ma formularz na ekranie ⚠️ Awaria — po oknie budujemy go od nowa z tego, co zostało.
      przyZamknieciu: () => { naEkranie = null; L.narysuj(); },
    });
  }
  L.zglosAwarie = zglos;
  L.oknaPoStarcie.awaria = zglos;

  /* Formularz na ekranie ⚠️ Awaria. Ekran przerysowuje się co 20 s i po każdym zdarzeniu — formularz budujemy od nowa
     tylko wtedy, gdy każe W.przebudowacZgloszenie (pierwszy raz, inna linia, nowa zmiana przy pustym formularzu);
     inaczej tylko odświeżamy pytanie o duplikat. naEkranie = { linia, zmianaId, dane, odswiez, miejsce }. */
  let naEkranie = null, budowa = 0;
  function rysujZgloszenie(miejsce) {
    const linia = L.linia(), zmianaId = (hala.zmianaTeraz() || {}).id || '';
    if (naEkranie && naEkranie.miejsce === miejsce && !W.przebudowacZgloszenie(naEkranie, linia, zmianaId)) {
      if (naEkranie.odswiez) naEkranie.odswiez();
      return;
    }
    const nr = ++budowa;
    const stan = naEkranie = { linia, zmianaId, dane: null, odswiez: null, miejsce };
    L.formularz(W.kluczBrudnopisu('awaria', linia, zmianaId), pusteZgloszenie()).then(f => {
      if (nr !== budowa) return;                  // w międzyczasie zbudowany od nowa (np. zmiana linii)
      stan.dane = f.dane;
      stan.odswiez = zbudujFormularz({ kontener: miejsce, f, linia, wOknie: false, poWyslaniu: tekst => {
        naEkranie = null;                         // pusty formularz na następne zgłoszenie
        L.narysuj();
        if (!tekst) return;                       // „Wyczyść”
        L.poZapisie(tekst);
        // Nowa awaria jest na liście pod formularzem — pokazujemy ją, żeby lider widział status („Zgłoszona”, mechanik).
        setTimeout(() => { const h = L.$('ekran-awarie').querySelector('[data-lista]'); if (h) h.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 80);
      } }).odswiez;
    });
  }

  // ------------------------------------------------------------ potwierdzenie / odrzucenie / anulowanie

  function potwierdz(id) {
    const a = hala.obiekt('awaria', id);
    if (!a) return;
    const w = wiersze(x => x.id === id)[0];
    L.okno({
      tytul: `Czy ${rusza()} ruszyła?`,
      html: `<div class="karta-awarii">
          <div><b>${esc(w.maszynaNazwa)}</b> <span class="slaby">${esc(w.maszyna)} · ${esc(w.numer)}</span></div>
          ${w.opisNaprawy ? `<p><span class="slaby">UR:</span> ${esc(w.opisNaprawy)}</p>` : ''}
          <p class="slaby">Przestój: <span data-od="${esc(Date.parse(w.czasZgloszenia) || '')}">${esc(Hala.formatLicznika(w.przestojMs))}</span></p>
        </div>
        <form class="formularz">
          <textarea name="uwagi" rows="2" maxlength="1000" placeholder="Uwagi (opcjonalnie)"></textarea>
          <button type="submit" class="zielony szeroki duzy">Potwierdzam — ${rusza()} pracuje</button>
          <button type="button" class="szeroki" data-nie>Nadal nie działa</button>
        </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
        form.addEventListener('submit', W.przyWysylce(async ev => {
          ev.preventDefault();
          const zd = await L.zapisz('awaria.potwierdzona', id, L.bezPustych({ uwagi: form.uwagi.value.trim() }));
          if (!zd) return;
          L.zamknijOkno();
          L.poZapisie('Naprawa potwierdzona — przestój zamknięty');
        }));
        form.querySelector('[data-nie]').addEventListener('click', () => odrzuc(id));
      },
    });
  }
  L.potwierdzAwarie = potwierdz;

  async function odrzuc(id) {
    const powod = await L.zapytaj({ tytul: 'Nadal nie działa', pytanie: 'Co jest nie tak? Awaria wróci do mechanika.',
                                    podpowiedz: 'Np. dalej cieknie olej', przycisk: 'Odeślij do UR', wymagane: true, klasa: 'alarm',
                                    pole: ['awaria.potwierdzenie_odrzucone', 'powod'] });
    if (!powod) return;
    if (await L.zapisz('awaria.potwierdzenie_odrzucone', id, { powod })) L.poZapisie('Awaria wróciła do UR');
  }

  async function anuluj(id) {
    const powod = await L.zapytaj({ tytul: 'Anuluj zgłoszenie', pytanie: 'Dlaczego anulujesz? (np. fałszywy alarm)',
                                    przycisk: 'Anuluj zgłoszenie', wymagane: true, klasa: 'alarm', pole: ['awaria.anulowana', 'powod'] });
    if (!powod) return;
    if (await L.zapisz('awaria.anulowana', id, { powod })) L.poZapisie('Zgłoszenie anulowane');
  }

  async function komentarz(id) {
    const tekst = await L.zapytaj({ tytul: 'Notatka dla UR', podpowiedz: 'Np. maszyna znowu stanęła o 10:20', przycisk: 'Dodaj', wymagane: true,
                                    pole: ['awaria.komentarz', 'tekst'] });
    if (!tekst) return;
    if (await L.zapisz('awaria.komentarz', id, { tekst })) L.poZapisie('Notatka dodana');
  }

  // ------------------------------------------------------------ ekran

  function karta(w) {
    return `<article class="karta awaria ${w.zatrzymuje && w.aktywny ? 'zatrzymanie' : ''} ${w.doPotwierdzenia ? 'do-potwierdzenia' : ''}" data-id="${esc(w.id)}">
      <header>
        <div><b>${esc(w.maszynaNazwa)}</b> <span class="slaby">${esc(w.maszyna)}${w.linia !== L.linia() ? ' · ' + esc(w.linia) : ''}</span></div>
        <span class="numer slaby">${esc(w.numer)}</span>
      </header>
      <div class="szczegoly">
        <span class="znacznik ${KLASA_STATUSU[w.status] || 'neutral'}">${esc(w.etykieta)}</span>
        <span class="znacznik ${KLASA_PRIORYTETU[w.priorytet] || 'neutral'}">${esc(w.priorytetNazwa)}</span>
        ${w.czeka ? '<span class="znacznik info">czeka na wysłanie</span>' : ''}
      </div>
      ${w.opis ? `<div class="opis-awarii">${esc(w.opis)}</div>` : ''}
      ${w.zdjecia.length ? `<div class="galeria-awarii" data-zdjecia="${esc(w.zdjecia.join(','))}" data-podpis="${esc(w.maszynaNazwa)}"></div>` : ''}
      ${w.mechanik ? `<div class="slaby">Mechanik: ${esc(w.mechanik)}</div>` : ''}
      ${w.powodWstrzymania ? `<div class="tekst-uwaga">Wstrzymana: ${esc(w.powodWstrzymania)}</div>` : ''}
      ${w.opisNaprawy && w.doPotwierdzenia ? `<div>UR: ${esc(w.opisNaprawy)}</div>` : ''}
      <div class="przestoj">Przestój <b ${w.aktywny ? `data-od="${esc(Date.parse(w.czasZgloszenia) || '')}"` : ''}>${esc(Hala.formatLicznika(w.przestojMs))}</b>
        <span class="slaby">od ${esc(w.godzZgloszenia)}</span></div>
      ${w.aktywny ? `<div class="akcje">
        ${w.doPotwierdzenia ? `<button type="button" class="zielony" data-a="potwierdz">${rusza() === 'linia' ? 'Linia' : 'Maszyna'} ruszyła</button>
                               <button type="button" data-a="odrzuc">Nadal nie działa</button>` : ''}
        <button type="button" class="maly" data-a="komentarz">Notatka</button>
        ${w.mozeAnulowac ? '<button type="button" class="maly" data-a="anuluj">Anuluj</button>' : ''}
      </div>` : ''}
    </article>`;
  }

  /* Ekran ⚠️ Awaria (UI etap 2, „jedna AWARIA”): dawny czerwony przycisk AWARIA i zakładka „Awarie” to teraz jedna
     zakładka. Na górze od razu formularz zgłoszenia (maszyna → priorytet → Wyślij, bez otwierania okna), pod nim awarie
     linii z „Czy maszyna ruszyła?”. Szkielet ekranu powstaje raz — kolejne rysowania zmieniają tylko listę, żeby
     przerysowanie co 20 s nie kasowało tego, co lider właśnie wybiera. */
  L.ekrany.awarie = {
    rysuj(el) {
      let miejsce = el.querySelector('.zgloszenie-awarii [data-formularz]');
      if (!miejsce) {
        el.innerHTML = `<section class="karta zgloszenie-awarii" aria-labelledby="zgloszenie-tytul">
            <h2 id="zgloszenie-tytul">⚠️ Zgłoś awarię</h2><div data-formularz></div></section>
          <div data-lista></div>`;
        miejsce = el.querySelector('[data-formularz]');
      }
      rysujZgloszenie(miejsce);
      rysujListe(el.querySelector('[data-lista]'));
    },
  };

  function rysujListe(el) {
    const z = hala.zmianaTeraz();
    const od = z ? Date.parse(z.od) : 0;
    const aktywne = wiersze(a => a.aktywny);
    // Po chwili zamknięcia, nie po `zmieniono` — notatka do wczoraj zamkniętej awarii nie wraca jej na listę.
    const zakonczone = wiersze(a => W.zakonczonaNaZmianie(a, od));
    el.innerHTML = `
      <h2>Aktywne awarie <span class="slaby">${aktywne.length || ''}</span></h2>
      ${aktywne.map(karta).join('') || `<p class="pusto ok">Brak aktywnych awarii${W.wieleLinii(hala.slowniki) ? ' na linii' : ''}</p>`}
      ${zakonczone.length ? `<h2>Zakończone na tej zmianie</h2>${zakonczone.map(karta).join('')}` : ''}`;
    // Zdjęcia ze zgłoszenia (D47) — lokalne (jeszcze w kolejce) albo z huba; dotknięcie otwiera całe zdjęcie.
    for (const g of el.querySelectorAll('.galeria-awarii')) L.galeria(g, g.dataset.zdjecia.split(',').filter(Boolean));
    for (const k of el.querySelectorAll('.karta.awaria')) {
      const id = k.dataset.id;
      k.addEventListener('click', ev => {
        const b = ev.target.closest('[data-a]');
        if (!b) return;
        ({ potwierdz, odrzuc, anuluj, komentarz })[b.dataset.a](id);
      });
    }
  }

  // Wezwanie na każdym ekranie: naprawa czeka na potwierdzenie lidera.
  L.wezwania.push(() => wiersze(a => a.aktywny && a.status === 'oczekuje_potwierdzenia').map(w => ({
    klasa: 'ok', akcja: () => potwierdz(w.id),
    html: `<b>${esc(w.maszyna)} naprawiona</b> — potwierdź, że ${rusza()} ruszyła ›` })));

  // Plakietka na zakładce „⚠️ Awaria”: ile aktywnych na linii.
  L.poRysowaniu.push(() => L.plakietka('awarie', wiersze(a => a.aktywny).length));

  // Komunikat, gdy UR zmieni status mojej awarii — lider nie musi patrzeć w listę.
  hala.na('zmiana', ({ typ, id, obiekt }) => {
    if (typ === '*') { for (const a of hala.obiekty('awaria')) statusy.set(a.id, a.status); return; }
    if (typ !== 'awaria' || !obiekt) return;
    const byl = statusy.get(id);
    statusy.set(id, obiekt.status);
    if (!byl || byl === obiekt.status || obiekt._oczekuje) return;
    if (obiekt.linia !== L.linia()) return;
    const m = (obiekt.dane || {}).maszyna || '';
    if (obiekt.status === 'oczekuje_potwierdzenia') {
      L.powiadom(`${m}: naprawa zakończona`, `Potwierdź, że ${rusza()} ruszyła`, { tag: 'awaria-' + id, adres: '#awarie' });
      L.komunikat(`${m}: naprawa zakończona — potwierdź`, 'ok', 'awaria-' + id);
    } else {
      L.komunikat(`${m}: ${obiekt.etykieta || obiekt.status}`, 'info', 'awaria-' + id);
      if (obiekt.status === 'przyjeta') L.powiadom(`${m}: mechanik w drodze`, '', { tag: 'awaria-' + id, wibracja: 100, adres: '#awarie' });
    }
  });
  hala.na('sesja', () => { statusy.clear(); for (const a of hala.obiekty('awaria')) statusy.set(a.id, a.status); });
  // Po starcie z pamięci telefonu zdarzenia „sesja” nie ma — znane statusy zbieramy przy rysowaniu.
  L.poRysowaniu.push(() => { for (const a of hala.obiekty('awaria')) if (!statusy.has(a.id)) statusy.set(a.id, a.status); });
})();
