/* Formularze lidera: próba jakościowa, obsada, zdarzenie obsady, audyt BHP,
   zgłoszenie BHP, przekazanie zmiany i raport końcowy — plus ekran „Koniec”.

   Każdy formularz od pierwszego znaku leży w brudnopisie (L.formularz) i umie
   wstać po zamknięciu karty (L.oknaPoStarcie). Brudnopis znika dopiero, gdy
   zdarzenie jest w kolejce telefonu (await L.zapisz).                          */

(function () {
  'use strict';

  const L = window.Lider, hala = L.hala, W = L.W, esc = L.esc;
  const stale = () => (hala.kontrakt && hala.kontrakt.stale) || {};
  const liczba = v => (v === '' || v === null || v === undefined ? NaN : Number(v));

  /* Kontekst zmiany formularza (etap 1, granica zmiany): zmiana i linia ustalone PRZY OTWARCIU (ustalKontekst) leżą
     w parametrach okna — L.okno zapisuje je w brudnopisie, więc przeżywają przeładowanie karty. Wysyłka bierze
     wyłącznie ten kontekst (ctx), nigdy „teraz”: raport zaczęty 13:55 i wysłany 14:01 idzie do zmiany I.
     ctx(o) za każdym razem czyta świeży stan zmiany (pozycje, przekazanie) — zmienia się tylko stan, nie zmiana. */
  const ctx = o => {
    // Zapamiętanej zmiany nie da się odtworzyć (ktoś zmienił godziny zmian) → kontekst bez zmiany, a wysyłka zatrzymuje się
    // na brakZmiany. Wcześniej L.kontekst(null) brał po cichu bieżącą zmianę — raport zmiany I szedł do zmiany II.
    const z = W.zmianaFormularza(o.zmianaId, hala.slowniki.zmiany, hala.zmianaTeraz());
    return z ? L.kontekst(z, o.linia) : { linia: o.linia, zmiana: null, klucz: null, zl: null };
  };
  function ustalKontekst(o) {
    Object.assign(o, W.kontekstFormularza(o, hala.zmianaTeraz(), L.linia()));
    return ctx(o);
  }

  const opcjeStanowisk = (linia, wybrane) => `<option value="">— stanowisko —</option>` +
    W.stanowiskaLinii(hala.slowniki, linia).map(s =>
      `<option value="${esc(s.kod)}" ${s.kod === wybrane ? 'selected' : ''}>${esc(s.nazwa)} (${esc(s.kod)})</option>`).join('');

  function pokazBledy(form, bledy) {
    const ul = form.querySelector('.bledy');
    ul.hidden = !bledy.length;
    ul.innerHTML = bledy.map(b => `<li>${esc(b)}</li>`).join('');
    if (bledy.length) ul.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return !bledy.length;
  }

  function brakZmiany(k, o) {
    if (k.zmiana) return false;
    L.komunikat(o && o.zmianaId
      ? 'Godziny zmian się zmieniły i nie wiem, do której zmiany to zapisać. Zamknij okno i otwórz formularz jeszcze raz.'
      : 'Poza godzinami zmian — nie ma zmiany, do której można to zapisać.', 'blad');
    return true;
  }

  // ------------------------------------------------------------ próba jakościowa (KONTRAKT §6.3, D11, D12)

  async function formularzProby(opcje) {
    const o = opcje || {};
    const linia = ustalKontekst(o).linia;
    const f = await L.formularz(W.kluczBrudnopisuProby(linia, o.zmianaId, o.pozycja), {
      start: new Date(hala.teraz()).toISOString(), stanowisko: '', qr: o.qr || '', numer: '', zdjecieZlecenia: [], wyrob: '',
      sprawdzone: '', wady: {}, zdjecia: [], wnioski: '', dzialania: '' });
    const d = f.dane;
    if (o.qr && !d.qr) d.qr = o.qr;
    const wyroby = W.wyrobyLinii(hala.slowniki, linia);
    const wady = W.wadyDoProby(hala.slowniki);         // + „Brak / inna wada” — braki da się zaznaczyć bez katalogu (D56)
    // Od D51 maszyny nie mają stanowisk — linia bez stanowisk: zamiast pustej listy sam skan maszyny (dowód obecności).
    const zeStanowiskami = W.stanowiskaLinii(hala.slowniki, linia).length > 0;
    // UI etap 2: zlecenie, wnioski i działania rzadko się wypełnia — zwinięte pod „Więcej”. Rozwinięte, gdy brudnopis
    // już coś w nich ma (inaczej wpisane wcześniej słowa schowałyby się liderowi przed oczami).
    const wiecejOtwarte = !!(d.numer || (d.zdjecieZlecenia || []).length || d.wnioski || d.dzialania);
    L.okno({
      tytul: o.pozycja ? 'Próba jakościowa' : 'Dodatkowa próba', klucz: 'proba', parametry: o,
      html: `<form class="formularz" novalidate>
        ${zeStanowiskami ? `<label>Stanowisko
          <div class="rzad"><select name="stanowisko">${opcjeStanowisk(linia, d.stanowisko)}</select>
          <button type="button" data-skan="stanowisko" aria-label="Skanuj stanowisko albo maszynę">▣</button></div></label>`
          : '<button type="button" data-skan="stanowisko">▣ Skanuj QR maszyny</button>'}
        ${wyroby.length ? `<label>Wyrób<select name="wyrob"><option value="">—</option>${wyroby.map(w => `<option value="${esc(w.kod)}">${esc(w.kod)} ${esc(w.nazwa)}</option>`).join('')}</select></label>` : ''}
        <div class="liczby-proby">
          <label>Sprawdzone<input name="sprawdzone" type="number" inputmode="numeric" min="1" step="1"></label>
          <div class="liczba-wyliczona"><span>Braki</span><output class="braki">0</output></div>
          <div class="liczba-wyliczona"><span>Zgodne</span><output class="zgodne">—</output></div>
        </div>
        <fieldset><legend>Wady <span class="slaby">(braki = suma)</span></legend>
          <div class="wady">${wady.map(w => `<div class="wada" data-kod="${esc(w.kod)}"><span>${esc(w.nazwa)}</span>
            <button type="button" data-d="-1" aria-label="Mniej">−</button><b class="ile">0</b><button type="button" data-d="1" aria-label="Więcej">+</button></div>`).join('')
            }</div>
        </fieldset>
        <div class="pole-zdjec"></div>
        <details class="wiecej" ${wiecejOtwarte ? 'open' : ''}><summary>Więcej</summary>
          <fieldset><legend>Zlecenie</legend>
            <div class="pole-zlecenia"></div>
            <div class="rzad"><input name="numer" placeholder="Numer zlecenia (opcjonalnie)" autocapitalize="characters">
            <button type="button" data-skan="numer" aria-label="Skanuj numer zlecenia">▣</button></div>
          </fieldset>
          <label>Wnioski<textarea name="wnioski" rows="2" maxlength="2000"></textarea></label>
          <label>Działania korygujące<textarea name="dzialania" rows="2" maxlength="2000"></textarea></label>
        </details>
        <p class="slaby kod-obecnosci" ${d.qr ? '' : 'hidden'}>Kod obecności: ${esc(d.qr)}</p>
        <ul class="bledy" hidden></ul>
        <button type="submit" class="glowny szeroki duzy">Zapisz próbę</button>
      </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
        f.powiaz(form);
        L.poleZdjec(form.querySelector('.pole-zlecenia'), d.zdjecieZlecenia, () => f.zmieniono(), { maks: 1, etykieta: 'Zdjęcie przewodnika' });
        L.poleZdjec(form.querySelector('.pole-zdjec'), d.zdjecia, () => f.zmieniono(), { etykieta: 'Zdjęcie wadliwego detalu' });
        // Braki i zgodne tylko się pokazują (W.liczbyProby) — liczą się z kafelków wad i „Sprawdzone”.
        form.sprawdzone.addEventListener('input', () => rysujWady());
        function rysujWady() {
          for (const w of form.querySelectorAll('.wada')) {
            const n = d.wady[w.dataset.kod] || 0;
            w.querySelector('.ile').textContent = n;
            w.classList.toggle('jest', n > 0);
          }
          const l = W.liczbyProby(d.sprawdzone, d.wady);
          form.querySelector('output.braki').textContent = l.braki;
          form.querySelector('output.zgodne').textContent = Number.isInteger(l.zgodne) ? l.zgodne : '—';
        }
        form.querySelector('.wady').addEventListener('click', ev => {
          const b = ev.target.closest('[data-d]');
          if (!b) return;
          const kod = b.closest('.wada').dataset.kod;
          d.wady[kod] = Math.max(0, (d.wady[kod] || 0) + Number(b.dataset.d));
          if (!d.wady[kod]) delete d.wady[kod];
          f.zmieniono();
          rysujWady();
        });
        rysujWady();
        form.querySelectorAll('[data-skan]').forEach(b => b.addEventListener('click', async () => {
          if (b.dataset.skan === 'numer') {
            const t = await HalaSkaner.skanuj({ tytul: 'Zeskanuj numer zlecenia' });
            if (t) { d.numer = t; form.numer.value = t; f.zmieniono(); }
            return;
          }
          // Maszyna bez stanowiska (D51) to też dowód obecności — wcześniej „Ten kod nie wskazuje stanowiska” i skan przepadał.
          // Wpisany „WT-01” = skan HALA:M:WT-01; zły kod — skaner zostaje otwarty z błędem (L.skanujKod).
          const skan = await L.skanujKod({ tytul: zeStanowiskami ? 'Zeskanuj stanowisko albo maszynę' : 'Zeskanuj maszynę' },
            t => W.skanProby(Hala.odczytajKod(t, hala.slowniki), linia));
          if (!skan) return;
          const t = skan.tekst;
          d.qr = t;
          if (skan.stanowisko) { d.stanowisko = skan.stanowisko; if (form.stanowisko) form.stanowisko.value = skan.stanowisko; }
          const kodEl = form.querySelector('.kod-obecnosci');
          kodEl.textContent = 'Kod obecności: ' + t; kodEl.hidden = false;
          f.zmieniono();
        }));
        form.addEventListener('submit', W.przyWysylce(async ev => {
          ev.preventDefault();
          const lista = Object.entries(d.wady).filter(([, n]) => n > 0).map(([kod, ilosc]) => ({ kod, ilosc }));
          const l = W.liczbyProby(d.sprawdzone, d.wady);
          const dane = { sprawdzone: l.sprawdzone, zgodne: l.zgodne, braki: l.braki, wady: lista };
          if (!pokazBledy(form, W.sprawdzProbe(dane, hala.slowniki))) return;
          const id = hala.nowyId();
          const zd = await L.zapisz('proba.zarejestrowana', id, L.bezPustych(Object.assign({
            linia, stanowisko: d.stanowisko, qr: d.qr, czas_rozpoczecia: d.start,
            zlecenie: L.bezPustych({ numer: (d.numer || '').trim(), zdjecie: d.zdjecieZlecenia[0] }),
            wyrob: d.wyrob, zdjecia: d.zdjecia, wnioski: (d.wnioski || '').trim(), dzialania: (d.dzialania || '').trim() }, dane)));
          if (!zd) return;
          if (o.pozycja) await L.odhacz(o.pozycja, { proba: id, qr: d.qr }, ctx(o));
          await f.usun();
          L.zamknijOkno();
          L.poZapisie(`Próba zapisana: braki ${dane.braki} z ${dane.sprawdzone}`);
        }));
      },
    });
  }
  L.formularzProby = formularzProby;
  L.oknaPoStarcie.proba = formularzProby;

  // ------------------------------------------------------------ obsada

  async function formularzObsady(opcje) {
    const o = opcje || {};
    const k = ustalKontekst(o);
    if (brakZmiany(k)) return;
    // Planowana obsada zwykle się nie zmienia — podpowiadamy ostatnią z tej linii.
    const ostatnia = hala.obiekty('zmiana_linii', z => z.linia === k.linia && z.dane && z.dane.obsada && z.id !== k.klucz)[0];
    const teraz = k.zl && k.zl.dane && k.zl.dane.obsada;
    const f = await L.formularz('obsada:' + k.klucz, {
      planowana: teraz ? String(teraz.planowana) : ostatnia ? String(ostatnia.dane.obsada.planowana) : '',
      obecna: teraz ? String(teraz.obecna) : '', nieobecni: teraz ? (teraz.nieobecni || []).join('\n') : '', uwagi: teraz ? teraz.uwagi || '' : '' });
    const d = f.dane;
    L.okno({
      tytul: 'Obsada na początku zmiany', klucz: 'obsada', parametry: o,
      html: `<form class="formularz" novalidate>
        <div class="liczby-proby">
          <label>Planowana<input name="planowana" type="number" inputmode="numeric" min="0" step="1"></label>
          <label>Obecna<input name="obecna" type="number" inputmode="numeric" min="0" step="1"></label>
        </div>
        <p class="roznica slaby"></p>
        <label>Nieobecni (każdy w osobnej linii)<textarea name="nieobecni" rows="3"></textarea></label>
        <label>Uwagi<textarea name="uwagi" rows="2" maxlength="1000"></textarea></label>
        <ul class="bledy" hidden></ul>
        <button type="submit" class="glowny szeroki duzy">Wyślij obsadę</button>
      </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
        f.powiaz(form);
        const roznica = () => {
          const p = liczba(d.planowana), ob = liczba(d.obecna);
          form.querySelector('.roznica').textContent = Number.isInteger(p) && Number.isInteger(ob) && p !== ob
            ? (ob < p ? `Brakuje: ${W.liczebnik(p - ob, 'osoba', 'osoby', 'osób')}` : `Ponad plan: ${W.liczebnik(ob - p, 'osoba', 'osoby', 'osób')}`) : '';
        };
        form.addEventListener('input', roznica);
        roznica();
        form.addEventListener('submit', W.przyWysylce(async ev => {
          ev.preventDefault();
          const p = liczba(d.planowana), ob = liczba(d.obecna);
          const bledy = [];
          if (!Number.isInteger(p) || p < 0) bledy.push('Wpisz planowaną liczbę osób.');
          if (!Number.isInteger(ob) || ob < 0) bledy.push('Wpisz, ile osób jest obecnych.');
          if (!pokazBledy(form, bledy)) return;
          const kk = ctx(o);
          if (brakZmiany(kk, o)) return;
          const zd = await L.zapisz('obsada.zgloszona', kk.klucz, L.bezPustych({
            linia: kk.linia, zmiana: kk.zmiana.id, planowana: p, obecna: ob,
            nieobecni: String(d.nieobecni || '').split('\n').map(s => s.trim()).filter(Boolean), uwagi: (d.uwagi || '').trim() }));
          if (!zd) return;
          await L.odhaczTyp('obsada', o.pozycja, { qr: o.qr }, ctx(o));
          await f.usun();
          L.zamknijOkno();
          L.poZapisie(`Obsada: ${ob} z ${p}`);
        }));
      },
    });
  }
  L.formularzObsady = formularzObsady;
  L.oknaPoStarcie.obsada = formularzObsady;

  async function formularzZdarzeniaObsady(opcje) {
    const o = opcje || {};
    const k = ustalKontekst(o);
    if (brakZmiany(k)) return;
    // Brudnopis na tę zmianę — wczorajszy porzucony nie wstaje dziś (jak awaria i próba).
    const f = await L.formularz(W.kluczBrudnopisu('obsada-zd', k.linia, o.zmianaId), { rodzaj: '', pracownik: '', na_linie: '', opis: '' });
    const d = f.dane;
    // Jedna linia (D51): bez „Przesunięcie między liniami” — lista „Na linię” byłaby pusta.
    const rodzaje = W.rodzajeZdarzenObsady(stale(), hala.slowniki);
    const linie = W.liniePosortowane(hala.slowniki).filter(l => l.kod !== k.linia);
    L.okno({
      tytul: 'Zdarzenie obsady', klucz: 'obsada-zd', parametry: o,
      html: `<form class="formularz" novalidate>
        <div class="siatka-wyboru" data-grupa="rodzaj">${rodzaje.map(r => `<button type="button" data-wartosc="${esc(r.kod)}">${esc(r.nazwa)}</button>`).join('')}</div>
        <label>Kto<input name="pracownik" maxlength="120" placeholder="Imię i nazwisko"></label>
        <label class="na-linie">Na linię<select name="na_linie"><option value="">—</option>${linie.map(l => `<option value="${esc(l.kod)}">${esc(l.kod)} ${esc(l.nazwa)}</option>`).join('')}</select></label>
        <label>Opis<textarea name="opis" rows="2" maxlength="1000"></textarea></label>
        <ul class="bledy" hidden></ul>
        <button type="submit" class="glowny szeroki duzy">Zapisz</button>
      </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
        f.powiaz(form);
        const g = form.querySelector('[data-grupa]');
        const zaznacz = () => {
          g.querySelectorAll('[data-wartosc]').forEach(b => b.classList.toggle('wybrany', b.dataset.wartosc === d.rodzaj));
          form.querySelector('.na-linie').hidden = d.rodzaj !== 'przesuniecie';
        };
        g.addEventListener('click', ev => {
          const b = ev.target.closest('[data-wartosc]');
          if (!b) return;
          d.rodzaj = b.dataset.wartosc; f.zmieniono(); zaznacz();
        });
        zaznacz();
        form.addEventListener('submit', W.przyWysylce(async ev => {
          ev.preventDefault();
          if (!pokazBledy(form, d.rodzaj ? [] : ['Wybierz, co się stało.'])) return;
          const kk = ctx(o);
          if (brakZmiany(kk, o)) return;
          const zd = await L.zapisz('obsada.zdarzenie', kk.klucz, L.bezPustych({
            linia: kk.linia, zmiana: kk.zmiana.id, rodzaj: d.rodzaj, pracownik: (d.pracownik || '').trim(),
            na_linie: d.rodzaj === 'przesuniecie' ? d.na_linie : '', opis: (d.opis || '').trim() }));
          if (!zd) return;
          await f.usun();
          L.zamknijOkno();
          L.poZapisie('Zdarzenie obsady zapisane');
        }));
      },
    });
  }
  L.formularzZdarzeniaObsady = formularzZdarzeniaObsady;
  L.oknaPoStarcie['obsada-zd'] = formularzZdarzeniaObsady;

  // ------------------------------------------------------------ BHP

  async function formularzAudytuBhp(opcje) {
    const o = opcje || {};
    const k = ustalKontekst(o);
    if (brakZmiany(k)) return;
    // Punkty audytu: maszyny linii (od D51 tylko je wyznacza Panel), linia bez maszyn — stanowiska (W.punktyAudytuBhp).
    const stanowiska = W.punktyAudytuBhp(hala.slowniki, k.linia);
    const f = await L.formularz('audyt:' + k.klucz, { oceny: {}, uwagi: '' });
    const d = f.dane;
    L.okno({
      tytul: 'Audyt BHP', klucz: 'audyt', parametry: o,
      html: `<form class="formularz" novalidate>
        <ul class="audyt">${stanowiska.map(s => `<li data-st="${esc(s.kod)}">
          <div class="nazwa-st">${esc(s.nazwa)} <span class="slaby">${esc(s.kod)}</span></div>
          <div class="przelacznik"><button type="button" data-z="1">Zgodne</button><button type="button" data-z="0">Niezgodne</button></div>
          <input class="uwagi-st" placeholder="Co jest nie tak?" maxlength="500" hidden></li>`).join('')
          || '<li class="slaby">Linia nie ma maszyn ani stanowisk w słowniku — wpisz uwagi ogólne.</li>'}</ul>
        <label>Uwagi ogólne<textarea name="uwagi" rows="2" maxlength="2000"></textarea></label>
        <ul class="bledy" hidden></ul>
        <button type="submit" class="glowny szeroki duzy">Zapisz audyt</button>
      </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
        f.powiaz(form);
        const rysuj = () => {
          for (const li of form.querySelectorAll('[data-st]')) {
            const oc = d.oceny[li.dataset.st] || {};
            li.querySelector('[data-z="1"]').classList.toggle('wybrany', oc.zgodne === true);
            li.querySelector('[data-z="0"]').classList.toggle('wybrany-alarm', oc.zgodne === false);
            const u = li.querySelector('.uwagi-st');
            u.hidden = oc.zgodne !== false;
            if (document.activeElement !== u) u.value = oc.uwagi || '';
          }
        };
        form.querySelector('.audyt').addEventListener('click', ev => {
          const b = ev.target.closest('[data-z]');
          if (!b) return;
          const st = b.closest('[data-st]').dataset.st;
          d.oceny[st] = Object.assign({}, d.oceny[st], { zgodne: b.dataset.z === '1' });
          f.zmieniono(); rysuj();
          if (b.dataset.z === '0') b.closest('[data-st]').querySelector('.uwagi-st').focus();
        });
        form.querySelector('.audyt').addEventListener('input', ev => {
          const li = ev.target.closest('[data-st]');
          if (!li || !ev.target.classList.contains('uwagi-st')) return;
          d.oceny[li.dataset.st] = Object.assign({}, d.oceny[li.dataset.st], { uwagi: ev.target.value });
          f.zmieniono();
        });
        rysuj();
        form.addEventListener('submit', W.przyWysylce(async ev => {
          ev.preventDefault();
          const brak = stanowiska.filter(s => typeof (d.oceny[s.kod] || {}).zgodne !== 'boolean');
          if (!pokazBledy(form, brak.length ? [`Oceń wszystkie punkty (brakuje: ${brak.map(s => s.kod).join(', ')}).`] : [])) return;
          // Pole pozycji według punktu: { maszyna } albo { stanowisko } (W.punktyAudytuBhp).
          const pozycje = stanowiska.map(s => L.bezPustych({ [s.pole]: s.kod, zgodne: d.oceny[s.kod].zgodne, uwagi: (d.oceny[s.kod].uwagi || '').trim() }));
          const kk = ctx(o);
          if (brakZmiany(kk, o)) return;
          const zd = await L.zapisz('bhp.audyt', kk.klucz, L.bezPustych({ linia: kk.linia, zmiana: kk.zmiana.id, pozycje, uwagi: (d.uwagi || '').trim() }));
          if (!zd) return;
          await L.odhaczTyp('bhp', o.pozycja, { qr: o.qr }, ctx(o));
          await f.usun();
          const niezgodne = stanowiska.filter(s => d.oceny[s.kod].zgodne === false);
          L.zamknijOkno();
          L.poZapisie(niezgodne.length ? `Audyt zapisany — niezgodne: ${niezgodne.length}` : 'Audyt zapisany — wszystko zgodne');
          if (niezgodne.length) {
            // Odstępstwo z audytu od razu jako zgłoszenie BHP (z numerem BHP-…), żeby ktoś je zamknął. zAudytu = id zdarzenia
            // audytu: własny brudnopis, więc stary brudnopis „+ Zgłoszenie BHP” nie przykryje niezgodności (audyt 2026-10-12).
            formularzBhp({ linia: kk.linia, zmianaId: o.zmianaId, zAudytu: zd.id || hala.nowyId(), stanowisko: niezgodne[0].stanowisko, rodzaj: 'odstepstwo',
                           opis: niezgodne.map(s => `${s.kod}: ${(d.oceny[s.kod].uwagi || '').trim() || 'niezgodne'}`).join('\n') });
          }
        }));
      },
    });
  }
  L.formularzAudytuBhp = formularzAudytuBhp;
  L.oknaPoStarcie.audyt = formularzAudytuBhp;

  async function formularzBhp(opcje) {
    const o = opcje || {};
    const linia = ustalKontekst(o).linia;
    // Zgłoszenie z audytu ma własny brudnopis (zAudytu) — wcześniej stary brudnopis 'bhp:<linia>' wygrywał z niezgodnościami
    // podanymi przez audyt. Zwykłe zgłoszenie: brudnopis na tę zmianę.
    const f = await L.formularz(W.kluczBrudnopisu('bhp', linia, o.zmianaId, o.zAudytu ? 'audyt-' + o.zAudytu : ''),
      { rodzaj: o.rodzaj || '', stanowisko: o.stanowisko || '', opis: o.opis || '', zdjecia: [] });
    const d = f.dane;
    const rodzaje = stale().rodzaje_bhp || [];
    // Linia bez stanowisk (D51 — same maszyny): bez pustej listy „— stanowisko —”, której i tak nie dało się wypełnić.
    L.okno({
      tytul: 'Zgłoszenie BHP', klucz: 'bhp', parametry: o,
      html: `<form class="formularz" novalidate>
        <div class="siatka-wyboru" data-grupa="rodzaj">${rodzaje.map(r => `<button type="button" data-wartosc="${esc(r.kod)}">${esc(r.nazwa)}</button>`).join('')}</div>
        ${W.stanowiskaLinii(hala.slowniki, linia).length ? `<label>Stanowisko<select name="stanowisko">${opcjeStanowisk(linia, d.stanowisko)}</select></label>` : ''}
        <label>Opis<textarea name="opis" rows="3" maxlength="4000" placeholder="Co się stało albo co grozi?"></textarea></label>
        <div class="pole-zdjec"></div>
        <ul class="bledy" hidden></ul>
        <button type="submit" class="alarm szeroki duzy">Zgłoś</button>
      </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
        f.powiaz(form);
        const g = form.querySelector('[data-grupa]');
        const zaznacz = () => g.querySelectorAll('[data-wartosc]').forEach(b => b.classList.toggle('wybrany', b.dataset.wartosc === d.rodzaj));
        g.addEventListener('click', ev => {
          const b = ev.target.closest('[data-wartosc]');
          if (!b) return;
          d.rodzaj = b.dataset.wartosc; f.zmieniono(); zaznacz();
        });
        zaznacz();
        L.poleZdjec(form.querySelector('.pole-zdjec'), d.zdjecia, () => f.zmieniono());
        form.addEventListener('submit', W.przyWysylce(async ev => {
          ev.preventDefault();
          const bledy = [];
          if (!d.rodzaj) bledy.push('Wybierz rodzaj zgłoszenia.');
          if (!String(d.opis || '').trim()) bledy.push('Opisz, co się stało.');
          if (!pokazBledy(form, bledy)) return;
          const zd = await L.zapisz('bhp.zgloszenie', hala.nowyId(), L.bezPustych({
            linia, stanowisko: d.stanowisko, rodzaj: d.rodzaj, opis: d.opis.trim(), zdjecia: d.zdjecia }));
          if (!zd) return;
          await f.usun();
          L.zamknijOkno();
          L.poZapisie('Zgłoszenie BHP zapisane');
        }));
      },
    });
  }
  L.formularzBhp = formularzBhp;
  L.oknaPoStarcie.bhp = formularzBhp;

  // ------------------------------------------------------------ przekazanie zmiany

  function stanMaszyn(linia) {
    return W.awarie(hala.obiekty('awaria', a => a.aktywny), { linia, teraz: hala.teraz(), slowniki: hala.slowniki,
      pracownicy: hala.pracownicy, stale: stale() })
      .map(w => `${w.maszyna} ${w.maszynaNazwa} — ${w.etykieta}${w.numer !== '—' ? ` (${w.numer})` : ''}`).join('\n');
  }

  async function formularzPrzekazania(opcje) {
    const o = opcje || {};
    const k = ustalKontekst(o);
    if (brakZmiany(k)) return;
    const bylo = (k.zl && k.zl.dane && k.zl.dane.przekazanie) || null;
    const f = await L.formularz('przekazanie:' + k.klucz, bylo
      ? { maszyny: bylo.maszyny || '', braki_materialowe: bylo.braki_materialowe || '', do_dokonczenia: bylo.do_dokonczenia || '', inne: bylo.inne || '' }
      : { maszyny: stanMaszyn(k.linia), braki_materialowe: '', do_dokonczenia: '', inne: '' });
    const d = f.dane;
    L.okno({
      tytul: 'Przekazanie zmiany', klucz: 'przekazanie', parametry: o,
      html: `<form class="formularz" novalidate>
        <p class="slaby">${esc(W.opisZmiany(k.zmiana.id, hala.slowniki))}${W.wieleLinii(hala.slowniki) ? ' · ' + esc(k.linia) : ''}${bylo ? ' · już wysłane — możesz poprawić' : ''}</p>
        <label>Stan maszyn<textarea name="maszyny" rows="3" maxlength="4000"></textarea></label>
        <label>Braki materiałowe<textarea name="braki_materialowe" rows="2" maxlength="4000"></textarea></label>
        <label>Do dokończenia<textarea name="do_dokonczenia" rows="2" maxlength="4000"></textarea></label>
        <label>Inne<textarea name="inne" rows="2" maxlength="4000"></textarea></label>
        <button type="submit" class="glowny szeroki duzy">Wyślij przekazanie</button>
      </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
        f.powiaz(form);
        form.addEventListener('submit', W.przyWysylce(async ev => {
          ev.preventDefault();
          const zd = await L.zapisz('zmiana.przekazanie', k.klucz, Object.assign({ linia: k.linia, zmiana: k.zmiana.id },
            L.bezPustych({ maszyny: d.maszyny.trim(), braki_materialowe: d.braki_materialowe.trim(), do_dokonczenia: d.do_dokonczenia.trim(), inne: d.inne.trim() })));
          if (!zd) return;
          await L.odhaczTyp('przekazanie', o.pozycja, { qr: o.qr }, ctx(o));
          await f.usun();
          L.zamknijOkno();
          L.poZapisie('Przekazanie wysłane');
        }));
      },
    });
  }
  L.formularzPrzekazania = formularzPrzekazania;
  L.oknaPoStarcie.przekazanie = formularzPrzekazania;

  // ------------------------------------------------------------ raport końcowy (KONTRAKT §6.4)

  function zbudujRaport(k, uwagi) {
    return W.raport({
      linia: k.linia, zmiana: k.zmiana, teraz: hala.teraz(), lider: hala.pracownik && hala.pracownik.id,
      zmianaLinii: k.zl, awarie: hala.obiekty('awaria'), proby: hala.obiekty('proba'),
      alerty: hala.obiekty('alert'), bhp: hala.obiekty('bhp_zgloszenie'), uwagi });
  }

  /* Podgląd dla lidera: nazwy pozycji zamiast id (w zdarzeniu zostają id — tak chce §6.4). */
  function opisRaportu(r, k) {
    const nazwy = {};
    for (const p of ((k.zl && k.zl.dane) || {}).pozycje || []) nazwy[p.id] = p.nazwa;
    const n = ids => esc(ids.map(id => nazwy[id] || id).join(', '));
    // Test właściciela 2026-10-13: „po terminie” mieszało zrobione z opóźnieniem (✔ późno) z niezrobionymi — lider nie
    // wiedział, czego naprawdę brakuje. W zdarzeniu zostaje jedna lista opoznione (§6.4); tu dzielimy ją na dwie.
    const wyk = ((k.zl && k.zl.dane) || {}).wykonane || {};
    const brak = r.checklista.opoznione.filter(id => !wyk[id]), pozno = r.checklista.opoznione.filter(id => wyk[id]);
    return `<dl class="dane raport">
      <dt>Obsada</dt><dd>${r.obsada.obecna ?? '—'} z ${r.obsada.planowana ?? '—'}${r.obsada.zdarzenia ? ` · zdarzeń: ${r.obsada.zdarzenia}` : ''}</dd>
      <dt>Checklista</dt><dd>${r.checklista.zrobione}/${r.checklista.wszystkie}${brak.length ? ` · <span class="tekst-alarm">niezrobione: ${n(brak)}</span>` : ''}${pozno.length ? ` · zrobione po terminie: ${n(pozno)}` : ''}${r.checklista.pominiete.length ? ` · pominięte: ${n(r.checklista.pominiete)}` : ''}</dd>
      <dt>Awarie</dt><dd>${r.awarie.map(a => `${esc(a.maszyna)} ${esc(a.numer || '—')} · ${esc(hala.etykieta('awaria', a.status))} · ${esc(Hala.formatCzasu(a.przestoj_min * 60000))}`).join('<br>') || 'brak'}</dd>
      <dt>Próby</dt><dd>${r.proby.liczba ? `${r.proby.liczba} · sprawdzone ${r.proby.sprawdzone} · braki ${r.proby.braki}` : 'brak'}</dd>
      <dt>Alerty potwierdzone</dt><dd>${r.alerty_potwierdzone.length}</dd>
      <dt>Zgłoszenia BHP</dt><dd>${r.bhp.zgloszenia}</dd>
    </dl>`;
  }

  async function oknoRaportu(opcje) {
    const o = opcje || {};
    const k = ustalKontekst(o);
    if (brakZmiany(k)) return;
    const f = await L.formularz('raport:' + k.klucz, { uwagi: (k.zl && k.zl.dane && k.zl.dane.raport && k.zl.dane.raport.uwagi) || '' });
    const r = zbudujRaport(k, f.dane.uwagi);
    const bezPrzekazania = !(k.zl && k.zl.dane && k.zl.dane.przekazanie);
    const wyslany = k.zl && k.zl.status === 'zamknieta';
    L.okno({
      tytul: 'Raport końcowy', klucz: 'raport', parametry: o,
      html: `<p class="slaby">${esc(W.opisZmiany(k.zmiana.id, hala.slowniki))} · ${esc(W.nazwaLinii(hala.slowniki, k.linia))}</p>
        ${wyslany ? `<p class="ok-tekst">Raport wysłany ${esc(W.godzina(k.zl.dane.czas_zamkniecia))}. Możesz wysłać poprawiony.</p>` : ''}
        ${bezPrzekazania ? `<div class="ostrzezenie">Nie ma przekazania zmiany dla następnego lidera.
            <button type="button" data-a="przekazanie">Najpierw przekazanie</button></div>` : ''}
        ${opisRaportu(r, k)}
        <form class="formularz">
          <label>Uwagi dla kierownika<textarea name="uwagi" rows="3" maxlength="2000"></textarea></label>
          <button type="submit" class="glowny szeroki duzy">${wyslany ? 'Wyślij poprawiony raport' : 'Wyślij raport i zamknij zmianę'}</button>
        </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
        f.powiaz(form);
        const p = el.querySelector('[data-a=przekazanie]');
        if (p) p.addEventListener('click', () => formularzPrzekazania({ zmianaId: o.zmianaId, linia: o.linia }));
        form.addEventListener('submit', W.przyWysylce(async ev => {
          ev.preventDefault();
          const kk = ctx(o);
          if (brakZmiany(kk, o)) return;
          const zd = await L.zapisz('zmiana.raport', kk.klucz, { linia: kk.linia, zmiana: kk.zmiana.id, podsumowanie: zbudujRaport(kk, f.dane.uwagi) });
          if (!zd) return;
          await f.usun();
          L.zamknijOkno();
          L.poZapisie('Raport wysłany do kierownika');
        }));
      },
    });
  }
  L.oknoRaportu = oknoRaportu;
  L.oknaPoStarcie.raport = oknoRaportu;

  // ------------------------------------------------------------ ekran „Koniec”

  function kartaKonca(k, tytul) {
    const d = (k.zl && k.zl.dane) || {};
    const r = zbudujRaport(k, '');
    // Zawsze id tej karty (audyt 2026-10-12): z pustym id „Ta zmiana” narysowana 13:59:50 i dotknięta 14:00:05 otwierała
    // raport zmiany II, choć karta mówiła o zmianie I.
    const zmianaId = k.zmiana.id;
    // Zaległy raport wysyła każdy lider tej linii albo mistrz — niech widzi, czyją zmianę zamyka.
    const otworzyl = d.lider && d.lider !== (hala.pracownik && hala.pracownik.id) ? W.nazwaPracownika(hala.pracownicy, d.lider) : '';
    return `<article class="karta koniec">
      <h2>${esc(tytul)}</h2>
      <p class="slaby">${esc(W.opisZmiany(k.zmiana.id, hala.slowniki))} · ${esc(W.nazwaLinii(hala.slowniki, k.linia))}${otworzyl ? ` · otworzył ${esc(otworzyl)}` : ''}</p>
      <ul class="lista">
        <li class="wiersz"><span class="tresc">Checklista</span><span class="znacznik ${r.checklista.zrobione === r.checklista.wszystkie && r.checklista.wszystkie ? 'ok' : 'uwaga'}">${r.checklista.zrobione}/${r.checklista.wszystkie}</span></li>
        <li class="wiersz"><span class="tresc">Awarie</span><span class="znacznik ${r.awarie.length ? 'alarm' : 'ok'}">${r.awarie.length}</span></li>
        <li class="wiersz"><span class="tresc">Próby</span><span class="znacznik neutral">${r.proby.liczba}</span></li>
        <li class="wiersz"><span class="tresc">Przekazanie</span>${d.przekazanie ? `<span class="znacznik ok">wysłane ${esc(W.godzina(d.czas_przekazania))}</span>` : '<span class="znacznik uwaga">brak</span>'}</li>
        <li class="wiersz"><span class="tresc">Raport</span>${k.zl && k.zl.status === 'zamknieta' ? `<span class="znacznik ok">wysłany ${esc(W.godzina(d.czas_zamkniecia))}</span>` : '<span class="znacznik uwaga">niewysłany</span>'}</li>
      </ul>
      <div class="przyciski-kolumna">
        <button type="button" data-a="przekazanie" data-zmiana="${esc(zmianaId)}" data-linia="${esc(k.linia)}">Przekazanie zmiany</button>
        <button type="button" class="glowny" data-a="raport" data-zmiana="${esc(zmianaId)}" data-linia="${esc(k.linia)}">Raport końcowy</button>
      </div>
    </article>`;
  }

  L.ekrany.koniec = {
    rysuj(el) {
      const k = L.kontekst();
      // Zmiany tej linii bez raportu z ostatnich 24 h — każdy lider tej linii albo mistrz może je zamknąć (W.zalegleRaporty).
      const zalegle = W.zalegleRaporty(hala.obiekty('zmiana_linii'), { linia: k.linia, teraz: hala.teraz(), zmiany: hala.slowniki.zmiany,
                                                                        pracownik: hala.pracownik, kontrakt: hala.kontrakt });
      el.innerHTML = zalegle.map(x => kartaKonca(L.kontekst(x.zmiana, k.linia), 'Zmiana bez raportu')).join('')
        + (k.zmiana ? kartaKonca(k, 'Ta zmiana') : '<p class="pusto">Poza godzinami zmian.</p>');
    },
  };
  L.$('ekran-koniec').addEventListener('click', ev => {
    const b = ev.target.closest('[data-a]');
    if (!b) return;
    const o = { zmianaId: b.dataset.zmiana || undefined, linia: b.dataset.linia || undefined };
    if (b.dataset.a === 'przekazanie') formularzPrzekazania(o); else oknoRaportu(o);
  });
})();
