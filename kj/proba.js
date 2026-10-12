/* Próbkowanie (KONTRAKT §6.3): plan zmiany, próba na stanowisku, wyniki
   i szczegóły próby z korektą, partie brakowe.

   Próba to proba.zarejestrowana — ten sam typ, którego używa lider (D11), więc
   katalog wad i zlecenie (D12) muszą znaczyć to samo po obu stronach.
   Kolejność pracy na hali: skan stanowiska (dowód obecności + godzina startu,
   od razu w brudnopisie) → zlecenie → liczby → wady → zdjęcia → zapisz
   → ewentualnie podpowiedź partii brakowej (D13, decyzja kontrolera).        */

(function (KJ) {
  'use strict';

  const { hala, W, esc } = KJ;
  const BRUDNOPIS = 'proba';

  // ------------------------------------------------------------ plan zmiany

  /* Zlecenia od kierownika na Planie (UI etap 2 — bez osobnej zakładki „Zlecenia”). Jeden stały element: wspólny
     HalaZlecenia.rysuj trzyma w nim stan (filtr „Moje”, otwarty formularz „Zrobione” ze zdjęciem) i swoich słuchaczy,
     a przerysowanie planu tylko przekłada go z powrotem na górę — nowy element co rysowanie gubiłby wpisaną notatkę. */
  const miejsceZlecen = document.createElement('section');
  miejsceZlecen.className = 'grupa zlecenia-na-planie';

  /* „Pomiń” przy próbie lidera ponad progiem — tylko w tym telefonie, dla tej osoby i zmiany (W.pomin; bez zdarzenia). */
  const czytajPominiete = () => { try { return JSON.parse(localStorage.getItem('hala.kj.pominieteProbyLiderow') || 'null'); } catch (e) { return null; } };
  const zapiszPominiete = z => { try { localStorage.setItem('hala.kj.pominieteProbyLiderow', JSON.stringify(z)); } catch (e) { /* bez pamięci wiersz wróci */ } };

  /* „Pokaż wszystkie” pamiętane do końca zmiany (id zmiany), żeby odświeżenie co kilka sekund nie zwijało listy. */
  let wszystkieProby = null;

  KJ.ekran('plan', {
    rysuj(el) {
      const zmiana = hala.zmianaTeraz();
      const proby = hala.obiekty('proba');
      const plan = W.planZmiany({ slowniki: hala.slowniki, proby, zmiana });
      const moje = W.probyZmiany({ proby, zmiana, slowniki: hala.slowniki, zrodlo: 'kj' });
      const partie = W.partieZmiany(W.listaPartii({ partie: hala.obiekty('partia', p => p.aktywny), slowniki: hala.slowniki }), zmiana);
      // Etap 3: próby liderów z tej zmiany ponad progiem braków — decyzja o partii należy do KJ (D13).
      // UI etap 2: bez tych, które kontroler pominął na tej zmianie.
      const kluczPominietych = W.kluczPominietych(hala.pracownik && hala.pracownik.id, zmiana);
      const liderow = W.bezPominietych(W.probyLiderowPonadProgiem({ proby, partie: hala.obiekty('partia'), zmiana, slowniki: hala.slowniki, prog: KJ.prog() }),
                                       czytajPominiete(), kluczPominietych);
      const mogePartie = KJ.mozna('partia.oznaczona_brakowa');
      const proc = plan.plan ? Math.round(plan.zrobione * 100 / plan.plan) : 0;
      const kody = W.pokazKody(hala.slowniki);
      // UI etap 3: tylko ostatnie próby zmiany — reszta za „Pokaż wszystkie (N)” (do końca zmiany w tym telefonie).
      const widoczne = W.najnowsze(moje, wszystkieProby === (zmiana && zmiana.id));
      el.innerHTML = `
        <div class="tytul-ekranu"><h1>Plan próbkowania</h1><span class="licznik-planu ${plan.zrobione >= plan.plan && plan.plan ? 'tekst-ok' : ''}">${plan.zrobione}/${plan.plan}</span></div>
        <div class="postep ${W.stanPaskaPlanu(plan, zmiana, hala.teraz())}"><span style="width:${proc}%"></span></div>
        ${KJ.mozna('proba.zarejestrowana') ? `<button type="button" class="glowny szeroki duzy" id="skanuj-stanowisko">${esc(W.napisSkanu(hala.slowniki))}</button>` : ''}
        ${plan.linie.map(g => `
          <section class="grupa">
            <h2>${esc(g.nazwa)} <span class="slaby">${g.zrobione}/${g.plan}</span></h2>
            ${g.stanowiska.map(s => `
              <a class="stanowisko ${s.gotowe ? 'gotowe' : 'czeka'}" href="${s.calaLinia ? '#proba' : `#proba/${encodeURIComponent(s.kod)}`}">
                <span class="nazwa">${esc(s.nazwa)}${s.calaLinia || !kody ? '' : ` <span class="slaby">${esc(s.kod)}</span>`}</span>
                <span class="stan">${s.gotowe ? '✓ ' : ''}${s.zrobione}/${s.plan}</span>
              </a>`).join('')}
          </section>`).join('') || '<p class="pusto">Brak planu próbkowania. Kierownik KJ ustawia go w „Więcej → Katalog, wyroby, plan → Plan próbkowania”.</p>'}
        ${plan.pozaPlanem ? `<p class="slaby">Poza planem na tej zmianie: ${plan.pozaPlanem}</p>` : ''}
        ${partie.tej.length || partie.starsze.length ? `<section class="grupa"><h2>Partie brakowe — ta zmiana <span class="znacznik ${partie.tej.length ? 'alarm' : 'neutral'}">${partie.tej.length}</span></h2>
          ${partie.tej.map(kartaPartii).join('')}
          ${partie.starsze.length ? `<a class="wstecz" href="#partie">Aktywne z wcześniejszych zmian: ${partie.starsze.length} ›</a>` : ''}</section>` : ''}
        ${liderow.length ? `<section class="grupa" id="proby-liderow"><h2>Próby liderów ponad progiem <span class="znacznik alarm">${liderow.length}</span></h2>
          <p class="slaby">Braki ≥ ${esc(W.procent(KJ.prog()))} % — sprawdź i zdecyduj o partii.</p>
          ${liderow.map(p => `${kartaProby(p)}<div class="akcje-proby">
            ${mogePartie ? `<button type="button" data-partia-proby="${esc(p.id)}">Partia brakowa</button>` : ''}
            <button type="button" data-pomin-probe="${esc(p.id)}">Pomiń</button></div>`).join('')}</section>` : ''}
        <section class="grupa"><h2>Próby KJ na tej zmianie <span class="slaby">${moje.length}</span></h2>
          ${widoczne.widoczne.map(kartaProby).join('') || '<p class="pusto">Jeszcze żadnej</p>'}
          ${widoczne.ukryte ? `<button type="button" class="szeroki" id="wszystkie-proby">Pokaż wszystkie (${moje.length})</button>` : ''}</section>`;
      const b = el.querySelector('#skanuj-stanowisko');
      if (b) b.addEventListener('click', () => KJ.idz('proba/skanuj'));
      const w = el.querySelector('#wszystkie-proby');
      if (w) w.addEventListener('click', () => { wszystkieProby = zmiana && zmiana.id; KJ.odswiez('wymus'); });
      // „Partia brakowa” przy próbie lidera — ta sama ścieżka co z wyniku próby (zaproponujPartie + podpowiedź progiem).
      for (const x of el.querySelectorAll('[data-partia-proby]')) {
        x.addEventListener('click', W.raz(async () => {
          const pr = hala.obiekt('proba', x.dataset.partiaProby);
          if (!pr) return;
          await zaproponujPartie(pr.id, Object.assign({ linia: pr.linia }, pr.dane), W.podpowiedzPartii(pr.dane, KJ.prog()));
        }));
      }
      for (const x of el.querySelectorAll('[data-pomin-probe]')) {
        x.addEventListener('click', () => {
          zapiszPominiete(W.pomin(czytajPominiete(), kluczPominietych, x.dataset.pominProbe));
          KJ.komunikat('Pominięta do końca zmiany');
          KJ.odswiez('wymus');
        });
      }
      // Zlecenia od kierownika na samej górze, tylko gdy jest co robić — zaległe pierwsze, z numerami kolejności
      // (wspólny ekran z ../wspolne/zlecenia.js), bo to, co miało być zrobione wcześniej, ma pierwszeństwo.
      if (W.pokazZleceniaNaPlanie(window.HalaZlecenia.doZrobienia(hala, { dzial: 'kj' }))) {
        el.prepend(miejsceZlecen);
        window.HalaZlecenia.rysuj(miejsceZlecen, hala, { dzial: 'kj' });
      }
    },
  });

  function kartaProby(p) {
    const alarm = p.proc !== null && p.proc >= KJ.prog();
    // Próba na całej linii (D51, bez stanowiska i maszyny): miejsce = linia, więc nie powtarzamy jej nazwy.
    return `<a class="karta proba" href="#wynik/${encodeURIComponent(p.id)}">
      <div class="wiersz"><b>${esc(p.stanowisko)}</b> <span class="slaby">${p.stanowisko === p.liniaNazwa ? '' : esc(p.liniaNazwa) + ' · '}${esc(W.godzina(p.czas))}</span>
        ${p.oczekuje ? '<span class="znacznik info">czeka na wysłanie</span>' : ''}</div>
      <div class="wiersz"><span>Braki <b class="${alarm ? 'tekst-alarm' : ''}">${p.braki}/${p.sprawdzone}</b>${p.proc !== null ? ` (${String(p.proc).replace('.', ',')} %)` : ''}</span>
        ${p.zlecenie ? `<span class="slaby">zlec. ${esc(p.zlecenie)}</span>` : ''}</div>
    </a>`;
  }

  function kartaPartii(p) {
    return `<a class="karta partia ${p.aktywna ? '' : 'zwolniona'}" href="#partia/${encodeURIComponent(p.id)}">
      <div class="wiersz"><span class="znacznik ${p.aktywna ? 'alarm' : 'neutral'}">${esc(p.numer)}</span>
        <b>${esc(p.liniaNazwa)}</b><span class="slaby">${esc(W.kiedy(p.czas, hala.teraz()))}</span>
        ${p.oczekuje ? '<span class="znacznik info">czeka na wysłanie</span>' : ''}</div>
      <div class="slaby">${[p.zlecenie && 'zlec. ' + p.zlecenie, p.partia && 'partia ' + p.partia, p.wyrob, p.ilosc !== null && p.ilosc + ' szt.'].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="tekst-opisu">${esc(p.powod)}</div>
    </a>`;
  }

  // ------------------------------------------------------------ próba: formularz

  // maszyna: tylko do pokazania w formularzu (zeskanowana etykieta maszyny, D51) — do huba idzie jej qr, nie to pole.
  const pusty = () => ({ stanowisko: null, linia: null, maszyna: null, qr: null, czas_rozpoczecia: null, zlecenie: '', zdjecie_zlecenia: null,
                         wyrob: '', sprawdzone: 0, braki: 0, wady: {}, zdjecia: [], wnioski: '', dzialania: '' });
  let f = pusty();
  // odrazu: skan (dowód obecności z godziną) i zdjęcie idą do telefonu natychmiast, nie po 300 ms —
  // przeładowanie albo padnięty telefon zaraz po skanie gubiły zeskanowane stanowisko (test w przeglądarce).
  const zapiszBrudnopis = odrazu => hala.brudnopis.zapisz(BRUDNOPIS, f, odrazu ? { odrazu: true } : undefined);
  /* Jedna linia bez stanowisk (D51): miejsce ustawia się samo, bez godziny startu — samo w sobie nie jest „rozpoczętą
     próbą” (czas_rozpoczecia ma tylko miejsce zeskanowane albo wybrane). */
  const miejsceDomyslne = () => { if (!f.linia) { const l = W.domyslneMiejsce(hala.slowniki); if (l) f.linia = l; } };
  const rozpoczeta = () => !!(f.stanowisko || f.czas_rozpoczecia || f.zlecenie || f.sprawdzone || f.braki || f.zdjecia.length || W.sumaWad(f.wady) ||
                               f.zdjecie_zlecenia || f.wyrob || (f.wnioski || '').trim() || (f.dzialania || '').trim());
  /* Pole liczby tak, jak je wpisano (W.liczbaZPola — to samo w korekcie): „12,5”, „-5”, „abc” zostają błędne. */
  const liczbaZPola = W.liczbaZPola;

  KJ.ekran('proba', {
    formularz: true,
    async rysuj(el, parametr) {
      if (!KJ.mozna('proba.zarejestrowana')) { el.innerHTML = '<p class="pusto">Próby rejestruje kontroler albo kierownik KJ.</p>'; return; }
      // Braki zawsze z wad (UI etap 2) — także w brudnopisie sprzed zmiany, gdzie wpisywało się je ręcznie.
      f = W.brakiZWad(Object.assign(pusty(), (await hala.brudnopis.odczytaj(BRUDNOPIS)) || {}));
      miejsceDomyslne();
      el.innerHTML = `
        <h1>Próba</h1>
        <form id="f-proba" class="formularz" autocomplete="off" novalidate>
          <section class="grupa" id="p-stanowisko"></section>
          <section class="grupa">
            <h2>Wyniki</h2>
            <div class="liczniki">
              ${KJ.licznik('sprawdzone', f.sprawdzone, 'Sprawdzone')}
              <div class="licznik-wyliczony"><span class="licznik-opis">Braki <span class="slaby">(suma wad)</span></span><output id="p-braki">${esc(f.braki)}</output></div>
            </div>
            <div class="zgodne" id="p-zgodne"></div>
          </section>
          <section class="grupa"><h2>Wady</h2><div class="wady" id="p-wady"></div></section>
          <section class="grupa"><h2>Zdjęcia wad</h2><div class="zdjecia" id="p-zdjecia"></div></section>
          <!-- UI etap 3: zlecenie i wyrób rzadko wpisywane na hali — zwinięte pod „Więcej”, żeby formularz był krótki;
               otwarte, gdy brudnopis już coś w nich ma. -->
          <details class="grupa wiecej-proby" ${W.wiecejProbyOtwarte(f) ? 'open' : ''}><summary>Więcej <span class="slaby">(zlecenie, wyrób — opcjonalnie)</span></summary>
            <label for="p-zlecenie">Zlecenie / partia</label>
            <div class="z-przyciskiem"><input id="p-zlecenie" name="zlecenie" value="${esc(f.zlecenie)}" placeholder="Numer z przewodnika" aria-label="Numer zlecenia">
              <button type="button" id="skanuj-zlecenie">Skanuj</button></div>
            <div id="p-zdjecie-zlecenia"></div>
            <label>Wyrób<select name="wyrob" id="p-wyrob"></select></label>
          </details>
          <details class="grupa" ${f.wnioski || f.dzialania ? 'open' : ''}><summary>Wnioski i działania <span class="slaby">(opcjonalnie)</span></summary>
            <label>Wnioski<textarea name="wnioski" rows="2" maxlength="2000">${esc(f.wnioski)}</textarea></label>
            <label>Działania<textarea name="dzialania" rows="2" maxlength="2000">${esc(f.dzialania)}</textarea></label>
          </details>
          <p class="blad" id="bledy-proby" hidden></p>
          <div class="przyciski-formularza">
            <button type="button" id="porzuc">Wyczyść</button>
            <button type="submit" class="glowny">Zapisz próbę</button>
          </div>
        </form>`;
      rysujStanowisko(el); rysujWyroby(el); rysujWyniki(el); rysujWady(el); rysujZdjecia(el); rysujZdjecieZlecenia(el);
      const form = el.querySelector('#f-proba');
      form.addEventListener('input', ev => zmianaPola(form, ev.target));
      KJ.przyZapisie(form, zapisz);
      el.querySelector('#porzuc').addEventListener('click', async () => {
        if (rozpoczeta() && !(await KJ.potwierdz('Wyczyścić próbę?', 'Wpisane liczby, wady i zdjęcia znikną.', 'Wyczyść'))) return;
        await hala.brudnopis.usun(BRUDNOPIS);
        KJ.idz('proba');
      });
      el.querySelector('#skanuj-zlecenie').addEventListener('click', skanujZlecenie);

      // #proba/skanuj (przycisk z planu) albo #proba/<stanowisko> (dotknięcie w planie) — od razu aparat.
      if (parametr) {
        history.replaceState(null, '', '#proba');
        KJ.biezacy.parametr = null;
        skanujStanowisko(parametr === 'skanuj' ? null : parametr);
      }
    },
    odswiez(el) { miejsceDomyslne(); rysujStanowisko(el); rysujWyroby(el); rysujWady(el); },   // słowniki mogły się zmienić
  });

  /* Miejsce kontroli: stanowisko, maszyna albo cała linia (D51 — zakład bez stanowisk). Lista „Wybierz z listy”
     zostaje też po wyborze miejsca: z nieczytelnym kodem inaczej nie dało się zmienić miejsca bez „Wyczyść”. */
  function rysujStanowisko(el) {
    const box = el.querySelector('#p-stanowisko');
    if (!box) return;
    const sl = hala.slowniki;
    const opcje = W.miejscaDoWyboru(sl);
    const lista = opcje.length > (f.linia ? 1 : 0) ? `<details class="bez-skanu"><summary>${f.linia ? 'Inne miejsce? Wybierz z listy' : 'Kod nieczytelny? Wybierz z listy'}</summary>
        <select id="p-wybor-stanowiska"><option value="">— wybierz —</option>
        ${opcje.map(o => `<option value="${esc(o.wartosc)}">${esc(o.opis)}</option>`).join('')}</select></details>` : '';
    if (!f.linia) {
      box.innerHTML = `<h2>Miejsce kontroli</h2>
        <button type="button" class="glowny szeroki duzy" data-akcja="skanuj-stanowisko">${esc(W.napisSkanu(sl))}</button>
        ${lista || '<p class="pusto">Brak linii w systemie — administrator zakłada je w Panelu (Administracja → Maszyny).</p>'}`;
      return;
    }
    const miejsce = W.nazwaMiejsca(sl, f), linia = W.nazwaLinii(sl, f.linia);
    box.innerHTML = `<h2>Miejsce kontroli</h2>
      <div class="wybrane-stanowisko">
        <div><b>${esc(miejsce)}</b>${miejsce === linia ? '' : ` <span class="slaby">${esc(linia)}</span>`}</div>
        <div class="slaby">${f.czas_rozpoczecia ? `Start ${esc(W.kiedy(f.czas_rozpoczecia, hala.teraz()))} · ` : ''}${f.qr ? '✓ zeskanowano' : '<span class="tekst-uwaga">bez skanu</span>'}</div>
        ${W.skanZInnejZmiany(f.czas_rozpoczecia, hala.zmianaTeraz()) ? '<div class="tekst-uwaga">Skan z innej zmiany — jeśli kontrola jest teraz, zeskanuj ponownie.</div>' : ''}
      </div>
      <button type="button" data-akcja="skanuj-stanowisko">${f.qr ? 'Zmień' : esc(W.napisSkanu(sl))}</button>
      ${lista}`;
  }

  function rysujWyroby(el) {
    const s = el.querySelector('#p-wyrob');
    if (!s) return;
    // Najpierw wyroby z linii stanowiska — tych kontroler szuka w 9 na 10 przypadków.
    const wszystkie = Object.entries(hala.slowniki.wyroby || {}).sort(([a], [b]) => a.localeCompare(b, 'pl'));
    const zLinii = wszystkie.filter(([, w]) => w.linia === f.linia), inne = wszystkie.filter(([, w]) => w.linia !== f.linia);
    const opcja = ([k, w]) => `<option value="${esc(k)}" ${f.wyrob === k ? 'selected' : ''}>${esc(k)} · ${esc(w.nazwa)}</option>`;
    s.innerHTML = '<option value="">— nie wiem / inny —</option>' +
      (zLinii.length && inne.length ? `<optgroup label="Ta linia">${zLinii.map(opcja).join('')}</optgroup><optgroup label="Inne">${inne.map(opcja).join('')}</optgroup>`
                                    : wszystkie.map(opcja).join(''));
  }

  function rysujWyniki(el) {
    const z = el.querySelector('#p-zgodne');
    if (!z) return;
    const spr = W.liczba(f.sprawdzone), br = W.liczba(f.braki);
    const p = W.podpowiedzPartii({ sprawdzone: spr, braki: br }, KJ.prog());
    const proc = spr > 0 ? Math.round(br * 1000 / spr) / 10 : null;
    z.innerHTML = `Zgodne: <b>${spr - br >= 0 ? spr - br : '—'}</b>${proc !== null ? ` · braki <b class="${p ? 'tekst-alarm' : ''}">${W.procent(proc)} %</b>` : ''}${p ? ` <span class="znacznik alarm">≥ ${esc(W.procent(KJ.prog()))} % — partia brakowa?</span>` : ''}`;
    const b = el.querySelector('#p-braki');
    if (b) b.textContent = br;
  }

  function rysujWady(el) {
    const box = el.querySelector('#p-wady');
    if (!box) return;
    const katalog = W.katalogWad(hala.slowniki);
    // Wada z brudnopisu, którą w międzyczasie wycofano z katalogu, zostaje widoczna — kontroler ją już policzył.
    for (const kod of Object.keys(f.wady)) if (!katalog.some(w => w.kod === kod) && f.wady[kod]) katalog.push({ kod, nazwa: kod + ' (wycofana)' });
    box.innerHTML = katalog.map(w => `
      <div class="wada ${f.wady[w.kod] ? 'wybrana' : ''}" data-wada="${esc(w.kod)}">
        <button type="button" class="wada-nazwa" data-wada-krok="1">${esc(w.nazwa)}</button>
        <div class="wada-licznik">
          <button type="button" data-wada-krok="-1" aria-label="Mniej: ${esc(w.nazwa)}">−</button>
          <span class="ile">${f.wady[w.kod] || 0}</span>
          <button type="button" data-wada-krok="1" aria-label="Więcej: ${esc(w.nazwa)}">+</button>
        </div>
      </div>`).join('') || '<p class="pusto">Katalog wad jest pusty.</p>';
  }

  function rysujZdjecia(el) {
    const box = el.querySelector('#p-zdjecia');
    if (!box) return;
    box.innerHTML = KJ.miniatury(f.zdjecia, true) + (f.zdjecia.length < W.MAKS_ZDJEC
      ? '<button type="button" class="zrob-zdjecie" data-akcja="zdjecie-wady"><span class="ikona" aria-hidden="true">📷</span>Dodaj</button>'
      : `<p class="slaby">Najwyżej ${W.MAKS_ZDJEC} zdjęć.</p>`);
    KJ.wypelnijZdjecia(box);
  }

  function rysujZdjecieZlecenia(el) {
    const box = el.querySelector('#p-zdjecie-zlecenia');
    if (!box) return;
    box.innerHTML = f.zdjecie_zlecenia
      ? `<div class="zdjecia" data-zdjecie-zlecenia>${KJ.miniatury([f.zdjecie_zlecenia], true)}</div>`
      : '<button type="button" data-akcja="zdjecie-zlecenia">📷 Zdjęcie przewodnika</button>';
    KJ.wypelnijZdjecia(box);
  }

  function zmianaPola(form, cel) {
    const d = new FormData(form);
    f.zlecenie = String(d.get('zlecenie') || '');
    f.wyrob = String(d.get('wyrob') || '');
    f.wnioski = String(d.get('wnioski') || '');
    f.dzialania = String(d.get('dzialania') || '');
    f.sprawdzone = liczbaZPola(d.get('sprawdzone'));
    f.braki = W.sumaWad(f.wady);                    // UI etap 2: braki tylko z kafelków wad
    if (cel && cel.id === 'p-wybor-stanowiska') {
      const m = cel.value && W.miejsceZWyboru(cel.value, hala.slowniki);
      if (m) ustawMiejsce(m);
      return;
    }
    rysujWyniki(KJ.$('ekran'));
    zapiszBrudnopis();
  }

  /* Braki = suma wad (UI etap 2). Wada dodana „+” ponad liczbę sprawdzonych podnosi sprawdzone, jak na kartce
     (wcześniej robił to „+” przy brakach) — wpisane z klawiatury „Sprawdzone” nie spada samo. */
  function ustawBraki() {
    const form = KJ.$('f-proba');
    f.braki = W.sumaWad(f.wady);
    if (W.liczba(f.braki) > W.liczba(f.sprawdzone)) { f.sprawdzone = f.braki; form.elements.sprawdzone.value = f.sprawdzone; }
  }

  document.addEventListener('click', async ev => {
    if (!KJ.biezacy || KJ.biezacy.nazwa !== 'proba') return;
    const el = KJ.$('ekran');
    const krok = ev.target.closest('[data-wada-krok]');
    if (krok) {
      const kod = krok.closest('[data-wada]').dataset.wada;
      const n = Math.max(0, (f.wady[kod] || 0) + (+krok.dataset.wadaKrok));
      if (n) f.wady[kod] = n; else delete f.wady[kod];
      // Każda policzona wada to brak — braki liczą się same z kafelków (w obie strony).
      ustawBraki();
      const kafel = krok.closest('[data-wada]');
      kafel.classList.toggle('wybrana', !!n);
      kafel.querySelector('.ile').textContent = n;
      rysujWyniki(el); zapiszBrudnopis();
      return;
    }
    const akcja = ev.target.closest('[data-akcja]');
    const usun = ev.target.closest('[data-usun-zdjecie]');
    if (usun) {
      const id = usun.dataset.usunZdjecie;
      if (usun.closest('[data-zdjecie-zlecenia]')) { f.zdjecie_zlecenia = null; rysujZdjecieZlecenia(el); }
      else { f.zdjecia = f.zdjecia.filter(x => x !== id); rysujZdjecia(el); }
      zapiszBrudnopis();
      return;
    }
    if (!akcja) return;
    if (akcja.dataset.akcja === 'skanuj-stanowisko') skanujStanowisko(null);
    // Zdjęcie zmniejsza się 0,5–2 s. Gdy w tym czasie próbę zapisano (albo wyczyszczono), zdjęcie NIE może
    // wskoczyć do następnej, pustej próby — sprawdzamy, czy formularz jest wciąż ten sam.
    const cel = f;
    if (akcja.dataset.akcja === 'zdjecie-wady') {
      if (f.zdjecia.length >= W.MAKS_ZDJEC) { KJ.komunikat(`Najwyżej ${W.MAKS_ZDJEC} zdjęć w jednej próbie.`, 'uwaga'); return; }
      const id = await KJ.zrobZdjecie();
      if (id && f === cel) { f.zdjecia.push(id); rysujZdjecia(KJ.$('ekran')); zapiszBrudnopis(true); }
    }
    if (akcja.dataset.akcja === 'zdjecie-zlecenia') {
      const id = await KJ.zrobZdjecie();
      if (id && f === cel) { f.zdjecie_zlecenia = id; rysujZdjecieZlecenia(KJ.$('ekran')); zapiszBrudnopis(true); }
    }
  });

  /* Skan stanowiska = dowód obecności: qr to zeskanowany tekst, czas_rozpoczecia
     to chwila skanu (KONTRAKT §10). Zapis do brudnopisu od razu — zanim kontroler
     zacznie liczyć sztuki, bo telefon może paść w trakcie.                     */
  async function skanujStanowisko(oczekiwane) {
    const tytul = oczekiwane ? `Zeskanuj: ${W.nazwaStanowiska(hala.slowniki, oczekiwane)}` : W.napisSkanu(hala.slowniki).replace('Skanuj', 'Zeskanuj');
    const t = await KJ.skanuj(tytul, 'Kod z etykiety');
    if (!t) return;
    // Stanowisko, maszyna (etykieta z Panelu, D51) albo linia; kod wpisany bez przedrostka przyjmujemy „bez skanu”.
    const m = W.miejsceZeSkanu(Hala.odczytajKod(t, hala.slowniki), hala.slowniki);
    if (m.blad) { KJ.komunikat(m.blad, 'alarm'); return; }
    if (oczekiwane && m.stanowisko !== oczekiwane) KJ.komunikat(`Zeskanowano inne miejsce: ${W.nazwaMiejsca(hala.slowniki, m)}`, 'uwaga');
    await ustawMiejsce(m);
  }

  /* Ustawia miejsce próby (ze skanu albo z listy) i godzinę startu. Zmiana miejsca przy wpisanych wynikach — pytanie. */
  async function ustawMiejsce(m) {
    const cel = f;
    const inne = (f.stanowisko || null) !== (m.stanowisko || null) || f.linia !== m.linia;
    if ((f.stanowisko || f.czas_rozpoczecia) && inne && (f.sprawdzone || W.sumaWad(f.wady)) &&
        !(await KJ.potwierdz('Inne miejsce?', `Wyniki wpisane dla „${W.nazwaMiejsca(hala.slowniki, f)}” przejdą na „${W.nazwaMiejsca(hala.slowniki, m)}”.`, 'Tak, zmień'))) {
      rysujStanowisko(KJ.$('ekran'));            // lista wyboru wraca do „— wybierz —”
      return;
    }
    if (f !== cel) return;                        // w trakcie pytania próbę zapisano albo wyczyszczono
    f.stanowisko = m.stanowisko || null; f.linia = m.linia; f.maszyna = m.maszyna || null; f.qr = m.qr || null;
    f.czas_rozpoczecia = new Date(hala.teraz()).toISOString();
    zapiszBrudnopis(true);
    const el = KJ.$('ekran');
    rysujStanowisko(el); rysujWyroby(el);
  }

  async function skanujZlecenie() {
    const t = await KJ.skanuj('Zeskanuj kod przewodnika', 'Numer zlecenia');
    if (!t) return;
    if (/^HALA:/i.test(t)) { KJ.komunikat('To kod maszyny (albo stanowiska). Zeskanuj kod kreskowy z przewodnika.', 'alarm'); return; }
    f.zlecenie = t;
    const form = KJ.$('f-proba');                  // kontroler mógł w tym czasie wyjść z ekranu próby
    if (form) form.elements.zlecenie.value = t;
    zapiszBrudnopis(true);
  }

  async function zapisz(form) {
    zmianaPola(form, null);
    f.braki = W.brakiZWad(f).braki;                // w miejscu — zdjęcie w drodze sprawdza, czy to wciąż ten sam formularz
    const bledy = W.bledyProby(f);
    const b = form.querySelector('#bledy-proby');
    b.hidden = !bledy.length;
    b.innerHTML = bledy.map(esc).join('<br>');
    if (bledy.length) { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (!f.zlecenie.trim() && !f.zdjecie_zlecenia &&
        !(await KJ.potwierdz('Bez zlecenia?', 'Bez numeru ani zdjęcia przewodnika tej próby nie da się połączyć z partią.', 'Zapisz bez zlecenia'))) {
      // Pole zlecenia jest zwinięte pod „Więcej” (UI etap 3) — po „Anuluj” otwieramy je, żeby było gdzie wpisać.
      const w = form.querySelector('.wiecej-proby');
      if (w) { w.open = true; form.elements.zlecenie.focus(); }
      return;
    }
    if (W.skanZInnejZmiany(f.czas_rozpoczecia, hala.zmianaTeraz()) &&
        !(await KJ.potwierdz('Skan z innej zmiany', `${f.stanowisko ? 'Stanowisko' : 'Miejsce'} zeskanowano ${W.kiedy(f.czas_rozpoczecia, hala.teraz())}. Próba policzy się do tamtej zmiany. Jeśli kontrola jest teraz — Anuluj i zeskanuj ponownie.`, 'Zapisz tak'))) return;
    const id = hala.nowyId();
    const dane = W.daneProby(f);
    if (!(await KJ.zapisz('proba.zarejestrowana', id, dane))) return;     // brudnopis zostaje — nic nie ginie
    await hala.brudnopis.usun(BRUDNOPIS);
    f = pusty();
    KJ.komunikat('Próba zapisana');
    const p = W.podpowiedzPartii(dane, KJ.prog());
    if (p && KJ.mozna('partia.oznaczona_brakowa')) await zaproponujPartie(id, dane, p);
    KJ.idz('plan');
  }

  // ------------------------------------------------------------ partia brakowa

  /* Podpowiedź progiem, decyzja człowieka (D13). Pola partii: zlecenie to TEKST
     (numer), a nie obiekt jak w próbie. „Oznacz brakową” i „Partia brakowa” są grafitowe (STYL-GK §1) — czerwień
     zostaje dla działań, które coś kasują (Wycofaj alert); oznaczenie partii to zwykła decyzja kontrolera.
     Na planie przy każdej próbie lidera przycisk jest obrysowany — kilka czerwonych pasów krzyczało jak alarm. */
  async function zaproponujPartie(idProby, proba, podpowiedz) {
    const w = await KJ.okno({
      tytul: podpowiedz ? `Braki ${W.procent(podpowiedz.proc)} % — oznaczyć partię jako brakową?` : 'Oznaczyć partię jako brakową?',
      tresc: `${podpowiedz ? `<p>Próg to ${esc(W.procent(podpowiedz.prog))} %. Partia pojawi się na Panelu Kierownika.</p>` : ''}
        <label>Powód<textarea name="powod" rows="3" maxlength="2000">${esc(W.powodPartii(proba, hala.slowniki))}</textarea></label>
        <label>Numer partii <span class="slaby">(opcjonalnie)</span><input name="partia"></label>
        <label>Ilość w partii, szt. <span class="slaby">(opcjonalnie)</span><input name="ilosc" inputmode="numeric" autocomplete="off"></label>`,
      // Pole tekstowe, nie type="number": przy „12,5” przeglądarka oddaje pusty napis i błąd przepadał po cichu.
      przyciski: [{ tekst: 'Nie oznaczaj', wartosc: false },
                  { tekst: 'Oznacz brakową', wartosc: true, glowny: true,
                    sprawdz: d => (String(d.get('powod') || '').trim() ? W.bladIlosci(d.get('ilosc')) : 'Wpisz powód.') }],
    });
    if (!w || !w.wartosc) return false;
    const dane = { linia: proba.linia, powod: String(w.dane.get('powod')).trim(), proba: idProby };
    const zl = proba.zlecenie && proba.zlecenie.numer;
    if (zl) dane.zlecenie = zl;
    if (proba.wyrob) dane.wyrob = proba.wyrob;
    const partia = String(w.dane.get('partia') || '').trim();
    if (partia) dane.partia = partia;
    if (String(w.dane.get('ilosc') || '').trim()) dane.ilosc = W.liczbaZPola(w.dane.get('ilosc'));   // sprawdzone w oknie
    if ((proba.zdjecia || []).length) dane.zdjecia = proba.zdjecia.slice();
    if (!(await KJ.zapisz('partia.oznaczona_brakowa', hala.nowyId(), dane))) return false;
    KJ.komunikat('Partia oznaczona jako brakowa', 'uwaga');
    return true;
  }

  KJ.ekran('partie', {
    zakladka: 'wiecej',
    rysuj(el) {
      const lista = W.listaPartii({ partie: hala.obiekty('partia'), slowniki: hala.slowniki });
      const aktywne = lista.filter(p => p.aktywna), zwolnione = lista.filter(p => !p.aktywna);
      el.innerHTML = `<h1>Partie brakowe</h1>
        <div class="lista">${aktywne.map(kartaPartii).join('') || '<p class="pusto ok">Brak partii brakowych</p>'}</div>
        ${zwolnione.length ? `<details class="archiwum"><summary>Zwolnione (${zwolnione.length})</summary><div class="lista">${zwolnione.map(kartaPartii).join('')}</div></details>` : ''}`;
    },
  });

  KJ.ekran('partia', {
    zakladka: 'plan',
    rysuj(el, id) {
      const p = hala.obiekt('partia', id);
      if (!p) { el.innerHTML = '<p class="pusto">Nie ma takiej partii. <a href="#plan">Wróć do planu</a></p>'; return; }
      const d = p.dane;
      el.innerHTML = `<a class="wstecz" href="#partie">‹ Partie brakowe</a>
        <div class="wiersz"><span class="znacznik ${p.status === 'brakowa' ? 'alarm' : 'neutral'}">${esc(W.numer(p))}</span><span class="slaby">${esc(p.etykieta)}</span></div>
        <h1>${esc(W.nazwaLinii(hala.slowniki, p.linia))}</h1>
        <dl class="szczegoly">
          ${d.zlecenie ? `<dt>Zlecenie</dt><dd>${esc(d.zlecenie)}</dd>` : ''}
          ${d.partia ? `<dt>Partia</dt><dd>${esc(d.partia)}</dd>` : ''}
          ${d.wyrob ? `<dt>Wyrób</dt><dd>${esc(d.wyrob)} ${esc(W.nazwaWyrobu(hala.slowniki, d.wyrob) || '')}</dd>` : ''}
          ${d.ilosc !== undefined ? `<dt>Ilość</dt><dd>${esc(d.ilosc)} szt.</dd>` : ''}
          <dt>Oznaczył</dt><dd>${esc(W.nazwaPracownika(hala.pracownicy, d.oznaczyl) || '—')} · ${esc(W.kiedy(d.czas_oznaczenia, hala.teraz()))}</dd>
          <dt>Powód</dt><dd>${esc(d.powod)}</dd>
          ${d.proba ? `<dt>Próba</dt><dd><a href="#wynik/${encodeURIComponent(d.proba)}">pokaż próbę</a></dd>` : ''}
          ${p.status === 'zwolniona' ? `<dt>Zwolniona</dt><dd>${esc(W.kiedy(d.czas_zwolnienia, hala.teraz()))}: ${esc(d.decyzja)}</dd>` : ''}
        </dl>
        <div class="zdjecia">${KJ.miniatury(d.zdjecia)}</div>
        ${p.status === 'brakowa' && KJ.mozna('partia.zwolniona') ? '<button type="button" id="zwolnij" class="szeroki">Zwolnij partię</button>' : ''}`;
      const b = el.querySelector('#zwolnij');
      if (b) b.addEventListener('click', async () => {
        const w = await KJ.okno({
          tytul: 'Zwolnić partię?',
          tresc: '<label>Decyzja<textarea name="decyzja" rows="3" maxlength="2000" placeholder="np. Po sortowaniu 100 %, wady usunięte"></textarea></label>',
          przyciski: [{ tekst: 'Anuluj', wartosc: false },
                      { tekst: 'Zwolnij', wartosc: true, glowny: true, sprawdz: d => (String(d.get('decyzja') || '').trim() ? null : 'Wpisz decyzję — trafi do historii partii.') }],
        });
        if (!w || !w.wartosc) return;
        if (!(await KJ.zapisz('partia.zwolniona', p.id, { decyzja: String(w.dane.get('decyzja')).trim() }))) return;
        KJ.komunikat('Partia zwolniona');
      });
    },
  });

  // ------------------------------------------------------------ wynik próby i korekta

  KJ.ekran('wynik', {
    zakladka: 'plan',
    rysuj(el, id) {
      const p = hala.obiekt('proba', id);
      if (!p) { el.innerHTML = '<p class="pusto">Nie ma takiej próby. <a href="#plan">Wróć do planu</a></p>'; return; }
      const d = p.dane;
      const partia = hala.obiekty('partia', x => x.dane.proba === id)[0];
      const proc = d.sprawdzone ? Math.round(d.braki * 1000 / d.sprawdzone) / 10 : null;
      // Miejsce: stanowisko, maszyna ze skanu albo cała linia (D51) — wcześniej bez stanowiska nagłówek był „—”.
      const miejsce = W.nazwaMiejsca(hala.slowniki, Object.assign({ linia: p.linia }, d)), linia = W.nazwaLinii(hala.slowniki, p.linia);
      el.innerHTML = `<a class="wstecz" href="#plan">‹ Plan</a>
        <div class="wiersz"><span class="znacznik ${d.zrodlo === 'kj' ? 'info' : 'neutral'}">${d.zrodlo === 'kj' ? 'Próba KJ' : 'Próba lidera'}</span>
          <span class="slaby">${esc(W.kiedy(d.czas_rozpoczecia || p.utworzono, hala.teraz()))} · ${esc(W.nazwaPracownika(hala.pracownicy, d.kontrolowal) || '')}</span>
          ${p._oczekuje ? '<span class="znacznik info">czeka na wysłanie</span>' : ''}</div>
        <h1>${esc(miejsce)}${miejsce === linia ? '' : ` <span class="slaby">${esc(linia)}</span>`}</h1>
        <div class="liczby-proby">
          <div><span>Sprawdzone</span><b>${esc(d.sprawdzone)}</b></div>
          <div><span>Zgodne</span><b>${esc(d.zgodne)}</b></div>
          <div class="${proc !== null && proc >= KJ.prog() ? 'alarm' : ''}"><span>Braki</span><b>${esc(d.braki)}</b>${proc !== null ? `<small>${String(proc).replace('.', ',')} %</small>` : ''}</div>
        </div>
        <dl class="szczegoly">
          <dt>Zlecenie</dt><dd>${esc((d.zlecenie || {}).numer || '—')}</dd>
          ${d.wyrob ? `<dt>Wyrób</dt><dd>${esc(d.wyrob)} ${esc(W.nazwaWyrobu(hala.slowniki, d.wyrob) || '')}</dd>` : ''}
          <dt>Wady</dt><dd>${(d.wady || []).map(w => `${esc(W.nazwaWady(hala.slowniki, w.kod))} ${esc(w.ilosc)}`).join(', ') || 'brak'}</dd>
          ${d.wnioski ? `<dt>Wnioski</dt><dd>${esc(d.wnioski)}</dd>` : ''}
          ${d.dzialania ? `<dt>Działania</dt><dd>${esc(d.dzialania)}</dd>` : ''}
          <dt>Skan</dt><dd>${d.qr ? '✓ ' + esc(d.qr) : 'bez skanu'}</dd>
          ${d.czas_korekty ? `<dt>Korekta</dt><dd>${esc(W.kiedy(d.czas_korekty, hala.teraz()))}</dd>` : ''}
          ${partia ? `<dt>Partia</dt><dd><a href="#partia/${encodeURIComponent(partia.id)}">${esc(W.numer(partia))} · ${esc(partia.etykieta)}</a></dd>` : ''}
        </dl>
        <div class="zdjecia">${KJ.miniatury([].concat(d.zlecenie && d.zlecenie.zdjecie ? [d.zlecenie.zdjecie] : [], d.zdjecia || []))}</div>
        <div class="przyciski-formularza">
          ${KJ.mozna('proba.skorygowana') ? '<button type="button" id="koryguj">Korekta</button>' : ''}
          ${!partia && d.braki > 0 && KJ.mozna('partia.oznaczona_brakowa') ? '<button type="button" id="oznacz" class="glowny">Partia brakowa</button>' : ''}
        </div>`;
      const k = el.querySelector('#koryguj');
      if (k) k.addEventListener('click', () => koryguj(p));
      const o = el.querySelector('#oznacz');
      if (o) o.addEventListener('click', W.raz(() => zaproponujPartie(p.id, Object.assign({ linia: p.linia }, d), W.podpowiedzPartii(d, KJ.prog()))));
    },
  });

  /* Korekta literówki: te same liczniki co przy zapisie, a do huba idą tylko pola,
     które się zmieniły (proba.skorygowana). Linia i stanowisko się nie zmieniają. */
  async function koryguj(p) {
    const d = p.dane;
    const wady = {};
    for (const w of d.wady || []) wady[w.kod] = w.ilosc;
    const katalog = W.katalogWad(hala.slowniki);
    for (const kod of Object.keys(wady)) if (!katalog.some(w => w.kod === kod)) katalog.push({ kod, nazwa: kod });
    // Te same liczby co przy zapisie próby (etap 3): „12,5” to błąd przy polu, a nie po cichu 12.
    const zFormularza = dane => W.korektaZFormularza(nazwa => dane.get(nazwa), katalog, p.linia);
    const w = await KJ.okno({
      tytul: 'Korekta próby',
      tresc: `<div class="liczniki">${KJ.licznik('sprawdzone', d.sprawdzone, 'Sprawdzone')}${KJ.licznik('braki', d.braki, 'Braki')}</div>
        <h3>Wady</h3><div class="liczniki-wad">${katalog.map(x => KJ.licznik('wada:' + x.kod, wady[x.kod] || 0, x.nazwa, true)).join('')}</div>
        <label>Wnioski<textarea name="wnioski" rows="2" maxlength="2000">${esc(d.wnioski || '')}</textarea></label>
        <label>Działania<textarea name="dzialania" rows="2" maxlength="2000">${esc(d.dzialania || '')}</textarea></label>`,
      przyciski: [{ tekst: 'Anuluj', wartosc: false },
                  { tekst: 'Zapisz korektę', wartosc: true, glowny: true, sprawdz: dane => W.bledyProby(zFormularza(dane)).join(' ') || null }],
    });
    if (!w || !w.wartosc) return;
    const zmiany = W.korektaProby(d, zFormularza(w.dane));
    if (!Object.keys(zmiany).length) { KJ.komunikat('Nic się nie zmieniło'); return; }
    if (!(await KJ.zapisz('proba.skorygowana', p.id, zmiany))) return;
    KJ.komunikat('Korekta zapisana');
  }
})(window.KJ);
