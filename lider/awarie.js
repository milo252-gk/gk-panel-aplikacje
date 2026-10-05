/* Awarie: zgłoszenie do UR, status naprawy na żywo, potwierdzenie wznowienia pracy.

   Zgłoszenie to ekran awaryjny: maszyna → priorytet → opis → Wyślij, czyli trzy
   dotknięcia i kilka słów. Czas zdarzenia = chwila dotknięcia „Wyślij” na telefonie,
   więc przestój liczy się od zgłoszenia, nawet gdy sieć wróci dopiero po 20 minutach (D7). */

(function () {
  'use strict';

  const L = window.Lider, hala = L.hala, W = L.W, esc = L.esc;
  const statusy = new Map();          // id -> status (do komunikatów o zmianie statusu)

  const KLASA_STATUSU = { zgloszona: 'alarm', przyjeta: 'uwaga', w_trakcie: 'info', wstrzymana: 'neutral',
                          oczekuje_potwierdzenia: 'ok', zamknieta: 'neutral', anulowana: 'neutral' };
  const KLASA_PRIORYTETU = { zatrzymanie: 'alarm', ograniczenie: 'uwaga', drobna: 'neutral' };

  const stale = () => (hala.kontrakt && hala.kontrakt.stale) || {};

  function wiersze(filtr) {
    return W.awarie(hala.obiekty('awaria', filtr), {
      linia: L.linia(), ja: hala.pracownik && hala.pracownik.id, teraz: hala.teraz(),
      slowniki: hala.slowniki, pracownicy: hala.pracownicy, stale: stale() });
  }

  // ------------------------------------------------------------ zgłoszenie

  async function zglos(parametry) {
    const linia = L.linia();
    const klucz = 'awaria:' + linia;
    const f = await L.formularz(klucz, { maszyna: '', priorytet: '', opis: '', zdjecia: [] });
    const d = f.dane;
    const maszyny = W.maszynyLinii(hala.slowniki, linia);
    const prio = (stale().priorytety || []).slice().sort((a, b) => (a.kolejnosc || 9) - (b.kolejnosc || 9));
    L.okno({
      tytul: 'Zgłoś awarię', klucz: 'awaria', parametry: parametry || {},
      html: `<form class="formularz awaria-form" novalidate>
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
          ${prio.map(p => `<button type="button" class="prio-${esc(KLASA_PRIORYTETU[p.kod] || 'neutral')}" data-wartosc="${esc(p.kod)}">${esc(p.nazwa)}</button>`).join('')}
        </div>
        <h3>3. Co się dzieje?</h3>
        <textarea name="opis" rows="3" maxlength="2000" placeholder="Np. nie domyka formy, wyciek oleju"></textarea>
        <div class="pole-zdjec"></div>
        <ul class="bledy" hidden></ul>
        <button type="submit" class="alarm szeroki duzy">Wyślij zgłoszenie</button>
      </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
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
        form.querySelector('[data-nowa]').addEventListener('click', () => { nowaDla = d.maszyna; pokazDuplikat(); });
        form.querySelector('[data-dopisz]').addEventListener('click', async () => {
          const a = duplikat();
          if (!a) { pokazDuplikat(); return; }
          // Opis i zdjęcia trafiają do zgłoszonej awarii jako notatka dla UR (awaria.komentarz) — bez drugiego licznika przestoju.
          const zd = await L.zapisz('awaria.komentarz', a.id, L.bezPustych({
            tekst: (d.opis || '').trim() || 'Ponowne zgłoszenie z linii — maszyna dalej nie działa.', zdjecia: d.zdjecia }));
          if (!zd) return;
          await f.usun();
          L.zamknijOkno();
          L.poZapisie(`Dopisane do zgłoszonej awarii${a.numer ? ' ' + a.numer : ''}`);
          L.pokazEkran('awarie');
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
        }
        for (const g of form.querySelectorAll('[data-grupa]')) {
          g.addEventListener('click', ev => {
            const b = ev.target.closest('[data-wartosc]');
            if (!b) return;
            d[g.dataset.grupa] = b.dataset.wartosc;
            f.zmieniono();
            zaznacz();
            if (g.dataset.grupa === 'priorytet') form.opis.focus();
          });
        }
        form.querySelector('[data-skanuj]').addEventListener('click', async () => {
          const t = await HalaSkaner.skanuj({ tytul: 'Zeskanuj maszynę' });
          if (!t) return;
          const kod = Hala.odczytajKod(t, hala.slowniki);
          if (kod.rodzaj !== 'maszyny' || !kod.wpis) {
            L.komunikat('To nie jest kod maszyny. Zeskanuj naklejkę HALA:M na maszynie albo wybierz ją z listy.', 'blad');
            return;
          }
          d.maszyna = kod.kod;
          f.zmieniono();
          zaznacz();
        });
        L.poleZdjec(form.querySelector('.pole-zdjec'), d.zdjecia, () => f.zmieniono(), { maks: 4 });
        zaznacz();
        form.addEventListener('submit', async ev => {
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
          L.zamknijOkno();
          L.poZapisie('Awaria zgłoszona do UR');
          L.pokazEkran('awarie');
        });
      },
    });
  }
  L.zglosAwarie = zglos;
  L.oknaPoStarcie.awaria = zglos;
  L.$('przycisk-awarii').addEventListener('click', () => zglos());

  // ------------------------------------------------------------ potwierdzenie / odrzucenie / anulowanie

  function potwierdz(id) {
    const a = hala.obiekt('awaria', id);
    if (!a) return;
    const w = wiersze(x => x.id === id)[0];
    L.okno({
      tytul: 'Czy linia ruszyła?',
      html: `<div class="karta-awarii">
          <div><b>${esc(w.maszynaNazwa)}</b> <span class="slaby">${esc(w.maszyna)} · ${esc(w.numer)}</span></div>
          ${w.opisNaprawy ? `<p><span class="slaby">UR:</span> ${esc(w.opisNaprawy)}</p>` : ''}
          <p class="slaby">Przestój: <span data-od="${esc(Date.parse(w.czasZgloszenia) || '')}">${esc(Hala.formatLicznika(w.przestojMs))}</span></p>
        </div>
        <form class="formularz">
          <textarea name="uwagi" rows="2" maxlength="1000" placeholder="Uwagi (opcjonalnie)"></textarea>
          <button type="submit" class="zielony szeroki duzy">Potwierdzam — linia pracuje</button>
          <button type="button" class="szeroki" data-nie>Nadal nie działa</button>
        </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
        form.addEventListener('submit', async ev => {
          ev.preventDefault();
          const zd = await L.zapisz('awaria.potwierdzona', id, L.bezPustych({ uwagi: form.uwagi.value.trim() }));
          if (!zd) return;
          L.zamknijOkno();
          L.poZapisie('Naprawa potwierdzona — przestój zamknięty');
        });
        form.querySelector('[data-nie]').addEventListener('click', () => odrzuc(id));
      },
    });
  }
  L.potwierdzAwarie = potwierdz;

  async function odrzuc(id) {
    const powod = await L.zapytaj({ tytul: 'Nadal nie działa', pytanie: 'Co jest nie tak? Awaria wróci do mechanika.',
                                    podpowiedz: 'Np. dalej cieknie olej', przycisk: 'Odeślij do UR', wymagane: true, klasa: 'alarm' });
    if (!powod) return;
    if (await L.zapisz('awaria.potwierdzenie_odrzucone', id, { powod })) L.poZapisie('Awaria wróciła do UR');
  }

  async function anuluj(id) {
    const powod = await L.zapytaj({ tytul: 'Anuluj zgłoszenie', pytanie: 'Dlaczego anulujesz? (np. fałszywy alarm)',
                                    przycisk: 'Anuluj zgłoszenie', wymagane: true, klasa: 'alarm' });
    if (!powod) return;
    if (await L.zapisz('awaria.anulowana', id, { powod })) L.poZapisie('Zgłoszenie anulowane');
  }

  async function komentarz(id) {
    const tekst = await L.zapytaj({ tytul: 'Notatka dla UR', podpowiedz: 'Np. maszyna znowu stanęła o 10:20', przycisk: 'Dodaj', wymagane: true });
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
      <div class="opis-awarii">${esc(w.opis)}</div>
      ${w.mechanik ? `<div class="slaby">Mechanik: ${esc(w.mechanik)}</div>` : ''}
      ${w.powodWstrzymania ? `<div class="tekst-uwaga">Wstrzymana: ${esc(w.powodWstrzymania)}</div>` : ''}
      ${w.opisNaprawy && w.doPotwierdzenia ? `<div>UR: ${esc(w.opisNaprawy)}</div>` : ''}
      <div class="przestoj">Przestój <b ${w.aktywny ? `data-od="${esc(Date.parse(w.czasZgloszenia) || '')}"` : ''}>${esc(Hala.formatLicznika(w.przestojMs))}</b>
        <span class="slaby">od ${esc(w.godzZgloszenia)}</span></div>
      ${w.aktywny ? `<div class="akcje">
        ${w.doPotwierdzenia ? `<button type="button" class="zielony" data-a="potwierdz">Linia ruszyła</button>
                               <button type="button" data-a="odrzuc">Nadal nie działa</button>` : ''}
        <button type="button" class="maly" data-a="komentarz">Notatka</button>
        ${w.mozeAnulowac ? '<button type="button" class="maly" data-a="anuluj">Anuluj</button>' : ''}
      </div>` : ''}
    </article>`;
  }

  L.ekrany.awarie = {
    rysuj(el) {
      const z = hala.zmianaTeraz();
      const od = z ? Date.parse(z.od) : 0;
      const aktywne = wiersze(a => a.aktywny);
      const zakonczone = wiersze(a => !a.aktywny && Date.parse(a.zmieniono) >= od);
      el.innerHTML = `
        <button type="button" class="alarm szeroki duzy" data-a="zglos">⚠ Zgłoś awarię</button>
        <h2>Aktywne <span class="slaby">${aktywne.length || ''}</span></h2>
        ${aktywne.map(karta).join('') || '<p class="pusto ok">Brak aktywnych awarii na linii</p>'}
        ${zakonczone.length ? `<h2>Zakończone na tej zmianie</h2>${zakonczone.map(karta).join('')}` : ''}`;
      el.querySelector('[data-a=zglos]').addEventListener('click', () => zglos());
      for (const k of el.querySelectorAll('.karta.awaria')) {
        const id = k.dataset.id;
        k.addEventListener('click', ev => {
          const b = ev.target.closest('[data-a]');
          if (!b) return;
          ({ potwierdz, odrzuc, anuluj, komentarz })[b.dataset.a](id);
        });
      }
    },
  };

  // Wezwanie na każdym ekranie: naprawa czeka na potwierdzenie lidera.
  L.wezwania.push(() => wiersze(a => a.aktywny && a.status === 'oczekuje_potwierdzenia').map(w => ({
    klasa: 'ok', akcja: () => potwierdz(w.id),
    html: `<b>${esc(w.maszyna)} naprawiona</b> — potwierdź, że linia ruszyła ›` })));

  // Plakietka na przycisku „Awarie”: ile aktywnych na linii.
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
      L.powiadom(`${m}: naprawa zakończona`, 'Potwierdź, że linia ruszyła', { tag: 'awaria-' + id });
      L.komunikat(`${m}: naprawa zakończona — potwierdź`, 'ok', 'awaria-' + id);
    } else {
      L.komunikat(`${m}: ${obiekt.etykieta || obiekt.status}`, 'info', 'awaria-' + id);
      if (obiekt.status === 'przyjeta') L.powiadom(`${m}: mechanik w drodze`, '', { tag: 'awaria-' + id, wibracja: 100 });
    }
  });
  hala.na('sesja', () => { statusy.clear(); for (const a of hala.obiekty('awaria')) statusy.set(a.id, a.status); });
  // Po starcie z pamięci telefonu zdarzenia „sesja” nie ma — znane statusy zbieramy przy rysowaniu.
  L.poRysowaniu.push(() => { for (const a of hala.obiekty('awaria')) if (!statusy.has(a.id)) statusy.set(a.id, a.status); });
})();
