/* GK Panel Kierownika — „Mój zespół” (D49, właściciel 2026-10-08: „Pozwól adminom GK Trasy, Lidera, UR itp. tworzyć konta
   dla swoich pracowników”). Kierownik zakładu, mistrz, kierownik UR i kierownik KJ zakładają i zmieniają konta SWOICH ludzi:
   mistrz — liderów (i ich linie, gdy sam ma linie), kierownik UR — mechaników, kierownik KJ — kontrolerów, kierownik
   zakładu — mistrzów, kierowników UR/KJ, liderów, mechaników, kontrolerów i Marketing. Kto kogo — jedna reguła w hubie
   (hala.py → ZESPOLY, blad_uprawnienia_konta; kopia w kontrakcie stale.zespoly); hub przy każdym zapisie sprawdza sam
   i odpowiada 403 z tekstem po polsku. Tu tylko rysujemy to, na co hub pozwoli (GET /api/v1/admin/pracownicy → zakres).

   Dwa miejsca:
     - Panel → Administracja → Pracownicy (administracja.js) — pełny ekran administratora; zarządzający widzi tam tylko swój
       zespół (te same czyste funkcje: zarzadzaKontami, uprawnieniaOsoby, opisZespolu);
     - GK Lider → Moje konto → „Mój zespół” (mistrz nie otwiera Panelu): okno z listą i formularzem osoby —
       HalaZespol.otworz(hala, { komunikat }).
   Zarządzający nie wpisuje nikomu hasła, PIN-u ani karty („nikt nie zna niczyjego PIN-u”, D46) — tylko „Ustaw hasło
   startowe” (haslo123), „Resetuj PIN” (1234), „Wyloguj wszędzie”, „Odblokuj”. Usuwa osobę administrator; tu — wyłączenie.
   Okna to <dialog class="hala-okno"> w warstwie górnej (hala.css) — jak „Moje konto” (konto.js). Bez sieci zmian nie ma
   (hub musi sprawdzić zakres) — mówimy to wprost. */

