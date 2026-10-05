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
  const ctx = o => L.kontekst(o.zmianaId ? W.zmianaPoId(o.zmianaId, hala.slowniki.zmiany) : null, o.linia);
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

  function brakZmiany(k) {
    if (k.zmiana) return false;
    L.komunikat('Poza godzinami zmian — nie ma zmiany, do której można to zapisać.', 'blad');
    return true;
  }

  // ------------------------------------------------------------ próba jakościowa (KONTRAKT §6.3, D11, D12)

  async function formularzProby(opcje) {
    const o = opcje || {};
    const linia = ustalKontekst(o).linia;
    const f = await L.formularz(`proba:${linia}:${o.pozycja || 'dodatkowa'}`, {
      start: new Date(hala.teraz()).toISOString(), stanowisko: '', qr: o.qr || '', numer: '', zdjecieZlecenia: [], wyrob: '',
      sprawdzone: '', zgodne: '', braki: '', zgodneAuto: true, wady: {}, zdjecia: [], wnioski: '', dzialania: '' });
    const d = f.dane;
    if (o.qr && !d.qr) d.qr = o.qr;
    const wyroby = W.wyrobyLinii(hala.slowniki, linia);
    const wady = W.katalogWad(hala.slowniki);
    L.okno({
      tytul: o.pozycja ? 'Próba jakościowa' : 'Dodatkowa próba', klucz: 'proba', parametry: o,
      html: `<form class="formularz" novalidate>
        <label>Stanowisko
          <div class="rzad"><select name="stanowisko">${opcjeStanowisk(linia, d.stanowisko)}</select>
          <button type="button" data-skan="stanowisko" aria-label="Skanuj stanowisko">📷</button></div></label>
        <fieldset><legend>Zlecenie</legend>
          <div class="pole-zlecenia"></div>
          <div class="rzad"><input name="numer" placeholder="Numer zlecenia (opcjonalnie)" autocapitalize="characters">
          <button type="button" data-skan="numer" aria-label="Skanuj numer zlecenia">📷</button></div>
        </fieldset>
        ${wyroby.length ? `<label>Wyrób<select name="wyrob"><option value="">—</option>${wyroby.map(w => `<option value="${esc(w.kod)}">${esc(w.kod)} ${esc(w.nazwa)}</option>`).join('')}</select></label>` : ''}
        <div class="liczby-proby">
          <label>Sprawdzone<input name="sprawdzone" type="number" inputmode="numeric" min="1" step="1"></label>
          <label>Braki<input name="braki" type="number" inputmode="numeric" min="0" step="1"></label>
          <label>Zgodne<input name="zgodne" type="number" inputmode="numeric" min="0" step="1"></label>
        </div>
        <fieldset><legend>Wady <span class="slaby suma-wad"></span></legend>
          <div class="wady">${wady.map(w => `<div class="wada" data-kod="${esc(w.kod)}"><span>${esc(w.nazwa)}</span>
            <button type="button" data-d="-1" aria-label="Mniej">−</button><b class="ile">0</b><button type="button" data-d="1" aria-label="Więcej">+</button></div>`).join('')
            || '<p class="slaby">Katalog wad jest pusty.</p>'}</div>
        </fieldset>
        <div class="pole-zdjec"></div>
        <label>Wnioski<textarea name="wnioski" rows="2" maxlength="2000"></textarea></label>
        <label>Działania korygujące<textarea name="dzialania" rows="2" maxlength="2000"></textarea></label>
        ${d.qr ? `<p class="slaby">Kod obecności: ${esc(d.qr)}</p>` : ''}
        <ul class="bledy" hidden></ul>
        <button type="submit" class="glowny szeroki duzy">Zapisz próbę</button>
      </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
        f.powiaz(form);
        L.poleZdjec(form.querySelector('.pole-zlecenia'), d.zdjecieZlecenia, () => f.zmieniono(), { maks: 1, etykieta: 'Zdjęcie przewodnika' });
        L.poleZdjec(form.querySelector('.pole-zdjec'), d.zdjecia, () => f.zmieniono(), { etykieta: 'Zdjęcie wadliwego detalu' });
        const auto = () => {
          const s = liczba(d.sprawdzone), b = liczba(d.braki);
          if (d.zgodneAuto && Number.isInteger(s) && Number.isInteger(b) && s >= b) { d.zgodne = String(s - b); form.zgodne.value = d.zgodne; f.zmieniono(); }
        };
        form.sprawdzone.addEventListener('input', auto);
        form.braki.addEventListener('input', () => { auto(); rysujWady(); });
        form.zgodne.addEventListener('input', () => { d.zgodneAuto = form.zgodne.value === ''; f.zmieniono(); });
        function rysujWady() {
          let suma = 0;
          for (const w of form.querySelectorAll('.wada')) {
            const n = d.wady[w.dataset.kod] || 0;
            suma += n;
            w.querySelector('.ile').textContent = n;
            w.classList.toggle('jest', n > 0);
          }
          const b = liczba(d.braki);
          form.querySelector('.suma-wad').textContent = suma ? `${suma}${Number.isInteger(b) ? ` z ${b} braków` : ''}` : '';
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
          const t = await HalaSkaner.skanuj({ tytul: b.dataset.skan === 'numer' ? 'Zeskanuj numer zlecenia' : 'Zeskanuj stanowisko' });
          if (!t) return;
          if (b.dataset.skan === 'numer') { d.numer = t; form.numer.value = t; f.zmieniono(); return; }
          const kod = Hala.odczytajKod(t, hala.slowniki);
          const st = kod.rodzaj === 'stanowiska' ? kod.kod : kod.rodzaj === 'maszyny' && kod.wpis ? kod.wpis.stanowisko : null;
          const ok = W.kodDlaLinii(kod, linia);
          if (!st || !ok.ok) { L.komunikat(ok.ok ? 'Ten kod nie wskazuje stanowiska. Wybierz je z listy.' : ok.powod, 'blad'); return; }
          d.stanowisko = st; d.qr = t; form.stanowisko.value = st; f.zmieniono();
        }));
        form.addEventListener('submit', async ev => {
          ev.preventDefault();
          const lista = Object.entries(d.wady).filter(([, n]) => n > 0).map(([kod, ilosc]) => ({ kod, ilosc }));
          const dane = { sprawdzone: liczba(d.sprawdzone), zgodne: liczba(d.zgodne), braki: liczba(d.braki), wady: lista };
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
          L.poZapisie(`Próba zapisana: ${dane.braki}/${dane.sprawdzone} braków`);
        });
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
        form.addEventListener('submit', async ev => {
          ev.preventDefault();
          const p = liczba(d.planowana), ob = liczba(d.obecna);
          const bledy = [];
          if (!Number.isInteger(p) || p < 0) bledy.push('Wpisz planowaną liczbę osób.');
          if (!Number.isInteger(ob) || ob < 0) bledy.push('Wpisz, ile osób jest obecnych.');
          if (!pokazBledy(form, bledy)) return;
          const kk = ctx(o);
          const zd = await L.zapisz('obsada.zgloszona', kk.klucz, L.bezPustych({
            linia: kk.linia, zmiana: kk.zmiana.id, planowana: p, obecna: ob,
            nieobecni: String(d.nieobecni || '').split('\n').map(s => s.trim()).filter(Boolean), uwagi: (d.uwagi || '').trim() }));
          if (!zd) return;
          await L.odhaczTyp('obsada', o.pozycja, { qr: o.qr }, ctx(o));
          await f.usun();
          L.zamknijOkno();
          L.poZapisie(`Obsada: ${ob} z ${p}`);
        });
      },
    });
  }
  L.formularzObsady = formularzObsady;
  L.oknaPoStarcie.obsada = formularzObsady;

  async function formularzZdarzeniaObsady(opcje) {
    const o = opcje || {};
    const k = ustalKontekst(o);
    if (brakZmiany(k)) return;
    const f = await L.formularz('obsada-zd:' + k.linia, { rodzaj: '', pracownik: '', na_linie: '', opis: '' });
    const d = f.dane;
    const rodzaje = stale().rodzaje_zdarzen_obsady || [];
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
        form.addEventListener('submit', async ev => {
          ev.preventDefault();
          if (!pokazBledy(form, d.rodzaj ? [] : ['Wybierz, co się stało.'])) return;
          const kk = ctx(o);
          const zd = await L.zapisz('obsada.zdarzenie', kk.klucz, L.bezPustych({
            linia: kk.linia, zmiana: kk.zmiana.id, rodzaj: d.rodzaj, pracownik: (d.pracownik || '').trim(),
            na_linie: d.rodzaj === 'przesuniecie' ? d.na_linie : '', opis: (d.opis || '').trim() }));
          if (!zd) return;
          await f.usun();
          L.zamknijOkno();
          L.poZapisie('Zdarzenie obsady zapisane');
        });
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
    const stanowiska = W.stanowiskaLinii(hala.slowniki, k.linia);
    const f = await L.formularz('audyt:' + k.klucz, { oceny: {}, uwagi: '' });
    const d = f.dane;
    L.okno({
      tytul: 'Audyt BHP stanowisk', klucz: 'audyt', parametry: o,
      html: `<form class="formularz" novalidate>
        <ul class="audyt">${stanowiska.map(s => `<li data-st="${esc(s.kod)}">
          <div class="nazwa-st">${esc(s.nazwa)} <span class="slaby">${esc(s.kod)}</span></div>
          <div class="przelacznik"><button type="button" data-z="1">Zgodne</button><button type="button" data-z="0">Niezgodne</button></div>
          <input class="uwagi-st" placeholder="Co jest nie tak?" maxlength="500" hidden></li>`).join('')
          || '<li class="slaby">Linia nie ma stanowisk w słowniku — wpisz uwagi ogólne.</li>'}</ul>
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
        form.addEventListener('submit', async ev => {
          ev.preventDefault();
          const brak = stanowiska.filter(s => typeof (d.oceny[s.kod] || {}).zgodne !== 'boolean');
          if (!pokazBledy(form, brak.length ? [`Oceń wszystkie stanowiska (brakuje: ${brak.map(s => s.kod).join(', ')}).`] : [])) return;
          const pozycje = stanowiska.map(s => L.bezPustych({ stanowisko: s.kod, zgodne: d.oceny[s.kod].zgodne, uwagi: (d.oceny[s.kod].uwagi || '').trim() }));
          const kk = ctx(o);
          const zd = await L.zapisz('bhp.audyt', kk.klucz, L.bezPustych({ linia: kk.linia, zmiana: kk.zmiana.id, pozycje, uwagi: (d.uwagi || '').trim() }));
          if (!zd) return;
          await L.odhaczTyp('bhp', o.pozycja, { qr: o.qr }, ctx(o));
          await f.usun();
          const niezgodne = pozycje.filter(p => p.zgodne === false);
          L.zamknijOkno();
          L.poZapisie(niezgodne.length ? `Audyt zapisany — niezgodne: ${niezgodne.length}` : 'Audyt zapisany — wszystko zgodne');
          if (niezgodne.length) {
            // Odstępstwo z audytu od razu jako zgłoszenie BHP (z numerem BHP-…), żeby ktoś je zamknął.
            formularzBhp({ linia: kk.linia, stanowisko: niezgodne[0].stanowisko, rodzaj: 'odstepstwo', opis: niezgodne.map(p => `${p.stanowisko}: ${p.uwagi || 'niezgodne'}`).join('\n') });
          }
        });
      },
    });
  }
  L.formularzAudytuBhp = formularzAudytuBhp;
  L.oknaPoStarcie.audyt = formularzAudytuBhp;

  async function formularzBhp(opcje) {
    const o = opcje || {};
    const linia = ustalKontekst(o).linia;
    const f = await L.formularz('bhp:' + linia, { rodzaj: o.rodzaj || '', stanowisko: o.stanowisko || '', opis: o.opis || '', zdjecia: [] });
    const d = f.dane;
    const rodzaje = stale().rodzaje_bhp || [];
    L.okno({
      tytul: 'Zgłoszenie BHP', klucz: 'bhp', parametry: o,
      html: `<form class="formularz" novalidate>
        <div class="siatka-wyboru" data-grupa="rodzaj">${rodzaje.map(r => `<button type="button" data-wartosc="${esc(r.kod)}">${esc(r.nazwa)}</button>`).join('')}</div>
        <label>Stanowisko<select name="stanowisko">${opcjeStanowisk(linia, d.stanowisko)}</select></label>
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
        form.addEventListener('submit', async ev => {
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
        });
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
        <p class="slaby">${esc(W.opisZmiany(k.zmiana.id, hala.slowniki))} · ${esc(k.linia)}${bylo ? ' · już wysłane — możesz poprawić' : ''}</p>
        <label>Stan maszyn<textarea name="maszyny" rows="3" maxlength="4000"></textarea></label>
        <label>Braki materiałowe<textarea name="braki_materialowe" rows="2" maxlength="4000"></textarea></label>
        <label>Do dokończenia<textarea name="do_dokonczenia" rows="2" maxlength="4000"></textarea></label>
        <label>Inne<textarea name="inne" rows="2" maxlength="4000"></textarea></label>
        <button type="submit" class="glowny szeroki duzy">Wyślij przekazanie</button>
      </form>`,
      poOtwarciu: el => {
        const form = el.querySelector('form');
        f.powiaz(form);
        form.addEventListener('submit', async ev => {
          ev.preventDefault();
          const zd = await L.zapisz('zmiana.przekazanie', k.klucz, Object.assign({ linia: k.linia, zmiana: k.zmiana.id },
            L.bezPustych({ maszyny: d.maszyny.trim(), braki_materialowe: d.braki_materialowe.trim(), do_dokonczenia: d.do_dokonczenia.trim(), inne: d.inne.trim() })));
          if (!zd) return;
          await L.odhaczTyp('przekazanie', o.pozycja, { qr: o.qr }, ctx(o));
          await f.usun();
          L.zamknijOkno();
          L.poZapisie('Przekazanie wysłane');
        });
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
    return `<dl class="dane raport">
      <dt>Obsada</dt><dd>${r.obsada.obecna ?? '—'} z ${r.obsada.planowana ?? '—'}${r.obsada.zdarzenia ? ` · zdarzeń: ${r.obsada.zdarzenia}` : ''}</dd>
      <dt>Checklista</dt><dd>${r.checklista.zrobione}/${r.checklista.wszystkie}${r.checklista.opoznione.length ? ` · <span class="tekst-alarm">po terminie: ${n(r.checklista.opoznione)}</span>` : ''}${r.checklista.pominiete.length ? ` · pominięte: ${n(r.checklista.pominiete)}` : ''}</dd>
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
        form.addEventListener('submit', async ev => {
          ev.preventDefault();
          const kk = ctx(o);
          const zd = await L.zapisz('zmiana.raport', kk.klucz, { linia: kk.linia, zmiana: kk.zmiana.id, podsumowanie: zbudujRaport(kk, f.dane.uwagi) });
          if (!zd) return;
          await f.usun();
          L.zamknijOkno();
          L.poZapisie('Raport wysłany do kierownika');
        });
      },
    });
  }
  L.oknoRaportu = oknoRaportu;
  L.oknaPoStarcie.raport = oknoRaportu;

  // ------------------------------------------------------------ ekran „Koniec”

  function kartaKonca(k, tytul) {
    const d = (k.zl && k.zl.dane) || {};
    const r = zbudujRaport(k, '');
    const zmianaId = k.zmiana.id === (hala.zmianaTeraz() || {}).id ? '' : k.zmiana.id;
    return `<article class="karta koniec">
      <h2>${esc(tytul)}</h2>
      <p class="slaby">${esc(W.opisZmiany(k.zmiana.id, hala.slowniki))} · ${esc(W.nazwaLinii(hala.slowniki, k.linia))}</p>
      <ul class="lista">
        <li class="wiersz"><span class="tresc">Checklista</span><span class="znacznik ${r.checklista.zrobione === r.checklista.wszystkie && r.checklista.wszystkie ? 'ok' : 'uwaga'}">${r.checklista.zrobione}/${r.checklista.wszystkie}</span></li>
        <li class="wiersz"><span class="tresc">Awarie</span><span class="znacznik ${r.awarie.length ? 'alarm' : 'ok'}">${r.awarie.length}</span></li>
        <li class="wiersz"><span class="tresc">Próby</span><span class="znacznik neutral">${r.proby.liczba}</span></li>
        <li class="wiersz"><span class="tresc">Przekazanie</span>${d.przekazanie ? `<span class="znacznik ok">wysłane ${esc(W.godzina(d.czas_przekazania))}</span>` : '<span class="znacznik uwaga">brak</span>'}</li>
        <li class="wiersz"><span class="tresc">Raport</span>${k.zl && k.zl.status === 'zamknieta' ? `<span class="znacznik ok">wysłany ${esc(W.godzina(d.czas_zamkniecia))}</span>` : '<span class="znacznik uwaga">niewysłany</span>'}</li>
      </ul>
      <div class="przyciski-kolumna">
        <button type="button" data-a="przekazanie" data-zmiana="${esc(zmianaId)}">Przekazanie zmiany</button>
        <button type="button" class="glowny" data-a="raport" data-zmiana="${esc(zmianaId)}">Raport końcowy</button>
      </div>
    </article>`;
  }

  L.ekrany.koniec = {
    rysuj(el) {
      const k = L.kontekst();
      if (!k.zmiana) { el.innerHTML = '<p class="pusto">Poza godzinami zmian.</p>'; return; }
      // Raport po końcu zmiany: lider, który otworzył poprzednią zmianę i nie zamknął jej raportem, widzi ją tu.
      const prev = W.poprzedniaZmiana(k.zmiana, hala.slowniki.zmiany);
      const kp = prev ? L.kontekst(prev) : null;
      const ja = hala.pracownik && hala.pracownik.id;
      const zalegla = kp && kp.zl && kp.zl.status === 'otwarta' && ((kp.zl.dane || {}).pozycje || []).length && kp.zl.dane.lider === ja;
      el.innerHTML = (zalegla ? kartaKonca(kp, 'Poprzednia zmiana bez raportu') : '') + kartaKonca(k, 'Ta zmiana');
    },
  };
  L.$('ekran-koniec').addEventListener('click', ev => {
    const b = ev.target.closest('[data-a]');
    if (!b) return;
    const o = { zmianaId: b.dataset.zmiana || undefined };
    if (b.dataset.a === 'przekazanie') formularzPrzekazania(o); else oknoRaportu(o);
  });
})();