(function (global) {
  'use strict';

  const HASLO_STARTOWE = 'haslo123';
  const PIN_STARTOWY = '1234';

  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* „Krzysztof  Hamrol” → „krzysztof hamrol” — tak jak hub porównuje login (hala.py → login_z_nazwy). */
  function loginZNazwy(t) {
    const PL = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
    return String(t || '').toLowerCase().replace(/[ąćęłńóśźż]/g, z => PL[z]).normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');
  }

  // ---------------------------------------------------------------- czyste funkcje (testy: reduktor-testy.js)

  /* Czy ktoś z tymi rolami prowadzi zespół (kontrakt stale.zespoly: kierownik, mistrz, kierownik UR/KJ, administratorzy
     programów GK). Rola admin tu się nie liczy — ma pełną Administrację w Panelu. */
  function rolaZespolu(role, stale) {
    const zespoly = (stale && stale.zespoly) || {};
    return [].concat(role || []).some(r => r !== '_opis' && Array.isArray(zespoly[r]) && zespoly[r].length > 0);
  }

  /* Panel: kto ma „Administracja” — administrator (całość) albo zarządzający zespołem (tylko „Pracownicy”). */
  function zarzadzaKontami(role, stale) {
    return [].concat(role || []).includes('admin') || rolaZespolu(role, stale);
  }

  /* Co okno osoby pokazuje — według zakresu z huba (GET /admin/pracownicy → zakres; null = administrator). Rola admin:
     wszystko jak dotąd. Zarządzający: bez pól sekretów (hasło startowe do wpisania, PIN, karta), bez „Usuń osobę”, z resetami
     i „Wyloguj wszędzie”. Własne konto: bez „Resetuj PIN” (swój PIN — Moje konto; reset wylogowałby od razu). */
  function uprawnieniaOsoby(zakres, osoba, jaId) {
    const admin = !zakres || zakres.admin !== false;
    const ja = !!(osoba && jaId && osoba.id === jaId);
    const ekran = !!(osoba && osoba.ekran);
    return {
      admin,
      chipy: admin,                    // Linie, Etykiety, Ustawienia, Połączenia GK, Dostęp — tylko administrator
      haslo: admin,                    // pole „Hasło startowe (nieobowiązkowe)” przy nowej osobie
      karta: admin,
      pin: admin,                      // pole PIN ma tylko konto ekranu — zarządzający ekranu nie zakłada
      usun: admin && !!osoba && !ja,
      resetHasla: !!osoba && !ekran && (admin || !ja),
      resetPinu: !!osoba && !ekran && !ja,
      wyloguj: !!osoba && (admin || !ja),
      linie: admin || !zakres.linie ? null : zakres.linie.slice(),
      role: admin ? null : (zakres.role || []).slice(),
    };
  }

  /* Jedno zdanie nad listą zarządzającego — kogo widzi i co może. Ten sam tekst w Panelu i w GK Lider. */
  function opisZespolu(zakres, stale, slowniki) {
    if (!zakres || zakres.admin !== false) return '';
    const nazwy = (stale && stale.role) || {};
    const role = (zakres.role || []).map(r => nazwy[r] || r);
    if (!role.length) return 'Nie zarządzasz kontami — poproś administratora.';
    const linie = (zakres.linie || []).map(l => ((((slowniki || {}).linie || {})[l]) || {}).nazwa || l);
    return `Twój zespół: ${role.join(', ')}${linie.length ? ` — linie ${linie.join(', ')}` : ''}. Nowa osoba dostaje hasło `
      + `startowe ${HASLO_STARTOWE} i przy pierwszym logowaniu ustawia własne hasło i PIN. Usuwa administrator — Ty możesz wyłączyć konto.`;
  }

  /* Stan hasła i PIN-u osoby (wiersz GET /admin/pracownicy) — znacznik na liście i zdanie w oknie. Jak Panel (widok.js →
     stanHasla), bez konta ekranu (zarządzający go nie widzi). */
  function stanHasla(p) {
    if (!p) return { znacznik: '', opis: '' };
    if (p.haslo_do_zmiany) return { znacznik: 'hasło startowe',
      opis: 'Hasło startowe — przy pierwszym logowaniu osoba ustawi własne hasło' + (p.ma_pin ? ' (PIN już jest).' : ' i PIN.') };
    if (!p.ma_pin) return { znacznik: 'bez PIN-u', opis: 'Hasło ustawione, PIN-u jeszcze nie ma — osoba ustawi go przy logowaniu.' };
    if (p.pin_do_zmiany) return { znacznik: 'PIN startowy',
      opis: `PIN zresetowany (startowy ${PIN_STARTOWY}) — przy następnym logowaniu osoba ustawi nowy.` };
    return { znacznik: '', opis: 'Hasło i PIN ustawione.' };
  }

  /* Lista zespołu do okna: aktywni przed wyłączonymi, zablokowani na górze, alfabetycznie; role i linie nazwami. */
  function listaZespolu(lista, stale, slowniki) {
    const nazwy = (stale && stale.role) || {};
    const linie = (slowniki && slowniki.linie) || {};
    return (lista || []).map(p => Object.assign({}, p, {
      roleNazwy: (p.role || []).map(r => nazwy[r] || r),
      linieNazwy: (p.linie || []).map(l => (linie[l] || {}).nazwa || l),
      stan: stanHasla(p),
    })).sort((a, b) => (!!b.zablokowany - !!a.zablokowany) || ((b.aktywny !== false) - (a.aktywny !== false))
      || String(a.nazwa).localeCompare(String(b.nazwa), 'pl'));
  }

  /* Formularz osoby zarządzającego → dane dla POST /api/v1/admin/pracownik albo błędy po polsku. Bez sekretów i karty;
     role tylko z zakresu, linie tylko dozwolone (mistrz z liniami). Linie osoby spoza dozwolonych zostają (hub i tak nie
     pokaże zarządzającemu osoby z cudzą linią). istniejacy = null przy nowej osobie (id nada hub — „p-…”). */
  function osobaZFormularza(f, istniejacy, wszyscy, zakres) {
    const bledy = [];
    const nazwa = String(f.nazwa || '').trim().replace(/\s+/g, ' ');
    if (nazwa.split(' ').length < 2) bledy.push('Podaj imię i nazwisko — to jest login.');
    const inni = (wszyscy || []).filter(p => !istniejacy || p.id !== istniejacy.id);
    const loginy = p => [p.nazwa].concat(p.loginy || []).map(loginZNazwy);
    if (nazwa && inni.some(p => p.aktywny !== false && loginy(p).includes(loginZNazwy(nazwa))))
      bledy.push(`Osoba „${nazwa}” już jest. Imię i nazwisko to login — dopisz coś, np. „${nazwa} 2”.`);
    const dozwolone = (zakres && zakres.role) || [];
    const role = [].concat(f.role || []).filter(Boolean);
    if (!role.length) bledy.push('Zaznacz rolę.');
    else if (role.some(r => !dozwolone.includes(r))) bledy.push('Tej roli nie nadajesz — poproś administratora.');
    const dozwoloneLinie = zakres && zakres.linie;
    const linie = [].concat(f.linie || []).filter(Boolean);
    if (dozwoloneLinie && linie.some(l => !dozwoloneLinie.includes(l))) bledy.push('Możesz przypisać tylko swoje linie.');
    const telefon = String(f.telefon || '').trim();
    if (!/^[0-9+()\- ]{0,30}$/.test(telefon)) bledy.push('Telefon: cyfry, spacje, + i myślnik, np. 600 100 200.');
    const dane = { nazwa, role, linie, aktywny: f.aktywny !== false, telefon };
    if (istniejacy) dane.id = istniejacy.id;
    return { bledy, dane };
  }

  // ---------------------------------------------------------------- okna (GK Lider → Moje konto → Mój zespół)

  function okno(id, klasa) {
    let o = document.getElementById(id);
    if (o) return o;
    o = document.createElement('dialog');
    o.id = id;
    o.className = 'hala-okno ' + (klasa || '');
    o.setAttribute('aria-labelledby', id + '-tytul');
    document.body.appendChild(o);
    return o;
  }

  const bezSieci = e => !e || e instanceof TypeError || !e.kod;
  const tekstBledu = e => (bezSieci(e) ? 'Zmiany w zespole wymagają połączenia z hubem. Sprawdź sieć i spróbuj jeszcze raz.'
    : (e && e.message) || 'Nie udało się — spróbuj jeszcze raz.');

  /* Potwierdzenie w warstwie górnej (okno aplikacji pod spodem by go przykryło). Obietnica: true = tak. */
  function potwierdz(tytul, tresc, przycisk) {
    const d = okno('hala-okno-zespol-pyt');
    d.innerHTML = `<form method="dialog"><h2 id="hala-okno-zespol-pyt-tytul">${esc(tytul)}</h2>
        <p class="hala-okno-opis">${esc(tresc)}</p>
        <div class="hala-okno-przyciski"><button type="button" data-nie>Anuluj</button><button class="glowny" type="submit">${esc(przycisk)}</button></div></form>`;
    return new Promise(ok => {
      let tak = false;
      d.querySelector('[data-nie]').addEventListener('click', () => d.close());
      d.querySelector('form').addEventListener('submit', ev => { ev.preventDefault(); tak = true; d.close(); });
      d.addEventListener('close', () => ok(tak), { once: true });
      d.showModal();
    });
  }

  async function otworz(hala, opcje) {
    const o = Object.assign({ komunikat: null }, opcje || {});
    // Wynik też w samym oknie: komunikat aplikacji (GK Lider) leży pod oknem modalnym i nie byłoby go widać.
    let info = '';
    const powiedz = (t, r) => { info = t; if (o.komunikat) o.komunikat(t, r); };
    const stale = (hala.kontrakt && hala.kontrakt.stale) || {};
    const d = okno('hala-okno-zespolu', 'hala-zespol');
    let lista = null, zakres = null, blad = '';

    async function wczytaj() {
      try {
        const r = await hala.admin('GET', '/api/v1/admin/pracownicy');
        lista = r.pracownicy || []; zakres = r.zakres || null; blad = '';
      } catch (e) { blad = tekstBledu(e); }
      rysuj();
    }

    function rysuj() {
      const wiersze = lista ? listaZespolu(lista, stale, hala.slowniki) : [];
      d.innerHTML = `<form method="dialog">
          <h2 id="hala-okno-zespolu-tytul">Mój zespół</h2>
          <p class="hala-okno-opis">${esc(zakres ? opisZespolu(zakres, stale, hala.slowniki) : blad || 'Wczytuję…')}</p>
          ${lista ? `<div class="hala-zespol-lista">${wiersze.map(p => `
            <div class="hala-zespol-osoba${p.aktywny === false ? ' wylaczona' : ''}" data-id="${esc(p.id)}">
              <span class="hala-zespol-kto"><b>${esc(p.nazwa)}</b>
                <span>${esc([...p.roleNazwy, ...p.linieNazwy].join(' · '))}</span>
                ${p.aktywny === false ? '<span class="hala-zespol-stan">Wyłączone</span>'
                  : p.zablokowany ? '<span class="hala-zespol-stan alarm">Zablokowane po złych PIN-ach</span>'
                  : p.stan.znacznik ? `<span class="hala-zespol-stan">${esc(p.stan.znacznik)}</span>` : ''}</span>
              <span class="hala-zespol-akcje">${p.zablokowany ? '<button type="button" data-a="odblokuj">Odblokuj</button>' : ''}
                <button type="button" data-a="zmien">Zmień</button></span>
            </div>`).join('') || '<p class="hala-konto-drobne">Nie masz jeszcze nikogo w zespole.</p>'}</div>` : ''}
          ${blad && lista ? `<p class="hala-okno-blad" role="alert">${esc(blad)}</p>` : ''}
          ${info ? `<p class="hala-zespol-info" role="status">${esc(info)}</p>` : ''}
          <div class="hala-okno-przyciski"><button type="button" data-zamknij>Zamknij</button>
            ${zakres && (zakres.role || []).length ? '<button type="button" class="glowny" data-a="dodaj">+ Dodaj osobę</button>' : ''}</div>
        </form>`;
    }

    d.onclick = async ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-zamknij')) { d.close(); return; }
      const id = (b.closest('[data-id]') || {}).dataset?.id;
      const osoba = id && (lista || []).find(p => p.id === id);
      if (b.dataset.a === 'dodaj') osobaOkno(null);
      if (b.dataset.a === 'zmien' && osoba) osobaOkno(osoba);
      if (b.dataset.a === 'odblokuj' && osoba) {
        try { await hala.admin('POST', '/api/v1/admin/odblokuj', { pracownik: osoba.id }); powiedz(`${osoba.nazwa}: odblokowane.`, 'ok'); }
        catch (e) { blad = tekstBledu(e); }
        await wczytaj();
      }
    };

    /* Okno osoby: imię i nazwisko, rola (pola wyboru z zakresu; jedna rola — sam napis), linie, telefon, aktywne; przy
       istniejącej — „Hasło i dostęp” z resetami (od razu w hubie, bez „Zapisz”). */
    function osobaOkno(osoba) {
      const u = uprawnieniaOsoby(zakres || { admin: false, role: [] }, osoba, hala.pracownik && hala.pracownik.id);
      const f2 = okno('hala-okno-osoby-zespolu', 'hala-zespol-osoba-okno');
      const role = u.role || [];
      const nazwyRol = stale.role || {};
      const linie = Object.entries((hala.slowniki && hala.slowniki.linie) || {})
        .filter(([kod]) => !u.linie || u.linie.includes(kod))
        .sort(([, a], [, b]) => ((a || {}).kolejnosc || 999) - ((b || {}).kolejnosc || 999));
      const ma = (pole, w) => !!(osoba && (osoba[pole] || []).includes(w));
      const jednaRola = role.length === 1;
      f2.innerHTML = `<form method="dialog" autocomplete="off">
          <h2 id="hala-okno-osoby-zespolu-tytul">${esc(osoba ? osoba.nazwa : 'Nowa osoba')}</h2>
          <label>Imię i nazwisko (to jest login)<input name="nazwa" maxlength="120" placeholder="np. Jan Kowalski" value="${esc(osoba ? osoba.nazwa : '')}"></label>
          ${jednaRola ? `<input type="hidden" name="role" value="${esc(role[0])}"><p class="hala-konto-drobne">Rola: ${esc(nazwyRol[role[0]] || role[0])}</p>`
            : `<fieldset><legend>Rola</legend><div class="hala-zespol-wybor">${role.map(r =>
              `<label class="hala-zespol-zaznacz"><input type="checkbox" name="role" value="${esc(r)}" ${ma('role', r) ? 'checked' : ''}> ${esc(nazwyRol[r] || r)}</label>`).join('')}</div></fieldset>`}
          ${linie.length ? `<fieldset><legend>Linie</legend><div class="hala-zespol-wybor">${linie.map(([kod, l]) =>
            `<label class="hala-zespol-zaznacz"><input type="checkbox" name="linie" value="${esc(kod)}" ${ma('linie', kod) ? 'checked' : ''}> ${esc((l && l.nazwa) || kod)}</label>`).join('')}</div></fieldset>` : ''}
          <label>Telefon (nieobowiązkowy)<input name="telefon" type="tel" maxlength="30" placeholder="np. 600 100 200" value="${esc((osoba && osoba.telefon) || '')}"></label>
          <label class="hala-zespol-zaznacz"><input type="checkbox" name="aktywny" ${!osoba || osoba.aktywny !== false ? 'checked' : ''}> Konto aktywne (odznacz, gdy osoba odchodzi)</label>
          ${osoba ? `<fieldset><legend>Hasło i dostęp</legend>
              <p class="hala-konto-drobne">${esc(stanHasla(osoba).opis)}</p>
              <div class="hala-zespol-wybor">
                ${u.resetHasla ? '<button type="button" data-a="haslo">Ustaw hasło startowe</button>' : ''}
                ${u.resetPinu ? '<button type="button" data-a="pin">Resetuj PIN</button>' : ''}
                ${u.wyloguj ? '<button type="button" data-a="wyloguj">Wyloguj wszędzie</button>' : ''}
              </div></fieldset>`
            : `<p class="hala-konto-drobne">Hasło startowe: ${HASLO_STARTOWE}. Przy pierwszym logowaniu osoba ustawi własne hasło (raz na 12 godzin na urządzeniu) i PIN.</p>`}
          <p class="hala-okno-blad" role="alert" hidden></p>
          <div class="hala-okno-przyciski"><button type="button" data-anuluj>Anuluj</button><button class="glowny" type="submit">Zapisz</button></div>
        </form>`;
      const f = f2.querySelector('form');
      const pole = f2.querySelector('.hala-okno-blad');
      const pokaz = t => { pole.textContent = t; pole.hidden = !t; };
      const wybrane = n => [...f.querySelectorAll(`input[name="${n}"]`)].filter(x => x.type === 'hidden' || x.checked).map(x => x.value);
      const dane = (extra) => osobaZFormularza(Object.assign({ nazwa: f.nazwa.value, role: wybrane('role'), linie: wybrane('linie'),
        telefon: f.telefon.value, aktywny: f.aktywny.checked }, extra || {}), osoba, lista, zakres);
      const poZmianie = async (tekst) => { f2.close(); powiedz(tekst, 'ok'); await wczytaj(); };
      f2.querySelector('[data-anuluj]').addEventListener('click', () => f2.close());
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const w = dane();
        if (w.bledy.length) { pokaz(w.bledy.join(' ')); return; }
        try {
          await hala.admin('POST', '/api/v1/admin/pracownik', w.dane);
          await poZmianie(osoba ? `${w.dane.nazwa}: zapisane.` : `${w.dane.nazwa}: konto założone — hasło startowe ${HASLO_STARTOWE}.`);
        } catch (e) { pokaz(tekstBledu(e)); }
      });
      f.addEventListener('click', async ev => {
        const b = ev.target.closest('button[data-a]');
        if (!b || !osoba) return;
        try {
          if (b.dataset.a === 'haslo' && await potwierdz('Ustawić hasło startowe?', `${osoba.nazwa} dostanie hasło „${HASLO_STARTOWE}”, `
              + 'PIN zostanie skasowany, a wszystkie urządzenia wylogowane. Przy następnym logowaniu osoba ustawi nowe hasło i PIN.', 'Ustaw')) {
            // Zapis jak w Panelu: obecne dane osoby + „haslo_startowe” — hub nie przyjmie od zarządzającego wpisanego hasła.
            await hala.admin('POST', '/api/v1/admin/pracownik', { id: osoba.id, nazwa: osoba.nazwa, role: osoba.role, linie: osoba.linie,
                                                                  telefon: osoba.telefon || '', aktywny: osoba.aktywny !== false, haslo_startowe: true });
            await poZmianie(`${osoba.nazwa}: hasło startowe „${HASLO_STARTOWE}” — przy logowaniu ustawi nowe hasło i PIN.`);
          }
          if (b.dataset.a === 'pin' && await potwierdz('Zresetować PIN?', `${osoba.nazwa} dostanie PIN startowy ${PIN_STARTOWY} — `
              + 'przy pierwszym logowaniu ustawi nowy.', 'Resetuj PIN')) {
            await hala.admin('POST', '/api/v1/admin/resetuj-pin', { pracownik: osoba.id });
            await poZmianie(`${osoba.nazwa}: PIN startowy ${PIN_STARTOWY} — przy logowaniu ustawi nowy.`);
          }
          if (b.dataset.a === 'wyloguj' && await potwierdz('Wylogować wszędzie?', `${osoba.nazwa} zostanie wylogowana we wszystkich `
              + 'aplikacjach i na wszystkich urządzeniach. Następne logowanie — hasłem.', 'Wyloguj wszędzie')) {
            await hala.admin('POST', '/api/v1/admin/wyloguj-wszedzie', { pracownik: osoba.id });
            f2.close();
            powiedz(`${osoba.nazwa}: wylogowana wszędzie.`, 'ok');
            rysuj();
          }
        } catch (e) { pokaz(tekstBledu(e)); }
      });
      f2.showModal();
      f.nazwa.focus();
    }

    rysuj();
    if (!d.open) d.showModal();
    await wczytaj();
    return d;
  }

  const api = { rolaZespolu, zarzadzaKontami, uprawnieniaOsoby, opisZespolu, stanHasla, listaZespolu, osobaZFormularza, loginZNazwy, otworz };
  global.HalaZespol = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
